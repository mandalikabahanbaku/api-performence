import { describe, expect, it } from "vitest";
import { forecastLockedMaterialSales } from "../../module/application/recomendation-v2/recomendation-v2.service.js";

describe("forecastLockedMaterialSales", () => {
    it("uses locked snapshots together with live sales from unlocked periods", () => {
        const forecast = forecastLockedMaterialSales(
            [
                { quantity: 224, override_sales: 224, locked: true },
                { quantity: 265, override_sales: 265, locked: true },
                { quantity: 1999, override_sales: null, locked: false },
            ],
            3,
        );

        expect(forecast).toEqual([1125, 1125, 1125]);
    });

    it("returns null when the material has no locked sales", () => {
        const forecast = forecastLockedMaterialSales(
            [{ quantity: 1999, override_sales: null, locked: false }],
            3,
        );

        expect(forecast).toBeNull();
    });
});
