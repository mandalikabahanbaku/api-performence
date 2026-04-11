import prisma from "../../../config/prisma.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import {
    QueryRecipeDTO,
    RequestRecipeDTO,
    ResponseDetailRecipeDTO,
    ResponseRecipeDTO,
} from "./recipe.schema.js";

export class RecipeService {
    static async upsert(body: RequestRecipeDTO) {
        const product = await prisma.product.findUnique({
            where: { id: body.product_id },
            select: { id: true },
        });
        if (!product) throw new ApiError(404, "Produk tidak ditemukan");

        const rawMatIds = body.raw_material.map((i) => i.raw_material_id);
        const rawMaterials = await prisma.rawMaterial.findMany({
            where: { id: { in: rawMatIds } },
            select: { id: true },
        });
        if (rawMaterials.length !== new Set(rawMatIds).size) {
            throw new ApiError(404, "Satu atau lebih raw material tidak ditemukan");
        }

        const data = body.raw_material.map((item) => ({
            product_id: body.product_id,
            raw_mat_id: item.raw_material_id,
            quantity: item.quantity,
            version: body.version,
            is_active: body.is_active,
            use_size_calc: Number(item.quantity) < 1.0, // Auto-detect formula type
            description: body.description || null,
        }));

        return await prisma.$transaction(async (tx) => {
            if (body.is_active) {
                await tx.recipes.updateMany({
                    where: { product_id: body.product_id, version: { not: body.version } },
                    data: { is_active: false },
                });
            }

            await tx.recipes.deleteMany({
                where: { product_id: body.product_id, version: body.version },
            });

            await tx.recipes.createMany({ data });

            return {
                product_id: body.product_id,
                version: body.version,
                is_active: body.is_active,
                total_material: data.length,
            };
        });
    }

    static async list(query: QueryRecipeDTO): Promise<{ data: ResponseRecipeDTO[]; len: number }> {
        const {
            product_id,
            raw_mat_id,
            search,
            page = 1,
            take = 25,
            sortBy = "product",
            sortOrder = "desc",
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const latestPeriod = await prisma.rawMaterialInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });
        const activeMonth = latestPeriod?.month ?? new Date().getMonth() + 1;
        const activeYear = latestPeriod?.year ?? new Date().getFullYear();

        const conditions: Prisma.Sql[] = [Prisma.sql`rm.deleted_at IS NULL`];

        if (product_id) conditions.push(Prisma.sql`r.product_id = ${product_id}`);
        if (raw_mat_id) conditions.push(Prisma.sql`r.raw_mat_id = ${raw_mat_id}`);
        if (search) {
            const pattern = `%${search}%`;
            conditions.push(Prisma.sql`(
                p.name  ILIKE ${pattern} OR
                p.code  ILIKE ${pattern} OR
                rm.name ILIKE ${pattern}
            )`);
        }

        const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

