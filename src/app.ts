// src/app.ts
import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger as honoLogger } from "hono/logger";
import { compress } from "hono/compress";
import { timeout } from "hono/timeout";
import { HTTPException } from "hono/http-exception";
import * as crypto from "crypto";

import { errorHandler } from "./middleware/error.handler.js";
import { requestId } from "./middleware/request.js";
import { sanitizer } from "./middleware/sanitizer.js";
import { requestLogger } from "./middleware/request.logger.js";
import { logger } from "./lib/logger.js";
import { corsConfig, env } from "./config/env.js";
import prisma from "./config/prisma.js";
import { redisClient } from "./config/redis.js";
import { rateLimiter } from "./middleware/rate.limit.js";
import { SessionMetrics } from "./lib/monitor.js";
import { sessionMiddleware } from "./middleware/session.js";
import { csrfMiddleware } from "./middleware/csrf.js";
import { routes } from "./module/route.js";
import { ApiError } from "./lib/errors/api.error.js";
import { setCookie } from "hono/cookie";
import { ApiResponse } from "./lib/api.response.js";
import { getConnInfo } from "@hono/node-server/conninfo";

type Variables = {
    requestId: string;
};

const app = new Hono<{ Variables: Variables }>();

// Global error handler (harus paling awal)
app.onError(errorHandler);

// Request tracing
app.use("*", requestId);

// Security
app.use(
    "*",
    secureHeaders({
        strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
        contentSecurityPolicy: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...corsConfig.origins],
        },
        xFrameOptions: "DENY",
        xContentTypeOptions: "nosniff",
        xXssProtection: "1; mode=block",
        referrerPolicy: "strict-origin-when-cross-origin",
    }),
);

app.use(
    "*",
    cors({
        origin: (origin) => {
            if (env.isDevelopment) return origin;
            if (corsConfig.origins.includes(origin)) return origin;
            return corsConfig.origins[0] || null;
        },
        credentials: true,
        allowMethods: corsConfig.methods,
        allowHeaders: [...corsConfig.allowedHeaders, env.CSRF_HEADER_NAME],
        exposeHeaders: corsConfig.exposedHeaders,
        maxAge: corsConfig.maxAge,
    }),
);

// Performance & observability
app.use("*", compress());
app.use("*", requestLogger);
app.use(
    "*",
    honoLogger((str) => logger.http(str)),
);
app.use("*", timeout(60000));

// Protection
app.use("*", sanitizer);
app.use(
    "*",
    rateLimiter({
        maxRequests: env.isDevelopment ? 1000 : 100,
        interval: env.isDevelopment ? 300 : 15, // 5 menit di dev, 1 menit di prod
        temporaryBlockDuration: env.isDevelopment ? 60 : 300, // 1 menit di dev, 5 menit di prod
        skipPaths: ["/health", "/metrics", "/csrf"],
        enableBlocking: env.isProd,
        enableLogging: env.isProd,
    }),
);

// Auth & session (urutan penting)
app.use("*", sessionMiddleware);
app.use("*", csrfMiddleware);

// Health check
app.get("/health", async (c) => {
    const checks = {
        database: false,
        redis: false,
        timestamp: new Date().toISOString(),
        requestId: c.get("requestId"),
    };

    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = true;
    } catch (error) {
        logger.error("Database health check failed:", error);
    }

    try {
        await redisClient.ping();
        checks.redis = true;
    } catch (error) {
        logger.error("Redis health check failed:", error);
    }

    if (!checks.database || !checks.redis) {
        throw new HTTPException(503, { message: "Service Unhealthy" });
    }

    const sessionMetrics = await SessionMetrics.getSessionStats();
    const sessionActivity = await SessionMetrics.getSessionActivity();

    const info = getConnInfo(c);
    return c.json({
        status: "healthy",
        ...checks,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sessions: sessionMetrics,
        activity: sessionActivity,
        ip: info.remote.address,
    });
});

app.get(
    "/csrf",

    async (c: Context) => {
        // 1. Dapatkan session ID dari context (pastikan session middleware sudah dijalankan)
        const sessionId = c.get(env.SESSION_COOKIE_NAME);

        if (!sessionId) {
            throw new ApiError(400, "Session not initialized");
        }

        // 2. Generate CSRF token baru
        const generateHexToken = (): string => {
            return crypto.randomBytes(32).toString("hex");
        };
        const csrfToken = generateHexToken();

        // 3. Simpan token di Redis
        await redisClient.setex(`csrf:${sessionId}`, 15 * 60, csrfToken);

        logger.debug("CSRF token generated", { sessionId });

        // 4. Kembalikan token ke client
        setCookie(c, env.CSRF_COOKIE_NAME, csrfToken, {
            httpOnly: false, // agar JS dapat membaca
            secure: env.isProduction,
            sameSite: "Lax", // atau "Strict" jika perlu,
            maxAge: 15 * 60, // sama dengan durasi session
            path: "/",
            domain: env.isProduction ? ".mandalikaperfume.my.id" : undefined,
        });

        return ApiResponse.sendSuccess(c, { process: "success", token: csrfToken });
    },
);

app.route("/api", routes);

app.notFound((c) =>
    c.json(
        {
            success: false,
            error: "Not Found",
            message: "The requested resource does not exist",
            path: c.req.path,
            method: c.req.method,
            requestId: c.get("requestId"),
        },
        404,
    ),
);

export default app;
