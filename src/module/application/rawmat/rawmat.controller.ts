import { Context } from "hono";
import { RawMaterialService } from "./rawmat.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { QueryRawMaterialDTO } from "./rawmat.schema.js";
import { redisClient } from "../../../config/redis.js";
import { Cache } from "../../../lib/utils/cache.js";
import { CreateLogger } from "../log/log.service.js";
import { CreateLoggingActivityDTO } from "../log/log.schema.js";

const RAW_MATERIAL_LIST_KEY = "raw_material:list";
const Table = "Raw Material";

export class RawMaterialController {
    static async create(c: Context) {
        const body = c.get("body");
        const accountSession = c.get("session");

        const result = await Cache.afterMutation(
            () => RawMaterialService.create(body),
            RAW_MATERIAL_LIST_KEY,
        );

        const log: CreateLoggingActivityDTO = {
            activity: "CREATE",
            description: `${Table}: ${result.name}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async update(c: Context) {
        const id = Number(c.req.param("id"));
        const body = c.get("body");
        const accountSession = c.get("session");

        const result = await Cache.afterMutation(
            () => RawMaterialService.update(id, body),
            RAW_MATERIAL_LIST_KEY,
        );

        const log: CreateLoggingActivityDTO = {
            activity: "UPDATE",
            description: `${Table} #${id}: ${result.name}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async detail(c: Context) {
        const id = Number(c.req.param("id"));

        const result = await RawMaterialService.detail(id);

        return ApiResponse.sendSuccess(c, result);
    }

    static async list(c: Context) {
        const {
            page,
            sortBy,
            sortOrder,
            take,
            search,
            status,
            type,
            category_id,
            supplier_id,
            unit_id,
        } = c.req.query();

        const params: QueryRawMaterialDTO = {
            page: page ? Number(page) : undefined,
            search,
            sortBy: sortBy as QueryRawMaterialDTO["sortBy"],
            sortOrder: sortOrder as QueryRawMaterialDTO["sortOrder"],
            take: take ? Number(take) : undefined,
            status: status as QueryRawMaterialDTO["status"],
            type: type as QueryRawMaterialDTO["type"],
            category_id: category_id ? Number(category_id) : undefined,
            supplier_id: supplier_id ? Number(supplier_id) : undefined,
            unit_id: unit_id ? Number(unit_id) : undefined,
        };
        const result = await RawMaterialService.list(params);

        return ApiResponse.sendSuccess(c, result, 200, params);
    }

    static async delete(c: Context) {
        const id = Number(c.req.param("id"));
        const accountSession = c.get("session");

        await Cache.afterMutation(() => RawMaterialService.delete(id), RAW_MATERIAL_LIST_KEY);

        const log: CreateLoggingActivityDTO = {
            activity: "DELETE",
            description: `${Table} #${id}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, {}, 200);
    }

    static async restore(c: Context) {
        const id = Number(c.req.param("id"));
        const accountSession = c.get("session");

        await Cache.afterMutation(() => RawMaterialService.restore(id), RAW_MATERIAL_LIST_KEY);

        const log: CreateLoggingActivityDTO = {
            activity: "UPDATE",
            description: `Restore ${Table} #${id}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, {}, 200);
    }

    static async clean(c: Context) {
        const accountSession = c.get("session");

        const result = await Cache.afterMutation(
            () => RawMaterialService.clean(),
            RAW_MATERIAL_LIST_KEY,
        );

        const log: CreateLoggingActivityDTO = {
            activity: "CLEAN",
            description: `${Table}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async bulkStatus(c: Context) {
        const { ids, status } = c.get("body");
        const accountSession = c.get("session");

        const result = await Cache.afterMutation(
            () => RawMaterialService.bulkStatus(ids, status),
            RAW_MATERIAL_LIST_KEY,
        );

        const log: CreateLoggingActivityDTO = {
            activity: status === "DELETE" ? "DELETE" : "UPDATE",
            description: `Bulk ${status} ${Table} for ${ids.length} items`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async export(c: Context) {
        const {
            search,
            status,
            category_id,
            supplier_id,
            unit_id,
            sortBy,
            sortOrder,
            visibleColumns,
        } = c.req.query();

        const params: QueryRawMaterialDTO = {
            search,
            status: status as QueryRawMaterialDTO["status"],
            category_id: category_id ? Number(category_id) : undefined,
            supplier_id: supplier_id ? Number(supplier_id) : undefined,
            unit_id: unit_id ? Number(unit_id) : undefined,
            sortBy: sortBy as QueryRawMaterialDTO["sortBy"],
            sortOrder: sortOrder as QueryRawMaterialDTO["sortOrder"],
            visibleColumns,
        };

        const buffer = await RawMaterialService.export(params);

        c.header(
            "Content-Type",
            "text/csv",
        );
        c.header("Content-Disposition", `attachment; filename="data-raw-materials.csv"`);
        return c.body(buffer as any);
    }

    static async countUtils(c: Context) {
        const result = await RawMaterialService.countUtils();
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
