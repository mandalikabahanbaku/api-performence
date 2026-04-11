import { z } from "zod";

export const QueryRecomendationV2Schema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    take: z.coerce.number().min(1).optional().default(25),
    search: z.string().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2000).optional(),
    sales_months: z.coerce.number().min(0).max(12).optional().default(3),
    forecast_months: z.coerce.number().min(0).max(12).optional().default(3),
    po_months: z.coerce.number().min(0).max(12).optional().default(3),
    type: z.enum(["ffo", "lokal", "impor"]).optional(),
    sortBy: z.string().optional(),
    order: z.enum(["asc", "desc"]).optional(),
    visibleColumns: z.string().optional(),
    columnOrder: z.string().optional(),
});

export type QueryRecomendationV2DTO = z.infer<typeof QueryRecomendationV2Schema>;

export const RequestSaveWorkOrderSchema = z.object({
    raw_mat_id: z.coerce.number(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
    quantity: z.coerce.number().min(0),
    horizon: z.coerce.number().min(1).max(12).default(1),
    total_needed: z.coerce.number().optional().default(0),
    current_stock: z.coerce.number().optional().default(0),
    stock_fg_x_resep: z.coerce.number().optional().default(0),
    safety_stock_x_resep: z.coerce.number().optional().default(0),
});

export type RequestSaveWorkOrderDTO = z.infer<typeof RequestSaveWorkOrderSchema>;

export const RequestSaveOpenPoSchema = z.object({
    raw_mat_id: z.coerce.number(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
    quantity: z.coerce.number().min(0),
});

export type RequestSaveOpenPoDTO = z.infer<typeof RequestSaveOpenPoSchema>;

export const RequestBulkSaveHorizonSchema = z.object({
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
    horizon: z.coerce.number().min(1).max(12).default(3),
    type: z.enum(["ffo", "lokal", "impor"]).optional(),
});

export type RequestBulkSaveHorizonDTO = z.infer<typeof RequestBulkSaveHorizonSchema>;


export const RequestApproveWorkOrderSchema = z.object({
    id: z.coerce.number(),
});

export type RequestApproveWorkOrderDTO = z.infer<typeof RequestApproveWorkOrderSchema>;

export const ResponseRecomendationV2Schema = z.object({
    ranking: z.number(),
    material_id: z.number(),
    barcode: z.string().nullable(),
    material_name: z.string(),
    supplier_name: z.string().nullable(),
    moq: z.number(),
    lead_time: z.number().nullable(),
    uom: z.string(),
    recommendation_quantity: z.number(),
    // Base data for transparency
    current_stock: z.number(),
    open_po: z.number(),
    stock_fg_x_resep: z.number(),
    safety_stock_x_resep: z.number(),
    forecast_needed: z.number(),
    total_needed_horizon: z.number().optional(),

    // Work Order Info
    work_order_id: z.number().optional().nullable(),
    work_order_status: z.string().optional().nullable(),
    work_order_pic_id: z.string().optional().nullable(),
    work_order_quantity: z.number().optional().nullable(),
    work_order_horizon: z.number().optional().nullable(),

    sales: z.array(z.object({
        month: z.number(),
        year: z.number(),
        key: z.string(),
        quantity: z.number()
    })).optional(),
    needs: z.array(z.object({
        month: z.number(),
        year: z.number(),
        key: z.string(),
        quantity: z.number(),
        override_needs: z.number().nullable().optional()
    })).optional(),
    open_pos: z.array(z.object({
        month: z.number(),
        year: z.number(),
        key: z.string(),
        quantity: z.number()
    })).optional(),
});


export const RequestUpdateMoqSchema = z.object({
    material_id: z.coerce.number(),
    moq: z.coerce.number().min(0),
});

export type RequestUpdateMoqDTO = z.infer<typeof RequestUpdateMoqSchema>;

export type ResponseRecomendationV2DTO = z.infer<typeof ResponseRecomendationV2Schema>;

export const RequestSaveNeedOverrideSchema = z.object({
    raw_material_id: z.coerce.number(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
    quantity: z.coerce.number().min(0),
});

export type RequestSaveNeedOverrideDTO = z.infer<typeof RequestSaveNeedOverrideSchema>;

export const RequestDeleteNeedOverrideSchema = z.object({
    raw_material_id: z.coerce.number(),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
});

export type RequestDeleteNeedOverrideDTO = z.infer<typeof RequestDeleteNeedOverrideSchema>;
