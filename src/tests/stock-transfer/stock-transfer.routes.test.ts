import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";
import { TransferLocationType, TransferStatus } from "../../generated/prisma/enums.js";

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

const mockTransfer = {
    id: 1,
    transfer_number: "TRF-TEST-0001",
    barcode: "TESTBC1",
    from_type: TransferLocationType.WAREHOUSE,
    from_warehouse_id: 10,
    from_outlet_id: null,
    to_type: TransferLocationType.OUTLET,
    to_warehouse_id: null,
    to_outlet_id: 5,
    status: TransferStatus.PENDING,
    notes: "test",
    created_by: "system",
    created_at: new Date(),
    updated_at: new Date(),
    items: [
        { id: 100, product_id: 1, quantity_requested: 50, quantity_packed: null, quantity_fulfilled: null }
    ]
};

describe("StockTransferRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // @ts-ignore
        prisma.$transaction.mockImplementation(async (callback) => {
            if (Array.isArray(callback)) {
                return Promise.all(callback);
            }
            return callback(prisma);
        });
    });

    describe("POST /api/app/stock-transfers", () => {
        it("should return 201 on success", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.stockTransfer.create.mockResolvedValue(mockTransfer);

            const payload = {
                barcode: "TESTBC1",
                from_type: "WAREHOUSE",
                from_warehouse_id: 10,
                to_type: "OUTLET",
                to_outlet_id: 5,
                items: [{ product_id: 1, quantity_requested: 50 }]
            };

            const res = await app.request("/api/app/stock-transfers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const body = (await res.json()) as any;
            if(res.status !== 201) console.log("ERROR BODY POST:", JSON.stringify(body));
            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
            expect(body.data.id).toBe(1);
        });

        it("should return 400 for validation failure (missing warehouse_id)", async () => {
            const payload = {
                barcode: "TESTBC1",
                from_type: "WAREHOUSE", // Expects from_warehouse_id
                to_type: "OUTLET",
                to_outlet_id: 5,
                items: [{ product_id: 1, quantity_requested: 50 }]
            };

            const res = await app.request("/api/app/stock-transfers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            expect(res.status).toBe(400); // Validation failure
        });
    });

    describe("GET /api/app/stock-transfers", () => {
        it("should return list", async () => {
            // @ts-ignore
            prisma.stockTransfer.findMany.mockResolvedValue([mockTransfer]);
            // @ts-ignore
            prisma.stockTransfer.count.mockResolvedValue(1);

            const res = await app.request("/api/app/stock-transfers?status=PENDING", { method: "GET" });
            const body = (await res.json()) as any;
            if(res.status !== 200) console.log("ERROR BODY GET:", JSON.stringify(body));
            
            expect(res.status).toBe(200);
            expect(body.data.data).toHaveLength(1);
        });
    });

    describe("GET /api/app/stock-transfers/:id", () => {
        it("should return detail", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(mockTransfer);

            const res = await app.request("/api/app/stock-transfers/1", { method: "GET" });
            const body = (await res.json()) as any;
            
            expect(res.status).toBe(200);
            expect(body.data.id).toBe(1);
        });
    });

    describe("PATCH /api/app/stock-transfers/:id/status", () => {
        it("should update status", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(mockTransfer);
            // @ts-ignore
            prisma.stockTransfer.update.mockResolvedValue({ ...mockTransfer, status: TransferStatus.APPROVED });

            const payload = { status: "APPROVED" };

            const res = await app.request("/api/app/stock-transfers/1/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const body = (await res.json()) as any;
            expect(res.status).toBe(200);
            expect(body.data.status).toBe("APPROVED");
        });
    });
});
