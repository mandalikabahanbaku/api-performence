import prisma from "../../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import {
    DeleteForecastByPeriodDTO,
    FinalizeForecastDTO,
    QueryForecastDTO,
    ResponseForecastDTO,
    RunForecastDTO,
    UpdateManualForecastDTO,
} from "./forecast.schema.js";
import { runForecastEngine } from "./engines.js";

// ─── Product Select ────────────────────────────────────────────────────────────

const PRODUCT_SELECT = {
    id: true,
    name: true,
    z_value: true,
    product_type: { select: { slug: true } },
    size: { select: { size: true } },
    distribution_percentage: true,
    safety_percentage: true,
} as const;

/** Format a month+year to an ISO date string (first day of month). */
const formatMonthISO = (year: number, month: number) =>
    `${year}-${String(month).padStart(2, "0")}-01`;

type SelectedProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

// ─── Forecast Service ─────────────────────────────────────────────────────────

export class ForecastService {

    // ── RUN ───────────────────────────────────────────────────────────────────

    static async run(body: RunForecastDTO) {
        const {
            product_id,
            start_year,
            start_month,
            horizon = 12,
            model_used = "LINEAR_REGRESSION",
        } = body;

        const generatedIn = new Date();
        generatedIn.setUTCHours(0, 0, 0, 0);
        const generatedInStr = generatedIn.toISOString().slice(0, 10);

        const monthsRange = Array.from({ length: horizon }, (_, i) => {
            const d = new Date(start_year, start_month - 1 + i, 1);
            return { month: d.getMonth() + 1, year: d.getFullYear() };
        });

        const products: SelectedProduct[] = product_id
            ? await ForecastService.loadVariantsByProductId(product_id, body.is_display)
            : await prisma.product.findMany({
                  where: {
                      status: { notIn: ["DELETE", "PENDING", "BLOCK"] },
                      product_type: {
                          name: body.is_display
                              ? { contains: "Display" }
                              : { not: { contains: "Display" } },
                      },
                  },
                  select: PRODUCT_SELECT,
              });

        if (products.length === 0) throw new ApiError(404, "Tidak ada produk aktif ditemukan.");

        const productIds = products.map((p) => p.id);

        // Load historical sales (last 12 months before start) from ProductIssuance
        const histMonths = 12;
        const histPeriods: { month: number; year: number }[] = [];
        for (let i = histMonths; i >= 1; i--) {
            const d = new Date(start_year, start_month - 1 - i, 1);
            histPeriods.push({ month: d.getMonth() + 1, year: d.getFullYear() });
        }

        const historicalSales = await prisma.productIssuance.findMany({
            where: {
                product_id: { in: productIds },
                type: "ALL",
                OR: histPeriods.map((p) => ({ month: p.month, year: p.year })),
            },
        });

        // O(1) lookup keyed by "productId|month|year"
        const salesLookup = new Map<string, number>();
        for (const s of historicalSales) {
            salesLookup.set(`${s.product_id}|${s.month}|${s.year}`, Number(s.quantity));
        }

        // Build per-product ordered history array aligned with histPeriods
        const histMap = new Map<number, number[]>();
        for (const pid of productIds) {
            histMap.set(pid, histPeriods.map((hp) => salesLookup.get(`${pid}|${hp.month}|${hp.year}`) ?? 0));
        }

        const batch: {
            product_id: number;
            month: number;
            year: number;
            base_forecast: number;
            final_forecast: number;
            trend: "UP" | "DOWN" | "STABLE";
            model_used: string;
            system_ratio: number;
            additional_ratio: number;
            forecast_for: string; // ISO date string YYYY-MM-DD
            generated_in: string;
            is_actionable: boolean;
        }[] = [];

        for (const product of products) {
            const history = histMap.get(product.id) ?? [];
            const { forecasted, modelActuallyUsed } = runForecastEngine(model_used, history, horizon);

            const lastActual = history[history.length - 1] ?? 0;
            // system_ratio: implied monthly growth rate from first forecast vs last actual
            const firstForecastVal = forecasted[0] ?? 0;
            const system_ratio = lastActual > 0 ? (firstForecastVal - lastActual) / lastActual : 0;

            for (let i = 0; i < monthsRange.length; i++) {
                const m = monthsRange[i]!;
                const projected = forecasted[i] ?? 0;

                batch.push({
                    product_id: product.id,
                    month: m.month,
                    year: m.year,
                    base_forecast: projected,
                    final_forecast: projected,
                    trend: ForecastService.trend(projected, lastActual),
                    model_used: modelActuallyUsed,
                    system_ratio: Number(system_ratio.toFixed(4)),
                    additional_ratio: 0,
                    forecast_for: formatMonthISO(m.year, m.month),
                    generated_in: generatedInStr,
                    // is_actionable only for M+1 (first month of horizon)
                    is_actionable: i === 0,
                });
            }
        }

        // ----- PERCENTAGE-BASED ENGINE (commented out — kept for reference) -----
        // The block below implemented the original ForecastPercentage growth formula.
        // To re-enable, comment out the LR block above and uncomment this section.
        //
        // const percentages = await prisma.forecastPercentage.findMany({
        //     where: { OR: monthsRange.map((m) => ({ month: m.month, year: m.year })) },
        // });
        // const pctMap = new Map(percentages.map((p) => [`${p.year}-${p.month}`, p]));
        // if (percentages.length === 0) throw new ApiError(404, `Data persentase forecast untuk periode ${start_month}/${start_year} belum diatur.`);
        //
        // // Load actual sales for base month (M-1)
        // const prevMonth = start_month === 1 ? 12 : start_month - 1;
        // const prevYear  = start_month === 1 ? start_year - 1 : start_year;
        // const salesData = await prisma.productIssuance.findMany({
        //     where: { product_id: { in: productIds }, year: prevYear, month: prevMonth, type: "ALL" },
        // });
        // const inputMap = new Map<number, number>(salesData.map((s) => [s.product_id, Number(s.quantity)]));
        //
        // // Group products by name (for special-rule calculations)
        // const groups = new Map<string, SelectedProduct[]>();
        // for (const p of products) {
        //     if (!groups.has(p.name)) groups.set(p.name, []);
        //     groups.get(p.name)!.push(p);
        // }
        //
        // let currentInputMap = new Map<number, number>(inputMap);
        // for (let i = 0; i < monthsRange.length; i++) {
        //     const m = monthsRange[i]!;
        //     const pct = pctMap.get(`${m.year}-${m.month}`);
        //     const pctValue = body.is_display ? 0 : Number(pct?.value ?? 0);
        //     if (!body.is_display && (!pct || Number(pct.value) === 0)) break;
        //
        //     const nextInputMap = new Map<number, number>();
        //     for (const group of groups.values()) {
        //         const results = group.map((product) => {
        //             const input = currentInputMap.get(product.id) ?? 0;
        //             const base  = input * (1 + pctValue);
        //             return { product, input, base_forecast: base, final_forecast: base };
        //         });
        //
        //         // ── SPECIAL RULES (Display / Atomizer / EDP-Parfum split / 2ml mirror) ──
        //         // These rules are tied to the percentage-based engine and should be
        //         // re-enabled together with the pct block above.
        //
        //         // const mainBottles = results.filter((r) => { ... });
        //         // const totalInputBase = mainBottles.reduce(...);
        //         // const totalForecastBase = totalInputBase * (1 + pctValue);
        //         // const totalDistPctMain = mainBottles.reduce(...);
        //         // const edpMain    = results.find(...);
        //         // const parfumMain = results.find(...);
        //         // const edpMainFinal    = totalForecastBase * Number(edpMain?.product.distribution_percentage ?? 0);
        //         // const parfumMainFinal = totalForecastBase * Number(parfumMain?.product.distribution_percentage ?? 0);
        //         //
        //         // results.forEach((r) => {
        //         //     const slug    = r.product.product_type?.slug?.toLowerCase();
        //         //     const size    = r.product.size?.size;
        //         //     const distPct = Number(r.product.distribution_percentage ?? 0);
        //         //
        //         //     // Atomizer mirrors total main-bottle pool
        //         //     if (slug === "atomizer") {
        //         //         if (mainBottles.length > 0) r.final_forecast = totalForecastBase * totalDistPctMain;
        //         //     }
        //         //     // Main bottles split proportional to EDAR
        //         //     else if ((slug === "parfum" || slug === "perfume" || slug === "edp" ||
        //         //               slug === "hampers-edp" || slug === "hampers-parfum") &&
        //         //              (size === 110 || size === 100)) {
        //         //         if (mainBottles.length > 0) r.final_forecast = totalForecastBase * distPct;
        //         //     }
        //         //     // 2ml mirrors its Main variant
        //         //     else if (size === 2) {
        //         //         if ((slug === "edp" || slug === "hampers-edp") && edpMain)
        //         //             r.final_forecast = edpMainFinal;
        //         //         else if ((slug === "parfum" || slug === "perfume" || slug === "hampers-parfum") && parfumMain)
        //         //             r.final_forecast = parfumMainFinal;
        //         //     }
        //         //     // Force 0 when distribution_percentage is 0
        //         //     if ((slug === "edp" || slug === "parfum" || slug === "perfume" ||
        //         //          slug === "hampers-edp" || slug === "hampers-parfum") && distPct === 0)
        //         //         r.final_forecast = 0;
        //         //     else if (slug === "atomizer" && (totalForecastBase === 0 || totalDistPctMain === 0))
        //         //         r.final_forecast = 0;
        //         // });
        //
        //         for (const r of results) {
        //             batch.push({
        //                 product_id: r.product.id, month: m.month, year: m.year,
        //                 base_forecast: r.base_forecast, final_forecast: r.final_forecast,
        //                 trend: ForecastService.trend(r.final_forecast, r.input),
        //                 forecast_percentage_id: pct?.id ?? 1,
        //                 status: i === 0 ? "ADJUSTED" : "DRAFT",
        //             });
        //             nextInputMap.set(r.product.id, r.final_forecast);
        //         }
        //     }
        //     currentInputMap = nextInputMap;
        // }
        // ─────────────────────────────────────────────────────────────────────────

        if (batch.length === 0) {
            return { message: "Tidak ada data forecast yang diproses.", processed_records: 0, safety_stock_records: 0 };
        }

        const periodSet = new Set(batch.map((b) => `${b.product_id}|${b.month}|${b.year}`));
        const periodTuples = Array.from(periodSet).map((k) => {
            const [pid, mo, yr] = k.split("|").map(Number);
            return { product_id: pid!, month: mo!, year: yr! };
        });

        // Fetch current max versions
        const existingVersions = await prisma.$queryRaw<
            { product_id: number; month: number; year: number; max_ver: number }[]
        >`
            SELECT product_id, month, year, MAX(version) as max_ver
            FROM "forecasts"
            WHERE (product_id, month, year) IN (
                SELECT unnest(ARRAY[${Prisma.join(periodTuples.map((p) => p.product_id))}]::int[]),
                       unnest(ARRAY[${Prisma.join(periodTuples.map((p) => p.month))}]::int[]),
                       unnest(ARRAY[${Prisma.join(periodTuples.map((p) => p.year))}]::int[])
            )
            GROUP BY product_id, month, year
        `;

        const versionMap = new Map<string, number>();
        for (const row of existingVersions) {
            versionMap.set(`${row.product_id}|${row.month}|${row.year}`, row.max_ver);
        }

        // Mark existing is_latest = false
        if (existingVersions.length > 0) {
            await prisma.$executeRawUnsafe(`
                UPDATE "forecasts"
                SET is_latest = false
                WHERE (product_id, month, year) IN (
                    SELECT unnest(ARRAY[${periodTuples.map((p) => p.product_id).join(",")}]::int[]),
                           unnest(ARRAY[${periodTuples.map((p) => p.month).join(",")}]::int[]),
                           unnest(ARRAY[${periodTuples.map((p) => p.year).join(",")}]::int[])
                )
                AND is_latest = true
            `);
        }

        const nowIso = new Date().toISOString();
        const start = Date.now();

        try {
            const chunkSize = 4000;
            await prisma.$transaction(async (tx) => {
                for (let i = 0; i < batch.length; i += chunkSize) {
                    const chunk = batch.slice(i, i + chunkSize);
                    const valuesSql = chunk
                        .map((f) => {
                            const newVer = (versionMap.get(`${f.product_id}|${f.month}|${f.year}`) ?? 0) + 1;
                            return `(${f.product_id}, ${f.month}, ${f.year}, '${f.trend}', 'DRAFT', ${f.base_forecast}, ${f.final_forecast}, ${newVer}, true, '${f.model_used}', ${f.system_ratio}, ${f.additional_ratio}, '${f.forecast_for}', '${f.generated_in}', ${f.is_actionable}, '${nowIso}', '${nowIso}')`;
                        })
                        .join(", ");

                    await tx.$executeRawUnsafe(`
                        INSERT INTO "forecasts" (
                            product_id, month, year, trend, status,
                            base_forecast, final_forecast, version, is_latest,
                            model_used, system_ratio, additional_ratio,
                            forecast_for, generated_in, is_actionable,
                            created_at, updated_at
                        )
                        VALUES ${valuesSql}
                    `);
                }
            }, { timeout: 60000 });

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            console.log(`[Forecast Engine] Insert ${batch.length} rows in ${duration}s`);
        } catch (err) {
            console.error("[Forecast Engine] Bulk Insert Error:", err);
            throw new ApiError(500, "Gagal melakukan bulk insert forecast.");
        }

        // Safety Stock — MAE-based with z_value.
        // MAE = mean(|actual - forecast|) over the same 12-month historical window.
        // On the first run there are no prior forecasts, so MAE = 0.
        const [ssHistoricalForecasts, ssActuals] = await Promise.all([
            prisma.forecast.findMany({
                where: {
                    product_id: { in: productIds },
                    is_latest: false,
                    // Bound to the same 12-month window used for LR fitting
                    OR: histPeriods.map((p) => ({ month: p.month, year: p.year })),
                },
                select: { product_id: true, month: true, year: true, final_forecast: true },
            }),
            prisma.productIssuance.findMany({
                where: {
                    product_id: { in: productIds },
                    type: "ALL",
                    OR: histPeriods.map((p) => ({ month: p.month, year: p.year })),
                },
                select: { product_id: true, month: true, year: true, quantity: true },
            }),
        ]);

        // O(1) lookup for actuals
        const actualsLookup = new Map<string, number>();
        for (const a of ssActuals) {
            actualsLookup.set(`${a.product_id}|${a.month}|${a.year}`, Number(a.quantity));
        }

        // Build MAE per product using O(forecasts) passes
        const maeMap = new Map<number, number>();
        const errorAccum = new Map<number, { sum: number; count: number }>();
        for (const pf of ssHistoricalForecasts) {
            const actual = actualsLookup.get(`${pf.product_id}|${pf.month}|${pf.year}`);
            if (actual === undefined) continue;
            const err = Math.abs(actual - Number(pf.final_forecast));
            const acc = errorAccum.get(pf.product_id) ?? { sum: 0, count: 0 };
            acc.sum += err; acc.count += 1;
            errorAccum.set(pf.product_id, acc);
        }
        for (const pid of productIds) {
            const acc = errorAccum.get(pid);
            maeMap.set(pid, acc && acc.count > 0 ? acc.sum / acc.count : 0);
        }
        const safetyStockBatch: {
            product_id: number;
            month: number;
            year: number;
            mean_absolute_error: number;
            safety_stock_quantity: number;
            safety_stock_ratio: number;
            z_value_used: number;
            additional_ratio: number;
        }[] = [];

        for (const product of products) {
            const zValue = Number(product.z_value ?? 1.65);
            const mae = maeMap.get(product.id) ?? 0;
            // SS = z * MAE (statistical safety stock formula)
            const ssQty = zValue * mae;
            // safety_stock_ratio = SS as a proportion of the first forecast month demand
            const firstForecast = batch.find(
                (b) => b.product_id === product.id && b.month === monthsRange[0]!.month && b.year === monthsRange[0]!.year,
            );
            const demandRef = firstForecast?.final_forecast ?? 0;
            const ssRatio = demandRef > 0 ? ssQty / demandRef : 0;

            // One SS record per forecast month
            for (const m of monthsRange) {
                safetyStockBatch.push({
                    product_id: product.id,
                    month: m.month,
                    year: m.year,
                    mean_absolute_error: Number(mae.toFixed(2)),
                    safety_stock_quantity: Number(ssQty.toFixed(2)),
                    safety_stock_ratio: Number(ssRatio.toFixed(4)),
                    z_value_used: Number(zValue.toFixed(3)),
                    additional_ratio: 0,
                });
            }
        }

        if (safetyStockBatch.length > 0) {
            try {
                const chunkSize = 4000;
                await prisma.$transaction(async (tx) => {
                    for (let i = 0; i < safetyStockBatch.length; i += chunkSize) {
                        const chunk = safetyStockBatch.slice(i, i + chunkSize);
                        const valuesSql = chunk
                            .map(
                                (s) =>
                                    `(${s.product_id}, ${s.month}, ${s.year}, ${s.mean_absolute_error}, ${s.safety_stock_quantity}, ${s.safety_stock_ratio}, ${s.z_value_used}, ${s.additional_ratio}, '${nowIso}', '${nowIso}')`,
                            )
                            .join(", ");

                        await tx.$executeRawUnsafe(`
                            INSERT INTO "safety_stock" (
                                product_id, month, year,
                                mean_absolute_error, safety_stock_quantity, safety_stock_ratio,
                                z_value_used, additional_ratio,
                                created_at, updated_at
                            )
                            VALUES ${valuesSql}
                            ON CONFLICT (product_id, month, year)
                            DO UPDATE SET
                                mean_absolute_error   = EXCLUDED.mean_absolute_error,
                                safety_stock_quantity = EXCLUDED.safety_stock_quantity,
                                safety_stock_ratio    = EXCLUDED.safety_stock_ratio,
                                z_value_used          = EXCLUDED.z_value_used,
                                additional_ratio      = EXCLUDED.additional_ratio,
                                updated_at            = EXCLUDED.updated_at
                        `);
                    }
                }, { timeout: 60000 });
                console.log(`[Forecast Engine] Safety Stock Upsert: ${safetyStockBatch.length} rows`);
            } catch (err) {
                console.error("[Forecast Engine] Safety Stock Error:", err);
            }
        }

        return {
            message: `Forecast berhasil disimpan: ${batch.length} record. Safety Stock: ${safetyStockBatch.length} record.`,
            processed_records: batch.length,
            safety_stock_records: safetyStockBatch.length,
        };
    }

