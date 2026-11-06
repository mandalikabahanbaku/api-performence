import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

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

describe("IssuanceRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("GET /api/app/product-issuance", () => {
        it("should return 200 with issuance list", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([{
                    id: 1, code: "TSHIRT", name: "T-Shirt", size_val: 40, unit_name: "pcs",
                    pt_id: 1, pt_name: "Apparel", pt_slug: "apparel",
                    totalQuantity: "150",
                    issuances_data: JSON.stringify([{ year: 2025, month: 1, quantity: "150" }]),
                }]);

            const res = await app.request("/api/app/product-issuance", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toBeDefined();
        });

        it("should return 200 with empty list", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 200 with search filter", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance?search=tshirt", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 filtered by gender", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance?gender=MEN", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with horizon param", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([{
                    id: 1, code: "TSHIRT", name: "T-Shirt", size_val: null, unit_name: null,
                    pt_id: null, pt_name: null, pt_slug: null, totalQuantity: "0",
                    issuances_data: "[]",
                }]);

            const res = await app.request("/api/app/product-issuance?horizon=6", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with product_id filter", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance?product_id=1", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with pagination", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance?page=2&take=5", { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 sorted by name ascending", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request("/api/app/product-issuance?sortBy=name&sortOrder=asc", { method: "GET" });
            expect(res.status).toBe(200);
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("GET /api/app/product-issuance/:product_id", () => {
        it("should return 200 with issuance detail", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ others_sum: 150, all_val: 0, last_id: 1 }]);

            const res = await app.request("/api/app/product-issuance/1?year=2025&month=3", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.quantity).toBe(150);
            expect(body.data.product.code).toBe("TSHIRT");
        });

        it("should return 404 if issuance not found", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ others_sum: 0, all_val: 0, last_id: null }]);

            const res = await app.request("/api/app/product-issuance/999?year=2025&month=3", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });

        it("should return 404 if the SUM values are Prisma Decimal zero", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([
                { others_sum: new Decimal("0"), all_val: new Decimal("0"), last_id: null },
            ]);

            const res = await app.request("/api/app/product-issuance/1?year=2025&month=3", { method: "GET" });

            expect(res.status).toBe(404);
        });

        it("should return the Decimal quantity as a number", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([
                { others_sum: new Decimal("0"), all_val: new Decimal("150.50"), last_id: 1 },
            ]);

            const res = await app.request("/api/app/product-issuance/1?year=2025&month=3", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data.quantity).toBe(150.5);
        });

        it("should return 400 if year/month not provided (0 values)", async () => {
            const res = await app.request("/api/app/product-issuance/1?year=0&month=0", { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.success).toBe(false);
        });
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("POST /api/app/product-issuance", () => {
        it("should return 200 on successful create", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 150, month: 3, year: 2025 }),
            });

            expect(res.status).toBe(200);
            expect(prisma.productIssuance.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { product_id_year_month_type: { product_id: 1, month: 3, year: 2025, type: "ALL" } },
                    create: { product_id: 1, quantity: 150, month: 3, year: 2025, type: "ALL" },
                }),
            );
        });

        it("should return 200 without month/year (uses previous month)", async () => {
            const now = new Date();
            const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 150 }),
            });

            expect(res.status).toBe(200);
            expect(prisma.productIssuance.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    create: expect.objectContaining({
                        month: prev.getUTCMonth() + 1,
                        year: prev.getUTCFullYear(),
                    }),
                }),
            );
        });

        it("should return 400 if required fields missing", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: 100 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 400 if quantity missing", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 404 if product not found", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 999, quantity: 100 }),
            });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
            expect(prisma.productIssuance.upsert).not.toHaveBeenCalled();
        });

        it("should return 400 if type is not ALL for a period up to the threshold", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 100, month: 2, year: 2026, type: "ONLINE" }),
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.success).toBe(false);
            expect(prisma.productIssuance.upsert).not.toHaveBeenCalled();
        });

        it("should return 200 if type is not ALL for a period after the threshold", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 100, month: 3, year: 2026, type: "ONLINE" }),
            });

            expect(res.status).toBe(200);
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("PUT /api/app/product-issuance", () => {
        it("should return 200 on successful update", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 200, month: 3, year: 2025 }),
            });

            expect(res.status).toBe(200);
            expect(prisma.productIssuance.upsert).toHaveBeenCalledWith(
                expect.objectContaining({ update: { quantity: 200 } }),
            );
        });

        it("should return 404 if product not found", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 999, quantity: 100, month: 3, year: 2025 }),
            });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });

        it("should return 200 without month/year (uses previous month)", async () => {
            const res = await app.request("/api/app/product-issuance", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: 1, quantity: 100 }),
            });

            expect(res.status).toBe(200);
        });
    });

    // ─── EXPORT ───────────────────────────────────────────────────────────────

    describe("GET /api/app/product-issuance/export", () => {
        it("should return a CSV with all rows, not the detail handler", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([{
                    id: 1, code: "TSHIRT", name: "T-Shirt", size_val: 40, unit_name: "pcs",
                    pt_id: 1, pt_name: "Apparel", pt_slug: "apparel",
                    totalQuantity: "150",
                    issuances_data: "[]",
                }]);

            const res = await app.request("/api/app/product-issuance/export?horizon=2", { method: "GET" });
            const text = await res.text();
            const [header, row] = text.trim().split("\n");

            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Type")).toContain("text/csv");
            expect(res.headers.get("Content-Disposition")).toContain("data-pengeluaran.csv");
            expect(header).toMatch(/^No,Kode,Nama Produk,Tipe,Size,\d{4}-\d{2},\d{4}-\d{2},Total$/);
            expect(row).toContain("TSHIRT");
        });
    });

    describe("GET /api/app/product-issuance/rekap/export", () => {
        it("should return a CSV with the channel columns", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([{
                    id: 1, code: "TSHIRT", name: "T-Shirt", size_val: 40, unit_name: "pcs",
                    pt_name: "Apparel", offline: 10, online: 20, spin_wheel: 0,
                    garansi_out: 1, b2b: 5, total_qty: 36,
                }]);

            const res = await app.request("/api/app/product-issuance/rekap/export?month=3&year=2026", { method: "GET" });
            const text = await res.text();
            const [header, row] = text.trim().split("\n");

            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Disposition")).toContain("rekap-pengeluaran.csv");
            expect(header).toBe("No,Kode,Nama Produk,Tipe,Size,Offline,Online,Spin Wheel,Garansi Out,B2B,Total");
            expect(row).toBe("1,TSHIRT,T-Shirt,Apparel,40 pcs,10,20,0,1,5,36");
        });
    });
});
