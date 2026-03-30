import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiResponse {
    static sendSuccess<T>(c: Context, data: T, statusCode: ContentfulStatusCode = 200, q?: any) {
        return c.json(
            {
                query: q,
                status: "success",
                data,
            },
            statusCode
        );
    }

    // static sendError(
    // 	c: Context,
    // 	error: Error | { statusCode?: ContentfulStatusCode; message?: string }
    // ) {
    // 	const statusCode =
    // 		"statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    // 	const message = error.message || "Internal Server Error";

    // 	return c.json(
    // 		{
    // 			status: "error",
    // 			message,
    // 		},
    // 		statusCode
    // 	);
    // }
}
