// import.controller.ts
import { Context } from "hono";
import { GetUploadedFile } from "../../../../lib/get.file.js";
import { ParseCSV } from "../../../../lib/csv.js";
import { ParseXLSX } from "../../../../lib/excel.js";

import { ApiResponse } from "../../../../lib/api.response.js";
import { RawmatImportService } from "./import.service.js";

export class RawmatImportController {
    static async preview(c: Context) {
        const { buffer, mimetype, filename } = await GetUploadedFile(c);
        const isXlsx =
            mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            filename.endsWith(".xlsx");

        const rows = isXlsx ? await ParseXLSX(buffer) : ParseCSV(buffer);

        const result = await RawmatImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const { import_id, year, month } = await c.req.json();
        const result = await RawmatImportService.execute(import_id, Number(month), Number(year));
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("import_id");

        const result = await RawmatImportService.getPreview(import_id!);

        return ApiResponse.sendSuccess(c, result, 200);
    }
}
