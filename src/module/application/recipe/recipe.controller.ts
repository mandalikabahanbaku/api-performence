import { Context } from "hono";
import { RecipeService } from "./recipe.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { QueryRecipeDTO } from "./recipe.schema.js";

export class RecipeController {
    static async upsert(c: Context) {
        const body = c.get("body");
        const rest = await RecipeService.upsert(body);
        return ApiResponse.sendSuccess(c, rest, 201);
    }

    static async list(c: Context) {
        const { page, sortBy, sortOrder, take, search, product_id, raw_mat_id } = c.req.query();

        const params: QueryRecipeDTO = {
            page: page ? Number(page) : undefined,
            search,
            sortBy: sortBy as QueryRecipeDTO["sortBy"],
            sortOrder: sortOrder as QueryRecipeDTO["sortOrder"],
            take: take ? Number(take) : undefined,
            product_id: product_id ? Number(product_id) : undefined,
            raw_mat_id: raw_mat_id ? Number(raw_mat_id) : undefined,
        };
        const rest = await RecipeService.list(params);
        return ApiResponse.sendSuccess(c, rest, 200);
    }

    static async export(c: Context) {
        const { search } = c.req.query();

        const params: QueryRecipeDTO = {
            search,
        };

        const buffer = await RecipeService.export(params);

        c.header("Content-Type", "text/csv");
        c.header("Content-Disposition", "attachment; filename=resep-bom.csv");

        return c.body(buffer as any);
    }

    static async detail(c: Context) {
        const id = c.req.param("id");
        const rest = await RecipeService.detail(Number(id));
        return ApiResponse.sendSuccess(c, rest, 200);
    }
}
