import {
    QueryWarehouseDTO,
    RequestWarehouseDTO,
    ResponseWarehouseDTO,
} from "./warehouse.schema.js";
import prisma from "../../../config/prisma.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import { STATUS } from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";

export class WarehouseService {
    private static async getLatestInventoryPeriod() {
        const latestProduct = await prisma.productInventory.findFirst({
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { month: true, year: true },
        });

        if (!latestProduct) {
            return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
        }

        return latestProduct;
    }

    static async create(body: RequestWarehouseDTO) {
        if (body.code) {
            const existing = await prisma.warehouse.findUnique({ where: { code: body.code } });
            if (existing) throw new ApiError(409, `Kode gudang "${body.code}" sudah digunakan`);
        }

        return await prisma.warehouse.create({
            data: {
                code: body.code,
                name: body.name,
                type: body.type,
                warehouse_address: {
                    create: body.warehouse_address,
                },
            },
            include: { warehouse_address: true },
        });
    }

    static async update(id: number, body: Partial<RequestWarehouseDTO>) {
        const warehouse = await prisma.warehouse.findUnique({ where: { id, deleted_at: null } });
        if (!warehouse) throw new ApiError(404, "Gudang tidak ditemukan");

        if (body.code && body.code !== warehouse.code) {
            const existing = await prisma.warehouse.findUnique({ where: { code: body.code } });
            if (existing) throw new ApiError(409, `Kode gudang "${body.code}" sudah digunakan`);
        }

        return await prisma.warehouse.update({
            where: { id },
            data: {
                code: body.code,
                name: body.name,
                type: body.type,
                warehouse_address: body.warehouse_address
                    ? {
                          upsert: {
                              create: body.warehouse_address,
                              update: body.warehouse_address,
                          },
                      }
                    : undefined,
            },
            include: { warehouse_address: true },
        });
    }

    static async list(
        query: QueryWarehouseDTO,
    ): Promise<{ data: ResponseWarehouseDTO[]; len: number }> {
        const {
            page = 1,
            take = 25,
            search,
            sortBy = "updated_at",
            sortOrder = "asc",
            type,
        } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.WarehouseWhereInput = {
            deleted_at: null,
            ...(type && { type }),
            ...(search && { name: { contains: search, mode: "insensitive" } }),
        };

        const [data, len] = await Promise.all([
            prisma.warehouse.findMany({
                where,
                include: { warehouse_address: true },
                orderBy: { [sortBy]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.warehouse.count({ where }),
        ]);

        return { data: data as unknown as ResponseWarehouseDTO[], len };
    }

    static async detail(id: number): Promise<ResponseWarehouseDTO> {
        const warehouse = await prisma.warehouse.findUnique({
            where: { id, deleted_at: null },
            include: { warehouse_address: true },
        });

        if (!warehouse) throw new ApiError(404, "Gudang tidak ditemukan");

        return warehouse as unknown as ResponseWarehouseDTO;
    }

    static async changeStatus(id: number, status: STATUS) {
        const warehouse = await prisma.warehouse.findUnique({
            where: {
                id,
                deleted_at: status === "DELETE" ? null : { not: null },
            },
        });

        if (!warehouse) throw new ApiError(404, "Data gudang tidak ditemukan");

        return await prisma.warehouse.update({
            where: { id },
            data: {
                deleted_at: status === "DELETE" ? new Date() : null,
            },
        });
    }

    static async deleted(id: number, force: boolean = false) {
        const warehouse = await prisma.warehouse.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        outlet_warehouses: true,
                        product_inventories: true,
                        raw_material_inventories: true,
                    },
                },
            },
        });

        if (!warehouse) throw new ApiError(404, "Data gudang tidak ditemukan");

        if (!force) {
            // 1. Check Outlet Links
            if (warehouse._count.outlet_warehouses > 0) {
                throw new ApiError(
                    400,
                    "Gudang tidak dapat dihapus karena masih terhubung dengan Outlet",
                );
            }

            // 2. Check Inventory History
            if (
                warehouse._count.product_inventories > 0 ||
                warehouse._count.raw_material_inventories > 0
            ) {
                throw new ApiError(
                    400,
                    "Gudang tidak dapat dihapus karena memiliki riwayat stok (Saran: Gunakan Non-aktif/Soft Delete)",
                );
            }

            // 3. Check Stock Movements (Polymorphic-like relation)
            const movementCount = await prisma.stockMovement.count({
                where: {
                    location_type: "WAREHOUSE",
                    location_id: id,
                },
            });

            if (movementCount > 0) {
                throw new ApiError(
                    400,
                    "Gudang tidak dapat dihapus karena memiliki riwayat pergerakan stok (Movement Log)",
                );
            }
        }

        await prisma.$transaction([
            prisma.stockMovement.deleteMany({
                where: {
                    location_type: "WAREHOUSE",
                    location_id: id,
                },
            }),
            prisma.warehouseAddress.delete({ where: { warehouse_id: id } }),
            prisma.warehouse.delete({ where: { id } }),
        ]);
    }

    static async getStock(warehouse_id: number, product_id: number) {
        const warehouse = await prisma.warehouse.findUnique({
            where: { id: warehouse_id, deleted_at: null },
        });

        if (!warehouse) {
            throw new ApiError(404, "Gudang tidak ditemukan");
        }

        const period = await this.getLatestInventoryPeriod();

        const invs = await prisma.productInventory.findMany({
            where: {
                product_id,
                warehouse_id,
                month: period.month,
                year: period.year,
            },
        });

        const quantity = invs.reduce((sum, inv) => {
            const val = Number(inv.quantity || 0);
            return sum + val;
        }, 0);

        return {
            quantity,
            min_stock: invs.length > 0 ? Number(invs[0]?.min_stock || 0) : null,
            location_name: warehouse.name,
        };
    }
}
