import { Prisma, STATUS } from "../../../generated/prisma/client.js";
import { QueryProductDTO, RequestProductDTO, ResponseProductDTO } from "./product.schema.js";
import prisma from "../../../config/prisma.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";
import { normalizeSlug } from "../../../lib/index.js";
import ExcelJS from "exceljs";

type RedisProduct = {
    id: number;
    code: string;
    name: string;
    type?: string;
    size: string;
};

export class ProductService {
    // --- Helper Methods ---

    private static async getOrCreate(model: any, name: string | number): Promise<number> {
        if (typeof name !== "string") return name as number;

        const formattedName = name.trim();
        const slug = normalizeSlug(formattedName);

        // upsert is atomic — avoids race condition between concurrent creates with same slug
        const result = await model.upsert({
            where: { slug },
            update: {},
            create: { name: formattedName, slug },
            select: { id: true },
        });
        return result.id;
    }

    private static async getOrCreateSize(tx: any, size: number): Promise<number> {
        // upsert is atomic — avoids race condition between concurrent creates with same size
        const result = await tx.productSize.upsert({
            where: { size },
            update: {},
            create: { size },
            select: { id: true },
        });
        return result.id;
    }

    // --- Core Methods ---
    static async create(body: RequestProductDTO) {
        const { code, product_type, unit, size, ...reqBody } = body;

        const existing = await prisma.product.findUnique({ where: { code }, select: { id: true } });
        if (existing) throw new ApiError(400, `Produk dengan kode: ${code} telah tersedia`);

        return await prisma.$transaction(async (tx) => {
            const [type_id, unit_id, size_id] = await Promise.all([
                product_type ? this.getOrCreate(tx.productType, product_type) : null,
                unit ? this.getOrCreate(tx.unit, unit) : null,
                size ? this.getOrCreateSize(tx, size) : null,
            ]);

            const result = await tx.product.create({
                data: { ...reqBody, code, type_id, unit_id, size_id },
                include: { product_type: true, unit: true, size: true },
            });

            return {
                ...result,
                z_value: Number(result.z_value),
                distribution_percentage: Number(result.distribution_percentage),
                safety_percentage: Number(result.safety_percentage),
            };
        });
    }

    static async update(id: number, body: Partial<RequestProductDTO>) {
        const product = await prisma.product.findUnique({
            where: { id },
            select: { id: true, code: true, type_id: true, unit_id: true, size_id: true },
        });
        if (!product) throw new ApiError(404, "Produk tidak ditemukan");

        const { code, unit, product_type, size, ...reqBody } = body;

        if (code && code !== product.code) {
            const existing = await prisma.product.findUnique({
                where: { code },
                select: { id: true },
            });
            if (existing) throw new ApiError(400, "Kode Produk telah digunakan");
        }

        return await prisma.$transaction(async (tx) => {
            const [type_id, unit_id, size_id] = await Promise.all([
                product_type ? this.getOrCreate(tx.productType, product_type) : product.type_id,
                unit ? this.getOrCreate(tx.unit, unit) : product.unit_id,
                size ? this.getOrCreateSize(tx, size) : product.size_id,
            ]);

            const result = await tx.product.update({
                where: { id },
                data: { ...reqBody, code: code ?? product.code, type_id, unit_id, size_id },
                include: { product_type: true, unit: true, size: true },
            });

            return {
                ...result,
                z_value: Number(result.z_value),
                distribution_percentage: Number(result.distribution_percentage),
                safety_percentage: Number(result.safety_percentage),
            };
        });
    }

    static async status(id: number, status: STATUS) {
        const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new ApiError(404, `Produk dengan kode ${id} tidak ditemukan`);

        await prisma.product.update({
            where: { id },
            data: { deleted_at: status === "DELETE" ? new Date() : null, status },
        });
    }

    static async bulkStatus(ids: number[], status: STATUS) {
        if (!ids || ids.length === 0) throw new ApiError(400, "Tidak ada produk yang dipilih");

        await prisma.product.updateMany({
            where: { id: { in: ids } },
            data: { deleted_at: status === "DELETE" ? new Date() : null, status },
        });
    }

