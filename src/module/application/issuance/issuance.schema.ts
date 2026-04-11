import z from "zod";
import { ResponseProductSchema } from "../product/product.schema.js";
import { GENDER, IssuanceType } from "../../../generated/prisma/enums.js";

export const RequestIssuanceSchema = z.object({
    product_id: z.number("Produk tidak boleh kosong"),
    quantity: z.number(),
    month: z.number().optional(),
    year: z.number().optional(),
    type: z.nativeEnum(IssuanceType).default(IssuanceType.ALL),
});

export type RequestIssuanceDTO = z.infer<typeof RequestIssuanceSchema>;

export const ResponseIssuanceSchema = RequestIssuanceSchema.extend({
    id: z.number().optional(),
    month: z.number(),
    year: z.number(),
    created_at: z.date(),
    updated_at: z.date(),
    product: ResponseProductSchema.pick({
        id: true,
        code: true,
        name: true,
        product_type: true,
    }),
});

export const QueryIssuanceSchema = z.object({
    size: z.number().optional(),
    variant: z.string().optional(),
    gender: z.enum(GENDER).optional(),
    horizon: z.number().optional(),
    product_id: z.number().optional(),
    product_id_2: z.number().optional(),

    year: z.number().optional(),
    month: z.number().optional(),
    search: z.string().optional(),
    type: z.nativeEnum(IssuanceType).optional(),

    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),

    sortBy: z.enum(["product_id", "name", "code", "quantity"]).default("quantity"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ResponseIssuanceDTO = z.infer<typeof ResponseIssuanceSchema>;
export type QueryIssuanceDTO = z.infer<typeof QueryIssuanceSchema>;

export const QueryIssuanceRekapSchema = z.object({
    year: z.number().int().positive().optional(),
    month: z.number().int().min(1).max(12).optional(),
    search: z.string().optional(),
    gender: z.enum(GENDER).optional(),
    size: z.number().optional(),
    variant: z.string().optional(),
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(50).optional(),
    sortBy: z.enum(["name", "code", "offline", "online", "spin_wheel", "garansi_out", "b2b", "all_qty", "total_qty"]).default("total_qty"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type QueryIssuanceRekapDTO = z.infer<typeof QueryIssuanceRekapSchema>;