        const countRows = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
            SELECT COUNT(*)::bigint AS total
            FROM   recipes r
            JOIN   products      p  ON p.id  = r.product_id
            JOIN   raw_materials rm ON rm.id = r.raw_mat_id
            ${whereSql}
        `);
        const len = Number(countRows[0]?.total ?? 0);
        if (len === 0) return { data: [], len: 0 };

        const orderMap: Record<string, Record<string, Prisma.Sql>> = {
            quantity:       { asc: Prisma.sql`ORDER BY r.quantity ASC`,       desc: Prisma.sql`ORDER BY r.quantity DESC` },
            product:        { asc: Prisma.sql`ORDER BY p.name ASC`,          desc: Prisma.sql`ORDER BY p.name DESC` },
            current_stock:  { asc: Prisma.sql`ORDER BY current_stock ASC`,   desc: Prisma.sql`ORDER BY current_stock DESC` },
            total_material: { asc: Prisma.sql`ORDER BY total_material ASC, p.name ASC`, desc: Prisma.sql`ORDER BY total_material DESC, p.name ASC` },
            totalMaterial:  { asc: Prisma.sql`ORDER BY total_material ASC, p.name ASC`, desc: Prisma.sql`ORDER BY total_material DESC, p.name ASC` },
        };
        const orderBySql = orderMap[sortBy]?.[sortOrder] ?? Prisma.sql`ORDER BY p.name DESC`;

        const rows = await prisma.$queryRaw<RawRecipeRow[]>(Prisma.sql`
            SELECT
                r.id,
                r.quantity,
                p.id            AS product_id,
                p.name          AS product_name,
                p.code          AS product_code,
                pt.id           AS pt_id,
                pt.name         AS pt_name,
                pt.slug         AS pt_slug,
                u.id            AS unit_id,
                u.name          AS unit_name,
                u.slug          AS unit_slug,
                ps.id           AS size_id,
                ps.size         AS size_val,
                rm.name         AS rm_name,
                rm.barcode      AS rm_barcode,
                rm.price        AS rm_price,
                r.version,
                r.is_active,
                r.description,
                urm.id          AS urm_id,
                urm.name        AS urm_name,
                COALESCE((
                    SELECT SUM(rmi.quantity)
                    FROM   raw_material_inventories rmi
                    WHERE  rmi.raw_material_id = rm.id
                      AND  rmi.month = ${activeMonth}
                      AND  rmi.year  = ${activeYear}
                ), 0) AS current_stock,
                COUNT(*) OVER(PARTITION BY r.product_id) as total_material
            FROM   recipes r
            JOIN   products              p   ON p.id   = r.product_id
            JOIN   raw_materials         rm  ON rm.id  = r.raw_mat_id
            JOIN   unit_raw_materials    urm ON urm.id = rm.unit_id
            LEFT JOIN product_types      pt  ON pt.id  = p.type_id
            LEFT JOIN unit_of_materials  u   ON u.id   = p.unit_id
            LEFT JOIN product_size       ps  ON ps.id  = p.size_id
            ${whereSql}
            ${orderBySql}
            LIMIT  ${limit}
            OFFSET ${skip}
        `);

        const data: ResponseRecipeDTO[] = rows.map((row) => ({
            id: row.id,
            version: row.version,
            is_active: row.is_active,
            description: row.description,
            quantity: Number(row.quantity),
            product: {
                id: row.product_id,
                name: row.product_name,
                code: row.product_code,
                product_type: row.pt_id
                    ? { id: row.pt_id, name: row.pt_name!, slug: row.pt_slug! }
                    : null,
                unit: row.unit_id
                    ? { id: row.unit_id, name: row.unit_name!, slug: row.unit_slug! }
                    : null,
                size: row.size_id ? { id: row.size_id, size: row.size_val! } : null,
            },
            raw_material: {
                name: row.rm_name,
                barcode: row.rm_barcode,
                price: Number(row.rm_price),
                current_stock: Number(row.current_stock),
                unit_raw_material: { id: row.urm_id, name: row.urm_name },
            },
            total_material: Number(row.total_material),
        }));

        return { data, len };
    }

    static async detail(id: number): Promise<ResponseDetailRecipeDTO> {
        const trigger = await prisma.recipes.findUnique({
            where: { id },
            select: { product_id: true, version: true },
        });

        if (!trigger) throw new ApiError(404, "Resep (BOM) tidak ditemukan");

        const rows = await prisma.$queryRaw<RawDetailRow[]>(Prisma.sql`
            SELECT
                p.id            AS product_id,
                p.code,
                p.name,
                pt.name         AS type_name,
                u.name          AS unit_name,
                rm.id           AS raw_mat_id,
                rm.barcode,
                rm.name         AS rm_name,
                rm.price        AS rm_price,
                r.quantity      AS rm_quantity,
                r.version,
                r.is_active,
                r.description,
                urm.name        AS urm_name
            FROM   recipes r
            JOIN   products p ON p.id = r.product_id
            LEFT JOIN product_types     pt  ON pt.id  = p.type_id
            LEFT JOIN unit_of_materials u   ON u.id   = p.unit_id
            JOIN   raw_materials     rm  ON rm.id  = r.raw_mat_id
            LEFT JOIN unit_raw_materials urm ON urm.id = rm.unit_id
            WHERE r.product_id = ${trigger.product_id} AND r.version = ${trigger.version}
        `);

        if (!rows.length) throw new ApiError(404, "Isi resep tidak ditemukan");

        const first = rows[0]!;
        const data: ResponseDetailRecipeDTO = {
            product_id: first.product_id,
            code: first.code,
            name: first.name,
            type: first.type_name ?? "",
            unit: first.unit_name ?? "",
            version: first.version ?? 1,
            is_active: first.is_active ?? false,
            description: first.description,
            recipes: rows
                .filter((r) => r.raw_mat_id !== null)
                .map((r) => ({
                    raw_mat_id: r.raw_mat_id!,
                    barcode: r.barcode,
                    name: r.rm_name!,
                    price: Number(r.rm_price),
                    quantity: Number(r.rm_quantity),
                    unit: r.urm_name ?? "",
                })),
        };

        return data;
    }
}

type RawRecipeRow = {
    id: number;
    quantity: string | number;
    product_id: number;
    product_name: string;
    product_code: string;
    pt_id: number | null;
    pt_name: string | null;
    pt_slug: string | null;
    unit_id: number | null;
    unit_name: string | null;
    unit_slug: string | null;
    size_id: number | null;
    size_val: number | null;
    rm_name: string;
    rm_barcode: string | null;
    rm_price: string | number;
    urm_id: number;
    urm_name: string;
    current_stock: string | number;
    total_material: string | number;
    version: number;
    is_active: boolean;
    description: string | null;
};

type RawDetailRow = {
    product_id: number;
    code: string;
    name: string;
    type_name: string | null;
    unit_name: string | null;
    raw_mat_id: number | null;
    barcode: string | null;
    rm_name: string | null;
    rm_price: string | number | null;
    rm_quantity: string | number | null;
    urm_name: string | null;
    version: number | null;
    is_active: boolean | null;
    description: string | null;
};
