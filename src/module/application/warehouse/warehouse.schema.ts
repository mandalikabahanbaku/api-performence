import z from "zod";

import { WarehouseType } from "../../../generated/prisma/enums.js";

const RequestWarehouseAddressSchema = z.object({
    street: z
        .string("Jalan tidak boleh kosong")
        .max(200, "Jalan tidak boleh lebih dari 200 karakter"),
    district: z.string("Kecamatan tidak boleh kosong"),
    sub_district: z.string("Kelurahan tidak boleh kosong"),
    city: z.string("Kota tidak boleh kosong"),
    province: z.string("Provinsi tidak boleh kosong"),
    country: z.string().max(100),
    postal_code: z.string().max(6, "Kode Pos tidak boleh lebih dari 6 karakter"),
    notes: z.string().max(200, "Catatan tidak boleh lebih dari 200 karakter").nullable(),
    url_google_maps: z.url().max(200, "Url gmaps tidak boleh lebih dari 200 karakter").nullable(),
});

const ResponseWarehouseAddressSchema = RequestWarehouseAddressSchema.extend({
    created_at: z.date(),
    updated_at: z.date(),
});

export const RequestWarehouseSchema = z.object({
    code: z.string().min(1, "Kode gudang tidak boleh kosong").max(50, "Maksimal 50 karakter"),
    name: z.string(),
    type: z.enum(WarehouseType),
    warehouse_address: RequestWarehouseAddressSchema.optional(),
});

export const ResponseWarehouseSchema = RequestWarehouseSchema.pick({
    code: true,
    name: true,
    type: true,
}).extend({
    warehouse_address: ResponseWarehouseAddressSchema.optional().nullable(),
    id: z.number(),
    created_at: z.date(),
    updated_at: z.date(),
    deleted_at: z.date().nullable(),
});

export const QueryWarehouseSchema = z.object({
    page: z.number().int().positive().default(1).optional(),
    type: z.enum(WarehouseType).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),
    search: z.string().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).optional(),
    sortBy: z.enum(["name", "created_at", "updated_at"]).default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type RequestWarehouseDTO = z.input<typeof RequestWarehouseSchema>;
export type ResponseWarehouseDTO = z.output<typeof ResponseWarehouseSchema>;
export type QueryWarehouseDTO = z.infer<typeof QueryWarehouseSchema>;
