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

const mockInventory = {
    id: 1,
    outlet_id: 1,
    product_id: 1,
    quantity: "10.00",
    min_stock: "5.00",
    updated_at: new Date(),
    product: { id: 1, name: "T-Shirt", code: "TSHIRT" },
};

const mockOutlet = {
    id: 1,
    name: "Toko Utama",
    code: "TOKO001",
    deleted_at: null,
};

describe("OutletInventoryRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("GET /api/app/outlets/:id/inventory", () => {
        it("should return 200 with inventory list", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([mockInventory]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(1);

            const res = await app.request("/api/app/outlets/1/inventory", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 200 with empty list", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(0);

            const res = await app.request("/api/app/outlets/1/inventory", { method: "GET" });

            expect(res.status).toBe(200);
        });

        it("should return 200 with search query", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([mockInventory]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(1);

            const res = await app.request("/api/app/outlets/1/inventory?search=tshirt", { method: "GET" });

            expect(res.status).toBe(200);
        });

        it("should return 200 filtered by low_stock=true", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([
                { ...mockInventory, quantity: "2.00", min_stock: "5.00" },
            ]);

            const res = await app.request("/api/app/outlets/1/inventory?low_stock=true", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data.len).toBe(1);
        });

        it("should return 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/outlets/999/inventory", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("GET /api/app/outlets/:id/inventory/:product_id", () => {
        it("should return 200 with stock detail", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(mockInventory);

            const res = await app.request("/api/app/outlets/1/inventory/1", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 404 if inventory not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/outlets/1/inventory/999", { method: "GET" });

            expect(res.status).toBe(404);
        });

        it("should return 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/outlets/999/inventory/1", { method: "GET" });

            expect(res.status).toBe(404);
        });
    });

    // ─── INIT ─────────────────────────────────────────────────────────────────

    describe("POST /api/app/outlets/:id/inventory/init", () => {
        it("should return 201 on successful init", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            // @ts-ignore
            prisma.outletInventory.createMany.mockResolvedValue({ count: 2 });

            const res = await app.request("/api/app/outlets/1/inventory/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: [1, 2] }),
            });
            const body = await res.json();

            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
            expect(body.data.initialized).toBe(2);
        });

        it("should return 400 if product_ids is empty", async () => {
            const res = await app.request("/api/app/outlets/1/inventory/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: [] }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if product_ids is missing", async () => {
            const res = await app.request("/api/app/outlets/1/inventory/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(400);
        });

        it("should return 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/outlets/999/inventory/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: [1] }),
            });

            expect(res.status).toBe(404);
        });

        it("should return 404 if any product not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1 }]); // only 1 of 2

            const res = await app.request("/api/app/outlets/1/inventory/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_ids: [1, 999] }),
            });

            expect(res.status).toBe(404);
        });
    });

    // ─── SET MIN STOCK ────────────────────────────────────────────────────────

    describe("PATCH /api/app/outlets/:id/inventory/:product_id/min-stock", () => {
        it("should return 200 on successful update", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(mockInventory);
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({ ...mockInventory, min_stock: "20.00" });

            const res = await app.request("/api/app/outlets/1/inventory/1/min-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ min_stock: 20 }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 400 if min_stock is negative", async () => {
            const res = await app.request("/api/app/outlets/1/inventory/1/min-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ min_stock: -5 }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if min_stock is missing", async () => {
            const res = await app.request("/api/app/outlets/1/inventory/1/min-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(400);
        });

        it("should return 404 if inventory not found", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/outlets/1/inventory/999/min-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ min_stock: 10 }),
            });

            expect(res.status).toBe(404);
        });
    });
});
