/**
 * Forecast Engine implementations.
 * Each function receives ordered historical data (oldest → newest)
 * and returns an array of `horizon` projected values (also oldest → newest).
 */

// ─── Linear Regression ────────────────────────────────────────────────────────

/** Fit OLS line to historical data. xs are implicit 1-indexed integers. */
export function linearRegression(ys: number[]): { slope: number; intercept: number } {
    const n = ys.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: ys[0]! };

    // Closed-form OLS using arithmetic-sum identities for xs = 1..n
    const sumX  = (n * (n + 1)) / 2;
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
    const sumY  = ys.reduce((a, b) => a + b, 0);
    const sumXY = ys.reduce((acc, y, i) => acc + (i + 1) * y, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };

    const slope     = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

function runLinearRegression(series: number[], horizon: number): number[] {
    const n = series.length;
    const { slope, intercept } = linearRegression(series);
    return Array.from({ length: horizon }, (_, i) =>
        Math.max(0, intercept + slope * (n + i + 1)),
    );
}

// ─── Simple Moving Average ────────────────────────────────────────────────────

function runSMA(series: number[], horizon: number, window = 3): number[] {
    const slice = series.slice(-window);
    const avg   = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    return Array.from({ length: horizon }, () => avg);
}

// ─── Exponential Smoothing (Holt's Double / Holt-Linear) ─────────────────────

/**
 * Double exponential smoothing with level + trend.
 * Source: /Users/mandalika/Documents/PERFORMENCE/template/forecast/engine/holt.ts
 */
function runHoltLinear(
    series: number[],
    horizon: number,
    alpha = 0.3,
    beta  = 0.1,
): number[] {
    if (series.length === 0) return Array(horizon).fill(0);
    if (series.length === 1) return Array(horizon).fill(series[0]);

    let level = series[0]!;
    let trend = (series[1] ?? 0) - (series[0] ?? 0);

    for (let i = 1; i < series.length; i++) {
        const prevLevel = level;
        level = alpha * (series[i] ?? 0) + (1 - alpha) * (level + trend);
        trend = beta  * (level - prevLevel) + (1 - beta) * trend;
    }

    return Array.from({ length: horizon }, (_, i) =>
        Math.max(0, level + (i + 1) * trend),
    );
}

// ─── Holt-Winters Additive ────────────────────────────────────────────────────

/**
 * Triple exponential smoothing with level + trend + additive seasonality.
 * Requires series.length >= seasonLength (default 12).
 * Source: /Users/mandalika/Documents/PERFORMENCE/template/forecast/engine/holt.ts
 */
function runHoltWintersAdditive(
    series: number[],
    horizon: number,
    seasonLength = 12,
    alpha = 0.2,
    beta  = 0.1,
    gamma = 0.1,
): number[] {
    if (series.length < seasonLength) {
        // Not enough data for a full seasonal cycle — fallback to Holt-Linear
        return runHoltLinear(series, horizon, alpha, beta);
    }

    // Initialise level
    let l: number = series[0]!;

    // Initialise trend: mean of per-period changes across first season
    let t = 0;
    for (let i = 0; i < seasonLength; i++) {
        t += (Number(series[i + seasonLength] ?? series[i]) - Number(series[i])) / seasonLength;
    }

    // Initialise seasonal components
    const s: number[] = series.slice(0, seasonLength).map((v) => Number(v) - l);

    // Smoothing update loop
    for (let i = 0; i < series.length; i++) {
        const idx       = i % seasonLength;
        const prevLevel = l;
        l = alpha * (Number(series[i]) - s[idx]!) + (1 - alpha) * (l + t);
        t = beta  * (l - prevLevel) + (1 - beta) * t;
        s[idx] = gamma * (Number(series[i]) - l) + (1 - gamma) * s[idx]!;
    }

    // Project horizon
    return Array.from({ length: horizon }, (_, i) => {
        const idx = (series.length + i) % seasonLength;
        return Math.max(0, l + (i + 1) * t + s[idx]!);
    });
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export type ForecastModelKey =
    | "LINEAR_REGRESSION"
    | "SIMPLE_MOVING_AVERAGE"
    | "EXPONENTIAL_SMOOTHING"
    | "HOLT_WINTERS"
    | "ARIMA"
    | "ENSEMBLE"
    | "AUTO";

/**
 * Route a forecast request to the matching engine.
 * Returns an array of `horizon` projected values (non-negative).
 *
 * AUTO picks the richest model supported by the available data:
 *   ≥ 12 points → HOLT_WINTERS
 *   ≥  3 points → EXPONENTIAL_SMOOTHING
 *   otherwise   → LINEAR_REGRESSION
 *
 * ARIMA and ENSEMBLE are not yet implemented; they fall back to LINEAR_REGRESSION.
 */
export function runForecastEngine(
    model: string,
    history: number[],
    horizon: number,
): { forecasted: number[]; modelActuallyUsed: ForecastModelKey } {
    switch (model as ForecastModelKey) {
        case "SIMPLE_MOVING_AVERAGE":
            return { forecasted: runSMA(history, horizon), modelActuallyUsed: "SIMPLE_MOVING_AVERAGE" };

        case "EXPONENTIAL_SMOOTHING":
            return { forecasted: runHoltLinear(history, horizon), modelActuallyUsed: "EXPONENTIAL_SMOOTHING" };

        case "HOLT_WINTERS":
            // Falls back internally to HoltLinear if data < 12
            return { forecasted: runHoltWintersAdditive(history, horizon), modelActuallyUsed: "HOLT_WINTERS" };

        case "AUTO": {
            const nonZeroCount = history.filter((v) => v > 0).length;
            if (nonZeroCount >= 12)
                return { forecasted: runHoltWintersAdditive(history, horizon), modelActuallyUsed: "HOLT_WINTERS" };
            if (nonZeroCount >= 3)
                return { forecasted: runHoltLinear(history, horizon), modelActuallyUsed: "EXPONENTIAL_SMOOTHING" };
            return { forecasted: runLinearRegression(history, horizon), modelActuallyUsed: "LINEAR_REGRESSION" };
        }

        case "ARIMA":
        case "ENSEMBLE":
        // Not yet implemented — fall through to default
        case "LINEAR_REGRESSION":
        default:
            return { forecasted: runLinearRegression(history, horizon), modelActuallyUsed: "LINEAR_REGRESSION" };
    }
}
