import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { logger } from "../lib/logger";

/**
 * Security Headers Configuration
 * Following OWASP Secure Headers Project and Flipkart-scale security practices
 */

// Content Security Policy configuration
const cspDirectives: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Required for Vite/React inline scripts in development
    "'unsafe-eval'", // Required for Vite HMR in development
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Required for CSS-in-JS, Tailwind, etc.
    "https://fonts.googleapis.com",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https:",
  ],
  "font-src": [
    "'self'",
    "https://fonts.gstatic.com",
    "https://cdn.jsdelivr.net",
  ],
  "connect-src": [
    "'self'",
    "https://api.starline.com", // Production API
    "ws://localhost:*", // Vite HMR
    "wss://localhost:*",
  ],
  "frame-src": ["'none'"], // Prevent clickjacking
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "block-all-mixed-content": [],
  "upgrade-insecure-requests": [],
};

/**
 * Build CSP string from directives
 */
function buildCSP(isProduction: boolean): string {
  const directives = { ...cspDirectives };

  if (!isProduction) {
    // Development: allow more sources for Vite HMR
    directives["script-src"] = [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "http://localhost:*",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
    ];
    directives["connect-src"] = [
      "'self'",
      "ws://localhost:*",
      "wss://localhost:*",
      "http://localhost:*",
      "https://api.starline.com",
    ];
  }

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/**
 * Creates Helmet middleware with production-grade security headers
 */
export function createSecurityHeadersMiddleware() {
  const isProduction = process.env.NODE_ENV === "production";

  // Parse CSP directives for helmet
  const cspString = buildCSP(isProduction);
  const cspDirectivesParsed: Record<string, string[]> = {};
  cspString.split("; ").forEach((directive) => {
    const [key, ...values] = directive.split(" ");
    if (key && values.length > 0) {
      cspDirectivesParsed[key] = values.join(" ").split(" ");
    }
  });

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: cspDirectivesParsed,
      reportOnly: !isProduction, // Report-only in development for debugging
    },

    // HTTP Strict Transport Security (HSTS)
    // Only enable in production with valid TLS
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,

    // X-Frame-Options: Prevent clickjacking
    frameguard: {
      action: "deny",
    },

    // X-Content-Type-Options: Prevent MIME type sniffing
    noSniff: true,

    // Referrer Policy: Control referrer information
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    // Cross-Origin Embedder Policy (COEP)
    crossOriginEmbedderPolicy: isProduction ? { policy: "require-corp" } : false,

    // Cross-Origin Opener Policy (COOP)
    crossOriginOpenerPolicy: { policy: "same-origin" },

    // Cross-Origin Resource Policy (CORP)
    crossOriginResourcePolicy: { policy: "same-origin" },

    // Origin Agent Cluster (prevents speculative execution attacks)
    originAgentCluster: true,

    // X-DNS-Prefetch-Control: Control DNS prefetching
    dnsPrefetchControl: { allow: false },

    // X-Download-Options: Prevent IE from executing downloads
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies: Control Adobe Flash/PDF cross-domain
    permittedCrossDomainPolicies: { permittedPolicies: "none" },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // X-XSS-Protection: Legacy XSS filter (deprecated but harmless)
    xssFilter: true,
  });
}

/**
 * Additional security headers not covered by Helmet
 */
export function additionalSecurityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Permissions Policy (formerly Feature Policy)
  // Restrict browser features and APIs
  res.setHeader(
    "Permissions-Policy",
    [
      "accelerometer=()",
      "ambient-light-sensor=()",
      "autoplay=()",
      "battery=()",
      "camera=()",
      "cross-origin-isolated=()",
      "display-capture=()",
      "document-domain=()",
      "encrypted-media=()",
      "execution-while-not-rendered=()",
      "execution-while-out-of-viewport=()",
      "fullscreen=(self)",
      "gamepad=()",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "identity-credentials-get=()",
      "idle-detection=()",
      "local-fonts=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "serial=()",
      "speaker-selection=()",
      "storage-access=()",
      "usb=()",
      "web-share=()",
      "window-management=()",
      "xr-spatial-tracking=()",
    ].join(", ")
  );

  // Cache Control for API responses
  if (req.path.startsWith("/api/")) {
    // Don't cache API responses by default
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  // Clear server header (already done by hidePoweredBy, but explicit)
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");

  // API version header for client compatibility
  res.setHeader("X-API-Version", "1.0.0");

  // Request ID for tracing
  const requestId = (req as any).id || req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-ID", requestId);

  next();
}

/**
 * CSP Violation Reporting Endpoint
 * Collects CSP violations for monitoring
 */
export function cspReportHandler(req: Request, res: Response) {
  if (req.body) {
    logger.warn(
      {
        "csp-report": req.body,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
      "CSP violation reported"
    );
  }
  res.status(204).end();
}

/**
 * Security headers middleware factory
 * Combines Helmet with additional headers
 */
export function securityHeadersMiddleware() {
  const helmetMiddleware = createSecurityHeadersMiddleware();
  return [
    helmetMiddleware,
    additionalSecurityHeaders,
  ];
}

export { buildCSP };