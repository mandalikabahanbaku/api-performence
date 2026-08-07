import { describe, it, expect } from "vitest";
import { runForecastEngine } from "../../module/application/forecast/engines.js";

describe("runForecastEngine - SIMPLE_MOVING_AVERAGE (MA3)", () => {
    it("averages last 3 values of history for forecast", () => {
        const history = [10, 20, 30, 40, 50]; // last 3 → 30,40,50 → avg 40
        const result = runForecastEngine("SIMPLE_MOVING_AVERAGE", history, 3);

        expect(result.modelActuallyUsed).toBe("SIMPLE_MOVING_AVERAGE");
        expect(result.forecasted).toEqual([40, 40, 40]);
    });

    it("uses whole series when length < 3", () => {
        const history = [10, 20]; // avg 15
        const result = runForecastEngine("SIMPLE_MOVING_AVERAGE", history, 2);

        expect(result.forecasted).toEqual([15, 15]);
    });

    it("returns zeros when history is empty", () => {
        const result = runForecastEngine("SIMPLE_MOVING_AVERAGE", [], 4);

        expect(result.forecasted).toEqual([0, 0, 0, 0]);
        expect(result.mae).toBe(0);
        expect(result.errors).toEqual([]);
    });

    it("computes MAE against the constant MA3 fit", () => {
        const history = [10, 20, 30]; // avg 20 → errors: 10,0,10 → mae 6.67
        const result = runForecastEngine("SIMPLE_MOVING_AVERAGE", history, 1);

        expect(result.errors).toEqual([10, 0, 10]);
        expect(result.mae).toBeCloseTo(20 / 3, 5);
    });

    it("ignores values older than the 3-period window", () => {
        const withOldOutlier = runForecastEngine("SIMPLE_MOVING_AVERAGE", [1000, 10, 20, 30], 1);
        const withoutOldOutlier = runForecastEngine("SIMPLE_MOVING_AVERAGE", [10, 20, 30], 1);

        expect(withOldOutlier.forecasted).toEqual(withoutOldOutlier.forecasted);
    });
});
