import { Context } from "hono";
import { QueryRawMaterialStockDTO } from "./rawmat.stock.schema.js";
import { RawMaterialStockService } from "./rawmat.stock.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";

export class RawMaterialStockController {
    static async listRawMaterialStock(c: Context) {
        const query = c.req.query();
        const params: QueryRawMaterialStockDTO = {
            page: query.page ? Number(query.page) : undefined,
            take: query.take ? Number(query.take) : undefined,
            search: query.search,
            sortBy: query.sortBy as QueryRawMaterialStockDTO["sortBy"],
            sortOrder: query.sortOrder as QueryRawMaterialStockDTO["sortOrder"],
            category_id: query.category_id ? Number(query.category_id) : undefined,
            supplier_id: query.supplier_id ? Number(query.supplier_id) : undefined,
            month: query.month ? Number(query.month) : undefined,
            year: query.year ? Number(query.year) : undefined,
        };

        const result = await RawMaterialStockService.listRawMaterialStock(params);

        return ApiResponse.sendSuccess(c, { data: result.data, len: result.len }, 200, {
            ...params,
            month: result.month,
            year: result.year,
        });
    }

    static async listWarehouses(c: Context) {
        const result = await RawMaterialStockService.listWarehouses();
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
