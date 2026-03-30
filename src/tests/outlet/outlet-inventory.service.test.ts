import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutletInventoryService } from "../../module/application/outlet/inventory/outlet-inventory.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

const mockOutlet = {
    id: 1,
    name: "Toko Utama",
    code: "TOKO001",
    deleted_at: null,
};

const mockInventory = {
    id: 1,
    outlet_id: 1,
    product_id: 1,
    quantity: "10.00",
    min_stock: "5.00",
    updated_at: new Date(),
    product: { id: 1, name: "T-Shirt", code: "TSHIRT" },
};

describe("OutletInventoryService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── getStock ─────────────────────────────────────────────────────────────

    describe("getStock", () => {
        it("should throw 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            await expect(OutletInventoryService.getStock(999, 1)).rejects.toThrow("Outlet tidak ditemukan");
        });

        it("should throw 404 if inventory entry not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);

            await expect(OutletInventoryService.getStock(1, 999)).rejects.toThrow("Stok produk tidak ditemukan");
        });

        it("should return inventory with is_low_stock=false when qty >= min_stock", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "10.00", min_stock: "5.00" });

            const result = await OutletInventoryService.getStock(1, 1);

            expect(result.is_low_stock).toBe(false);
            expect(Number(result.quantity)).toBe(10);
        });

        it("should return inventory with is_low_stock=true when qty < min_stock", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "2.00", min_stock: "5.00" });

            const result = await OutletInventoryService.getStock(1, 1);

            expect(result.is_low_stock).toBe(true);
        });

        it("should return is_low_stock=false when min_stock is null", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "0.00", min_stock: null });

            const result = await OutletInventoryService.getStock(1, 1);

            expect(result.is_low_stock).toBe(false);
        });
    });

    // ─── listStock ────────────────────────────────────────────────────────────

    describe("listStock", () => {
        const defaultQuery = { sortBy: "updated_at" as const, sortOrder: "asc" as const };

        it("should throw 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            await expect(OutletInventoryService.listStock(999, defaultQuery)).rejects.toThrow("Outlet tidak ditemukan");
        });

        it("should return paginated list", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([mockInventory]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(1);

            const result = await OutletInventoryService.listStock(1, defaultQuery);

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
        });

        it("should include is_low_stock flag on each item", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([
                { ...mockInventory, quantity: "2.00", min_stock: "5.00" },
            ]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(1);

            const result = await OutletInventoryService.listStock(1, defaultQuery);

            expect(result.data[0]!.is_low_stock).toBe(true);
        });

        it("should filter low_stock=true in memory", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([
                { ...mockInventory, product_id: 1, quantity: "2.00", min_stock: "5.00" },
                { ...mockInventory, product_id: 2, quantity: "10.00", min_stock: "5.00" },
            ]);

            const result = await OutletInventoryService.listStock(1, { ...defaultQuery, low_stock: "true" });

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
        });

        it("should return empty list when no inventories", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outletInventory.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.outletInventory.count.mockResolvedValue(0);

            const result = await OutletInventoryService.listStock(1, defaultQuery);

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });
    });

    // ─── initProducts ─────────────────────────────────────────────────────────

    describe("initProducts", () => {
        it("should throw 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            await expect(
                OutletInventoryService.initProducts(999, { product_ids: [1, 2] }),
            ).rejects.toThrow("Outlet tidak ditemukan");
        });

        it("should throw 404 if any product not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1 }]); // only 1 of 2 found

            await expect(
                OutletInventoryService.initProducts(1, { product_ids: [1, 999] }),
            ).rejects.toThrow("Satu atau lebih produk tidak ditemukan");
        });

        it("should createMany with skipDuplicates and return counts", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            // @ts-ignore
            prisma.outletInventory.createMany.mockResolvedValue({ count: 2 });

            const result = await OutletInventoryService.initProducts(1, { product_ids: [1, 2] });

            expect(result.initialized).toBe(2);
            expect(result.total).toBe(2);
            // @ts-ignore
            expect(prisma.outletInventory.createMany).toHaveBeenCalledWith(
                expect.objectContaining({ skipDuplicates: true }),
            );
        });

        it("should return initialized < total when some already exist (skipDuplicates)", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
            // @ts-ignore
            prisma.outletInventory.createMany.mockResolvedValue({ count: 1 }); // 1 skipped duplicate

            const result = await OutletInventoryService.initProducts(1, { product_ids: [1, 2] });

            expect(result.initialized).toBe(1);
            expect(result.total).toBe(2);
        });
    });

    // ─── setMinStock ──────────────────────────────────────────────────────────

    describe("setMinStock", () => {
        it("should throw 404 if inventory entry not found", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);

            await expect(
                OutletInventoryService.setMinStock(1, 999, { min_stock: 10 }),
            ).rejects.toThrow("Stok produk tidak ditemukan");
        });

        it("should update min_stock successfully", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(mockInventory);
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({ ...mockInventory, min_stock: "20.00" });

            const result = await OutletInventoryService.setMinStock(1, 1, { min_stock: 20 });

            expect(Number(result.min_stock)).toBe(20);
            // @ts-ignore
            expect(prisma.outletInventory.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { min_stock: 20 } }),
            );
        });

        it("should allow setting min_stock to 0", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(mockInventory);
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({ ...mockInventory, min_stock: "0.00" });

            const result = await OutletInventoryService.setMinStock(1, 1, { min_stock: 0 });

            // @ts-ignore
            expect(prisma.outletInventory.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { min_stock: 0 } }),
            );
        });
    });

    // ─── adjustQuantity ───────────────────────────────────────────────────────

    describe("adjustQuantity", () => {
        it("should throw 404 if inventory not found", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);

            await expect(OutletInventoryService.adjustQuantity(1, 999, 5)).rejects.toThrow(
                "Stok produk tidak ditemukan",
            );
        });

        it("should add positive delta (stock in)", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "10.00" });
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({});

            const result = await OutletInventoryService.adjustQuantity(1, 1, 5);

            expect(result.qty_before).toBe(10);
            expect(result.qty_after).toBe(15);
        });

        it("should subtract negative delta (stock out)", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "10.00" });
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({});

            const result = await OutletInventoryService.adjustQuantity(1, 1, -3);

            expect(result.qty_before).toBe(10);
            expect(result.qty_after).toBe(7);
        });

        it("should throw 422 if resulting quantity would be negative", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "2.00" });

            await expect(OutletInventoryService.adjustQuantity(1, 1, -5)).rejects.toThrow(ApiError);
            await expect(OutletInventoryService.adjustQuantity(1, 1, -5)).rejects.toThrow(
                "Stok tidak mencukupi",
            );
        });

        it("should allow adjustment resulting in exactly 0", async () => {
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue({ ...mockInventory, quantity: "5.00" });
            // @ts-ignore
            prisma.outletInventory.update.mockResolvedValue({});

            const result = await OutletInventoryService.adjustQuantity(1, 1, -5);

            expect(result.qty_after).toBe(0);
        });
    });
});
