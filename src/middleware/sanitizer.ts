// =============================================================================
// src/middleware/sanitizer.ts
// =============================================================================
import { createMiddleware } from "hono/factory";
import validator from "validator";

export const sanitizer = createMiddleware(async (c, next) => {
	const contentType = c.req.header("content-type");

	// Only sanitize JSON requests
	if (contentType?.includes("application/json")) {
		try {
			const body = await c.req.json();

			// Recursively sanitize all string values
			const sanitized = sanitizeObject(body);

			// Replace request body with sanitized version
			c.req.raw = new Request(c.req.url, {
				method: c.req.method,
				headers: c.req.raw.headers,
				body: JSON.stringify(sanitized),
			});
		} catch {
			// If JSON parsing fails, continue without sanitization
		}
	}

	await next();
});

function sanitizeObject(obj: any): any {
	if (typeof obj === "string") {
		// Escape HTML and trim whitespace
		return validator.escape(obj.trim());
	}

	if (Array.isArray(obj)) {
		return obj.map(sanitizeObject);
	}

	if (obj !== null && typeof obj === "object") {
		const sanitized: any = {};
		for (const [key, value] of Object.entries(obj)) {
			sanitized[key] = sanitizeObject(value);
		}
		return sanitized;
	}

	return obj;
}
