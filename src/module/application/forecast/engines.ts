/**
 * Forecast Engine implementations.
 * Each function receives ordered historical data (oldest → newest)
 * and returns an array of `horizon` projected values (also oldest → newest).
 */

/** Helper to calculate Mean Absolute Error (MAE) and return individual errors */
function computeMAE(actual: number[], fitted: number[]): { mae: number, errors: number[] } {
    if (actual.length === 0) return { mae: 0, errors: [] };
    const errors: number[] = [];
    let sumError = 0;
    for (let i = 0; i < actual.length; i++) {
        const err = Math.abs((actual[i] ?? 0) - (fitted[i] ?? 0));
        errors.push(err);
        sumError += err;
    }
    return { mae: sumError / actual.length, errors };
}

// ─── Linear Regression ────────────────────────────────────────────────────────

/** Fit OLS line to historical data. xs are implicit 1-indexed integers. */
export function linearRegression(ys: number[]): { slope: number; intercept: number } {
    const n = ys.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: ys[0]! };

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

function runLinearRegression(series: number[], horizon: number): { forecasted: number[]; mae: number; errors: number[] } {
    const n = series.length;
    const { slope, intercept } = linearRegression(series);
    
    const fitted = series.map((_, i) => Math.max(0, intercept + slope * (i + 1)));
    const { mae, errors } = computeMAE(series, fitted);
    
    const forecasted = Array.from({ length: horizon }, (_, i) =>
        Math.max(0, intercept + slope * (n + i + 1)),
    );
    return { forecasted, mae, errors };
}

// ─── Simple Moving Average ────────────────────────────────────────────────────

function runSMA(series: number[], horizon: number, window = 3): { forecasted: number[]; mae: number; errors: number[] } {
    if (series.length === 0) return { forecasted: Array(horizon).fill(0), mae: 0, errors: [] };
    const slice = series.slice(-window);
    const avg   = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    
    const { mae, errors } = computeMAE(series, series.map(() => avg));
    
    return { forecasted: Array.from({ length: horizon }, () => avg), mae, errors };
}

// ─── Weighted Moving Average ──────────────────────────────────────────────────

function runWMA(series: number[], horizon: number): { forecasted: number[]; mae: number; errors: number[] } {
    const n = series.length;
    if (n === 0) return { forecasted: Array(horizon).fill(0), mae: 0, errors: [] };
    if (n === 1) return { forecasted: Array(horizon).fill(series[0]!), mae: 0, errors: [0] };

    const weightSum = (n * (n + 1)) / 2;
    const weightedSum = series.reduce((acc, val, i) => acc + val * (i + 1), 0);
    const value = weightedSum / weightSum;

    const { mae, errors } = computeMAE(series, series.map(() => value));
    return { forecasted: Array.from({ length: horizon }, () => value), mae, errors };
}

// ─── Exponential Smoothing (Holt's Double / Holt-Linear) ─────────────────────

function runHoltLinear(
    series: number[],
    horizon: number,
    alpha = 0.3,
    beta  = 0.1,
): { forecasted: number[]; mae: number; errors: number[] } {
    if (series.length === 0) return { forecasted: Array(horizon).fill(0), mae: 0, errors: [] };
    if (series.length === 1) return { forecasted: Array(horizon).fill(series[0]!), mae: 0, errors: [0] };

    let level = series[0]!;
    let trend = series.length > 1 ? (series[1] ?? 0) - (series[0] ?? 0) : 0;
    const fitted: number[] = [level];

    for (let i = 1; i < series.length; i++) {
        const prevLevel = level;
        fitted.push(Math.max(0, level + trend));
        level = alpha * (series[i] ?? 0) + (1 - alpha) * (level + trend);
        trend = beta  * (level - prevLevel) + (1 - beta) * trend;
    }

    const { mae, errors } = computeMAE(series, fitted);
    const forecasted = Array.from({ length: horizon }, (_, i) =>
        Math.max(0, level + (i + 1) * trend),
    );
    return { forecasted, mae, errors };
}

