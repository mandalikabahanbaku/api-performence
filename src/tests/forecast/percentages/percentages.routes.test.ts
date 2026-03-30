import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../../app.js";

vi.mock("../../../config/redis.js", () => {
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

vi.mock("hono/cookie", async (importOriginal) => {
    const original = await importOriginal<typeof import("hono/cookie")>();
    return {
        ...original,
        getCookie: vi.fn().mockReturnValue("mock-session-id"),
    };
});

vi.mock("../../../middleware/csrf.js", () => ({
    csrfMiddleware: async (c: any, next: any) => await next(),
}));

const BASE = "/api/app/forecasts/forecast-percentages";

describe("ForecastPercentageRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── GET / ─────────────────────────────────────────────────────────────────

    it("GET / should return 200 with list", async () => {
        const res = await app.request(BASE, { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
        expect(body.data).toHaveProperty("len");
        expect(body.data).toHaveProperty("data");
    });

    it("GET /?year=2025 should return 200 filtered", async () => {
        const res = await app.request(`${BASE}?year=2025`, { method: "GET" });
        expect(res.status).toBe(200);
    });

    // ─── GET /:id ──────────────────────────────────────────────────────────────

    it("GET /:id should return 200 for existing record", async () => {
        const res = await app.request(`${BASE}/1`, { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /:id should return 404 for non-existent record", async () => {
        const res = await app.request(`${BASE}/999`, { method: "GET" });
        expect(res.status).toBe(404);
    });

    // ─── POST / ────────────────────────────────────────────────────────────────

    it("POST / should create and return 201", async () => {
        const payload = { month: 5, year: 2026, value: 8 };

        const res = await app.request(BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();

        expect(res.status).toBe(201);
        expect(body.status).toBe("success");
    });

    it("POST / should return 400 for validation error (month out of range)", async () => {
        const payload = { month: 13, year: 2025, value: 10 };

        const res = await app.request(BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(400);
    });

    // ─── POST /bulk ────────────────────────────────────────────────────────────

    it("POST /bulk should upsert multiple items and return 201", async () => {
        const payload = {
            items: [
                { month: 1, year: 2025, value: 10.5 },
                { month: 2, year: 2025, value: 12 },
            ],
        };

        const res = await app.request(`${BASE}/bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();

        expect(res.status).toBe(201);
        expect(body.status).toBe("success");
        expect(body.data).toHaveProperty("count");
    });

    it("POST /bulk should return 400 for empty items array", async () => {
        const payload = { items: [] };

        const res = await app.request(`${BASE}/bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(400);
    });

    // ─── PUT /:id ──────────────────────────────────────────────────────────────

    it("PUT /:id should update and return 200", async () => {
        const payload = { value: 15 };

        const res = await app.request(`${BASE}/1`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── DELETE /:id ───────────────────────────────────────────────────────────

    it("DELETE /:id should delete and return 200", async () => {
        const res = await app.request(`${BASE}/1`, { method: "DELETE" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("DELETE /:id should return 404 for non-existent record", async () => {
        const res = await app.request(`${BASE}/999`, { method: "DELETE" });
        expect(res.status).toBe(404);
    });

    // ─── DELETE /bulk ──────────────────────────────────────────────────────────

    it("DELETE /bulk should delete multiple and return 200", async () => {
        const payload = { ids: [1, 2, 3] };

        const res = await app.request(`${BASE}/bulk`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
        expect(body.data).toHaveProperty("count");
    });

    it("DELETE /bulk should return 400 for empty ids array", async () => {
        const payload = { ids: [] };

        const res = await app.request(`${BASE}/bulk`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(400);
    });
});
