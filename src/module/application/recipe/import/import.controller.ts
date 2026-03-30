// import.controller.ts
import { Context } from "hono";
import { GetUploadedFile } from "../../../../lib/get.file.js";
import { ParseCSV } from "../../../../lib/csv.js";
import { ParseXLSX } from "../../../../lib/excel.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { RecipeImportService } from "./import.service.js";

export class RecipeImportController {
    static async preview(c: Context) {
        const { buffer, mimetype } = await GetUploadedFile(c);
        const rows = mimetype === "text/csv" ? ParseCSV(buffer) : await ParseXLSX(buffer);

        const result = await RecipeImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const { import_id } = await c.req.json();
        const result = await RecipeImportService.execute(import_id);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("import_id")!;

        const result = await RecipeImportService.getPreview(import_id);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
