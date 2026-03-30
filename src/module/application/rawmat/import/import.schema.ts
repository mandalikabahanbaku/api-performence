import z from "zod";
export const RawmatImportRowSchema = z.object({
    BARCODE: z.string().min(1, "Barcode wajib diisi"),
    "MATERIAL NAME": z.any(),
    CATEGORY: z.string().min(1, "Kategori wajib diisi"),
    UOM: z.coerce.string().optional(),
    MOQ: z.coerce.number().optional(),
    "MIN STOK": z.coerce.number().optional(),
    "LEAD TIME": z.coerce.number().optional(),
    SUPPLIER: z.coerce.string().optional(),
    "LOCAL/IMPORT": z.coerce.string().optional(),
    PRICE: z.coerce.number().optional(),
});

export type RawmatImportRow = z.infer<typeof RawmatImportRowSchema>;
export type RawmatImportPreviewDTO = {
    barcode: string;
    name: string;
    price: number | null;
    min_buy: number | null;
    min_stock: number | null;
    unit: string;
    category: string;
    supplier: string;
    country: string;
    lead_time: number;
    errors: string[];
};

export type ResponseRawmatImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
