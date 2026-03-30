import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductStockService } from "../../module/application/product/stock/product.stock.service.js";
import { ProductStockImportService } from "../../module/application/product/stock/import/import.service.js";
import prisma from "../../config/prisma.js";
import { ProductStockImportCacheService } from "../../module/application/product/stock/import/import.cache.js";

vi.mock("../../module/application/product/stock/import/import.cache.js", () => ({
    ProductStockImportCacheService: {
        save: vi.fn().mockResolvedValue(true),
        get: vi.fn(),
        remove: vi.fn().mockResolvedValue(true),
    },
}));

describe("ProductStockService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("listProductStock", () => {
        it("should return list of product stocks", async () => {
            const mockProducts = [
                {
                    code: "P001",
                    name: "Product 1",
                    type: "Apparel",
                    size: 40,
                    gender: "MEN",
                    uom: "pcs",
                    amount: "100",
                },
            ];

            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ total: 1n }]); // count
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce(mockProducts); // data

            const result = await ProductStockService.listProductStock({
                page: 1,
                take: 10,
                month: 1,
                year: 2024,
            });

            expect(result.data).toHaveLength(1);
            expect(result.data).toBeDefined();
            expect(result.data[0]?.amount).toBe(100);
            expect(result.len).toBe(1);
        });
    });
});

describe("ProductStockImportService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("preview", () => {
        it("should parse rows and return preview result", async () => {
            const rows = [
                { "PRODUCT CODE": "P001", "CURRENT STOCK": "100" },
                { "PRODUCT CODE": "INVALID", "CURRENT STOCK": "abc" },
            ];

            // @ts-ignore
            prisma.product.findMany.mockResolvedValue([{ id: 1, code: "P001" }]);

            const result = await ProductStockImportService.preview(rows);

            expect(result.total).toBe(2);
            expect(result.valid).toBe(1);
            expect(result.invalid).toBe(1);
            expect(ProductStockImportCacheService.save).toHaveBeenCalled();
        });
    });

    describe("execute", () => {
        it("should bulk insert valid rows and clear cache", async () => {
            const importId = "test-id";
            const mockCache = {
                status: "preview",
                rows: [{ code: "P001", product_id: 1, amount: 100, errors: [] }],
            };

            // @ts-ignore
            ProductStockImportCacheService.get.mockResolvedValue(mockCache);
            // @ts-ignore
            prisma.$executeRaw.mockResolvedValue(1);

            const result = await ProductStockImportService.execute(importId, 1, 1, 2024);

            expect(result.total).toBe(1);
            expect(prisma.$executeRaw).toHaveBeenCalled();
            expect(ProductStockImportCacheService.remove).toHaveBeenCalledWith(importId);
        });

        it("should throw error if session not found", async () => {
            // @ts-ignore
            ProductStockImportCacheService.get.mockResolvedValue(null);

            await expect(ProductStockImportService.execute("invalid", 1, 1, 2024)).rejects.toThrow(
                "Import session expired or not found",
            );
        });
    });
});
