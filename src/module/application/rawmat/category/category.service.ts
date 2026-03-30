import prisma from "../../../../config/prisma.js";
import { Prisma } from "../../../../generated/prisma/client.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { normalizeSlug } from "../../../../lib/index.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import {
    QueryRawMatCategoryDTO,
    RequestRawMatCategoryDTO,
    ResponseRawMatCategoryDTO,
    UpdateRawMatCategoryDTO,
} from "./category.schema.js";

const SORT_MAP: Record<string, string> = {
    created_at: "created_at",
    updated_at: "updated_at",
    name: "name",
};

export class RawMatCategoryService {
    static async create(payload: RequestRawMatCategoryDTO): Promise<ResponseRawMatCategoryDTO> {
        const slug = normalizeSlug(payload.name);

        const exists = await prisma.rawMatCategories.findUnique({ where: { slug } });
        if (exists) throw new ApiError(400, "Category dengan nama tersebut sudah tersedia");

        return prisma.rawMatCategories.create({
            data: { name: payload.name, slug, status: payload.status ?? "ACTIVE" },
        });
    }

    static async update(
        id: number,
        payload: UpdateRawMatCategoryDTO,
    ): Promise<ResponseRawMatCategoryDTO> {
        const existing = await prisma.rawMatCategories.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Category tidak ditemukan");

        const data: Prisma.RawMatCategoriesUpdateInput = {};

        if (payload.name && payload.name !== existing.name) {
            const newSlug = normalizeSlug(payload.name);
            const slugExists = await prisma.rawMatCategories.findUnique({
                where: { slug: newSlug },
            });
            if (slugExists && slugExists.id !== id)
                throw new ApiError(400, "Slug category sudah digunakan");
            data.name = payload.name;
            data.slug = newSlug;
        }

        if (payload.status) data.status = payload.status;

        return prisma.rawMatCategories.update({ where: { id }, data });
    }

    static async changeStatus(
        id: number,
        status: Prisma.RawMatCategoriesUpdateInput["status"],
    ): Promise<ResponseRawMatCategoryDTO> {
        const existing = await prisma.rawMatCategories.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Category tidak ditemukan");

        return prisma.rawMatCategories.update({ where: { id }, data: { status } });
    }

    static async detail(id: number): Promise<ResponseRawMatCategoryDTO> {
        const rows = await prisma.$queryRaw<ResponseRawMatCategoryDTO[]>(Prisma.sql`
            SELECT id, name, slug, status, created_at, updated_at
            FROM raw_mat_categories
            WHERE id = ${id}
            LIMIT 1
        `);

        if (!rows.length) throw new ApiError(404, "Category tidak ditemukan");

        return rows[0] as ResponseRawMatCategoryDTO;
    }

    static async list({
        page = 1,
        take = 10,
        search,
        status,
        sortBy = "updated_at",
        sortOrder = "desc",
    }: QueryRawMatCategoryDTO): Promise<{ data: ResponseRawMatCategoryDTO[]; len: number }> {
        const { skip, take: limit } = GetPagination(page, take);
        const sortCol = Prisma.raw(SORT_MAP[sortBy] ?? "updated_at");
        const sortDir = Prisma.raw(sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC");

        const conditions: Prisma.Sql[] = [];
        if (status) conditions.push(Prisma.sql`status::text = ${status}`);
        if (search) {
            const pat = `%${search}%`;
            conditions.push(Prisma.sql`(name ILIKE ${pat} OR slug ILIKE ${pat})`);
        }

        const where = conditions.length
            ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
            : Prisma.empty;

        const [rows, [{ count }]] = await Promise.all([
            prisma.$queryRaw<ResponseRawMatCategoryDTO[]>(Prisma.sql`
                SELECT id, name, slug, status, created_at, updated_at
                FROM raw_mat_categories ${where}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ${limit} OFFSET ${skip}
            `),
            prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
                SELECT COUNT(*) AS count FROM raw_mat_categories ${where}
            `),
        ]);

        return { len: Number(count), data: rows };
    }

    static async delete(id: number): Promise<void> {
        const exists = await prisma.rawMatCategories.findUnique({ where: { id } });
        if (!exists) throw new ApiError(404, "Category tidak ditemukan");

        const usedCount = await prisma.rawMaterial.count({ where: { raw_mat_categories_id: id } });
        if (usedCount > 0)
            throw new ApiError(400, "Category masih digunakan oleh beberapa Raw Material");

        await prisma.rawMatCategories.delete({ where: { id } });
    }
}
