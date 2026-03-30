import { Context } from "hono";
import { GetUploadedFile } from "../../../../lib/get.file.js";
import { ParseCSV } from "../../../../lib/csv.js";
import { ParseXLSX } from "../../../../lib/excel.js";
import { OutletImportService } from "./import.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { ApiError } from "../../../../lib/errors/api.error.js";

export class OutletImportController {
    static async preview(c: Context) {
        const { buffer, mimetype, filename } = await GetUploadedFile(c);
        const isXlsx =
            mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            filename.endsWith(".xlsx");

        const rows = isXlsx ? await ParseXLSX(buffer) : ParseCSV(buffer);
        const result = await OutletImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const { import_id } = await c.req.json();
        if (!import_id) throw new ApiError(400, "Import ID wajib dilampirkan");
        const result = await OutletImportService.execute(import_id);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("import_id");

        if (!import_id) throw new ApiError(400, "Import ID wajib dilampirkan");

        const result = await OutletImportService.getPreview(import_id);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
