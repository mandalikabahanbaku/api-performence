import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { v4 as uuid4 } from "uuid";

const reqHeaderName = "X-Request-ID";

export const requestId = createMiddleware(async (c: Context, next: Next) => {
	const reqId = c.req.header(reqHeaderName) || uuid4();
	c.set("requestId", reqId);
	c.header(reqHeaderName, reqId);
	await next();
});
