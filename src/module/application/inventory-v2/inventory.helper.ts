import { Prisma } from "../../../generated/prisma/client.js";
import {
    MovementEntityType,
    MovementLocationType,
    MovementRefType,
    MovementType,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../../lib/errors/api.error.js";

export interface StockItem {
    product_id: number;
    quantity: number;
    product?: { name?: string; code?: string };
}

export class InventoryHelper {
    /**
     * Deducts stock from a warehouse. Throws ApiError(400) if insufficient.
     * Creates a StockMovement audit record.
     */
    static async deductWarehouseStock(
        tx: Prisma.TransactionClient,
        warehouse_id: number,
        items: StockItem[],
        ref_id: number,
        ref_type: MovementRefType,
        movement_type: MovementType,
        userId: string,
    ): Promise<void> {
        for (const item of items) {
            const pi = await tx.productInventory.findFirst({
                where: { product_id: item.product_id, warehouse_id },
                orderBy: { id: "desc" },
            });

            if (!pi || Number(pi.quantity) < item.quantity) {
                const label = item.product?.code
                    ? `[${item.product.code}] ${item.product.name ?? item.product_id}`
                    : String(item.product?.name ?? `ID:${item.product_id}`);
                throw new ApiError(400, `Stok tidak mencukupi di Gudang untuk produk ${label}`);
            }

            const qty_before = Number(pi.quantity);
            const qty_after = qty_before - item.quantity;

            await tx.productInventory.update({
                where: { id: pi.id },
                data: { quantity: qty_after },
            });

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: MovementLocationType.WAREHOUSE,
                    location_id: warehouse_id,
                    movement_type,
                    quantity: item.quantity,
                    qty_before,
                    qty_after,
                    reference_id: ref_id,
                    reference_type: ref_type,
                    created_by: userId,
                },
            });
        }
    }

    /**
     * Adds stock to a warehouse. Creates the inventory record if it doesn't exist.
     * Creates a StockMovement audit record.
     */
    static async addWarehouseStock(
        tx: Prisma.TransactionClient,
        warehouse_id: number,
        items: StockItem[],
        ref_id: number,
        ref_type: MovementRefType,
        movement_type: MovementType,
        userId: string,
        notes?: string,
    ): Promise<void> {
        const now = new Date();
        for (const item of items) {
            const pi = await tx.productInventory.findFirst({
                where: { product_id: item.product_id, warehouse_id },
                orderBy: { id: "desc" },
            });

            const qty_before = pi ? Number(pi.quantity) : 0;
            const qty_after = qty_before + item.quantity;

            if (pi) {
                await tx.productInventory.update({
                    where: { id: pi.id },
                    data: { quantity: qty_after },
                });
            } else {
                await tx.productInventory.create({
                    data: {
                        product_id: item.product_id,
                        warehouse_id,
                        quantity: item.quantity,
                        date: now.getDate(),
                        month: now.getMonth() + 1,
                        year: now.getFullYear(),
                    },
                });
            }

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: MovementLocationType.WAREHOUSE,
                    location_id: warehouse_id,
                    movement_type,
                    quantity: item.quantity,
                    qty_before,
                    qty_after,
                    reference_id: ref_id,
                    reference_type: ref_type,
                    created_by: userId,
                    ...(notes ? { notes } : {}),
                },
            });
        }
    }

    /**
     * Deducts stock from an outlet. Throws ApiError(400) if insufficient.
     * Creates a StockMovement audit record.
     */
    static async deductOutletStock(
        tx: Prisma.TransactionClient,
        outlet_id: number,
        items: StockItem[],
        ref_id: number,
        ref_type: MovementRefType,
        movement_type: MovementType,
        userId: string,
    ): Promise<void> {
        for (const item of items) {
            const oi = await tx.outletInventory.findUnique({
                where: { outlet_id_product_id: { outlet_id, product_id: item.product_id } },
            });

            if (!oi || Number(oi.quantity) < item.quantity) {
                const pName = item.product?.name ?? `ID:${item.product_id}`;
                throw new ApiError(400, `Stok tidak mencukupi di Outlet untuk produk ${pName}`);
            }

            const qty_before = Number(oi.quantity);
            const qty_after = qty_before - item.quantity;

            await tx.outletInventory.update({
                where: { id: oi.id },
                data: { quantity: qty_after },
            });

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: MovementLocationType.OUTLET,
                    location_id: outlet_id,
                    movement_type,
                    quantity: item.quantity,
                    qty_before,
                    qty_after,
                    reference_id: ref_id,
                    reference_type: ref_type,
                    created_by: userId,
                },
            });
        }
    }

    /**
     * Adds stock to an outlet. Creates the inventory record if it doesn't exist.
     * Creates a StockMovement audit record.
     */
    static async addOutletStock(
        tx: Prisma.TransactionClient,
        outlet_id: number,
        items: StockItem[],
        ref_id: number,
        ref_type: MovementRefType,
        movement_type: MovementType,
        userId: string,
        notes?: string,
    ): Promise<void> {
        for (const item of items) {
            const oi = await tx.outletInventory.findUnique({
                where: { outlet_id_product_id: { outlet_id, product_id: item.product_id } },
            });

            const qty_before = oi ? Number(oi.quantity) : 0;
            const qty_after = qty_before + item.quantity;

            if (oi) {
                await tx.outletInventory.update({
                    where: { id: oi.id },
                    data: { quantity: qty_after },
                });
            } else {
                await tx.outletInventory.create({
                    data: { outlet_id, product_id: item.product_id, quantity: item.quantity },
                });
            }

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: MovementLocationType.OUTLET,
                    location_id: outlet_id,
                    movement_type,
                    quantity: item.quantity,
                    qty_before,
                    qty_after,
                    reference_id: ref_id,
                    reference_type: ref_type,
                    created_by: userId,
                    ...(notes ? { notes } : {}),
                },
            });
        }
    }
}
