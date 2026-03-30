import { Hono } from "hono";

import { UnitRawMaterialController } from "./unit.controller.js";
import { RequestRawMaterialUnitSchema } from "./unit.schema.js";
import { validateBody } from "../../../../middleware/validation.js";

export const UnitRawMaterialRoutes = new Hono();

UnitRawMaterialRoutes.post(
    "/",
    validateBody(RequestRawMaterialUnitSchema),
    UnitRawMaterialController.create,
);

UnitRawMaterialRoutes.get("/", UnitRawMaterialController.list);

UnitRawMaterialRoutes.get("/:id", UnitRawMaterialController.detail);

UnitRawMaterialRoutes.put(
    "/:id",
    validateBody(RequestRawMaterialUnitSchema.partial()),
    UnitRawMaterialController.update,
);

UnitRawMaterialRoutes.delete("/:id", UnitRawMaterialController.delete);
