import z from "zod";
import { GENDER, STATUS } from "../../../generated/prisma/enums.js";
import { UnitResponseSchema } from "./unit/unit.schema.js";
import { TypeResponseSchema } from "./type/type.schema.js";
import { ResponseProductSizeSchema } from "./size/size.schema.js";

export const RequestProductSchema = z.object({
    code: z.string().max(100).regex(/^\S+$/, { message: "Gunakan '_' (underscore) untuk spasi" }),
    name: z
        .string()
        .min(5, "Nama produk minimal memiliki 5 karakter")
        .max(100, "Nama produk tidak boleh melebihi 100 karakter"),
    size: z.coerce.number("Ukuran tidak boleh kosong").min(2),
    gender: z.enum(GENDER).optional().default("UNISEX"),
    status: z.enum(STATUS).default("PENDING").optional(),
    z_value: z.number().default(1.65),
    lead_time: z.number().int().min(1).default(14),
    review_period: z.number().int().min(1).default(30),
    unit: z.string().nullable().optional(),
    product_type: z.string().nullable().optional(),
    distribution_percentage: z.coerce.number().min(0).default(0).optional(),
    safety_percentage: z.coerce.number().min(0).default(0).optional(),
    description: z.string().nullable().optional(),
});

export const ResponseProductSchema = RequestProductSchema.extend({
    id: z.number(),
    gender: z.enum(GENDER).default("UNISEX"),
    size: ResponseProductSizeSchema.nullable().optional(),
    unit: UnitResponseSchema.nullable(),
    product_type: TypeResponseSchema.nullable(),
    created_at: z.date(),
    updated_at: z.date(),
    deleted_at: z.date().nullable(),
    recipes: z
        .array(
            z.object({
                id: z.number(),
                quantity: z.number(),
                version: z.number(),
                is_active: z.boolean(),
                raw_material: z.object({
                    id: z.number(),
                    name: z.string(),
                    price: z.number(),
                    current_stock: z.number().optional(),
                    unit_raw_material: z.object({
                        name: z.string(),
                    }),
                }),
            }),
        )
        .optional(),
    product_inventories: z
        .array(
            z.object({
                id: z.number(),
                quantity: z.number(),
                min_stock: z.number().nullable(),
                warehouse: z.object({
                    id: z.number(),
                    name: z.string(),
                }),
            }),
        )
        .optional(),
});

export const QueryProductSchema = z.object({
    type_id: z.number().positive().optional(),
    size_id: z.number().positive().optional(),
    gender: z.enum(GENDER).optional(),

    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),

    search: z.string().optional(),
    status: z.enum(STATUS).optional(),
    sortBy: z
        .enum([
            "code",
            "name",
            "updated_at",
            "created_at",
            "gender",
            "type",
            "size",
            "lead_time",
            "distribution_percentage",
            "safety_percentage",
            "forecast_default",
        ])
        .default("forecast_default"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
    visibleColumns: z.string().optional(),
});

export type RequestProductDTO = z.infer<typeof RequestProductSchema>;
export type ResponseProductDTO = z.infer<typeof ResponseProductSchema>;
export type QueryProductDTO = z.infer<typeof QueryProductSchema>;
