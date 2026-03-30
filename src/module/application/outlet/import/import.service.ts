import { randomUUID } from "crypto";
import prisma from "../../../../config/prisma.js";
import { ImportCacheService } from "../../../../lib/utils/import.cache.js";
import { OutletImportPreviewDTO, ResponseOutletImportDTO } from "./import.schema.js";

const CACHE_PREFIX = "outlet:import:";

type ImportCachePayload = {
    status: "preview" | "executing";
    createdAt: number;
    total: number;
    valid: number;
    invalid: number;
    rows: OutletImportPreviewDTO[];
};

// Helper: safe get value from potentially messy CSV headers (e.g. BOM strings)
const getVal = (row: Record<string, any>, keyword: string): string => {
    const key = Object.keys(row).find((k) => k.toLowerCase().includes(keyword.toLowerCase()));
    return key && row[key] ? String(row[key]).trim() : "";
};

export class OutletImportService {
    static async preview(rows: Record<string, any>[]): Promise<ResponseOutletImportDTO> {
        // Pre-fetch all warehouses to validate codes
        const warehouses = await prisma.warehouse.findMany({
            where: { deleted_at: null },
            select: { id: true, code: true },
        });
        const warehouseCodeMap = new Map<string, number>();
        for (const w of warehouses) {
            if (w.code) {
                warehouseCodeMap.set(w.code.toUpperCase(), w.id);
            }
        }

        // Track duplicate outlet codes within the import batch
        const seenCodes = new Map<string, number>();

        const parsedRows: OutletImportPreviewDTO[] = rows.map((row, index) => {
            const code = getVal(row, "store_code").toUpperCase();
            const name = getVal(row, "store_name");
            const w1 = getVal(row, "supply_by_1").toUpperCase() || null;
            const w2 = getVal(row, "supply_by_2").toUpperCase() || null;
            const typeStr = getVal(row, "store_type").toUpperCase();
            const statusStr = getVal(row, "status").toLowerCase();

            const errors: string[] = [];

            if (!code) errors.push("Store code tidak boleh kosong");
            if (!name) errors.push("Store name tidak boleh kosong");

            if (code && seenCodes.has(code)) {
                errors.push(`Store code "${code}" duplikat dengan baris ke-${seenCodes.get(code)! + 1}`);
            } else if (code) {
                seenCodes.set(code, index);
            }

            if (w1 && !warehouseCodeMap.has(w1)) {
                errors.push(`Warehouse code (supply_by_1) "${w1}" tidak ditemukan`);
            }
            if (w2 && !warehouseCodeMap.has(w2)) {
                errors.push(`Warehouse code (supply_by_2) "${w2}" tidak ditemukan`);
            }
            if (w1 && w2 && w1 === w2) {
                errors.push("supply_by_1 dan supply_by_2 tidak boleh sama");
            }

            let store_type: "RETAIL" | "MARKETPLACE" = "RETAIL";
            if (typeStr && ["RETAIL", "MARKETPLACE"].includes(typeStr)) {
                store_type = typeStr as "RETAIL" | "MARKETPLACE";
            } else if (typeStr) {
                errors.push(`Store type "${typeStr}" tidak valid. Harus RETAIL atau MARKETPLACE`);
            } else {
                errors.push("Store type tidak boleh kosong");
            }

            const is_active = statusStr === "aktif" || statusStr === "true" || statusStr === "1" || statusStr === "";

            return {
                code,
                name,
                supply_by_1: w1,
                supply_by_2: w2,
                store_type,
                is_active,
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

        await ImportCacheService.save(CACHE_PREFIX, import_id, payload);

        return { import_id, total, valid, invalid };
    }

    static async execute(import_id: string) {
        const cache = (await ImportCacheService.get(CACHE_PREFIX, import_id)) as ImportCachePayload | null;

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

    private static async bulkInsert(data: OutletImportPreviewDTO[]) {
        if (!data.length) return;

        await prisma.$transaction(
            async (tx) => {
                // Map data to arrays for parallel unnesting
                const cols = {
                    codes: data.map((d) => d.code),
                    names: data.map((d) => d.name),
                    types: data.map((d) => d.store_type),
                    statuses: data.map((d) => d.is_active),
                };

                // 1. Batch Upsert Outlets
                await tx.$executeRaw`
                    INSERT INTO outlets (code, name, type, is_active, updated_at)
                    SELECT
                        p.code,
                        p.name,
                        p.type::"OutletType",
                        p.is_active,
                        NOW()
                    FROM unnest(
                        ${cols.codes}::text[],
                        ${cols.names}::text[],
                        ${cols.types}::text[],
                        ${cols.statuses}::boolean[]
                    ) AS p(code, name, type, is_active)
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
                        type = EXCLUDED.type,
                        is_active = EXCLUDED.is_active,
                        updated_at = NOW();
                `;

                // 2. Fetch created/updated outlet IDs
                const outlets = await tx.outlet.findMany({
                    where: { code: { in: cols.codes } },
                    select: { id: true, code: true },
                });
                const outletMap = new Map(outlets.map((o) => [o.code, o.id]));

                // 3. Clear existing relations for these outlets
                const outletIds = Array.from(outletMap.values());
                await tx.outletWarehouse.deleteMany({
                    where: { outlet_id: { in: outletIds } },
                });

                // 4. Map warehouse relations to arrays for unnesting
                const relations: { outletId: number; warehouseCode: string; priority: number }[] = [];
                for (const d of data) {
                    const oid = outletMap.get(d.code);
                    if (!oid) continue;

                    if (d.supply_by_1) relations.push({ outletId: oid, warehouseCode: d.supply_by_1, priority: 1 });
                    if (d.supply_by_2) relations.push({ outletId: oid, warehouseCode: d.supply_by_2, priority: 2 });
                }

                if (relations.length > 0) {
                    const relCols = {
                        outletIds: relations.map((r) => r.outletId),
                        warehouseCodes: relations.map((r) => r.warehouseCode),
                        priorities: relations.map((r) => r.priority),
                    };

                    await tx.$executeRaw`
                        INSERT INTO outlet_warehouses (outlet_id, warehouse_id, priority)
                        SELECT
                            r.oid,
                            w.id,
                            r.priority
                        FROM unnest(
                            ${relCols.outletIds}::int[],
                            ${relCols.warehouseCodes}::text[],
                            ${relCols.priorities}::int[]
                        ) AS r(oid, wcode, priority)
                        JOIN warehouses w ON UPPER(w.code) = UPPER(r.wcode)
                        WHERE w.deleted_at IS NULL
                        ON CONFLICT DO NOTHING;
                    `;
                }
            },
            { timeout: 30000 },
        );
    }

    static async getPreview(import_id: string) {
        const cache = (await ImportCacheService.get(CACHE_PREFIX, import_id)) as ImportCachePayload | null;

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
