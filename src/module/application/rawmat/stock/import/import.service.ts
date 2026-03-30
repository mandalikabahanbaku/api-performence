// raw-material-import.service.ts
import { randomUUID } from "crypto";
import prisma from "../../../../../config/prisma.js";
import {
    RawMaterialInventoryImportPreviewDTO,
    RawMaterialInventoryImportRowSchema,
    ResponseRawMaterialInventoryImportDTO,
} from "./import.schema.js";
import { RawMaterialInventoryImportCacheService } from "./import.cache.js";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: RawMaterialInventoryImportPreviewDTO[];
};

export class RawMaterialInventoryImportService {
    private static async findRawMat(barcode: string) {
        return await prisma.rawMaterial.findFirst({
            where: { barcode },
            select: {
                name: true,
                raw_mat_category: {
                    select: {
                        name: true,
                    },
                },
            },
        });
    }
    static async preview(rows: any[]): Promise<ResponseRawMaterialInventoryImportDTO> {
        const parsedRows: RawMaterialInventoryImportPreviewDTO[] = await Promise.all(
            rows.map(async (row) => {
                const parsed = RawMaterialInventoryImportRowSchema.safeParse(row);
                // Mapping dari header Excel: "PRODUCT CODE" (atau sesuaikan ke "MATERIAL CODE" jika perlu)
                const code = row["MATERIAL CODE"]?.toString().trim();

                const parseQty = (val: any) => {
                    if (val === undefined || val === null || val === "") return NaN;
                    const n = parseFloat(val);
                    return n;
                };

                if (!parsed.success) {
                    return {
                        barcode: "",
                        category: "",
                        name: "",
                        amount: 0,
                        errors: parsed.error.issues.map((e) => e.message),
                    };
                }

                const data = parsed.data;
                const material = await this.findRawMat(data["MATERIAL CODE"]);
                const errors = material ? [] : ["Material tidak ditemukan"];

                const amount = parseQty(data["CURRENT STOCK"]);
                if (isNaN(amount)) {
                    errors.push("Stok harus berupa angka");
                }

                return {
                    barcode: code,
                    name: material?.name || "",
                    category: material?.raw_mat_category?.name || "",
                    amount: isNaN(amount) ? 0 : amount,
                    errors: errors,
                };
            }),
        );

        const total = parsedRows.length;
        const invalid = parsedRows.filter((r) => r.errors.length > 0).length;
        const valid = total - invalid;

        const import_id = randomUUID();

        const payload: ImportCachePayload = {
            status: "preview",
            createdAt: Date.now(),
            total,
            valid,
            invalid,
            rows: parsedRows,
        };

        // Menggunakan Cache Service khusus Raw Material
        await RawMaterialInventoryImportCacheService.save(import_id, payload);

        return {
            import_id,
            total,
            valid,
            invalid,
        };
    }

    static async execute(
        import_id: string,
        warehouse_id: number,
        date: number,
        month: number,
        year: number,
    ) {
        const cache = (await RawMaterialInventoryImportCacheService.get(
            import_id,
        )) as ImportCachePayload | null;

        if (!cache) {
            throw new Error("Sesi import kedaluwarsa atau tidak ditemukan");
        }

        if (cache.status !== "preview") {
            throw new Error("Import sudah dieksekusi atau sedang diproses");
        }

        const validRows = cache.rows.filter((r) => r.errors.length === 0);
        if (!validRows.length) {
            throw new Error("Tidak ada data valid untuk diimport");
        }

        // Lock status agar tidak terjadi double execution
        await RawMaterialInventoryImportCacheService.save(import_id, {
            ...cache,
            status: "executing",
        });

        try {
            await this.bulkInsert(validRows, warehouse_id, date, month, year);
            await RawMaterialInventoryImportCacheService.remove(import_id);

            return {
                import_id,
                total: validRows.length,
            };
        } catch (err) {
            // Rollback status ke preview jika gagal agar user bisa mencoba lagi
            await RawMaterialInventoryImportCacheService.save(import_id, {
                ...cache,
                status: "preview",
            });
            throw err;
        }
    }

    private static async bulkInsert(
        data: RawMaterialInventoryImportPreviewDTO[],
        warehouse_id: number,
        date: number,
        month: number,
        year: number,
    ) {
        if (!data.length) return;

        // 1. Get unique barcodes
        const materialCodes = [...new Set(data.map((d) => d.barcode))];

        await prisma.$transaction(async (tx) => {
            const materials = await tx.rawMaterial.findMany({
                where: { barcode: { in: materialCodes } },
                select: { id: true, barcode: true },
            });

            const materialMap = new Map(materials.map((m) => [m.barcode, m.id]));

            const finalPayload: { rm_id: number; w_id: number; qty: number }[] = [];

            for (const row of data) {
                const materialId = materialMap.get(row.barcode);
                if (!materialId) continue;

                if (row.amount !== undefined) {
                    finalPayload.push({
                        rm_id: materialId,
                        w_id: warehouse_id,
                        qty: Number(row.amount),
                    });
                }
            }

            if (finalPayload.length === 0) return;

            const rmIds = finalPayload.map((f) => f.rm_id);
            const wIds = finalPayload.map((f) => f.w_id);
            const qtys = finalPayload.map((f) => f.qty);
            const dates = new Array(finalPayload.length).fill(date);
            const months = new Array(finalPayload.length).fill(month);
            const years = new Array(finalPayload.length).fill(year);

            await tx.$executeRaw`
                INSERT INTO raw_material_inventories (
                    raw_material_id,
                    warehouse_id,
                    date,
                    month,
                    year,
                    quantity,
                    updated_at
                )
                SELECT 
                    unnest(${rmIds}::int[]) as rm_id,
                    unnest(${wIds}::int[]) as w_id,
                    unnest(${dates}::int[]) as d_val,
                    unnest(${months}::int[]) as m_val,
                    unnest(${years}::int[]) as y_val,
                    unnest(${qtys}::decimal[]) as qty,
                    NOW()
                ON CONFLICT (raw_material_id, warehouse_id, date, month, year)
                DO UPDATE SET 
                    quantity = EXCLUDED.quantity,
                    updated_at = NOW();
            `;
        });
    }

    static async getPreview(import_id: string) {
        const cache = await RawMaterialInventoryImportCacheService.get(import_id);

        if (!cache) {
            throw new Error("Preview import tidak ditemukan atau sudah kadaluwarsa");
        }

        return {
            import_id,
            total: cache.total,
            valid: cache.valid,
            invalid: cache.invalid,
            rows: cache.rows,
            createdAt: cache.createdAt,
        };
    }
}
