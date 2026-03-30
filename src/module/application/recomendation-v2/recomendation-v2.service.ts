import { Prisma } from "../../../generated/prisma/client.js";
import prisma from "../../../config/prisma.js";
import {
    QueryRecomendationV2DTO,
    RequestApproveWorkOrderDTO,
    RequestSaveWorkOrderDTO,
    RequestBulkSaveHorizonDTO,
} from "./recomendation-v2.schema.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import ExcelJS from "exceljs";

export class RecomendationV2Service {
    static async list(query: QueryRecomendationV2DTO) {
        const {
            search,
            page,
            take,
            month,
            year,
            type,
            sales_months = 3,
            forecast_months = 3,
        } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const now = new Date();
        const currentMonth = month ?? now.getMonth() + 1;
        const currentYear = year ?? now.getFullYear();

        const salesPeriods: { month: number; year: number; key: string }[] = [];
        for (let i = sales_months; i >= 1; i--) {
            let m = currentMonth - i;
            let y = currentYear;
            while (m <= 0) {
                m += 12;
                y -= 1;
            }
            salesPeriods.push({ month: m, year: y, key: `${m}-${y}` });
        }

        const forecastPeriods: { month: number; year: number; key: string }[] = [];
        for (let i = 0; i < forecast_months; i++) {
            let m = currentMonth + i;
            let y = currentYear;
            while (m > 12) {
                m -= 12;
                y += 1;
            }
            forecastPeriods.push({ month: m, year: y, key: `${m}-${y}` });
        }

        const poPeriods: { month: number; year: number; key: string }[] = [];
        for (let i = -1; i <= 1; i++) {
            let m = currentMonth + i;
            let y = currentYear;
            while (m <= 0) {
                m += 12;
                y -= 1;
            }
            while (m > 12) {
                m -= 12;
                y += 1;
            }
            poPeriods.push({ month: m, year: y, key: `${m}-${y}` });
        }

        const slStartM = salesPeriods[0]?.month || currentMonth;
        const slStartY = salesPeriods[0]?.year || currentYear;
        const slEndM = salesPeriods[salesPeriods.length - 1]?.month || currentMonth;
        const slEndY = salesPeriods[salesPeriods.length - 1]?.year || currentYear;

        const fcStartM = forecastPeriods[0]?.month || currentMonth;
        const fcStartY = forecastPeriods[0]?.year || currentYear;
        const fcEndM = forecastPeriods[forecastPeriods.length - 1]?.month || currentMonth;
        const fcEndY = forecastPeriods[forecastPeriods.length - 1]?.year || currentYear;

        const cleanSearch = search?.trim();
        const searchRaw = cleanSearch ? `%${cleanSearch}%` : null;
        const searchFilter = searchRaw
            ? Prisma.sql`AND (
                rm.name ILIKE ${searchRaw} 
                OR rm.barcode ILIKE ${searchRaw} 
                OR s.name ILIKE ${searchRaw} 
                OR rmc.name ILIKE ${searchRaw}
                OR urm.name ILIKE ${searchRaw}
              )`
            : Prisma.empty;

        const typeFilter = (() => {
            switch (type) {
                case "ffo":
                    return Prisma.sql`(rmc.slug ILIKE '%fragrance-oil%' OR rmc.slug ILIKE '%ffo%')`;
                case "lokal":
                    return Prisma.sql`(rmc.slug IS NULL OR rmc.slug NOT ILIKE '%fragrance-oil%') AND (s.country ILIKE 'LOCAL' OR s.country IS NULL)`;
                case "impor":
                    return Prisma.sql`(rmc.slug IS NULL OR rmc.slug NOT ILIKE '%fragrance-oil%') AND s.country ILIKE 'IMPORT'`;
                default:
                    return Prisma.sql`1=1`;
            }
        })();

        // Fetch latest available inventory periods
        const latestInv = await prisma.rawMaterialInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });
        let invMonth = currentMonth;
        let invYear = currentYear;

        if (latestInv) {
            const filterTime = currentYear * 12 + currentMonth;
            const latestTime = latestInv.year * 12 + latestInv.month;
            if (filterTime > latestTime) {
                invMonth = latestInv.month;
                invYear = latestInv.year;
            }
        }

        const latestFgInv = await prisma.productInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });
        let fgInvMonth = currentMonth;
        let fgInvYear = currentYear;

        if (latestFgInv) {
            const filterTime = currentYear * 12 + currentMonth;
            const latestTime = latestFgInv.year * 12 + latestFgInv.month;
            if (filterTime > latestTime) {
                fgInvMonth = latestFgInv.month;
                fgInvYear = latestFgInv.year;
            }
        }

        const fcStart = fcStartY * 12 + fcStartM;
        const fcEnd = fcEndY * 12 + fcEndM;

        // Main Query with calculation and sorting
        const rows = await prisma.$queryRaw<any[]>`
            WITH 
                -- Pre-calculate product-level dynamic safety stock based on forecast horizon
                prod_stats AS (
                    SELECT 
                        f.product_id,
                        SUM(f.final_forecast) as total_forecast_horizon,
                        p.safety_percentage
                    FROM "forecasts" f
                    JOIN "products" p ON p.id = f.product_id
                    WHERE (f.year * 12 + f.month) >= ${fcStart}
                      AND (f.year * 12 + f.month) <= ${fcEnd}
                    GROUP BY f.product_id, p.safety_percentage
                ),
                prod_dynamic_ss AS (
                    SELECT 
                        product_id,
                        (total_forecast_horizon / ${forecast_months}::numeric * safety_percentage) as dynamic_ss_qty
                    FROM prod_stats
                ),
                rm_forecast_agg AS (
                    SELECT
                        rm.id AS raw_mat_id,
                        -- Forecast needed for the ENTIRE horizon
                        COALESCE(SUM(f.final_forecast * rec.quantity * 
                            CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                        ), 0) AS total_forecast_needed,
                        -- Forecast needed for ONLY the current month (M)
                        COALESCE(SUM(
                            CASE WHEN f.month = ${currentMonth} AND f.year = ${currentYear} 
                            THEN f.final_forecast * rec.quantity * CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                            ELSE 0 END
                        ), 0) AS m1_forecast_needed
                    FROM "raw_materials" rm
                    JOIN "recipes" rec ON rec.raw_mat_id = rm.id AND rec.is_active = true
                    JOIN "forecasts" f ON f.product_id = rec.product_id
                    LEFT JOIN "unit_raw_materials" urm ON urm.id = rm.unit_id
                    JOIN "products" p ON p.id = f.product_id
                    LEFT JOIN "product_size" ps ON ps.id = p.size_id
                    WHERE (f.year * 12 + f.month) >= ${fcStart}
                      AND (f.year * 12 + f.month) <= ${fcEnd}
                    GROUP BY rm.id
                ),
                rm_stock_ss_agg AS (
                    SELECT
                        rm.id AS raw_mat_id,
                        -- Dynamic Safety Stock x Recipe
                        COALESCE(SUM(
                            dss.dynamic_ss_qty * rec.quantity * 
                            CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                        ), 0) AS dynamic_ss_x_resep,
                        -- FG Stock (Physical FG) x Recipe
                        COALESCE(SUM(
                            COALESCE(pi_agg.total_qty, 0) * rec.quantity * 
                            CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                        ), 0) AS stock_fg_x_resep
                    FROM "raw_materials" rm
                    JOIN "recipes" rec ON rec.raw_mat_id = rm.id AND rec.is_active = true
                    JOIN "products" p ON p.id = rec.product_id
                    LEFT JOIN "unit_raw_materials" urm ON urm.id = rm.unit_id
                    LEFT JOIN "product_size" ps ON ps.id = p.size_id
                    LEFT JOIN prod_dynamic_ss dss ON dss.product_id = p.id
                    LEFT JOIN (
                         SELECT product_id, SUM(quantity) as total_qty
                         FROM "product_inventories"
                         WHERE month = ${fgInvMonth} AND year = ${fgInvYear}
                         GROUP BY product_id
                    ) pi_agg ON pi_agg.product_id = p.id
                    GROUP BY rm.id
                )

            SELECT 
                base.*,
                rank() OVER (ORDER BY forecast_needed DESC, material_name ASC) as ranking
            FROM (
                SELECT
                    rm.id AS material_id,
                    rm.barcode AS barcode,
                    rm.name AS material_name,
                    s.name AS supplier_name,
                    urm.name AS uom,
                    rm.min_buy AS moq,
                    rm.lead_time AS lead_time,

                    -- Physical Stock
                    COALESCE((
                        SELECT SUM(rmi.quantity)
                        FROM "raw_material_inventories" rmi
                        WHERE rmi.raw_material_id = rm.id
                          AND rmi.month = ${invMonth}
                          AND rmi.year = ${invYear}
                    ), 0) AS current_stock,

                    -- Open PO
                    COALESCE((
                        SELECT SUM(po.quantity)
                        FROM "raw_material_open_pos" po
                        WHERE po.raw_material_id = rm.id AND po.status = 'OPEN'
                    ), 0) AS open_po,

                    -- Open PO per month (M-1, M, M+1)
                    (
                        SELECT COALESCE(json_agg(
                             json_build_object(
                                 'month', p_data.m,
                                 'year', p_data.y,
                                 'quantity', p_data.qty
                             )
                        ), '[]'::json)
                        FROM (
                            SELECT 
                                EXTRACT(MONTH FROM po.order_date)::int as m, 
                                EXTRACT(YEAR FROM po.order_date)::int as y, 
                                SUM(po.quantity) as qty
                            FROM "raw_material_open_pos" po
                            WHERE po.raw_material_id = rm.id AND po.status = 'OPEN'
                            GROUP BY 1, 2
                        ) p_data
                    ) AS po_data,

                    COALESCE(fa.m1_forecast_needed, 0) AS forecast_needed,
                    COALESCE(sa.dynamic_ss_x_resep, 0) AS safety_stock_x_resep,
                    COALESCE(sa.stock_fg_x_resep, 0) AS stock_fg_x_resep,
                    COALESCE(fa.total_forecast_needed, 0) AS total_forecast_horizon,

                    -- Historical Sales Data
                    (
                        SELECT COALESCE(json_agg(
                             json_build_object(
                                 'month', ag.month,
                                 'year', ag.year,
                                 'sales', ag.qty
                             )
                        ), '[]'::json)
                        FROM (
                            SELECT sa.month, sa.year, SUM(sa.quantity * rec.quantity * 
                                CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                            ) as qty
                            FROM "product_issuances" sa
                            JOIN "recipes" rec ON rec.product_id = sa.product_id AND rec.is_active = true
                            JOIN "products" p ON p.id = sa.product_id
                            LEFT JOIN "product_size" ps ON ps.id = p.size_id
                            WHERE rec.raw_mat_id = rm.id
                              AND (sa.year * 12 + sa.month) >= ${slStartY * 12 + slStartM}
                              AND (sa.year * 12 + sa.month) <= ${slEndY * 12 + slEndM}
                            GROUP BY sa.month, sa.year
                        ) ag
                    ) AS sales_data,

                    -- Periodical Forecast/Needs Data
                    (
                        SELECT COALESCE(json_agg(
                             json_build_object(
                                 'month', mr.month,
                                 'year', mr.year,
                                 'needs', mr.total_needed
                             )
                        ), '[]'::json)
                        FROM (
                            SELECT f.month, f.year, SUM(f.final_forecast * rec.quantity * 
                                CASE WHEN rm.type = 'FO' OR urm.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                            ) as total_needed
                            FROM "forecasts" f
                            JOIN "recipes" rec ON rec.product_id = f.product_id AND rec.is_active = true
                            JOIN "products" p ON p.id = f.product_id
                            LEFT JOIN "product_size" ps ON ps.id = p.size_id
                            WHERE rec.raw_mat_id = rm.id
                              AND (f.year * 12 + f.month) >= ${fcStartY * 12 + fcStartM}
                              AND (f.year * 12 + f.month) <= ${fcEndY * 12 + fcEndM}
                            GROUP BY f.month, f.year
                        ) mr
                    ) AS needs_data,

                    -- Final Recommendation Calculation
                    -- (Total Forecast Horizon + Dynamic Safety Stock) - (Stock + Total Open PO)
                    GREATEST(0,
                        (COALESCE(fa.total_forecast_needed, 0) + COALESCE(sa.dynamic_ss_x_resep, 0))
                        -
                        (
                            COALESCE((SELECT SUM(rmi.quantity) FROM "raw_material_inventories" rmi WHERE rmi.raw_material_id = rm.id AND rmi.month = ${invMonth} AND rmi.year = ${invYear}), 0) +
                            COALESCE((SELECT SUM(po.quantity) FROM "raw_material_open_pos" po WHERE po.raw_material_id = rm.id AND po.status = 'OPEN'), 0)
                        )
                    ) AS recommendation_val,

                    -- Work Order Info
                    (
                        SELECT json_build_object(
                            'id', mro.id,
                            'status', mro.status,
                            'pic_id', mro.pic_id,
                            'quantity', mro.quantity,
                            'horizon', mro.horizon
                        )
                        FROM "material_purchase_drafts" mro
                        WHERE mro.raw_mat_id = rm.id
                          AND mro.month = ${currentMonth}
                          AND mro.year = ${currentYear}
                        LIMIT 1
                    ) AS work_order_data

                FROM "raw_materials" rm
                LEFT JOIN "unit_raw_materials" urm ON urm.id = rm.unit_id
                LEFT JOIN "raw_mat_categories" rmc ON rmc.id = rm.raw_mat_categories_id
                LEFT JOIN "suppliers" s ON s.id = rm.supplier_id
                LEFT JOIN rm_forecast_agg fa ON fa.raw_mat_id = rm.id
                LEFT JOIN rm_stock_ss_agg sa ON sa.raw_mat_id = rm.id
                WHERE ${typeFilter}
                  AND rm.deleted_at IS NULL
                  AND rm.barcode IS DISTINCT FROM 'FO-ALK'
                  ${searchFilter}
            ) AS base
            ORDER BY 
                ${
                    query.sortBy
                        ? query.sortBy === "material_name"
                            ? Prisma.sql`material_name ${query.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
                            : query.sortBy === "barcode"
                              ? Prisma.sql`barcode ${query.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
                              : query.sortBy === "current_stock"
                                ? Prisma.sql`current_stock ${query.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
                                : query.sortBy === "forecast_needed"
                                  ? Prisma.sql`forecast_needed ${query.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
                                  : query.sortBy === "recommendation_quantity"
                                    ? Prisma.sql`recommendation_val ${query.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
                                    : Prisma.sql`forecast_needed DESC, material_name ASC`
                        : Prisma.sql`forecast_needed DESC, material_name ASC`
                }
            LIMIT ${limit} OFFSET ${skip}
        `;

        const totalQuery = await prisma.$queryRaw<{ count: number }[]>`
            SELECT COUNT(rm.id)::int as count
            FROM "raw_materials" rm
            LEFT JOIN "raw_mat_categories" rmc ON rmc.id = rm.raw_mat_categories_id
            LEFT JOIN "suppliers" s ON s.id = rm.supplier_id
            LEFT JOIN "unit_raw_materials" urm ON urm.id = rm.unit_id
            WHERE ${typeFilter}
              AND rm.deleted_at IS NULL
              AND rm.barcode IS DISTINCT FROM 'FO-ALK'
              ${searchFilter}
        `;

        const data = rows.map((r) => {
            const salesRaw =
                typeof r.sales_data === "string" ? JSON.parse(r.sales_data) : r.sales_data || [];
            const needsRaw =
                typeof r.needs_data === "string" ? JSON.parse(r.needs_data) : r.needs_data || [];
            const poRaw = typeof r.po_data === "string" ? JSON.parse(r.po_data) : r.po_data || [];

            const sales = salesPeriods.map((p) => {
                const found = salesRaw.find((s: any) => s.month === p.month && s.year === p.year);
                return { ...p, quantity: Number(found?.sales || 0) };
            });

            const needs = forecastPeriods.map((p) => {
                const found = needsRaw.find((n: any) => n.month === p.month && n.year === p.year);
                return { ...p, quantity: Number(found?.needs || 0) };
            });

            const open_pos = poPeriods.map((p) => {
                const found = poRaw.find((s: any) => s.month === p.month && s.year === p.year);
                return { ...p, quantity: Number(found?.quantity || 0) };
            });

            const workOrder =
                typeof r.work_order_data === "string"
                    ? JSON.parse(r.work_order_data)
                    : r.work_order_data;

            const horizon = workOrder?.horizon || 0;

            return {
                ranking: Number(r.ranking),
                material_id: r.material_id,
                barcode: r.barcode,
                material_name: r.material_name,
                supplier_name: r.supplier_name,
                moq: Number(r.moq),
                lead_time: r.lead_time,
                uom: r.uom || "UNIT",
                current_stock: Number(r.current_stock),
                open_po: Number(r.open_po),
                stock_fg_x_resep: Number(r.stock_fg_x_resep),
                safety_stock_x_resep: Number(r.safety_stock_x_resep),
                forecast_needed: Number(r.forecast_needed),
                recommendation_quantity: Number(r.recommendation_val),

                // Work Order / Consolidation data
                work_order_id: workOrder?.id || null,
                work_order_status: workOrder?.status || null,
                work_order_pic_id: workOrder?.pic_id || null,
                work_order_quantity: workOrder?.quantity ? Number(workOrder.quantity) : null,
                work_order_horizon: horizon || null,

                sales,
                needs,
                open_pos,
            };
        });

        return {
            data,
            len: Number(totalQuery[0]?.count || 0),
            periods: {
                sales_periods: salesPeriods,
                forecast_periods: forecastPeriods,
                po_periods: poPeriods,
            },
        };
    }

    static async saveWorkOrder(body: RequestSaveWorkOrderDTO) {
        const {
            raw_mat_id,
            month,
            year,
            quantity,
            horizon,
            total_needed,
            current_stock,
            stock_fg_x_resep,
            safety_stock_x_resep,
        } = body;

        return await prisma.materialPurchaseDraft.upsert({
            where: {
                raw_mat_id_month_year: {
                    raw_mat_id,
                    month,
                    year,
                },
            },
            update: {
                quantity,
                horizon,
                total_needed,
                current_stock,
                stock_fg_x_resep,
                safety_stock_x_resep,
                updated_at: new Date(),
            },
            create: {
                raw_mat_id,
                month,
                year,
                quantity,
                horizon,
                total_needed,
                current_stock,
                stock_fg_x_resep,
                safety_stock_x_resep,
            },
        });
    }

    static async approveWorkOrder(body: RequestApproveWorkOrderDTO, userId: string) {
        return await prisma.$transaction(async (tx) => {
            const rec = await tx.materialPurchaseDraft.findUniqueOrThrow({
                where: { id: body.id },
            });

            if (rec.status !== "DRAFT") {
                throw new Error("Only DRAFT work orders can be approved.");
            }

            const newPo = await tx.rawMaterialOpenPo.create({
                data: {
                    raw_material_id: rec.raw_mat_id,
                    quantity: rec.quantity,
                    status: "OPEN",
                },
            });

            // Verify if user exists
            const userExists = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true },
            });

            const updatedRec = await tx.materialPurchaseDraft.update({
                where: { id: body.id },
                data: {
                    status: "ACC",
                    pic_id: userExists ? userId : null,
                    open_po_id: newPo.id,
                },
            });

            return updatedRec;
        });
    }

    static async destroyWorkOrder(id: number) {
        const rec = await prisma.materialPurchaseDraft.findUnique({
            where: { id },
        });

        if (!rec) throw new Error("Work order not found.");
        if (rec.status !== "DRAFT") {
            throw new Error("Only DRAFT work orders can be deleted.");
        }

        return await prisma.materialPurchaseDraft.delete({
            where: { id },
        });
    }

    static async bulkSaveHorizon(body: RequestBulkSaveHorizonDTO) {
        const { month, year, horizon, type } = body;

        const typeFilter = (() => {
            switch (type) {
                case "ffo":
                    return Prisma.sql`(rmc.slug ILIKE '%fragrance-oil%' OR rmc.slug ILIKE '%ffo%')`;
                case "lokal":
                    return Prisma.sql`(rmc.slug IS NULL OR rmc.slug NOT ILIKE '%fragrance-oil%') AND (s.country ILIKE 'LOCAL' OR s.country IS NULL)`;
                case "impor":
                    return Prisma.sql`(rmc.slug IS NULL OR rmc.slug NOT ILIKE '%fragrance-oil%') AND s.country ILIKE 'IMPORT'`;
                default:
                    return Prisma.sql`1=1`;
            }
        })();

        // Fetch latest inventory periods
        const latestInv = await prisma.rawMaterialInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });
        let invMonth = month;
        let invYear = year;

        if (latestInv) {
            const filterTime = year * 12 + month;
            const latestTime = latestInv.year * 12 + latestInv.month;
            if (filterTime > latestTime) {
                invMonth = latestInv.month;
                invYear = latestInv.year;
            }
        }

        const latestFgInv = await prisma.productInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });
        let fgInvMonth = month;
        let fgInvYear = year;

        if (latestFgInv) {
            const filterTime = year * 12 + month;
            const latestTime = latestFgInv.year * 12 + latestFgInv.month;
            if (filterTime > latestTime) {
                fgInvMonth = latestFgInv.month;
                fgInvYear = latestFgInv.year;
            }
        }

        const fcStartM = month;
        const fcStartY = year;

        let fcEndM = month + horizon - 1;
        let fcEndY = year;
        while (fcEndM > 12) {
            fcEndM -= 12;
            fcEndY += 1;
        }

        const now = new Date();
        const fcStart = fcStartY * 12 + fcStartM;
        const fcEnd = fcEndY * 12 + fcEndM;

        // Secure Bulk Upsert using CTEs to pre-compute each aggregation once per material
        return await prisma.$executeRaw`
            WITH
                po_agg AS (
                    SELECT raw_material_id, SUM(quantity)::numeric AS total
                    FROM "raw_material_open_pos"
                    WHERE status = 'OPEN'
                    GROUP BY raw_material_id
                ),
                inv_agg AS (
                    SELECT raw_material_id, SUM(quantity)::numeric AS total
                    FROM "raw_material_inventories"
                    WHERE month = ${invMonth} AND year = ${invYear}
                    GROUP BY raw_material_id
                ),
                fc_agg AS (
                    SELECT rec.raw_mat_id, SUM(f.final_forecast * rec.quantity *
                        CASE WHEN rm2.type = 'FO' OR urm2.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                    )::numeric AS total
                    FROM "forecasts" f
                    JOIN "recipes" rec ON rec.product_id = f.product_id AND rec.is_active = true
                    JOIN "raw_materials" rm2 ON rm2.id = rec.raw_mat_id
                    LEFT JOIN "unit_raw_materials" urm2 ON urm2.id = rm2.unit_id
                    JOIN "products" p ON p.id = f.product_id
                    LEFT JOIN "product_size" ps ON ps.id = p.size_id
                    WHERE (f.year * 12 + f.month) >= ${fcStart} AND (f.year * 12 + f.month) <= ${fcEnd}
                    GROUP BY rec.raw_mat_id
                ),
                ss_agg AS (
                    SELECT 
                        rec.raw_mat_id, 
                        SUM(
                            (
                                (SELECT COALESCE(SUM(f2.final_forecast), 0)
                                 FROM "forecasts" f2
                                 WHERE f2.product_id = p.id
                                   AND (f2.year * 12 + f2.month) >= ${fcStart}
                                   AND (f2.year * 12 + f2.month) <= ${fcEnd}
                                ) / ${horizon}::numeric * p.safety_percentage
                            ) * rec.quantity *
                            CASE WHEN rm2.type = 'FO' OR urm2.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                        )::numeric AS total
                    FROM "recipes" rec
                    JOIN "raw_materials" rm2 ON rm2.id = rec.raw_mat_id
                    LEFT JOIN "unit_raw_materials" urm2 ON urm2.id = rm2.unit_id
                    JOIN "products" p ON p.id = rec.product_id
                    LEFT JOIN "product_size" ps ON ps.id = p.size_id
                    WHERE rec.is_active = true
                    GROUP BY rec.raw_mat_id
                ),
                fg_agg AS (
                    SELECT rec.raw_mat_id, SUM(pi_sub.total_qty * rec.quantity *
                        CASE WHEN rm2.type = 'FO' OR urm2.name ILIKE ANY(ARRAY['ml', 'l', 'liter', 'ML']) THEN COALESCE(ps.size, 1) ELSE 1 END
                    )::numeric AS total
                    FROM "recipes" rec
                    JOIN "raw_materials" rm2 ON rm2.id = rec.raw_mat_id
                    LEFT JOIN "unit_raw_materials" urm2 ON urm2.id = rm2.unit_id
                    JOIN "products" p ON p.id = rec.product_id
                    LEFT JOIN "product_size" ps ON ps.id = p.size_id
                    JOIN (
                        SELECT product_id, SUM(quantity) AS total_qty
                        FROM "product_inventories"
                        WHERE month = ${fgInvMonth} AND year = ${fgInvYear}
                        GROUP BY product_id
                    ) pi_sub ON pi_sub.product_id = rec.product_id
                    WHERE rec.is_active = true
                    GROUP BY rec.raw_mat_id
                )
            INSERT INTO "material_purchase_drafts" (
                raw_mat_id, month, year, quantity, horizon,
                total_needed, current_stock, stock_fg_x_resep, safety_stock_x_resep,
                created_at, updated_at, status
            )
            SELECT
                rm.id AS raw_mat_id,
                ${month} AS month,
                ${year} AS year,
                COALESCE(mro.quantity,
                    GREATEST(0,
                        COALESCE(fc.total, 0)
                        - (COALESCE(inv.total, 0) - COALESCE(ss.total, 0) + COALESCE(po.total, 0))
                    )
                ) AS quantity,
                ${horizon} AS horizon,
                COALESCE(fc.total, 0) AS total_needed,
                COALESCE(inv.total, 0) AS current_stock,
                COALESCE(fg.total, 0) AS stock_fg_x_resep,
                COALESCE(ss.total, 0) AS safety_stock_x_resep,
                ${now} AS created_at,
                ${now} AS updated_at,
                'DRAFT' AS status
            FROM "raw_materials" rm
            LEFT JOIN "unit_raw_materials" urm ON urm.id = rm.unit_id
            LEFT JOIN "raw_mat_categories" rmc ON rmc.id = rm.raw_mat_categories_id
            LEFT JOIN "suppliers" s ON s.id = rm.supplier_id
            LEFT JOIN "material_purchase_drafts" mro
                ON mro.raw_mat_id = rm.id AND mro.month = ${month} AND mro.year = ${year}
            LEFT JOIN po_agg po ON po.raw_material_id = rm.id
            LEFT JOIN inv_agg inv ON inv.raw_material_id = rm.id
            LEFT JOIN fc_agg fc ON fc.raw_mat_id = rm.id
            LEFT JOIN ss_agg ss ON ss.raw_mat_id = rm.id
            LEFT JOIN fg_agg fg ON fg.raw_mat_id = rm.id
            WHERE ${typeFilter}
              AND rm.deleted_at IS NULL
              AND rm.barcode IS DISTINCT FROM 'FO-ALK'
            ON CONFLICT (raw_mat_id, month, year) DO UPDATE SET
                horizon = EXCLUDED.horizon,
                quantity = EXCLUDED.quantity,
                total_needed = EXCLUDED.total_needed,
                current_stock = EXCLUDED.current_stock,
                stock_fg_x_resep = EXCLUDED.stock_fg_x_resep,
                safety_stock_x_resep = EXCLUDED.safety_stock_x_resep,
                updated_at = EXCLUDED.updated_at;
        `;
    }

    static async export(query: QueryRecomendationV2DTO) {
        const { data, periods: meta } = await this.list({ ...query, take: 1000000, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Rekomendasi V2");

        const monthsShort = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "Mei",
            "Jun",
            "Jul",
            "Ags",
            "Sep",
            "Okt",
            "Nov",
            "Des",
        ];

        const visibleCols = query.visibleColumns ? query.visibleColumns.split(",") : null;

        // Custom filter function to check if a column should be included in export
        const isVisible = (uiId: string) => {
            if (!visibleCols) return true;
            return visibleCols.includes(uiId);
        };

        // Define All Possible Columns
        const allColumns: any[] = [
            { header: "RANK", key: "ranking", width: 8, uiId: "ranking" },
            { header: "BARCODE", key: "barcode", width: 15, uiId: "material_name" },
            { header: "MATERIAL", key: "material_name", width: 35, uiId: "material_name" },
            { header: "SUPPLIER", key: "supplier_name", width: 25, uiId: "supplier" },
            { header: "MOQ", key: "moq", width: 10, uiId: "moq" },
            {
                header: "SAFETY STOCK",
                key: "safety_stock_x_resep",
                width: 18,
                uiId: "safety_stock_x_resep",
            },
            { header: "LT", key: "lead_time", width: 10, uiId: "lead_time" },
            { header: "CURRENT STOCK", key: "current_stock", width: 15, uiId: "current_stock" },
            { header: "READY STOCK", key: "total_stock", width: 15, uiId: "available_stock" },
        ];

        // Dynamic Sales Headers
        meta.sales_periods?.forEach((p: any) => {
            const yearShort = String(p.year).slice(-2);
            allColumns.push({
                header: `S ${monthsShort[p.month - 1]?.toLocaleUpperCase()}${yearShort}`,
                key: `sales_${p.key}`,
                width: 15,
                uiId: "sales_history",
            });
        });

        // Dynamic Need Headers
        meta.forecast_periods?.forEach((p: any) => {
            const yearShort = String(p.year).slice(-2);
            allColumns.push({
                header: `N ${monthsShort[p.month - 1]?.toLocaleUpperCase()}${yearShort}`,
                key: `need_${p.key}`,
                width: 15,
                uiId: "needs_buy",
            });
        });

        // Remaining Fixed Columns
        allColumns.push(
            { header: "TOTAL NEED", key: "total_needed", width: 15, uiId: "total_needs" },
            {
                header: "REKOMENDASI",
                key: "recommendation_quantity",
                width: 15,
                uiId: "recommendation_quantity",
            },
            { header: "TOTAL OPEN PO", key: "open_po", width: 15, uiId: "total_open_po" },
            { header: "WORK ORDER", key: "work_order_quantity", width: 15, uiId: "action" },
        );

        // Filter based on visibility
        const filteredColumns = allColumns.filter((col) => {
            if (!col.uiId) return true;
            return isVisible(col.uiId);
        });

        // Apply custom order if provided
        if (query.columnOrder) {
            const orderArr = query.columnOrder.split(",");
            filteredColumns.sort((a, b) => {
                const uiIdA = a.uiId || "";
                const uiIdB = b.uiId || "";
                
                const indexA = orderArr.indexOf(uiIdA);
                const indexB = orderArr.indexOf(uiIdB);
                
                if (indexA !== -1 && indexB !== -1) {
                    if (indexA === indexB) return 0; // Same group (like barcode & material)
                    return indexA - indexB;
                }
                
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return 0;
            });
        }

        sheet.columns = filteredColumns;

        const needStartCol = filteredColumns.findIndex((c) => c.key.startsWith("need_")) + 1;

        // Add Data
        data.forEach((row: any) => {
            const currentStock = Math.round(row.current_stock || 0);
            const openPo = Math.round(row.open_po || 0);

            // Calculate total need based on horizon
            const h = row.work_order_horizon || query.forecast_months || 0;
            const totalNeeded = (row.needs || [])
                .slice(0, h)
                .reduce((sum: number, n: any) => sum + (n.quantity || 0), 0);

            const formattedRow: any = {
                ...row,
                current_stock: currentStock,
                safety_stock_x_resep: Math.round(row.safety_stock_x_resep || 0),
                recommendation_quantity: Math.round(row.recommendation_quantity || 0),
                open_po: openPo,
                total_stock: currentStock + openPo,
                total_needed: Math.round(totalNeeded),
                // Only show Work Order Qty if it's already ordered (ACC)
                work_order_quantity:
                    row.work_order_status === "ACC" ? row.work_order_quantity : null,
            };

            // Map Sales
            row.sales?.forEach((s: any) => {
                formattedRow[`sales_${s.key}`] = Math.round(s.quantity || 0);
            });

            // Map Needs
            row.needs?.forEach((n: any) => {
                formattedRow[`need_${n.key}`] = Math.round(n.quantity || 0);
            });

            const excelRow = sheet.addRow(formattedRow);

            // Horizon Highlighting (Amber background like in frontend)
            const horizon = row.work_order_horizon || 0;
            if (horizon > 0 && needStartCol > 0) {
                for (let i = 0; i < horizon; i++) {
                    const column = filteredColumns[needStartCol - 1 + i];
                    if (column && column.key.startsWith("need_")) {
                        const cell = excelRow.getCell(needStartCol + i);
                        if (cell) {
                            cell.fill = {
                                type: "pattern",
                                pattern: "solid",
                                fgColor: { argb: "FFFFFF00" }, // Solid Yellow for horizon
                            };
                            cell.font = { bold: true };
                        }
                    }
                }
            }
        });

        // Styling Header (Yellow Background)
        sheet.getRow(1).font = { bold: true, size: 12 };
        sheet.getRow(1).height = 25;
        sheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0070C0" }, // Professional Blue
        };
        sheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; // White text for blue header
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }
}
