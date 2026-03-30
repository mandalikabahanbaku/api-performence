import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import { redisClient } from "../../config/redis.js";
import { env } from "../../config/env.js";

// Helping Vitest find the mocks
vi.mock("../../config/redis.js", () => ({
    redisClient: {
        get: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("hash"),
        hgetall: vi.fn().mockResolvedValue({
            email: "test@example.com",
            role: "SUPER_ADMIN",
        }),
        expire: vi.fn(),
        connect: vi.fn(),
    },
    closeRedisConnection: vi.fn(),
}));

vi.mock("hono/cookie", async (importOriginal) => {
    const original = await importOriginal<typeof import("hono/cookie")>();
    return {
        ...original,
        getCookie: vi.fn().mockReturnValue("mock-session-id"),
    };
});

// Mocking redis directly in test file to avoid resolution issues
vi.mock("../../config/redis.js", () => {
    const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("hash"),
        hgetall: vi.fn().mockResolvedValue({
            email: "test@example.com",
            role: "SUPER_ADMIN",
        }),
        expire: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
        status: "ready",
    };
    return {
        redisClient: mockRedis,
        closeRedisConnection: vi.fn(),
    };
});

// Mocking CSRF check to pass
vi.mock("../../middleware/csrf.js", () => ({
    csrfMiddleware: async (c: any, next: any) => await next(),
}));

describe("ProductRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("GET /api/app/products should return 200", async () => {
        const res = await app.request("/api/app/products", {
            method: "GET",
        });

        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /api/app/products/:id should return 200", async () => {
        const res = await app.request("/api/app/products/1", {
            method: "GET",
        });

        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("POST /api/app/products should create product and return 201", async () => {
        const mockProduct = {
            code: "NEWP_999",
            name: "New Product",
            size: 42,
            gender: "MEN",
            z_value: 1.65,
            lead_time: 14,
            review_period: 30,
            product_type: "Apparel",
            unit: "pcs",
            distribution_percentage: 0.5,
            safety_percentage: 0.1,
        };

        const res = await app.request("/api/app/products", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(mockProduct),
        });

        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.status).toBe("success");
    });

    it("PUT /api/app/products/:id should update product and return 201", async () => {
        const mockUpdate = {
            name: "Updated Product Name",
        };

        const res = await app.request("/api/app/products/1", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(mockUpdate),
        });

        expect(res.status).toBe(201);
    });

    it("PATCH /api/app/products/status/:id should update status and return 201", async () => {
        const res = await app.request("/api/app/products/status/1?status=ACTIVE", {
            method: "PATCH",
        });

        expect(res.status).toBe(201);
    });

    it("DELETE /api/app/products/clean should return 201", async () => {
        const res = await app.request("/api/app/products/clean", {
            method: "DELETE",
        });

        expect(res.status).toBe(201);
    });
});
