import { Prisma } from "../../../generated/prisma/client.js";
import { WarehouseType } from "../../../generated/prisma/enums.js";
import prisma from "../../../config/prisma.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import { QueryOutletDTO, RequestOutletDTO, UpdateOutletDTO } from "./outlet.schema.js";

const WAREHOUSE_INCLUDE = {
    warehouses: {
        orderBy: { priority: "asc" as const },
        include: { warehouse: { select: { id: true, code: true, name: true, type: true } } },
    },
};

const OUTLET_INCLUDE = {
    address: true,
    ...WAREHOUSE_INCLUDE,
    _count: { select: { inventories: true } },
};

export class OutletService {
    private static async validateWarehouses(warehouseIds: number[]) {
        if (!warehouseIds.length) return;

        const warehouses = await prisma.warehouse.findMany({
            where: { id: { in: warehouseIds }, deleted_at: null },
            select: { id: true, type: true },
        });

        const foundIds = new Set(warehouses.map((w) => w.id));
        const notFound = warehouseIds.filter((id) => !foundIds.has(id));
        if (notFound.length)
            throw new ApiError(404, `Gudang dengan ID ${notFound.join(", ")} tidak ditemukan`);

        const nonFG = warehouses.filter((w) => w.type !== WarehouseType.FINISH_GOODS);
        if (nonFG.length)
            throw new ApiError(
                422,
                "Outlet hanya dapat terhubung dengan gudang bertipe Barang Jadi (Finish Goods)",
            );
    }

    static async create(body: RequestOutletDTO) {
        const existing = await prisma.outlet.findUnique({ where: { code: body.code } });
        if (existing) throw new ApiError(409, `Kode outlet "${body.code}" sudah digunakan`);

        if (body.warehouse_ids?.length) await this.validateWarehouses(body.warehouse_ids);

        return await prisma.outlet.create({
            data: {
                name: body.name,
                code: body.code,
                phone: body.phone ?? null,
                type: body.type ?? "RETAIL",
                address: body.address ? { create: body.address } : undefined,
                warehouses: body.warehouse_ids?.length
                    ? {
                          create: body.warehouse_ids.map((wid, idx) => ({
                              warehouse_id: wid,
                              priority: idx + 1,
                          })),
                      }
                    : undefined,
            },
            include: OUTLET_INCLUDE,
        });
    }

    static async update(id: number, body: UpdateOutletDTO) {
        const outlet = await prisma.outlet.findUnique({ where: { id, deleted_at: null } });
        if (!outlet) throw new ApiError(404, "Outlet tidak ditemukan");

        if (body.code && body.code !== outlet.code) {
            const existing = await prisma.outlet.findUnique({ where: { code: body.code } });
            if (existing) throw new ApiError(409, `Kode outlet "${body.code}" sudah digunakan`);
        }

        if (body.warehouse_ids?.length) await this.validateWarehouses(body.warehouse_ids);

        return await prisma.$transaction(async (tx) => {
            if (body.warehouse_ids !== undefined) {
                await tx.outletWarehouse.deleteMany({ where: { outlet_id: id } });
                if (body.warehouse_ids.length) {
                    await tx.outletWarehouse.createMany({
                        data: body.warehouse_ids.map((wid, idx) => ({
                            outlet_id: id,
                            warehouse_id: wid,
                            priority: idx + 1,
                        })),
                    });
                }
            }

            return await tx.outlet.update({
                where: { id },
                data: {
                    name: body.name,
                    code: body.code,
                    phone: body.phone,
                    type: body.type,
                    address: body.address
                        ? { upsert: { create: body.address, update: body.address } }
                        : undefined,
                },
                include: OUTLET_INCLUDE,
            });
        });
    }

    static async toggleStatus(id: number) {
        const outlet = await prisma.outlet.findUnique({ where: { id } });
        if (!outlet) throw new ApiError(404, "Outlet tidak ditemukan atau sudah dihapus");

        return await prisma.outlet.update({
            where: { id },
            data: { deleted_at: outlet.deleted_at ? null : new Date() },
            select: { id: true, name: true, code: true, deleted_at: true },
        });
    }

    static async list(query: QueryOutletDTO) {
        const {
            page = 1,
            take = 25,
            search,
            status,
            type,
            warehouse_id,
            sortBy = "updated_at",
            sortOrder = "asc",
        } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.OutletWhereInput = {
            deleted_at: status === "active" ? null : { not: null },
            ...(type && { type }),
            ...(warehouse_id && {
                warehouses: { some: { warehouse_id } },
            }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { code: { contains: search, mode: "insensitive" } },
                ],
            }),
        };

        const [data, len] = await Promise.all([
            prisma.outlet.findMany({
                where,
                include: OUTLET_INCLUDE,
                orderBy: { [sortBy]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.outlet.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const outlet = await prisma.outlet.findUnique({
            where: { id, deleted_at: null },
            include: OUTLET_INCLUDE,
        });
        if (!outlet) throw new ApiError(404, "Outlet tidak ditemukan");
        return outlet;
    }

    static async clean() {
        const count = await prisma.outlet.count({
            where: {
                deleted_at: { not: null },
            },
        });

        if (count < 1)
            throw new ApiError(400, "Tidak ada data outlet di sampah yang dapat dibersihkan");

        await prisma.outlet.deleteMany({
            where: {
                deleted_at: { not: null },
            },
        });

        return { message: `Berhasil membersihkan ${count} data outlet secara permanen` };
    }

    static async bulkStatus(ids: number[], status: "active" | "deleted") {
        return await prisma.outlet.updateMany({
            where: { id: { in: ids } },
            data: { deleted_at: status === "active" ? null : new Date() },
        });
    }

    static async bulkDelete(ids: number[]) {
        return await prisma.outlet.deleteMany({
            where: { id: { in: ids }, deleted_at: { not: null } },
        });
    }
}
