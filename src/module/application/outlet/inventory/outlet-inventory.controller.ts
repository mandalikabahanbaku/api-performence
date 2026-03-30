import { Context } from "hono";
import { QueryOutletInventorySchema } from "./outlet-inventory.schema.js";
import { OutletInventoryService } from "./outlet-inventory.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";

export class OutletInventoryController {
    static async list(c: Context) {
        const outlet_id = Number(c.req.param("id"));
        const query = QueryOutletInventorySchema.parse(c.req.query());
        const result = await OutletInventoryService.listStock(outlet_id, query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const outlet_id = Number(c.req.param("id"));
        const product_id = Number(c.req.param("product_id"));
        const result = await OutletInventoryService.getStock(outlet_id, product_id);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async init(c: Context) {
        const outlet_id = Number(c.req.param("id"));
        const body = c.get("body");
        const result = await OutletInventoryService.initProducts(outlet_id, body);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async setMinStock(c: Context) {
        const outlet_id = Number(c.req.param("id"));
        const product_id = Number(c.req.param("product_id"));
        const body = c.get("body");
        const result = await OutletInventoryService.setMinStock(outlet_id, product_id, body);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
