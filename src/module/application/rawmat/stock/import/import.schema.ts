import z from "zod";

export const RawMaterialInventoryImportRowSchema = z.object({
    "MATERIAL CODE": z.string().min(1, "Kode material wajib diisi"),
    "CURRENT STOCK": z.coerce.number(),
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
