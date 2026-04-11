import z from "zod";
import { IssuanceType } from "../../../../generated/prisma/enums.js";

export const IssuanceImportRowSchema = z.object({
    "PRODUCT CODE": z.string().min(1),
    "TOTAL": z.preprocess(
        (val) => {
            if (val === "" || val === null || val === undefined) return 0;
            if (typeof val === "string") {
                // Strip all non-digit characters (including commas and dots)
                const cleaned = val.replace(/[^\d]/g, "");
                return cleaned === "" ? 0 : Number(cleaned);
            }
            return val;
        },
        z.coerce.number().default(0),
    ),
});

export type IssuanceImportRow = z.infer<typeof IssuanceImportRowSchema>;

export type IssuanceImportPreviewDTO = {
    code: string;
    product_name: string;
    type: string | null;
    amount: number | string;
    errors: string[];
};

export type ResponseIssuanceImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};

export const RequestIssuanceImportSchema = z.object({
    import_id: z.string(),
    month: z.number().min(1).max(12).optional(),
    year: z.number().min(1900).max(2100).optional(),
    type: z.nativeEnum(IssuanceType).default(IssuanceType.ALL),
});

export type RequestIssuanceImportDTO = z.infer<typeof RequestIssuanceImportSchema>;
export type ResponseIssuanceExportDTO = {
    code: string;
    product_name: string;
    type: string | null;
    size: string | null;
    amount: number | string;
};
