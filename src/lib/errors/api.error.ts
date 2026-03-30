import { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

// src/lib/errors/api.error.ts
export class ApiError extends Error {
	constructor(
		public statusCode: ContentfulStatusCode,
		public message: string,
		public details?: any,
		public name: string = "ApiError"
	) {
		super(message);
		Error.captureStackTrace(this, this.constructor);
	}
}

export class ValidationError extends ApiError {
	constructor(zodError: ZodError) {
		super(
			400,
			"Validation failed",
			{
				issues: zodError.issues.map((issue) => ({
					field: issue.path.join("."),
					message: issue.message,
					code: issue.code,
				})),
			},
			"ValidationError"
		);
	}
}

export class UnauthorizedError extends ApiError {
	constructor(message = "Authentication required") {
		super(401, message, undefined, "UnauthorizedError");
	}
}

export class ForbiddenError extends ApiError {
	constructor(message = "Insufficient permissions") {
		super(403, message, undefined, "ForbiddenError");
	}
}

export class NotFoundError extends ApiError {
	constructor(resource = "Resource") {
		super(404, `${resource} not found`, undefined, "NotFoundError");
	}
}

export class RateLimitError extends ApiError {
	constructor(
		statusCode: ContentfulStatusCode,
		message = "Too many requests",
		public retryAfter?: number,
		public limit?: number
	) {
		super(statusCode, message, undefined, "RateLimitError");
	}
}

export class ConflictError extends ApiError {
	constructor(message = "Resource conflict") {
		super(409, message, undefined, "ConflictError");
	}
}
