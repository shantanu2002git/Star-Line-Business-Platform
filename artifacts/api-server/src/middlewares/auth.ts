import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { collections } from "@workspace/db";
import { Types } from "mongoose";
import { ApiError } from "../services/starline";
import { logger } from "../lib/logger";

/**
 * Authentication & Authorization Middleware
 * JWT-based with Role-Based Access Control (RBAC)
 * Following Flipkart-scale patterns: stateless, token rotation, proper claims
 */

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "15m"; // Short-lived access tokens
const REFRESH_TOKEN_EXPIRY = "7d"; // Longer-lived refresh tokens
const TOKEN_ISSUER = "star-line-platform";
const TOKEN_AUDIENCE = "star-line-api";

export interface JWTPayload {
  sub: string; // User ID
  sessionId: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string; // JWT ID for token revocation
}

export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "staff"
  | "customer"
  | "guest";

export type Permission =
  // Product permissions
  | "products:read"
  | "products:write"
  | "products:delete"
  // Order permissions
  | "orders:read"
  | "orders:write"
  | "orders:delete"
  | "orders:manage_status"
  // Customer permissions
  | "customers:read"
  | "customers:write"
  | "customers:delete"
  // Inventory permissions
  | "inventory:read"
  | "inventory:write"
  // Category/Service/Banner permissions
  | "categories:read"
  | "categories:write"
  | "services:read"
  | "services:write"
  | "banners:read"
  | "banners:write"
  // Financial permissions
  | "invoices:read"
  | "invoices:write"
  | "offers:read"
  | "offers:write"
  // Content permissions
  | "content:read"
  | "content:write"
  // Analytics permissions
  | "analytics:read"
  | "dashboard:read"
  // Admin permissions
  | "users:manage"
  | "settings:manage"
  | "audit:read";

// Role to permissions mapping (RBAC)
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    "products:read", "products:write", "products:delete",
    "orders:read", "orders:write", "orders:delete", "orders:manage_status",
    "customers:read", "customers:write", "customers:delete",
    "inventory:read", "inventory:write",
    "categories:read", "categories:write",
    "services:read", "services:write",
    "banners:read", "banners:write",
    "invoices:read", "invoices:write",
    "offers:read", "offers:write",
    "content:read", "content:write",
    "analytics:read", "dashboard:read",
    "users:manage", "settings:manage", "audit:read",
  ],
  admin: [
    "products:read", "products:write", "products:delete",
    "orders:read", "orders:write", "orders:manage_status",
    "customers:read", "customers:write",
    "inventory:read", "inventory:write",
    "categories:read", "categories:write",
    "services:read", "services:write",
    "banners:read", "banners:write",
    "invoices:read", "invoices:write",
    "offers:read", "offers:write",
    "content:read", "content:write",
    "analytics:read", "dashboard:read",
    "audit:read",
  ],
  manager: [
    "products:read", "products:write",
    "orders:read", "orders:write", "orders:manage_status",
    "customers:read", "customers:write",
    "inventory:read", "inventory:write",
    "categories:read", "categories:write",
    "services:read", "services:write",
    "banners:read", "banners:write",
    "invoices:read",
    "offers:read", "offers:write",
    "content:read", "content:write",
    "analytics:read", "dashboard:read",
  ],
  staff: [
    "products:read",
    "orders:read", "orders:write", "orders:manage_status",
    "customers:read",
    "inventory:read", "inventory:write",
    "categories:read",
    "services:read",
    "banners:read",
    "invoices:read",
    "offers:read",
    "content:read",
    "dashboard:read",
  ],
  customer: [
    "products:read",
    "orders:read", // Own orders only (enforced in service layer)
    "customers:read", // Own profile only
  ],
  guest: [
    "products:read",
  ],
};

/**
 * Generate access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, "iat" | "exp" | "iss" | "aud" | "jti">): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { ...payload, jti },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(payload: Omit<JWTPayload, "iat" | "exp" | "iss" | "aud" | "jti">): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { ...payload, jti, type: "refresh" },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }
  );
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }) as JWTPayload & { type: string };

    if (payload.type !== "refresh") return null;
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from request (Authorization header or cookie)
 */
