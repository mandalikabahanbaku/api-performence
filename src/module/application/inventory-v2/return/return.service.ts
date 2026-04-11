import { Prisma } from "../../../../generated/prisma/client.js";
import prisma from "../../../../config/prisma.js";
import {
    ReturnStatus,
    TransferLocationType,
    MovementType,
    MovementRefType,
} from "../../../../generated/prisma/enums.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { RequestReturnDTO, UpdateReturnStatusDTO, QueryReturnDTO } from "./return.schema.js";
import { InventoryHelper, StockItem } from "../inventory.helper.js";
import { PRODUCT_INCLUDE, generateDocNumber } from "../inventory.constants.js";

const RETURN_INCLUDE = {
    items: { include: { product: PRODUCT_INCLUDE } },
    from_warehouse: true,
    from_outlet: true,
    to_warehouse: true,
    to_outlet: true,
    source_transfer: true,
} as const;

export class ReturnService {
    /**
     * Creates a Draft StockReturn from rejected items in a StockTransfer (DO or TG).
     * Must be called within an existing Prisma transaction.
     */
    static async createFromRejection(
        tx: Prisma.TransactionClient,
        transfer: any,
        userId: string = "system",
        targetWarehouseId?: number,
    ) {
        const rejectedItems = transfer.items.filter((i: any) => Number(i.quantity_rejected ?? 0) > 0);
        if (rejectedItems.length === 0) return null;

        return tx.stockReturn.create({
            data: {
                return_number: generateDocNumber("RTN"),
                from_type: transfer.to_type,
                from_warehouse_id: transfer.to_warehouse_id,
                from_outlet_id: transfer.to_outlet_id,
                to_type: transfer.from_type,
                to_warehouse_id: targetWarehouseId ?? transfer.from_warehouse_id,
                to_outlet_id: targetWarehouseId ? null : transfer.from_outlet_id,
                status: ReturnStatus.DRAFT,
                source_transfer_id: transfer.id,
                created_by: userId,
                notes: `Auto-generated dari penolakan dokumen ${transfer.transfer_number}`,
                items: {
                    create: rejectedItems.map((i: any) => ({
                        product_id: i.product_id,
                        quantity: i.quantity_rejected,
                        notes: i.notes,
                    })),
                },
            },
        });
    }

    static async create(payload: RequestReturnDTO, userId: string = "system") {
        return prisma.stockReturn.create({
            data: {
                return_number: generateDocNumber("RTN"),
                from_type: payload.from_type,
                from_warehouse_id: payload.from_warehouse_id,
                from_outlet_id: payload.from_outlet_id,
                to_type: payload.to_type,
                to_warehouse_id: payload.to_warehouse_id,
                status: ReturnStatus.DRAFT,
                notes: payload.notes,
                created_by: userId,
                items: {
                    create: payload.items.map((i) => ({
                        product_id: i.product_id,
                        quantity: i.quantity,
                        notes: i.notes,
                    })),
                },
            },
            include: RETURN_INCLUDE,
        });
    }

