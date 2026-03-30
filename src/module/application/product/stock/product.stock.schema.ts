import z from "zod";
import { GENDER } from "../../../../generated/prisma/enums.js";

export const RequestProductStockSchema = z.object({
    code: z.string(),
    amount: z.number(),
    warehouse_id: z.string(),
});

export const ResponseProductStockSchema = z.object({
    code: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    gender: z.enum(GENDER).default("UNISEX"),
    uom: z.string(),
    amount: z.number(),
    warehouse: z
        .object({
            id: z.string(),
            name: z.string(),
        })
        .optional(),
});

export const QueryProductStockSchema = z.object({
    type_id: z.number().positive().optional(),
    warehouse_id: z.number().positive().optional(),
    gender: z.enum(GENDER).optional(),
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),

    search: z.string().optional(),
    month: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .default(new Date().getMonth() + 1)
        .optional(),
    year: z.coerce.number().int().min(2000).default(new Date().getFullYear()).optional(),
    sortBy: z
        .enum(["code", "name", "updated_at", "created_at", "gender", "type", "size", "amount"])
        .default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type RequestProductStockDTO = z.infer<typeof RequestProductStockSchema>;
export type ResponseProductStockDTO = z.output<typeof ResponseProductStockSchema>;
export type QueryProductStockDTO = z.input<typeof QueryProductStockSchema>;
