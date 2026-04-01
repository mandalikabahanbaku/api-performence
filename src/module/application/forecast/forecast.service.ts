import prisma from "../../../config/prisma.js";
import { Prisma, $Enums } from "../../../generated/prisma/client.js";
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
    code: true,
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

        // anchor = M-1 (last known sales month); forecast covers M..M+horizon-1
        const anchorDate = new Date(Date.UTC(start_year, start_month - 2, 1));
        const anchorMonth = anchorDate.getUTCMonth() + 1;
        const anchorYear = anchorDate.getUTCFullYear();

        const monthsRange = Array.from({ length: horizon }, (_, i) => {
            const d = new Date(Date.UTC(start_year, start_month - 1 + i, 1));
            return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
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

        const histMonths = 14;
        const histPeriods: { month: number; year: number }[] = [];
        for (let i = histMonths - 1; i >= 0; i--) {
            const d = new Date(Date.UTC(anchorYear, anchorMonth - 1 - i, 1));
            histPeriods.push({ month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
        }
        const histPeriodFilter = histPeriods.map((p) => ({ month: p.month, year: p.year }));

        // Anchor validation and full history load run in parallel
        const [anchorSalesCheck, historicalSales] = await Promise.all([
            prisma.productIssuance.findMany({
                where: {
                    product_id: { in: productIds },
                    month: anchorMonth,
                    year: anchorYear,
                    type: "ALL",
                },
                select: { product_id: true },
            }),
            prisma.productIssuance.findMany({
                where: { product_id: { in: productIds }, type: "ALL", OR: histPeriodFilter },
            }),
        ]);

        const anchorSalesSet = new Set(anchorSalesCheck.map((s) => s.product_id));
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
            trend: $Enums.Trend;
            model_used: $Enums.ForecastModel;
            system_ratio: number;
            additional_ratio: number;
            forecast_for: Date;
            generated_in: Date;
            is_actionable: boolean;
        }[] = [];

        const skippedProducts: string[] = [];

        for (const product of products) {
            if (!anchorSalesSet.has(product.id)) {
                skippedProducts.push(product.code ?? `ID:${product.id}`);
                continue;
            }

            const rawHistory = histMap.get(product.id) ?? [];
            const firstNonZero = rawHistory.findIndex((v) => v > 0);
            const history = firstNonZero >= 0 ? rawHistory.slice(firstNonZero) : rawHistory;

            if (history.filter((v) => v > 0).length < MIN_DATA) {
                skippedProducts.push(product.code ?? `ID:${product.id}`);
                continue;
            }

            const { forecasted, modelActuallyUsed } = runForecastEngine(
                model_used,
                history,
                horizon,
            );

            const lastActual = history[history.length - 1] ?? 0;
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
                    final_forecast: projected, // Statistical buffer added dynamically in get()
                    trend: ForecastService.trend(projected, lastActual),
                    model_used: modelActuallyUsed as $Enums.ForecastModel,
                    system_ratio: Number(system_ratio.toFixed(4)),
                    additional_ratio: 0,
                    forecast_for: new Date(formatMonthISO(m.year, m.month)),
                    generated_in: generatedIn,
                    is_actionable: i === 0,
                });
            }
        }

        if (batch.length === 0) {
            return {
                message: `Tidak ada data forecast yang diproses. ${skippedProducts.length} produk dilewati.`,
                processed_records: 0,
                safety_stock_records: 0,
                skipped_products: skippedProducts,
            };
        }

        const periodSet = new Set(batch.map((b) => `${b.product_id}|${b.month}|${b.year}`));
        const periodTuples = Array.from(periodSet).map((k) => {
            const [pid, mo, yr] = k.split("|").map(Number);
            return { product_id: pid!, month: mo!, year: yr! };
        });
        const periodFilter = periodTuples.map((p) => ({
            product_id: p.product_id,
            month: p.month,
            year: p.year,
        }));

        const existingLatest = await prisma.forecast.findMany({
            where: {
                is_latest: true,
                OR: periodFilter,
            },
            select: { product_id: true, month: true, year: true, version: true },
            orderBy: { version: "desc" },
        });

        const versionMap = new Map<string, number>();
        for (const row of existingLatest) {
            const key = `${row.product_id}|${row.month}|${row.year}`;
            if (!versionMap.has(key)) versionMap.set(key, row.version);
        }

        const now = new Date();

        try {
            const chunkSize = 4000;
            await prisma.$transaction(
                async (tx) => {
                    await tx.forecast.updateMany({
                        where: { is_latest: true, OR: periodFilter },
                        data: { is_latest: false },
                    });

                    for (let i = 0; i < batch.length; i += chunkSize) {
                        const chunk = batch.slice(i, i + chunkSize);
                        await tx.forecast.createMany({
                            data: chunk.map((f) => ({
                                product_id: f.product_id,
                                month: f.month,
                                year: f.year,
                                trend: f.trend,
                                status: $Enums.ForecastStatus.DRAFT,
                                base_forecast: isFinite(f.base_forecast) ? f.base_forecast : 0,
                                final_forecast: isFinite(f.final_forecast) ? f.final_forecast : 0,
                                version:
                                    (versionMap.get(`${f.product_id}|${f.month}|${f.year}`) ?? 0) +
                                    1,
                                is_latest: true,
                                model_used: f.model_used,
                                system_ratio: isFinite(f.system_ratio) ? f.system_ratio : 0,
                                additional_ratio: isFinite(f.additional_ratio)
                                    ? f.additional_ratio
                                    : 0,
                                forecast_for: f.forecast_for,
                                generated_in: f.generated_in,
                                is_actionable: f.is_actionable,
                                created_at: now,
                                updated_at: now,
                            })),
                        });
                    }
                },
                { timeout: 60000 },
            );
        } catch (err) {
            console.error("[Forecast Engine] Bulk Insert Error:", err);
            throw new ApiError(500, "Gagal melakukan bulk insert forecast.");
        }

        return {
            message: `Forecast berhasil disimpan: ${batch.length} record.`,
            processed_records: batch.length,
            safety_stock_records: 0,
            skipped_products: skippedProducts,
        };
    }

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
            resolvedBase =
                final_forecast !== undefined ? final_forecast : Number(existing.base_forecast);
        } else {
            const prevMonth = month === 1 ? 12 : month - 1;
            const prevYear = month === 1 ? year - 1 : year;
            const sales = await prisma.productIssuance.findFirst({
                where: { product_id, month: prevMonth, year: prevYear, type: "ALL" },
            });
            resolvedBase =
                final_forecast !== undefined ? final_forecast : Number(sales?.quantity ?? 0);
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
                    product_id,
                    month,
                    year,
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

            await prisma.$transaction(
                async (tx) => {
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
                },
                { timeout: 30000 },
            );
        }

        return { message: "Forecast berhasil diperbarui secara manual." };
    }

    // ── GET LIST ──────────────────────────────────────────────────────────────

    static async get(
        query: QueryForecastDTO,
    ): Promise<{ data: ResponseForecastDTO[]; len: number }> {
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

        // Stable sort reference (System Now)
        const sysContext = new Date();
        const sysMonth = sysContext.getMonth() + 1;
        const sysYear = sysContext.getFullYear();

        const searchRaw = query.search ? `%${query.search}%` : null;

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
                m1_final_forecast: number | null;
                m1_base_forecast: number | null;
                sys_m0_base_forecast: number | null;
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
                COALESCE(f_m1.base_forecast, 0) as m1_base_forecast,
                COALESCE(f_now.base_forecast, 0) as sys_m0_base_forecast,

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
                            'is_actionable',    f.is_actionable,
                            'actual_sales',     (
                                SELECT pis.quantity
                                FROM "product_issuances" pis
                                WHERE pis.product_id = f.product_id
                                  AND pis.month = f.month
                                  AND pis.year = f.year
                                  AND pis.type = 'ALL'
                                LIMIT 1
                            )
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
            LEFT JOIN "forecasts" f_now ON f_now.product_id = p.id
                AND f_now.month = ${sysMonth} AND f_now.year = ${sysYear}
                AND f_now.is_latest = true
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
                sys_m0_base_forecast DESC,
                m1_base_forecast DESC,
                m1_final_forecast DESC,
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

        // Include anchor month (M-1) for UI context (to show what was used as forecast input)
        const anchorRefDate = new Date(Date.UTC(startYear, startMonth - 2, 1));
        const anchorRefMonth = anchorRefDate.getUTCMonth() + 1;
        const anchorRefYear = anchorRefDate.getUTCFullYear();

        // Fetch actual sales for window + anchor month
        const actualSales = await prisma.productIssuance.findMany({
            where: {
                product_id: { in: productsRaw.map((p) => p.id) },
                type: "ALL",
                OR: [
                    ...monthsWindow.map((m) => ({ month: m.month, year: m.year })),
                    { month: anchorRefMonth, year: anchorRefYear },
                ],
            },
            select: { product_id: true, month: true, year: true, quantity: true },
        });

        const actualSalesMap = new Map<string, number>();
        for (const s of actualSales) {
            actualSalesMap.set(`${s.product_id}|${s.month}|${s.year}`, Number(s.quantity));
        }

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
                actual_sales: string | null; // This might be null if no forecast entry exists
            }[] =
                typeof p.forecasts_data === "string"
                    ? JSON.parse(p.forecasts_data)
                    : (p.forecasts_data ?? []);

            const forecastByKey = new Map(rawForecasts.map((f) => [`${f.year}-${f.month}`, f]));

            const ss =
                typeof p.safety_stock_data === "string"
                    ? JSON.parse(p.safety_stock_data)
                    : p.safety_stock_data;

            const monthly_data: ResponseForecastDTO["monthly_data"] = monthsWindow.map((m) => {
                const forecast = forecastByKey.get(`${m.year}-${m.month}`);
                const actual = actualSalesMap.get(`${p.id}|${m.month}|${m.year}`);

                return {
                    month: m.month,
                    year: m.year,
                    period: `${m.month}/${m.year}`,
                    base_forecast: Number(forecast?.base_forecast ?? 0),
                    final_forecast:
                        forecast?.final_forecast != null ? Number(forecast.final_forecast) : null,
                    deviation: null,
                    trend: forecast?.trend ?? "STABLE",
                    status: forecast?.status ?? null,
                    is_current_month: m.is_current_month,
                    is_actionable: forecast?.is_actionable ?? false,
                    additional_ratio:
                        forecast?.additional_ratio != null ? Number(forecast.additional_ratio) : 0,
                    system_ratio:
                        forecast?.system_ratio != null ? Number(forecast.system_ratio) : 0,
                    model_used: forecast?.model_used ?? null,
                    actual_sales:
                        actual ??
                        (forecast?.actual_sales != null ? Number(forecast.actual_sales) : null),
                    percentage_value: pctMap.has(`${m.year}-${m.month}`)
                        ? Number(
                              (Number(pctMap.get(`${m.year}-${m.month}`)!.value) * 100).toFixed(2),
                          )
                        : null,
                    safety_stock_pct: null, // filled in below after MAE is computed
                };
            });

            const anchorActual = actualSalesMap.get(`${p.id}|${anchorRefMonth}|${anchorRefYear}`);

            // Deviation: |base_forecast - prev_actual| (prev_actual = anchor for M1, previous month for rest)
            monthly_data.forEach((m, idx) => {
                const prevActual =
                    idx > 0 ? monthly_data[idx - 1]?.actual_sales : (anchorActual ?? null);
                m.deviation =
                    prevActual != null
                        ? Math.abs(Number(m.base_forecast) - Number(prevActual))
                        : null;
            });

            // 4. Dynamic MAE: Average of Deviations (|Base - PrevActual|) across the visible horizon.
            const zVal = Number(p.z_value ?? 1.65);
            const validDeviations = monthly_data.filter((m) => m.deviation !== null);
            const computedMae =
                validDeviations.length > 0
                    ? validDeviations.reduce((sum, m) => sum + m.deviation!, 0) /
                      validDeviations.length
                    : ss?.mean_absolute_error
                      ? Number(ss.mean_absolute_error)
                      : 0;

            // SS quantity = MAE × z_value
            const computedSsQty = computedMae * zVal;

            // 5. Per-month %SAFETY = (SS_qty / Base Forecast) + 35%
            monthly_data.forEach((m) => {
                const base = Number(m.base_forecast);

                // %SAFETY calculation (Ratio)
                m.safety_stock_pct =
                    base > 0 ? Number((computedSsQty / base + 0.35).toFixed(4)) : 0.35;

                // Dynamically set Final Forecast for non-finalized (DRAFT/null) records
                if (!m.status || m.status === "DRAFT") {
                    m.final_forecast = Math.abs(base * (1 + m.safety_stock_pct));
                }
            });

            const m1MonthData = monthly_data.find(
                (m) => m.month === startMonth && m.year === startYear,
            );
            const m1Forecast = m1MonthData?.final_forecast ?? 0;
            const currentStock = Number(p.current_stock ?? 0);
            const needProduce = Math.max(0, m1Forecast - currentStock);

            const totalForecast = monthly_data.reduce(
                (sum, m) => sum + Number(m.final_forecast ?? m.base_forecast ?? 0),
                0,
            );

            // Total Demand now matches Total Forecast as buffer is integrated
            const totalDemand = totalForecast;

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
                total_forecast: totalForecast,
                total_demand: totalDemand,
                anchor_actual_sales: anchorActual ?? null,
                anchor_period: `${anchorRefMonth}/${anchorRefYear}`,
                monthly_data,
                safety_stock_summary: {
                    safety_stock_quantity:
                        ss?.safety_stock_quantity != null ? Number(ss.safety_stock_quantity) : null,
                    safety_stock_ratio:
                        ss?.safety_stock_ratio != null ? Number(ss.safety_stock_ratio) : null,
                    mean_absolute_error:
                        ss?.mean_absolute_error != null ? Number(ss.mean_absolute_error) : null,
                    z_value_used: ss?.z_value_used != null ? Number(ss.z_value_used) : null,
                    additional_ratio:
                        ss?.additional_ratio != null ? Number(ss.additional_ratio) : null,
                    last_updated: ss?.created_at ? new Date(ss.created_at) : null,
                    computed_mae: Number(computedMae.toFixed(2)),
                    computed_ss_quantity: Number(computedSsQty.toFixed(2)),
                },
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
        if (result.count === 0)
            throw new ApiError(400, "Tidak ada data forecast untuk dihapus pada periode ini");
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

    private static resolveHorizonMonths(anchor: Date, horizon: number) {
        const startYear = anchor.getFullYear();
        const startMonth = anchor.getMonth(); // 0-indexed

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        return Array.from({ length: horizon }, (_, i) => {
            // anchor month (M+0) as the first column
            const d = new Date(startYear, startMonth + i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            return {
                year: y,
                month: m,
                is_current_month: m === currentMonth && y === currentYear,
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
            throw new ApiError(
                404,
                `Tidak ada variasi produk aktif ditemukan untuk "${target.name}".`,
            );
        }
        return variations;
    }

    private static trend(forecast: number, input: number): "UP" | "DOWN" | "STABLE" {
        if (forecast > input) return "UP";
        if (forecast < input) return "DOWN";
        return "STABLE";
    }
}
