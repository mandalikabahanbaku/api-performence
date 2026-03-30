import { Context } from "hono";
import { SupplierService } from "./supplier.service.js";
import { QuerySupplierDTO } from "./supplier.schema.js";
import { ApiResponse } from "../../../../lib/api.response.js";

export class SupplierController {
    static async create(c: Context) {
        const body = c.get("body");
        const result = await SupplierService.create(body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async update(c: Context) {
        const body = c.get("body");
        const id = c.req.param("id");

        const result = await SupplierService.update(Number(id), body);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));

        const result = await SupplierService.detail(id);

        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async delete(c: Context) {
        const id = Number(c.req.param("id"));

        await SupplierService.delete(id);

        return ApiResponse.sendSuccess(c, undefined, 201);
    }

    static async list(c: Context) {
        const query = c.req.query();

        const params: QuerySupplierDTO = {
            page: query.page ? Number(query.page) : undefined,
            take: query.take ? Number(query.take) : undefined,
            sortBy: query.sortBy as QuerySupplierDTO["sortBy"],
            sortOrder: query.sortOrder as "asc" | "desc",
            search: query.search,
        };

        const result = await SupplierService.list(params);

        return ApiResponse.sendSuccess(c, result, 200, params);
    }
}
