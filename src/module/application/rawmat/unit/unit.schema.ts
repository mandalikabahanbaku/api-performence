import { z } from "zod";

export const RequestRawMaterialUnitSchema = z.object({
    name: z
        .string({ error: "Nama Unit tidak boleh kosong" })
        .min(1, "Nama Unit tidak boleh kosong")
        .max(100, "Nama Unit maksimal 100 karakter"),
});

export const ResponseRawMaterialUnitSchema = RequestRawMaterialUnitSchema.extend({
    id: z.number(),
    slug: z
        .string({ error: "Slug tidak boleh kosong" })
        .min(1, "Slug tidak boleh kosong")
        .max(100, "Slug maksimal 100 karakter")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug harus lowercase, alphanumeric, dan dash (-)"),
});

export const QueryRawMaterialUnitSchema = z.object({
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),

    search: z.string().optional(),

    sortBy: z.enum(["name", "slug", "id"]).default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type RequestRawMaterialUnitDTO = z.input<typeof RequestRawMaterialUnitSchema>;
export type ResponseRawMaterialUnitDTO = z.output<typeof ResponseRawMaterialUnitSchema>;
export type QueryRawMaterialUnitDTO = z.input<typeof QueryRawMaterialUnitSchema>;
