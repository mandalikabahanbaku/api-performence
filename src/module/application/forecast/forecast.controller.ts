import type { Context } from "hono";
import { ApiResponse } from "../../../lib/api.response.js";
import { CreateLogger } from "../log/log.service.js";
import type { CreateLoggingActivityDTO } from "../log/log.schema.js";
import { ForecastService } from "./forecast.service.js";
import {
    DeleteForecastByPeriodSchema,
    FinalizeForecastSchema,
    QueryForecastSchema,
} from "./forecast.schema.js";
import { ApiError } from "../../../lib/errors/api.error.js";

const Table = "Forecast";

export class ForecastController {
    static async run(c: Context) {
        const body = c.get("body");
        const session = c.get("session");

        const result = await ForecastService.run(body);

        await CreateLogger({
            activity: "CREATE",
            description: `${Table} Run: ${result.processed_records} record(s) untuk periode ${body.start_month}/${body.start_year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async list(c: Context) {
        const query = QueryForecastSchema.parse(c.req.query());
        const result = await ForecastService.get(query);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const product_id = Number(c.req.param("product_id"));
        const { month, year } = c.req.query();
        if (!month || !year) throw new ApiError(400, "Bulan dan tahun wajib diisi");
        const result = await ForecastService.detail(product_id, Number(month), Number(year));
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async finalize(c: Context) {
        const body = FinalizeForecastSchema.parse(c.get("body"));
        const session = c.get("session");
        const result = await ForecastService.finalize(body);
        await CreateLogger({
            activity: "UPDATE",
            description: `${Table} Finalize: ${result.count} record(s) untuk periode ${body.month}/${body.year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async deleteByPeriod(c: Context) {
        const body = DeleteForecastByPeriodSchema.parse(c.get("body"));
        const session = c.get("session");
        const result = await ForecastService.deleteByPeriod(body);
        await CreateLogger({
            activity: "DELETE",
            description: `${Table} Delete Period: ${result.count} record(s) untuk periode ${body.month}/${body.year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async destroyById(c: Context) {
        const id = Number(c.req.param("id"));
        const session = c.get("session");
        await ForecastService.destroyById(id);
        await CreateLogger({
            activity: "DELETE",
            description: `${Table} Delete ID: ${id}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);
        return ApiResponse.sendSuccess(c, { id }, 200);
    }

    static async updateManual(c: Context) {
        const body = c.get("body");
        const session = c.get("session");

        const result = await ForecastService.updateManual(body);

        await CreateLogger({
            activity: "UPDATE",
            description: `${Table} Manual Update: Product ID ${body.product_id} for ${body.month}/${body.year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
