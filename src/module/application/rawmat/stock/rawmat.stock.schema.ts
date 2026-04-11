import z from "zod";

export const QueryRawMaterialStockSchema = z.object({
    category_id: z.coerce.number().positive().optional(),
    supplier_id: z.coerce.number().positive().optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(50).optional(),
    search: z.string().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    sortBy: z
        .enum(["name", "barcode", "updated_at", "created_at", "category", "amount"])
        .default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const ResponseRawMaterialStockSchema = z.object({
    id: z.number().optional(),
    barcode: z.string(),
    name: z.string(),
    category: z.string(),
    uom: z.string(),
    amount: z.number(),
    stocks: z.record(z.string(), z.number()).default({}),
});

export const RequestRawMaterialStockSchema = z.object({
    barcode: z.string(),
    amount: z.number(),
    warehouse_id: z.number(),
    month: z.number().min(1).max(12),
    year: z.number().min(2000),
});

export const RequestUpsertRawMaterialStockSchema = z.object({
    raw_material_id: z.number(),
    warehouse_id: z.number(),
    quantity: z.number(),
    month: z.number().min(1).max(12),
    year: z.number().min(2000),
});

export type QueryRawMaterialStockDTO = z.infer<typeof QueryRawMaterialStockSchema>;
export type ResponseRawMaterialStockDTO = z.infer<typeof ResponseRawMaterialStockSchema>;
export type RequestRawMaterialStockDTO = z.infer<typeof RequestRawMaterialStockSchema>;
export type RequestUpsertRawMaterialStockDTO = z.infer<typeof RequestUpsertRawMaterialStockSchema>;
