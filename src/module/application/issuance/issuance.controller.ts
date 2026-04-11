import { Context } from "hono";
import { IssuanceService } from "./issuance.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { QueryIssuanceDTO, QueryIssuanceRekapDTO } from "./issuance.schema.js";

export class IssuanceController {
    static async save(c: Context) {
        const body = c.get("body");
        await IssuanceService.save(body);
        return ApiResponse.sendSuccess(c, undefined, 200);
    }

    static async list(c: Context) {
        const {
            product_id,
            product_id_2,
            sortBy,
            sortOrder,
            gender,
            horizon,
            size,
            variant,
            search,
            page,
            take,
            type,
        } = c.req.query();

        const params: QueryIssuanceDTO = {
            sortBy: (sortBy as QueryIssuanceDTO["sortBy"]) || "name",
            sortOrder: (sortOrder as QueryIssuanceDTO["sortOrder"]) || "desc",
            gender: (gender as QueryIssuanceDTO["gender"]) || undefined,
            variant: variant || undefined,
            size: size ? Number(size) : undefined,
            horizon: horizon ? Number(horizon) : undefined,
            product_id: product_id ? Number(product_id) : undefined,
            product_id_2: product_id_2 ? Number(product_id_2) : undefined,
            search: search || undefined,
            page: page ? Number(page) : 1,
            take: take ? Number(take) : 10,
            type: (type as QueryIssuanceDTO["type"]) || undefined,
        };

        const result = await IssuanceService.list(params);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async detail(c: Context) {
        const product_id = c.req.param("product_id");
        const { year, month, type } = c.req.query();
        const data = await IssuanceService.detail(
            Number(product_id),
            Number(year),
            Number(month),
            type as any,
        );
        return ApiResponse.sendSuccess(c, data, 200);
    }

    static async rekap(c: Context) {
        const {
            year,
            month,
            search,
            gender,
            size,
            variant,
            page,
            take,
            sortBy,
            sortOrder,
        } = c.req.query();

        const params: QueryIssuanceRekapDTO = {
            year: year ? Number(year) : undefined,
            month: month ? Number(month) : undefined,
            search: search || undefined,
            gender: (gender as QueryIssuanceRekapDTO["gender"]) || undefined,
            size: size ? Number(size) : undefined,
            variant: variant || undefined,
            page: page ? Number(page) : 1,
            take: take ? Number(take) : 25,
            sortBy: (sortBy as QueryIssuanceRekapDTO["sortBy"]) || "name",
            sortOrder: (sortOrder as QueryIssuanceRekapDTO["sortOrder"]) || "asc",
        };

        const result = await IssuanceService.rekap(params);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
