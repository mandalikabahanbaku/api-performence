import { Context } from "hono";
import { RawMatCategoryService } from "./category.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { QueryRawMatCategoryDTO } from "./category.schema.js";

export class RawMatCategoryController {
    static async create(c: Context) {
        const body = c.get("body");

        const result = await RawMatCategoryService.create(body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async update(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body");

        const result = await RawMatCategoryService.update(id, body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));

        const result = await RawMatCategoryService.detail(id);

        return ApiResponse.sendSuccess(c, result);
    }

    static async changeStatus(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body");

        const result = await RawMatCategoryService.changeStatus(id, body.status);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async list(c: Context) {
        const { page, take, search, status, sortBy, sortOrder } = c.req.query();

        const params: QueryRawMatCategoryDTO = {
            page: page ? Number(page) : undefined,
            take: take ? Number(take) : undefined,
            search,
            status: status as QueryRawMatCategoryDTO["status"],
            sortBy: sortBy as QueryRawMatCategoryDTO["sortBy"],
            sortOrder: sortOrder as QueryRawMatCategoryDTO["sortOrder"],
        };

        const result = await RawMatCategoryService.list(params);

        return ApiResponse.sendSuccess(c, result, 200, params);
    }

    static async delete(c: Context) {
        const id = Number(c.req.param("id"));

        await RawMatCategoryService.delete(id);

        return ApiResponse.sendSuccess(c, undefined, 201);
    }
}
