import { z } from "zod";

export const QueryOpenPoSchema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    take: z.coerce.number().min(1).optional().default(25),
    search: z.string().optional(),
    status: z.string().optional().default("OPEN"),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2000).optional(),
    supplier_id: z.coerce.number().optional(),
});

export type QueryOpenPoDTO = z.infer<typeof QueryOpenPoSchema>;

export const RequestUpdateOpenPoSchema = z.object({
    po_number: z.string().optional(),
    expected_arrival: z.string().optional().nullable(),
    status: z.string().optional(),
});

export type RequestUpdateOpenPoDTO = z.infer<typeof RequestUpdateOpenPoSchema>;

export const ResponseOpenPoSchema = z.object({
    id: z.number(),
    raw_material_id: z.number(),
    barcode: z.string().nullable(),
    material_name: z.string(),
    po_number: z.string().nullable(),
    quantity: z.number(),
    order_date: z.date(),
    expected_arrival: z.date().nullable(),
    status: z.string(),
});

export type ResponseOpenPoDTO = z.infer<typeof ResponseOpenPoSchema>;
