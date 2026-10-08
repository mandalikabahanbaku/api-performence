import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../config/prisma.js";
import { RecomendationV2Service } from "../../module/application/recomendation-v2/recomendation-v2.service.js";

// Covers SQL construction and response mapping with a mocked database.
describe("Need Buy overrides across recommendation types", () => {
    afterEach(() => vi.restoreAllMocks());
    it.each(["ffo", "lokal", "impor"] as const)("retains overrides without forecasts for %s", async (type) => {
        const raw = vi.spyOn(prisma, "$queryRaw")
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                material_id: 1, ranking: 1, current_stock: 0, open_po: 0,
                stock_fg_x_resep: 0, safety_stock_x_resep: 0,
                forecast_needed: 0, total_forecast_horizon_dynamic: 75,
                recommendation_quantity: 75,
                needs_data: [{ month: 12, year: 2026, needs: 0, override_needs: 75 },
                    { month: 1, year: 2027, needs: 50, override_needs: 0 }],
                sales_data: [], po_data: [], work_order_data: { horizon: 2 },
            }])
            .mockResolvedValueOnce([{ count: 1 }]);
        const result = await RecomendationV2Service.list({
            type, month: 12, year: 2026, page: 1, take: 50,
            forecast_months: 2, po_months: 2,
        });
        expect(result.data[0]!.needs?.slice(0, 2).map(n => n.override_needs)).toEqual([75, 0]);
        expect(result.data[0]!.total_needed_horizon).toBe(75);
        expect(result.data[0]!.recommendation_quantity).toBe(75);
        const sql = (raw.mock.calls[1]![0] as unknown as TemplateStringsArray).join(" ");
        expect(sql.replace(/--[^\n]*/g, "").match(/FULL JOIN/g)).toHaveLength(3);
        expect(sql).toContain("COALESCE(mr.month, o.month)");
        expect(sql).toContain("rec.raw_mat_id = fm.id AND rec.is_active = true");
        expect(sql).toContain("COALESCE(pi_h.total_qty, 0)");
        expect(sql).not.toContain("po.status != 'RECEIVED'");
        expect(sql.match(/po.status NOT IN \('RECEIVED', 'CANCELLED'\)/g)).toHaveLength(2);
    });
    it("calculates locked sales for the full horizon even when only one month is visible", async () => {
        vi.spyOn(prisma, "$queryRaw")
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                material_id: 1, ranking: 1, current_stock: 10, open_po: 5,
                stock_fg_x_resep: 0, safety_stock_x_resep: 20,
                forecast_needed: 0, total_forecast_horizon_dynamic: 999,
                recommendation_quantity: 999,
                needs_data: [{ month: 12, year: 2026, override_needs: 75 },
                    { month: 1, year: 2027, override_needs: 25 }],
                sales_data: [{ month: 11, year: 2026, sales: 100, override_sales: 100, locked: true }],
                po_data: [], work_order_data: { horizon: 2, quantity: 0 },
            }])
            .mockResolvedValueOnce([{ count: 1 }]);
        const result = await RecomendationV2Service.list({
            type: "ffo", month: 12, year: 2026, page: 1, take: 50,
            forecast_months: 1, po_months: 2,
        });
        expect(result.data[0]!.needs).toHaveLength(12);
        expect(result.data[0]!.total_needed_horizon).toBe(100);
        expect(result.data[0]!.recommendation_quantity).toBe(105);
        expect(result.data[0]!.work_order_quantity).toBe(0);
    });

    it.each([{ horizon: 3, total: 3800, buy: 2702 }, { horizon: 4, total: 5100, buy: 4002 }])("uses exactly $horizon months: total $total, buy $buy", async ({ horizon, total, buy }) => {
        vi.spyOn(prisma, "$queryRaw")
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                material_id: 1, ranking: 1, current_stock: 2136, open_po: 0,
                stock_fg_x_resep: 0, safety_stock_x_resep: 1038,
                forecast_needed: 0, total_forecast_horizon_dynamic: 9050,
                recommendation_quantity: 7952,
                needs_data: [1200, 1200, 1400, 1300].map((quantity, index) => ({
                    month: index < 3 ? 10 + index : 1,
                    year: index < 3 ? 2026 : 2027,
                    needs: 9999, override_needs: quantity,
                })),
                sales_data: [], po_data: [], work_order_data: { horizon },
            }])
            .mockResolvedValueOnce([{ count: 1 }]);
        const result = await RecomendationV2Service.list({
            type: "ffo", month: 10, year: 2026, page: 1, take: 50,
            forecast_months: 4, po_months: 2,
        });
        expect(result.data[0]!.total_needed_horizon).toBe(total);
        expect(result.data[0]!.recommendation_quantity).toBe(buy);
    });

    it.each([
        { horizon: null, stock: 10, override: 75, total: 0 },
        { horizon: 1, stock: 100, override: 75, total: 75 },
        { horizon: 1, stock: 0, override: 0, total: 0 },
    ])("handles missing horizon, sufficient stock and zero override: %j", async ({ horizon, stock, override, total }) => {
        vi.spyOn(prisma, "$queryRaw")
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                material_id: 1, ranking: 1, current_stock: stock, open_po: 0,
                stock_fg_x_resep: 0, safety_stock_x_resep: 0,
                forecast_needed: 999, total_forecast_horizon_dynamic: 999,
                recommendation_quantity: 999,
                needs_data: [{ month: 10, year: 2026, needs: 999, override_needs: override }],
                sales_data: [], po_data: [], work_order_data: { horizon },
            }])
            .mockResolvedValueOnce([{ count: 1 }]);
        const result = await RecomendationV2Service.list({
            type: "ffo", month: 10, year: 2026, page: 1, take: 50,
            forecast_months: 4, po_months: 2,
        });
        expect(result.data[0]!.total_needed_horizon).toBe(total);
        expect(result.data[0]!.recommendation_quantity).toBe(0);
    });

});
