import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";

export const requestLogger = createMiddleware(async (c: Context, next: Next) => {
	const start = Date.now();
	const requestId = c.get("requestId");

	// Log incoming request
	logger.info({
		requestId,
		type: "request",
		method: c.req.method,
		path: c.req.path,
		query: c.req.query(),
		ip: c.req.header("x-forwarded-for") || "unknown",
		userAgent: c.req.header("user-agent"),
	});

	await next();

	const duration = Date.now() - start;

	// Log response
	logger.info({
		requestId,
		type: "response",
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		duration: `${duration}ms`,
	});
});
