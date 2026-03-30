import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";

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

vi.mock("hono/cookie", async (importOriginal) => {
    const original = await importOriginal<typeof import("hono/cookie")>();
    return {
        ...original,
        getCookie: vi.fn().mockReturnValue("mock-session-id"),
    };
});

vi.mock("../../middleware/csrf.js", () => ({
    csrfMiddleware: async (c: any, next: any) => await next(),
}));

describe("RawMaterialRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    it("GET /api/app/rawmat should return 200", async () => {
        const res = await app.request("/api/app/rawmat", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /api/app/rawmat?status=deleted should return 200", async () => {
        const res = await app.request("/api/app/rawmat?status=deleted", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /api/app/rawmat?search=katun should return 200", async () => {
        const res = await app.request("/api/app/rawmat?search=katun", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    it("GET /api/app/rawmat/:id should return 200", async () => {
        const res = await app.request("/api/app/rawmat/1", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    it("POST /api/app/rawmat should create raw material and return 201", async () => {
        const payload = {
            barcode: "BARCODE_NOTFOUND",
            name: "Kain Polyester",
            price: 30000,
            unit: "meter",
        };

        const res = await app.request("/api/app/rawmat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const body = await res.json();
        expect(res.status).toBe(201);
        expect(body.status).toBe("success");
    });

    it("POST /api/app/rawmat should return 400 if required fields missing", async () => {
        const res = await app.request("/api/app/rawmat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: "RM-INCOMPLETE" }),
        });

        expect(res.status).toBe(400);
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    it("PUT /api/app/rawmat/:id should update raw material and return 201", async () => {
        const payload = { name: "Kain Katun Updated" };

        const res = await app.request("/api/app/rawmat/1", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(201);
    });

    // ─── DELETE (soft) ────────────────────────────────────────────────────────

    it("DELETE /api/app/rawmat/:id should soft delete and return 200", async () => {
        const res = await app.request("/api/app/rawmat/1", { method: "DELETE" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── RESTORE ──────────────────────────────────────────────────────────────

    it("PATCH /api/app/rawmat/:id/restore should restore and return 200", async () => {
        // id=2 is mocked to return deleted_at: new Date() (see setup.ts)
        const res = await app.request("/api/app/rawmat/2/restore", { method: "PATCH" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── CLEAN ────────────────────────────────────────────────────────────────

    it("DELETE /api/app/rawmat/clean should permanently delete and return 200", async () => {
        const res = await app.request("/api/app/rawmat/clean", { method: "DELETE" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    // ─── UTILS ────────────────────────────────────────────────────────────────

    it("GET /api/app/rawmat/utils should return 200", async () => {
        const res = await app.request("/api/app/rawmat/utils", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /api/app/rawmat/count-utils should return 200", async () => {
        const res = await app.request("/api/app/rawmat/count-utils", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });

    it("GET /api/app/rawmat/redis should return 200", async () => {
        const res = await app.request("/api/app/rawmat/redis", { method: "GET" });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("success");
    });
});
