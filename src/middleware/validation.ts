import { ApiError } from "../lib/errors/api.error.js";
import type { Context, Next } from "hono";
import { z } from "zod";

// Middleware untuk validasi umum (query + body)
export const validate = (schema: z.ZodSchema) => async (c: Context, next: Next) => {
    try {
        const data = {
            ...c.req.query(),
            ...(await c.req.parseBody().catch(() => ({}))), // Gunakan parseBody untuk form data
        };

        schema.parse(data);
        await next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errors = error.issues.map((issue) => ({
                message: issue.message,
                path: issue.path.join("."),
            }));
            throw new ApiError(400, "Validation error", errors); // Lempar ApiError
        }
        throw error; // Lempar error asli untuk ditangkap handler
    }
};

// Middleware untuk validasi body JSON
export const validateBody =
    <T extends z.ZodTypeAny>(schema: T) =>
    async (c: Context, next: Next) => {
        try {
            const body = await c.req.json().catch(() => ({}));
            const parsed = schema.parse(body);
            c.set("body", parsed); // Simpan data yang divalidasi
            await next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const errors = error.issues.map((issue) => ({
                    message: issue.message,
                    path: issue.path.join("."),
                }));
                throw new ApiError(400, "Validation Error", errors); // Lempar ApiError
            }
            throw new ApiError(500, "Invalid JSON format"); // Tangani error parsing JSON
        }
    };