    // ── MANUAL UPDATE ─────────────────────────────────────────────────────────

    static async updateManual(body: UpdateManualForecastDTO) {
        const { product_id, month, year, final_forecast, additional_ratio } = body;

        const product = await prisma.product.findUnique({
            where: { id: product_id },
            include: { product_type: true },
        });
        if (!product) throw new ApiError(404, "Produk tidak ditemukan.");

        const isDisplayProduct = product.product_type?.name?.toLowerCase().includes("display");
        if (!isDisplayProduct) {
            throw new ApiError(403, "Update manual hanya diizinkan untuk produk Display.");
        }

        // Resolve current base from existing record or latest sales
        const existing = await prisma.forecast.findFirst({
            where: { product_id, month, year, is_latest: true },
        });

        let resolvedBase: number;
        if (existing) {
            resolvedBase = final_forecast !== undefined ? final_forecast : Number(existing.base_forecast);
        } else {
            const prevMonth = month === 1 ? 12 : month - 1;
            const prevYear  = month === 1 ? year - 1 : year;
            const sales = await prisma.productIssuance.findFirst({
                where: { product_id, month: prevMonth, year: prevYear, type: "ALL" },
            });
            resolvedBase = final_forecast !== undefined ? final_forecast : Number(sales?.quantity ?? 0);
        }

        const resolvedRatio = additional_ratio !== undefined ? additional_ratio : 0;
        const resolvedFinal = resolvedBase * (1 + resolvedRatio / 100);
        const nowIso = new Date().toISOString();

        const shouldPropagate = isDisplayProduct && final_forecast !== undefined;

        if (!shouldPropagate) {
            // Single period update
            if (!existing) {
                await prisma.forecast.create({
                    data: {
                        product_id,
                        month,
                        year,
                        base_forecast: resolvedBase,
                        final_forecast: resolvedFinal,
                        additional_ratio: resolvedRatio,
                        trend: ForecastService.trend(resolvedFinal, resolvedBase),
                        status: "ADJUSTED",
                        adjusted_at: new Date(),
                        forecast_for: new Date(formatMonthISO(year, month)),
                        generated_in: new Date(),
                        version: 1,
                        is_latest: true,
                    },
                });
            } else {
                await prisma.forecast.update({
                    where: { id: existing.id },
                    data: {
                        base_forecast: resolvedBase,
                        final_forecast: resolvedFinal,
                        additional_ratio: resolvedRatio,
                        trend: ForecastService.trend(resolvedFinal, resolvedBase),
                        status: "ADJUSTED",
                        adjusted_at: new Date(),
                    },
                });
            }

            // Recalculate safety stock for this period
            const zValue = Number(product.z_value ?? 1.65);
            // On manual update MAE tracking is deferred; use existing MAE or 0
            const existingSS = await prisma.safetyStock.findUnique({
                where: { product_id_month_year: { product_id, month, year } },
            });
            const mae = existingSS ? Number(existingSS.mean_absolute_error) : 0;
            const ssQty = zValue * mae;
            const ssRatio = resolvedFinal > 0 ? ssQty / resolvedFinal : 0;

            await prisma.safetyStock.upsert({
                where: { product_id_month_year: { product_id, month, year } },
                create: {
                    product_id, month, year,
                    mean_absolute_error: mae,
                    safety_stock_quantity: ssQty,
                    safety_stock_ratio: ssRatio,
                    z_value_used: zValue,
                    additional_ratio: 0,
                },
                update: {
                    safety_stock_quantity: ssQty,
                    safety_stock_ratio: ssRatio,
                    z_value_used: zValue,
                },
            });
        } else {
            // Propagate base forecast across 12-month horizon
            const horizon = 12;
            const monthsRange = Array.from({ length: horizon }, (_, i) => {
                const d = new Date(year, month - 1 + i, 1);
                return { month: d.getMonth() + 1, year: d.getFullYear() };
            });

            await prisma.$transaction(async (tx) => {
                // Mark all existing records for this product in the range as not-latest
                await tx.$executeRawUnsafe(`
                    UPDATE "forecasts"
                    SET is_latest = false
                    WHERE product_id = ${product_id}
                      AND (year * 12 + month) >= ${year * 12 + month}
                      AND (year * 12 + month) <= ${monthsRange[monthsRange.length - 1]!.year * 12 + monthsRange[monthsRange.length - 1]!.month}
                      AND is_latest = true
                `);

                const forecastValues = monthsRange
                    .map((m) => {
                        const isTargetMonth = m.month === month && m.year === year;
                        const mRatio = isTargetMonth ? resolvedRatio : 0;
                        const mFinal = resolvedBase * (1 + mRatio / 100);
                                return `(${product_id}, ${m.month}, ${m.year}, 'STABLE', 'ADJUSTED', ${resolvedBase}, ${mFinal}, ${mRatio}, 1, true, 'LINEAR_REGRESSION', 0, '${formatMonthISO(m.year, m.month)}', '${nowIso.slice(0, 10)}', false, '${nowIso}', '${nowIso}')`;
                    })
                    .join(", ");

                await tx.$executeRawUnsafe(`
                    INSERT INTO "forecasts" (
                        product_id, month, year, trend, status,
                        base_forecast, final_forecast, additional_ratio,
                        version, is_latest, model_used, system_ratio,
                        forecast_for, generated_in, is_actionable,
                        created_at, updated_at
                    ) VALUES ${forecastValues}
                `);

                const ssValues = monthsRange
                    .map((m) => {
                        const isTargetMonth = m.month === month && m.year === year;
                        const mFinal = resolvedBase * (1 + (isTargetMonth ? resolvedRatio : 0) / 100);
                        const zValue = Number(product.z_value ?? 1.65);
                        // MAE is 0 on manual update — SS will be refined on next engine run
                        const ssRatio = 0;
                        return `(${product_id}, ${m.month}, ${m.year}, 0, 0, ${ssRatio}, ${zValue.toFixed(3)}, 0, '${nowIso}', '${nowIso}')`;
                    })
                    .join(", ");

                await tx.$executeRawUnsafe(`
                    INSERT INTO "safety_stock" (
                        product_id, month, year,
                        mean_absolute_error, safety_stock_quantity, safety_stock_ratio,
                        z_value_used, additional_ratio,
                        created_at, updated_at
                    ) VALUES ${ssValues}
                    ON CONFLICT (product_id, month, year)
                    DO UPDATE SET
                        safety_stock_quantity = EXCLUDED.safety_stock_quantity,
                        safety_stock_ratio    = EXCLUDED.safety_stock_ratio,
                        z_value_used          = EXCLUDED.z_value_used,
                        updated_at            = EXCLUDED.updated_at
                `);
            }, { timeout: 30000 });
        }

        return { message: "Forecast berhasil diperbarui secara manual." };
    }

