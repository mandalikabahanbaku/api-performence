import prisma from "../../../../config/prisma.js";
import { Prisma, STATUS } from "../../../../generated/prisma/client.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import { QueryProductStockDTO, ResponseProductStockDTO, RequestUpsertProductStockDTO } from "./product.stock.schema.js";

export class ProductStockService {
    private static async getLatestPeriod() {
        const latestProduct = await prisma.productInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });

        if (!latestProduct) {
            return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
        }

        return latestProduct;
    }

    static async listProductStock(query: QueryProductStockDTO): Promise<{
        data: Array<ResponseProductStockDTO>;
        len: number;
        month: number;
        year: number;
    }> {
        let {
            page = 1,
            take = 50,
            gender,
            search,
            sortBy = "created_at",
            sortOrder = "desc",
            type_id,
            warehouse_id,
            month,
            year,
        } = query;

        if (!month || !year) {
            const latest = await this.getLatestPeriod();
            month = month ?? latest.month;
            year = year ?? latest.year;
        }
        const { skip, take: limit } = GetPagination(page, take);

        const conditions: Prisma.Sql[] = [];

        if (type_id) {
            conditions.push(Prisma.sql`p.type_id = ${type_id}`);
        }

        if (gender !== undefined) {
            conditions.push(Prisma.sql`p.gender = CAST(${gender} AS "GENDER")`);
        }

        if (search) {
            const searchPattern = `%${search}%`;
            conditions.push(
                Prisma.sql`(p.name ILIKE ${searchPattern} OR p.code ILIKE ${searchPattern})`,
            );
        }

        const whereClause =
            conditions.length > 0
                ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
                : Prisma.empty;

        const validSortColumns: Record<string, string> = {
            created_at: "p.created_at",
            updated_at: "p.updated_at",
            name: "p.name",
            code: "p.code",
            size: "ps.size",
            type: "pt.name",
            amount: "amount", // Alias hasil SUM
        };

        const sortColumn = validSortColumns[sortBy] || "p.created_at";
        const sortDirection = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";
        const orderByClause = Prisma.sql`ORDER BY ${Prisma.raw(`${sortColumn} ${sortDirection}`)}`;

        const [countResult, productsResult] = await Promise.all([
            prisma.$queryRaw<{ total: bigint }[]>`
            SELECT COUNT(*)::bigint AS total
            FROM products p
            ${whereClause}
        `,
            prisma.$queryRaw<any[]>`
            SELECT 
                p.code, 
                p.name, 
                COALESCE(pt.name, 'Unknown') AS type, 
                COALESCE(ps.size, 0) AS size, 
                p.gender::text AS gender, 
                COALESCE(u.name, 'Unknown') AS uom,
                COALESCE(SUM(pi.quantity), 0) AS amount,
                COALESCE(
                    JSONB_OBJECT_AGG(w.name, pi.quantity) FILTER (WHERE w.name IS NOT NULL),
                    '{}'::JSONB
                ) AS stocks
            FROM products p
            LEFT JOIN product_types pt ON p.type_id = pt.id
            LEFT JOIN unit_of_materials u ON p.unit_id = u.id
            LEFT JOIN product_size ps ON p.size_id = ps.id
            LEFT JOIN (
                SELECT product_id, warehouse_id, SUM(quantity) as quantity
                FROM product_inventories
                WHERE month = ${month} AND year = ${year}
                GROUP BY product_id, warehouse_id
            ) pi ON p.id = pi.product_id
            LEFT JOIN warehouses w ON pi.warehouse_id = w.id
            ${whereClause}
            GROUP BY p.id, pt.name, u.name, ps.size
            ${orderByClause}
            LIMIT ${limit} OFFSET ${skip}
        `,
        ]);

        const len = Number(countResult[0]?.total || 0);

        return {
            len,
            month: month as number,
            year: year as number,
            data: productsResult.map((p) => ({
                code: p.code,
                name: p.name,
                type: p.type,
                size: Number(p.size),
                gender: p.gender,
                uom: p.uom,
                amount: Number(p.amount),
                stocks: p.stocks || {},
            })),
        };
    }

    static async listWarehouses() {
        return prisma.warehouse.findMany({
            where: {
                type: "FINISH_GOODS",
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

    static async listProducts() {
        return prisma.product.findMany({
            where: {
                deleted_at: null,
                status: STATUS.ACTIVE,
            },
            select: {
                id: true,
                name: true,
                code: true,
            },
            orderBy: {
                name: "asc",
            },
        });
    }

    static async upsertStock(body: RequestUpsertProductStockDTO) {
        const { product_id, warehouse_id, quantity, month, year } = body;

        return prisma.productInventory.upsert({
            where: {
                product_id_warehouse_id_date_month_year: {
                    product_id,
                    warehouse_id,
                    date: 1,
                    month,
                    year,
                },
            },
            update: {
                quantity,
                updated_at: new Date(),
            },
            create: {
                product_id,
                warehouse_id,
                date: 1,
                quantity,
                month,
                year,
            },
        });
    }
}
