import {
    QueryRawMaterialDTO,
    RequestRawMaterialDTO,
    ResponseRawMaterialDTO,
} from "./rawmat.schema.js";
import prisma from "../../../config/prisma.js";
import { RawMaterial } from "../../../generated/prisma/browser.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import {
    Prisma,
    RawMatCategories,
    Supplier,
    UnitRawMaterial,
} from "../../../generated/prisma/client.js";
import { normalizeSlug } from "../../../lib/index.js";
import { MaterialType } from "../../../generated/prisma/enums.js";

type RawRow = {
    id: number;
    barcode: string | null;
    name: string;
    price: number;
    min_buy: number | null;
    min_stock: number | null;
    lead_time: number | null;
    type: string | null;
    created_at: Date;
    updated_at: Date | null;
    deleted_at: Date | null;
    unit_id: number;
    unit_name: string;
    unit_slug: string;
    cat_id: number | null;
    cat_name: string | null;
    cat_slug: string | null;
    sup_id: number | null;
    sup_name: string | null;
    sup_country: string | null;
};

const SORT_MAP: Record<string, string> = {
    barcode: "rm.barcode",
    name: "rm.name",
    updated_at: "rm.updated_at",
    current_stock: "rm.current_stock",
    price: "rm.price",
    created_at: "rm.created_at",
    category: "rmc.name",
    supplier: "s.name",
};

function toDTO(r: RawRow): ResponseRawMaterialDTO {
    return {
        id: r.id,
        barcode: r.barcode,
        name: r.name,
        price: r.price,
        min_buy: r.min_buy,
        min_stock: r.min_stock,
        lead_time: r.lead_time,
        type: r.type as MaterialType | null,
        unit_raw_material: { id: r.unit_id, name: r.unit_name },
        created_at: r.created_at,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at,
        ...(r.cat_id && {
            raw_mat_category: { id: r.cat_id, name: r.cat_name!, slug: r.cat_slug! },
        }),
        ...(r.sup_id && { supplier: { id: r.sup_id, name: r.sup_name!, country: r.sup_country! } }),
    };
}

export class RawMaterialService {
    static async create(data: RequestRawMaterialDTO) {
        const slugUnit = normalizeSlug(data.unit);
        const slugCategories = normalizeSlug(data.raw_mat_category ?? "");

        const [find, findSlugUnit, findCategory] = await Promise.all([
            prisma.rawMaterial.findUnique({ where: { barcode: String(data.barcode) } }),
            prisma.unitRawMaterial.findUnique({ where: { slug: slugUnit }, select: { id: true } }),
            data.raw_mat_category
                ? prisma.rawMatCategories.findUnique({ where: { slug: slugCategories } })
                : Promise.resolve(null),
        ]);

        if (find)
            throw new ApiError(400, "Barcode telah digunakan, tolong ubah dengan barcode lainnya");

        if (data.supplier_id) {
            const findSupplier = await prisma.supplier.findUnique({
                where: { id: data.supplier_id },
            });
            if (!findSupplier) throw new ApiError(404, "Supplier tidak ditemukan");
        }

        return prisma.$transaction(async (tx) => {
            const unitRelation = findSlugUnit
                ? { connect: { id: findSlugUnit.id } }
                : { create: { name: data.unit, slug: slugUnit } };

            let categoryRelation: { connect?: { id: number }; create?: any } | undefined;
            if (data.raw_mat_category) {
                categoryRelation = findCategory
                    ? { connect: { id: findCategory.id } }
                    : { create: { name: data.raw_mat_category, slug: slugCategories } };
            }

            return tx.rawMaterial.create({
                data: {
                    barcode: data.barcode ?? null,
                    name: data.name,
                    price: data.price,
                    min_buy: data.min_buy ?? null,
                    min_stock: data.min_stock ?? null,
                    lead_time: data.lead_time ?? null,
                    type: (data.type as MaterialType) ?? null,
                    unit_raw_material: unitRelation,
                    ...(categoryRelation && { raw_mat_category: categoryRelation }),
                    ...(data.supplier_id && {
                        supplier: { connect: { id: Number(data.supplier_id) } },
                    }),
                },
                include: { unit_raw_material: true, raw_mat_category: true, supplier: true },
            });
        });
    }

