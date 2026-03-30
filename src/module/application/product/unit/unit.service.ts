import prisma from "../../../../config/prisma.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { normalizeSlug } from "../../../../lib/index.js";
import { RequestUnitDTO, QueryUnitDTO, ResponseUnitDTO, UpdateUnitDTO } from "./unit.schema.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";

export class UnitService {
    static async create(body: RequestUnitDTO): Promise<ResponseUnitDTO> {
        const slug = normalizeSlug(body.name);

        const existing = await prisma.unit.findUnique({ where: { slug } });
        if (existing) throw new ApiError(400, `Satuan "${body.name}" sudah tersedia`);

        return await prisma.unit.create({
            data: { name: body.name.trim(), slug },
        });
    }

    static async list(query: QueryUnitDTO): Promise<{ data: ResponseUnitDTO[]; len: number }> {
        const { search, page = 1, take = 25 } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where = search
            ? { name: { contains: search, mode: "insensitive" as const } }
            : undefined;

        const [data, len] = await Promise.all([
            prisma.unit.findMany({
                where,
                orderBy: { name: "asc" },
                skip,
                take: limit,
            }),
            prisma.unit.count({ where }),
        ]);

        return { data, len };
    }

    static async update(id: number, body: UpdateUnitDTO): Promise<ResponseUnitDTO> {
        const existing = await prisma.unit.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Satuan tidak ditemukan");

        const name = body.name?.trim() ?? existing.name;
        const slug = normalizeSlug(name);

        if (slug !== existing.slug) {
            const conflict = await prisma.unit.findUnique({ where: { slug } });
            if (conflict) throw new ApiError(400, `Satuan "${name}" sudah digunakan`);
        }

        return await prisma.unit.update({
            where: { id },
            data: { name, slug },
        });
    }

    static async delete(id: number): Promise<void> {
        const existing = await prisma.unit.findUnique({
            where: { id },
            include: { _count: { select: { products: true } } },
        });

        if (!existing) throw new ApiError(404, "Satuan tidak ditemukan");

        if (existing._count.products > 0) {
            throw new ApiError(
                400,
                "Satuan tidak dapat dihapus karena masih digunakan oleh produk",
            );
        }

        await prisma.unit.delete({ where: { id } });
    }
}
