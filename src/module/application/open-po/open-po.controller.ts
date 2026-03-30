import { Context } from "hono";
import { QueryOpenPoSchema, RequestUpdateOpenPoSchema } from "./open-po.schema.js";
import { OpenPoService } from "./open-po.service.js";
import { ApiResponse } from "../../../lib/api.response.js";

export class OpenPoController {
    static async list(c: Context) {
        const query = c.req.query();
        const validQuery = QueryOpenPoSchema.parse(query);
        const result = await OpenPoService.list(validQuery);
        return ApiResponse.sendSuccess(c, result);
    }

    static async update(c: Context) {
        const id = Number(c.req.param("id"));
        const body = await c.req.json();
        const validBody = RequestUpdateOpenPoSchema.parse(body);
        const result = await OpenPoService.update(id, validBody);
        return ApiResponse.sendSuccess(c, result);
    }

    static async summary(c: Context) {
        const query = c.req.query();
        const validQuery = QueryOpenPoSchema.parse(query);
        const result = await OpenPoService.summaryBySupplier(validQuery);
        return ApiResponse.sendSuccess(c, result);
    }

    static async export(c: Context) {
        const query = c.req.query();
        const validQuery = QueryOpenPoSchema.parse(query);
        const buffer = await OpenPoService.export(validQuery);

        c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        c.header("Content-Disposition", "attachment; filename=Tracking_PO_Open.xlsx");

        return c.body(buffer as any);
    }
}
