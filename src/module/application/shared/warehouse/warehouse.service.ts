import prisma from "../../../../config/prisma.js";
import { ResponseWarehouseSharedDTO } from "./warehouse.schema.js";

export class WarehouseSharedService {
    static async list(): Promise<ResponseWarehouseSharedDTO[]> {
        return prisma.warehouse.findMany({
            where: { deleted_at: null },
            select: { id: true, name: true, type: true },
            orderBy: { name: "asc" },
        });
    }
}
