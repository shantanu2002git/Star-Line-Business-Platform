import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Security Logging, Monitoring & Audit Trail
 * Following Flipkart-scale patterns: structured security events, attack detection, audit trail
 */

// Security event types
export type SecurityEventType =
  // Authentication events
  | "auth.login_success"
  | "auth.login_failure"
  | "auth.logout"
  | "auth.token_refresh"
  | "auth.token_expired"
  | "auth.token_invalid"
  | "auth.password_reset_request"
  | "auth.password_reset_success"
  | "auth.mfa_challenge"
  // Authorization events
  | "authz.access_denied"
  | "authz.insufficient_permissions"
  | "authz.insufficient_role"
  | "authz.ownership_violation"
  // Validation events
  | "validation.failure"
  | "validation.suspicious_input"
  // Rate limiting events
  | "ratelimit.exceeded"
  | "ratelimit.ip_blocked"
  // Injection attack detection
  | "attack.sql_injection"
  | "attack.nosql_injection"
  | "attack.xss_attempt"
  | "attack.path_traversal"
  | "attack.command_injection"
  | "attack.ldap_injection"
  // Suspicious activity
  | "suspicious.bot_detected"
  | "suspicious.scraping"
  | "suspicious.credential_stuffing"
  | "suspicious.account_enumeration"
  | "suspicious.unusual_location"
  | "suspicious.multiple_failed_logins"
  // Data access
  | "data.bulk_export"
  | "data.sensitive_access"
  | "data.pii_access"
  // Admin actions
  | "admin.user_created"
  | "admin.user_deleted"
  | "admin.role_changed"
  | "admin.config_changed"
  | "admin.data_deleted"
  | "admin.data_modified"
  | "admin.data_modification_failed";

export interface SecurityEvent {
  type: SecurityEventType;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: string;
  requestId: string;
  ip: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  role?: string;
  method: string;
  path: string;
  statusCode?: number;
  details: Record<string, unknown>;
  // Attack-specific fields
  attackVector?: string;
  payload?: string;
  blocked?: boolean;
}

// In-memory buffer for batching (in production, use Redis/queue)
const eventBuffer: SecurityEvent[] = [];
const BUFFER_FLUSH_INTERVAL = 5000; // 5 seconds
const BUFFER_MAX_SIZE = 100;

