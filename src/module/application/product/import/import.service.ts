// import.service.ts
import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import { GENDER } from "../../../../generated/prisma/enums.js";
import { normalizeSlug } from "../../../../lib/index.js";
import {
    ProductImportPreviewDTO,
    ProductImportRowSchema,
    ResponseProductImportDTO,
} from "./import.schema.js";
import { ImportCacheService } from "../../../../lib/utils/import.cache.js";

const CACHE_PREFIX = "product:import:";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: ProductImportPreviewDTO[];
};

export class ProductImportService {
    private static mapGender(value: string = ""): GENDER {
        const normalizedValue = value.toLowerCase();
        if (["woman", "women"].includes(normalizedValue)) return GENDER.WOMEN;
        if (["man", "men"].includes(normalizedValue)) return GENDER.MEN;
        return GENDER.UNISEX;
    }

    static async preview(rows: Record<string, any>[]): Promise<ResponseProductImportDTO> {
        const parsedResults = rows.map((row) => ProductImportRowSchema.safeParse(row));
        const parsedRows: ProductImportPreviewDTO[] = rows.map((row, index) => {
            const parsed = parsedResults[index];
            if (!parsed) {
                return {
                    code: String(row["PRODUCT CODE"] || ""),
                    name: String(row["PRODUCT NAME"] || ""),
                    gender: GENDER.UNISEX,
                    size: 0,
                    type: null,
                    unit: null,
                    distribution_percentage: 0,
                    safety_percentage: 0,
                    errors: ["Internal parsing error"],
                };
            }

            if (!parsed.success) {
                return {
                    code: String(row["PRODUCT CODE"] || ""),
                    name: String(row["PRODUCT NAME"] || ""),
                    gender: GENDER.UNISEX,
                    size: 0,
                    type: null,
                    unit: null,
                    distribution_percentage: 0,
                    safety_percentage: 0,
                    errors: parsed.error.issues.map((e) => e.message),
                };
            }

            const {
                "PRODUCT CODE": code,
                "PRODUCT NAME": name,
                GENDER: gender,
                SIZE,
                TYPE,
                UOM,
                EDAR,
                SAFETY,
            } = parsed.data;

            return {
                code: code.trim(),
                name: name.trim(),
                gender: this.mapGender(gender),
                size: SIZE,
                type: normalizeSlug(TYPE),
                unit: normalizeSlug(UOM),
                distribution_percentage: EDAR,
                safety_percentage: SAFETY,
                errors: [],
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

        await ImportCacheService.save(CACHE_PREFIX, import_id, payload);

        return { import_id, total, valid, invalid };
    }

    static async execute(import_id: string) {
        const cache = (await ImportCacheService.get(
            CACHE_PREFIX,
            import_id,
        )) as ImportCachePayload | null;

        if (!cache || cache.status !== "preview") {
            throw new Error("Import session expired, not found, or already executed");
        }

        const validRows = cache.rows.filter((r) => r.errors.length === 0);
        if (!validRows.length) {
            throw new Error("No valid rows to import");
        }

        // Lock session to prevent double-execution
        await ImportCacheService.save(CACHE_PREFIX, import_id, { ...cache, status: "executing" });

        try {
            await this.bulkInsert(validRows);
            await ImportCacheService.remove(CACHE_PREFIX, import_id);

            return { import_id, total: validRows.length };
        } catch (err) {
            // Rollback status on failure
            await ImportCacheService.save(CACHE_PREFIX, import_id, cache);
            throw err;
        }
    }

    private static async bulkInsert(data: ProductImportPreviewDTO[]) {
        if (!data.length) return;

        // Dedup data by code to avoid "affect row a second time" error
        const dedupped = new Map<string, ProductImportPreviewDTO>();
        for (const d of data) {
            if (d.code?.trim()) dedupped.set(d.code.trim(), d);
        }
        const finalData = Array.from(dedupped.values());

        // Extract unique master data for dependency tables
        const types = [...new Set(finalData.map((d) => d.type).filter(Boolean))] as string[];
        const units = [...new Set(finalData.map((d) => d.unit).filter(Boolean))] as string[];
        const sizes = [...new Set(finalData.map((d) => d.size).filter((s) => s > 0))] as number[];

        await prisma.$transaction(async (tx) => {
            // Upsert dependency tables
            if (types.length) {
                await tx.$executeRaw`
                    INSERT INTO product_types (name, slug)
                    SELECT initcap(replace(t.slug, '-', ' ')), t.slug
                    FROM unnest(${types}::text[]) AS t(slug)
                    ON CONFLICT (slug) DO NOTHING;
                `;
            }

            if (units.length) {
                await tx.$executeRaw`
                    INSERT INTO unit_of_materials (name, slug)
                    SELECT initcap(replace(u.slug, '-', ' ')), u.slug
                    FROM unnest(${units}::text[]) AS u(slug)
                    ON CONFLICT (slug) DO NOTHING;
                `;
            }

            if (sizes.length) {
                await tx.$executeRaw`
                    INSERT INTO product_size (size)
                    SELECT s.val
                    FROM unnest(${sizes}::int[]) AS s(val)
                    ON CONFLICT (size) DO NOTHING;
                `;
            }

            // Map data to arrays for parallel unnesting
            const cols = {
                codes: finalData.map((d) => d.code),
                names: finalData.map((d) => d.name),
                genders: finalData.map((d) => d.gender || GENDER.UNISEX),
                prodSizes: finalData.map((d) => d.size || null),
                typeSlugs: finalData.map((d) => d.type || null),
                unitSlugs: finalData.map((d) => d.unit || null),
                distributionPercs: finalData.map((d) => d.distribution_percentage || 0),
                safetyPercs: finalData.map((d) => d.safety_percentage || 0),
            };

            // Main product upsert using multi-array unnest for maximum performance and alignment safety
            await tx.$executeRaw`
                INSERT INTO products (
                    code, name, gender, size_id, type_id, unit_id, 
                    distribution_percentage, safety_percentage, 
                    status, updated_at
                )
                SELECT
                    p.code,
                    p.name,
                    p.gender::"GENDER",
                    ps.id,
                    pt.id,
                    u.id,
                    p.dist_perc,
                    p.safe_perc,
                    'ACTIVE'::"STATUS",
                    NOW()
                FROM unnest(
                    ${cols.codes}::text[],
                    ${cols.names}::text[],
                    ${cols.genders}::text[],
                    ${cols.prodSizes}::int[],
                    ${cols.typeSlugs}::text[],
                    ${cols.unitSlugs}::text[],
                    ${cols.distributionPercs}::decimal[],
                    ${cols.safetyPercs}::decimal[]
                ) AS p(code, name, gender, prod_size, type_slug, unit_slug, dist_perc, safe_perc)
                LEFT JOIN product_size ps ON ps.size = p.prod_size
                LEFT JOIN product_types pt ON pt.slug = p.type_slug
                LEFT JOIN unit_of_materials u ON u.slug = p.unit_slug
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    gender = EXCLUDED.gender,
                    size_id = EXCLUDED.size_id,
                    type_id = EXCLUDED.type_id,
                    unit_id = EXCLUDED.unit_id,
                    distribution_percentage = EXCLUDED.distribution_percentage,
                    safety_percentage = EXCLUDED.safety_percentage,
                    updated_at = NOW();
            `;
        });
    }

    static async getPreview(import_id: string) {
        const cache = (await ImportCacheService.get(
            CACHE_PREFIX,
            import_id,
        )) as ImportCachePayload | null;

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
