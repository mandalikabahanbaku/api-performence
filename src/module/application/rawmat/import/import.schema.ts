import z from "zod";
const sanitizeNumber = (val: unknown) => {
    if (val === "" || val === null || val === undefined) return 0;
    if (typeof val === "string") {
        const cleaned = val.replace(/[^\d]/g, "");
        return cleaned === "" ? 0 : Number(cleaned);
    }
    return Number(val);
};

const sanitizeString = (val: unknown) => {
    if (val === null || val === undefined || val === "") return undefined;
    return String(val);
};

export const RawmatImportRowSchema = z.object({
    BARCODE: z.string().min(1, "Barcode wajib diisi"),
    "MATERIAL NAME": z.any(),
    CATEGORY: z.string().min(1, "Kategori wajib diisi"),
    UOM: z.preprocess(sanitizeString, z.string().optional()),
    MOQ: z.preprocess(sanitizeNumber, z.coerce.number().optional()),
    "MIN STOK": z.preprocess(sanitizeNumber, z.coerce.number().optional()),
    "LEAD TIME": z.preprocess(sanitizeNumber, z.coerce.number().optional()),
    SUPPLIER: z.preprocess(sanitizeString, z.string().optional()),
    "LOCAL/IMPORT": z.preprocess(sanitizeString, z.string().optional()),
    COUNTRY: z.preprocess(sanitizeString, z.string().optional()),
    PRICE: z.preprocess(sanitizeNumber, z.coerce.number().optional()),
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
    source: "LOCAL" | "IMPORT";
    lead_time: number;
    errors: string[];
};

export type ResponseRawmatImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
