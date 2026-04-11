import prisma from "../../../../config/prisma.js";
import { Prisma } from "../../../../generated/prisma/client.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import {
    QueryRawMaterialStockDTO,
    RequestUpsertRawMaterialStockDTO,
    ResponseRawMaterialStockDTO,
} from "./rawmat.stock.schema.js";

export class RawMaterialStockService {
    private static async getLatestPeriod() {
        const latest = await prisma.rawMaterialInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });

        if (!latest) {
            return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
        }

        return latest;
    }

    static async listRawMaterials() {
        return prisma.rawMaterial.findMany({
            where: {
                deleted_at: null,
            },
            select: {
                id: true,
                name: true,
                barcode: true,
            },
            orderBy: {
                name: "asc",
            },
        });
    }

    static async upsertStock(data: RequestUpsertRawMaterialStockDTO) {
        return prisma.rawMaterialInventory.upsert({
            where: {
                raw_material_id_warehouse_id_date_month_year: {
                    raw_material_id: data.raw_material_id,
                    warehouse_id: data.warehouse_id,
                    date: 1,
                    month: data.month,
                    year: data.year,
                },
            },
            update: {
                quantity: data.quantity,
            },
            create: {
                raw_material_id: data.raw_material_id,
                warehouse_id: data.warehouse_id,
                quantity: data.quantity,
                date: 1,
                month: data.month,
                year: data.year,
            },
        });
    }

    static async listRawMaterialStock(query: QueryRawMaterialStockDTO): Promise<{
        data: Array<ResponseRawMaterialStockDTO>;
        len: number;
        month: number;
        year: number;
    }> {
        let {
            page = 1,
            take = 50,
            search,
            sortBy = "updated_at",
            sortOrder = "desc",
            category_id,
            supplier_id,
            month,
            year,
        } = query;

        if (!month || !year) {
            const latest = await this.getLatestPeriod();
            month = month ?? latest.month;
            year = year ?? latest.year;
        }

        const { skip, take: limit } = GetPagination(page, take);
        const conditions: Prisma.Sql[] = [Prisma.sql`rm.deleted_at IS NULL`];

        if (category_id) {
            conditions.push(Prisma.sql`rm.raw_mat_categories_id = ${category_id}`);
        }

        if (supplier_id) {
            conditions.push(Prisma.sql`rm.supplier_id = ${supplier_id}`);
        }

        if (search) {
            const searchPattern = `%${search}%`;
            conditions.push(
                Prisma.sql`(rm.name ILIKE ${searchPattern} OR rm.barcode ILIKE ${searchPattern})`,
            );
        }

        const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

        const validSortColumns: Record<string, string> = {
            created_at: "rm.created_at",
            updated_at: "rm.updated_at",
            name: "rm.name",
            barcode: "rm.barcode",
            category: "c.name",
            amount: "amount",
        };

        const sortColumn = validSortColumns[sortBy] || "rm.updated_at";
        const sortDirection = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";
        const orderByClause = Prisma.sql`ORDER BY ${Prisma.raw(`${sortColumn} ${sortDirection}`)}`;

        const [countResult, result] = await Promise.all([
            prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(DISTINCT rm.id)::bigint AS total
            FROM raw_materials rm
            LEFT JOIN raw_mat_categories c ON rm.raw_mat_categories_id = c.id
            LEFT JOIN (
                SELECT raw_material_id, warehouse_id, SUM(quantity) as quantity
                FROM raw_material_inventories
                WHERE month = ${month} AND year = ${year}
                ${query.warehouse_id ? Prisma.sql`AND warehouse_id = ${query.warehouse_id}` : Prisma.sql``}
                GROUP BY raw_material_id, warehouse_id
            ) ri ON rm.id = ri.raw_material_id
            ${whereClause}
        `,
            prisma.$queryRaw<any[]>`
            SELECT 
                rm.barcode, 
                rm.name, 
                COALESCE(c.name, 'Unknown') AS category, 
                COALESCE(u.name, 'Unknown') AS uom,
                COALESCE(SUM(ri.quantity), 0) AS amount,
                COALESCE(
                    JSONB_OBJECT_AGG(w.name, ri.quantity) FILTER (WHERE w.name IS NOT NULL),
                    '{}'::JSONB
                ) AS stocks
            FROM raw_materials rm
            LEFT JOIN raw_mat_categories c ON rm.raw_mat_categories_id = c.id
            LEFT JOIN unit_raw_materials u ON rm.unit_id = u.id
            LEFT JOIN (
                SELECT raw_material_id, warehouse_id, SUM(quantity) as quantity
                FROM raw_material_inventories
                WHERE month = ${month} AND year = ${year}
                ${query.warehouse_id ? Prisma.sql`AND warehouse_id = ${query.warehouse_id}` : Prisma.sql``}
                GROUP BY raw_material_id, warehouse_id
            ) ri ON rm.id = ri.raw_material_id
            LEFT JOIN warehouses w ON ri.warehouse_id = w.id
            ${whereClause}
            GROUP BY rm.id, c.name, u.name
            ${orderByClause}
            LIMIT ${limit} OFFSET ${skip}
        `,
        ]);

        return {
            len: Number(countResult[0]?.total || 0),
            month: month as number,
            year: year as number,
            data: result.map((p) => ({
                barcode: p.barcode,
                name: p.name,
                category: p.category,
                uom: p.uom,
                amount: Number(p.amount),
                stocks: p.stocks || {},
            })),
        };
    }

    static async listWarehouses() {
        return prisma.warehouse.findMany({
            where: {
                type: "RAW_MATERIAL",
                deleted_at: null,
            },
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: "asc",
            },
        });
    }

    static async export(query: QueryRawMaterialStockDTO) {
        const { data } = await this.listRawMaterialStock({ ...query, take: 1000000, page: 1 });

        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.default.Workbook();
        const sheet = workbook.addWorksheet("Raw Material Stocks");

        // Template format: MATERIAL CODE, CURRENT STOCK
        sheet.columns = [
            { header: "MATERIAL CODE", key: "barcode", width: 25 },
            { header: "MATERIAL NAME", key: "name", width: 40 },
            { header: "CATEGORY", key: "category", width: 25 },
            { header: "UNIT", key: "unit", width: 15 },
            { header: "CURRENT STOCK", key: "amount", width: 20 },
        ];

        data.forEach((item) => {
            sheet.addRow({
                barcode: item.barcode || "-",
                name: item.name,
                category: item.category || "-",
                unit: item.uom,
                amount: item.amount,
            });
        });

        return await workbook.csv.writeBuffer();
    }
}
