import z from "zod";
import { MaterialType } from "../../../generated/prisma/enums.js";

export const RequestRawMaterialSchema = z.object({
    barcode: z
        .string({ error: "Barcode tidak valid" })
        .max(50, "Barcode material tidak boleh lebih dari 50 karakter")
        .nullable()
        .optional(),
    name: z
        .string({ error: "Nama material tidak boleh kosong" })
        .max(255, "Nama material tidak boleh lebih dari 255 karakter"),
    price: z.number(),
    min_buy: z.number().nullable().optional(),
    min_stock: z.number().nullable().optional(),
    lead_time: z.number().int().positive().nullable().optional(),
    type: z.enum(MaterialType).nullable().optional(),
    source: z.enum(["LOCAL", "IMPORT"]).default("LOCAL").optional(),
    supplier_id: z.number().nullable().optional(),

    raw_mat_category: z.string().optional(),
    unit: z.string(),
});

export const ResponseRawMaterialSchema = RequestRawMaterialSchema.omit({
    supplier_id: true,
    unit: true,
    raw_mat_category: true,
}).extend({
    id: z.number(),
    source: z.enum(["LOCAL", "IMPORT"]),
    current_stock: z.number().optional(),
    supplier: z
        .object({
            id: z.number(),
            name: z.string(),
            country: z.string(),
        })
        .optional(),
    raw_mat_category: z
        .object({
            id: z.number(),
            name: z.string(),
            slug: z.string(),
        })
        .optional(),
    unit_raw_material: z.object({
        id: z.number(),
        name: z.string(),
    }),
    created_at: z.date(),
    updated_at: z.date().nullable(),
    deleted_at: z.date().nullable().optional(),
});

export const QueryRawMaterialSchema = z.object({
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),
    status: z.enum(["actived", "deleted"]).default("actived"),
    type: z.enum(MaterialType).optional(),
    search: z.string().optional(),
    sortBy: z
        .enum([
            "barcode",
            "name",
            "updated_at",
            "current_stock",
            "price",
            "created_at",
            "category",
            "supplier",
        ])
        .default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),

    category_id: z.coerce.number().optional(),
    supplier_id: z.coerce.number().optional(),
    unit_id: z.coerce.number().optional(),
    visibleColumns: z.string().optional(),
});

export type QueryRawMaterialDTO = z.infer<typeof QueryRawMaterialSchema>;
export type RequestRawMaterialDTO = z.input<typeof RequestRawMaterialSchema>;
export type ResponseRawMaterialDTO = z.output<typeof ResponseRawMaterialSchema>;

export const BulkStatusRawMaterialSchema = z.object({
    ids: z.array(z.number()),
    status: z.enum(["ACTIVE", "DELETE"]),
});

export type BulkStatusRawMaterialDTO = z.infer<typeof BulkStatusRawMaterialSchema>;
