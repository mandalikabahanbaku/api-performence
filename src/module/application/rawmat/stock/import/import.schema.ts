import z from "zod";

const sanitizeNumber = (val: unknown) => {
    if (val === "" || val === null || val === undefined) return 0;
    if (typeof val === "string") {
        const cleaned = val.replace(/[^\d]/g, "");
        return cleaned === "" ? 0 : Number(cleaned);
    }
    return Number(val);
};

export const RawMaterialInventoryImportRowSchema = z.object({
    "MATERIAL CODE": z.string().min(1, "Kode material wajib diisi"),
    "CURRENT STOCK": z.preprocess(sanitizeNumber, z.coerce.number()),
});

export type RawMaterialInventoryImportRow = z.infer<typeof RawMaterialInventoryImportRowSchema>;

export type RawMaterialInventoryImportPreviewDTO = {
    barcode: string;
    name: string;
    category: string;
    amount: number;
    errors: string[];
};

export type ResponseRawMaterialInventoryImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
