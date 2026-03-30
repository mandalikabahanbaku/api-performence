import { Context } from "hono";
import { AuthService } from "./auth.service.js";
import { CreateLoggingActivityDTO } from "../application/log/log.schema.js";
import { CreateLogger } from "../application/log/log.service.js";
import { ApiResponse } from "../../lib/api.response.js";
import { SessionManager } from "../../lib/session.management.js";
import { ApiError } from "../../lib/errors/api.error.js";
import { generateHexToken } from "../../lib/index.js";
import { getConnInfo } from "@hono/node-server/conninfo";
import { setSessionLogin } from "../../lib/auth.js";
import { deleteCookie, getCookie } from "hono/cookie";
import { env } from "../../config/env.js";
import { redisClient } from "../../config/redis.js";
const MAX_DEVICES = 5; // Contoh: maks 5 device
export class AuthController {
    static async register(c: Context) {
        const body = c.get("body");
        await AuthService.register(body);
        return ApiResponse.sendSuccess(c, {}, 201);
    }

    static async login(c: Context) {
        const body = c.get("body");
        const { remember, ...reqBody } = body;
        const account = await AuthService.login(reqBody);
        const activeSessions = await SessionManager.getUserActiveSessions(account.email, c);
        if (activeSessions.length >= MAX_DEVICES) {
            throw new ApiError(429, `Maksimal ${MAX_DEVICES} device aktif`);
        }
        const sessionToken = generateHexToken();
        const info = getConnInfo(c);
        const ip = info.remote.address;
        const userAgent = c.req.header("User-Agent");

        if (account) {
            const data: CreateLoggingActivityDTO = {
                activity: "CREATE",
                description: `Login: ${account.email}-${ip}-${userAgent}`,
                email: account.email,
            };
            await CreateLogger(data);
        }

        await setSessionLogin(c, sessionToken, remember, { ip, userAgent, ...account });
        return ApiResponse.sendSuccess(c, {}, 201);
    }

    static async getAccount(c: Context) {
        const accountSession = c.get("session");
        if (!accountSession) throw new ApiError(401, "You must login first");
        return ApiResponse.sendSuccess(c, accountSession, 200);
    }

    static async logout(c: Context) {
        const sessionId = getCookie(c, env.SESSION_COOKIE_NAME) || c.req.header("Authorization")?.replace("Bearer ", "");

        if (sessionId) {
            await redisClient.del(`session:${sessionId}`);
            await redisClient.del(`csrf:${sessionId}`);
        }

        deleteCookie(c, env.CSRF_COOKIE_NAME);
        deleteCookie(c, env.SESSION_COOKIE_NAME);

        return ApiResponse.sendSuccess(c, {}, 201);
    }
}
