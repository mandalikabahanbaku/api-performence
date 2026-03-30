import { z } from "zod";

export const RequestSupplierSchema = z.object({
    name: z.string().max(100, "Nama supplier maksimal 100 karakter"),

    addresses: z
        .string({ error: "Alamat supplier wajib diisi" })
        .min(1, "Alamat supplier tidak boleh kosong"),

    country: z
        .string({ error: "Negara wajib diisi" })
        .max(100, "Nama negara maksimal 100 karakter"),

    phone: z
        .string({ error: "Nomor telepon wajib diisi" })
        .max(20, "Nomor telepon maksimal 20 karakter")
        .nullable()
        .optional(),
});

export const ResponseSupplierSchema = RequestSupplierSchema.extend({
    id: z.number(),
    created_at: z.date(),
    updated_at: z.date(),
});

export const QuerySupplierSchema = z.object({
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),
    search: z.string().optional(),
    sortBy: z.enum(["country", "name", "updated_at", "created_at"]).default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type RequestSupplierDTO = z.input<typeof RequestSupplierSchema>;
export type ResponseSupplierDTO = z.output<typeof ResponseSupplierSchema>;

export type QuerySupplierDTO = z.infer<typeof QuerySupplierSchema>;
