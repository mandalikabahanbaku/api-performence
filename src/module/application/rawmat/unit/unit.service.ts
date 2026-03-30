import prisma from "../../../../config/prisma.js";
import { Prisma, UnitRawMaterial } from "../../../../generated/prisma/client.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { normalizeSlug } from "../../../../lib/index.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import {
    RequestRawMaterialUnitDTO,
    ResponseRawMaterialUnitDTO,
    QueryRawMaterialUnitDTO,
} from "./unit.schema.js";

const SORT_MAP: Record<string, string> = { name: "name", slug: "slug", id: "id" };

export class UnitRawMaterialService {
    static async create(payload: RequestRawMaterialUnitDTO): Promise<ResponseRawMaterialUnitDTO> {
        const slug = normalizeSlug(payload.name);

        const exists = await prisma.unitRawMaterial.findUnique({ where: { slug } });
        if (exists) throw new ApiError(400, "Unit dengan nama tersebut sudah tersedia");

        return prisma.unitRawMaterial.create({ data: { name: payload.name, slug } });
    }

    static async update(
        id: number,
        payload: Partial<RequestRawMaterialUnitDTO>,
    ): Promise<ResponseRawMaterialUnitDTO> {
        const unit = await this.findUnit(id);
        if (!unit) throw new ApiError(404, "Unit tidak ditemukan");
        if (!payload.name) throw new ApiError(400, "Nama unit wajib diisi");

        const newSlug = normalizeSlug(payload.name);

        if (newSlug !== unit.slug) {
            const slugExists = await prisma.unitRawMaterial.findFirst({
                where: { slug: newSlug, id: { not: id } },
            });
            if (slugExists)
                throw new ApiError(400, "Nama unit menghasilkan slug yang sudah digunakan");
        }

        return prisma.unitRawMaterial.update({
            where: { id },
            data: { name: payload.name, slug: newSlug },
        });
    }

    static async detail(id: number): Promise<ResponseRawMaterialUnitDTO> {
        const rows = await prisma.$queryRaw<ResponseRawMaterialUnitDTO[]>(Prisma.sql`
            SELECT id, name, slug FROM unit_raw_materials WHERE id = ${id} LIMIT 1
        `);

        if (!rows.length) throw new ApiError(404, "Unit tidak ditemukan");

        return rows[0] as ResponseRawMaterialUnitDTO;
    }

    static async delete(id: number) {
        const unit = await this.findUnit(id);
        if (!unit) throw new ApiError(404, "Unit tidak ditemukan");

        const usedCount = await prisma.rawMaterial.count({ where: { unit_id: id } });
        if (usedCount > 0)
            throw new ApiError(400, "Satuan masih digunakan oleh beberapa Raw Material");

        return prisma.unitRawMaterial.delete({ where: { id } });
    }

    static async list({
        page = 1,
        take = 10,
        search,
        sortBy = "id",
        sortOrder = "asc",
    }: QueryRawMaterialUnitDTO): Promise<{ data: ResponseRawMaterialUnitDTO[]; len: number }> {
        const { skip, take: limit } = GetPagination(page, take);
        const sortCol = Prisma.raw(SORT_MAP[sortBy] ?? "id");
        const sortDir = Prisma.raw(sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC");

        const where = search
            ? Prisma.sql`WHERE (name ILIKE ${"%" + search + "%"} OR slug ILIKE ${"%" + search + "%"})`
            : Prisma.empty;

        const [rows, [{ count }]] = await Promise.all([
            prisma.$queryRaw<ResponseRawMaterialUnitDTO[]>(Prisma.sql`
                SELECT id, name, slug FROM unit_raw_materials ${where}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ${limit} OFFSET ${skip}
            `),
            prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
                SELECT COUNT(*) AS count FROM unit_raw_materials ${where}
            `),
        ]);

        return { len: Number(count), data: rows };
    }

    private static async findUnit(id: number): Promise<UnitRawMaterial | null> {
        return prisma.unitRawMaterial.findUnique({ where: { id } });
    }
}
