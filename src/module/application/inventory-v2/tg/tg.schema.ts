import { z } from "zod";
import { TransferStatus } from "../../../../generated/prisma/enums.js";

export const RequestTransferGudangItemSchema = z.object({
    product_id: z.coerce.number({ error: "ID Produk harus berupa angka" }),
    quantity_requested: z.coerce.number().min(0.01, "Kuantitas permintaan minimal 0.01"),
    notes: z.string().optional(),
});

export const RequestTransferGudangSchema = z.object({
    date: z.string().min(1, "Tanggal wajib diisi").refine((v) => !isNaN(Date.parse(v)), { message: "Format tanggal tidak valid" }),
    from_warehouse_id: z.coerce.number({ error: "Gudang asal harus dipilih" }),
    to_warehouse_id: z.coerce.number({ error: "Gudang tujuan harus dipilih" }),
    notes: z.string().optional(),
    items: z.array(RequestTransferGudangItemSchema).min(1, "Minimal harus ada 1 item"),
});

export const UpdateTransferGudangStatusSchema = z.object({
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
    photos: z.array(z.string()).optional(),
});

export const ResponseTransferGudangSchema = RequestTransferGudangSchema.extend({
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
    to_warehouse: z
        .object({
            id: z.number(),
            name: z.string(),
        })
        .optional(),
});

export const QueryTransferGudangSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    sortBy: z.enum(["created_at", "transfer_number"]).default("created_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
    search: z.string().optional(),
    status: z.nativeEnum(TransferStatus).optional(),
    from_warehouse_id: z.coerce.number().optional(),
    to_warehouse_id: z.coerce.number().optional(),
});

export type RequestTransferGudangDTO = z.infer<typeof RequestTransferGudangSchema>;
export type UpdateTransferGudangStatusDTO = z.infer<typeof UpdateTransferGudangStatusSchema>;
export type ResponseTransferGudangDTO = z.infer<typeof ResponseTransferGudangSchema>;
export type QueryTransferGudangDTO = z.infer<typeof QueryTransferGudangSchema>;
