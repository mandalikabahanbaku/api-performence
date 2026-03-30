import { Context } from "hono";
import { TypeService } from "./type.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { QueryTypeDTO } from "./type.schema.js";

export class TypeController {
    static async create(c: Context) {
        const body = c.get("body");
        const result = await TypeService.create(body);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async list(c: Context) {
        const { search, page, take } = c.req.query();

        const query: QueryTypeDTO = {
            search,
            page: page ? Number(page) : undefined,
            take: take ? Number(take) : undefined,
        };

        const result = await TypeService.list(query);
        return ApiResponse.sendSuccess(c, result, 200, query);
    }

    static async update(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "ID wajib dilampirkan");

        const body = c.get("body");
        const result = await TypeService.update(Number(id), body);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async delete(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "ID wajib dilampirkan");

        await TypeService.delete(Number(id));
        return ApiResponse.sendSuccess(c, {}, 200);
    }
}
