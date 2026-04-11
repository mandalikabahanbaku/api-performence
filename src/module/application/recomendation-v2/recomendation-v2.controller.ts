import { Context } from "hono";
import { RecomendationV2Service } from "./recomendation-v2.service.js";
import { ApiResponse } from "../../../lib/api.response.js";
import { 
    QueryRecomendationV2DTO, 
    RequestApproveWorkOrderSchema, 
    RequestSaveWorkOrderSchema,
    RequestBulkSaveHorizonSchema,
    RequestSaveOpenPoSchema,
    RequestUpdateMoqSchema,
    RequestSaveNeedOverrideSchema,
    RequestDeleteNeedOverrideSchema,
} from "./recomendation-v2.schema.js";

export class RecomendationV2Controller {
    static async list(c: Context) {
        const { page, take, search, month, year, type, sales_months, forecast_months, po_months, sortBy, order } = c.req.query();

        const params: QueryRecomendationV2DTO = {
            page: page ? Number(page) : 1,
            take: take ? Number(take) : 25,
            search,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
            type: type as QueryRecomendationV2DTO["type"],
            sales_months: sales_months ? Number(sales_months) : 3,
            forecast_months: forecast_months ? Number(forecast_months) : 3,
            po_months: po_months ? Number(po_months) : 3,
            sortBy,
            order: order as QueryRecomendationV2DTO["order"],
        };

        const result = await RecomendationV2Service.list(params);
        return ApiResponse.sendSuccess(c, result, 200);
    }
    
    static async export(c: Context) {
        const { search, month, year, type, sales_months, forecast_months, po_months, sortBy, order, visibleColumns, columnOrder } = c.req.query();

        const params: QueryRecomendationV2DTO = {
            page: 1,
            take: 1000000,
            search,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
            type: type as QueryRecomendationV2DTO["type"],
            sales_months: sales_months ? Number(sales_months) : 3,
            forecast_months: forecast_months ? Number(forecast_months) : 3,
            po_months: po_months ? Number(po_months) : 3,
            sortBy,
            order: order as QueryRecomendationV2DTO["order"],
            visibleColumns,
            columnOrder,
        };

        const buffer = await RecomendationV2Service.export(params);

        c.header("Content-Type", "text/csv");
        c.header("Content-Disposition", `attachment; filename=Rekomendasi_V2_${type?.toUpperCase()}_${month}_${year}.csv`);

        return c.body(buffer as any);
    }

    static async saveWorkOrder(c: Context) {
        const body = await c.req.json();
        const validBody = RequestSaveWorkOrderSchema.parse(body);
        const result = await RecomendationV2Service.saveWorkOrder(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async approveWorkOrder(c: Context) {
        const body = await c.req.json();
        const validBody = RequestApproveWorkOrderSchema.parse(body);
        const userId = c.get("userId") || "anonymous";
        const result = await RecomendationV2Service.approveWorkOrder(validBody, userId);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async destroyWorkOrder(c: Context) {
        const id = Number(c.req.param("id"));
        const result = await RecomendationV2Service.destroyWorkOrder(id);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async bulkSaveHorizon(c: Context) {
        const body = await c.req.json();
        const validBody = RequestBulkSaveHorizonSchema.parse(body);
        const result = await RecomendationV2Service.bulkSaveHorizon(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async saveOpenPo(c: Context) {
        const body = await c.req.json();
        const validBody = RequestSaveOpenPoSchema.parse(body);
        const result = await RecomendationV2Service.saveOpenPo(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async updateMoq(c: Context) {
        const body = await c.req.json();
        const validBody = RequestUpdateMoqSchema.parse(body);
        const result = await RecomendationV2Service.updateMoq(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async saveNeedOverride(c: Context) {
        const body = await c.req.json();
        const validBody = RequestSaveNeedOverrideSchema.parse(body);
        const result = await RecomendationV2Service.saveNeedOverride(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }

    static async deleteNeedOverride(c: Context) {
        const body = await c.req.json();
        const validBody = RequestDeleteNeedOverrideSchema.parse(body);
        const result = await RecomendationV2Service.deleteNeedOverride(validBody);
        return ApiResponse.sendSuccess(c, result, 200);
    }
}
