import { Context } from "hono";
import { ApiResponse } from "../../../../lib/api.response.js";
import { WarehouseSharedService } from "./warehouse.service.js";

export class WarehouseSharedController {
    static async list(c: Context) {
        const data = await WarehouseSharedService.list();
        return ApiResponse.sendSuccess(c, data, 200);
    }
}