    // ── GET LIST ──────────────────────────────────────────────────────────────

    static async get(
        query: QueryForecastDTO,
    ): Promise<{ data: ResponseForecastDTO[]; len: number }> {
        const now = new Date();
        const monthsWindow = ForecastService.resolveHorizonMonths(now, query.horizon ?? 12);

        const page = query.page ?? 1;
        const take = query.take ?? 25;
        const { skip, take: limit } = GetPagination(page, take);

        const startYear  = monthsWindow[0]!.year;
        const startMonth = monthsWindow[0]!.month;
        const endYear    = monthsWindow[monthsWindow.length - 1]!.year;
        const endMonth   = monthsWindow[monthsWindow.length - 1]!.month;
        const searchRaw  = query.search ? `%${query.search}%` : null;

        // Load ForecastPercentage for display in UI (retained for reference)
        const rangePercentages = await prisma.forecastPercentage.findMany({
            where: { OR: monthsWindow.map((m) => ({ month: m.month, year: m.year })) },
        });
        const pctMap = new Map(rangePercentages.map((p) => [`${p.year}-${p.month}`, p]));

        const where: Prisma.ProductWhereInput = {
            status: { notIn: ["DELETE", "PENDING", "BLOCK"] },
            deleted_at: null,
            product_type: {
                name: query.is_display ? { contains: "Display" } : { not: { contains: "Display" } },
            },
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                ],
            }),
        };

        const len = await prisma.product.count({ where });
        if (len === 0) return { data: [], len };

        const productsRaw = await prisma.$queryRaw<
            {
                id: number;
                code: string | null;
                name: string;
                z_value: number;
                size: number | null;
                product_type_name: string | null;
                unit_name: string | null;
                distribution_percentage: number | null;
                safety_percentage: number | null;
                forecasts_data: string | null;
                safety_stock_data: string | null;
                current_stock: number | null;
            }[]
        >`
            SELECT
                p.id,
                p.code,
                p.name,
                p.z_value,
                ps.size            AS "size",
                pt.name            AS "product_type_name",
                u.name             AS "unit_name",
                p.distribution_percentage,
                p.safety_percentage,
                COALESCE(pi.quantity, 0)::float8 AS "current_stock",

                MAX(COALESCE(f_m1.final_forecast, 0)) OVER(PARTITION BY p.name) as group_sort_priority,
                COALESCE(f_m1.final_forecast, 0) as m1_final_forecast,

                (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'month',            f.month,
                            'year',             f.year,
                            'base_forecast',    f.base_forecast,
                            'final_forecast',   f.final_forecast,
                            'trend',            f.trend,
                            'status',           f.status,
                            'additional_ratio', f.additional_ratio,
                            'system_ratio',     f.system_ratio,
                            'model_used',       f.model_used,
                            'is_actionable',    f.is_actionable
                        ) ORDER BY f.year ASC, f.month ASC
                    ), '[]'::json)
                    FROM "forecasts" f
                    WHERE f.product_id = p.id
                      AND f.is_latest = true
                      AND (f.year * 12 + f.month) >= ${startYear * 12 + startMonth}
                      AND (f.year * 12 + f.month) <= ${endYear * 12 + endMonth}
                ) AS "forecasts_data",

                (
                    SELECT row_to_json(ss)
                    FROM (
                        SELECT
                            safety_stock_quantity,
                            safety_stock_ratio,
                            mean_absolute_error,
                            z_value_used,
                            additional_ratio,
                            created_at
                        FROM "safety_stock"
                        WHERE product_id = p.id
                        ORDER BY created_at DESC
                        LIMIT 1
                    ) ss
                ) AS "safety_stock_data"

            FROM "products" p
            LEFT JOIN "product_types"     pt ON pt.id = p.type_id
            LEFT JOIN "unit_of_materials" u  ON u.id  = p.unit_id
            LEFT JOIN "product_size"      ps ON ps.id = p.size_id
            LEFT JOIN "forecasts" f_m1 ON f_m1.product_id = p.id
                AND f_m1.month = ${startMonth} AND f_m1.year = ${startYear}
                AND f_m1.is_latest = true
            LEFT JOIN (
                SELECT product_id, SUM(quantity) as quantity
                FROM product_inventories
                WHERE month = ${startMonth} AND year = ${startYear}
                GROUP BY product_id
            ) pi ON p.id = pi.product_id
            WHERE p.status NOT IN ('DELETE', 'PENDING', 'BLOCK')
              AND p.deleted_at IS NULL
              AND (
                ${
                    query.is_display
                        ? Prisma.sql`pt.name ILIKE '%Display%'`
                        : Prisma.sql`pt.name IS NULL OR pt.name NOT ILIKE '%Display%'`
                }
              )
            ${searchRaw ? Prisma.sql`AND (p.name ILIKE ${searchRaw} OR p.code ILIKE ${searchRaw})` : Prisma.empty}
            ${query.type_id ? Prisma.sql`AND p.type_id = ${query.type_id}` : Prisma.empty}
            ${query.size_id ? Prisma.sql`AND p.size_id = ${query.size_id}` : Prisma.empty}
            ORDER BY
                group_sort_priority DESC,
                p.name ASC,
                CASE
                    WHEN pt.name ILIKE '%EDP%' OR pt.name ILIKE '%Parfum%' OR pt.name ILIKE '%Perfume%' THEN 1
                    WHEN pt.name ILIKE '%Atomizer%' THEN 2
                    ELSE 3
                END ASC,
                ps.size DESC NULLS LAST,
                CASE
                    WHEN pt.name ILIKE '%EDP%' THEN 1
                    WHEN pt.name ILIKE '%Parfum%' OR pt.name ILIKE '%Perfume%' THEN 2
                    ELSE 3
                END ASC,
                p.id ASC
            LIMIT ${limit} OFFSET ${skip}
        `;

        const data: ResponseForecastDTO[] = productsRaw.map((p) => {
            const rawForecasts: {
                month: number;
                year: number;
                base_forecast: string;
                final_forecast: string | null;
                trend: string;
                status: string;
                additional_ratio: string | null;
                system_ratio: string | null;
                model_used: string | null;
                is_actionable: boolean;
            }[] =
                typeof p.forecasts_data === "string"
                    ? JSON.parse(p.forecasts_data)
                    : (p.forecasts_data ?? []);

            const forecastByKey = new Map(rawForecasts.map((f) => [`${f.year}-${f.month}`, f]));

            const monthly_data: ResponseForecastDTO["monthly_data"] = monthsWindow.map((m) => {
                const forecast = forecastByKey.get(`${m.year}-${m.month}`);
                return {
                    month: m.month,
                    year: m.year,
                    period: `${m.month}/${m.year}`,
                    base_forecast: Number(forecast?.base_forecast ?? 0),
                    final_forecast:
                        forecast?.final_forecast != null ? Number(forecast.final_forecast) : null,
                    trend: forecast?.trend ?? "STABLE",
                    status: forecast?.status ?? null,
                    is_current_month: m.is_current_month,
                    is_actionable: forecast?.is_actionable ?? false,
                    additional_ratio: forecast?.additional_ratio != null ? Number(forecast.additional_ratio) : 0,
                    system_ratio: forecast?.system_ratio != null ? Number(forecast.system_ratio) : 0,
                    model_used: forecast?.model_used ?? null,
                    percentage_value: pctMap.has(`${m.year}-${m.month}`)
                        ? Number((Number(pctMap.get(`${m.year}-${m.month}`)!.value) * 100).toFixed(2))
                        : null,
                };
            });

            const ss =
                typeof p.safety_stock_data === "string"
                    ? JSON.parse(p.safety_stock_data)
                    : p.safety_stock_data;

            const m1MonthData = monthly_data.find(
                (m) => m.month === startMonth && m.year === startYear,
            );
            const m1Forecast  = m1MonthData?.final_forecast ?? 0;
            const currentStock = Number(p.current_stock ?? 0);
            const needProduce  = Math.max(0, m1Forecast - currentStock);

            return {
                product_id: p.id,
                product_code: p.code,
                product_name: p.name,
                product_type: p.product_type_name ?? "",
                product_size: `${p.size ?? ""} ${p.unit_name ?? ""}`.trim(),
                z_value: Number(p.z_value ?? 0),
                distribution_percentage: p.distribution_percentage
                    ? Number((Number(p.distribution_percentage) * 100).toFixed(2))
                    : 0,
                safety_percentage: p.safety_percentage
                    ? Number((Number(p.safety_percentage) * 100).toFixed(2))
                    : 0,
                current_stock: currentStock,
                need_produce: needProduce,
                monthly_data,
                safety_stock_summary: ss
                    ? {
                          safety_stock_quantity: ss.safety_stock_quantity != null ? Number(ss.safety_stock_quantity) : null,
                          safety_stock_ratio: ss.safety_stock_ratio != null ? Number(ss.safety_stock_ratio) : null,
                          mean_absolute_error: ss.mean_absolute_error != null ? Number(ss.mean_absolute_error) : null,
                          z_value_used: ss.z_value_used != null ? Number(ss.z_value_used) : null,
                          additional_ratio: ss.additional_ratio != null ? Number(ss.additional_ratio) : null,
                          last_updated: ss.created_at ? new Date(ss.created_at) : null,
                      }
                    : null,
            };
        });

        return { data, len };
    }

    // ── DETAIL ────────────────────────────────────────────────────────────────

    static async detail(product_id: number, month: number, year: number) {
        if (!month || !year) throw new ApiError(400, "Bulan dan tahun wajib diisi");

        const row = await prisma.forecast.findFirst({
            where: { product_id, month, year, is_latest: true },
        });
        if (!row) throw new ApiError(404, "Data forecast tidak ditemukan");

        return {
            product_id: row.product_id,
            month: row.month,
            year: row.year,
            base_forecast: Number(row.base_forecast),
            final_forecast: row.final_forecast != null ? Number(row.final_forecast) : null,
            trend: row.trend,
            status: row.status,
            model_used: row.model_used,
            version: row.version,
            system_ratio: row.system_ratio != null ? Number(row.system_ratio) : null,
            additional_ratio: row.additional_ratio != null ? Number(row.additional_ratio) : null,
            is_actionable: row.is_actionable,
            forecast_for: row.forecast_for,
            generated_in: row.generated_in,
        };
    }

    // ── FINALIZE ──────────────────────────────────────────────────────────────

    static async finalize(data: FinalizeForecastDTO) {
        const result = await prisma.forecast.updateMany({
            where: { month: data.month, year: data.year, status: "DRAFT", is_latest: true },
            data: { status: "FINALIZED", is_actionable: true },
        });
        if (result.count === 0) throw new ApiError(400, "Tidak ada data DRAFT untuk periode ini");
        return { count: result.count };
    }

    // ── DELETE BY PERIOD ──────────────────────────────────────────────────────

    static async deleteByPeriod(data: DeleteForecastByPeriodDTO) {
        const result = await prisma.forecast.deleteMany({
            where: { month: data.month, year: data.year },
        });
        if (result.count === 0) throw new ApiError(400, "Tidak ada data forecast untuk dihapus pada periode ini");
        return { count: result.count };
    }

    // ── DESTROY BY ID ─────────────────────────────────────────────────────────

    static async destroyById(id: number) {
        try {
            await prisma.forecast.delete({ where: { id } });
        } catch (err: any) {
            if (err?.code === "P2025") throw new ApiError(404, "Data forecast tidak ditemukan");
            throw err;
        }
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    private static resolveHorizonMonths(now: Date, horizon: number) {
        const startYear  = now.getUTCFullYear();
        const startMonth = now.getUTCMonth() + 1;
        return Array.from({ length: horizon }, (_, i) => {
            const d = new Date(Date.UTC(startYear, startMonth - 1 + i, 1));
            return {
                year: d.getUTCFullYear(),
                month: d.getUTCMonth() + 1,
                is_current_month: i === 0,
            };
        });
    }

    private static async loadVariantsByProductId(
        product_id: number,
        is_display?: boolean,
    ): Promise<SelectedProduct[]> {
        const target = await prisma.product.findUnique({
            where: { id: product_id },
            select: { name: true },
        });
        if (!target) throw new ApiError(404, "Produk tidak ditemukan.");

        const variations = await prisma.product.findMany({
            where: {
                name: target.name,
                status: { notIn: ["DELETE", "PENDING", "BLOCK"] },
                deleted_at: null,
                product_type: {
                    name: is_display ? { contains: "Display" } : { not: { contains: "Display" } },
                },
            },
            select: PRODUCT_SELECT,
        });

        if (variations.length === 0) {
            throw new ApiError(404, `Tidak ada variasi produk aktif ditemukan untuk "${target.name}".`);
        }
        return variations;
    }

    private static trend(forecast: number, input: number): "UP" | "DOWN" | "STABLE" {
        if (forecast > input) return "UP";
        if (forecast < input) return "DOWN";
        return "STABLE";
    }
}
