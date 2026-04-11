import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import {
    RawmatImportPreviewDTO,
    RawmatImportRowSchema,
    ResponseRawmatImportDTO,
} from "./import.schema.js";
import { ImportCacheService } from "../../../../lib/utils/import.cache.js";
import { normalizeSlug } from "../../../../lib/index.js";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: RawmatImportPreviewDTO[];
};

const PREFIX = "rawmat:import:";

export class RawmatImportService {
    static async preview(rows: Record<string, any>[]): Promise<ResponseRawmatImportDTO> {
        const parsedResults = rows.map((row) => RawmatImportRowSchema.safeParse(row));
        const parsedRows: RawmatImportPreviewDTO[] = rows.map((row, index) => {
            const parsed = parsedResults[index];
            if (!parsed) {
                return {
                    barcode: String(row.BARCODE || ""),
                    name: String(row["MATERIAL NAME"] || ""),
                    price: 0,
                    min_buy: 0,
                    min_stock: 0,
                    unit: "",
                    category: "",
                    supplier: "",
                    country: "",
                    source: "LOCAL",
                    lead_time: 0,
                    errors: ["Internal parsing error"],
                };
            }

            if (!parsed.success) {
                return {
                    barcode: String(row.BARCODE || ""),
                    name: String(row["MATERIAL NAME"] || ""),
                    price: 0,
                    min_buy: 0,
                    min_stock: 0,
                    unit: "",
                    category: "",
                    supplier: "",
                    country: "",
                    source: "LOCAL",
                    lead_time: 0,
                    errors: parsed.error.issues.map((e) => e.message),
                };
            }

            const data = parsed.data;
            const inputCountry = String(data.COUNTRY || data["LOCAL/IMPORT"] || "LOCAL").toUpperCase().trim();
            
            // Logic: Indonesia/Indo/Local/Lokal -> LOCAL, others -> IMPORT
            const source = (inputCountry === "IMPORT" || (inputCountry !== "LOCAL" && inputCountry !== "LOKAL" && !inputCountry.includes("INDONESIA") && !inputCountry.includes("INDO"))) 
                ? "IMPORT" 
                : "LOCAL";
            
            return {
                barcode: data.BARCODE.trim(),
                name: String(data["MATERIAL NAME"] || "").trim(),
                price: data.PRICE ?? 0,
                min_buy: data.MOQ ?? 0,
                min_stock: data["MIN STOK"] ?? 0,
                unit: (data.UOM || "UNIT").toUpperCase().trim(),
                category: data.CATEGORY.toUpperCase().trim(),
                supplier: (data.SUPPLIER || "UNKNOWN").toUpperCase().trim(),
                country: inputCountry,
                source,
                lead_time: data["LEAD TIME"] ?? 0,
                errors: [],
            };
        });

        const total = parsedRows.length;
        const invalid = parsedRows.filter((r) => r.errors.length > 0).length;
        const valid = total - invalid;
        const import_id = randomUUID();

        await ImportCacheService.save(PREFIX, import_id, {
            status: "preview",
            createdAt: Date.now(),
            total,
            valid,
            invalid,
            rows: parsedRows,
        } satisfies ImportCachePayload, 800);

        return { import_id, total, valid, invalid };
    }

    static async execute(import_id: string, month: number, year: number) {
        const cache = (await ImportCacheService.get(PREFIX, import_id)) as ImportCachePayload | null;

        if (!cache) throw new Error("Import session expired or not found");
        if (cache.status !== "preview") throw new Error("Import already executed or in progress");

        const validRows = cache.rows.filter((r) => r.errors.length === 0);
        if (!validRows.length) throw new Error("No valid rows to import");

        await ImportCacheService.save(PREFIX, import_id, { ...cache, status: "executing" });

        try {
            await this.bulkInsert(validRows);
            await ImportCacheService.remove(PREFIX, import_id);
            return { import_id, total: validRows.length, month, year };
        } catch (err) {
            await ImportCacheService.save(PREFIX, import_id, cache);
            throw err;
        }
    }

