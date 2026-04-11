import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import { Prisma } from "../../../../generated/prisma/client.js";
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
        return prisma.product.findUnique({
            where: { code },
            select: {
                id: true,
                name: true,
                code: true,
                size: { select: { size: true } },
                unit: { select: { name: true } },
                product_type: { select: { name: true } },
            },
        });
    }

    private static async findMaterial(barcode: string) {
        return prisma.rawMaterial.findUnique({
            where: { barcode },
            select: { id: true, name: true, barcode: true },
        });
    }

    static async preview(rows: Record<string, any>[]): Promise<ResponseRecipeImportDTO> {
        const parsedResults = rows.map((row) => RecipeImportRowSchema.safeParse(row));

        const parsedRows: RecipeImportPreviewDTO[] = await Promise.all(
            rows.map(async (row, index) => {
                const parsed = parsedResults[index];

                if (!parsed) {
                    return {
                        product_id: null,
                        raw_mat_id: null,
                        product_code: String(row["PRODUCT CODE"] || ""),
                        product_name: "",
                        product_type: "",
                        material_code: String(row["MATERIAL CODE"] || ""),
                        material_name: "",
                        product_size: "",
                        qty: 0,
                        errors: ["Internal parsing error"],
                    };
                }

                if (!parsed.success) {
                    return {
                        product_id: null,
                        raw_mat_id: null,
                        product_code: String(row["PRODUCT CODE"] || ""),
                        product_name: "",
                        product_type: "",
                        material_code: String(row["MATERIAL CODE"] || ""),
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

        return { import_id, total, valid, invalid };
    }

    static async execute(import_id: string) {
        const cache = (await RecipeImportCacheService.get(import_id)) as ImportCachePayload | null;

        if (!cache) throw new Error("Import session expired or not found");
        if (cache.status !== "preview") throw new Error("Import already executed or in progress");

        const validRows = cache.rows.filter(
            (r) => r.errors.length === 0 && r.product_id && r.raw_mat_id,
        );
        if (!validRows.length) throw new Error("No valid rows to import");

        await RecipeImportCacheService.save(import_id, { ...cache, status: "executing" });

        try {
            await this.bulkInsert(validRows);
            await RecipeImportCacheService.remove(import_id);
            return { import_id, total: validRows.length };
        } catch (err) {
            await RecipeImportCacheService.save(import_id, cache);
            console.error("[Import Error]:", err);
            throw err;
        }
    }

    /**
     * Bulk insert recipe rows using a delete-then-insert strategy per product.
     * Each row is preserved as a separate line (no aggregation), supporting
     * duplicate material codes with different quantities (Hampers use case).
     */
    private static async bulkInsert(data: RecipeImportPreviewDTO[]) {
        if (!data.length) return;

        const groupedByProduct = new Map<number, { raw_mat_id: number; quantity: number }[]>();

        for (const row of data) {
            if (!row.product_id || !row.raw_mat_id) continue;

            const cleanQty =
                typeof row.qty === "string"
                    ? parseFloat(String(row.qty).replace(",", "."))
                    : Number(row.qty);

            if (isNaN(cleanQty)) continue;

            const items = groupedByProduct.get(row.product_id) ?? [];
            items.push({ raw_mat_id: row.raw_mat_id, quantity: cleanQty });
            groupedByProduct.set(row.product_id, items);
        }

        const productIds = Array.from(groupedByProduct.keys());
        console.log(`[Import] Products to update: ${productIds.length}`);

        await prisma.$transaction(
            async (tx) => {
                // Delete existing recipes for all affected products (version 1)
                if (productIds.length > 0) {
                    await tx.$executeRaw(
                        Prisma.sql`DELETE FROM recipes WHERE product_id IN (${Prisma.join(productIds)}) AND version = 1`,
                    );
                }

                // Insert all rows per product in chunks
                const CHUNK_SIZE = 500;
                const allRows: { product_id: number; raw_mat_id: number; quantity: number }[] = [];

                for (const [productId, items] of groupedByProduct) {
                    for (const item of items) {
                        allRows.push({
                            product_id: productId,
                            raw_mat_id: item.raw_mat_id,
                            quantity: item.quantity,
                        });
                    }
                }

                for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
                    const chunk = allRows.slice(i, i + CHUNK_SIZE);
                    const values = chunk.map(
                        (v) => {
                            const useSizeCalc = Number(v.quantity) < 1.0;
                            return Prisma.sql`(${v.product_id}, ${v.raw_mat_id}, ${v.quantity}, 1, true, ${useSizeCalc})`;
                        }
                    );

                    await tx.$executeRaw(
                        Prisma.sql`INSERT INTO recipes (product_id, raw_mat_id, quantity, version, is_active, use_size_calc) VALUES ${Prisma.join(values)}`,
                    );
                }
            },
            { maxWait: 300000, timeout: 300000 },
        );
    }

    static async getPreview(import_id: string) {
        const cache = await RecipeImportCacheService.get(import_id);

        if (!cache) throw new Error("Import preview not found or expired");
        if (cache.status !== "preview") throw new Error("Import already executed");

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
