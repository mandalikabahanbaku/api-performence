import { Context } from "hono";
import { TGService } from "./tg.service.js";
import {
    QueryTransferGudangSchema,
    RequestTransferGudangSchema,
    UpdateTransferGudangStatusSchema,
    RequestTransferGudangDTO,
    UpdateTransferGudangStatusDTO,
} from "./tg.schema.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { CreateLogger } from "../../log/log.service.js";
import { CreateLoggingActivityDTO } from "../../log/log.schema.js";
import { ApiError } from "../../../../lib/errors/api.error.js";

const Table = "Transfer Gudang";

export class TGController {
    static async list(c: Context) {
        const query = c.req.query();
        const validated = QueryTransferGudangSchema.parse(query);
        const result = await TGService.list(validated);
        return ApiResponse.sendSuccess(c, result, 200, validated);
    }
    
    static async getStock(c: Context) {
        const warehouse_id = c.req.query("warehouse_id") ? Number(c.req.query("warehouse_id")) : undefined;
        const product_id = Number(c.req.query("product_id"));
        
        if (!product_id || !warehouse_id) {
            throw new ApiError(400, "Product ID dan Warehouse ID wajib dikirim.");
        }
        
        // Reuse service stock logic
        const stock = await TGService.getStock(warehouse_id, product_id);
        return ApiResponse.sendSuccess(c, { stock }, 200);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");
        const result = await TGService.detail(id);
        return ApiResponse.sendSuccess(c, result);
    }

    static async create(c: Context) {
        const body = await c.req.json();
        const validated = RequestTransferGudangSchema.parse(body);
        const accountSession = c.get("session");
        const userId = accountSession?.email || "system";

        const result = await TGService.create(validated, userId);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "CREATE",
                description: `${Table} ${result.transfer_number} dibuat (Gudang: ${result.from_warehouse?.name || result.from_warehouse_id} -> Gudang: ${result.to_warehouse?.name || result.to_warehouse_id})`,
                email: userId,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async updateStatus(c: Context) {
        const id = Number(c.req.param("id"));
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");
        
        const body = await c.req.json();
        const validated = UpdateTransferGudangStatusSchema.parse(body);
        const accountSession = c.get("session");
        const userId = accountSession?.email || "system";

        const result = await TGService.updateStatus(id, validated, userId);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "UPDATE",
                description: `Update Status ${Table} ${result.transfer_number} menjadi ${result.status}`,
                email: userId,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result);
    }

    static async export(c: Context) {
        const query = c.req.query();
        const validated = QueryTransferGudangSchema.parse(query);
        const buffer = await TGService.export(validated);

        c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        c.header("Content-Disposition", `attachment; filename="TG_Export_${Date.now()}.xlsx"`);

        return c.body(buffer as any);
    }
}
