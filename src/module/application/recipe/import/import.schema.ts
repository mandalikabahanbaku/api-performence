import z from "zod";

const sanitizeNumber = (val: unknown) => {
    if (val === "" || val === null || val === undefined) return 0;
    if (typeof val === "string") {
        let cleaned = val.replace(/,/g, ".");
        cleaned = cleaned.replace(/[^\d.-]/g, "");
        return cleaned === "" ? 0 : Number(cleaned);
    }
    return Number(val);
};

export const RecipeImportRowSchema = z.object({
    "PRODUCT CODE": z.string().min(1),
    "MATERIAL CODE": z.string().min(1),
    QUANTITY: z.preprocess(sanitizeNumber, z.coerce.number()),
});

export type RecipeImportRow = z.infer<typeof RecipeImportRowSchema>;
export type RecipeImportPreviewDTO = {
    product_id: number | null;
    raw_mat_id: number | null;
    product_code: string;
    product_name: string;
    product_type: string;
    material_code: string;
    material_name: string;
    product_size: string;
    qty: number | string;

    errors: string[];
};

export type ResponseRecipeImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
