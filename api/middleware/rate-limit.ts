/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Initialize Redis client if REDIS_URL is provided
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

const withRedisStore = (prefix: string) =>
  redis
    ? {
        store: new RedisStore({
          client: redis,
          prefix
        } as any)
      }
    : {};

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests, please try again later',
    retry_after: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...withRedisStore('rate_limit:api:')
});

/**
 * Purchase/subscription rate limiter
 * 5 requests per hour (prevent abuse)
 */
export const purchaseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many purchase attempts, please try again later',
    retry_after: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...withRedisStore('rate_limit:purchase:')
});

/**
 * License verification rate limiter
 * 1000 requests per 15 minutes (high volume expected)
 */
export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    error: 'rate_limit_exceeded',
    message: 'License verification rate limit exceeded',
    retry_after: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...withRedisStore('rate_limit:verify:')
});

/**
 * Usage tracking rate limiter
 * 500 requests per 15 minutes
 */
export const usageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Usage tracking rate limit exceeded',
    retry_after: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...withRedisStore('rate_limit:usage:')
});

/**
 * Plugin submission rate limiter
 * 3 requests per 24 hours (prevent spam)
 */
export const submissionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Plugin submission limit reached. Maximum 3 submissions per day.',
    retry_after: 86400
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...withRedisStore('rate_limit:submission:')
});
