import { Context } from "hono";
import { WarehouseService } from "./warehouse.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { STATUS } from "../../../generated/prisma/enums.js";
import { QueryWarehouseDTO } from "./warehouse.schema.js";

export class WarehouseController {
    private static parseQuery(c: Context): QueryWarehouseDTO {
        const { page, sortBy, sortOrder, take, search, type, month, year } = c.req.query();
        return {
            page: page ? Number(page) : undefined,
            search,
            sortBy: sortBy as QueryWarehouseDTO["sortBy"],
            sortOrder: sortOrder as QueryWarehouseDTO["sortOrder"],
            take: take ? Number(take) : undefined,
            type: type as QueryWarehouseDTO["type"],
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
        };
    }

    static async create(c: Context) {
        const body = c.get("body");
        const rest = await WarehouseService.create(body);
        return ApiResponse.sendSuccess(c, { name: rest.name }, 201);
    }

    static async update(c: Context) {
        const id = c.req.param("id");
        const body = c.get("body");
        const rest = await WarehouseService.update(Number(id), body);
        return ApiResponse.sendSuccess(c, { name: rest.name }, 200);
    }

    static async changeStatus(c: Context) {
        const id = c.req.param("id");
        const { status } = c.req.query();
        const rest = await WarehouseService.changeStatus(Number(id), status as STATUS);
        return ApiResponse.sendSuccess(c, { name: rest.name }, 200);
    }

    static async list(c: Context) {
        const result = await WarehouseService.list(WarehouseController.parseQuery(c));
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        const rest = await WarehouseService.detail(Number(id));
        return ApiResponse.sendSuccess(c, rest, 200);
    }

    static async deleted(c: Context) {
        const id = c.req.param("id");
        const force = c.req.query("force") === "true";
        await WarehouseService.deleted(Number(id), force);
        return ApiResponse.sendSuccess(c, undefined, 200);
    }

    static async getStock(c: Context) {
        const id = Number(c.req.param("id"));
        const product_id = Number(c.req.param("product_id"));
        const result = await WarehouseService.getStock(id, product_id);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