    static async update(id: number, payload: Partial<RequestRawMaterialDTO>) {
        const find = await this.findRaw(id);
        if (!find) throw new ApiError(404, "Data raw material tidak ditemukan");

        if (typeof payload.supplier_id === "number" && payload.supplier_id > 0) {
            const findSupplier = await prisma.supplier.findUnique({
                where: { id: payload.supplier_id },
            });
            if (!findSupplier) throw new ApiError(404, "Supplier tidak ditemukan");
        }

        return prisma.$transaction(async (tx) => {
            const exists = await tx.rawMaterial.findFirst({ where: { id, deleted_at: null } });
            if (!exists) throw new ApiError(404, "Raw material tidak ditemukan");

            const data: Prisma.RawMaterialUpdateInput = {
                ...(payload.name && { name: payload.name }),
                ...(payload.price !== undefined && { price: payload.price }),
                ...(payload.min_buy !== undefined && { min_buy: payload.min_buy }),
                ...(payload.min_stock !== undefined && { min_stock: payload.min_stock }),
                ...(payload.lead_time !== undefined && { lead_time: payload.lead_time }),
                ...(payload.type !== undefined && { type: payload.type as MaterialType }),
            };

            if (payload.supplier_id === null) {
                data.supplier = { disconnect: true };
            } else if (typeof payload.supplier_id === "number" && payload.supplier_id > 0) {
                data.supplier = { connect: { id: payload.supplier_id } };
            }

            if (payload.unit) {
                data.unit_raw_material = await this.buildUnitRelationBySlug(tx, payload.unit);
            }

            if (payload.raw_mat_category) {
                data.raw_mat_category = await this.buildCategoryRelationBySlug(
                    tx,
                    payload.raw_mat_category,
                );
            }

            return tx.rawMaterial.update({
                where: { id },
                data,
                include: { unit_raw_material: true, raw_mat_category: true, supplier: true },
            });
        });
    }

