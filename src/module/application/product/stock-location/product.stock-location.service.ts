import prisma from "../../../../config/prisma.js";
import { Prisma } from "../../../../generated/prisma/client.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import { QueryStockLocationDTO, ResponseStockLocationDTO } from "./product.stock-location.schema.js";

export class ProductStockLocationService {
    /**
     * List all products with stock from ALL locations (Warehouses + Outlets)
     */
    static async listStockLocation(query: QueryStockLocationDTO) {
        const {
            page = 1,
            take = 50,
            search,
            sortBy = "updated_at",
            sortOrder = "desc",
            type_id,
            gender,
        } = query;

        const { skip, take: limit } = GetPagination(Number(page), Number(take));

        // Filters
        const conditions: Prisma.Sql[] = [];
        if (type_id) conditions.push(Prisma.sql`p.type_id = ${type_id}`);
        if (gender) conditions.push(Prisma.sql`p.gender = CAST(${gender} AS "GENDER")`);
        if (search) {
            const pattern = `%${search}%`;
            conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.code ILIKE ${pattern})`);
        }

        const whereClause = conditions.length > 0
            ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
            : Prisma.empty;

        // Sorting
        const validSortColumns: Record<string, string> = {
            updated_at: "p.updated_at",
            name: "p.name",
            code: "p.code",
            size: "ps.size",
            type: "pt.name",
            total_stock: "total_stock",
        };
        const sortColumn = validSortColumns[sortBy] || "p.updated_at";
        const sqlSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

        // Main Query: Join Product with Inventory (Warehouse) and OutletInventory
        // Note: Using current year/month for Warehouse inventory
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const [countResult, productsResult] = await Promise.all([
            prisma.$queryRaw<{ total: bigint }[]>`
                SELECT COUNT(*)::bigint AS total FROM products p ${whereClause}
            `,
            prisma.$queryRaw<any[]>`
                SELECT 
                    p.code, 
                    p.name, 
                    COALESCE(pt.name, 'Unknown') AS type, 
                    COALESCE(ps.size, 0) AS size, 
                    p.gender::text AS gender, 
                    COALESCE(u.name, 'Unknown') AS uom,
                    (
                        COALESCE(SUM(inv.qty), 0) + COALESCE(SUM(out_inv.qty), 0)
                    ) as total_stock,
                    (
                        SELECT JSONB_OBJECT_AGG(name, qty) FROM (
                            -- Warehouses
                            SELECT w.name, pi.quantity as qty
                            FROM product_inventories pi
                            JOIN warehouses w ON pi.warehouse_id = w.id
                            WHERE pi.product_id = p.id AND pi.month = ${currentMonth} AND pi.year = ${currentYear}
                            UNION ALL
                            -- Outlets
                            SELECT o.name, oi.quantity as qty
                            FROM outlet_inventories oi
                            JOIN outlets o ON oi.outlet_id = o.id
                            WHERE oi.product_id = p.id
                        ) sub WHERE qty > 0
                    ) as location_stocks
                FROM products p
                LEFT JOIN product_types pt ON p.type_id = pt.id
                LEFT JOIN unit_of_materials u ON p.unit_id = u.id
                LEFT JOIN product_size ps ON p.size_id = ps.id
                -- Join for Total Stock calculation (Warehouses)
                LEFT JOIN (
                    SELECT product_id, SUM(quantity) as qty
                    FROM product_inventories
                    WHERE month = ${currentMonth} AND year = ${currentYear}
                    GROUP BY product_id
                ) inv ON inv.product_id = p.id
                -- Join for Total Stock calculation (Outlets)
                LEFT JOIN (
                    SELECT product_id, SUM(quantity) as qty
                    FROM outlet_inventories
                    GROUP BY product_id
                ) out_inv ON out_inv.product_id = p.id
                ${whereClause}
                GROUP BY p.id, pt.name, u.name, ps.size
                ORDER BY ${Prisma.raw(`${sortColumn} ${sqlSortOrder}`)}
                LIMIT ${limit} OFFSET ${skip}
            `
        ]);

        return {
            len: Number(countResult[0]?.total || 0),
            data: productsResult.map(p => ({
                ...p,
                size: Number(p.size),
                total_stock: Number(p.total_stock),
                location_stocks: p.location_stocks || {}
            }))
        };
    }

    /**
     * List all potential locations (Warehouses + Outlets)
     */
    static async listAllLocations() {
        const [warehouses, outlets] = await Promise.all([
            prisma.warehouse.findMany({
                where: { type: "FINISH_GOODS", deleted_at: null },
                select: { id: true, name: true, type: true },
                orderBy: { name: "asc" }
            }),
            prisma.outlet.findMany({
                where: { deleted_at: null },
                select: { id: true, name: true },
                orderBy: { name: "asc" }
            })
        ]);

        return [
            ...warehouses.map(w => ({ id: w.id, name: w.name, type: "WAREHOUSE" })),
            ...outlets.map(o => ({ id: o.id, name: o.name, type: "OUTLET" }))
        ];
    }
}
