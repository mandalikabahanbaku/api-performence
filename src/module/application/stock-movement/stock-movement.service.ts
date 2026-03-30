import { Prisma } from "../../../generated/prisma/client.js";
import prisma from "../../../config/prisma.js";
import { QueryStockMovementDTO } from "./stock-movement.schema.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";

export class StockMovementService {
    static async list(query: QueryStockMovementDTO) {
        const {
            page = 1,
            take = 10,
            sortBy = "created_at",
            sortOrder = "desc",
            entity_type,
            entity_id,
            location_type,
            location_id,
            movement_type,
            reference_type,
            reference_id,
        } = query;

        const { skip, take: limit } = GetPagination(page, take);

        const where: Prisma.StockMovementWhereInput = {
            ...(entity_type && { entity_type }),
            ...(entity_id && { entity_id }),
            ...(location_type && { location_type }),
            ...(location_id && { location_id }),
            ...(movement_type && { movement_type }),
            ...(reference_type && { reference_type }),
            ...(reference_id && { reference_id }),
        };

        const [data, len] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        return { data, len };
    }

    static async detail(id: number) {
        const result = await prisma.stockMovement.findUnique({
            where: { id },
        });

        if (!result) {
            throw new ApiError(404, "Stock movement not found");
        }

        return result;
    }
}
