import { Prisma } from "../../../../generated/prisma/client.js";
import prisma from "../../../../config/prisma.js";
import {
    RequestTransferGudangDTO,
    QueryTransferGudangDTO,
    UpdateTransferGudangStatusDTO,
} from "./tg.schema.js";
import {
    TransferStatus,
    TransferLocationType,
    MovementType,
    MovementRefType,
    TransferPhotoStage,
} from "../../../../generated/prisma/enums.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import ExcelJS from "exceljs";
import { ReturnService } from "../return/return.service.js";
import { InventoryHelper, StockItem } from "../inventory.helper.js";
import {
    EXPORT_ROW_LIMIT,
    PRODUCT_INCLUDE,
    generateDocNumber,
    generateDocBarcode,
} from "../inventory.constants.js";

const TG_INCLUDE = {
    items: { include: { product: PRODUCT_INCLUDE } },
    from_warehouse: true,
    to_warehouse: true,
} as const;

type TxClient = Prisma.TransactionClient;

export class TGService {
    static async create(payload: RequestTransferGudangDTO, userId: string = "system") {
        const orderDate = new Date(payload.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (orderDate < today) {
            throw new ApiError(400, "Tanggal TG tidak boleh di masa lalu.");
        }
        if (payload.from_warehouse_id === payload.to_warehouse_id) {
            throw new ApiError(400, "Gudang asal dan tujuan tidak boleh sama.");
        }

        return prisma.stockTransfer.create({
            data: {
                transfer_number: generateDocNumber("TG"),
                barcode: generateDocBarcode("TG"),
                from_type: TransferLocationType.WAREHOUSE,
                from_warehouse_id: payload.from_warehouse_id,
                to_type: TransferLocationType.WAREHOUSE,
                to_warehouse_id: payload.to_warehouse_id,
                status: TransferStatus.PENDING,
                notes: payload.notes,
                date: orderDate,
                created_by: userId,
                items: {
                    create: payload.items.map((i) => ({
                        product_id: i.product_id,
                        quantity_requested: i.quantity_requested,
                        notes: i.notes,
                    })),
                },
            },
            include: TG_INCLUDE,
        });
    }

    static async list(query: QueryTransferGudangDTO) {
        const {
            page = 1,
            take = 10,
            sortBy = "created_at",
            sortOrder = "desc",
            search,
            status,
            from_warehouse_id,
            to_warehouse_id,
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockTransferWhereInput = {
            from_type: TransferLocationType.WAREHOUSE,
            to_type: TransferLocationType.WAREHOUSE,
            ...(search && {
                OR: [
                    { transfer_number: { contains: search, mode: "insensitive" } },
                    { barcode: { contains: search, mode: "insensitive" } },
                ],
            }),
            ...(status && { status }),
            ...(from_warehouse_id && { from_warehouse_id }),
            ...(to_warehouse_id && { to_warehouse_id }),
        };

        const [data, len] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy as string]: sortOrder },
                include: TG_INCLUDE,
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.stockTransfer.findUnique({
            where: { id },
            include: { ...TG_INCLUDE, photos: true },
        });

        if (!result) throw new ApiError(404, "Data Transfer Gudang tidak ditemukan");
        if (
            result.from_type !== TransferLocationType.WAREHOUSE ||
            result.to_type !== TransferLocationType.WAREHOUSE
        ) {
            throw new ApiError(403, "Akses ditolak: Data ini bukan merupakan Transfer Gudang.");
        }

        return result;
    }

    static async updateStatus(
        id: number,
        payload: UpdateTransferGudangStatusDTO,
        userId: string = "system",
    ) {
        return await prisma.$transaction(async (tx) => {
            const transfer = await tx.stockTransfer.findUnique({
                where: { id },
                include: { items: { include: { product: PRODUCT_INCLUDE } } },
            });

            if (!transfer) throw new ApiError(404, "Data Transfer Gudang tidak ditemukan");
            if (
                transfer.from_type !== TransferLocationType.WAREHOUSE ||
                transfer.to_type !== TransferLocationType.WAREHOUSE
            ) {
                throw new ApiError(400, "Tipe data tidak valid untuk pembaruan status TG.");
            }
            if (
                transfer.status === TransferStatus.COMPLETED ||
                transfer.status === TransferStatus.CANCELLED
            ) {
                throw new ApiError(400, `Tidak dapat memperbarui transfer dengan status ${transfer.status}`);
            }

            let updateData: Prisma.StockTransferUpdateInput = { status: payload.status };

            if (payload.status === TransferStatus.APPROVED) {
                if (transfer.status !== TransferStatus.PENDING) {
                    throw new ApiError(400, "Hanya TG berstatus PENDING yang dapat disetujui (APPROVED).");
                }
                updateData = { ...updateData, approved_at: new Date(), approved_by: userId };
            }

            if (payload.status === TransferStatus.CANCELLED) {
                updateData = await this._handleCancellation(tx, transfer, updateData, userId);
            }

            if (payload.status === TransferStatus.SHIPMENT) {
                updateData = await this._handleShipment(tx, transfer, payload, updateData, userId);
            }

            if (payload.status === TransferStatus.RECEIVED) {
                updateData = await this._handleReceived(tx, transfer, payload, updateData, userId);
            }

            if (payload.status === TransferStatus.FULFILLMENT) {
                updateData = await this._handleFulfillment(tx, transfer, payload, updateData, userId);
            }

            return tx.stockTransfer.update({
                where: { id },
                data: updateData,
                include: TG_INCLUDE,
            });
        });
    }

