import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";

vi.mock("../../config/redis.js", () => {
    const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("hash"),
        hgetall: vi.fn().mockResolvedValue({ email: "test@example.com", role: "SUPER_ADMIN" }),
        expire: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
        status: "ready",
    };
    return { redisClient: mockRedis, closeRedisConnection: vi.fn() };
});

vi.mock("hono/cookie", async (importOriginal) => {
    const original = await importOriginal<typeof import("hono/cookie")>();
    return { ...original, getCookie: vi.fn().mockReturnValue("mock-session-id") };
});

vi.mock("../../middleware/csrf.js", () => ({
    csrfMiddleware: async (c: any, next: any) => await next(),
}));

const mockOutlet = {
    id: 1,
    name: "Toko Utama",
    code: "TOKO001",
    phone: null,
    warehouse_id: 1,
    deleted_at: null,
    created_at: new Date(),
    updated_at: null,
    address: null,
    warehouse: { id: 1, name: "Gudang Utama", type: "FINISH_GOODS" },
    _count: { inventories: 0 },
};

describe("OutletRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("GET /api/app/outlets", () => {
        it("should return 200 with list of outlets", async () => {
            // @ts-ignore
            prisma.outlet.findMany.mockResolvedValue([mockOutlet]);
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(1);

            const res = await app.request("/api/app/outlets", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 200 filtered by status=active", async () => {
            // @ts-ignore
            prisma.outlet.findMany.mockResolvedValue([mockOutlet]);
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(1);

            const res = await app.request("/api/app/outlets?status=active", { method: "GET" });

            expect(res.status).toBe(200);
        });

        it("should return 200 filtered by status=deleted", async () => {
            // @ts-ignore
            prisma.outlet.findMany.mockResolvedValue([mockOutlet]);
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(1);

            const res = await app.request("/api/app/outlets?status=deleted", { method: "GET" });

            expect(res.status).toBe(200);
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("GET /api/app/outlets/:id", () => {
        it("should return 200 with outlet detail", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);

            const res = await app.request("/api/app/outlets/1", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("POST /api/app/outlets", () => {
        it("should return 201 on successful create", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.outlet.create.mockResolvedValue(mockOutlet);

            const res = await app.request("/api/app/outlets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Toko Baru", code: "TOKO002" }),
            });
            const body = await res.json();

            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("PUT /api/app/outlets/:id", () => {
        it("should return 200 on successful update", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outlet.update.mockResolvedValue({ ...mockOutlet, name: "Toko Updated" });

            const res = await app.request("/api/app/outlets/1", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Toko Updated" }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    // ─── TOGGLE STATUS ────────────────────────────────────────────────────────

    describe("PATCH /api/app/outlets/:id/status", () => {
        it("should return 200 when toggling status", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outlet.update.mockResolvedValue({ ...mockOutlet, deleted_at: new Date() });

            const res = await app.request("/api/app/outlets/1/status", { method: "PATCH" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    // ─── BULK ACTIONS ─────────────────────────────────────────────────────────

    describe("POST /api/app/outlets/bulk-status", () => {
        it("should return 200 on successful bulk status update", async () => {
            // @ts-ignore
            prisma.outlet.updateMany.mockResolvedValue({ count: 2 });

            const res = await app.request("/api/app/outlets/bulk-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [1, 2], status: "deleted" }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    describe("POST /api/app/outlets/bulk-delete", () => {
        it("should return 200 on successful bulk permanent delete", async () => {
            // @ts-ignore
            prisma.outlet.deleteMany.mockResolvedValue({ count: 2 });

            const res = await app.request("/api/app/outlets/bulk-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [1, 2] }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    // ─── CLEAN ────────────────────────────────────────────────────────────────

    describe("DELETE /api/app/outlets/clean", () => {
        it("should return 200 when inactive outlets are cleaned", async () => {
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(2);
            // @ts-ignore
            prisma.outlet.deleteMany.mockResolvedValue({ count: 2 });

            const res = await app.request("/api/app/outlets/clean", { method: "DELETE" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });
});
