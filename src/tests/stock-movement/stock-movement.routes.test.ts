import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";
import { MovementEntityType, MovementLocationType, MovementType, MovementRefType } from "../../generated/prisma/enums.js";

vi.mock("../../config/redis.js", () => {
    const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        hgetall: vi.fn().mockResolvedValue({ email: "test@example.com", role: "SUPER_ADMIN" }),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("hash"),
        expire: vi.fn().mockResolvedValue(true)
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

const mockMovement = {
    id: 1,
    entity_type: MovementEntityType.PRODUCT,
    entity_id: 10,
    location_type: MovementLocationType.WAREHOUSE,
    location_id: 5,
    movement_type: MovementType.TRANSFER_OUT,
    quantity: 50,
    qty_before: 100,
    qty_after: 50,
    reference_id: 1,
    reference_type: MovementRefType.STOCK_TRANSFER,
    notes: "Test movement",
    created_by: "system",
    created_at: new Date(),
};

describe("StockMovementRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /api/app/stock-movements", () => {
        it("should return 200 with list of movements", async () => {
            // @ts-ignore
            prisma.stockMovement.findMany.mockResolvedValue([mockMovement]);
            // @ts-ignore
            prisma.stockMovement.count.mockResolvedValue(1);

            const res = await app.request("/api/app/stock-movements", { method: "GET" });
            const body = (await res.json()) as any;
            if(res.status !== 200) console.log("ERROR BODY:", JSON.stringify(body));

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.data).toHaveLength(1);
            expect(body.data.data[0].id).toBe(1);
        });

        it("should filter by location_type", async () => {
            // @ts-ignore
            prisma.stockMovement.findMany.mockResolvedValue([mockMovement]);
            // @ts-ignore
            prisma.stockMovement.count.mockResolvedValue(1);

            const res = await app.request("/api/app/stock-movements?location_type=WAREHOUSE", { method: "GET" });
            const body = (await res.json()) as any;

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            
            // @ts-ignore
            expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ location_type: "WAREHOUSE" })
                })
            );
        });
    });

    describe("GET /api/app/stock-movements/:id", () => {
        it("should return detailed movement", async () => {
            // @ts-ignore
            prisma.stockMovement.findUnique.mockResolvedValue(mockMovement);

            const res = await app.request("/api/app/stock-movements/1", { method: "GET" });
            const body = (await res.json()) as any;

            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.id).toBe(1);
        });

        it("should return 404 for missing movement", async () => {
            // @ts-ignore
            prisma.stockMovement.findUnique.mockResolvedValue(null);

            const res = await app.request("/api/app/stock-movements/999", { method: "GET" });
            expect(res.status).toBe(404);
        });
    });
});
