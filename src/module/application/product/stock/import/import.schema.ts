import z from "zod";

export const ProductStockImportRowSchema = z.object({
    "PRODUCT CODE": z.string().min(1),
    "CURRENT STOCK": z.coerce.number().default(0),
});

export type ProductStockImportRow = z.infer<typeof ProductStockImportRowSchema>;
export type ProductStockImportPreviewDTO = {
    code: string;
    product_id: number;
    name: string;
    size: string;
    type: string;
    amount: number;
    errors: string[];
};

export type ResponseProductStockImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};

export const RequestProductStockImportSchema = z.object({
    import_id: z.string(),
    warehouse_id: z.number().positive(),
    month: z.number().min(1).max(12).optional(),
    year: z.number().min(2000).max(2100).optional(),
});

export type RequestProductStockImportDTO = z.infer<typeof RequestProductStockImportSchema>;
