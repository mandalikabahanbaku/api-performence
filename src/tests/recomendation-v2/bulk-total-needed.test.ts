import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../config/prisma.js";
import { RecomendationV2Service } from "../../module/application/recomendation-v2/recomendation-v2.service.js";

vi.mock("../../config/prisma.js", () => ({
    default: {
        rawMaterialInventory: { findFirst: vi.fn().mockResolvedValue(null) },
        productInventory: { findFirst: vi.fn().mockResolvedValue(null) },
        materialPurchaseDraft: { update: vi.fn().mockResolvedValue({}) },
        $executeRaw: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn((operations) => Promise.all(operations)),
    },
}));

describe("bulk Total Need", () => {
    afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

    it("persists overridden totals for unlocked sales and only selected materials", async () => {
        const row = {
            material_id: 1, uses_locked_sales: false, work_order_horizon: 4,
            total_needed_horizon: 5100, recommendation_quantity: 4002,
            current_stock: 2136, safety_stock_x_resep: 1038, stock_fg_x_resep: 0,
        };
        vi.spyOn(RecomendationV2Service, "list").mockResolvedValue({
            data: [row, { ...row, material_id: 2 }], len: 2, periods: {},
        } as any);
        await RecomendationV2Service.bulkSaveHorizon({
            month: 10, year: 2026, horizon: 4, type: "ffo", ids: [1],
        });
        expect(prisma.materialPurchaseDraft.update).toHaveBeenCalledExactlyOnceWith({
            where: { raw_mat_id_month_year: { raw_mat_id: 1, month: 10, year: 2026 } },
            data: {
                total_needed: 5100, quantity: 4002, current_stock: 2136,
                stock_fg_x_resep: 0, safety_stock_x_resep: 1038,
                updated_at: expect.any(Date),
            },
        });
    });
});
