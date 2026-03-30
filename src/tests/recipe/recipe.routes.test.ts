import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";

// ── Mocks required by every routes test ──────────────────────────────────────

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

// ── Shared mock data ──────────────────────────────────────────────────────────

const mockRawRecipeRow = {
    id: 1,
    quantity: "2.50",
    product_id: 1,
    product_name: "T-Shirt",
    product_code: "TSHIRT",
    pt_id: 1,
    pt_name: "Apparel",
    pt_slug: "apparel",
    unit_id: 1,
    unit_name: "pcs",
    unit_slug: "pcs",
    size_id: 1,
    size_val: 40,
    rm_name: "Kain Katun",
    rm_barcode: "RM-001",
    rm_price: "50000",
    urm_id: 1,
    urm_name: "meter",
    current_stock: "100",
};

const mockRawDetailRows = [
    {
        product_id: 1,
        code: "TSHIRT",
        name: "T-Shirt",
        type_name: "Apparel",
        unit_name: "pcs",
        raw_mat_id: 1,
        barcode: "RM-001",
        rm_name: "Kain Katun",
        rm_price: "50000",
        rm_quantity: "2.50",
        urm_name: "meter",
    },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("RecipeRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── LIST ──────────────────────────────────────────────────────────────────

    describe("GET /api/app/recipes", () => {
        it("should return 200 with recipe list", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1n }])
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const res = await app.request("/api/app/recipes", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 200 with empty list", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 with search filter", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes?search=kain", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with product_id filter", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes?product_id=1", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with raw_mat_id filter", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes?raw_mat_id=1", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 sorted by quantity", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes?sortBy=quantity&sortOrder=asc", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with pagination params", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const res = await app.request("/api/app/recipes?page=2&take=5", { method: "GET" });
            expect(res.status).toBe(200);
        });
    });

    // ── DETAIL ────────────────────────────────────────────────────────────────

    describe("GET /api/app/recipes/:id", () => {
        it("should return 200 with recipe detail", async () => {
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce(mockRawDetailRows);

            const res = await app.request("/api/app/recipes/1", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
            expect(body.data.product_id).toBe(1);
        });

        it("should return 404 if recipe not found", async () => {
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([]);

            const res = await app.request("/api/app/recipes/999", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });

    // ── UPSERT ────────────────────────────────────────────────────────────────

    describe("POST /api/app/recipes", () => {
        const validPayload = {
            product_id: 1,
            raw_material: [
                { raw_material_id: 1, quantity: 2.5 },
                { raw_material_id: 2, quantity: 1.0 },
            ],
        };

        it("should return 201 on successful upsert", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });
            // @ts-ignore
            prisma.rawMaterial.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validPayload),
            });

            expect(res.status).toBe(201);
        });

        it("should return 400 if raw_material is empty", async () => {
            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, raw_material: [] }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if product_id is missing", async () => {
            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raw_material: [{ raw_material_id: 1, quantity: 2 }] }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if raw_material has duplicate ids", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });

            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: 1,
                    raw_material: [
                        { raw_material_id: 1, quantity: 2 },
                        { raw_material_id: 1, quantity: 3 },
                    ],
                }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 404 if product not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validPayload),
            });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });

        it("should return 404 if raw materials not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });
            // only 1 found, 2 requested
            // @ts-ignore
            prisma.rawMaterial.findMany.mockResolvedValue([{ id: 1 }]);

            const res = await app.request("/api/app/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validPayload),
            });

            expect(res.status).toBe(404);
        });
    });
});
