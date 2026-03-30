import { Hono } from "hono";
import { UnitController } from "./unit.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import { RequestUnitSchema } from "./unit.schema.js";

export const UnitRoutes = new Hono();

UnitRoutes.get("/", UnitController.list);
UnitRoutes.post("/", validateBody(RequestUnitSchema), UnitController.create);
UnitRoutes.put("/:id", validateBody(RequestUnitSchema.partial()), UnitController.update);
UnitRoutes.delete("/:id", UnitController.delete);
