// src/middleware/error.handler.ts
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { ApiError, ValidationError, RateLimitError } from "../lib/errors/api.error.js";
import { env } from "../config/env.js";

export const errorHandler = (err: Error, c: Context) => {
    const requestId = c.get("requestId") || "unknown";
    const user = c.get("user")?.id || "anonymous";

    // Log the error
    logger.error({
        requestId,
        userId: user,
        path: c.req.path,
        method: c.req.method,
        error: err.message,
        name: err.name,
        stack: env.isDevelopment ? err.stack : undefined,
    });

    // Handle HTTPException (from Hono)
    if (err instanceof HTTPException) {
        return c.json(
            {
                success: false,
                error: err.message,
                message: err.message,
                requestId,
            },
            err.status
        );
    }

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        const validationError = new ValidationError(err);
        return c.json(
            {
                success: false,
                error: validationError.name,
                message: validationError.message,
                details: validationError.details,
                requestId,
            },
            400
        );
    }

    // Handle RateLimitError
    if (err instanceof RateLimitError) {
        const headers: Record<string, string> = {};
        if (err.retryAfter) {
            headers["Retry-After"] = err.retryAfter.toString();
            headers["X-RateLimit-Limit"] = err.limit?.toString() || "";
            headers["X-RateLimit-Remaining"] = "0";
        }

        return c.json(
            {
                success: false,
                error: err.name,
                message: err.message,
                retryAfter: err.retryAfter,
                requestId,
            },
            429,
            headers
        );
    }

    // Handle ApiError and its subclasses
    if (err instanceof ApiError) {
        return c.json(
            {
                success: false,
                error: err.name,
                message: err.message,
                ...(err.details && { details: err.details }),
                requestId,
            },
            err.statusCode
        );
    }

    // Default error response
    return c.json(
        {
            success: false,
            error: "InternalServerError",
            message: env.isProduction
                ? "An unexpected error occurred. Please try again later."
                : err.message,
            requestId,
            ...(env.isDevelopment && {
                stack: err.stack,
                type: err.name,
            }),
        },
        500
    );
};
