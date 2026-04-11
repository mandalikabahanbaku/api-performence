import { z } from "zod";
import { ReturnStatus, TransferLocationType } from "../../../../generated/prisma/enums.js";

export const RequestReturnItemSchema = z.object({
    product_id: z.coerce.number({ error: "ID Produk harus berupa angka" }),
    quantity: z.coerce.number().min(0.01, "Kuantitas minimal 0.01"),
    notes: z.string().optional(),
});

export const RequestReturnSchema = z.object({
    from_type: z.nativeEnum(TransferLocationType),
    from_warehouse_id: z.coerce.number().optional().nullable(),
    from_outlet_id: z.coerce.number().optional().nullable(),
    to_type: z.nativeEnum(TransferLocationType).default(TransferLocationType.WAREHOUSE),
    to_warehouse_id: z.coerce.number({ error: "Gudang tujuan harus dipilih" }),
    notes: z.string().optional(),
    items: z.array(RequestReturnItemSchema).min(1, "Minimal harus ada 1 item"),
});

export const UpdateReturnStatusSchema = z.object({
    status: z.nativeEnum(ReturnStatus),
    notes: z.string().optional(),
});

export const QueryReturnSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    search: z.string().optional(),
    status: z.nativeEnum(ReturnStatus).optional(),
    from_warehouse_id: z.coerce.number().optional(),
    from_outlet_id: z.coerce.number().optional(),
    to_warehouse_id: z.coerce.number().optional(),
});

export type RequestReturnDTO = z.infer<typeof RequestReturnSchema>;
export type UpdateReturnStatusDTO = z.infer<typeof UpdateReturnStatusSchema>;
export type QueryReturnDTO = z.infer<typeof QueryReturnSchema>;
