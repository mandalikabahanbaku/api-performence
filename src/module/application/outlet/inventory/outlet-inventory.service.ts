import { Prisma } from "../../../../generated/prisma/client.js";
import prisma from "../../../../config/prisma.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import {
    QueryOutletInventoryDTO,
    RequestOutletInventoryInitDTO,
    RequestOutletInventorySetMinStockDTO,
} from "./outlet-inventory.schema.js";

export class OutletInventoryService {
    private static async findOutlet(outlet_id: number) {
        const outlet = await prisma.outlet.findUnique({
            where: { id: outlet_id, deleted_at: null },
        });
        if (!outlet) throw new ApiError(404, "Outlet tidak ditemukan");
        return outlet;
    }

    static async getStock(outlet_id: number, product_id: number) {
        const outlet = await OutletInventoryService.findOutlet(outlet_id);

        const inventory = await prisma.outletInventory.findUnique({
            where: { outlet_id_product_id: { outlet_id, product_id } },
            include: { product: { select: { id: true, name: true, code: true } } },
        });
        
        if (!inventory) throw new ApiError(404, "Stok produk tidak ditemukan di outlet ini");

        return {
            ...inventory,
            quantity: Number(inventory.quantity || 0),
            location_name: outlet.name,
            is_low_stock:
                inventory.min_stock !== null &&
                Number(inventory.quantity) < Number(inventory.min_stock),
        };
    }

    static async listStock(outlet_id: number, query: QueryOutletInventoryDTO) {
        await OutletInventoryService.findOutlet(outlet_id);

        const {
            page = 1,
            take = 25,
            search,
            low_stock,
            sortBy = "updated_at",
            sortOrder = "asc",
        } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.OutletInventoryWhereInput = {
            outlet_id,
            ...(search && {
                product: {
                    OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { code: { contains: search, mode: "insensitive" } },
                    ],
                },
            }),
        };

        const include = {
            product: { select: { id: true, name: true, code: true } },
        };

        // low_stock requires field-to-field comparison (qty < min_stock),
        // not supported by Prisma filters — fetch all and filter in memory.
        if (low_stock === "true") {
            const all = await prisma.outletInventory.findMany({
                where,
                include,
                orderBy: { [sortBy]: sortOrder },
            });
            const filtered = all
                .map((item) => ({
                    ...item,
                    is_low_stock:
                        item.min_stock !== null && Number(item.quantity) < Number(item.min_stock),
                }))
                .filter((item) => item.is_low_stock);

            return { data: filtered.slice(skip, skip + limit), len: filtered.length };
        }

        const [data, len] = await Promise.all([
            prisma.outletInventory.findMany({
                where,
                include,
                orderBy: { [sortBy]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.outletInventory.count({ where }),
        ]);

        return {
            data: data.map((item) => ({
                ...item,
                is_low_stock:
                    item.min_stock !== null && Number(item.quantity) < Number(item.min_stock),
            })),
            len,
        };
    }

    static async initProducts(outlet_id: number, body: RequestOutletInventoryInitDTO) {
        await OutletInventoryService.findOutlet(outlet_id);

        const { product_ids } = body;

        const found = await prisma.product.findMany({
            where: { id: { in: product_ids }, deleted_at: null },
            select: { id: true },
        });

        if (found.length !== product_ids.length) {
            throw new ApiError(404, "Satu atau lebih produk tidak ditemukan atau sudah dihapus");
        }

        const result = await prisma.outletInventory.createMany({
            data: product_ids.map((product_id) => ({ outlet_id, product_id, quantity: 0 })),
            skipDuplicates: true,
        });

        return { initialized: result.count, total: product_ids.length };
    }

    static async setMinStock(outlet_id: number, product_id: number, body: RequestOutletInventorySetMinStockDTO) {
        const inventory = await prisma.outletInventory.findUnique({
            where: { outlet_id_product_id: { outlet_id, product_id } },
        });
        if (!inventory) throw new ApiError(404, "Stok produk tidak ditemukan di outlet ini");

        return await prisma.outletInventory.update({
            where: { outlet_id_product_id: { outlet_id, product_id } },
            data: { min_stock: body.min_stock },
            include: { product: { select: { id: true, name: true, code: true } } },
        });
    }

    /**
     * Internal method — tambah atau kurangi quantity stok.
     * Dipanggil oleh StockTransfer dan POS Transaction.
     * @param delta Positif = masuk (IN), negatif = keluar (OUT)
     * @param tx   Prisma transaction client (opsional)
     */
    static async adjustQuantity(
        outlet_id: number,
        product_id: number,
        delta: number,
        tx?: typeof prisma,
    ) {
        const client = tx ?? prisma;

        const inventory = await client.outletInventory.findUnique({
            where: { outlet_id_product_id: { outlet_id, product_id } },
        });
        if (!inventory) throw new ApiError(404, "Stok produk tidak ditemukan di outlet ini");

        const qty_before = Number(inventory.quantity);
        const qty_after = qty_before + delta;

        if (qty_after < 0)
            throw new ApiError(422, "Stok tidak mencukupi untuk melakukan pengurangan");

        await client.outletInventory.update({
            where: { outlet_id_product_id: { outlet_id, product_id } },
            data: { quantity: qty_after },
        });

        return { qty_before, qty_after };
    }
}
