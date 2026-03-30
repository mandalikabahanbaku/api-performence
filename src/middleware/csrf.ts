// src/middlewares/csrf.ts
import type { Context, Next } from "hono";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors/api.error.js";
import { redisClient } from "../config/redis.js";
const CSRF_EXEMPT_ROUTES = [
    "GET:/csrf",
    "GET:/health",
    "OPTIONS:*",
    // "POST:/api/app/recomendations/order",
    // "POST:/api/app/recomendations/approve",
    // "PATCH:/api/app/po/open/*",
];

export const csrfMiddleware = async (c: Context, next: Next) => {
    const method = c.req.method;
    const path = c.req.path;
    const routeKey = `${method}:${path}`;

    // 1. Lewati jika route dikecualikan
    const isExempt = CSRF_EXEMPT_ROUTES.some((pattern) => {
        if (pattern === "*") return true;

        const [exemptMethod, exemptPath] = pattern.split(":");
        if (!exemptPath) return false;

        // Cek Method
        if (exemptMethod !== "*" && exemptMethod !== method) return false;

        // Cek Path
        if (exemptPath === "*") return true;
        if (exemptPath.endsWith("*")) {
            const prefix = exemptPath.slice(0, -1);
            return path.startsWith(prefix);
        }

        return exemptPath === path;
    });
    if (isExempt) {
        return next();
    }

    // 2. Lewati jika method GET/HEAD/OPTIONS
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        return next();
    }

    // 3. Ambil header CSRF dan sessionId dari context
    const csrfToken = c.req.header(env.CSRF_HEADER_NAME);
    const sessionId = c.get(env.SESSION_COOKIE_NAME) as string; // sebelumnya di‐set di sessionMiddleware

    logger.info(`CSRF: ${csrfToken}\nSESSION: ${sessionId}`);
    // 4. Jika tidak ada CSRF atau sessionId, tolak
    if (!csrfToken || !sessionId) {
        logger.warn("CSRF token or session missing", {
            path,
            method,
            hasToken: !!csrfToken,
            hasSession: !!sessionId,
        });
        throw new ApiError(403, "CSRF token or session missing");
    }

    try {
        // 5. Ambil token dari Redis
        const storedToken = await redisClient.get(`csrf:${sessionId}`);

        // Bandingkan token dari Redis dengan token dari header
        if (storedToken !== csrfToken) {
            logger.warn("CSRF token mismatch", {
                path,
                method,
                sessionId,
                storedToken,
                receivedToken: csrfToken,
            });
            throw new ApiError(403, "Invalid CSRF token");
        }

        // 6. Token valid → lanjut
        await next();
    } catch (err) {
        logger.error("CSRF validation failed", {
            error: (err as Error).message,
        });
        throw new ApiError(403, "CSRF validation failed");
    }
};