// Attack detection patterns
const ATTACK_PATTERNS = {
  sqlInjection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|OR|AND)\b\s*[\s\S]*?\b(FROM|WHERE|INTO|VALUES|TABLE)\b)/i,
    /('|(--|;|%27|%3B)).*(OR|AND)\s*\d+\s*=\s*\d+/i,
    /(\bEXEC\b|\bEXECUTE\b|\bXP_CMDSHELL\b)/i,
  ],
  nosqlInjection: [
    /\$where|\$regex|\$options|\$or|\$and|\$nor|\$not|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$ne|\$exists|\$type|\$mod|\$all|\$elemMatch|\$size/i,
    /(__proto__|constructor|prototype)/i,
  ],
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe|<object|<embed|<applet|<meta|<link/gi,
    /expression\s*\(/gi,
  ],
  pathTraversal: [
    /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c/i,
    /\/etc\/passwd|\\windows\\system32/i,
  ],
  commandInjection: [
    /[;&|`$(){}[\]]/,
    /\b(cat|ls|pwd|whoami|id|uname|ps|netstat|ifconfig)\b/i,
  ],
  ldapInjection: [
    /[()*&|!]/,
  ],
} as const;

/**
 * Detect attack patterns in input
 */
function detectAttacks(input: string, context: string): { type: SecurityEventType; vector: string; payload: string }[] {
  const detected: { type: SecurityEventType; vector: string; payload: string }[] = [];

  for (const [attackType, patterns] of Object.entries(ATTACK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        const eventType = `attack.${attackType.toLowerCase().replace("injection", "_injection")}` as SecurityEventType;
        detected.push({
          type: eventType,
          vector: context,
          payload: input.length > 500 ? input.substring(0, 500) + "..." : input,
        });
        break; // Only report first match per attack type
      }
    }
  }

  return detected;
}

/**
 * Extract security-relevant information from request
 */
function extractSecurityContext(req: Request) {
  const requestId = ((req as any).id || req.headers["x-request-id"] as string || "unknown") as string;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = req.get("user-agent");
  const user = (req as any).user;
  const sessionId = (req as any).sessionId;

  return {
    requestId,
    ip,
    userAgent,
    userId: user?.sub,
    sessionId,
    role: user?.role,
    method: req.method,
    path: req.path,
  };
}

/**
 * Log a security event
 */
export function logSecurityEvent(event: Omit<SecurityEvent, "timestamp">): void {
  const fullEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Log to structured logger
  const logLevel = fullEvent.severity === "critical" ? "error" :
                   fullEvent.severity === "high" ? "warn" :
                   fullEvent.severity === "medium" ? "warn" : "info";

  logger[logLevel]({
    security_event: fullEvent.type,
    severity: fullEvent.severity,
    requestId: fullEvent.requestId,
    ip: fullEvent.ip,
    userId: fullEvent.userId,
    sessionId: fullEvent.sessionId,
    role: fullEvent.role,
    method: fullEvent.method,
    path: fullEvent.path,
    statusCode: fullEvent.statusCode,
    details: fullEvent.details,
    attackVector: fullEvent.attackVector,
    payload: fullEvent.payload,
    blocked: fullEvent.blocked,
  }, `Security event: ${fullEvent.type}`);

  // Add to buffer for batch processing
  eventBuffer.push(fullEvent);
  if (eventBuffer.length >= BUFFER_MAX_SIZE) {
    flushEventBuffer();
  }
}

/**
 * Flush event buffer (in production, send to SIEM/Elasticsearch/Splunk)
 */
function flushEventBuffer(): void {
  if (eventBuffer.length === 0) return;

  const events = [...eventBuffer];
  eventBuffer.length = 0;

  // In production: send to SIEM, Elasticsearch, Splunk, etc.
  logger.info({
    buffered_events: events.length,
    events: events.map(e => ({
      type: e.type,
      severity: e.severity,
      requestId: e.requestId,
      timestamp: e.timestamp,
    })),
  }, "Security event buffer flushed");
}

// Flush buffer periodically
setInterval(flushEventBuffer, BUFFER_FLUSH_INTERVAL);

// Graceful shutdown flush
process.on("beforeExit", flushEventBuffer);

/**
 * Middleware to detect attacks in request body, query, params
 */
export function attackDetectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);

  // Check body
  if (req.body && typeof req.body === "object") {
    const bodyStr = JSON.stringify(req.body);
    const attacks = detectAttacks(bodyStr, "body");
    for (const attack of attacks) {
      logSecurityEvent({
        ...context,
        type: attack.type,
        severity: "high",
        details: { detectionContext: "request_body" },
        attackVector: attack.vector,
        payload: attack.payload,
        blocked: false, // We log but don't block (WAF should block)
      });
    }
  }

  // Check query parameters
  if (req.query && typeof req.query === "object") {
    const queryStr = JSON.stringify(req.query);
    const attacks = detectAttacks(queryStr, "query");
    for (const attack of attacks) {
      logSecurityEvent({
        ...context,
        type: attack.type,
        severity: "high",
        details: { detectionContext: "query_parameters" },
        attackVector: attack.vector,
        payload: attack.payload,
        blocked: false,
      });
    }
  }

  // Check URL params
  if (req.params && typeof req.params === "object") {
    const paramsStr = JSON.stringify(req.params);
    const attacks = detectAttacks(paramsStr, "params");
    for (const attack of attacks) {
      logSecurityEvent({
        ...context,
        type: attack.type,
        severity: "high",
        details: { detectionContext: "url_parameters" },
        attackVector: attack.vector,
        payload: attack.payload,
        blocked: false,
      });
    }
  }

  next();
}

/**
 * Middleware to log authentication events
 */
export function authLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);
  const originalSend = res.send;

  res.send = function (body?: any): Response {
    const statusCode = res.statusCode;

    // Log login attempts
    if (req.path.includes("/auth/login") || req.path.includes("/login")) {
      if (req.method === "POST") {
        if (statusCode === 200 || statusCode === 201) {
          logSecurityEvent({
            ...context,
            type: "auth.login_success",
            severity: "low",
            statusCode,
            details: { endpoint: req.path },
          });
        } else if (statusCode === 401 || statusCode === 403) {
          logSecurityEvent({
            ...context,
            type: "auth.login_failure",
            severity: "medium",
            statusCode,
            details: { endpoint: req.path, reason: "invalid_credentials" },
          });
        }
      }
    }

    // Log token refresh
    if (req.path.includes("/auth/refresh") || req.path.includes("/refresh")) {
      if (req.method === "POST") {
        if (statusCode === 200) {
          logSecurityEvent({
            ...context,
            type: "auth.token_refresh",
            severity: "low",
            statusCode,
            details: { endpoint: req.path },
          });
        } else if (statusCode === 401) {
          logSecurityEvent({
            ...context,
            type: "auth.token_invalid",
            severity: "medium",
            statusCode,
            details: { endpoint: req.path, reason: "invalid_refresh_token" },
          });
        }
      }
    }

    // Log logout
    if (req.path.includes("/auth/logout") || req.path.includes("/logout")) {
      logSecurityEvent({
        ...context,
        type: "auth.logout",
        severity: "low",
        statusCode,
        details: { endpoint: req.path },
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Middleware to log authorization failures
 */
export function authorizationLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);
  const originalSend = res.send;

  res.send = function (body?: any): Response {
    const statusCode = res.statusCode;

    if (statusCode === 403) {
      // Check if it's an auth error response
      let errorCode = "unknown";
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        errorCode = parsed?.code || "unknown";
      } catch {}

      let eventType: SecurityEventType = "authz.access_denied";
      if (errorCode === "FORBIDDEN") {
        if (body?.required) {
          eventType = "authz.insufficient_permissions";
        } else if (body?.requiredRoles) {
          eventType = "authz.insufficient_role";
        }
      }

      logSecurityEvent({
        ...context,
        type: eventType,
        severity: "medium",
        statusCode,
        details: { errorCode, endpoint: req.path },
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Middleware to log validation failures
 */
export function validationLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);
  const originalSend = res.send;

  res.send = function (body?: any): Response {
    const statusCode = res.statusCode;

    if (statusCode === 400) {
      let errorCode = "unknown";
      let details: Record<string, unknown> = {};
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        errorCode = parsed?.code || "unknown";
        details = parsed?.details || {};
      } catch {}

      if (errorCode === "VALIDATION_ERROR" || errorCode === "BAD_REQUEST") {
        logSecurityEvent({
          ...context,
          type: "validation.failure",
          severity: "low",
          statusCode,
          details: { errorCode, endpoint: req.path, validationErrors: details },
        });
      }
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Middleware to log rate limit violations
 */
export function rateLimitLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);
  const originalSend = res.send;

  res.send = function (body?: any): Response {
    const statusCode = res.statusCode;

    if (statusCode === 429) {
      logSecurityEvent({
        ...context,
        type: "ratelimit.exceeded",
        severity: "medium",
        statusCode,
        details: { endpoint: req.path, retryAfter: res.get("Retry-After") },
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Audit trail middleware for sensitive operations
 */
export function auditTrailMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = extractSecurityContext(req);
  const sensitivePaths = [
    "/api/products",
    "/api/categories",
    "/api/services",
    "/api/customers",
    "/api/orders",
    "/api/inventory",
    "/api/invoices",
    "/api/banners",
    "/api/offers",
    "/api/content",
    "/api/users",
    "/api/admin",
  ];

  const isSensitive = sensitivePaths.some(p => req.path.startsWith(p));
  const isWriteOp = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);

  if (isSensitive && isWriteOp) {
    const originalSend = res.send;

    res.send = function (body?: any): Response {
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 300;

      logSecurityEvent({
        ...context,
        type: `admin.${success ? "data_modified" : "data_modification_failed"}`,
        severity: success ? "low" : "medium",
        statusCode,
        details: {
          endpoint: req.path,
          method: req.method,
          success,
          requestBody: sanitizeForAudit(req.body),
        },
      });

      return originalSend.call(this, body);
    };
  }

  next();
}

/**
 * Sanitize data for audit logs (remove sensitive fields)
 */
function sanitizeForAudit(data: any): any {
  if (!data || typeof data !== "object") return data;

  const sensitiveKeys = ["password", "token", "secret", "key", "creditCard", "cvv", "ssn"];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeForAudit(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Combined security logging middleware stack
 */
export function securityLoggingMiddleware() {
  return [
    attackDetectionMiddleware,
    authLoggingMiddleware,
    authorizationLoggingMiddleware,
    validationLoggingMiddleware,
    rateLimitLoggingMiddleware,
    auditTrailMiddleware,
  ];
}

/**
 * Get security event statistics (for monitoring dashboard)
 */
export function getSecurityStats(): {
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  recentAttacks: number;
} {
  const events = [...eventBuffer]; // Copy buffer
  const stats = {
    totalEvents: events.length,
    byType: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    recentAttacks: 0,
  };

  const oneHourAgo = Date.now() - 3600000;

  for (const event of events) {
    stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
    stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;

    if (event.type.startsWith("attack.") && new Date(event.timestamp).getTime() > oneHourAgo) {
      stats.recentAttacks++;
    }
  }

  return stats;
}

/**
 * Security event endpoint for monitoring
 */
export function securityEventsEndpoint(req: Request, res: Response): void {
  const stats = getSecurityStats();
  res.json(stats);
}

/**
 * Export for testing
 */
export { eventBuffer, ATTACK_PATTERNS };