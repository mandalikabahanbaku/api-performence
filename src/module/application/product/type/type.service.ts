import prisma from "../../../../config/prisma.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { normalizeSlug } from "../../../../lib/index.js";
import { RequestTypeDTO, QueryTypeDTO, ResponseTypeDTO, UpdateTypeDTO } from "./type.schema.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";

export class TypeService {
    static async create(body: RequestTypeDTO): Promise<ResponseTypeDTO> {
        const slug = normalizeSlug(body.name);

        const existing = await prisma.productType.findUnique({ where: { slug } });
        if (existing) throw new ApiError(400, `Tipe "${body.name}" sudah tersedia`);

        return await prisma.productType.create({
            data: { name: body.name.trim(), slug },
        });
    }

    static async list(query: QueryTypeDTO): Promise<{ data: ResponseTypeDTO[]; len: number }> {
        const { search, page = 1, take = 25 } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where = search
            ? { name: { contains: search, mode: "insensitive" as const } }
            : undefined;

        const [data, len] = await Promise.all([
            prisma.productType.findMany({
                where,
                orderBy: { name: "asc" },
                skip,
                take: limit,
            }),
            prisma.productType.count({ where }),
        ]);

        return { data, len };
    }

    static async update(id: number, body: UpdateTypeDTO): Promise<ResponseTypeDTO> {
        const existing = await prisma.productType.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Tipe produk tidak ditemukan");

        const name = body.name?.trim() ?? existing.name;
        const slug = normalizeSlug(name);

        if (slug !== existing.slug) {
            const conflict = await prisma.productType.findUnique({ where: { slug } });
            if (conflict) throw new ApiError(400, `Tipe "${name}" sudah digunakan`);
        }

        return await prisma.productType.update({
            where: { id },
            data: { name, slug },
        });
    }

    static async delete(id: number): Promise<void> {
        const existing = await prisma.productType.findUnique({
            where: { id },
            include: { _count: { select: { products: true } } },
        });

        if (!existing) throw new ApiError(404, "Tipe produk tidak ditemukan");

        if (existing._count.products > 0) {
            throw new ApiError(
                400,
                "Tipe produk tidak dapat dihapus karena masih digunakan oleh produk",
            );
        }

        await prisma.productType.delete({ where: { id } });
    }
}
