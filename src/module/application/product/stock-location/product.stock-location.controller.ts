import { Context } from "hono";
import { QueryStockLocationSchema } from "./product.stock-location.schema.js";
import { ProductStockLocationService } from "./product.stock-location.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";

export class ProductStockLocationController {
    /**
     * List summary stocks across ALL locations (Outlets + Warehouses)
     */
    static async listStockLocation(c: Context) {
        const query = QueryStockLocationSchema.parse(c.req.query());
        const result = await ProductStockLocationService.listStockLocation(query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    /**
     * Get list of all potential locations
     */
    static async listLocations(c: Context) {
        const result = await ProductStockLocationService.listAllLocations();
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
