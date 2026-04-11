import { z } from "zod";
import { TransferStatus } from "../../../../generated/prisma/enums.js";

export const RequestDeliveryOrderItemSchema = z.object({
    product_id: z.coerce.number({ error: "ID Produk harus berupa angka" }),
    quantity_requested: z.coerce.number().min(0.01, "Kuantitas permintaan minimal 0.01"),
    notes: z.string().optional(),
});

export const RequestDeliveryOrderSchema = z.object({
    date: z.string().min(1, "Tanggal wajib diisi").refine((v) => !isNaN(Date.parse(v)), { message: "Format tanggal tidak valid" }),
    from_warehouse_id: z.coerce.number({ error: "Gudang asal harus dipilih" }),
    to_outlet_id: z.coerce.number({ error: "Outlet tujuan harus dipilih" }),
    notes: z.string().optional(),
    items: z.array(RequestDeliveryOrderItemSchema).min(1, "Minimal harus ada 1 item"),
});

export const UpdateDeliveryOrderStatusSchema = z.object({
    status: z.nativeEnum(TransferStatus),
    notes: z.string().optional(),
    items: z
        .array(
            z.object({
                id: z.number(),
                quantity_packed: z.coerce.number().optional(),
                quantity_received: z.coerce.number().optional(),
                quantity_fulfilled: z.coerce.number().optional(),
                quantity_missing: z.coerce.number().optional(),
                quantity_rejected: z.coerce.number().optional(),
            }),
        )
        .optional(),
});

export const ResponseDeliveryOrderSchema = RequestDeliveryOrderSchema.extend({
    id: z.number(),
    transfer_number: z.string(),
    status: z.nativeEnum(TransferStatus),
    date: z.date().nullable().optional(),
    created_at: z.date(),
    updated_at: z.date(),
    shipped_at: z.date().nullable().optional(),
    received_at: z.date().nullable().optional(),
    fulfilled_at: z.date().nullable().optional(),
    created_by: z.string(),
    from_warehouse: z
        .object({
            id: z.number(),
            name: z.string(),
        })
        .optional(),
    to_outlet: z
        .object({
            id: z.number(),
            name: z.string(),
        })
        .optional(),
});

export const QueryDeliveryOrderSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    sortBy: z.enum(["created_at", "transfer_number"]).default("created_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
    search: z.string().optional(),
    status: z.nativeEnum(TransferStatus).optional(),
    from_warehouse_id: z.coerce.number().optional(),
    to_outlet_id: z.coerce.number().optional(),
});

export type RequestDeliveryOrderDTO = z.infer<typeof RequestDeliveryOrderSchema>;
export type UpdateDeliveryOrderStatusDTO = z.infer<typeof UpdateDeliveryOrderStatusSchema>;
export type ResponseDeliveryOrderDTO = z.infer<typeof ResponseDeliveryOrderSchema>;
export type QueryDeliveryOrderDTO = z.infer<typeof QueryDeliveryOrderSchema>;
