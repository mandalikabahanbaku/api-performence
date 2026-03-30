import { Prisma } from "../../../generated/prisma/client.js";
import prisma from "../../../config/prisma.js";
import { RequestStockTransferDTO, QueryStockTransferDTO, RequestUpdateStockTransferStatusDTO } from "./stock-transfer.schema.js";
import { TransferStatus, MovementType, MovementEntityType, MovementRefType } from "../../../generated/prisma/enums.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";

function generateTransferNumber() {
    const date = new Date();
    const prefix = "TRF";
    const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${ym}-${random}`;
}

export class StockTransferService {
    static async create(payload: RequestStockTransferDTO, userId: string = "system") {
        return await prisma.$transaction(async (tx) => {
            const transfer_number = generateTransferNumber();

            // Verify barcode unique
            const ext = await tx.stockTransfer.findUnique({ where: { barcode: payload.barcode } });
            if (ext) throw new ApiError(400, "Barcode number already exists.");

            const transfer = await tx.stockTransfer.create({
                data: {
                    transfer_number,
                    barcode: payload.barcode,
                    from_type: payload.from_type,
                    from_warehouse_id: payload.from_warehouse_id,
                    from_outlet_id: payload.from_outlet_id,
                    to_type: payload.to_type,
                    to_warehouse_id: payload.to_warehouse_id,
                    to_outlet_id: payload.to_outlet_id,
                    status: TransferStatus.PENDING,
                    notes: payload.notes,
                    created_by: userId,
                    items: {
                        create: payload.items.map(i => ({
                            product_id: i.product_id,
                            quantity_requested: i.quantity_requested,
                            notes: i.notes
                        }))
                    }
                },
                include: { items: true }
            });
            return transfer;
        });
    }

    static async updateStatus(id: number, payload: RequestUpdateStockTransferStatusDTO, userId: string = "system") {
        return await prisma.$transaction(async (tx) => {
            const transfer = await tx.stockTransfer.findUnique({
                where: { id },
                include: { items: true }
            });

            if (!transfer) throw new ApiError(404, "Stock transfer not found");
            if (transfer.status === TransferStatus.COMPLETED || transfer.status === TransferStatus.CANCELLED) {
                throw new ApiError(400, `Cannot update transfer in ${transfer.status} state`);
            }

            let finalStatus = payload.status;
            const updateData: any = { status: finalStatus };

            if (finalStatus === TransferStatus.APPROVED) {
                updateData.approved_at = new Date();
                updateData.approved_by = userId;
            }

            if (finalStatus === TransferStatus.SHIPMENT) {
                updateData.shipped_at = new Date();
                updateData.shipment_notes = payload.notes;

                // Handle quantity_packed updates if provided
                if (payload.items) {
                    for (const reqItem of payload.items) {
                        if (reqItem.quantity_packed !== undefined) {
                            await tx.stockTransferItem.update({
                                where: { id: reqItem.id },
                                data: { quantity_packed: reqItem.quantity_packed }
                            });
                        }
                    }
                }

                // Deduct source inventory for SHIPMENT
                if (transfer.from_type === 'WAREHOUSE' && transfer.from_warehouse_id) {
                    await this.deductWarehouseInventory(tx, transfer.from_warehouse_id, transfer.items, transfer.id, userId);
                } else if (transfer.from_type === 'OUTLET' && transfer.from_outlet_id) {
                    await this.deductOutletInventory(tx, transfer.from_outlet_id, transfer.items, transfer.id, userId);
                }
            }

            if (finalStatus === TransferStatus.RECEIVED) {
                updateData.received_at = new Date();
                updateData.received_notes = payload.notes;

                // Handle quantity_received updates if provided
                if (payload.items) {
                    for (const reqItem of payload.items) {
                        if (reqItem.quantity_received !== undefined) {
                            await tx.stockTransferItem.update({
                                where: { id: reqItem.id },
                                data: { quantity_received: reqItem.quantity_received }
                            });
                        }
                    }
                }
            }

            if (finalStatus === TransferStatus.FULFILLMENT) {
                updateData.fulfilled_at = new Date();
                updateData.fulfillment_notes = payload.notes;

                let allPerfect = true;
                let anyFulfilled = false;
                let anyRejected = false;
                let anyMissing = false;

                // Process fulfillment items
                if (!payload.items || payload.items.length === 0) {
                    throw new ApiError(400, "Items array is required for FULFILLMENT stage to confirm quantities.");
                }

                const receivedMap = new Map();
                for (const reqItem of payload.items) {
                    const dbItem = transfer.items.find((i: any) => i.id === reqItem.id);
                    if (!dbItem) throw new ApiError(400, `Item ${reqItem.id} not found in this transfer`);

                    const fulfilled = reqItem.quantity_fulfilled || 0;
                    const missing = reqItem.quantity_missing || 0;
                    const rejected = reqItem.quantity_rejected || 0;

                    const expectedAmount = Number(dbItem.quantity_packed || dbItem.quantity_requested);
                    if (fulfilled + missing + rejected !== expectedAmount) {
                        throw new ApiError(400, `Sum of fulfilled, missing, and rejected for product ${dbItem.product_id} must equal requested/packed quantity (${expectedAmount})`);
                    }

                    if (fulfilled > 0) anyFulfilled = true;
                    if (missing > 0) anyMissing = true;
                    if (rejected > 0) anyRejected = true;
                    if (fulfilled !== expectedAmount) allPerfect = false;

                    await tx.stockTransferItem.update({
                        where: { id: reqItem.id },
                        data: {
                            quantity_fulfilled: fulfilled,
                            quantity_missing: missing,
                            quantity_rejected: rejected
                        }
                    });

                    receivedMap.set(dbItem.product_id, fulfilled);
                }

                // Add to destination inventory based on what was fulfilled
                const fulfilledItems = transfer.items.map((i: any) => ({
                    product_id: i.product_id,
                    quantity_fulfilled: receivedMap.get(i.product_id) || 0
                })).filter(i => i.quantity_fulfilled > 0);

                if (fulfilledItems.length > 0) {
                    if (transfer.to_type === 'OUTLET' && transfer.to_outlet_id) {
                        await this.addOutletInventory(tx, transfer.to_outlet_id, fulfilledItems, transfer.id, userId);
                    } else if (transfer.to_type === 'WAREHOUSE' && transfer.to_warehouse_id) {
                        await this.addWarehouseInventory(tx, transfer.to_warehouse_id, fulfilledItems, transfer.id, userId);
                    }
                }

                // Determine final auto-status based on outcome
                if (allPerfect) {
                    updateData.status = TransferStatus.COMPLETED;
                } else if (anyRejected && !anyFulfilled) {
                    updateData.status = TransferStatus.REJECTED;
                } else if (anyMissing && !anyFulfilled) {
                    updateData.status = TransferStatus.MISSING;
                } else {
                    updateData.status = TransferStatus.PARTIAL;
                }
            }

            const updatedTransfer = await tx.stockTransfer.update({
                where: { id },
                data: updateData,
                include: { items: true }
            });

            return updatedTransfer;
        });
    }

    private static async deductWarehouseInventory(tx: any, warehouse_id: number, items: any[], transfer_id: number, userId: string) {
        for (const item of items) {
            const deductAmount = Number(item.quantity_packed || item.quantity_requested);
            
            // Get current stock logic relies on productInventory schema structure.
            // Wait, product inventory splits by date/month/year? We need to deduct from global stock or latest year/month.
            // Since we need to manage actual physical deduction from ProductInventory, let's find the current entry.
            // Usually we find First or latest. For simplicity let's find the most recent one or create it.
            let pi = await tx.productInventory.findFirst({
                where: { product_id: item.product_id, warehouse_id },
                orderBy: { created_at: 'desc' }
            });
            
            if (!pi) throw new ApiError(400, `Insufficient stock in Warehouse for product ${item.product_id}`);
            
            if (Number(pi.quantity) < deductAmount) {
                 throw new ApiError(400, `Insufficient stock in Warehouse for product ${item.product_id}. Has ${pi.quantity}, requested ${deductAmount}`);
            }

            const qty_before = Number(pi.quantity);
            const qty_after = qty_before - deductAmount;

            // Updated with explicit check before update
            if (qty_after < 0) throw new ApiError(400, `Stock after deduction cannot be negative for product ${item.product_id}`);

            await tx.productInventory.update({
                where: { id: pi.id },
                data: { quantity: qty_after }
            });

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: 'WAREHOUSE',
                    location_id: warehouse_id,
                    movement_type: MovementType.TRANSFER_OUT,
                    quantity: deductAmount,
                    qty_before,
                    qty_after,
                    reference_id: transfer_id,
                    reference_type: MovementRefType.STOCK_TRANSFER,
                    created_by: userId
                }
            });
        }
    }

    private static async deductOutletInventory(tx: any, outlet_id: number, items: any[], transfer_id: number, userId: string) {
        for (const item of items) {
            const deductAmount = Number(item.quantity_packed || item.quantity_requested);
            const oi = await tx.outletInventory.findUnique({
                where: { outlet_id_product_id: { outlet_id, product_id: item.product_id } }
            });

            if (!oi || Number(oi.quantity) < deductAmount) {
                throw new ApiError(400, `Insufficient stock in Outlet for product ${item.product_id}`);
            }

            const qty_before = Number(oi.quantity);
            const qty_after = qty_before - deductAmount;

            await tx.outletInventory.update({
                where: { id: oi.id },
                data: { quantity: qty_after }
            });

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: 'OUTLET',
                    location_id: outlet_id,
                    movement_type: MovementType.TRANSFER_OUT,
                    quantity: deductAmount,
                    qty_before,
                    qty_after,
                    reference_id: transfer_id,
                    reference_type: MovementRefType.STOCK_TRANSFER,
                    created_by: userId
                }
            });
        }
    }

    private static async addWarehouseInventory(tx: any, warehouse_id: number, items: any[], transfer_id: number, userId: string) {
        const currentDate = new Date();
        for (const item of items) {
            const addAmount = Number(item.quantity_fulfilled);
            let pi = await tx.productInventory.findFirst({
                where: { product_id: item.product_id, warehouse_id },
                orderBy: { created_at: 'desc' }
            });
            
            let qty_before = 0;
            if (pi) {
                qty_before = Number(pi.quantity);
                await tx.productInventory.update({
                    where: { id: pi.id },
                    data: { quantity: qty_before + addAmount }
                });
            } else {
                pi = await tx.productInventory.create({
                    data: {
                        product_id: item.product_id,
                        warehouse_id,
                        quantity: addAmount,
                        date: currentDate.getDate(),
                        month: currentDate.getMonth() + 1,
                        year: currentDate.getFullYear()
                    }
                });
            }
            const qty_after = qty_before + addAmount;

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: 'WAREHOUSE',
                    location_id: warehouse_id,
                    movement_type: MovementType.TRANSFER_IN,
                    quantity: addAmount,
                    qty_before,
                    qty_after,
                    reference_id: transfer_id,
                    reference_type: MovementRefType.STOCK_TRANSFER,
                    created_by: userId
                }
            });
        }
    }

    private static async addOutletInventory(tx: any, outlet_id: number, items: any[], transfer_id: number, userId: string) {
        for (const item of items) {
            const addAmount = Number(item.quantity_fulfilled);
            let oi = await tx.outletInventory.findUnique({
                where: { outlet_id_product_id: { outlet_id, product_id: item.product_id } }
            });
            
            let qty_before = oi ? Number(oi.quantity) : 0;
            
            if (oi) {
                await tx.outletInventory.update({
                    where: { id: oi.id },
                    data: { quantity: qty_before + addAmount }
                });
            } else {
                await tx.outletInventory.create({
                    data: {
                        outlet_id,
                        product_id: item.product_id,
                        quantity: addAmount
                    }
                });
            }

            const qty_after = qty_before + addAmount;

            await tx.stockMovement.create({
                data: {
                    entity_type: MovementEntityType.PRODUCT,
                    entity_id: item.product_id,
                    location_type: 'OUTLET',
                    location_id: outlet_id,
                    movement_type: MovementType.TRANSFER_IN,
                    quantity: addAmount,
                    qty_before,
                    qty_after,
                    reference_id: transfer_id,
                    reference_type: MovementRefType.STOCK_TRANSFER,
                    created_by: userId
                }
            });
        }
    }

    static async list(query: QueryStockTransferDTO) {
        const {
            page = 1,
            take = 10,
            sortBy = "created_at",
            sortOrder = "desc",
            search,
            status,
            from_type,
            to_type
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockTransferWhereInput = {
            ...(search && {
                OR: [
                    { transfer_number: { contains: search, mode: "insensitive" } },
                    { barcode: { contains: search, mode: "insensitive" } },
                ],
            }),
            ...(status && { status }),
            ...(from_type && { from_type }),
            ...(to_type && { to_type }),
        };

        const [data, len] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { items: true },
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.stockTransfer.findUnique({
            where: { id },
            include: { 
                items: { include: { product: true } },
                from_warehouse: true,
                from_outlet: true,
                to_warehouse: true,
                to_outlet: true,
                photos: true
            }
        });

        if (!result) throw new ApiError(404, "Stock transfer not found");
        return result;
    }
}
