import { z } from "zod";
import { STATUS } from "../../../../generated/prisma/enums.js";
export const RequestRawMatCategorySchema = z.object({
    name: z.string().min(2, "Category name must be at least 2 characters").max(255),
    status: z.enum(STATUS).optional(),
});

export type RequestRawMatCategoryDTO = z.infer<typeof RequestRawMatCategorySchema>;

export const UpdateRawMatCategorySchema = RequestRawMatCategorySchema.partial();

export type UpdateRawMatCategoryDTO = z.infer<typeof UpdateRawMatCategorySchema>;

export const ChangeStatusRawMatCategorySchema = z.object({
    status: z.enum(STATUS),
});

export const QueryRawMatCategorySchema = z.object({
    page: z.number().int().positive().default(1).optional(),
    take: z.number().int().positive().max(100).default(25).optional(),

    search: z.string().optional(),

    status: z.enum(STATUS).optional(),

    sortBy: z.enum(["created_at", "updated_at", "name"]).default("updated_at").optional(),

    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
});

export type QueryRawMatCategoryDTO = z.infer<typeof QueryRawMatCategorySchema>;

export const ResponseRawMatCategorySchema = z.object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    status: z.enum(STATUS),

    created_at: z.date(),
    updated_at: z.date(),
});

export type ResponseRawMatCategoryDTO = z.infer<typeof ResponseRawMatCategorySchema>;
