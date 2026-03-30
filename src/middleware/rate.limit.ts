// src/middleware/rate.limiter.ts
import type { Context, Next } from "hono";
import { v4 as uuid } from "uuid";
import { ApiError, RateLimitError } from "../lib/errors/api.error.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { redisClient } from "../config/redis.js";
import prisma from "../config/prisma.js";

interface RateLimiterConfig {
    maxRequests?: number; // Maksimum request per window
    interval?: number; // Window dalam detik
    temporaryBlockDuration?: number; // Durasi block sementara dalam detik
    skipPaths?: string[]; // Path yang di-skip
    enableBlocking?: boolean; // Enable blocking mechanism
    enableLogging?: boolean; // Enable database logging
    enableStrictMode?: boolean; // Strict mode untuk production
}

// Default configuration berdasarkan environment
const DEFAULT_CONFIG = {
    maxRequests: 100, // Default: 100 requests
    interval: 60, // 1 menit
    temporaryBlockDuration: 5 * 60, // 5 menit
    skipPaths: ["/health", "/metrics", "/favicon.ico"],
    enableBlocking: false, // Default nonaktif untuk development
    enableLogging: false, // Default nonaktif untuk development
    enableStrictMode: false, // Default nonaktif
};

export const rateLimiter = (config: Partial<RateLimiterConfig> = {}) => {
    // Merge config dengan default, lalu dengan env-based config
    const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...(env.isProduction
            ? {
                  enableBlocking: true,
                  enableLogging: true,
                  enableStrictMode: true,
              }
            : {}),
        ...config,
    };

    return async (c: Context, next: Next) => {
        // 1. Skip paths yang tidak perlu rate limiting
        if (mergedConfig.skipPaths.includes(c.req.path)) {
            return await next();
        }

        // 2. Get client identifier
        const identifier = getClientIdentifier(c);

        // Jika IP unknown di strict mode, tolak langsung
        if (mergedConfig.enableStrictMode && identifier.ip === "unknown") {
            throw new ApiError(400, "Could not identify client");
        }

        const { ip, userAgent, identifierKey } = identifier;
        const pathIdentifier = c.req.path.replace(/\//g, ":");
        const now = Date.now();
        const windowMs = mergedConfig.interval * 1000;
        const windowStart = now - windowMs;

        // 3. Redis keys dengan prefix yang konsisten
        const KEYS = {
            permanentBlock: `ratelimit:perm:${identifierKey}`,
            temporaryBlock: `ratelimit:temp:${identifierKey}`,
            requests: `ratelimit:req:${identifierKey}:${pathIdentifier}`,
            violations: `ratelimit:viol:${identifierKey}`,
            logHash: (reason: string) =>
                `ratelimit:loghash:${Buffer.from(`${identifierKey}:${reason}`).toString("base64")}`,
        };

        try {
            // 4. Check permanent block (NO LOGGING!)
            if (mergedConfig.enableBlocking) {
                const isPermanentlyBlocked = await redisClient.get(KEYS.permanentBlock);
                if (isPermanentlyBlocked === "1") {
                    c.header("X-RateLimit-Blocked", "permanent");
                    throw new ApiError(429, "Your access has been permanently restricted");
                }
            }

            // 5. Check temporary block (NO LOGGING!)
            if (mergedConfig.enableBlocking) {
                const blockExpiry = await redisClient.get(KEYS.temporaryBlock);
                if (blockExpiry && parseInt(blockExpiry) > now) {
                    const retryAfter = Math.ceil((parseInt(blockExpiry) - now) / 1000);
                    c.header("Retry-After", retryAfter.toString());
                    c.header("X-RateLimit-Blocked", "temporary");
                    throw new RateLimitError(
                        429,
                        `Too many requests. Please try again in ${retryAfter} seconds.`,
                        retryAfter
                    );
                }
            }

            // 6. Calculate current requests menggunakan sliding window
            await redisClient.zremrangebyscore(KEYS.requests, 0, windowStart);
            const requestCount = await redisClient.zcard(KEYS.requests);

            // 7. Set rate limit headers
            c.header("X-RateLimit-Limit", mergedConfig.maxRequests.toString());
            c.header(
                "X-RateLimit-Remaining",
                Math.max(0, mergedConfig.maxRequests - requestCount).toString()
            );

            // 8. Check if limit exceeded
            if (requestCount >= mergedConfig.maxRequests) {
                // Increment violation counter
                const violations = await redisClient.incr(KEYS.violations);
                if (violations === 1) {
                    await redisClient.expire(KEYS.violations, 24 * 60 * 60); // 24 jam
                }

                // Apply appropriate action based on violations
                if (mergedConfig.enableBlocking) {
                    const permanentThreshold = env.RATE_VIOLATION || 3;

                    if (violations >= permanentThreshold) {
                        // PERMANENT BLOCK
                        await redisClient.set(KEYS.permanentBlock, "1");

                        // LOG ONLY ON FIRST PERMANENT BLOCK
                        if (mergedConfig.enableLogging && violations === permanentThreshold) {
                            await logWithDeduplication(
                                ip,
                                userAgent,
                                `Permanent block after ${violations} violations`,
                                KEYS
                            );
                        }

                        throw new RateLimitError(
                            429,
                            "Your access has been permanently restricted due to repeated violations"
                        );
                    } else {
                        // TEMPORARY BLOCK dengan escalating duration
                        const blockDuration = calculateBlockDuration(
                            violations,
                            mergedConfig.temporaryBlockDuration
                        );
                        const blockExpiry = now + blockDuration * 1000;

                        await redisClient.set(
                            KEYS.temporaryBlock,
                            blockExpiry.toString(),
                            "PX",
                            blockDuration * 1000
                        );

                        c.header("Retry-After", blockDuration.toString());

                        // LOG ONLY ON FIRST TEMPORARY BLOCK PER VIOLATION LEVEL
                        if (mergedConfig.enableLogging && isFirstViolationLevel(violations)) {
                            await logWithDeduplication(
                                ip,
                                userAgent,
                                `Temporary block for ${blockDuration}s (violation #${violations})`,
                                KEYS
                            );
                        }

                        throw new RateLimitError(
                            429,
                            `Too many requests. You have been blocked for ${blockDuration} seconds.`
                        );
                    }
                } else {
                    // Just rate limit without blocking
                    throw new RateLimitError(429, "Too many requests. Please try again later.");
                }
            }

            // 9. Add current request to sliding window
            await redisClient.zadd(
                KEYS.requests,
                now,
                `${now}:${Math.random().toString(36).substr(2, 9)}`
            );
            await redisClient.expire(KEYS.requests, mergedConfig.interval * 2); // 2x window untuk buffer

            // 10. Proceed with request
            await next();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            // Graceful degradation: Jika Redis down, izinkan request
            logger.warn("Rate limiter Redis error, allowing request", {
                error: error instanceof Error ? error.message : String(error),
                path: c.req.path,
            });

            await next();
        }
    };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface ClientIdentifier {
    ip: string;
    userAgent: string;
    identifierKey: string;
}

/**
 * Extract client identifier dengan proper IP detection
 */
function getClientIdentifier(c: Context): ClientIdentifier {
    const headers = c.req.raw.headers;

    // Priority order untuk IP detection
    const ipSources = [
        headers.get("cf-connecting-ip"), // Cloudflare
        headers.get("x-forwarded-for")?.split(",")[0]?.trim(), // Load balancer
        headers.get("x-real-ip"), // Nginx
        headers.get("x-client-ip"), // Custom header
        c.req.header("host")?.includes("localhost") ? "127.0.0.1" : null, // Local dev
    ];

    const ip = ipSources.find((ip) => ip && ip !== "unknown") || "unknown";
    const userAgent = c.req.header("user-agent") || "unknown";

    // Sanitize untuk key yang aman di Redis
    const sanitizedIP = ip.replace(/[^a-zA-Z0-9.:]/g, "_");
    const sanitizedUA = userAgent.substring(0, 50).replace(/[^a-zA-Z0-9]/g, "_");

    return {
        ip,
        userAgent,
        identifierKey: `${sanitizedIP}:${sanitizedUA}`,
    };
}

/**
 * Calculate block duration dengan escalation
 */
function calculateBlockDuration(violations: number, baseDuration: number): number {
    // Escalating block duration: 5m, 30m, 2h, 1d, 7d, permanent
    const escalation = [
        baseDuration, // 5 minutes
        30 * 60, // 30 minutes
        2 * 60 * 60, // 2 hours
        24 * 60 * 60, // 1 day
        7 * 24 * 60 * 60, // 7 days
    ];

    return Number(escalation[Math.min(violations - 1, escalation.length - 1)]);
}

/**
 * Check if this is first time hitting this violation level
 */
function isFirstViolationLevel(violations: number): boolean {
    // Log only for specific violation levels
    const logLevels = [1, 2, 3, 5, 10];
    return logLevels.includes(violations);
}

/**
 * Log dengan deduplication menggunakan Redis hash
 */
async function logWithDeduplication(
    ip: string,
    userAgent: string,
    reason: string,
    keys: { logHash: (reason: string) => string }
): Promise<void> {
    const logHashKey = keys.logHash(reason);

    // Check if already logged in last hour
    const alreadyLogged = await redisClient.get(logHashKey);
    if (alreadyLogged === "1") {
        return;
    }

    try {
        // Save to database dengan ULID
        await prisma.suspiciousActivity.create({
            data: {
                id: uuid(),
                ip,
                user_agent: userAgent,
                reason,
                created_at: new Date(),
            },
        });

        // Mark as logged untuk 1 jam
        await redisClient.setex(logHashKey, 3600, "1");

        logger.debug("Rate limit event logged", { ip, reason });
    } catch (error) {
        // Fallback to Redis storage
        logger.error("Failed to log to database, using Redis fallback", error);

        await redisClient.lpush(
            "ratelimit:logs:fallback",
            JSON.stringify({
                id: uuid(),
                ip,
                userAgent,
                reason,
                timestamp: new Date().toISOString(),
                source: "fallback",
            })
        );

        await redisClient.ltrim("ratelimit:logs:fallback", 0, 9999);
    }
}

// ============================================================================
// UTILITY FUNCTIONS (For Admin/Monitoring)
// ============================================================================

/**
 * Get rate limit stats untuk monitoring
 */
export async function getRateLimitStats() {
    const keys = await redisClient.keys("ratelimit:*");

    const stats = {
        totalKeys: keys.length,
        blockedIPs: 0,
        recentViolations: 0,
        logsCount: 0,
    };

    for (const key of keys) {
        if (key.includes(":perm:")) stats.blockedIPs++;
        if (key.includes(":viol:")) stats.recentViolations++;
        if (key.includes(":logs:")) {
            const count = await redisClient.llen(key);
            stats.logsCount += count;
        }
    }

    return stats;
}

/**
 * Reset rate limit untuk IP tertentu (admin function)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
    const patterns = [
        `ratelimit:perm:${identifier}*`,
        `ratelimit:temp:${identifier}*`,
        `ratelimit:req:${identifier}*`,
        `ratelimit:viol:${identifier}*`,
    ];

    for (const pattern of patterns) {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
    }
}

/**
 * Get blocked IPs (admin function)
 */
export async function getBlockedIPs(): Promise<
    Array<{
        identifier: string;
        type: "permanent" | "temporary";
        expiry?: string;
    }>
> {
    const blocked: Array<{ identifier: string; type: "permanent" | "temporary"; expiry?: string }> =
        [];

    // Permanent blocks
    const permKeys = await redisClient.keys("ratelimit:perm:*");
    for (const key of permKeys) {
        const identifier = key.replace("ratelimit:perm:", "");
        blocked.push({ identifier, type: "permanent" });
    }

    // Temporary blocks
    const tempKeys = await redisClient.keys("ratelimit:temp:*");
    for (const key of tempKeys) {
        const identifier = key.replace("ratelimit:temp:", "");
        const expiry = await redisClient.get(key);
        blocked.push({
            identifier,
            type: "temporary",
            expiry: expiry ? new Date(parseInt(expiry)).toISOString() : undefined,
        });
    }

    return blocked;
}

// ============================================================================
// EXPORTED CONFIGURATIONS
// ============================================================================

/**
 * Pre-configured rate limiter untuk berbagai use case
 */
export const rateLimiters = {
    // Global default (production)
    global: () =>
        rateLimiter({
            maxRequests: 100,
            interval: 60,
            enableBlocking: true,
            enableLogging: true,
        }),

    // Development (lebih longgar)
    development: () =>
        rateLimiter({
            maxRequests: 1000,
            interval: 300,
            enableBlocking: false,
            enableLogging: false,
        }),

    // Auth endpoints (lebih ketat)
    auth: () =>
        rateLimiter({
            maxRequests: 5,
            interval: 300, // 5 menit
            temporaryBlockDuration: 15 * 60, // 15 menit
            enableBlocking: true,
            enableLogging: true,
        }),

    // Public API (sedang)
    api: () =>
        rateLimiter({
            maxRequests: 100,
            interval: 60,
            temporaryBlockDuration: 5 * 60,
            enableBlocking: true,
            enableLogging: false,
        }),

    // Payment endpoints (sangat ketat)
    payment: () =>
        rateLimiter({
            maxRequests: 10,
            interval: 60,
            temporaryBlockDuration: 30 * 60, // 30 menit
            enableBlocking: true,
            enableLogging: true,
        }),
};

// USAGE
// Global rate limiter (disesuaikan dengan environment)
// app.use(
// 	"*",
// 	rateLimiter({
// 		// Development: lebih longgar
// 		maxRequests: env.isDevelopment ? 1000 : 100,
// 		interval: env.isDevelopment ? 300 : 60, // 5 menit di dev, 1 menit di prod
// 		temporaryBlockDuration: env.isDevelopment ? 60 : 300, // 1 menit di dev, 5 menit di prod
// 		skipPaths: ["/health", "/metrics", "/api/auth/login"],
// 		enableBlocking: env.isProduction,
// 		enableLogging: env.isProduction,
// 	})
// );

// // Atau untuk route tertentu dengan konfigurasi ketat:
// const authRoutes = new Hono();
// authRoutes.post(
// 	"/login",
// 	rateLimiter({
// 		maxRequests: 5, // Hanya 5 percobaan login
// 		interval: 300, // Dalam 5 menit
// 		temporaryBlockDuration: 900, // Block 15 menit jika gagal
// 		enableBlocking: true,
// 		enableLogging: true,
// 	}),
// 	loginHandler
// );

// // 1. GLOBAL: Rate limiter ringan untuk semua request
// app.use("*", rateLimiter({
//   maxRequests: 1000, // 1000 requests
//   interval: 300, // per 5 menit
//   skipPaths: ['/health', '/metrics'],
//   enableBlocking: false, // No blocking, just limiting
//   enableLogging: false,
// }));

// // 2. ROUTE-SPECIFIC: Rate limiter ketat untuk endpoint sensitif
// const sensitiveRoutes = new Hono();
// sensitiveRoutes.use("*", rateLimiter({
//   maxRequests: 100,
//   interval: 60,
//   enableBlocking: true,
//   enableLogging: true,
// }));
