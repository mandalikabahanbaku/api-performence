import { z } from "zod";
import { WarehouseType } from "../../../../generated/prisma/client.js";

export const ResponseWarehouseSharedSchema = z.object({
    id: z.number(),
    name: z.string(),
    type: z.nativeEnum(WarehouseType),
});

export type ResponseWarehouseSharedDTO = z.infer<typeof ResponseWarehouseSharedSchema>;
