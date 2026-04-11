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
    UpsertSafetyRatioDTO,
} from "./forecast.schema.js";
import { runForecastEngine } from "./engines.js";

// ─── Product Select ────────────────────────────────────────────────────────────

const PRODUCT_SELECT = {
    id: true,
    code: true,
    name: true,
    product_type: { select: { slug: true } },
    size: { select: { size: true } },
    distribution_percentage: true,
    safety_percentage: true,
    z_value: true,
    lead_time: true,
} as const;

export const OTHERS_PRODUCT_FILTER = [
    { product_type: { slug: { contains: "display", mode: "insensitive" } } },
    { product_type: { slug: { contains: "kertas", mode: "insensitive" } } },
    { product_type: { slug: { contains: "botol", mode: "insensitive" } } },
    { product_type: { slug: { contains: "paper-bag", mode: "insensitive" } } },
    { product_type: { slug: { contains: "kartu-garansi", mode: "insensitive" } } },
    { product_type: { slug: { contains: "canvas-bag", mode: "insensitive" } } },
] as Prisma.ProductWhereInput[];

/** Format a month+year to an ISO date string (first day of month). */
const formatMonthISO = (year: number, month: number) =>
    `${year}-${String(month).padStart(2, "0")}-01`;

type SelectedProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

// ─── Forecast Service ─────────────────────────────────────────────────────────

export class ForecastService {
    // ── EXPORT ───────────────────────────────────────────────────────────────

    static async export(query: QueryForecastDTO) {
        const { data } = await ForecastService.get({ ...query, take: 10000, page: 1 });

        const monthsShort = [
            "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
            "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
        ];

        const esc = (v: string | number | null | undefined): string => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };

        const periods =
            data.length > 0
                ? data[0]?.monthly_data.map((m) => ({ month: m.month, year: m.year }))
                : [];

        const headers = [
            "CODE", "PRODUCT NAME", "TYPE", "SIZE",
            ...(periods?.map((p) => `FC ${monthsShort[p.month - 1]}'${String(p.year).slice(-2)}`) || []),
            "TOTAL FORECAST", "JUMLAH FORECAST", "% SAFETY", "SAFETY STOCK", "STOCK", "NEED PRODUCE",
        ];

        const rows = data.map((item) => {
            const values: (string | number)[] = [
                item.product_code ?? "",
                item.product_name.toUpperCase(),
                item.product_type.toUpperCase(),
                item.product_size.toUpperCase().replace(/PCS|ML/g, "").trim(),
                ...(periods?.map((p) => {
                    const m = item.monthly_data.find((md) => md.month === p.month && md.year === p.year);
                    return m ? Math.round(Number(m.final_forecast ?? m.base_forecast)) : 0;
                }) || []),
                Math.round(Number(item.safety_stock_summary?.total_forecast ?? 0)),
                Math.round(Number(item.safety_stock_summary?.total_demand ?? 0)),
                item.safety_percentage ?? 0,
                Math.round(Number(item.safety_stock_summary?.safety_stock_quantity ?? 0)),
                Math.round(item.current_stock),
                Math.round(item.need_produce),
            ];
            return values.map(esc).join(",");
        });

