// import.service.ts
import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import { IssuanceService } from "../issuance.service.js";
import { IssuanceImportPreviewDTO, IssuanceImportRowSchema, ResponseIssuanceImportDTO } from "./import.schema.js";
import { ImportCacheService } from "../../../../lib/utils/import.cache.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { logger } from "../../../../lib/logger.js";

const CACHE_PREFIX = "issuance:import:";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: IssuanceImportPreviewDTO[];
};

export class IssuanceImportService {
    static async preview(rows: Record<string, unknown>[]): Promise<ResponseIssuanceImportDTO> {
        // 1. Parse all rows (sync)
        const parsed = rows.map((row) => IssuanceImportRowSchema.safeParse(row));

        // 2. Batch-fetch all valid product codes in a single query — avoids N+1
        const validCodes = parsed
            .filter((r) => r.success)
            .map((r) => r.data["PRODUCT CODE"]);

        const products = validCodes.length
            ? await prisma.product.findMany({
                  where: { code: { in: validCodes } },
                  select: { code: true, name: true, product_type: { select: { name: true } } },
              })
            : [];
        const productMap = new Map(products.map((p) => [p.code, p]));

        // 3. Build result rows
        const parsedRows: IssuanceImportPreviewDTO[] = rows.map((row, index) => {
            const result = parsed[index];
            if (!result) {
                return {
                    code: String(row["PRODUCT CODE"] || row["code"] || ""),
                    product_name: String(row["PRODUCT NAME"] || row["product_name"] || ""),
                    amount: (row["TOTAL"] || row["amount"] || 0) as number,
                    type: null,
                    errors: ["Internal parsing error"],
                };
            }

            const rawCode = String(row["PRODUCT CODE"] || row["code"] || "");
            const rawAmount = row["TOTAL"] || row["amount"] || 0;
            const rawName = String(row["PRODUCT NAME"] || row["product_name"] || "");

            if (!result.success) {
                return {
                    code: rawCode,
                    product_name: rawName,
                    amount: rawAmount as number,
                    type: null,
                    errors: result.error.issues.map((e) => e.message),
                };
            }

            const data = result.data;
            const product = productMap.get(data["PRODUCT CODE"]);
            const errors: string[] = [];

            if (!product) {
                errors.push(`Produk dengan kode "${data["PRODUCT CODE"]}" tidak ditemukan`);
            }

            return {
                code: data["PRODUCT CODE"],
                product_name: product?.name || rawName,
                amount: data["TOTAL"],
                type: product?.product_type?.name ?? "",
                errors,
            };
        });

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

        await ImportCacheService.save(CACHE_PREFIX, import_id, payload, 900); // 15 mins TTL
        
        return { import_id, total, valid, invalid };
    }

    static async execute(import_id: string, month: number, year: number, type: any = "ALL") {
        logger.info("Executing import", { import_id, month, year, type, prefix: CACHE_PREFIX });
        
        if (!import_id || import_id === "null" || import_id === "undefined") {
            throw new ApiError(400, "Import ID tidak valid");
        }

        const cache = (await ImportCacheService.get(CACHE_PREFIX, import_id)) as ImportCachePayload | null;

        if (!cache) {
            logger.error("Import session not found in Redis", { import_id, prefix: CACHE_PREFIX });
            throw new ApiError(404, "Import session telah kadaluarsa atau tidak ditemukan");
        }
        
        if (cache.status !== "preview") {
            logger.warn("Import session already in a non-preview state", { import_id, status: cache.status });
            throw new ApiError(400, "Import sudah dieksekusi atau sedang diproses");
        }

        const validRows = cache.rows.filter((r) => r.errors.length === 0);
        if (!validRows.length) throw new ApiError(400, "Tidak ada baris valid untuk diimport");

        // Lock session to prevent double-execute
        await ImportCacheService.save(CACHE_PREFIX, import_id, { ...cache, status: "executing" });

        try {
            const forceAll = (year * 12 + month) <= IssuanceService.THRESHOLD_PERIOD;
            if (forceAll && type !== "ALL") {
                throw new ApiError(
                    400,
                    `Untuk periode ${month}/${year} dan sebelumnya, sistem hanya menerima tipe pengeluaran 'ALL'`,
                );
            }

            await this.bulkInsert(validRows, month, year, type);
            await ImportCacheService.remove(CACHE_PREFIX, import_id);

            return { import_id, total: validRows.length, month, year };
        } catch (err) {
            // Rollback lock on failure
            await ImportCacheService.save(CACHE_PREFIX, import_id, cache);
            throw err;
        }
    }

    private static parseIntegerQuantity(value: unknown): number | null {
        if (value === null || value === undefined) return null;
        const digitsOnly = String(value).replace(/[^\d]/g, "");
        if (!digitsOnly) return null;
        return Number(digitsOnly);
    }

    private static async bulkInsert(data: IssuanceImportPreviewDTO[], month: number, year: number, type: any = "ALL") {
        if (!data.length) return;

        // Dedup data by code to avoid "affect row a second time" error
        const dedupped = new Map<string, IssuanceImportPreviewDTO>();
        for (const d of data) {
            if (d.code?.trim()) dedupped.set(d.code.trim(), d);
        }
        const finalData = Array.from(dedupped.values());

        const codes: string[] = [];
        const quantities: number[] = [];
        for (const d of finalData) {
            const quantity = this.parseIntegerQuantity(d.amount);
            if (Number.isInteger(quantity)) {
                codes.push(d.code);
                quantities.push(quantity as number);
            }
        }

        if (codes.length !== finalData.length) {
            logger.warn("Some issuance rows were dropped due to invalid quantity", {
                total: finalData.length,
                valid: codes.length,
                dropped: finalData.length - codes.length,
            });
        }

        if (!codes.length) throw new ApiError(400, "Semua baris memiliki kuantitas tidak valid");

        await prisma.$executeRaw`
            INSERT INTO product_issuances (
                product_id,
                month,
                year,
                quantity,
                type,
                created_at,
                updated_at
            )
            SELECT
                p.id,
                ${month}::int,
                ${year}::int,
                q.quantity::numeric,
                CAST(${type}::text AS "IssuanceType"),
                NOW(),
                NOW()
            FROM
                unnest(
                    ${codes}::text[],
                    ${quantities}::numeric[]
                ) AS q(code, quantity)
            INNER JOIN products p
                ON p.code = q.code
            ON CONFLICT (product_id, year, month, type)
            DO UPDATE SET
                quantity = EXCLUDED.quantity,
                updated_at = NOW();
        `;
    }

    static async getPreview(import_id: string) {
        const cache = (await ImportCacheService.get(CACHE_PREFIX, import_id)) as ImportCachePayload | null;

        if (!cache) throw new ApiError(404, "Import preview tidak ditemukan atau telah kadaluarsa");
        if (cache.status !== "preview") throw new ApiError(400, "Import sudah dieksekusi");

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
