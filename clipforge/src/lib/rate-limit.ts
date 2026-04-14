// Simple in-memory rate limiter for development
// In production, use Redis-based rate limiting

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Predefined limits
export const RATE_LIMITS = {
  upload: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  apiKeyValidation: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  aiOperation: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
} as const;
