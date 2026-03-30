import { Hono } from "hono";
import { validateBody } from "../../middleware/validation.js";
import { LoginSchema, RegisterSchema } from "./auth.schema.js";
import { AuthController } from "./auth.controller.js";
import { rateLimiter } from "../../middleware/rate.limit.js";
import { env } from "../../config/env.js";
import { authMiddleware } from "../../middleware/auth.js";

export const AuthRoutes = new Hono();
AuthRoutes.post(
    "/register",
    rateLimiter({
        maxRequests: env.isDevelopment ? 50 : 10,
        interval: env.isDevelopment ? 300 : 60, // 5 menit di dev, 1 menit di prod
        temporaryBlockDuration: env.isDevelopment ? 60 : 300, // 1 menit di dev, 5 menit di prod
    }),
    validateBody(RegisterSchema),
    AuthController.register
);

AuthRoutes.post(
    "/",
    rateLimiter({
        maxRequests: env.isDevelopment ? 50 : 10,
        interval: env.isDevelopment ? 300 : 60, // 5 menit di dev, 1 menit di prod
        temporaryBlockDuration: env.isDevelopment ? 60 : 300, // 1 menit di dev, 5 menit di prod
    }),
    validateBody(LoginSchema),
    AuthController.login
);

AuthRoutes.get("/", authMiddleware, AuthController.getAccount);

AuthRoutes.delete("/", authMiddleware, AuthController.logout);