    static async export(query: QueryProductDTO) {
        const { data } = await this.list({ ...query, take: 1000000, page: 1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data Produk");

        const visibleCols = query.visibleColumns ? query.visibleColumns.split(",") : [];
        const hasVisibility = visibleCols.length > 0;

        const allColumns = [
            { header: "No", key: "no", width: 5, id: "no" },
            { header: "Kode", key: "code", width: 15, id: "code" },
            { header: "Nama Produk", key: "name", width: 40, id: "name" },
            { header: "Tipe", key: "type", width: 20, id: "type" },
            { header: "Size", key: "size", width: 10, id: "size" },
            { header: "Unit", key: "unit", width: 10, id: "unit" },
            { header: "Gender", key: "gender", width: 15, id: "gender" },
            { header: "Lead Time", key: "lead_time", width: 12, id: "lead_time" },
            { header: "Nilai Z", key: "z_value", width: 10, id: "z_value" },
            { header: "Distribusi %", key: "distribution", width: 15, id: "distribution_percentage" },
            { header: "Safety %", key: "safety", width: 15, id: "safety_percentage" },
            { header: "Status", key: "status", width: 15, id: "status" },
        ];

        // Filter columns if visibility is provided. 
        // Always keep 'no', 'code', 'name' if not explicitly hidden or by default.
        const filteredColumns = hasVisibility 
            ? allColumns.filter(col => col.id === "no" || visibleCols.includes(col.id))
            : allColumns;

        sheet.columns = filteredColumns.map(({ header, key, width }) => ({ header, key, width }));

        data.forEach((item, index) => {
            sheet.addRow({
                no: index + 1,
                code: item.code || "-",
                name: item.name,
                type: (item.product_type as any)?.name || "-",
                size: (item.size as any)?.size || "-",
                unit: (item.unit as any)?.name || "-",
                gender: item.gender,
                lead_time: item.lead_time,
                z_value: item.z_value,
                distribution: item.distribution_percentage,
                safety: item.safety_percentage,
                status: item.status,
            });
        });

        // Styling
        sheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).height = 25;
        sheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0070C0" },
        };
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        return await workbook.csv.writeBuffer();
    }

    static async clean() {
        const products = await prisma.product.findMany({
            where: { deleted_at: { not: null } },
            select: { id: true },
        });

        if (products.length === 0) throw new ApiError(400, "Tidak ada produk yang akan dihapus");
        const ids = products.map((p) => p.id);

        await prisma.$transaction(async (tx) => {
            // Delete related records in specific order
            await tx.forecast.deleteMany({ where: { product_id: { in: ids } } });
            await tx.outletInventory.deleteMany({ where: { product_id: { in: ids } } });
            await tx.productInventory.deleteMany({ where: { product_id: { in: ids } } });
            await tx.productIssuance.deleteMany({ where: { product_id: { in: ids } } });
            await tx.recipes.deleteMany({ where: { product_id: { in: ids } } });
            await tx.safetyStock.deleteMany({ where: { product_id: { in: ids } } });
            await tx.stockTransferItem.deleteMany({ where: { product_id: { in: ids } } });
            await tx.goodsReceiptItem.deleteMany({ where: { product_id: { in: ids } } });
            await tx.stockReturnItem.deleteMany({ where: { product_id: { in: ids } } });

            // Finally delete products
            await tx.product.deleteMany({ where: { id: { in: ids } } });
        });
    }

