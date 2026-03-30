// src/middlewares/session.ts
import type { Context, Next } from "hono";
import { env } from "../config/env.js";
import { getCookie, setCookie } from "hono/cookie";
import { v4 as uuid } from "uuid";

export const sessionMiddleware = async (c: Context, next: Next) => {
	// 1. Ambil atau generate sessionId
	let sessionId = getCookie(c, env.SESSION_COOKIE_NAME);
	let isNew = false;

	if (!sessionId) {
		// logger.warn("Invalid or missing session ID, generate new", { sessionId });
		sessionId = uuid(); // 32 byte hex → 64 chars
		isNew = true;
	}

	// 2. Simpan sessionId di context
	c.set(env.SESSION_COOKIE_NAME, sessionId);

	// 3. Jika session baru, set cookie (HttpOnly, Secure, SameSite Lax)
	if (isNew) {
		setCookie(c, env.SESSION_COOKIE_NAME, sessionId, {
			httpOnly: true,
			secure: env.isProduction,
			sameSite: "Lax",
			maxAge: env.SESSION_TTL,
			path: "/",
		});
	}

	// 4. Teruskan
	return next();
};
