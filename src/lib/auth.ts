import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";

export async function setSessionLogin(c: Context, token: string, remember: boolean, data: any) {
    setCookie(c, env.SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "Lax",
        maxAge: remember ? 7 * 86400 : env.SESSION_TTL,
        path: "/",
    });

    // Siapkan session data persis seperti sebelumnya
    const sessionData: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        sessionData[key] = value; // tidak stringify manual
    }

    // Tambahkan timestamp
    sessionData.createdAt = Date.now();
    sessionData.lastActivity = Date.now();

    // Simpan sebagai JSON string, BUKAN HASH
    const sessionKey = `session:${token}`;

    await redisClient.set(
        sessionKey,
        JSON.stringify(sessionData),
        "EX",
        remember ? 7 * 86400 : env.SESSION_TTL
    );
}
