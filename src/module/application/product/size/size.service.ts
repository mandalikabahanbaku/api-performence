import prisma from "../../../../config/prisma.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { RequestSizeDTO, QuerySizeDTO, ResponseSizeDTO, UpdateSizeDTO } from "./size.schema.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";

export class ProductSizeService {
    static async create(body: RequestSizeDTO): Promise<ResponseSizeDTO> {
        const existing = await prisma.productSize.findUnique({ where: { size: body.size } });
        if (existing) throw new ApiError(400, `Ukuran ${body.size} sudah tersedia`);

        return await prisma.productSize.create({
            data: { size: body.size },
        });
    }

    static async list(query: QuerySizeDTO): Promise<{ data: ResponseSizeDTO[]; len: number }> {
        const { search, page = 1, take = 25 } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where = search !== undefined ? { size: search } : undefined;

        const [data, len] = await Promise.all([
            prisma.productSize.findMany({
                where,
                orderBy: { size: "asc" },
                skip,
                take: limit,
            }),
            prisma.productSize.count({ where }),
        ]);

        return { data, len };
    }

    static async update(id: number, body: UpdateSizeDTO): Promise<ResponseSizeDTO> {
        const existing = await prisma.productSize.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Ukuran tidak ditemukan");

        if (body.size !== undefined && body.size !== existing.size) {
            const conflict = await prisma.productSize.findUnique({ where: { size: body.size } });
            if (conflict) throw new ApiError(400, `Ukuran ${body.size} sudah digunakan`);
        }

        return await prisma.productSize.update({
            where: { id },
            data: { size: body.size ?? existing.size },
        });
    }

    static async delete(id: number): Promise<void> {
        const existing = await prisma.productSize.findUnique({
            where: { id },
            include: { _count: { select: { products: true } } },
        });

        if (!existing) throw new ApiError(404, "Ukuran tidak ditemukan");

        if (existing._count.products > 0) {
            throw new ApiError(
                400,
                "Ukuran tidak dapat dihapus karena masih digunakan oleh produk",
            );
        }

        await prisma.productSize.delete({ where: { id } });
    }
}
