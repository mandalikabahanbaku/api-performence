import { Prisma } from "../../../../generated/prisma/client.js";
import prisma from "../../../../config/prisma.js";
import { RequestGoodsReceiptDTO, QueryGoodsReceiptDTO } from "./gr.schema.js";
import { GoodsReceiptStatus, MovementType, MovementRefType } from "../../../../generated/prisma/enums.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import ExcelJS from "exceljs";
import { InventoryHelper } from "../inventory.helper.js";
import { EXPORT_ROW_LIMIT, PRODUCT_INCLUDE, generateDocNumber } from "../inventory.constants.js";

export class GoodsReceiptService {
    static async create(payload: RequestGoodsReceiptDTO, userId: string = "system") {
        return prisma.goodsReceipt.create({
            data: {
                gr_number: generateDocNumber("GR", 3),
                type: payload.type,
                warehouse_id: payload.warehouse_id,
                date: payload.date ? new Date(payload.date) : new Date(),
                notes: payload.notes,
                created_by: userId,
                status: GoodsReceiptStatus.PENDING,
                items: {
                    create: payload.items.map((i) => ({
                        product_id: i.product_id,
                        quantity_planned: i.quantity_planned,
                        quantity_actual: i.quantity_actual,
                        notes: i.notes,
                    })),
                },
            },
            include: { items: { include: { product: true } }, warehouse: true },
        });
    }

    static async post(id: number, userId: string = "system") {
        return await prisma.$transaction(async (tx) => {
            const gr = await tx.goodsReceipt.findUnique({
                where: { id },
                include: { items: true },
            });

            if (!gr) throw new ApiError(404, "Data Goods Receipt tidak ditemukan");
            if (gr.status !== GoodsReceiptStatus.PENDING) {
                throw new ApiError(400, `Tidak dapat melakukan POST pada Goods Receipt berstatus ${gr.status}`);
            }

            const updatedGr = await tx.goodsReceipt.update({
                where: { id },
                data: { status: GoodsReceiptStatus.COMPLETED, posted_at: new Date() },
                include: { items: { include: { product: true } }, warehouse: true },
            });

            const items = gr.items.map((i) => ({
                product_id: i.product_id,
                quantity: Number(i.quantity_actual),
            }));

            await InventoryHelper.addWarehouseStock(
                tx, gr.warehouse_id, items,
                gr.id, MovementRefType.GOODS_RECEIPT, MovementType.IN, userId,
            );

            return updatedGr;
        });
    }

    static async list(query: QueryGoodsReceiptDTO) {
        const {
            page = 1,
            take = 10,
            sortBy = "created_at",
            sortOrder = "desc",
            search,
            status,
            type,
            warehouse_id,
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.GoodsReceiptWhereInput = {
            ...(search && { gr_number: { contains: search, mode: "insensitive" } }),
            ...(status && { status }),
            ...(type && { type }),
            ...(warehouse_id && { warehouse_id }),
        };

        const [data, len] = await Promise.all([
            prisma.goodsReceipt.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy as string]: sortOrder },
                include: {
                    items: { include: { product: PRODUCT_INCLUDE } },
                    warehouse: true,
                    _count: { select: { items: true } },
                },
            }),
            prisma.goodsReceipt.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.goodsReceipt.findUnique({
            where: { id },
            include: {
                items: { include: { product: PRODUCT_INCLUDE } },
                warehouse: true,
            },
        });

        if (!result) throw new ApiError(404, "Data Goods Receipt tidak ditemukan");
        return result;
    }

    static async cancel(id: number) {
        const gr = await prisma.goodsReceipt.findUnique({ where: { id } });
        if (!gr) throw new ApiError(404, "Data Goods Receipt tidak ditemukan");
        if (gr.status !== GoodsReceiptStatus.PENDING) {
            throw new ApiError(400, "Hanya Goods Receipt berstatus PENDING yang dapat dibatalkan.");
        }

        return prisma.goodsReceipt.update({
            where: { id },
            data: { status: GoodsReceiptStatus.CANCELLED },
            include: { warehouse: true },
        });
    }

    static async export(query: QueryGoodsReceiptDTO) {
        const { data } = await this.list({ ...query, take: EXPORT_ROW_LIMIT, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data Goods Receipt");

        sheet.columns = [
            { header: "No", key: "no", width: 5 },
            { header: "No. GR", key: "gr_number", width: 20 },
            { header: "Tanggal", key: "date", width: 15 },
            { header: "Gudang", key: "warehouse", width: 25 },
            { header: "Tipe", key: "type", width: 15 },
            { header: "Total SKU", key: "total_items", width: 12 },
            { header: "Status", key: "status", width: 15 },
            { header: "Dibuat Oleh", key: "created_by", width: 20 },
            { header: "Catatan", key: "notes", width: 30 },
        ];

        data.forEach((item, index) => {
            sheet.addRow({
                no: index + 1,
                gr_number: item.gr_number,
                date: item.date ? new Date(item.date).toLocaleDateString("id-ID") : "-",
                warehouse: item.warehouse.name,
                type: item.type,
                total_items: Number(item._count?.items ?? 0),
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
        const gr = await prisma.goodsReceipt.findUnique({
            where: { id },
            include: {
                items: { include: { product: PRODUCT_INCLUDE } },
                warehouse: true,
            },
        });

        if (!gr) throw new ApiError(404, "Data Goods Receipt tidak ditemukan");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`GR ${gr.gr_number}`);

        sheet.mergeCells("A1:D1");
        sheet.getCell("A1").value = "PERFORMENCE ERP - GOODS RECEIPT";
        sheet.getCell("A1").font = { bold: true, size: 16 };
        sheet.getCell("A1").alignment = { horizontal: "center" };

        sheet.addRow([]);
        sheet.addRow(["No. Dokumen", gr.gr_number]);
        sheet.addRow(["Tanggal", gr.date ? new Date(gr.date).toLocaleDateString("id-ID") : "-"]);
        sheet.addRow(["Gudang", gr.warehouse.name]);
        sheet.addRow(["Status", gr.status]);
        sheet.addRow(["Dibuat Oleh", gr.created_by]);
        sheet.addRow([]);

        const tableHeaderRow = ["No", "SKU / Code", "Nama Produk", "Kuantitas"];
        sheet.addRow(tableHeaderRow);
        const headerRowNumber = sheet.rowCount;

        gr.items.forEach((item, index) => {
            const p = item.product;
            const fullProductName = `${p.name} ${p.product_type?.name ?? ""} ${p.size?.size ?? ""}${p.unit?.name ?? ""} (${p.gender})`
                .replace(/\s+/g, " ")
                .trim();

            sheet.addRow([index + 1, p.code, fullProductName, Number(item.quantity_actual)]);
        });

        const headerRow = sheet.getRow(headerRowNumber);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });

        return workbook.xlsx.writeBuffer();
    }
}
