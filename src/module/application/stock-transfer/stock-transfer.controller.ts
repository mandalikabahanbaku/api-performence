import { Context } from "hono";
import { StockTransferService } from "./stock-transfer.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { 
    QueryStockTransferSchema, 
    RequestUpdateStockTransferStatusDTO 
} from "./stock-transfer.schema.js";

export class StockTransferController {
    static async create(c: Context) {
        const body = c.get("body");
        const user = c.get("user");
        const userId = user?.id || "system";
        
        const result = await StockTransferService.create(body, userId);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async updateStatus(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body") as RequestUpdateStockTransferStatusDTO;
        const user = c.get("user");
        const userId = user?.id || "system";

        const result = await StockTransferService.updateStatus(id, body, userId);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async list(c: Context) {
        const query = QueryStockTransferSchema.parse(c.req.query());
        const result = await StockTransferService.list(query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        const result = await StockTransferService.detail(Number(id));
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
