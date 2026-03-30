// import.controller.ts
import { Context } from "hono";
import { GetUploadedFile } from "../../../../../lib/get.file.js";
import { ParseCSV } from "../../../../../lib/csv.js";
import { ParseXLSX } from "../../../../../lib/excel.js";

import { ApiResponse } from "../../../../../lib/api.response.js";
import { RawMaterialInventoryImportService } from "./import.service.js";
import { ApiError } from "../../../../../lib/errors/api.error.js";

export class RawMaterialInventoryImportController {
    static async preview(c: Context) {
        const { buffer, mimetype } = await GetUploadedFile(c);
        const rows = mimetype === "text/csv" ? ParseCSV(buffer) : await ParseXLSX(buffer);
        console.log(rows);
        const result = await RawMaterialInventoryImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const body = await c.req.json();
        const import_id = body.import_id;
        const warehouse_id = Number(body.warehouse_id);
        const date = body.date ? Number(body.date) : new Date().getUTCDate();
        const month = body.month ? Number(body.month) : new Date().getUTCMonth() + 1;
        const year = body.year ? Number(body.year) : new Date().getUTCFullYear();

        if (!import_id) throw new ApiError(400, "Import ID wajib diisi");
        if (!warehouse_id) throw new ApiError(400, "Warehouse ID wajib diisi");

        const result = await RawMaterialInventoryImportService.execute(
            import_id,
            warehouse_id,
            date,
            month,
            year,
        );
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("import_id");

        if (!import_id) throw new ApiError(400, "Import ID wajib dilampirkan");

        const result = await RawMaterialInventoryImportService.getPreview(import_id);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
