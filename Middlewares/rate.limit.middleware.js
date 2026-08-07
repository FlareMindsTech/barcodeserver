/**
 * @file rate.limit.middleware.js
 * @description Lightweight in-memory sliding-window rate limiter (zero deps).
 *
 * Designed for credential endpoints (login) where a global account-lockout
 * policy is not wanted — keying by IP + username means an attacker hammering
 * one account throttles that pair without DoS-ing other users behind the same
 * NAT. For a production, multi-instance deployment replace this with Redis
 * (e.g. `rate-limit-redis`) — this stays in process memory per instance.
 */

const buckets = new Map();

const cleanupStale = (windowMs) => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt + windowMs) {
      buckets.delete(key);
    }
  }
};

export const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 5, message = 'Too many requests, please try again later.' } = {}) => {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const username = (req.body && req.body.username) || '';
    const key = `${ip}:${username}`;

    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
      if (buckets.size > 10000) {
        cleanupStale(windowMs);
      }
    }

    entry.count += 1;

    if (entry.count > max) {
      return res.status(429).json({
        Success: false,
        Message: message,
        Result: {
          retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        },
        StatusCode: 429
      });
    }

    next();
  };
};

// 5 failed attempts (or requests) per IP+username per 15 minutes
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.'
});