    static async list(
        query: QueryProductDTO,
    ): Promise<{ data: ResponseProductDTO[]; len: number }> {
        const {
            page = 1,
            take = 10,
            sortBy = "forecast_default",
            sortOrder = "desc",
            gender,
            search,
            status,
            type_id,
            size_id,
        } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const conditions: Prisma.Sql[] = [];

        if (type_id) conditions.push(Prisma.sql`p.type_id = ${type_id}`);
        if (size_id) conditions.push(Prisma.sql`p.size_id = ${size_id}`);
        if (gender) conditions.push(Prisma.sql`p.gender = ${gender}::"GENDER"`);
        if (status) {
            conditions.push(Prisma.sql`p.status = ${status}::"STATUS"`);
        } else {
            conditions.push(Prisma.sql`p.status != 'DELETE'`);
        }

        if (search) {
            const searchPattern = `%${search}%`;
            conditions.push(
                Prisma.sql`(p.name ILIKE ${searchPattern} OR p.code ILIKE ${searchPattern} OR pt.name ILIKE ${searchPattern})`,
            );
        }

        const whereClause =
            conditions.length > 0
                ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
                : Prisma.empty;

        // Sorting mapping to avoid SQL injection
        const allowedSort = [
            "code",
            "name",
            "updated_at",
            "created_at",
            "gender",
            "lead_time",
            "type",
            "size",
            "distribution_percentage",
            "safety_percentage",
        ];
        
        let orderBy: any;
        if (sortBy === "forecast_default") {
            orderBy = Prisma.raw(`
                CASE 
                    WHEN pt.name ILIKE '%Display%' THEN 1
                    ELSE 0
                END ASC,
                group_sort_priority DESC,
                p.name ASC, 
                CASE 
                    WHEN pt.name ILIKE '%EDP%' OR pt.name ILIKE '%Parfum%' OR pt.name ILIKE '%Perfume%' THEN 1
                    WHEN pt.name ILIKE '%Atomizer%' THEN 2
                    ELSE 3
                END ASC,
                ps.size DESC NULLS LAST,
                CASE 
                    WHEN pt.name ILIKE '%EDP%' THEN 1
                    WHEN pt.name ILIKE '%Parfum%' OR pt.name ILIKE '%Perfume%' THEN 2
                    ELSE 3
                END ASC,
                p.id ASC
            `);
        } else if (allowedSort.includes(sortBy)) {
            const direction = sortOrder.toUpperCase() === "ASC" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
            if (sortBy === "type") {
                orderBy = Prisma.sql`pt.name ${direction}`;
            } else if (sortBy === "size") {
                orderBy = Prisma.sql`ps.size ${direction}`;
            } else if (sortBy === "name" || sortBy === "code") {
                orderBy = Prisma.raw(`p.${sortBy} ${sortOrder.toUpperCase()}`);
            } else {
                orderBy = Prisma.raw(`p.${sortBy} ${sortOrder.toUpperCase()}`);
            }
        } else {
            orderBy = Prisma.sql`p.updated_at DESC`;
        }

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const dataTask = prisma.$queryRaw<any[]>`
            SELECT 
                p.*,
                json_build_object('id', pt.id, 'name', pt.name, 'slug', pt.slug) as product_type,
                json_build_object('id', u.id, 'name', u.name, 'slug', u.slug) as unit,
                json_build_object('id', ps.id, 'size', ps.size) as size,
                MAX(COALESCE(f_m1.final_forecast, 0)) OVER(PARTITION BY p.name) as group_sort_priority
            FROM products p
            LEFT JOIN product_types pt ON p.type_id = pt.id
            LEFT JOIN unit_of_materials u ON p.unit_id = u.id
            LEFT JOIN product_size ps ON p.size_id = ps.id
            LEFT JOIN forecasts f_m1 ON f_m1.product_id = p.id AND f_m1.month = ${currentMonth} AND f_m1.year = ${currentYear}
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ${limit} OFFSET ${skip}
        `;

        const countTask = prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*)::bigint FROM products p 
            LEFT JOIN product_types pt ON p.type_id = pt.id
            ${whereClause}
        `;

        const [products, countResult] = await Promise.all([dataTask, countTask]);

        return {
            len: Number(countResult[0].count),
            data: products.map((p) => ({
                ...p,
                z_value: Number(p.z_value),
                distribution_percentage: Number(p.distribution_percentage),
                safety_percentage: Number(p.safety_percentage),
            })) as unknown as ResponseProductDTO[],
        };
    }
    static async detail(id: number): Promise<ResponseProductDTO> {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                product_type: true,
                unit: true,
                size: true,
                product_inventories: {
                    include: {
                        warehouse: true,
                    },
                },
                recipes: {
                    where: { is_active: true },
                    include: {
                        raw_materials: {
                            include: {
                                unit_raw_material: true,
                            },
                        },
                    },
                },
            },
        });

        if (!product) throw new ApiError(404, "Produk tidak ditemukan");

        // Map and transform Prisma result to DTO
        return {
            ...product,
            z_value: Number(product.z_value),
            distribution_percentage: Number(product.distribution_percentage),
            safety_percentage: Number(product.safety_percentage),
            product_inventories: product.product_inventories.map((i) => ({
                id: i.id,
                quantity: Number(i.quantity),
                min_stock: i.min_stock ? Number(i.min_stock) : null,
                warehouse: {
                    id: i.warehouse.id,
                    name: i.warehouse.name,
                },
            })),
            recipes: product.recipes.map((r) => ({
                id: r.id,
                quantity: Number(r.quantity),
                version: r.version,
                is_active: r.is_active,
                raw_material: {
                    id: r.raw_materials.id,
                    name: r.raw_materials.name,
                    price: Number(r.raw_materials.price),
                    unit_raw_material: {
                        name: r.raw_materials.unit_raw_material.name,
                    },
                    current_stock: 0,
                },
            })),
        } as unknown as ResponseProductDTO;
    }

    // static async redisProduct(): Promise<RedisProduct[]> {
    //     const res = await prisma.$queryRaw<any[]>`
    //         SELECT
    //             p.id, p.name, p.code,
    //             ps.size as size_val,
    //             u.name as unit_name,
    //             pt.name as type_name
    //         FROM products p
    //         LEFT JOIN product_size ps ON p.size_id = ps.id
    //         LEFT JOIN unit_of_materials u ON p.unit_id = u.id
    //         LEFT JOIN product_types pt ON p.type_id = pt.id
    //         WHERE p.status NOT IN ('DELETE', 'PENDING')
    //     `;

    //     return res.map((r) => ({
    //         id: r.id,
    //         code: r.code,
    //         name: r.name,
    //         size: `${r.size_val ?? ""}${r.unit_name ?? ""}`,
    //         type: r.type_name,
    //     }));
    // }
}
