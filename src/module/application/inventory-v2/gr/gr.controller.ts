import { Context } from "hono";
import { GoodsReceiptService } from "./gr.service.js";
import { QueryGoodsReceiptSchema, RequestGoodsReceiptDTO } from "./gr.schema.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { CreateLogger } from "../../log/log.service.js";
import { CreateLoggingActivityDTO } from "../../log/log.schema.js";
import { ApiError } from "../../../../lib/errors/api.error.js";

const Table = "Goods Receipt";

export class GRController {
    static async list(c: Context) {
        const query = c.req.query();
        const validated = QueryGoodsReceiptSchema.parse(query);
        const result = await GoodsReceiptService.list(validated);
        return ApiResponse.sendSuccess(c, result, 200, validated);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");
        const result = await GoodsReceiptService.detail(id);
        return ApiResponse.sendSuccess(c, result);
    }

    static async create(c: Context) {
        const body = c.get("body") as RequestGoodsReceiptDTO;
        const accountSession = c.get("session");
        const userId = accountSession?.email || "system";

        const result = await GoodsReceiptService.create(body, userId);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "CREATE",
                description: `${Table} ${result.gr_number} dibuat di gudang ${result.warehouse?.name || result.warehouse_id}`,
                email: userId,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async post(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const accountSession = c.get("session");
        const userId = accountSession?.email || "system";

        const result = await GoodsReceiptService.post(id, userId);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "UPDATE",
                description: `${Table} ${result.gr_number} diposting ke stok`,
                email: userId,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result);
    }

    static async cancel(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const accountSession = c.get("session");
        const userId = accountSession?.email || "system";

        const result = await GoodsReceiptService.cancel(id);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "UPDATE",
                description: `${Table} ${result.gr_number} dibatalkan`,
                email: userId,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result);
    }

    static async export(c: Context) {
        const query = c.req.query();
        const validated = QueryGoodsReceiptSchema.parse(query);
        const buffer = await GoodsReceiptService.export(validated);

        c.header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        c.header("Content-Disposition", `attachment; filename="GR_Export_${Date.now()}.xlsx"`);

        return c.body(buffer as any);
    }

    static async exportDetail(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");
        const buffer = await GoodsReceiptService.exportDetail(id);

        c.header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        c.header("Content-Disposition", `attachment; filename="GR_Detail_${id}.xlsx"`);

        return c.body(buffer as any);
    }
}
