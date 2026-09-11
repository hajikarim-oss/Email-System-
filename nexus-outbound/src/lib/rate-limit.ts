import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Redis client for rate limiting
const redis = process.env.REDIS_URL
  ? new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN || "",
    })
  : null;

/**
 * Create a rate limiter instance
 * Falls back to no rate limiting if Redis is not configured
 */
export function createRateLimiter(config?: {
  requests?: number;
  window?: string;
  prefix?: string;
}) {
  const {
    requests = 100,
    window = "1 m",
    prefix = "nexus",
  } = config ?? {};

  if (!redis) {
    // No-op rate limiter for development without Redis
    return {
      limit: async (_identifier: string) => ({
        success: true,
        limit: requests,
        remaining: requests - 1,
        reset: Date.now() + 60000,
      }),
    };
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    prefix: `${prefix}:ratelimit`,
    analytics: true,
  });
}

// Default rate limiter for API routes: 100 requests per minute
export const apiRateLimiter = createRateLimiter({
  requests: 100,
  window: "1 m",
  prefix: "nexus:api",
});

// Stricter rate limiter for auth routes: 10 requests per minute
export const authRateLimiter = createRateLimiter({
  requests: 10,
  window: "1 m",
  prefix: "nexus:auth",
});

// Webhook rate limiter: 500 requests per minute (higher for incoming events)
export const webhookRateLimiter = createRateLimiter({
  requests: 500,
  window: "1 m",
  prefix: "nexus:webhook",
});

/**
 * Apply rate limiting to a request
 * Returns null if allowed, or a Response if rate limited
 */
export async function applyRateLimit(
  identifier: string,
  limiter = apiRateLimiter
): Promise<Response | null> {
  const result = await limiter.limit(identifier);

  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.reset.toString(),
          "Retry-After": Math.ceil(
            (result.reset - Date.now()) / 1000
          ).toString(),
        },
      }
    );
  }

  return null;
}
