import { Context } from "hono";
import { ProductService } from "./product.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { STATUS } from "../../../generated/prisma/enums.js";
import { CreateLogger } from "../log/log.service.js";
import { CreateLoggingActivityDTO } from "../log/log.schema.js";
import { QueryProductDTO } from "./product.schema.js";
import { Cache } from "../../../lib/utils/cache.js";

const Table = "Produk";
const PRODUCT_LIST_KEY = "products:list";

export class ProductController {
    static async create(c: Context) {
        const body = c.get("body");
        const accountSession = c.get("session");

        // const result = await Cache.afterMutation(
        //     () => ProductService.create(body),
        //     PRODUCT_LIST_KEY,
        // );
        const result = await ProductService.create(body);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "CREATE",
                description: `${Table} ${result.code}: ${result.name}`,
                email: accountSession.email,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async update(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const body = c.get("body");
        const accountSession = c.get("session");

        // const result = await Cache.afterMutation(
        //     () => ProductService.update(Number(id), body),
        //     PRODUCT_LIST_KEY,
        // );
        const result = await ProductService.update(Number(id), body);

        if (result) {
            const log: CreateLoggingActivityDTO = {
                activity: "UPDATE",
                description: `${Table} ${result.code}: ${result.name}`,
                email: accountSession.email,
            };
            await CreateLogger(log);
        }

        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async status(c: Context) {
        const id = c.req.param("id");
        const { status } = c.req.query();
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        // await Cache.afterMutation(
        //     () => ProductService.status(code, status as STATUS),
        //     PRODUCT_LIST_KEY,
        // );
        await ProductService.status(Number(id), status as STATUS);

        const accountSession = c.get("session");
        const log: CreateLoggingActivityDTO = {
            activity: "UPDATE",
            description: `Status ${Table} ${id}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, {}, 201);
    }

    static async bulkStatus(c: Context) {
        const body = await c.req.json();
        if (!body.ids || !body.status) throw new ApiError(400, "Parameter tidak valid");

        await ProductService.bulkStatus(body.ids, body.status as STATUS);

        const accountSession = c.get("session");
        const log: CreateLoggingActivityDTO = {
            activity: "UPDATE",
            description: `Bulk Status ${Table} (${body.ids.length} items)`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, {}, 200);
    }

    static async export(c: Context) {
        const { sortBy, sortOrder, gender, search, status, type_id, size_id, visibleColumns } = c.req.query();

        const params: QueryProductDTO = {
            search,
            sortBy: sortBy as QueryProductDTO["sortBy"],
            sortOrder: sortOrder as QueryProductDTO["sortOrder"],
            status: status as QueryProductDTO["status"],
            type_id: type_id ? Number(type_id) : undefined,
            size_id: size_id ? Number(size_id) : undefined,
            gender: gender as QueryProductDTO["gender"],
            visibleColumns,
        };

        const buffer = await ProductService.export(params);

        c.header("Content-Type", "text/csv");
        c.header("Content-Disposition", `attachment; filename="data-produk.csv"`);
        return c.body(buffer as any);
    }

    static async clean(c: Context) {
        await Cache.afterMutation(() => ProductService.clean(), PRODUCT_LIST_KEY);

        const accountSession = c.get("session");
        const log: CreateLoggingActivityDTO = {
            activity: "CLEAN",
            description: `${Table}`,
            email: accountSession.email,
        };
        await CreateLogger(log);

        return ApiResponse.sendSuccess(c, {}, 201);
    }

    static async list(c: Context) {
        const { page, sortBy, sortOrder, take, gender, search, status, type_id } = c.req.query();

        const params: QueryProductDTO = {
            page: page ? Number(page) : undefined,
            search,
            sortBy: sortBy as QueryProductDTO["sortBy"],
            sortOrder: sortOrder as QueryProductDTO["sortOrder"],
            take: take ? Number(take) : undefined,
            status: status as QueryProductDTO["status"],
            type_id: type_id ? Number(type_id) : undefined,
            gender: gender as QueryProductDTO["gender"],
        };

        const result = await ProductService.list(params);

        return ApiResponse.sendSuccess(c, result, 200, params);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        if (!id) throw new ApiError(400, "Kesalahan pada proses permintaan data");

        const result = await ProductService.detail(Number(id));

        return ApiResponse.sendSuccess(c, result, 200);
    }

    // static async getProductRedis(c: Context) {
    //     const key = PRODUCT_LIST_KEY;

    //     let result;
    //     const cached = await redisClient.get(key);

    //     if (!cached || cached.length === 0) {
    //         result = await ProductService.redisProduct();
    //         console.log(result);
    //         await redisClient.set(key, JSON.stringify(result), "EX", 86400);
    //     } else {
    //         result = JSON.parse(cached);
    //     }

    //     return ApiResponse.sendSuccess(c, result, 200);
    // }
}
