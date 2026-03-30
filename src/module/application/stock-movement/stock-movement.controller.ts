import { Context } from "hono";
import { StockMovementService } from "./stock-movement.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { QueryStockMovementSchema } from "./stock-movement.schema.js";

export class StockMovementController {
    static async list(c: Context) {
        const query = QueryStockMovementSchema.parse(c.req.query());
        const result = await StockMovementService.list(query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        const result = await StockMovementService.detail(Number(id));
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
