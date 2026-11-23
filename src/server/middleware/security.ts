import helmet from "helmet";
import rateLimit from "express-rate-limit";

/**
 * Strict CSP: self-hosted fonts and scripts, Firebase Auth/Firestore endpoints, blob:
 * for the camera QR scanner's worker. No inline scripts.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "https://*.googleapis.com", "wss://*.firebaseio.com", "http://localhost:9099", "http://127.0.0.1:8081"],
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

/**
 * ponytail: in-memory limiter, per instance. Good enough with max 3 instances;
 * use a Firestore/Redis store if the limit must be global.
 */
const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false, message: { error: message, code: "rate_limited" } });

export const apiLimiter = limiter(60_000, 300, "Too many requests. Please slow down a little.");
export const authLimiter = limiter(60_000, 20, "Too many sign-in attempts. Wait a minute and try again.");
export const aiLimiter = limiter(60_000, 20, "The AI helper is busy. Try again in a minute.");