    private static async _handleCancellation(
        tx: TxClient,
        transfer: any,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (
            transfer.status === TransferStatus.REJECTED ||
            transfer.status === TransferStatus.MISSING
        ) {
            throw new ApiError(400, `Tidak dapat membatalkan TG yang sudah pada tahap ${transfer.status}.`);
        }

        if (
            (transfer.status === TransferStatus.SHIPMENT || transfer.status === TransferStatus.RECEIVED) &&
            transfer.from_warehouse_id
        ) {
            const items: StockItem[] = transfer.items.map((i: any) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity_packed || i.quantity_requested),
                product: i.product,
            }));
            await InventoryHelper.addWarehouseStock(
                tx, transfer.from_warehouse_id, items,
                transfer.id, MovementRefType.STOCK_TRANSFER, MovementType.TRANSFER_IN, userId,
                "Batal Transfer Gudang",
            );
        }

        return { ...updateData, cancelled_at: new Date(), cancelled_by: userId };
    }

    private static async _handleShipment(
        tx: TxClient,
        transfer: any,
        payload: UpdateTransferGudangStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.APPROVED) {
            throw new ApiError(400, "TG harus disetujui (APPROVED) sebelum dikirim (SHIPMENT).");
        }

        if (payload.items) {
            const itemsToUpdate = payload.items.filter((i) => i.quantity_packed !== undefined);
            await Promise.all(
                itemsToUpdate.map((i) =>
                    tx.stockTransferItem.update({
                        where: { id: i.id },
                        data: { quantity_packed: i.quantity_packed },
                    }),
                ),
            );
        }

        if (transfer.from_warehouse_id) {
            const items: StockItem[] = transfer.items.map((i: any) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity_packed || i.quantity_requested),
                product: i.product,
            }));
            await InventoryHelper.deductWarehouseStock(
                tx, transfer.from_warehouse_id, items,
                transfer.id, MovementRefType.STOCK_TRANSFER, MovementType.TRANSFER_OUT, userId,
            );
        }

        if (payload.photos && payload.photos.length > 0) {
            await tx.stockTransferPhoto.createMany({
                data: payload.photos.map((url: string) => ({
                    transfer_id: transfer.id,
                    url,
                    stage: TransferPhotoStage.SHIPMENT,
                    uploaded_by: userId,
                })),
            });
        }

        return { ...updateData, shipped_at: new Date(), shipment_notes: payload.notes };
    }

    private static async _handleReceived(
        tx: TxClient,
        transfer: any,
        payload: UpdateTransferGudangStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.SHIPMENT) {
            throw new ApiError(400, "Hanya TG berstatus SHIPMENT yang dapat diterima (RECEIVED).");
        }

        if (payload.items) {
            const itemsToUpdate = payload.items.filter((i) => i.quantity_received !== undefined);
            await Promise.all(
                itemsToUpdate.map((i) =>
                    tx.stockTransferItem.update({
                        where: { id: i.id },
                        data: { quantity_received: i.quantity_received },
                    }),
                ),
            );
        }

        if (payload.photos && payload.photos.length > 0) {
            await tx.stockTransferPhoto.createMany({
                data: payload.photos.map((url: string) => ({
                    transfer_id: transfer.id,
                    url,
                    stage: TransferPhotoStage.RECEIVED,
                    uploaded_by: userId,
                })),
            });
        }

        return { ...updateData, received_at: new Date(), received_notes: payload.notes };
    }

    private static async _handleFulfillment(
        tx: TxClient,
        transfer: any,
        payload: UpdateTransferGudangStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.RECEIVED) {
            throw new ApiError(400, "Data harus berstatus RECEIVED sebelum tahap FULFILLMENT.");
        }
        if (!payload.items || payload.items.length !== transfer.items.length) {
            throw new ApiError(400, "Semua item dalam TG harus diverifikasi pada tahap FULFILLMENT.");
        }

        const fulfilledMap = new Map<number, number>();
        const rejectedItemsList: Array<{ product_id: number; quantity_rejected: number; notes?: string | null }> = [];

        for (const reqItem of payload.items) {
            const dbItem = transfer.items.find((i: any) => i.id === reqItem.id);
            if (!dbItem) throw new ApiError(400, `Item ID ${reqItem.id} tidak valid untuk TG ini.`);

            const fulfilled = Number(reqItem.quantity_fulfilled ?? 0);
            const missing = Number(reqItem.quantity_missing ?? 0);
            const rejected = Number(reqItem.quantity_rejected ?? 0);

            if (fulfilled < 0 || missing < 0 || rejected < 0) {
                throw new ApiError(400, "Kuantitas tidak boleh bernilai negatif.");
            }

            const expected = Number(dbItem.quantity_packed || dbItem.quantity_requested);
            if (Math.abs(fulfilled + missing + rejected - expected) > 0.0001) {
                throw new ApiError(
                    400,
                    `Total verifikasi untuk item ID ${dbItem.id} (${fulfilled + missing + rejected}) tidak sesuai dengan Qty Pack (${expected}).`,
                );
            }

            await tx.stockTransferItem.update({
                where: { id: reqItem.id },
                data: { quantity_fulfilled: fulfilled, quantity_missing: missing, quantity_rejected: rejected },
            });

            fulfilledMap.set(dbItem.product_id, fulfilled);
            if (rejected > 0) {
                rejectedItemsList.push({ product_id: dbItem.product_id, quantity_rejected: rejected, notes: dbItem.notes });
            }
        }

        const fulfilledItems: StockItem[] = transfer.items
            .map((i: any) => ({ product_id: i.product_id, quantity: fulfilledMap.get(i.product_id) ?? 0 }))
            .filter((i: StockItem) => i.quantity > 0);

        if (fulfilledItems.length > 0 && transfer.to_warehouse_id) {
            await InventoryHelper.addWarehouseStock(
                tx, transfer.to_warehouse_id, fulfilledItems,
                transfer.id, MovementRefType.STOCK_TRANSFER, MovementType.TRANSFER_IN, userId,
            );
        }

        if (rejectedItemsList.length > 0) {
            await ReturnService.createFromRejection(
                tx,
                { ...transfer, items: rejectedItemsList },
                userId,
                transfer.from_warehouse_id ?? undefined,
            );
        }

        return {
            ...updateData,
            status: TransferStatus.COMPLETED,
            fulfilled_at: new Date(),
            fulfillment_notes: payload.notes,
        };
    }

    static async getStock(warehouse_id: number, product_id: number) {
        const pi = await prisma.productInventory.findFirst({
            where: { warehouse_id, product_id },
            orderBy: { id: "desc" },
        });
        return Number(pi?.quantity ?? 0);
    }

    static async export(query: QueryTransferGudangDTO) {
        const { data } = await this.list({ ...query, take: EXPORT_ROW_LIMIT, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data Transfer Gudang");

        sheet.columns = [
            { header: "No", key: "no", width: 5 },
            { header: "No. TG", key: "transfer_number", width: 20 },
            { header: "Barcode", key: "barcode", width: 20 },
            { header: "Tanggal", key: "date", width: 15 },
            { header: "Gudang (Asal)", key: "from_warehouse", width: 25 },
            { header: "Gudang (Tujuan)", key: "to_warehouse", width: 25 },
            { header: "Status", key: "status", width: 15 },
            { header: "Dibuat Oleh", key: "created_by", width: 20 },
            { header: "Catatan", key: "notes", width: 30 },
        ];

        data.forEach((item, index) => {
            sheet.addRow({
                no: index + 1,
                transfer_number: item.transfer_number,
                barcode: item.barcode,
                date: item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID") : "-",
                from_warehouse: item.from_warehouse?.name ?? "-",
                to_warehouse: item.to_warehouse?.name ?? "-",
                status: item.status,
                created_by: item.created_by,
                notes: item.notes ?? "-",
            });
        });

        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        return workbook.xlsx.writeBuffer();
    }
}
