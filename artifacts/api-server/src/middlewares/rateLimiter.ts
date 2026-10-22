import { Request, Response, NextFunction } from "express";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

/**
 * Rate limiting configuration for different endpoint types
 * Following Flipkart-scale patterns: tiered limits based on sensitivity
 */

// Redis client for distributed rate limiting (falls back to memory if Redis unavailable)
let redisClient: ReturnType<typeof createClient> | null = null;
let redisStore: RedisStore | null = null;

async function initializeRedis(): Promise<RedisStore | null> {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (err) => logger.warn({ err }, "Redis connection error"));
    await redisClient.connect();
    redisStore = new RedisStore({
      sendCommand: (...args: string[]) => redisClient!.sendCommand(args),
    });
    logger.info("Redis connected for distributed rate limiting");
    return redisStore;
  } catch (error) {
    logger.warn({ err: error }, "Redis unavailable, falling back to memory store");
    return null;
  }
}

// Initialize Redis on module load (non-blocking)
initializeRedis().catch(() => {});

/**
 * Creates a rate limiter with consistent configuration
 */
function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message, retryAfter: Math.ceil(options.windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use IP + session for more granular limiting
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const sessionId = req.cookies?.starLineSession || "anonymous";
      return `${options.keyPrefix}:${ip}:${sessionId}`;
    },
    handler: (req: Request, res: Response) => {
      logger.warn({
        ip: req.ip,
        path: req.path,
        method: req.method,
        sessionId: req.cookies?.starLineSession?.substring(0, 8),
      }, "Rate limit exceeded");
      res.status(429).json({
        error: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === "/api/healthz";
    },
    store: redisStore || undefined, // Falls back to memory store if Redis unavailable
  });
}

// Tier 1: Strict - Authentication & sensitive operations (5 req/min)
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: "Too many authentication attempts. Please try again later.",
  keyPrefix: "auth",
  skipFailedRequests: true, // Don't count failed attempts (prevents lockout)
});

// Tier 2: Moderate - Checkout, orders, payments (30 req/min)
export const moderateRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Please slow down.",
  keyPrefix: "checkout",
});

// Tier 3: Standard - API writes (create/update/delete) (60 req/min)
export const writeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many write requests. Please try again later.",
  keyPrefix: "write",
});

// Tier 4: Lenient - Reads, browsing (300 req/min)
export const readRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: "Too many requests. Please try again later.",
  keyPrefix: "read",
});

// Tier 5: Search - Search endpoints (60 req/min with burst allowance)
export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many search requests. Please refine your search.",
  keyPrefix: "search",
});

// Tier 6: Global - Catch-all for any unprotected routes (100 req/min)
export const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many requests from this IP. Please try again later.",
  keyPrefix: "global",
});

/**
 * Middleware to apply rate limiting based on route pattern
 */
export function applyRateLimiting(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  const method = req.method;

  // Authentication endpoints - strictest
  if (path.startsWith("/api/auth") || path.includes("/login") || path.includes("/register")) {
    return strictRateLimiter(req, res, next);
  }

  // Checkout & payment - moderate
  if (path.includes("/checkout") || path.includes("/payment") || path.includes("/orders")) {
    return moderateRateLimiter(req, res, next);
  }

  // Write operations - standard write limit
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    return writeRateLimiter(req, res, next);
  }

  // Search endpoints
  if (path.includes("/search") || (method === "GET" && req.query.search)) {
    return searchRateLimiter(req, res, next);
  }

  // Read operations - lenient
  if (method === "GET") {
    return readRateLimiter(req, res, next);
  }

  // Default global limiter
  return globalRateLimiter(req, res, next);
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeRateLimiter(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisStore = null;
  }
}