    static async list(query: QueryReturnDTO) {
        const { page = 1, take = 25, search, status } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockReturnWhereInput = {
            ...(search && {
                OR: [
                    { return_number: { contains: search, mode: "insensitive" } },
                    { source_transfer: { transfer_number: { contains: search, mode: "insensitive" } } },
                ],
            }),
            ...(status && { status: status as ReturnStatus }),
        };

        const [data, len] = await Promise.all([
            prisma.stockReturn.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: "desc" },
                include: RETURN_INCLUDE,
            }),
            prisma.stockReturn.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.stockReturn.findUnique({
            where: { id },
            include: RETURN_INCLUDE,
        });
        if (!result) throw new ApiError(404, "Data Retur tidak ditemukan");
        return result;
    }

    static async updateStatus(
        id: number,
        payload: UpdateReturnStatusDTO,
        userId: string = "system",
    ) {
        return await prisma.$transaction(async (tx) => {
            const stockReturn = await tx.stockReturn.findUnique({
                where: { id },
                include: { items: { include: { product: PRODUCT_INCLUDE } } },
            });

            if (!stockReturn) throw new ApiError(404, "Data Retur tidak ditemukan");
            if (
                stockReturn.status === ReturnStatus.COMPLETED ||
                stockReturn.status === ReturnStatus.CANCELLED
            ) {
                throw new ApiError(400, `Tidak dapat memperbarui retur dengan status ${stockReturn.status}`);
            }

            const finalStatus = payload.status;
            let updateData: Prisma.StockReturnUpdateInput = { status: finalStatus };

            if (finalStatus === ReturnStatus.SHIPPING) {
                updateData = await this._handleShipping(tx, stockReturn, updateData, userId);
            }

            if (finalStatus === ReturnStatus.RECEIVED) {
                updateData = await this._handleReceived(tx, stockReturn, updateData, userId);
            }

            if (finalStatus === ReturnStatus.CANCELLED) {
                updateData = await this._handleCancellation(tx, stockReturn, updateData, userId);
            }

            return tx.stockReturn.update({
                where: { id },
                data: updateData,
                include: RETURN_INCLUDE,
            });
        });
    }

    private static async _handleShipping(
        tx: Prisma.TransactionClient,
        stockReturn: any,
        updateData: Prisma.StockReturnUpdateInput,
        userId: string,
    ): Promise<Prisma.StockReturnUpdateInput> {
        if (stockReturn.status !== ReturnStatus.DRAFT) {
            throw new ApiError(400, "Hanya Retur berstatus DRAFT yang dapat dikirim (SHIPPING).");
        }

        const items: StockItem[] = stockReturn.items.map((i: any) => ({
            product_id: i.product_id,
            quantity: Number(i.quantity),
            product: i.product,
        }));

        if (stockReturn.from_type === TransferLocationType.WAREHOUSE && stockReturn.from_warehouse_id) {
            await InventoryHelper.deductWarehouseStock(
                tx, stockReturn.from_warehouse_id, items,
                stockReturn.id, MovementRefType.STOCK_RETURN, MovementType.RETURN_OUT, userId,
            );
        } else if (stockReturn.from_type === TransferLocationType.OUTLET && stockReturn.from_outlet_id) {
            await InventoryHelper.deductOutletStock(
                tx, stockReturn.from_outlet_id, items,
                stockReturn.id, MovementRefType.STOCK_RETURN, MovementType.RETURN_OUT, userId,
            );
        }

        return { ...updateData, shipped_at: new Date() };
    }

    private static async _handleReceived(
        tx: Prisma.TransactionClient,
        stockReturn: any,
        updateData: Prisma.StockReturnUpdateInput,
        userId: string,
    ): Promise<Prisma.StockReturnUpdateInput> {
        if (stockReturn.status !== ReturnStatus.SHIPPING) {
            throw new ApiError(400, "Hanya Retur berstatus SHIPPING yang dapat diterima (RECEIVED).");
        }

        if (stockReturn.to_warehouse_id) {
            const items: StockItem[] = stockReturn.items.map((i: any) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity),
                product: i.product,
            }));
            await InventoryHelper.addWarehouseStock(
                tx, stockReturn.to_warehouse_id, items,
                stockReturn.id, MovementRefType.STOCK_RETURN, MovementType.RETURN_IN, userId,
            );
        }

        // Auto-complete upon receipt
        return { ...updateData, status: ReturnStatus.COMPLETED, received_at: new Date() };
    }

    private static async _handleCancellation(
        tx: Prisma.TransactionClient,
        stockReturn: any,
        updateData: Prisma.StockReturnUpdateInput,
        userId: string,
    ): Promise<Prisma.StockReturnUpdateInput> {
        if (stockReturn.status === ReturnStatus.SHIPPING) {
            const items: StockItem[] = stockReturn.items.map((i: any) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity),
                product: i.product,
            }));

            if (stockReturn.from_type === TransferLocationType.WAREHOUSE && stockReturn.from_warehouse_id) {
                await InventoryHelper.addWarehouseStock(
                    tx, stockReturn.from_warehouse_id, items,
                    stockReturn.id, MovementRefType.STOCK_RETURN, MovementType.RETURN_IN, userId,
                    "Batal (Cancel) Retur",
                );
            } else if (stockReturn.from_type === TransferLocationType.OUTLET && stockReturn.from_outlet_id) {
                await InventoryHelper.addOutletStock(
                    tx, stockReturn.from_outlet_id, items,
                    stockReturn.id, MovementRefType.STOCK_RETURN, MovementType.RETURN_IN, userId,
                    "Batal (Cancel) Retur",
                );
            }
        }

        return updateData;
    }
}