// ─── Holt-Winters Additive ────────────────────────────────────────────────────

function runHoltWintersAdditive(
    series: number[],
    horizon: number,
    seasonLength = 12,
    alpha = 0.2,
    beta  = 0.1,
    gamma = 0.1,
): { forecasted: number[]; mae: number; errors: number[] } {
    if (series.length < seasonLength) {
        return runHoltLinear(series, horizon, alpha, beta);
    }

    let l: number = series[0]!;
    let t = 0;
    // Initial trend estimate
    for (let i = 0; i < seasonLength; i++) {
        t += (Number(series[i + seasonLength] ?? series[i]) - Number(series[i])) / seasonLength;
    }
    t /= seasonLength;

    const s: number[] = series.slice(0, seasonLength).map((v) => Number(v) - l);
    const fitted: number[] = [];

    for (let i = 0; i < series.length; i++) {
        const idx       = i % seasonLength;
        fitted.push(Math.max(0, l + t + s[idx]!));
        const prevLevel = l;
        l = alpha * (Number(series[i]) - s[idx]!) + (1 - alpha) * (l + t);
        t = beta  * (l - prevLevel) + (1 - beta) * t;
        s[idx] = gamma * (Number(series[i]) - l) + (1 - gamma) * s[idx]!;
    }

    const { mae, errors } = computeMAE(series, fitted);
    const forecasted = Array.from({ length: horizon }, (_, i) => {
        const idx = (series.length + i) % seasonLength;
        return Math.max(0, l + (i + 1) * t + s[idx]!);
    });
    return { forecasted, mae, errors };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export type ForecastModelKey =
    | "LINEAR_REGRESSION"
    | "SIMPLE_MOVING_AVERAGE"
    | "WEIGHTED_MOVING_AVERAGE"
    | "EXPONENTIAL_SMOOTHING"
    | "HOLT_WINTERS"
    | "ARIMA"
    | "ENSEMBLE"
    | "AUTO";

export function runForecastEngine(
    model: string,
    history: number[],
    horizon: number,
): { forecasted: number[]; modelActuallyUsed: ForecastModelKey; mae: number; errors: number[] } {
    switch (model as ForecastModelKey) {
        case "SIMPLE_MOVING_AVERAGE": {
            const res = runSMA(history, horizon);
            return { ...res, modelActuallyUsed: "SIMPLE_MOVING_AVERAGE" };
        }
        case "WEIGHTED_MOVING_AVERAGE": {
            const res = runWMA(history, horizon);
            return { ...res, modelActuallyUsed: "WEIGHTED_MOVING_AVERAGE" };
        }
        case "EXPONENTIAL_SMOOTHING": {
            const res = runHoltLinear(history, horizon);
            return { ...res, modelActuallyUsed: "EXPONENTIAL_SMOOTHING" };
        }
        case "HOLT_WINTERS": {
            const res = runHoltWintersAdditive(history, horizon);
            return { ...res, modelActuallyUsed: "HOLT_WINTERS" };
        }
        case "AUTO": {
            const nonZeroCount = history.filter((v) => v > 0).length;
            if (nonZeroCount >= 12) {
                const res = runHoltWintersAdditive(history, horizon);
                return { ...res, modelActuallyUsed: "HOLT_WINTERS" };
            }
            if (nonZeroCount >= 6) {
                const res = runHoltLinear(history, horizon);
                return { ...res, modelActuallyUsed: "EXPONENTIAL_SMOOTHING" };
            }
            if (nonZeroCount >= 3) {
                const res = runWMA(history, horizon);
                return { ...res, modelActuallyUsed: "WEIGHTED_MOVING_AVERAGE" };
            }
            const res = runLinearRegression(history, horizon);
            return { ...res, modelActuallyUsed: "LINEAR_REGRESSION" };
        }
        case "ARIMA":
        case "ENSEMBLE":
        case "LINEAR_REGRESSION":
        default: {
            const res = runLinearRegression(history, horizon);
            return { ...res, modelActuallyUsed: "LINEAR_REGRESSION" };
        }
    }
}
