// import.service.ts
import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import {
    RecipeImportPreviewDTO,
    RecipeImportRowSchema,
    ResponseRecipeImportDTO,
} from "./import.schema.js";
import { RecipeImportCacheService } from "./import.cache.js";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: RecipeImportPreviewDTO[];
};

export class RecipeImportService {
    private static async findProduct(code: string) {
        return await prisma.product.findUnique({
            where: {
                code,
            },
            select: {
                id: true,
                name: true,
                code: true,
                size: {
                    select: { size: true },
                },
                unit: {
                    select: {
                        name: true,
                    },
                },
                product_type: {
                    select: {
                        name: true,
                    },
                },
            },
        });
    }
    private static async findMaterial(barcode: string) {
        return await prisma.rawMaterial.findUnique({
            where: {
                barcode,
            },
            select: {
                id: true,
                name: true,
                barcode: true,
            },
        });
    }

    static async preview(rows: any[]): Promise<ResponseRecipeImportDTO> {
        const parsedRows: RecipeImportPreviewDTO[] = await Promise.all(
            rows.map(async (row) => {
                const parsed = RecipeImportRowSchema.safeParse(row);

                if (!parsed.success) {
                    return {
                        product_id: null,
                        raw_mat_id: null,
                        product_code: row["PRODUCT CODE"] ?? "",
                        product_name: "",
                        product_type: "",
                        material_code: row["MATERIAL CODE"] ?? "",
                        material_name: "",
                        product_size: "",
                        qty: 0,
                        errors: parsed.error.issues.map((e) => e.message),
                    };
                }

                const data = parsed.data;
                const product = await this.findProduct(data["PRODUCT CODE"]);
                const material = await this.findMaterial(data["MATERIAL CODE"]);

                const rowErrors: string[] = [];
                if (!product) rowErrors.push(`Product code "${data["PRODUCT CODE"]}" not found`);
                if (!material) rowErrors.push(`Material code "${data["MATERIAL CODE"]}" not found`);

                return {
                    product_id: product?.id ?? null,
                    raw_mat_id: material?.id ?? null,
                    product_code: product?.code || data["PRODUCT CODE"],
                    product_name: product?.name || "",
                    product_type: product?.product_type?.name || "",
                    product_size: product
                        ? `${product.size?.size ?? ""} ${product.unit?.name.toUpperCase() ?? ""}`.trim()
                        : "",
                    material_code: material?.barcode || data["MATERIAL CODE"],
                    material_name: material?.name || "",
                    qty: Number(data["QUANTITY"]),
                    errors: rowErrors,
                };
            }),
        );

        const total = parsedRows.length;
        const invalid = parsedRows.filter((r) => r.errors.length).length;
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

        await RecipeImportCacheService.save(import_id, payload);

        return {
            import_id,
            total,
            valid,
            invalid,
        };
    }

    static async execute(import_id: string) {
        const cache = (await RecipeImportCacheService.get(import_id)) as ImportCachePayload | null;

        if (!cache) {
            throw new Error("Import session expired or not found");
        }

        if (cache.status !== "preview") {
            throw new Error("Import already executed or in progress");
        }

        const validRows = cache.rows.filter(
            (r) => r.errors.length === 0 && r.product_id && r.raw_mat_id,
        );

        if (!validRows.length) {
            throw new Error("No valid rows to import");
        }

        await RecipeImportCacheService.save(import_id, {
            ...cache,
            status: "executing",
        });

        try {
            // Kita bungkus bulkInsert dengan durasi yang lebih lama
            await this.bulkInsert(validRows);
            await RecipeImportCacheService.remove(import_id);

            return {
                import_id,
                total: validRows.length,
            };
        } catch (err) {
            await RecipeImportCacheService.save(import_id, cache);
            console.error("[Import Error]:", err);
            throw err;
        }
    }

    private static async bulkInsert(data: RecipeImportPreviewDTO[]) {
        if (!data.length) return;

        const map = new Map<string, number>();

        for (const row of data) {
            // 1. Pastikan ID ada dan unik per pasangan Product-Material
            const key = `${row.product_id}-${row.raw_mat_id}`;

            // 2. Konversi "0,3" menjadi "0.3" agar bisa dibaca sebagai angka
            const cleanQty =
                typeof row.qty === "string"
                    ? parseFloat(String(row.qty).replace(",", "."))
                    : Number(row.qty);

            if (!isNaN(cleanQty)) {
                map.set(key, (map.get(key) || 0) + cleanQty);
            }
        }

        const allValues = Array.from(map.entries()).map(([key, qty]) => {
            const [product_id, raw_mat_id] = key.split("-").map(Number);
            return { product_id, raw_mat_id, quantity: qty };
        });

        console.log(`[Import] Total unique items to insert: ${allValues.length}`);

        const chunkSize = 500;
        const chunks: any[] = [];
        for (let i = 0; i < allValues.length; i += chunkSize) {
            chunks.push(allValues.slice(i, i + chunkSize));
        }

        await prisma.$transaction(
            async (tx) => {
                for (const chunk of chunks) {
                    const sqlValues: string[] = [];
                    const flatParameters: any[] = [];

                    chunk.forEach(
                        (v: { product_id: any; raw_mat_id: any; quantity: any }, index: number) => {
                            const offset = index * 4;
                            sqlValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                            flatParameters.push(v.product_id, v.raw_mat_id, v.quantity, 1);
                        },
                    );

                    const query = `
                INSERT INTO recipes (product_id, raw_mat_id, quantity, version)
                VALUES ${sqlValues.join(",")}
                ON CONFLICT (product_id, raw_mat_id, version) 
                DO UPDATE SET quantity = EXCLUDED.quantity;
            `;

                    await tx.$executeRawUnsafe(query, ...flatParameters);
                }
            },
            {
                maxWait: 300000,
                timeout: 300000,
            },
        );
    }

    static async getPreview(import_id: string) {
        const cache = await RecipeImportCacheService.get(import_id);

        if (!cache) {
            throw new Error("Import preview not found or expired");
        }

        if (cache.status !== "preview") {
            throw new Error("Import already executed");
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
