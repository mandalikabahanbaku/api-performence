import z from "zod";

export const QueryBOMSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(1000).default(25).optional(),
    search: z.string().optional(),
    sortBy: z.enum(["product_name", "material_name", "quantity"]).default("product_name").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc").optional(),
    forecast_months: z.coerce.number().int().min(1).max(12).default(3).optional(),
});

export type QueryBOMDTO = z.infer<typeof QueryBOMSchema>;

export type ResponseBOMDTO = {
    id: number;
    material: {
        id: number;
        barcode: string | null;
        name: string;
        quantity: number;
        uom: string;
    };
    needs_to_buy: Array<{
        period: string;
        month: number;
        year: number;
        value: number;
    }>;
    safety_stock_x_bom: number;
    need_produce_x_bom: Array<{
        period: string;
        month: number;
        year: number;
        value: number;
    }>;
};

export type ResponseGroupedBOMDTO = {
    product: {
        id: number;
        code: string;
        name: string;
        type: string;
        gender: string;
        size: string;
        uom: string;
    };
    sales_history: Array<{
        period: string;
        month: number;
        year: number;
        value: number;
    }>;
    forecast: Array<{
        period: string;
        month: number;
        year: number;
        value: number;
    }>;
    safety_stock: number;
    need_produce: Array<{
        period: string;
        month: number;
        year: number;
        value: number;
    }>;
    recipe_version: number;
    items: ResponseBOMDTO[];
};

export type ResponseMaterialBOMDetailDTO = {
    material: {
        id: number;
        barcode: string;
        name: string;
        price: number;
        category: string;
        supplier: string;
        supplier_country: string;
        source: "LOCAL" | "IMPORT";
        unit: string;
    };
    inventory: {
        current_stock: number;
        stock_gap: number;
        min_stock: number;
    };
    summary: {
        total_requirement: number;
        is_stock_sufficient: boolean;
        affected_products_count: number;
    };
    periods: Array<{
        key: string;
        month: number;
        year: number;
    }>;
    details: Array<{
        product_id: number;
        product_code: string;
        product_name: string;
        product_type: string;
        recipe_version: number;
        monthly_data: Record<string, number>;
        sales_history: Array<{
            period: string;
            month: number;
            year: number;
            value: number;
        }>;
        exploded_at: Date;
    }>;
};

export type ResponseBOMListDTO = {
    data: ResponseGroupedBOMDTO[];
    len: number;
};
