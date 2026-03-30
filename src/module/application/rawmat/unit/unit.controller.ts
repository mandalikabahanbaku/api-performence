import { Context } from "hono";

import { UnitRawMaterialService } from "./unit.service.js";
import { QueryRawMaterialUnitDTO } from "./unit.schema.js";
import { ApiResponse } from "../../../../lib/api.response.js";

export class UnitRawMaterialController {
    static async create(c: Context) {
        const body = c.get("body");

        const result = await UnitRawMaterialService.create(body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async update(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body");

        const result = await UnitRawMaterialService.update(id, body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));

        const result = await UnitRawMaterialService.detail(id);

        return ApiResponse.sendSuccess(c, result);
    }

    static async list(c: Context) {
        const { page, take, search, sortBy, sortOrder } = c.req.query();

        const params: QueryRawMaterialUnitDTO = {
            page: page ? Number(page) : undefined,
            take: take ? Number(take) : undefined,
            search,
            sortBy: sortBy as QueryRawMaterialUnitDTO["sortBy"],
            sortOrder: sortOrder as QueryRawMaterialUnitDTO["sortOrder"],
        };

        const result = await UnitRawMaterialService.list(params);

        return ApiResponse.sendSuccess(c, result, 200, params);
    }

    static async delete(c: Context) {
        const id = Number(c.req.param("id"));

        await UnitRawMaterialService.delete(id);

        return ApiResponse.sendSuccess(c, undefined, 201);
    }
}
