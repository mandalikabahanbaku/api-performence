// import.service.ts
import { randomUUID } from "crypto";
import {
    ProductStockImportPreviewDTO,
    ProductStockImportRowSchema,
    ResponseProductStockImportDTO,
} from "./import.schema.js";

import { ProductStockImportCacheService } from "./import.cache.js";
import prisma from "../../../../../config/prisma.js";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: ProductStockImportPreviewDTO[];
};

export class ProductStockImportService {
    static async preview(rows: any[]): Promise<ResponseProductStockImportDTO> {
        // Collect product codes for batch search
        const codes = rows
            .map((r) => r["PRODUCT CODE"])
            .filter((c): c is string => typeof c === "string" && c.trim().length > 0);

        const products = codes.length
            ? await prisma.product.findMany({
                  where: { code: { in: codes }, deleted_at: null },
                  select: {
                      id: true,
                      code: true,
                      name: true,
                      product_type: { select: { name: true } },
                      size: { select: { size: true } },
                  },
              })
            : [];

        const productMap = new Map(products.map((p) => [p.code, p]));

        const parsedRows: ProductStockImportPreviewDTO[] = rows.map((row) => {
            const parsed = ProductStockImportRowSchema.safeParse(row);

            if (!parsed.success) {
                return {
                    code: row["PRODUCT CODE"] || "",
                    product_id: 0,
                    name: "",
                    size: "",
                    type: "",
                    amount: 0,
                    errors: parsed.error.issues.map((e) => e.message),
                };
            }

            const data = parsed.data;
            const product = productMap.get(data["PRODUCT CODE"]);

            if (!product) {
                return {
                    code: data["PRODUCT CODE"],
                    product_id: 0,
                    name: "",
                    size: "",
                    type: "",
                    amount: Number(data["CURRENT STOCK"]) || 0,
                    errors: ["Produk tidak ditemukan"],
                };
            }

            return {
                code: data["PRODUCT CODE"],
                product_id: product.id,
                name: product.name,
                size: product.size?.size?.toString() || "",
                type: product.product_type?.name || "",
                amount: Number(data["CURRENT STOCK"]) || 0,
                errors: [],
            };
        });

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

        await ProductStockImportCacheService.save(import_id, payload);

        return {
            import_id,
            total,
            valid,
            invalid,
        };
    }

    static async execute(import_id: string, warehouse_id: number, month: number, year: number) {
        const cache = (await ProductStockImportCacheService.get(
            import_id,
        )) as ImportCachePayload | null;

        if (!cache) {
            throw new Error("Import session expired or not found");
        }

        if (cache.status !== "preview") {
            throw new Error("Import already executed or in progress");
        }

        const validRows = cache.rows.filter((r) => r.errors.length === 0);
        if (!validRows.length) {
            throw new Error("No valid rows to import");
        }

        await ProductStockImportCacheService.save(import_id, {
            ...cache,
            status: "executing",
        });

        try {
            await this.bulkInsert(validRows, warehouse_id, month, year);
            await ProductStockImportCacheService.remove(import_id);

            return {
                import_id,
                total: validRows.length,
            };
        } catch (err) {
            await ProductStockImportCacheService.save(import_id, cache);
            throw err;
        }
    }

    private static async bulkInsert(
        data: ProductStockImportPreviewDTO[],
        warehouse_id: number,
        month: number,
        year: number,
    ) {
        if (!data.length) return;

        const productIds = data.map((d) => d.product_id);
        const amounts = data.map((d) => d.amount);

        await prisma.$executeRaw`
            INSERT INTO product_inventories (
                product_id,
                warehouse_id,
                quantity,
                date,
                month,
                year,
                created_at,
                updated_at
            )
            SELECT
                s.product_id,
                ${warehouse_id}::int,
                s.quantity,
                1,
                ${month}::int,
                ${year}::int,
                NOW(),
                NOW()
            FROM (
                SELECT
                    unnest(${productIds}::int[])   AS product_id,
                    unnest(${amounts}::numeric[])  AS quantity
            ) s
            ON CONFLICT (product_id, warehouse_id, date, month, year)
            DO UPDATE SET
                quantity = EXCLUDED.quantity,
                updated_at = NOW();
        `;
    }

    static async getPreview(import_id: string) {
        const cache = await ProductStockImportCacheService.get(import_id);

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
