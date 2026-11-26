import rateLimit from 'express-rate-limit';
import { BackendEnv } from '../config/env.js';

export function createRateLimiters(env: BackendEnv) {
  const apiLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
  });

  const authLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.', code: 'AUTH_RATE_LIMITED' },
  });

  return { apiLimiter, authLimiter };
}
