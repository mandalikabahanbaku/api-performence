import { env } from "../config/env.js";
import { redisClient } from "../config/redis.js";
import { ROLE } from "../generated/prisma/enums.js";
import { ApiError } from "../lib/errors/api.error.js";
import { logger } from "../lib/logger.js";
import { sessionCache } from "../lib/session.management.js";
import type { Context, Next } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { ContentfulStatusCode } from "hono/utils/http-status";

const CACHE_TTL = 300; // 5 menit

export const authMiddleware = async (c: Context, next: Next) => {
    try {
        // Headless support: allow Authorization header as fallback for non-browser clients
        const sessionId = getCookie(c, env.SESSION_COOKIE_NAME) || c.req.header("Authorization")?.replace("Bearer ", "");

        if (!sessionId) {
            throw new ApiError(401, "Unauthorized, please login to access our system");
        }

        let sessionData: Record<string, any> | null = null;
        const now = Date.now();
        const sessionKey = `session:${sessionId}`;

        const cached = sessionCache.get(sessionId);
        if (cached && cached.expiry > now) {
            sessionData = cached.data;
        } else {
            const type = await redisClient.type(sessionKey);

            if (type === "hash") {
                sessionData = await redisClient.hgetall(sessionKey);

                if (sessionData.user && typeof sessionData.user === "string") {
                    try {
                        sessionData.user = JSON.parse(sessionData.user);
                    } catch (e) {
                        logger.error("Error parsing user data in session", { error: (e as Error).message });
                    }
                }
            } else if (type === "string") {
                // Backward compatibility: sessions stored as JSON string before hash migration
                const raw = await redisClient.get(sessionKey);
                if (raw) {
                    try {
                        sessionData = JSON.parse(raw);
                    } catch {
                        await redisClient.del(sessionKey);
                        throw new ApiError(500, "Corrupted session data");
                    }
                }
            } else {
                deleteCookie(c, env.SESSION_COOKIE_NAME);
                throw new ApiError(401, "Unauthorized, please login to access our system");
            }

            if (!sessionData || Object.keys(sessionData).length === 0) {
                sessionCache.delete(sessionId);
                throw new ApiError(401, "Unauthorized: invalid or expired session");
            }

            sessionCache.set(sessionId, {
                data: sessionData,
                expiry: now + CACHE_TTL * 1000,
            });
        }

        c.set("session", sessionData);
        c.set("role", sessionData?.role || "STAFF");
        c.set("permissions", sessionData?.employee?.permissions || []);
        c.set("sessionId", sessionId);

        // 6. Background task: Extend TTL (sliding session)
        // Jangan await agar tidak block request
        extendSessionTTL(sessionKey).catch((err) =>
            logger.error("Failed to extend session TTL", { error: (err as Error).message })
        );

        await next();
    } catch (err) {
        if (err instanceof ApiError) {
            return c.json(
                { success: false, message: err.message },
                err.statusCode as ContentfulStatusCode
            );
        }
        return c.json({ success: false, message: (err as Error).message }, 401);
    }
};

// Helper function untuk extend TTL secara background
async function extendSessionTTL(sessionKey: string) {
    try {
        const ttl = env.SESSION_TTL;
        if (ttl > 0) {
            await redisClient.expire(sessionKey, ttl);
        }
    } catch (error) {
        logger.error("Failed to extend session TTL", { sessionKey, error: (error as Error).message });
    }
}

// Periodic cleanup cache
setInterval(() => {
    const now = Date.now();
    sessionCache.forEach((value, key) => {
        if (value.expiry <= now) {
            sessionCache.delete(key);
        }
    });
}, 60000);

export const roleMiddleware = (allowedRoles?: ROLE[]) => {
    return async (c: Context, next: Next) => {
        const userRole = c.get("role") as ROLE;
        if (!userRole) throw new ApiError(401, "Unauthorized");

        // Jika allowedRoles tidak di-pass atau kosong → izinkan semua role authenticated
        if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
            throw new ApiError(403, "Forbidden: insufficient role");
        }

        await next();
    };
};
