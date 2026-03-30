import type { Context } from "hono";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { CreateLogger } from "../../log/log.service.js";
import type { CreateLoggingActivityDTO } from "../../log/log.schema.js";
import { ForecastPercentageService } from "./percentages.service.js";
import { QueryForecastPercentageDTO } from "./percentages.schema.js";

const Table = "ForecastPercentage";

export class ForecastPercentageController {
    static async create(c: Context) {
        const body = c.get("body");
        const session = c.get("session");

        const result = await ForecastPercentageService.create(body);

        await CreateLogger({
            activity: "CREATE",
            description: `${Table} ${result.month}/${result.year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async createMany(c: Context) {
        const body = c.get("body");
        const session = c.get("session");

        const result = await ForecastPercentageService.createMany(body);

        await CreateLogger({
            activity: "CREATE",
            description: `${Table} Bulk: ${result.count} item(s)`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async list(c: Context) {
        const { year, page, take } = c.req.query();

        const params: QueryForecastPercentageDTO = {
            year: year ? Number(year) : undefined,
            page: page ? Number(page) : undefined,
            take: take ? Number(take) : undefined,
        };

        const result = await ForecastPercentageService.list(params);
        return ApiResponse.sendSuccess(c, result, 200, params);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const result = await ForecastPercentageService.detail(Number(id));
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async update(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const body = c.get("body");
        const session = c.get("session");

        const result = await ForecastPercentageService.update(Number(id), body);

        await CreateLogger({
            activity: "UPDATE",
            description: `${Table} ${result.month}/${result.year}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async destroy(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const session = c.get("session");

        await ForecastPercentageService.destroy(Number(id));

        await CreateLogger({
            activity: "DELETE",
            description: `${Table} id: ${id}`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, null, 200);
    }

    static async destroyMany(c: Context) {
        const body = c.get("body") as { ids: number[] };
        const session = c.get("session");

        const result = await ForecastPercentageService.destroyMany(body.ids);

        await CreateLogger({
            activity: "DELETE",
            description: `${Table} Bulk: ${result.count} item(s)`,
            email: session.email,
        } satisfies CreateLoggingActivityDTO);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
