import { z } from "zod";

export const QueryConsolidationSchema = z.object({
    page: z.coerce.number().min(1).optional().default(1),
    take: z.coerce.number().min(1).optional().default(25),
    search: z.string().optional(),
    month: z.coerce.number().min(1).max(12).optional(),
    year: z.coerce.number().min(2000).optional(),
    supplier_id: z.coerce.number().optional(),
    sortBy: z.string().optional(),
    order: z.enum(["asc", "desc"]).optional(),
    visibleColumns: z.string().optional(),
    columnOrder: z.string().optional(),
});

export type QueryConsolidationDTO = z.infer<typeof QueryConsolidationSchema>;

export const ResponseConsolidationSchema = z.object({
    id: z.number(),
    material_id: z.number(),
    barcode: z.string().nullable(),
    material_name: z.string(),
    supplier_name: z.string().nullable(),
    quantity: z.number(),
    uom: z.string(),
    price: z.number(),
    moq: z.number().nullable(),
    pic_id: z.string().nullable(),
    created_at: z.date(),
});

export type ResponseConsolidationDTO = z.infer<typeof ResponseConsolidationSchema>;
