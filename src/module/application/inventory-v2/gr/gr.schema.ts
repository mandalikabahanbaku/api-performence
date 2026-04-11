import { z } from "zod";
import { GoodsReceiptStatus, GoodsReceiptType } from "../../../../generated/prisma/enums.js";

export const RequestGoodsReceiptItemSchema = z.object({
    product_id: z.coerce.number({ error: "ID Produk harus berupa angka" }),
    quantity_planned: z.coerce.number().min(0.01, "Kuantitas rencana minimal 0.01"),
    quantity_actual: z.coerce.number().min(0.01, "Kuantitas aktual minimal 0.01"),
    notes: z.string().optional(),
});

export const RequestGoodsReceiptSchema = z.object({
    type: z.enum(GoodsReceiptType).default(GoodsReceiptType.MANUAL),
    warehouse_id: z.coerce.number({ error: "Gudang harus dipilih" }),
    date: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(RequestGoodsReceiptItemSchema).min(1, "Minimal harus ada 1 item"),
});

export const ResponseGoodsReceiptSchema = RequestGoodsReceiptSchema.extend({
    id: z.number(),
    gr_number: z.string(),
    status: z.enum(GoodsReceiptStatus),
    created_at: z.date(),
    updated_at: z.date(),
    posted_at: z.date().nullable().optional(),
    created_by: z.string(),
    warehouse: z
        .object({
            id: z.number(),
            name: z.string(),
        })
        .optional(),
    _count: z
        .object({
            items: z.number(),
        })
        .optional(),
});

export const QueryGoodsReceiptSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    sortBy: z.enum(["created_at", "gr_number"]).default("created_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
    search: z.string().optional(),
    status: z.enum(GoodsReceiptStatus).optional(),
    type: z.enum(GoodsReceiptType).optional(),
    warehouse_id: z.coerce.number().optional(),
});

export const UpdateGoodsReceiptStatusSchema = z.object({
    status: z.enum(GoodsReceiptStatus),
    notes: z.string().optional(),
});

export type RequestGoodsReceiptDTO = z.infer<typeof RequestGoodsReceiptSchema>;
export type ResponseGoodsReceiptDTO = z.infer<typeof ResponseGoodsReceiptSchema>;
export type QueryGoodsReceiptDTO = z.infer<typeof QueryGoodsReceiptSchema>;
export type UpdateGoodsReceiptStatusDTO = z.infer<typeof UpdateGoodsReceiptStatusSchema>;
