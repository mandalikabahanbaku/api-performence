import { Context } from "hono";
import { ApiResponse } from "../../../lib/api.response.js";
import { BOMService } from "./bom.service.js";
import { QueryBOMSchema } from "./bom.schema.js";

export class BOMController {
    static async list(c: Context) {
        const query = c.req.query();
        const parsed = QueryBOMSchema.parse(query);
        const result = await BOMService.list(parsed);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const idParam = c.req.param("id");
        const query = c.req.query();
        if (!idParam) return c.json({ status: "error", message: "ID is required" }, 400);

        const id = /^\d+$/.test(idParam) ? Number(idParam) : idParam;
        const result = await BOMService.detail(id, query);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
