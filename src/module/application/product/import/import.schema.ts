import z from "zod";
import { GENDER } from "../../../../generated/prisma/enums.js";

export const ProductImportRowSchema = z.object({
    "PRODUCT CODE": z.string().min(1),
    "PRODUCT NAME": z.string().min(1),
    TYPE: z.string().min(1),
    GENDER: z.string().optional().default(""),
    SIZE: z.coerce.number().int().positive(),
    UOM: z.string().min(1),
    EDAR: z.coerce.number().min(0).optional().default(0),
    SAFETY: z.coerce.number().min(0).optional().default(0),
});

export type ProductImportRow = z.infer<typeof ProductImportRowSchema>;
export type ProductImportPreviewDTO = {
    code: string;
    name: string;
    gender: GENDER;
    size: number;
    type: string | null;
    unit: string | null;
    distribution_percentage: number;
    safety_percentage: number;
    errors: string[];
};

export type ResponseProductImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