        const csv = [headers.map(esc).join(","), ...rows].join("\n");
        return Buffer.from("\uFEFF" + csv, "utf-8");
    }

    // ── RUN (Forecast Engine) — Raw SQL for performance ────────────────────────

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

        const anchorDate = new Date(Date.UTC(start_year, start_month - 2, 1));
        const anchorMonth = anchorDate.getUTCMonth() + 1;
        const anchorYear = anchorDate.getUTCFullYear();

        const monthsRange = Array.from({ length: horizon }, (_, i) => {
            const d = new Date(Date.UTC(start_year, start_month - 1 + i, 1));
            return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
        });

        const isOthers = body.is_others ?? body.is_display;

        const products: SelectedProduct[] = product_id
            ? await ForecastService.loadVariantsByProductId(product_id, isOthers)
            : await prisma.product.findMany({
                  where: {
                      status: { notIn: ["DELETE", "PENDING", "BLOCK"] },
                      ...(isOthers
                          ? { OR: OTHERS_PRODUCT_FILTER }
                          : { NOT: OTHERS_PRODUCT_FILTER }),
                  },
                  select: PRODUCT_SELECT,
              });

        if (products.length === 0) throw new ApiError(404, "Tidak ada produk aktif ditemukan.");
        const productIds = products.map((p) => p.id);

        const histMonths = 14;
        const histPeriods: { month: number; year: number }[] = [];
        // Fetch up to current month (M) to support "Forecast 1" anchor logic
        for (let i = histMonths - 1; i >= -1; i--) {
            const d = new Date(Date.UTC(anchorYear, anchorMonth - 1 - i, 1));
            histPeriods.push({ month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
        }
        const histPeriodFilter = histPeriods.map((p) => ({ month: p.month, year: p.year }));

        const [anchorM1Sales, anchorM0Sales, historicalSales] = await Promise.all([
            prisma.productIssuance.findMany({
                where: {
                    product_id: { in: productIds },
                    month: anchorMonth,
                    year: anchorYear,
                    type: "ALL",
                },
                select: { product_id: true, quantity: true },
            }),
            prisma.productIssuance.findMany({
                where: {
                    product_id: { in: productIds },
                    month: start_month,
                    year: start_year,
                    type: "ALL",
                },
                select: { product_id: true, quantity: true },
            }),
            prisma.productIssuance.findMany({
                where: { product_id: { in: productIds }, type: "ALL", OR: histPeriodFilter },
            }),
        ]);

        const anchorSalesSet = new Set([
            ...anchorM1Sales.map((s) => s.product_id),
            ...anchorM0Sales.map((s) => s.product_id),
        ]);
        
        const anchorM1Map = new Map(anchorM1Sales.map((s) => [s.product_id, Number(s.quantity)]));
        const anchorM0Map = new Map(anchorM0Sales.map((s) => [s.product_id, Number(s.quantity)]));
        if (anchorSalesSet.size === 0) {
            throw new ApiError(
                400,
                `Tidak ada data sales pada bulan anchor ${anchorMonth}/${anchorYear} (M-1). Forecast tidak bisa dijalankan.`,
            );
        }

        const salesLookup = new Map<string, number>();
        for (const s of historicalSales) {
            salesLookup.set(`${s.product_id}|${s.month}|${s.year}`, Number(s.quantity));
        }

        const histMap = new Map<number, number[]>();
        for (const pid of productIds) {
            histMap.set(
                pid,
                histPeriods.map((hp) => salesLookup.get(`${pid}|${hp.month}|${hp.year}`) ?? 0),
            );
        }

        const MIN_DATA = 3;
        const batch: {
            product_id: number;
            month: number;
            year: number;
            base_forecast: number;
            final_forecast: number;
            trend: string;
            model_used: string;
            system_ratio: number;
            additional_ratio: number;
            forecast_for: string;
            generated_in: string;
            is_actionable: boolean;
            absolute_error: number;
        }[] = [];

        const ssBatch: {
            product_id: number;
            month: number;
            year: number;
            mae: number;
            ss_qty: number;
            ss_ratio: number;
            z_value: number;
            total_forecast: number;
            avg_forecast: number;
        }[] = [];

        const skippedProducts: string[] = [];

        for (const product of products) {
            if (!anchorSalesSet.has(product.id)) {
                skippedProducts.push(product.code ?? `ID:${product.id}`);
                continue;
            }

            const rawHistory = histMap.get(product.id) ?? [];
            const firstNonZero = rawHistory.findIndex((v) => v > 0);
            
            // Per requirements: Include M in history if it's "Forecasting 1"
            // But usually history for statistical engine stops at M-1
            const engineHistory = firstNonZero >= 0 ? rawHistory.slice(firstNonZero, -1) : [];

            // MIN_DATA = 1 to allow processing new products
            if (rawHistory.filter((v) => v > 0).length < 1) {
                skippedProducts.push(product.code ?? `ID:${product.id}`);
                continue;
            }

            const { forecasted, modelActuallyUsed, mae: engineMae } = runForecastEngine(
                model_used,
                engineHistory.length >= 2 ? engineHistory : [0, 0], // Fallback for engine
                horizon,
            );

            const m1Actual = anchorM1Map.get(product.id) ?? 0;
            const m0Actual = anchorM0Map.get(product.id) ?? 0;
            const lastActual = rawHistory[rawHistory.length - 2] ?? 0; // M-1
            const currentActual = rawHistory[rawHistory.length - 1] ?? 0; // M
            const firstForecastVal = forecasted[0] ?? 0;
            
            // Per requirement #9: "Forecast 1 maka gunakan Sales Actual M (Bulan ini)"
            // Otherwise use M-1 (Jantung)
            const resolvedAnchorActual = m1Actual > 0 ? m1Actual : m0Actual;
            const deviation1 = Math.abs(firstForecastVal - resolvedAnchorActual);
            
            // Robust MAE Fallback: Ensure MAE is not 0 if there is any deviation
            const mae = engineMae > 0 ? engineMae : (deviation1 > 0 ? deviation1 : 0);
            const system_ratio = lastActual > 0 ? (firstForecastVal - lastActual) / lastActual : 0;

            // Calculate Safety Stock (Mature Mother Formula)
            const zValue = Number(product.z_value ?? 1.65);
            const leadTimeDays = Number(product.lead_time ?? 30);
            const leadTimeFactor = Math.sqrt(leadTimeDays / 30);
            
            const ssQty = zValue * mae * leadTimeFactor; 
            const totalFc = forecasted.reduce((a, b) => a + b, 0);
            const avgFc = horizon > 0 ? totalFc / horizon : 0;
            const ssRatio = avgFc > 0 ? (ssQty / avgFc) * 100 : 0;

            // Store monthly forecasts
            for (let i = 0; i < monthsRange.length; i++) {
                const m = monthsRange[i]!;
                const projected = forecasted[i] ?? 0;

                batch.push({
                    product_id: product.id,
                    month: m.month,
                    year: m.year,
                    base_forecast: isFinite(projected) ? projected : 0,
                    final_forecast: isFinite(projected) ? projected : 0,
                    trend: ForecastService.trend(projected, lastActual),
                    model_used: modelActuallyUsed,
                    system_ratio: isFinite(system_ratio) ? Number(system_ratio.toFixed(4)) : 0,
                    additional_ratio: 0,
                    forecast_for: formatMonthISO(m.year, m.month),
                    generated_in: generatedIn.toISOString().slice(0, 10),
                    is_actionable: i === 0,
                    absolute_error: isFinite(mae) ? mae : 0, // Storing MAE as the error metric
                });
            }

            ssBatch.push({
                product_id: product.id,
                month: start_month,
                year: start_year,
                mae: isFinite(mae) ? mae : 0,
                ss_qty: isFinite(ssQty) ? ssQty : 0,
                ss_ratio: isFinite(ssRatio) ? ssRatio : 0,
                z_value: zValue,
                total_forecast: totalFc,
                avg_forecast: avgFc,
            });
        }

        if (batch.length === 0) {
            return {
                message: `Tidak ada data forecast yang diproses. ${skippedProducts.length} produk dilewati.`,
                processed_records: 0,
                skipped_products: skippedProducts,
            };
        }

        const nowIso = new Date().toISOString();

        try {
            // 1. Bulk Upsert Forecasts
            const CHUNK_SIZE = 2000;
            for (let ci = 0; ci < batch.length; ci += CHUNK_SIZE) {
                const chunk = batch.slice(ci, ci + CHUNK_SIZE);

                const valueRows = chunk.map((f: any) => {
                    const trend = f.trend;
                    const model = f.model_used;
                    return [
                        `(${f.product_id}, ${f.month}, ${f.year},`,
                        `'${trend}'::"Trend", 'DRAFT'::"ForecastStatus",`,
                        `${f.base_forecast}, ${f.final_forecast}, 1, true,`,
                        `'${model}'::"ForecastModel", ${f.system_ratio}, ${f.additional_ratio},`,
                        `'${f.forecast_for}'::date, '${f.generated_in}'::date, ${f.is_actionable},`,
                        `${f.absolute_error},`,
                        `'${nowIso}'::timestamptz, '${nowIso}'::timestamptz)`,
                    ].join(" ");
                }).join(",\n");

                await prisma.$executeRawUnsafe(`
                    INSERT INTO "forecasts" (
                        product_id, month, year, trend, status,
                        base_forecast, final_forecast, version, is_latest,
                        model_used, system_ratio, additional_ratio,
                        forecast_for, generated_in, is_actionable,
                        absolute_error,
                        created_at, updated_at
                    ) VALUES ${valueRows}
                    ON CONFLICT (product_id, month, year)
                    DO UPDATE SET
                        trend            = EXCLUDED.trend,
                        status           = EXCLUDED.status,
                        base_forecast    = EXCLUDED.base_forecast,
                        final_forecast   = EXCLUDED.final_forecast,
                        version          = "forecasts".version + 1,
                        is_latest        = true,
                        model_used       = EXCLUDED.model_used,
                        system_ratio     = EXCLUDED.system_ratio,
                        additional_ratio = EXCLUDED.additional_ratio,
                        forecast_for     = EXCLUDED.forecast_for,
                        generated_in     = EXCLUDED.generated_in,
                        is_actionable    = EXCLUDED.is_actionable,
                        absolute_error   = EXCLUDED.absolute_error,
                        updated_at       = EXCLUDED.updated_at
                `);
            }

            // 2. Bulk Upsert Safety Stock
            for (let ci = 0; ci < ssBatch.length; ci += CHUNK_SIZE) {
                const chunk = ssBatch.slice(ci, ci + CHUNK_SIZE);
                const valueRows = chunk.map((s) => 
                    `(${s.product_id}, ${s.month}, ${s.year}, ${s.mae}, ${s.ss_qty}, ${s.ss_ratio}, ${s.z_value}, 0, ${s.avg_forecast}, ${horizon}, ${s.total_forecast}, '${nowIso}'::timestamptz, '${nowIso}'::timestamptz)`
                ).join(",\n");

                await prisma.$executeRawUnsafe(`
                    INSERT INTO "safety_stock" (
                        product_id, month, year, mean_absolute_error, safety_stock_quantity,
                        safety_stock_ratio, z_value_used, additional_ratio, avg_forecast,
                        horizon, total_forecast, created_at, updated_at
                    ) VALUES ${valueRows}
                    ON CONFLICT (product_id, month, year)
                    DO UPDATE SET
                        mean_absolute_error   = EXCLUDED.mean_absolute_error,
                        safety_stock_quantity = EXCLUDED.safety_stock_quantity,
                        safety_stock_ratio    = EXCLUDED.safety_stock_ratio,
                        z_value_used          = EXCLUDED.z_value_used,
                        avg_forecast          = EXCLUDED.avg_forecast,
                        horizon               = EXCLUDED.horizon,
                        total_forecast        = EXCLUDED.total_forecast,
                        updated_at            = EXCLUDED.updated_at
                `);
            }
        } catch (err) {
            console.error("[Forecast Engine] Bulk Upsert Error:", err);
            throw new ApiError(500, "Gagal melakukan bulk upsert forecast.");
        }

        return {
            message: `Forecast berhasil disimpan: ${batch.length} record.`,
            processed_records: batch.length,
            skipped_products: skippedProducts,
        };
    }

    // ── UPDATE MANUAL — Raw SQL with ON CONFLICT upsert ─────────────────────────

    static async updateManual(body: UpdateManualForecastDTO) {
        const { product_id, month, year, final_forecast, ratio, additional_ratio } = body;

        const product = await prisma.product.findUnique({
            where: { id: product_id },
            include: { product_type: true },
        });
        if (!product) throw new ApiError(404, "Produk tidak ditemukan.");

        const isOthersProduct = await ForecastService.checkIsOthersSlug(product.product_type?.slug);
        
        // Resolve manual ratio (support both 'ratio' and 'additional_ratio')
        const manualRatio = ratio !== undefined ? ratio : (additional_ratio !== undefined ? additional_ratio : undefined);

        const existing = await prisma.forecast.findFirst({
            where: { product_id, month, year, is_latest: true },
        });

        let resolvedBase: number;
        if (existing) {
            resolvedBase = final_forecast !== undefined ? final_forecast : Number(existing.base_forecast);
        } else {
            const prev = new Date(year, month - 2, 1);
            const sales = await prisma.productIssuance.findFirst({
                where: { product_id, month: prev.getMonth() + 1, year: prev.getFullYear(), type: "ALL" },
            });
            resolvedBase = final_forecast !== undefined ? final_forecast : Number(sales?.quantity ?? 0);
        }

        const resolvedRatio = manualRatio !== undefined ? manualRatio : (existing ? Number(existing.ratio ?? existing.additional_ratio ?? 0) : 0);
        const resolvedFinal = resolvedBase * (1 + resolvedRatio / 100);
        const nowIso = new Date().toISOString();
        const trendVal = ForecastService.trend(resolvedFinal, resolvedBase);

        const shouldPropagate = isOthersProduct && final_forecast !== undefined;

        if (!shouldPropagate) {
            // Single-period upsert via ON CONFLICT
            await prisma.$executeRaw`
                INSERT INTO "forecasts" (
                    product_id, month, year, trend, status,
                    base_forecast, final_forecast, ratio, additional_ratio,
                    version, is_latest, model_used, system_ratio,
                    forecast_for, generated_in, is_actionable, adjusted_at,
                    created_at, updated_at
                ) VALUES (
                    ${product_id}, ${month}, ${year},
                    ${trendVal}::"Trend", 'ADJUSTED'::"ForecastStatus",
                    ${resolvedBase}, ${resolvedFinal}, ${resolvedRatio}, ${resolvedRatio},
                    1, true, 'LINEAR_REGRESSION'::"ForecastModel", 0,
                    ${formatMonthISO(year, month)}::date, ${nowIso.slice(0, 10)}::date, false,
                    ${nowIso}::timestamptz, ${nowIso}::timestamptz, ${nowIso}::timestamptz
                )
                ON CONFLICT (product_id, month, year)
                DO UPDATE SET
                    base_forecast    = ${resolvedBase},
                    final_forecast   = ${resolvedFinal},
                    ratio            = ${resolvedRatio},
                    additional_ratio = ${resolvedRatio},
                    trend            = ${trendVal}::"Trend",
                    status           = 'ADJUSTED'::"ForecastStatus",
                    adjusted_at      = ${nowIso}::timestamptz,
                    updated_at       = ${nowIso}::timestamptz
            `;
        } else {
            // Propagate across 12-month horizon for "Others" products
            const horizon = 12;
            const monthsRange = Array.from({ length: horizon }, (_, i) => {
                const d = new Date(year, month - 1 + i, 1);
                return { month: d.getMonth() + 1, year: d.getFullYear() };
            });

            const valueRows = monthsRange.map((m) => {
                const isTarget = m.month === month && m.year === year;
                const mRatio = isTarget ? resolvedRatio : 0;
                const mFinal = resolvedBase * (1 + mRatio / 100);
                return `(${product_id}, ${m.month}, ${m.year}, 'STABLE'::"Trend", 'ADJUSTED'::"ForecastStatus", ` +
                       `${resolvedBase}, ${mFinal}, ${mRatio}, ${mRatio}, ` +
                       `1, true, 'LINEAR_REGRESSION'::"ForecastModel", 0, ` +
                       `'${formatMonthISO(m.year, m.month)}'::date, '${nowIso.slice(0, 10)}'::date, false, ` +
                       `'${nowIso}'::timestamptz, '${nowIso}'::timestamptz)`;
            }).join(",\n");

            await prisma.$executeRawUnsafe(`
                INSERT INTO "forecasts" (
                    product_id, month, year, trend, status,
                    base_forecast, final_forecast, ratio, additional_ratio,
                    version, is_latest, model_used, system_ratio,
                    forecast_for, generated_in, is_actionable,
                    created_at, updated_at
                ) VALUES ${valueRows}
                ON CONFLICT (product_id, month, year)
                DO UPDATE SET
                    base_forecast    = EXCLUDED.base_forecast,
                    final_forecast   = EXCLUDED.final_forecast,
                    ratio            = EXCLUDED.ratio,
                    additional_ratio = EXCLUDED.additional_ratio,
                    trend            = EXCLUDED.trend,
                    status           = EXCLUDED.status,
                    is_latest        = true,
                    updated_at       = EXCLUDED.updated_at
            `);
        }

        return { message: "Forecast berhasil diperbarui secara manual." };
    }

    // ── GET (Merged logic for Engine + New UI features) ──────────────────────

    static async get(query: QueryForecastDTO): Promise<{ data: ResponseForecastDTO[]; len: number }> {
        const now = new Date();
        const anchorMonth = query.start_month ?? now.getMonth() + 1;
        const anchorYear = query.start_year ?? now.getFullYear();
        const anchorDate = new Date(Date.UTC(anchorYear, anchorMonth - 1, 1));
        const monthsWindow = ForecastService.resolveHorizonMonths(anchorDate, query.horizon ?? 12);

        const page = query.page ?? 1;
        const take = query.take ?? 25;
        const { skip, take: limit } = GetPagination(page, take);

        const startYear = monthsWindow[0]!.year;
        const startMonth = monthsWindow[0]!.month;
        const endYear = monthsWindow[monthsWindow.length - 1]!.year;
        const endMonth = monthsWindow[monthsWindow.length - 1]!.month;

        const sysContext = new Date();
        const sysMonth = sysContext.getMonth() + 1;
        const sysYear = sysContext.getFullYear();

        const isOthers = query.is_others ?? query.is_display;
        const searchRaw = query.search ? `%${query.search}%` : null;

        const rangePercentages = await prisma.forecastPercentage.findMany({
            where: { OR: monthsWindow.map((m) => ({ month: m.month, year: m.year })) },
        });
        const pctMap = new Map(rangePercentages.map((p) => [`${p.year}-${p.month}`, p]));

        const where: Prisma.ProductWhereInput = {
            status: { notIn: ["DELETE", "PENDING", "BLOCK"] },
            deleted_at: null,
            ...(isOthers ? { OR: OTHERS_PRODUCT_FILTER } : { NOT: OTHERS_PRODUCT_FILTER }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                ],
            }),
            ...(query.type_id && { type_id: query.type_id }),
            ...(query.size_id && { size_id: query.size_id }),
        };

        const len = await prisma.product.count({ where });
        if (len === 0) return { data: [], len };

        const productsRaw = await prisma.$queryRaw<any[]>`
            SELECT
                p.id, p.code, p.name, ps.size AS "size", pt.name AS "product_type_name", u.name AS "unit_name",
                p.distribution_percentage, p.safety_percentage, COALESCE(pi.quantity, 0)::float8 AS "current_stock",
                p.z_value,
                MAX(COALESCE(f_m1.final_forecast, 0)) OVER(PARTITION BY p.name) as group_sort_priority,
                COALESCE(f_m1.final_forecast, 0) as m1_final_forecast,
                COALESCE(f_m1.base_forecast, 0) as m1_base_forecast,
                COALESCE(f_now.base_forecast, 0) as sys_m0_base_forecast,

                (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'month', f.month, 'year', f.year, 'base_forecast', f.base_forecast, 'final_forecast', f.final_forecast,
                            'trend', f.trend, 'status', f.status, 'ratio', f.ratio, 'additional_ratio', f.additional_ratio,
                            'system_ratio', f.system_ratio, 'model_used', f.model_used, 'is_actionable', f.is_actionable
                        ) ORDER BY f.year ASC, f.month ASC
                    ), '[]'::json)
                    FROM "forecasts" f WHERE f.product_id = p.id AND f.is_latest = true
                    AND (f.year * 12 + f.month) >= ${startYear * 12 + startMonth}
                    AND (f.year * 12 + f.month) <= ${endYear * 12 + endMonth}
                ) AS "forecasts_data",

                (
                    SELECT row_to_json(ss) FROM (
                        SELECT ss.additional_ratio, ss.safety_stock_ratio, ss.mean_absolute_error, ss.z_value_used,
                               ss.month, ss.year, ss.created_at, ss.avg_forecast, ss.total_forecast, ss.horizon, ss.safety_stock_quantity
                        FROM "safety_stock" ss
                        WHERE ss.product_id = p.id 
                        AND (
                            (ss.month = ${startMonth} AND ss.year = ${startYear}) OR 
                            (ss.month = ${sysMonth} AND ss.year = ${sysYear})
                        )
                        ORDER BY (ss.year * 12 + ss.month) DESC LIMIT 1
                    ) ss
                ) AS "safety_stock_data"

            FROM "products" p
            LEFT JOIN "product_types" pt ON pt.id = p.type_id
            LEFT JOIN "unit_of_materials" u ON u.id = p.unit_id
            LEFT JOIN "product_size" ps ON ps.id = p.size_id
            LEFT JOIN "forecasts" f_m1 ON f_m1.product_id = p.id AND f_m1.month = ${startMonth} AND f_m1.year = ${startYear} AND f_m1.is_latest = true
            LEFT JOIN (
                SELECT product_id, SUM(quantity) as quantity FROM product_inventories
                WHERE month = ${startMonth} AND year = ${startYear} GROUP BY product_id
            ) pi ON p.id = pi.product_id
            LEFT JOIN "forecasts" f_now ON f_now.product_id = p.id AND f_now.month = ${sysMonth} AND f_now.year = ${sysYear} AND f_now.is_latest = true
            WHERE p.status NOT IN ('DELETE', 'PENDING', 'BLOCK') AND p.deleted_at IS NULL
            AND (${isOthers ? Prisma.sql`pt.slug IN ('display', 'kertas', 'botol', 'paper-bag', 'kartu-garansi', 'canvas-bag')` : Prisma.sql`pt.slug NOT IN ('display', 'kertas', 'botol', 'paper-bag', 'kartu-garansi', 'canvas-bag') OR pt.slug IS NULL`})
            ${searchRaw ? Prisma.sql`AND (p.name ILIKE ${searchRaw} OR p.code ILIKE ${searchRaw})` : Prisma.empty}
            ORDER BY sys_m0_base_forecast DESC, m1_base_forecast DESC, m1_final_forecast DESC, group_sort_priority DESC, p.name ASC, 
                     CASE WHEN pt.name ILIKE '%EDP%' OR pt.name ILIKE '%Parfum%' OR pt.name ILIKE '%Perfume%' THEN 1 WHEN pt.name ILIKE '%Atomizer%' THEN 2 ELSE 3 END ASC,
                     ps.size DESC NULLS LAST, p.id ASC
            LIMIT ${limit} OFFSET ${skip}
        `;

        const anchorRefDate = new Date(Date.UTC(startYear, startMonth - 2, 1));
        const actualSales = await prisma.productIssuance.findMany({
            where: { 
                product_id: { in: productsRaw.map((p) => p.id) }, type: "ALL",
                OR: [...monthsWindow.map((m) => ({ month: m.month, year: m.year })), { month: anchorRefDate.getUTCMonth() + 1, year: anchorRefDate.getUTCFullYear() }]
            },
        });
        const actualSalesMap = new Map(actualSales.map((s) => [`${s.product_id}|${s.month}|${s.year}`, Number(s.quantity)]));

        const data: ResponseForecastDTO[] = productsRaw.map((p) => {
            const forecasts = typeof p.forecasts_data === "string" ? JSON.parse(p.forecasts_data) : (p.forecasts_data ?? []);
            const ssRaw = typeof p.safety_stock_data === "string" ? JSON.parse(p.safety_stock_data) : p.safety_stock_data;
            const addSsRatio = ssRaw ? Number(ssRaw.additional_ratio ?? 0) : 0;
            const engineSsRatio = ssRaw ? Number(ssRaw.safety_stock_ratio ?? 0) : 0;
            const totalSsRatio = engineSsRatio + addSsRatio;

            const monthly_data = monthsWindow.map((m) => {
                const f = forecasts.find((x: any) => x.month === m.month && x.year === m.year);
                return {
                    month: m.month, year: m.year, period: `${m.month}/${m.year}`,
                    base_forecast: Number(f?.base_forecast ?? 0),
                    final_forecast: (Number(f?.final_forecast ?? f?.base_forecast ?? 0)) * (1 + totalSsRatio / 100),
                    trend: f?.trend ?? "STABLE", status: f?.status ?? null, is_current_month: m.is_current_month, is_actionable: f?.is_actionable ?? false,
                    ratio: Number(f?.ratio ?? 0), additional_ratio: Number(f?.additional_ratio ?? 0), system_ratio: Number(f?.system_ratio ?? 0),
                    model_used: f?.model_used ?? null, actual_sales: actualSalesMap.get(`${p.id}|${m.month}|${m.year}`) ?? null,
                    percentage_value: pctMap.has(`${m.year}-${m.month}`) ? Number((Number(pctMap.get(`${m.year}-${m.month}`)!.value) * 100).toFixed(2)) : null,
                };
            });

            const totalForecast = monthly_data.reduce((sum, m) => sum + m.final_forecast, 0);
            const anchorM1Value = actualSalesMap.get(`${p.id}|${anchorRefDate.getUTCMonth() + 1}|${anchorRefDate.getUTCFullYear()}`) ?? null;
            const anchorM0Value = actualSalesMap.get(`${p.id}|${sysMonth}|${sysYear}`) ?? null;
            const resolvedAnchorSales = anchorM1Value !== null ? anchorM1Value : anchorM0Value;

            return {
                product_id: p.id, product_code: p.code, product_name: p.name, product_type: p.product_type_name ?? "",
                product_size: `${p.size ?? ""} ${p.unit_name ?? ""}`.trim(), z_value: Number(p.z_value ?? 1.65),
                distribution_percentage: p.distribution_percentage ? Number((Number(p.distribution_percentage) * 100).toFixed(2)) : 0,
                safety_percentage: p.safety_percentage ? Number((Number(p.safety_percentage) * 100).toFixed(2)) : 0,
                current_stock: Number(p.current_stock ?? 0), 
                need_produce: Math.max(0, (monthly_data[0]?.final_forecast ?? 0) - Number(p.current_stock ?? 0)),
                total_forecast: totalForecast, add_ss_ratio: addSsRatio,
                anchor_actual_sales: resolvedAnchorSales,
                anchor_period: anchorM1Value !== null ? `${anchorRefDate.getUTCMonth() + 1}/${anchorRefDate.getUTCFullYear()}` : `${sysMonth}/${sysYear}`,
                safety_stock: ssRaw ? Number(ssRaw.safety_stock_quantity ?? 0) : 0,
                total_demand: totalForecast + (ssRaw ? Number(ssRaw.safety_stock_quantity ?? 0) : 0),
                monthly_data,
                safety_stock_summary: ssRaw ? {
                    safety_stock_quantity: Number(ssRaw.safety_stock_quantity),
                    safety_stock_ratio: Number(ssRaw.safety_stock_ratio),
                    additional_ratio: Number(ssRaw.additional_ratio),
                    avg_forecast: Number(ssRaw.avg_forecast),
                    total_forecast: Number(ssRaw.total_forecast),
                    total_demand: totalForecast + Number(ssRaw.safety_stock_quantity),
                    last_updated: ssRaw.created_at,
                } : null,
            };
        });

        return { data, len };
    }

    static async detail(product_id: number, month: number, year: number) {
        const row = await prisma.forecast.findFirst({ where: { product_id, month, year, is_latest: true } });
        if (!row) throw new ApiError(404, "Data forecast tidak ditemukan");
        return {
            ...row,
            base_forecast: Number(row.base_forecast),
            final_forecast: row.final_forecast != null ? Number(row.final_forecast) : null,
            system_ratio: row.system_ratio != null ? Number(row.system_ratio) : null,
            additional_ratio: row.additional_ratio != null ? Number(row.additional_ratio) : null,
            ratio: row.ratio != null ? Number(row.ratio) : null,
        };
    }

    static async finalize(data: FinalizeForecastDTO) {
        const result = await prisma.forecast.updateMany({
            where: { month: data.month, year: data.year, status: "DRAFT", is_latest: true },
            data: { status: "FINALIZED", is_actionable: true },
        });
        return { count: result.count };
    }

    static async deleteByPeriod(data: DeleteForecastByPeriodDTO) {
        const result = await prisma.forecast.deleteMany({ where: { month: data.month, year: data.year } });
        return { count: result.count };
    }

    static async destroyById(id: number) {
        await prisma.forecast.delete({ where: { id } });
    }

    static async resetByProduct(product_id: number) {
        const forecast = await prisma.forecast.deleteMany({ where: { product_id } });
        const safety_stock = await prisma.safetyStock.deleteMany({ where: { product_id } });
        return { forecast: forecast.count, safety_stock: safety_stock.count };
    }

    static async upsertSafetyRatio(body: UpsertSafetyRatioDTO) {
        const { product_id, month, year, add_ss_ratio } = body;
        const product = await prisma.product.findUnique({ where: { id: product_id }, select: { z_value: true } });
        if (!product) throw new ApiError(404, "Produk tidak ditemukan.");

        return prisma.safetyStock.upsert({
            where: { product_id_month_year: { product_id, month, year } },
            create: {
                product_id, month, year, mean_absolute_error: 0, safety_stock_quantity: 0,
                safety_stock_ratio: 0, z_value_used: Number(product.z_value ?? 1.65), additional_ratio: add_ss_ratio,
            },
            update: { additional_ratio: add_ss_ratio },
        });
    }

    private static async loadVariantsByProductId(product_id: number, isOthers: boolean = false) {
        const product = await prisma.product.findUnique({ where: { id: product_id } });
        if (!product) return [];
        return prisma.product.findMany({
            where: {
                name: { contains: product.name, mode: "insensitive" },
                status: "ACTIVE",
                ...(isOthers ? { OR: OTHERS_PRODUCT_FILTER } : { NOT: OTHERS_PRODUCT_FILTER }),
            },
            select: PRODUCT_SELECT,
        });
    }

    private static async checkIsOthersSlug(slug: string | null | undefined) {
        if (!slug) return false;
        const s = slug.toLowerCase();
        return ["display", "kertas", "botol", "paper-bag", "kartu-garansi", "canvas-bag"].some(x => s.includes(x));
    }

    private static resolveHorizonMonths(now: Date, horizon: number) {
        const currentMonth = now.getUTCMonth() + 1;
        const currentYear = now.getUTCFullYear();
        return Array.from({ length: horizon }, (_, i) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
            const m = d.getUTCMonth() + 1;
            const y = d.getUTCFullYear();
            return { month: m, year: y, is_current_month: m === currentMonth && y === currentYear };
        });
    }

    private static trend(forecast: number, input: number): "UP" | "DOWN" | "STABLE" {
        if (forecast > input) return "UP";
        if (forecast < input) return "DOWN";
        return "STABLE";
    }
}
