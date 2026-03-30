import z from "zod";

export const RequestOutletInventoryInitSchema = z.object({
    product_ids: z
        .array(z.number().int().positive())
        .min(1, "Minimal satu produk harus dipilih"),
});

export const RequestOutletInventorySetMinStockSchema = z.object({
    min_stock: z.coerce.number().nonnegative("Min stock tidak boleh negatif"),
});

export const QueryOutletInventorySchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(25).optional(),
    search: z.string().optional(),
    low_stock: z.enum(["true", "false"]).optional(),
    sortBy: z.enum(["quantity", "min_stock", "updated_at"]).default("updated_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc").optional(),
});

export const ResponseOutletInventorySchema = z.object({
    id: z.number(),
    outlet_id: z.number(),
    product_id: z.number(),
    quantity: z.coerce.number(),
    min_stock: z.coerce.number().nullable(),
    is_low_stock: z.boolean().optional(),
    updated_at: z.coerce.date(),
    product: z.object({ id: z.number(), name: z.string(), code: z.string() }).optional(),
});

export type RequestOutletInventoryInitDTO = z.infer<typeof RequestOutletInventoryInitSchema>;
export type RequestOutletInventorySetMinStockDTO = z.infer<typeof RequestOutletInventorySetMinStockSchema>;
export type QueryOutletInventoryDTO = z.infer<typeof QueryOutletInventorySchema>;
export type ResponseOutletInventoryDTO = z.infer<typeof ResponseOutletInventorySchema>;
