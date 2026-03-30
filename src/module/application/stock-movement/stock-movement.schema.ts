import { z } from "zod";
import {
    MovementEntityType,
    MovementLocationType,
    MovementType,
    MovementRefType,
} from "../../../generated/prisma/enums.js";

export const QueryStockMovementSchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    take: z.coerce.number().int().positive().max(100).default(10).optional(),
    sortBy: z.enum(["created_at", "quantity"]).default("created_at").optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
    entity_type: z.enum(MovementEntityType).optional(),
    entity_id: z.coerce.number().int().positive().optional(),
    location_type: z.enum(MovementLocationType).optional(),
    location_id: z.coerce.number().int().positive().optional(),
    movement_type: z.enum(MovementType).optional(),
    reference_type: z.enum(MovementRefType).optional(),
    reference_id: z.coerce.number().int().positive().optional(),
});

export type QueryStockMovementDTO = z.infer<typeof QueryStockMovementSchema>;

export const ResponseStockMovementSchema = z.object({
    id: z.number(),
    entity_type: z.enum(MovementEntityType),
    entity_id: z.number(),
    location_type: z.enum(MovementLocationType),
    location_id: z.number(),
    movement_type: z.enum(MovementType),
    quantity: z.coerce.number(),
    qty_before: z.coerce.number(),
    qty_after: z.coerce.number(),
    reference_id: z.number().nullable(),
    reference_type: z.enum(MovementRefType).nullable(),
    created_at: z.coerce.date(),
    created_by: z.string(),
});

export type ResponseStockMovementDTO = z.infer<typeof ResponseStockMovementSchema>;