    static async getPreview(import_id: string) {
        const cache = (await ImportCacheService.get(PREFIX, import_id)) as ImportCachePayload | null;

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

    private static parseDecimal(value: unknown): number | null {
        if (value === null || value === undefined) return null;
        const cleaned = String(value).replace(/[^\d.-]/g, "");
        if (!cleaned) return null;
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : null;
    }

    private static async bulkInsert(data: RawmatImportPreviewDTO[]) {
        if (!data.length) return;

        await prisma.$transaction(async (tx) => {
            // ── 1. Batch upsert units (1 query) ────────────────────────────────────
            const unitMap = new Map<string, string>(); // slug → name
            for (const d of data) {
                if (d.unit?.trim()) unitMap.set(normalizeSlug(d.unit), d.unit.trim());
            }
            const unitSlugs = [...unitMap.keys()];
            const unitNames = unitSlugs.map((s) => unitMap.get(s)!);
            const unitSlugToId = new Map<string, number>();

            if (unitSlugs.length) {
                const upserted = await tx.$queryRaw<{ id: number; slug: string }[]>`
                    INSERT INTO unit_raw_materials (slug, name)
                    SELECT unnest(${unitSlugs}::text[]), unnest(${unitNames}::text[])
                    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id, slug
                `;
                for (const u of upserted) unitSlugToId.set(u.slug, u.id);
            }

            // ── 2. Batch upsert categories (1 query) ───────────────────────────────
            const categoryMap = new Map<string, string>(); // slug → name
            for (const d of data) {
                if (d.category?.trim()) categoryMap.set(normalizeSlug(d.category), d.category.trim());
            }
            const categorySlugs = [...categoryMap.keys()];
            const categoryNames = categorySlugs.map((s) => categoryMap.get(s)!);
            const categorySlugToId = new Map<string, number>();

            if (categorySlugs.length) {
                const upserted = await tx.$queryRaw<{ id: number; slug: string }[]>`
                    INSERT INTO raw_mat_categories (slug, name, created_at, updated_at)
                    SELECT unnest(${categorySlugs}::text[]), unnest(${categoryNames}::text[]), NOW(), NOW()
                    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
                    RETURNING id, slug
                `;
                for (const c of upserted) categorySlugToId.set(c.slug, c.id);
            }

            // ── 3. Batch upsert suppliers (hybrid: slug + name fallback) ───────────
            // Supplier.slug adalah nullable – record lama mungkin belum punya slug.
            // Strategi:
            //   a) Cari existing by slug (record yang sudah diimport sebelumnya)
            //   b) Cari juga by LOWER(TRIM(name)) untuk record lama tanpa slug
            //   c) Backfill slug pada record lama yang ditemukan via nama
            //   d) INSERT hanya yang benar-benar baru
            const supplierSlugMap = new Map<string, { name: string; lowerName: string; country: string }>();
            for (const d of data) {
                if (d.supplier?.trim()) {
                    const slug = normalizeSlug(d.supplier);
                    supplierSlugMap.set(slug, {
                        name: d.supplier.trim(),
                        lowerName: d.supplier.trim().toLowerCase(),
                        country: d.country,
                    });
                }
            }
            const supplierSlugs     = [...supplierSlugMap.keys()];
            const supplierLowerNames = supplierSlugs.map((s) => supplierSlugMap.get(s)!.lowerName);
            const supplierSlugToId  = new Map<string, number>(); // slug → id

            if (supplierSlugs.length) {
                // a+b) Cari existing by slug ATAU by lowercase name (record lama)
                const existing = await tx.$queryRaw<{ id: number; slug: string | null; name: string }[]>`
                    SELECT id, slug, name FROM suppliers
                    WHERE slug = ANY(${supplierSlugs}::text[])
                       OR (slug IS NULL AND LOWER(TRIM(name)) = ANY(${supplierLowerNames}::text[]))
                `;

                const foundBySlug = new Set<string>();
                const toBackfill: { id: number; slug: string }[] = [];

                // Pass 1: prioritaskan record yang sudah punya slug
                for (const s of existing) {
                    if (s.slug) {
                        supplierSlugToId.set(s.slug, s.id);
                        foundBySlug.add(s.slug);
                    }
                }

                // Pass 2: handle record lama (slug NULL) – backfill hanya jika slug belum dipakai
                for (const s of existing) {
                    if (!s.slug) {
                        const slug = normalizeSlug(s.name);
                        if (!foundBySlug.has(slug)) {
                            // Aman untuk backfill – tidak ada record lain dengan slug ini
                            supplierSlugToId.set(slug, s.id);
                            foundBySlug.add(slug);
                            toBackfill.push({ id: s.id, slug });
                        }
                        // else: ada record duplikat lama, slug sudah dipakai → skip
                    }
                }

                // c) Backfill slug untuk record lama (satu per satu, jumlah kecil)
                for (const { id, slug } of toBackfill) {
                    await tx.$executeRaw`
                        UPDATE suppliers SET slug = ${slug}, updated_at = NOW()
                        WHERE id = ${id} AND slug IS NULL
                    `;
                }

                // d) UPSERT all suppliers from the excel to ensure "country" (Local/Import) is up to date
                if (supplierSlugs.length) {
                    const allNames = supplierSlugs.map((s) => supplierSlugMap.get(s)!.name);
                    const allCountries = supplierSlugs.map((s) => supplierSlugMap.get(s)!.country);

                    // Use atomic aligned unnest (standard PG way)
                    // We update 'country' and 'updated_at' on conflict.
                    // 'addresses' is defaulting to '-' for new records.
                    const upserted = await tx.$queryRaw<{ id: number; slug: string }[]>`
                        INSERT INTO suppliers (name, slug, addresses, country, created_at, updated_at)
                        SELECT t.name, t.slug, '-', t.country, NOW(), NOW()
                        FROM unnest(
                            ${allNames}::text[],
                            ${supplierSlugs}::text[],
                            ${allCountries}::text[]
                        ) AS t(name, slug, country)
                        ON CONFLICT (slug) DO UPDATE SET 
                            updated_at = NOW()
                        RETURNING id, slug
                    `;
                    for (const s of upserted) supplierSlugToId.set(s.slug, s.id);
                }
            }

            // ── 4. Validate & build column arrays for batch upsert ─────────────────
            // Sentinel: 0 untuk nullable FK (NULLIF(x,0) → NULL di SQL)
            const barcodes: string[]    = [];
            const names: string[]       = [];
            const prices: number[]      = [];
            const minBuys: number[]     = [];
            const minStocks: number[]   = [];
            const unitIds: number[]     = [];
            const categoryIds: number[] = []; // 0 = NULL
            const supplierIds: number[] = []; // 0 = NULL
            const leadTimes: number[]   = []; // 0 = NULL
            const sources: string[]     = [];

            // Dedup data by barcode (non-empty) to avoid "affect row a second time" error
            const dedupped = new Map<string, RawmatImportPreviewDTO>();
            const noBarcode: RawmatImportPreviewDTO[] = [];
            for (const d of data) {
                if (d.barcode?.trim()) dedupped.set(d.barcode.trim(), d);
                else noBarcode.push(d);
            }
            const finalData = [...dedupped.values(), ...noBarcode];

            for (const row of finalData) {
                const unitId = row.unit ? unitSlugToId.get(normalizeSlug(row.unit)) : undefined;
                if (!unitId) throw new Error(`Unit tidak ditemukan untuk material: ${row.name}`);

                barcodes.push(row.barcode || "");
                names.push(row.name);
                prices.push(this.parseDecimal(row.price) ?? 0);
                minBuys.push(this.parseDecimal(row.min_buy) ?? 0);
                minStocks.push(this.parseDecimal(row.min_stock) ?? 0);
                unitIds.push(unitId);
                categoryIds.push(row.category ? (categorySlugToId.get(normalizeSlug(row.category)) ?? 0) : 0);
                supplierIds.push(row.supplier ? (supplierSlugToId.get(normalizeSlug(row.supplier)) ?? 0) : 0);
                leadTimes.push(row.lead_time || 0);
                sources.push(row.source);
            }

            // ── 5. Single batch upsert raw_materials (1 query) ────────────────────
            // NULLIF(x, 0) mengkonversi sentinel 0 → NULL untuk nullable FK
            // NULLIF(b, '') mengkonversi empty string → NULL untuk barcode
            // ON CONFLICT (barcode): NULL barcode tidak pernah conflict → selalu INSERT
            await tx.$executeRaw`
                INSERT INTO raw_materials (
                    barcode, name, price, min_buy, min_stock,
                    unit_id, raw_mat_categories_id, supplier_id, lead_time,
                    source, created_at, updated_at
                )
                SELECT
                    NULLIF(b, ''),
                    n,
                    p::numeric,
                    NULLIF(mb, 0)::numeric,
                    NULLIF(ms, 0)::numeric,
                    ui::int,
                    NULLIF(ci, 0)::int,
                    NULLIF(si, 0)::int,
                    NULLIF(lt, 0)::int,
                    s::"RawMaterialSource",
                    NOW(),
                    NOW()
                FROM unnest(
                    ${barcodes}::text[],
                    ${names}::text[],
                    ${prices}::numeric[],
                    ${minBuys}::numeric[],
                    ${minStocks}::numeric[],
                    ${unitIds}::int[],
                    ${categoryIds}::int[],
                    ${supplierIds}::int[],
                    ${leadTimes}::int[],
                    ${sources}::text[]
                ) AS t(b, n, p, mb, ms, ui, ci, si, lt, s)
                ON CONFLICT (barcode) DO UPDATE SET
                    name                  = EXCLUDED.name,
                    price                 = EXCLUDED.price,
                    min_buy               = EXCLUDED.min_buy,
                    min_stock             = EXCLUDED.min_stock,
                    unit_id               = EXCLUDED.unit_id,
                    raw_mat_categories_id = EXCLUDED.raw_mat_categories_id,
                    supplier_id           = EXCLUDED.supplier_id,
                    lead_time             = EXCLUDED.lead_time,
                    source                = EXCLUDED.source,
                    updated_at            = NOW()
            `;
        }, { maxWait: 30000, timeout: 60000 });
    }
}
