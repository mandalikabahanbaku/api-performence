import { Context } from "hono";
import { UnitService } from "./unit.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { QueryUnitDTO } from "./unit.schema.js";

export class UnitController {
    static async create(c: Context) {
        const body = c.get("body");
        const result = await UnitService.create(body);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async list(c: Context) {
        const { search, page, take } = c.req.query();

        const query: QueryUnitDTO = {
            search,
            page: page ? Number(page) : undefined,
            take: take ? Number(take) : undefined,
        };

        const result = await UnitService.list(query);
        return ApiResponse.sendSuccess(c, result, 200, query);
    }

    static async update(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "ID wajib dilampirkan");

        const body = c.get("body");
        const result = await UnitService.update(Number(id), body);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async delete(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "ID wajib dilampirkan");

        await UnitService.delete(Number(id));
        return ApiResponse.sendSuccess(c, {}, 200);
    }
}
