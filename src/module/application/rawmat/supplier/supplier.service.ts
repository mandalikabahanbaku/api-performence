import prisma from "../../../../config/prisma.js";
import { Prisma, Supplier } from "../../../../generated/prisma/client.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { normalizeSlug } from "../../../../lib/index.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import { QuerySupplierDTO, RequestSupplierDTO, ResponseSupplierDTO } from "./supplier.schema.js";

const SORT_MAP: Record<string, string> = {
    country: "country",
    name: "name",
    updated_at: "updated_at",
    created_at: "created_at",
};

export class SupplierService {
    static async create(data: RequestSupplierDTO): Promise<ResponseSupplierDTO> {
        if (data.phone) {
            const exists = await prisma.supplier.findUnique({ where: { phone: data.phone } });
            if (exists) throw new ApiError(400, "Nomor telepon supplier sudah digunakan");
        }

        return prisma.supplier.create({
            data: {
                name: data.name,
                slug: normalizeSlug(data.name),
                addresses: data.addresses,
                country: data.country,
                phone: data.phone,
            },
        });
    }

    static async update(
        id: number,
        payload: Partial<RequestSupplierDTO>,
    ): Promise<ResponseSupplierDTO> {
        const supplier = await this.findSupplier(id);
        if (!supplier) throw new ApiError(404, "Supplier tidak ditemukan");

        if (payload.phone) {
            const phoneExists = await prisma.supplier.findFirst({
                where: { phone: payload.phone, id: { not: id } },
            });
            if (phoneExists) throw new ApiError(400, "Nomor telepon supplier sudah digunakan");
        }

        return prisma.supplier.update({
            where: { id },
            data: {
                ...(payload.name !== undefined && {
                    name: payload.name,
                    slug: normalizeSlug(payload.name),
                }),
                ...(payload.addresses !== undefined && { addresses: payload.addresses }),
                ...(payload.country !== undefined && { country: payload.country }),
                ...(payload.phone !== undefined && { phone: payload.phone }),
            },
        });
    }

    static async detail(id: number): Promise<ResponseSupplierDTO> {
        const rows = await prisma.$queryRaw<ResponseSupplierDTO[]>(Prisma.sql`
            SELECT id, name, addresses, country, phone, created_at, updated_at
            FROM suppliers
            WHERE id = ${id}
            LIMIT 1
        `);

        if (!rows.length) throw new ApiError(404, "Supplier tidak ditemukan");

        return rows[0] as ResponseSupplierDTO;
    }

    static async delete(id: number) {
        const supplier = await this.findSupplier(id);
        if (!supplier) throw new ApiError(404, "Supplier tidak ditemukan");

        const usedCount = await prisma.rawMaterial.count({ where: { supplier_id: id } });
        if (usedCount > 0)
            throw new ApiError(400, "Supplier masih digunakan oleh beberapa Raw Material");

        return prisma.supplier.delete({ where: { id } });
    }

    static async list({
        page = 1,
        take = 10,
        sortBy = "updated_at",
        sortOrder = "desc",
        search,
    }: QuerySupplierDTO): Promise<{ data: ResponseSupplierDTO[]; len: number }> {
        const { skip, take: limit } = GetPagination(page, take);
        const sortCol = Prisma.raw(SORT_MAP[sortBy] ?? "updated_at");
        const sortDir = Prisma.raw(sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC");

        const where = search
            ? Prisma.sql`WHERE (name ILIKE ${"%" + search + "%"} OR phone ILIKE ${"%" + search + "%"} OR country ILIKE ${"%" + search + "%"})`
            : Prisma.empty;

        const [rows, [{ count }]] = await Promise.all([
            prisma.$queryRaw<ResponseSupplierDTO[]>(Prisma.sql`
                SELECT id, name, addresses, country, phone, created_at, updated_at
                FROM suppliers ${where}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ${limit} OFFSET ${skip}
            `),
            prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
                SELECT COUNT(*) AS count FROM suppliers ${where}
            `),
        ]);

        return { len: Number(count), data: rows };
    }

    private static async findSupplier(id: number): Promise<Supplier | null> {
        return prisma.supplier.findUnique({ where: { id } });
    }
}
