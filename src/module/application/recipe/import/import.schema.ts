import z from "zod";

export const RecipeImportRowSchema = z.object({
    "PRODUCT CODE": z.string().min(1),
    "MATERIAL CODE": z.string().min(1),
    QUANTITY: z.coerce.number(),
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
