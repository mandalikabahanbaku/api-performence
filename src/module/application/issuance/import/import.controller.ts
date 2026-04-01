import { Context } from "hono";
import { GetUploadedFile } from "../../../../lib/get.file.js";
import { ParseCSV } from "../../../../lib/csv.js";
import { ParseXLSX } from "../../../../lib/excel.js";
import { IssuanceImportService } from "./import.service.js";
import { ApiResponse } from "../../../../lib/api.response.js";
import { RequestIssuanceImportDTO } from "./import.schema.js";

class IssuanceImportController {
    static async preview(c: Context) {
        const { buffer, mimetype, filename } = await GetUploadedFile(c);
        const isXlsx =
            mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            filename.endsWith(".xlsx");

        const rows = isXlsx ? await ParseXLSX(buffer) : ParseCSV(buffer);
        const result = await IssuanceImportService.preview(rows);
        return ApiResponse.sendSuccess(c, result, 201);
    }

    static async execute(c: Context) {
        const body = c.get("body") as RequestIssuanceImportDTO;
        const { import_id, month, year, type } = body;
        const result = await IssuanceImportService.execute(String(import_id), month!, year!, type);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async getPreview(c: Context) {
        const import_id = c.req.param("id");
        const result = await IssuanceImportService.getPreview(String(import_id));
        return ApiResponse.sendSuccess(c, result, 200);
    }
}

export default IssuanceImportController;
