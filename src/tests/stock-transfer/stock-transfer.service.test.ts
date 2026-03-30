import { describe, it, expect, vi, beforeEach } from "vitest";
import { StockTransferService } from "../../module/application/stock-transfer/stock-transfer.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";
import { TransferLocationType, TransferStatus } from "../../generated/prisma/enums.js";

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
    items: [
        { id: 100, product_id: 1, quantity_requested: 50, quantity_packed: 0, quantity_fulfilled: 0 }
    ]
};

describe("StockTransferService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default transaction mock to bypass actual database
        // @ts-ignore
        prisma.$transaction.mockImplementation(async (callback) => {
            if (Array.isArray(callback)) {
                return Promise.all(callback);
            }
            return callback(prisma);
        });
    });

    describe("create", () => {
        it("should create a new transfer successfully", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(null); // Barcode unique
            // @ts-ignore
            prisma.stockTransfer.create.mockResolvedValue(mockTransfer);

            const payload = {
                barcode: "TESTBC1",
                from_type: TransferLocationType.WAREHOUSE,
                from_warehouse_id: 10,
                to_type: TransferLocationType.OUTLET,
                to_outlet_id: 5,
                items: [{ product_id: 1, quantity_requested: 50 }]
            };

            const result = await StockTransferService.create(payload as any);
            expect(result).toBeDefined();
            expect(result.id).toBe(1);
        });

        it("should throw error if barcode exists", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(mockTransfer);

            await expect(StockTransferService.create({ barcode: "TESTBC1", items: [] } as any)).rejects.toThrow(ApiError);
        });
    });

    describe("updateStatus", () => {
        it("should throw error if transfer not found", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(null);
            await expect(StockTransferService.updateStatus(1, { status: TransferStatus.APPROVED } as any)).rejects.toThrow(ApiError);
        });

        it("should approve transfer", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(mockTransfer);
            // @ts-ignore
            prisma.stockTransfer.update.mockResolvedValue({ ...mockTransfer, status: TransferStatus.APPROVED });

            const result = await StockTransferService.updateStatus(1, { status: TransferStatus.APPROVED } as any);
            expect(result.status).toBe(TransferStatus.APPROVED);
        });

        it("should handle shipment and deduct warehouse inventory", async () => {
            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(mockTransfer);
            // @ts-ignore
            prisma.stockTransferItem.update.mockResolvedValue(true);
            // @ts-ignore
            prisma.productInventory.findFirst.mockResolvedValue({ id: 99, quantity: 100 });
            // @ts-ignore
            prisma.productInventory.update.mockResolvedValue(true);
            // @ts-ignore
            prisma.stockMovement.create.mockResolvedValue(true);
            // @ts-ignore
            prisma.stockTransfer.update.mockResolvedValue({ ...mockTransfer, status: TransferStatus.SHIPMENT });

            const payload = {
                status: TransferStatus.SHIPMENT,
                items: [{ id: 100, quantity_packed: 50 }]
            };

            const result = await StockTransferService.updateStatus(1, payload as any);
            
            expect(result.status).toBe(TransferStatus.SHIPMENT);
            // @ts-ignore
            expect(prisma.productInventory.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { quantity: 50 } })
            );
            // @ts-ignore
            expect(prisma.stockMovement.create).toHaveBeenCalled();
        });

        it("should handle fulfillment and add to outlet inventory", async () => {
            const shipTransfer = { ...mockTransfer, status: TransferStatus.SHIPMENT };
            shipTransfer.items[0]!.quantity_packed = 50;

            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(shipTransfer);
            // @ts-ignore
            prisma.stockTransferItem.update.mockResolvedValue(true);
            // @ts-ignore
            prisma.outletInventory.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.outletInventory.create.mockResolvedValue(true);
            // @ts-ignore
            prisma.stockMovement.create.mockResolvedValue(true);
            // @ts-ignore
            prisma.stockTransfer.update.mockResolvedValue({ ...shipTransfer, status: TransferStatus.COMPLETED });

            const payload = {
                status: TransferStatus.FULFILLMENT,
                items: [{ id: 100, quantity_fulfilled: 50 }]
            };

            const result = await StockTransferService.updateStatus(1, payload as any);
            expect(result.status).toBe(TransferStatus.COMPLETED);
            
            // @ts-ignore
            expect(prisma.outletInventory.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: { outlet_id: 5, product_id: 1, quantity: 50 } })
            );
        });

        it("should mark status as PARTIAL if fulfilled != packed but not entirely missing/rejected", async () => {
            const shipTransfer = { ...mockTransfer, status: TransferStatus.SHIPMENT };
            shipTransfer.items[0]!.quantity_packed = 50;

            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(shipTransfer);
            // @ts-ignore
            prisma.stockTransfer.update.mockImplementation((args: any) => ({ ...shipTransfer, ...args.data }));

            const payload = {
                status: TransferStatus.FULFILLMENT,
                items: [{ id: 100, quantity_fulfilled: 30, quantity_missing: 20 }]
            };

            const result = await StockTransferService.updateStatus(1, payload as any);
            expect(result.status).toBe(TransferStatus.PARTIAL);
        });

        it("should error if missing + rejected + fulfilled != packed", async () => {
            const shipTransfer = { ...mockTransfer, status: TransferStatus.SHIPMENT };
            shipTransfer.items[0]!.quantity_packed = 50;

            // @ts-ignore
            prisma.stockTransfer.findUnique.mockResolvedValue(shipTransfer);

            const payload = {
                status: TransferStatus.FULFILLMENT,
                items: [{ id: 100, quantity_fulfilled: 30, quantity_missing: 10 }] // Total 40 vs 50 packed
            };

            await expect(StockTransferService.updateStatus(1, payload as any)).rejects.toThrow(ApiError);
        });
    });
});
