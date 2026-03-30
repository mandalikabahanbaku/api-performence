import { z } from "zod";
import { TransferLocationType, TransferStatus } from "../../../generated/prisma/enums.js";

export const CreateStockTransferItemSchema = z.object({
    product_id: z.number(),
    quantity_requested: z.number().min(0.01),
    notes: z.string().optional(),
});

export const RequestStockTransferSchema = z
    .object({
        barcode: z.string().min(3).max(20),
        from_type: z.enum(TransferLocationType),
        from_warehouse_id: z.number().optional(),
        from_outlet_id: z.number().optional(),
        to_type: z.enum(TransferLocationType),
        to_warehouse_id: z.number().optional(),
        to_outlet_id: z.number().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
            product_id: z.number(),
            quantity_requested: z.number().min(0.01),
            notes: z.string().optional(),
        })).min(1),
    })
    .refine((data) => {
        if (data.from_type === TransferLocationType.WAREHOUSE && !data.from_warehouse_id)
            return false;
        if (data.from_type === TransferLocationType.OUTLET && !data.from_outlet_id) return false;
        if (data.to_type === TransferLocationType.WAREHOUSE && !data.to_warehouse_id) return false;
        if (data.to_type === TransferLocationType.OUTLET && !data.to_outlet_id) return false;
        return true;
    }, "Location ID must match Location Type");

export type RequestStockTransferDTO = z.infer<typeof RequestStockTransferSchema>;

export const RequestUpdateStockTransferStatusSchema = z.object({
    status: z.enum(TransferStatus),
    notes: z.string().optional(),
    items: z.array(z.object({
        id: z.coerce.number(), // StockTransferItem ID
        quantity_packed: z.coerce.number().optional(),
        quantity_received: z.coerce.number().optional(),
        quantity_fulfilled: z.coerce.number().min(0).optional(),
        quantity_missing: z.coerce.number().min(0).optional(),
        quantity_rejected: z.coerce.number().min(0).optional(),
    })).optional(),
});

export type RequestUpdateStockTransferStatusDTO = z.infer<typeof RequestUpdateStockTransferStatusSchema>;

export const QueryStockTransferSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    sortBy: z.enum(["created_at", "transfer_number"]).default("created_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
    search: z.string().optional(),
    status: z.enum(TransferStatus).optional(),
    from_type: z.enum(TransferLocationType).optional(),
    to_type: z.enum(TransferLocationType).optional(),
});

export type QueryStockTransferDTO = z.infer<typeof QueryStockTransferSchema>;

export const ResponseStockTransferSchema = z.object({
    id: z.number(),
    transfer_number: z.string(),
    barcode: z.string(),
    from_type: z.enum(TransferLocationType),
    from_warehouse_id: z.number().nullable(),
    from_outlet_id: z.number().nullable(),
    to_type: z.enum(TransferLocationType),
    to_warehouse_id: z.number().nullable(),
    to_outlet_id: z.number().nullable(),
    status: z.enum(TransferStatus),
    notes: z.string().nullable(),
    shipped_at: z.coerce.date().nullable(),
    received_at: z.coerce.date().nullable(),
    fulfilled_at: z.coerce.date().nullable(),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date().nullable(),
    items: z.array(z.any()),
});

export type ResponseStockTransferDTO = z.infer<typeof ResponseStockTransferSchema>;
