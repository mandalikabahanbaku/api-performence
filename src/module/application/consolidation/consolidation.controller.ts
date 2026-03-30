import { Context } from "hono";
import { QueryConsolidationSchema } from "./consolidation.schema.js";
import { ConsolidationService } from "./consolidation.service.js";
import { ApiResponse } from "../../../lib/api.response.js";

export class ConsolidationController {
    static async list(c: Context) {
        const query = c.req.query();
        const validQuery = QueryConsolidationSchema.parse(query);
        const result = await ConsolidationService.list(validQuery);
        return ApiResponse.sendSuccess(c, result);
    }

    static async summary(c: Context) {
        const query = c.req.query();
        const validQuery = QueryConsolidationSchema.parse(query);
        const result = await ConsolidationService.summaryBySupplier(validQuery);
        return ApiResponse.sendSuccess(c, result);
    }

    static async export(c: Context) {
        const query = c.req.query();
        const validQuery = QueryConsolidationSchema.parse({
            ...query,
            month: query.month ? Number(query.month) : undefined,
            year: query.year ? Number(query.year) : undefined,
            supplier_id: query.supplier_id ? Number(query.supplier_id) : undefined,
        });

        const buffer = await ConsolidationService.export(validQuery);

        const month = validQuery.month || new Date().getMonth() + 1;
        const year = validQuery.year || new Date().getFullYear();

        c.header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        c.header(
            "Content-Disposition",
            `attachment; filename=Konsolidasi_Purchase_${month}_${year}.xlsx`,
        );

        return c.body(buffer as any);
    }
}
