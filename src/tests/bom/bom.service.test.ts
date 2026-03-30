import { describe, it, expect, vi } from "vitest";
import { BOMService } from "../../module/application/bom/bom.service.js";
import prisma from "../../config/prisma.js";

// Mock implementation for $queryRaw specifically for BOM list
const mockBOMRows = [
    {
        p_id: 1,
        p_code: "P001",
        p_name: "Test Product",
        pt_name: "EDP",
        p_gender: "UNISEX",
        ps_val: 100,
        u_name: "PCS",
        rm_id: 10,
        rm_barcode: "FO-001",
        rm_name: "Fragrance Oil Test",
        recipe_qty: 0.5,
        urm_name: "ML",
        rm_current_stock: 500,
        id: 100 // recipe id
    }
];

describe("BOMService", () => {
    it("should list grouped BOM data correctly", async () => {
        // Mock $queryRaw in order of service calls: 
        // 1. productsPage
        // 2. rows
        // 3. countRes
        const qRaw = prisma.$queryRaw as any;
        qRaw.mockResolvedValueOnce([{ id: 1, total_forecast: 100 }]); // productsPage
        qRaw.mockResolvedValueOnce(mockBOMRows); // rows
        qRaw.mockResolvedValueOnce([{ total: 1n }]); // countRes

        // Mock findMany for sales, forecast, and safety stock
        (prisma.productIssuance.findMany as any).mockResolvedValue([]);
        (prisma.forecast.findMany as any).mockResolvedValue([
            { product_id: 1, month: 4, year: 2026, final_forecast: 100 }
        ]);
        (prisma.safetyStock.findMany as any).mockResolvedValue([
            { product_id: 1, month: 3, year: 2026, safety_stock_quantity: 50 }
        ]);

        const result = await BOMService.list({ page: 1, take: 10 });

        expect(result).toBeDefined();
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.product.name).toBe("Test Product");
        expect(result.data[0]!.items).toHaveLength(1);
        
        // FO Logic check: 100 forecast * 100 size * 0.5 qty = 5000
        const needsBuyValue = result.data[0]!.items[0]!.needs_to_buy.find((n: any) => n.month === 4)?.value;
        expect(needsBuyValue).toBe(5000);

        expect(result.len).toBe(1);
    });

    it("should handle product without safety stock in DB", async () => {
        const qRaw = prisma.$queryRaw as any;
        qRaw.mockResolvedValueOnce([{ id: 1, total_forecast: 0 }]);
        qRaw.mockResolvedValueOnce(mockBOMRows);
        qRaw.mockResolvedValueOnce([{ total: 1n }]);

        (prisma.productIssuance.findMany as any).mockResolvedValue([]);
        (prisma.forecast.findMany as any).mockResolvedValue([]);
        (prisma.safetyStock.findMany as any).mockResolvedValue([]);

        const result = await BOMService.list({ page: 1, take: 10 });

        expect(result.data[0]!.safety_stock).toBe(0);
    });
});
