import { Context } from "hono";
import { ReturnService } from "./return.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { CreateLogger } from "../../log/log.service.js";

export class ReturnController {
    static async list(c: Context) {
        const query = c.req.query();
        const result = await ReturnService.list(query);
        return ApiResponse.sendSuccess(c, result);
    }

    static async detail(c: Context) {

            const id = Number(c.req.param("id"));
            const result = await ReturnService.detail(id);
            return ApiResponse.sendSuccess(c, result);
       
    }

    static async create(c: Context) {
       
            const body = await c.req.json();
            const accountSession = c.get("session");
            const userId = accountSession?.email || "system";

            const result = await ReturnService.create(body, userId);

            if (result) {
                const log: any = {
                    activity: "CREATE",
                    description: `Retur ${result.return_number} dibuat (Asal: ${result.from_warehouse?.name || result.from_outlet?.name} -> Gudang: ${result.to_warehouse?.name})`,
                    email: userId,
                };
                await CreateLogger(log);
            }

            return ApiResponse.sendSuccess(c, result, 201);
       
    }

    static async updateStatus(c: Context) {
       
            const id = Number(c.req.param("id"));
            const body = await c.req.json();
            const accountSession = c.get("session");
            const userId = accountSession?.email || "system";

            const result = await ReturnService.updateStatus(id, body, userId);

            if (result) {
                const log: any = {
                    activity: "UPDATE",
                    description: `Retur ${result.return_number} status diperbarui menjadi ${result.status}`,
                    email: userId,
                };
                await CreateLogger(log);
            }

            return ApiResponse.sendSuccess(c, result);
       
    }
}
