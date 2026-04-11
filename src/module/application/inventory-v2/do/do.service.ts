import { Prisma } from "../../../../generated/prisma/client.js";
import prisma from "../../../../config/prisma.js";
import {
    RequestDeliveryOrderDTO,
    QueryDeliveryOrderDTO,
    UpdateDeliveryOrderStatusDTO,
} from "./do.schema.js";
import {
    TransferStatus,
    TransferLocationType,
    MovementType,
    MovementRefType,
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

const DO_INCLUDE = {
    items: { include: { product: PRODUCT_INCLUDE } },
    from_warehouse: true,
    to_outlet: true,
} as const;

type TxClient = Prisma.TransactionClient;
type DiscrepancyQuery = { page?: number; take?: number; search?: string };

export class DOService {
    static async create(payload: RequestDeliveryOrderDTO, userId: string = "system") {
        const orderDate = new Date(payload.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (orderDate < today) throw new ApiError(400, "Tanggal DO tidak boleh di masa lalu.");

        return prisma.stockTransfer.create({
            data: {
                transfer_number: generateDocNumber("DO"),
                barcode: generateDocBarcode("DO"),
                from_type: TransferLocationType.WAREHOUSE,
                from_warehouse_id: payload.from_warehouse_id,
                to_type: TransferLocationType.OUTLET,
                to_outlet_id: payload.to_outlet_id,
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
            include: DO_INCLUDE,
        });
    }

    static async list(query: QueryDeliveryOrderDTO) {
        const {
            page = 1,
            take = 10,
            sortBy = "created_at",
            sortOrder = "desc",
            search,
            status,
            from_warehouse_id,
            to_outlet_id,
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockTransferWhereInput = {
            from_type: TransferLocationType.WAREHOUSE,
            to_type: TransferLocationType.OUTLET,
            ...(search && {
                OR: [
                    { transfer_number: { contains: search, mode: "insensitive" } },
                    { barcode: { contains: search, mode: "insensitive" } },
                ],
            }),
            ...(status && { status }),
            ...(from_warehouse_id && { from_warehouse_id }),
            ...(to_outlet_id && { to_outlet_id }),
        };

        const [data, len] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy as string]: sortOrder },
                include: DO_INCLUDE,
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.stockTransfer.findUnique({
            where: { id },
            include: { ...DO_INCLUDE, photos: true },
        });

        if (!result) throw new ApiError(404, "Data Delivery Order tidak ditemukan");
        if (
            result.from_type !== TransferLocationType.WAREHOUSE ||
            result.to_type !== TransferLocationType.OUTLET
        ) {
            throw new ApiError(403, "Akses ditolak: Data ini bukan merupakan Delivery Order.");
        }

        return result;
    }

    static async updateStatus(
        id: number,
        payload: UpdateDeliveryOrderStatusDTO,
        userId: string = "system",
    ) {
        return await prisma.$transaction(async (tx) => {
            const transfer = await tx.stockTransfer.findUnique({
                where: { id },
                include: { items: { include: { product: PRODUCT_INCLUDE } } },
            });

            if (!transfer) throw new ApiError(404, "Data Delivery Order tidak ditemukan");
            if (
                transfer.from_type !== TransferLocationType.WAREHOUSE ||
                transfer.to_type !== TransferLocationType.OUTLET
            ) {
                throw new ApiError(400, "Tipe data tidak valid untuk pembaruan status DO.");
            }
            if (
                transfer.status === TransferStatus.COMPLETED ||
                transfer.status === TransferStatus.CANCELLED
            ) {
                throw new ApiError(
                    400,
                    `Tidak dapat memperbarui transfer dengan status ${transfer.status}`,
                );
            }

            let updateData: Prisma.StockTransferUpdateInput = { status: payload.status };

            if (payload.status === TransferStatus.APPROVED) {
                if (transfer.status !== TransferStatus.PENDING) {
                    throw new ApiError(400, "Hanya DO berstatus PENDING yang dapat disetujui (APPROVED).");
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
                updateData = await this._handleReceived(tx, transfer, payload, updateData);
            }

            if (payload.status === TransferStatus.FULFILLMENT) {
                updateData = await this._handleFulfillment(tx, transfer, payload, updateData, userId);
            }

            return tx.stockTransfer.update({
                where: { id },
                data: updateData,
                include: DO_INCLUDE,
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
            transfer.status === TransferStatus.PARTIAL ||
            transfer.status === TransferStatus.REJECTED ||
            transfer.status === TransferStatus.MISSING
        ) {
            throw new ApiError(
                400,
                `Tidak dapat membatalkan DO yang sudah pada tahap ${transfer.status}.`,
            );
        }

        if (
            (transfer.status === TransferStatus.SHIPMENT ||
                transfer.status === TransferStatus.RECEIVED) &&
            transfer.from_warehouse_id
        ) {
            const items: StockItem[] = transfer.items.map((i: any) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity_packed || i.quantity_requested),
                product: i.product,
            }));
            await InventoryHelper.addWarehouseStock(
                tx,
                transfer.from_warehouse_id,
                items,
                transfer.id,
                MovementRefType.STOCK_TRANSFER,
                MovementType.TRANSFER_IN,
                userId,
                "Batal (Cancellation)",
            );
        }

        return updateData;
    }

    private static async _handleShipment(
        tx: TxClient,
        transfer: any,
        payload: UpdateDeliveryOrderStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.APPROVED) {
            throw new ApiError(400, "DO harus disetujui (APPROVED) sebelum dikirim (SHIPMENT).");
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
                tx,
                transfer.from_warehouse_id,
                items,
                transfer.id,
                MovementRefType.STOCK_TRANSFER,
                MovementType.TRANSFER_OUT,
                userId,
            );
        }

        return { ...updateData, shipped_at: new Date(), shipment_notes: payload.notes };
    }

    private static async _handleReceived(
        tx: TxClient,
        transfer: any,
        payload: UpdateDeliveryOrderStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.SHIPMENT) {
            throw new ApiError(400, "Hanya DO berstatus SHIPMENT yang dapat diterima (RECEIVED).");
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

        return { ...updateData, received_at: new Date(), received_notes: payload.notes };
    }

    private static async _handleFulfillment(
        tx: TxClient,
        transfer: any,
        payload: UpdateDeliveryOrderStatusDTO,
        updateData: Prisma.StockTransferUpdateInput,
        userId: string,
    ): Promise<Prisma.StockTransferUpdateInput> {
        if (transfer.status !== TransferStatus.RECEIVED) {
            throw new ApiError(400, "Data harus berstatus RECEIVED sebelum tahap FULFILLMENT.");
        }
        if (!payload.items || payload.items.length !== transfer.items.length) {
            throw new ApiError(400, "Semua item dalam DO harus diverifikasi pada tahap FULFILLMENT.");
        }

        const fulfilledMap = new Map<number, number>();
        const rejectedItemsList: Array<{
            product_id: number;
            quantity_rejected: number;
            notes?: string | null;
        }> = [];

        for (const reqItem of payload.items) {
            const dbItem = transfer.items.find((i: any) => i.id === reqItem.id);
            if (!dbItem) throw new ApiError(400, `Item ID ${reqItem.id} tidak valid untuk DO ini.`);

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
                rejectedItemsList.push({
                    product_id: dbItem.product_id,
                    quantity_rejected: rejected,
                    notes: dbItem.notes ?? null,
                });
            }
        }

        const fulfilledItems: StockItem[] = transfer.items
            .map((i: any) => ({ product_id: i.product_id, quantity: fulfilledMap.get(i.product_id) ?? 0 }))
            .filter((i: StockItem) => i.quantity > 0);

        if (fulfilledItems.length > 0 && transfer.to_outlet_id) {
            await InventoryHelper.addOutletStock(
                tx,
                transfer.to_outlet_id,
                fulfilledItems,
                transfer.id,
                MovementRefType.STOCK_TRANSFER,
                MovementType.TRANSFER_IN,
                userId,
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

    static async getStock(warehouse_id?: number, outlet_id?: number, product_id?: number) {
        if (warehouse_id) {
            const pi = await prisma.productInventory.findFirst({
                where: { product_id, warehouse_id },
                orderBy: [{ year: "desc" }, { month: "desc" }, { date: "desc" }, { id: "desc" }],
            });
            return Number(pi?.quantity ?? 0);
        }

        if (outlet_id) {
            const oi = await prisma.outletInventory.findUnique({
                where: { outlet_id_product_id: { outlet_id, product_id: Number(product_id) } },
            });
            return Number(oi?.quantity ?? 0);
        }

        return 0;
    }

    static async export(query: QueryDeliveryOrderDTO) {
        const { data } = await this.list({ ...query, take: EXPORT_ROW_LIMIT, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data Delivery Order");

        sheet.columns = [
            { header: "No", key: "no", width: 5 },
            { header: "No. DO", key: "transfer_number", width: 20 },
            { header: "Barcode", key: "barcode", width: 20 },
            { header: "Tanggal", key: "date", width: 15 },
            { header: "Gudang (Asal)", key: "from_warehouse", width: 25 },
            { header: "Outlet (Tujuan)", key: "to_outlet", width: 25 },
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
                to_outlet: item.to_outlet?.name ?? "-",
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

    static async exportDetail(id: number) {
        const doRecord = await prisma.stockTransfer.findUnique({
            where: { id },
            include: {
                items: { include: { product: PRODUCT_INCLUDE } },
                from_warehouse: true,
                to_outlet: true,
            },
        });

        if (!doRecord) throw new ApiError(404, "Data Delivery Order tidak ditemukan");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`DO ${doRecord.transfer_number}`);

        sheet.mergeCells("A1:D1");
        sheet.getCell("A1").value = "PERFORMENCE ERP - DELIVERY ORDER";
        sheet.getCell("A1").font = { bold: true, size: 16 };
        sheet.getCell("A1").alignment = { horizontal: "center" };

        sheet.addRow([]);
        sheet.addRow(["No. Dokumen", doRecord.transfer_number]);
        sheet.addRow(["Barcode", doRecord.barcode]);
        sheet.addRow([
            "Tanggal",
            doRecord.created_at ? new Date(doRecord.created_at).toLocaleDateString("id-ID") : "-",
        ]);
        sheet.addRow(["Gudang Asal", doRecord.from_warehouse?.name ?? "-"]);
        sheet.addRow(["Outlet Tujuan", doRecord.to_outlet?.name ?? "-"]);
        sheet.addRow(["Status", doRecord.status]);
        sheet.addRow(["Dibuat Oleh", doRecord.created_by]);
        sheet.addRow([]);

        const tableHeaderRow = [
            "No",
            "SKU / Code",
            "Nama Produk",
            "Qty (Requested)",
            "Qty (Packed)",
            "Qty (Fulfilled)",
        ];
        sheet.addRow(tableHeaderRow);
        const headerRowNumber = sheet.rowCount;

        doRecord.items.forEach((item, index) => {
            const p = item.product;
            const fullProductName =
                `${p.name} ${p.product_type?.name.toLocaleUpperCase() ?? ""} ${p.size?.size ?? ""}${p.unit?.name.toLocaleUpperCase() ?? ""} (${p.gender})`
                    .replace(/\s+/g, " ")
                    .trim();

            sheet.addRow([
                index + 1,
                p.code,
                fullProductName,
                Number(item.quantity_requested),
                Number(item.quantity_packed ?? 0),
                Number(item.quantity_fulfilled ?? 0),
            ]);
        });

        const headerRow = sheet.getRow(headerRowNumber);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
            };
        });

        return workbook.xlsx.writeBuffer();
    }

    static async listDiscrepancies(query: DiscrepancyQuery) {
        const { page = 1, take = 25, search } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockTransferItemWhereInput = {
            OR: [{ quantity_missing: { gt: 0 } }, { quantity_rejected: { gt: 0 } }],
            transfer: {
                status: {
                    in: [
                        TransferStatus.COMPLETED,
                        TransferStatus.PARTIAL,
                        TransferStatus.MISSING,
                        TransferStatus.REJECTED,
                    ],
                },
            },
            ...(search && {
                OR: [
                    { transfer: { transfer_number: { contains: search, mode: "insensitive" } } },
                    { product: { name: { contains: search, mode: "insensitive" } } },
                    { product: { code: { contains: search, mode: "insensitive" } } },
                ],
            }),
        };

        const [data, len] = await Promise.all([
            prisma.stockTransferItem.findMany({
                where,
                skip,
                take: limit,
                orderBy: { transfer: { created_at: "desc" } },
                include: {
                    product: PRODUCT_INCLUDE,
                    transfer: {
                        include: { from_warehouse: true, to_warehouse: true, to_outlet: true },
                    },
                },
            }),
            prisma.stockTransferItem.count({ where }),
        ]);

        return { data, len };
    }

    static async exportDiscrepancies(query: DiscrepancyQuery) {
        const { data } = await this.listDiscrepancies({ ...query, take: EXPORT_ROW_LIMIT, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Audit Selisih (Discrepancy)");

        sheet.columns = [
            { header: "No", key: "no", width: 5 },
            { header: "No. Dokumen", key: "transfer_number", width: 20 },
            { header: "Tanggal", key: "date", width: 15 },
            { header: "Rute (Asal -> Tujuan)", key: "route", width: 40 },
            { header: "SKU / Code", key: "code", width: 15 },
            { header: "Nama Produk", key: "product_name", width: 30 },
            { header: "Pek (Requested)", key: "qty_req", width: 15 },
            { header: "Missing", key: "qty_missing", width: 12 },
            { header: "Rejected", key: "qty_rejected", width: 12 },
            { header: "Catatan", key: "notes", width: 30 },
        ];

        data.forEach((item, index) => {
            const t = item.transfer;
            const p = item.product;
            const route = `${t.from_warehouse?.name ?? "-"} -> ${t.to_outlet?.name ?? t.to_warehouse?.name ?? "-"}`;

            sheet.addRow({
                no: index + 1,
                transfer_number: t.transfer_number,
                date: t.created_at ? new Date(t.created_at).toLocaleDateString("id-ID") : "-",
                route,
                code: p.code,
                product_name: p.name,
                qty_req: Number(item.quantity_requested),
                qty_missing: Number(item.quantity_missing ?? 0),
                qty_rejected: Number(item.quantity_rejected ?? 0),
                notes: item.notes ?? "-",
            });
        });

        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        return workbook.xlsx.writeBuffer();
    }
}
