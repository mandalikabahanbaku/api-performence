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

const BASE = "/api/app/forecasts";

// ─── Mock data helpers ─────────────────────────────────────────────────────────

const mockRawRow = {
    id: 1, product_id: 1, month: 1, year: 2026,
    base_forecast: "120.00", final_forecast: "110.00",
    trend: "UP", status: "DRAFT",
    forecast_percentage_id: 1, created_at: new Date(), updated_at: new Date(),
    p_id: 1, p_code: "EDP110", p_name: "EDP 110ml", p_dist_pct: "50.00",
    pt_id: 1, pt_name: "EDP", pt_slug: "edp",
    ps_id: 1, ps_size: 110,
    u_id: 1, u_name: "pcs", u_slug: "pcs",
    fp_id: 1, fp_month: 1, fp_year: 2026, fp_value: "20.00",
};

const mockProducts = [
    { id: 1, distribution_percentage: "50.00", product_type: { id: 1, name: "EDP",     slug: "edp"     }, size: { id: 1, size: 110 } },
    { id: 2, distribution_percentage: "50.00", product_type: { id: 2, name: "PERFUME", slug: "perfume" }, size: { id: 1, size: 110 } },
];

describe("ForecastRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── POST /run ────────────────────────────────────────────────────────────

    describe("POST /run", () => {
        it("should return 201 on successful forecast run", async () => {
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue(mockProducts);
            // @ts-ignore
            prisma.productIssuance.findMany.mockResolvedValue([
                { product_id: 1, quantity: "100" },
                { product_id: 2, quantity: "100" },
            ]);
            // @ts-ignore
            prisma.forecastPercentage.findMany.mockResolvedValue([
                { id: 1, month: 1, year: 2026, value: "20.00" },
            ]);
            // @ts-ignore
            prisma.$executeRaw.mockResolvedValue(2);

            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_month: 12, start_year: 2025, horizon: 1 }),
            });
            const body = await res.json();

            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
            expect(body.data).toHaveProperty("processed_records");
        });

        it("should apply default horizon=12 if not provided", async () => {
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue(mockProducts);
            // @ts-ignore
            prisma.productIssuance.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.forecastPercentage.findMany.mockResolvedValue([
                { id: 1, month: 1, year: 2026, value: "20.00" },
            ]);
            // @ts-ignore
            prisma.$executeRaw.mockResolvedValue(2);

            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_month: 12, start_year: 2025 }),
            });

            expect(res.status).toBe(201);
        });

        it("should return 400 if base_month is out of range", async () => {
            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_month: 13, start_year: 2025, horizon: 1 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 400 if horizon exceeds 12", async () => {
            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_month: 12, start_year: 2025, horizon: 13 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 400 if required fields missing", async () => {
            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ horizon: 3 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 404 if no active products found", async () => {
            // forecastPercentage must return data so the service proceeds to product check
            // @ts-ignore
            prisma.forecastPercentage.findMany.mockResolvedValue([
                { id: 1, month: 12, year: 2025, value: "20.00" },
            ]);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.productIssuance.findMany.mockResolvedValue([]);

            const res = await app.request(`${BASE}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_month: 12, start_year: 2025, horizon: 1 }),
            });
            const body = await res.json();

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
        });
    });

    // ─── GET / ────────────────────────────────────────────────────────────────

    describe("GET /", () => {
        it("should return 200 with forecast list", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([mockRawRow]);

            const res = await app.request(BASE, { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data).toHaveProperty("len");
            expect(body.data).toHaveProperty("data");
        });

        it("should return 200 with empty list when no records", async () => {
            // ForecastService.get() uses prisma.product.count (not $queryRaw) for the count check
            // @ts-ignore
            prisma.product.count.mockResolvedValueOnce(0);

            const res = await app.request(BASE, { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data.len).toBe(0);
            expect(body.data.data).toHaveLength(0);
        });

        it("should return 200 filtered by year and month", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request(`${BASE}?month=1&year=2026`, { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 filtered by status", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request(`${BASE}?status=FINALIZED`, { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 with pagination params", async () => {
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0 }]);

            const res = await app.request(`${BASE}?page=2&take=10`, { method: "GET" });
            expect(res.status).toBe(200);
        });

        it("should return 200 sorted by final_forecast desc", async () => {
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([mockRawRow]);

            const res = await app.request(`${BASE}?sortBy=final_forecast&sortOrder=desc`, { method: "GET" });
            expect(res.status).toBe(200);
        });
    });

    // ─── GET /:product_id ────────────────────────────────────────────────────

    describe("GET /:product_id", () => {
        it("should return 200 for existing forecast", async () => {
            // forecast.findUnique mock returns data for id≠999 (from setup.ts)
            const res = await app.request(`${BASE}/1?month=1&year=2026`, { method: "GET" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.product_id).toBe(1);
            expect(typeof body.data.base_forecast).toBe("number");
        });

        it("should return 404 if forecast not found", async () => {
            // product_id=999 returns null per setup.ts mock
            const res = await app.request(`${BASE}/999?month=1&year=2026`, { method: "GET" });
            expect(res.status).toBe(404);
        });

        it("should return 400 if month/year not provided", async () => {
            const res = await app.request(`${BASE}/1`, { method: "GET" });
            expect(res.status).toBe(400);
        });
    });

    // ─── PATCH /finalize ─────────────────────────────────────────────────────

    describe("PATCH /finalize", () => {
        it("should return 200 and count from updateMany", async () => {
            // @ts-ignore
            prisma.forecast.updateMany.mockResolvedValue({ count: 5 });

            const res = await app.request(`${BASE}/finalize`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: 1, year: 2026 }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.count).toBe(5);
        });

        it("should return 400 when updateMany returns count 0 (no DRAFT records)", async () => {
            // @ts-ignore
            prisma.forecast.updateMany.mockResolvedValue({ count: 0 });

            const res = await app.request(`${BASE}/finalize`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: 1, year: 2026 }),
            });
            expect(res.status).toBe(400);
        });

        it("should return 400 if month is out of range", async () => {
            const res = await app.request(`${BASE}/finalize`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: 13, year: 2026 }),
            });
            expect(res.status).toBe(400);
        });
    });

    // ─── DELETE /period ───────────────────────────────────────────────────────

    describe("DELETE /period", () => {
        it("should return 200 with count from deleteMany", async () => {
            // @ts-ignore
            prisma.forecast.deleteMany.mockResolvedValue({ count: 10 });

            const res = await app.request(`${BASE}/period`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: 1, year: 2026 }),
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.count).toBe(10);
        });

        it("should return 400 when deleteMany returns count 0", async () => {
            // @ts-ignore
            prisma.forecast.deleteMany.mockResolvedValue({ count: 0 });

            const res = await app.request(`${BASE}/period`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month: 1, year: 2026 }),
            });
            expect(res.status).toBe(400);
        });
    });

    // ─── DELETE /:id ──────────────────────────────────────────────────────────

    describe("DELETE /:id", () => {
        it("should return 200 on delete by id", async () => {
            // @ts-ignore
            prisma.forecast.delete.mockResolvedValue({ id: 1 });

            const res = await app.request(`${BASE}/1`, { method: "DELETE" });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
        });

        it("should return 404 if Prisma throws P2025 (record not found)", async () => {
            const p2025 = Object.assign(new Error("Record not found"), { code: "P2025" });
            // @ts-ignore
            prisma.forecast.delete.mockRejectedValue(p2025);

            const res = await app.request(`${BASE}/999`, { method: "DELETE" });
            expect(res.status).toBe(404);
        });
    });
});
