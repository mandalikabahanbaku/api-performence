import z from "zod";

// ─── Request Schema ────────────────────────────────────────────────────────
export const RequestSizeSchema = z.object({
    size: z.coerce
        .number("Ukuran harus berupa angka")
        .int("Ukuran harus bilangan bulat")
        .min(1, "Ukuran minimal 1"),
});

// ─── Query Schema ──────────────────────────────────────────────────────────
export const QuerySizeSchema = z.object({
    search: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(25).optional(),
});

// ─── Response Schema ───────────────────────────────────────────────────────
export const ResponseSizeSchema = z.object({
    id: z.number(),
    size: z.number(),
});

// Backward-compatible alias digunakan di product.schema.ts
export const ResponseProductSizeSchema = ResponseSizeSchema;

// ─── DTOs ─────────────────────────────────────────────────────────────────
export type RequestSizeDTO = z.infer<typeof RequestSizeSchema>;
export type QuerySizeDTO = z.infer<typeof QuerySizeSchema>;
export type ResponseSizeDTO = z.infer<typeof ResponseSizeSchema>;

// Backward-compatible alias
export type ResponseProductSizeDTO = ResponseSizeDTO;

// Partial update DTO
export type UpdateSizeDTO = Partial<RequestSizeDTO>;
