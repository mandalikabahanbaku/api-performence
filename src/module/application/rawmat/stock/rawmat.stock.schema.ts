import z from "zod";

export const QueryRawMaterialStockSchema = z.object({
    category_id: z.coerce.number().positive().optional(),
    supplier_id: z.coerce.number().positive().optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(50).optional(),
    search: z.string().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).optional(),
    sortBy: z
        .enum(["name", "barcode", "updated_at", "created_at", "category", "amount"])
        .default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const ResponseRawMaterialStockSchema = z.object({
    barcode: z.string().nullable(),
    name: z.string(),
    category: z.string().nullable(),
    uom: z.string(),
    amount: z.number(),
    stocks: z.record(z.string(), z.number()).default({}),
});

export type QueryRawMaterialStockDTO = z.infer<typeof QueryRawMaterialStockSchema>;
export type ResponseRawMaterialStockDTO = z.infer<typeof ResponseRawMaterialStockSchema>;