function extractToken(req: Request): string | null {
  // Check Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Fallback to cookie (for browser clients)
  const cookieToken = req.cookies?.starLineAccessToken;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

/**
 * Authentication middleware - validates JWT and attaches user to request
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = extractToken(req);

  if (!token) {
    // Allow guest access for public endpoints
    req.user = {
      sub: "guest",
      sessionId: req.sessionId || "anonymous",
      email: "guest@starline.local",
      role: "guest",
      permissions: ROLE_PERMISSIONS.guest,
    };
    return next();
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    logger.warn({ ip: req.ip, path: req.path }, "Invalid or expired access token");
    return res.status(401).json({
      error: "Authentication required",
      code: "TOKEN_INVALID_OR_EXPIRED"
    });
  }

  // Attach user to request
  req.user = payload;
  next();
}

/**
 * Require authentication - rejects guest/unauthenticated requests
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role === "guest") {
    res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED"
    });
    return;
  }
  next();
}

/**
 * Authorization middleware - checks if user has required permission
 */
export function authorize(...requiredPermissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED"
      });
      return;
    }

    const userPermissions = req.user.permissions || ROLE_PERMISSIONS[req.user.role] || [];
    const hasPermission = requiredPermissions.every(p => userPermissions.includes(p));

    if (!hasPermission) {
      logger.warn(
        {
          userId: req.user.sub,
          role: req.user.role,
          requiredPermissions,
          userPermissions,
          path: req.path,
          method: req.method,
        },
        "Authorization failed"
      );
      res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        required: requiredPermissions,
      });
      return;
    }

    next();
  };
}

/**
 * Role-based authorization - checks if user has required role (or higher)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED"
      });
      return;
    }

    const roleHierarchy: UserRole[] = [
      "guest", "customer", "staff", "manager", "admin", "super_admin"
    ];

    const userRoleIndex = roleHierarchy.indexOf(req.user.role);
    const hasRole = allowedRoles.some(role => roleHierarchy.indexOf(role) <= userRoleIndex);

    if (!hasRole) {
      logger.warn(
        {
          userId: req.user.sub,
          role: req.user.role,
          allowedRoles,
          path: req.path,
        },
        "Role authorization failed"
      );
      res.status(403).json({
        error: "Insufficient role",
        code: "FORBIDDEN",
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Resource ownership check - ensures user can only access their own resources
 */
export function requireOwnership(getResourceUserId: (req: Request) => string | Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED"
      });
    }

    // Admins can access everything
    if (["super_admin", "admin", "manager"].includes(req.user.role)) {
      return next();
    }

    try {
      const resourceUserId = await getResourceUserId(req);

      // Check if user owns the resource (compare user ID or email)
      const isOwner = req.user.sub === resourceUserId || req.user.email === resourceUserId;

      if (!isOwner) {
        logger.warn(
          {
            userId: req.user.sub,
            resourceUserId,
            path: req.path,
          },
          "Ownership check failed"
        );
        return res.status(403).json({
          error: "Access denied: not your resource",
          code: "FORBIDDEN"
        });
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "Ownership check error");
      return res.status(500).json({ error: "Authorization check failed" });
    }
  };
}

/**
 * Session refresh endpoint handler
 */
export async function refreshTokens(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.starLineRefreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    res.status(401).json({ error: "Refresh token required", code: "REFRESH_TOKEN_MISSING" });
    return;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    // Clear invalid refresh token cookie
    res.clearCookie("starLineRefreshToken", { httpOnly: true, secure: true, sameSite: "lax" });
    res.clearCookie("starLineAccessToken", { httpOnly: true, secure: true, sameSite: "lax" });
    res.status(401).json({ error: "Invalid refresh token", code: "REFRESH_TOKEN_INVALID" });
    return;
  }

  // Check if user still exists and is active
  const user = await collections.customers.findById(payload.sub).exec();
  if (!user || user.get("status") !== "Active") {
    res.status(401).json({ error: "User not found or inactive", code: "USER_INACTIVE" });
    return;
  }

  // Generate new token pair
  const newPayload: Omit<JWTPayload, "iat" | "exp" | "iss" | "aud" | "jti"> = {
    sub: payload.sub,
    sessionId: payload.sessionId,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions,
  };

  const accessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);

  // Set cookies
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("starLineAccessToken", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
  });
  res.cookie("starLineRefreshToken", newRefreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.json({
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    }
  });
}

/**
 * Logout - invalidate tokens (client-side only for stateless JWT)
 * For server-side invalidation, implement token blocklist with Redis
 */
export function logout(req: Request, res: Response) {
  res.clearCookie("starLineAccessToken", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  res.clearCookie("starLineRefreshToken", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  res.json({ message: "Logged out successfully" });
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export { ROLE_PERMISSIONS };