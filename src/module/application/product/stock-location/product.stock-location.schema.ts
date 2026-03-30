import { z } from "zod";

export const QueryStockLocationSchema = z.object({
    page: z.string().optional().transform(Number),
    take: z.string().optional().transform(Number),
    search: z.string().optional(),
    sortBy: z.enum(["name", "code", "type", "size", "gender", "updated_at"]).optional().default("updated_at"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    type_id: z.string().optional().transform(Number),
    gender: z.string().optional(),
});

export type QueryStockLocationDTO = z.infer<typeof QueryStockLocationSchema>;

export interface ResponseStockLocationDTO {
    code: string;
    name: string;
    type: string;
    size: number;
    gender: string;
    uom: string;
    total_stock: number;
    location_stocks: Record<string, number>; // { "Warehouse A": 10, "Outlet B": 5 }
}
