import { Context } from "hono";
import { OutletService } from "./outlet.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { BulkDeleteSchema, BulkStatusSchema, QueryOutletSchema } from "./outlet.schema.js";

export class OutletController {
    static async create(c: Context) {
        const body = c.get("body");
        const result = await OutletService.create(body);
        return ApiResponse.sendSuccess(
            c,
            { id: result.id, name: result.name, code: result.code },
            201,
        );
    }

    static async update(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body");
        const result = await OutletService.update(id, body);
        return ApiResponse.sendSuccess(
            c,
            { id: result.id, name: result.name, code: result.code },
            200,
        );
    }

    static async toggleStatus(c: Context) {
        const id = Number(c.req.param("id"));
        const result = await OutletService.toggleStatus(id);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async list(c: Context) {
        const query = QueryOutletSchema.parse(c.req.query());
        const result = await OutletService.list(query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));
        const result = await OutletService.detail(id);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async clean(c: Context) {
        const result = await OutletService.clean();
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async bulkStatus(c: Context) {
        const body = c.get("body");
        const { ids, status } = BulkStatusSchema.parse(body);
        const result = await OutletService.bulkStatus(ids, status);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async bulkDelete(c: Context) {
        const body = c.get("body");
        const { ids } = BulkDeleteSchema.parse(body);
        const result = await OutletService.bulkDelete(ids);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
