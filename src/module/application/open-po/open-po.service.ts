import prisma from "../../../config/prisma.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import { QueryOpenPoDTO, RequestUpdateOpenPoDTO } from "./open-po.schema.js";
import ExcelJS from "exceljs";

export class OpenPoService {
    static async list(query: QueryOpenPoDTO) {
        const { search, page, take, status, month, year } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const now = new Date();
        const currentMonth = month ?? now.getMonth() + 1;
        const currentYear = year ?? now.getFullYear();

        const whereCondition: any = {
            status: status || "OPEN",
            created_at: {
                gte: new Date(currentYear, currentMonth - 1, 1),
                lt: new Date(currentYear, currentMonth, 1),
            },
        };

        if (query.supplier_id) {
            whereCondition.raw_material = {
                supplier_id: query.supplier_id,
            };
        }

        if (search) {
            whereCondition.OR = [
                { po_number: { contains: search, mode: "insensitive" } },
                { raw_material: { name: { contains: search, mode: "insensitive" } } },
                { raw_material: { barcode: { contains: search, mode: "insensitive" } } },
                {
                    raw_material: {
                        supplier: {
                            name: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    },
                },
            ];
        }

        const [total, data] = await Promise.all([
            prisma.rawMaterialOpenPo.count({
                where: whereCondition,
            }),
            prisma.rawMaterialOpenPo.findMany({
                where: whereCondition,
                include: {
                    raw_material: {
                        include: {
                            supplier: true,
                        },
                    },
                },
                orderBy: {
                    created_at: "desc",
                },
                skip,
                take: limit,
            }),
        ]);

        const parsedData = data.map((item) => ({
            id: item.id,
            raw_material_id: item.raw_material_id,
            barcode: item.raw_material?.barcode || null,
            material_name: item.raw_material?.name || "Unknown",
            supplier_name: item.raw_material?.supplier?.name || "-",
            po_number: item.po_number,
            quantity: Number(item.quantity) || 0,
            price: Number(item.raw_material?.price) || 0,
            subtotal: (Number(item.quantity) || 0) * (Number(item.raw_material?.price) || 0),
            order_date: item.order_date,
            expected_arrival: item.expected_arrival,
            status: item.status,
        }));

        return { data: parsedData, len: total };
    }

    static async summaryBySupplier(query: QueryOpenPoDTO) {
        const { search, month, year, status } = query;

        const now = new Date();
        const currentMonth = month ?? now.getMonth() + 1;
        const currentYear = year ?? now.getFullYear();

        const whereCondition: any = {
            status: status || "OPEN",
            created_at: {
                gte: new Date(currentYear, currentMonth - 1, 1),
                lt: new Date(currentYear, currentMonth, 1),
            },
        };

        if (query.supplier_id) {
            whereCondition.raw_material = {
                supplier_id: query.supplier_id,
            };
        }

        if (search) {
            whereCondition.OR = [
                { po_number: { contains: search, mode: "insensitive" } },
                { raw_material: { name: { contains: search, mode: "insensitive" } } },
                { raw_material: { barcode: { contains: search, mode: "insensitive" } } },
                { raw_material: { supplier: { name: { contains: search, mode: "insensitive" } } } },
            ];
        }

        const data = await prisma.rawMaterialOpenPo.findMany({
            where: whereCondition,
            include: {
                raw_material: {
                    include: {
                        supplier: true,
                        unit_raw_material: true,
                    },
                },
            },
            orderBy: {
                raw_material: { supplier: { name: "asc" } },
            },
        });

        const grouping: Record<string, any> = {};

        data.forEach((item) => {
            const supplierId = item.raw_material?.supplier?.id || "N/A";
            const supplierName = item.raw_material?.supplier?.name || "No Supplier";

            if (!grouping[supplierId]) {
                grouping[supplierId] = {
                    supplier_id: supplierId,
                    supplier_name: supplierName,
                    total_amount: 0,
                    total_items: 0,
                    items: [],
                };
            }

            const itemPrice = Number(item.raw_material?.price) || 0;
            const itemQty = Number(item.quantity) || 0;
            const subtotal = itemPrice * itemQty;

            grouping[supplierId].total_amount += subtotal;
            grouping[supplierId].total_items += 1;
            grouping[supplierId].items.push({
                material_name: item.raw_material?.name,
                barcode: item.raw_material?.barcode,
                po_number: item.po_number,
                quantity: itemQty,
                price: itemPrice,
                subtotal: subtotal,
                uom: item.raw_material?.unit_raw_material?.name,
                status: item.status,
                order_date: item.order_date,
            });
        });

        return Object.values(grouping);
    }

    static async export(query: QueryOpenPoDTO) {
        const { data } = await this.list({ ...query, take: 1000000, page: 1 });
        const supplierName = (data.length > 0 && query.supplier_id) ? data[0]?.supplier_name : "";

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(supplierName ? `PO Open - ${supplierName}` : "Tracking PO Open");

        sheet.columns = [
            { header: "No", key: "no", width: 5 },
            { header: "PO Number", key: "po_number", width: 20 },
            { header: "Nama Material", key: "material_name", width: 35 },
            { header: "Barcode", key: "barcode", width: 15 },
            { header: "Supplier", key: "supplier_name", width: 25 },
            { header: "Quantity", key: "quantity", width: 12 },
            { header: "Price", key: "price", width: 15 },
            { header: "Subtotal", key: "subtotal", width: 20 },
            { header: "Order Date", key: "order_date", width: 15 },
            { header: "Est. Arrival", key: "expected_arrival", width: 15 },
            { header: "Status", key: "status", width: 12 },
        ];

        let grandTotal = 0;
        data.forEach((item, index) => {
            const subtotal = (item as any).subtotal || 0;
            grandTotal += subtotal;

            sheet.addRow({
                no: index + 1,
                po_number: item.po_number || "-",
                material_name: item.material_name,
                barcode: item.barcode || "-",
                supplier_name: (item as any).supplier_name || "-",
                quantity: item.quantity,
                price: (item as any).price || 0,
                subtotal: subtotal,
                order_date: item.order_date
                    ? new Date(item.order_date).toLocaleDateString("id-ID")
                    : "-",
                expected_arrival: item.expected_arrival
                    ? new Date(item.expected_arrival).toLocaleDateString("id-ID")
                    : "-",
                status: item.status,
            });
        });

        // Add Grand Total row
        const totalRow = sheet.addRow({
            no: "",
            po_number: "",
            material_name: "GRAND TOTAL",
            barcode: "",
            supplier_name: "",
            quantity: "",
            price: "",
            subtotal: grandTotal,
            order_date: "",
            expected_arrival: "",
            status: "",
        });
        totalRow.font = { bold: true };

        // Styling
        sheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).height = 25;
        sheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0070C0" }, // Blue
        };
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        return await workbook.csv.writeBuffer();
    }

    static async update(id: number, data: RequestUpdateOpenPoDTO) {
        const find = await prisma.rawMaterialOpenPo.findUnique({
            where: { id },
        });

        if (!find) throw new ApiError(404, "Data PO tidak ditemukan");

        return await prisma.rawMaterialOpenPo.update({
            where: { id },
            data: {
                po_number: data.po_number,
                expected_arrival: data.expected_arrival ? new Date(data.expected_arrival) : null,
                status: data.status,
            },
        });
    }
}