    static async detail(id: number): Promise<ResponseRawMaterialDTO> {
        const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
            SELECT
                rm.id, rm.barcode, rm.name,
                rm.price::float8 AS price,
                rm.min_buy::float8 AS min_buy,
                rm.min_stock::float8 AS min_stock,
                rm.lead_time, rm.type,
                rm.created_at, rm.updated_at, rm.deleted_at,
                urm.id AS unit_id, urm.name AS unit_name, urm.slug AS unit_slug,
                rmc.id AS cat_id, rmc.name AS cat_name, rmc.slug AS cat_slug,
                s.id AS sup_id, s.name AS sup_name, s.country AS sup_country
            FROM raw_materials rm
            JOIN unit_raw_materials urm ON urm.id = rm.unit_id
            LEFT JOIN raw_mat_categories rmc ON rmc.id = rm.raw_mat_categories_id
            LEFT JOIN suppliers s ON s.id = rm.supplier_id
            WHERE rm.id = ${id}
            LIMIT 1
        `);

        if (!rows.length) throw new ApiError(404, "Raw material tidak ditemukan");

        return toDTO(rows[0] as RawRow);
    }

    static async list({
        page = 1,
        take = 10,
        sortBy = "updated_at",
        sortOrder = "asc",
        search,
        status,
        type,
        category_id,
        supplier_id,
        unit_id,
    }: QueryRawMaterialDTO): Promise<{ data: ResponseRawMaterialDTO[]; len: number }> {
        const { skip, take: limit } = GetPagination(page, take);
        const sortCol = Prisma.raw(SORT_MAP[sortBy] ?? "rm.updated_at");
        const sortDir = Prisma.raw(sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC");

        const conditions: Prisma.Sql[] = [
            status === "deleted"
                ? Prisma.sql`rm.deleted_at IS NOT NULL`
                : Prisma.sql`rm.deleted_at IS NULL`,
        ];

        if (type) conditions.push(Prisma.sql`rm.type::text = ${type}`);
        if (search) {
            const pat = `%${search}%`;
            conditions.push(Prisma.sql`(
                rm.name ILIKE ${pat}
                OR rm.barcode ILIKE ${pat}
                OR urm.name ILIKE ${pat}
                OR rmc.name ILIKE ${pat}
                OR s.name ILIKE ${pat}
            )`);
        }

        if (category_id) {
            conditions.push(Prisma.sql`rm.raw_mat_categories_id = ${category_id}`);
        }
        if (supplier_id) {
            conditions.push(Prisma.sql`rm.supplier_id = ${supplier_id}`);
        }
        if (unit_id) {
            conditions.push(Prisma.sql`rm.unit_id = ${unit_id}`);
        }

        const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
        const joins = Prisma.sql`
            FROM raw_materials rm
            JOIN unit_raw_materials urm ON urm.id = rm.unit_id
            LEFT JOIN raw_mat_categories rmc ON rmc.id = rm.raw_mat_categories_id
            LEFT JOIN suppliers s ON s.id = rm.supplier_id
        `;

        const [rows, [{ count }]] = await Promise.all([
            prisma.$queryRaw<RawRow[]>(Prisma.sql`
                SELECT
                    rm.id, rm.barcode, rm.name,
                    rm.price::float8 AS price,
                    rm.min_buy::float8 AS min_buy,
                    rm.min_stock::float8 AS min_stock,
                    rm.lead_time, rm.type,
                    rm.created_at, rm.updated_at, rm.deleted_at,
                    urm.id AS unit_id, urm.name AS unit_name, urm.slug AS unit_slug,
                    rmc.id AS cat_id, rmc.name AS cat_name, rmc.slug AS cat_slug,
                    s.id AS sup_id, s.name AS sup_name, s.country AS sup_country
                ${joins}
                ${where}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ${limit} OFFSET ${skip}
            `),
            prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
                SELECT COUNT(*) AS count ${joins} ${where}
            `),
        ]);

        return { len: Number(count), data: rows.map(toDTO) };
    }

    static async delete(id: number) {
        const find = await this.findRaw(id);
        if (!find) throw new ApiError(404, "Data raw material tidak ditemukan");
        if (find.deleted_at !== null)
            throw new ApiError(400, "Raw material sudah berada pada status deleted");

        return prisma.rawMaterial.update({
            where: { id, deleted_at: null },
            data: { deleted_at: new Date() },
        });
    }

    static async restore(id: number) {
        const find = await this.findRaw(id);
        if (!find) throw new ApiError(404, "Data raw material tidak ditemukan");
        if (find.deleted_at === null)
            throw new ApiError(400, "Raw material tidak berada pada status deleted");

        return prisma.rawMaterial.update({
            where: { id, deleted_at: { not: null } },
            data: { deleted_at: null },
        });
    }

    static async clean() {
        const count = await prisma.rawMaterial.count({ where: { deleted_at: { not: null } } });
        if (count === 0) throw new ApiError(400, "Tidak ada raw material yang akan dihapus");

        return prisma.rawMaterial.deleteMany({ where: { deleted_at: { not: null } } });
    }

    static async getUtils(): Promise<{
        units: Pick<UnitRawMaterial, "name" | "slug">[];
        suppliers: Pick<Supplier, "name" | "id" | "country">[];
        categories: Pick<RawMatCategories, "slug" | "name">[];
    }> {
        const [units, suppliers, categories] = await Promise.all([
            prisma.unitRawMaterial.findMany({ select: { name: true, slug: true } }),
            prisma.supplier.findMany({ select: { id: true, name: true, country: true } }),
            prisma.rawMatCategories.findMany({
                select: { name: true, slug: true },
                where: { status: { notIn: ["BLOCK", "DELETE", "PENDING"] } },
            }),
        ]);

        return { units, suppliers, categories };
    }

    static async countUtils(): Promise<{ units: number; suppliers: number; categories: number }> {
        const [units, suppliers, categories] = await Promise.all([
            prisma.unitRawMaterial.count(),
            prisma.supplier.count(),
            prisma.rawMatCategories.count({
                where: { status: { notIn: ["BLOCK", "DELETE", "PENDING"] } },
            }),
        ]);

        return { units, suppliers, categories };
    }

    static async redisRawMaterial(): Promise<{ id: number; name: string }[]> {
        return prisma.rawMaterial.findMany({
            where: { deleted_at: null },
            select: { id: true, name: true },
        });
    }

    private static async findRaw(id: number): Promise<RawMaterial | null> {
        return prisma.rawMaterial.findUnique({ where: { id } });
    }

    private static async buildUnitRelationBySlug(tx: Prisma.TransactionClient, unit: string) {
        const slug = normalizeSlug(unit);
        const existing = await tx.unitRawMaterial.findUnique({
            where: { slug },
            select: { id: true },
        });
        return existing ? { connect: { id: existing.id } } : { create: { name: unit, slug } };
    }

    private static async buildCategoryRelationBySlug(
        tx: Prisma.TransactionClient,
        category: string,
    ) {
        const slug = normalizeSlug(category);
        const existing = await tx.rawMatCategories.findUnique({
            where: { slug },
            select: { id: true },
        });
        return existing ? { connect: { id: existing.id } } : { create: { name: category, slug } };
    }
}
