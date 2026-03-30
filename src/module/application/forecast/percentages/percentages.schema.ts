import { z } from "zod";

export const RequestForecastPercentageSchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    value: z.coerce.number().min(-999.99).max(999.99),
});

export const RequestForecastPercentageBulkSchema = z.object({
    items: z.array(RequestForecastPercentageSchema).min(1),
});

export const RequestForecastPercentageDeleteBulkSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1),
});

export const ResponseForecastPercentageSchema = RequestForecastPercentageSchema.extend({
    id: z.number(),
});

export const QueryForecastPercentageSchema = z.object({
    year: z.coerce.number().int().min(2000).optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(25).optional(),
});

export type RequestForecastPercentageDTO = z.infer<typeof RequestForecastPercentageSchema>;
export type RequestForecastPercentageBulkDTO = z.infer<
    typeof RequestForecastPercentageBulkSchema
>;
export type RequestForecastPercentageDeleteBulkDTO = z.infer<
    typeof RequestForecastPercentageDeleteBulkSchema
>;
export type ResponseForecastPercentageDTO = z.infer<typeof ResponseForecastPercentageSchema>;
export type QueryForecastPercentageDTO = z.infer<typeof QueryForecastPercentageSchema>;
