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

const mockWarehouse = {
    id: 1,
    code: "WH01",
    name: "Gudang Utama",
    type: "FINISH_GOODS",
    deleted_at: null,
    created_at: new Date(),
    updated_at: null,
    warehouse_address: {
        street: "Jl. Industri No. 1",
        district: "Cibodas",
        sub_district: "Cibodas Baru",
        city: "Tangerang",
        province: "Banten",
        country: "Indonesia",
        postal_code: "15138",
        notes: null,
        url_google_maps: null,
        created_at: new Date(),
        updated_at: new Date(),
    },
};

describe("WarehouseRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("GET /api/app/warehouses", () => {
        it("should return 200 with list of warehouses", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const res = await app.request("/api/app/warehouses", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 200 with empty list", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(0);

            const res = await app.request("/api/app/warehouses", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 with search filter", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const res = await app.request("/api/app/warehouses?search=gudang", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 filtered by type FINISH_GOODS", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const res = await app.request("/api/app/warehouses?type=FINISH_GOODS", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 filtered by type RAW_MATERIAL", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(0);

            const res = await app.request("/api/app/warehouses?type=RAW_MATERIAL", { method: "GET" });

            expect(res.status).toBe(200);
        });

        it("should return 200 with pagination params", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(5);

            const res = await app.request("/api/app/warehouses?page=1&take=5&sortBy=name&sortOrder=desc", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("GET /api/app/warehouses/:id", () => {
        it("should return 200 with warehouse detail", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

            const res = await app.request("/api/app/warehouses/1", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 404 if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/warehouses/999", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("POST /api/app/warehouses", () => {
        it("should return 201 on successful create", async () => {
            // @ts-ignore
            prisma.warehouse.create.mockResolvedValue(mockWarehouse);

            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: "WH01", name: "Gudang Baru", type: "FINISH_GOODS" }),
            });
            const body = await res.json();

            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
            expect(body.data.name).toBeDefined();
        });

        it("should return 201 with full address", async () => {
            // @ts-ignore
            prisma.warehouse.create.mockResolvedValue(mockWarehouse);

            const payload = {
                code: "WH-LONG",
                name: "Gudang Lengkap",
                type: "RAW_MATERIAL",
                warehouse_address: {
                    street: "Jl. Raya No. 10",
                    district: "Curug",
                    sub_district: "Curug Sangereng",
                    city: "Tangerang",
                    province: "Banten",
                    country: "Indonesia",
                    postal_code: "15810",
                    notes: null,
                    url_google_maps: null,
                },
            };

            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            expect(res.status).toBe(201);
        });

        it("should return 400 if required fields missing (no name)", async () => {
            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "FINISH_GOODS" }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if required fields missing (no type)", async () => {
            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Gudang Test" }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if type is invalid enum value", async () => {
            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Gudang Test", type: "INVALID_TYPE" }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if body is empty", async () => {
            const res = await app.request("/api/app/warehouses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            expect(res.status).toBe(400);
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("PUT /api/app/warehouses/:id", () => {
        it("should return 200 on successful update", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, name: "Gudang Updated" });

            const res = await app.request("/api/app/warehouses/1", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Gudang Updated" }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 404 if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/warehouses/999", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Updated" }),
            });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });

        it("should return 200 when updating only type", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, type: "RAW_MATERIAL" });

            const res = await app.request("/api/app/warehouses/1", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "RAW_MATERIAL" }),
            });

            expect(res.status).toBe(200);
        });

        it("should return 200 when updating with warehouse_address", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue(mockWarehouse);

            const res = await app.request("/api/app/warehouses/1", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    warehouse_address: {
                        street: "Jl. Baru",
                        district: "Baru",
                        sub_district: "Baru",
                        city: "Jakarta",
                        province: "DKI Jakarta",
                        country: "Indonesia",
                        postal_code: "10110",
                        notes: null,
                        url_google_maps: null,
                    },
                }),
            });

            expect(res.status).toBe(200);
        });
    });

    // ─── CHANGE STATUS ────────────────────────────────────────────────────────

    describe("PATCH /api/app/warehouses/:id", () => {
        it("should return 200 when soft-deleting (status=DELETE)", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, name: "Gudang Utama", deleted_at: new Date() });

            const res = await app.request("/api/app/warehouses/1?status=DELETE", { method: "PATCH" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 when restoring (status=ACTIVE)", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue({ ...mockWarehouse, deleted_at: new Date() });
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, name: "Gudang Utama", deleted_at: null });

            const res = await app.request("/api/app/warehouses/1?status=ACTIVE", { method: "PATCH" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 404 if warehouse not found for PATCH", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/warehouses/999?status=DELETE", { method: "PATCH" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });

    // ─── DELETE (permanent) ───────────────────────────────────────────────────

    describe("DELETE /api/app/warehouses/:id", () => {
        it("should return 200 on successful permanent delete", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.delete.mockResolvedValue({ id: 1 });

            const res = await app.request("/api/app/warehouses/1", { method: "DELETE" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 404 if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/warehouses/999", { method: "DELETE" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });
});
