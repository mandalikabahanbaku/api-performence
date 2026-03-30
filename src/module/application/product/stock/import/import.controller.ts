// import.controller.ts
import { Context } from "hono";
import { GetUploadedFile } from "../../../../../lib/get.file.js";
import { ParseCSV } from "../../../../../lib/csv.js";
import { ParseXLSX } from "../../../../../lib/excel.js";
import { ProductStockImportService } from "./import.service.js";
import { ApiResponse } from "../../../../../lib/api.response.js";
import { ApiError } from "../../../../../lib/errors/api.error.js";

export class ProductStockImportController {
    static async preview(c: Context) {
        const { buffer, mimetype } = await GetUploadedFile(c);
        const rows = mimetype === "text/csv" ? ParseCSV(buffer) : await ParseXLSX(buffer);

        const result = await ProductStockImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const body = await c.req.json();
        const now = new Date();
        const month = body.month ? Number(body.month) : now.getUTCMonth() + 1;
        const year = body.year ? Number(body.year) : now.getUTCFullYear();
        const warehouse_id = Number(body.warehouse_id);

        if (!warehouse_id) {
            throw new ApiError(400, "Warehouse ID wajib diisi");
        }

        const result = await ProductStockImportService.execute(
            body.import_id,
            warehouse_id,
            month,
            year,
        );
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("import_id");

        if (!import_id) throw new ApiError(400, "Import ID wajib dilampirkan");

        const result = await ProductStockImportService.getPreview(import_id);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
