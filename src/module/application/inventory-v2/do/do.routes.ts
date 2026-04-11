import { Hono } from "hono";
import { DOController } from "./do.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import { RequestDeliveryOrderSchema, UpdateDeliveryOrderStatusSchema } from "./do.schema.js";

export const DORoutes = new Hono();

DORoutes.get("/", DOController.list);
DORoutes.get("/stock", DOController.getStock);
DORoutes.get("/discrepancies", DOController.listDiscrepancies);
DORoutes.get("/discrepancies/export", DOController.exportDiscrepancies);
DORoutes.get("/export", DOController.export);
DORoutes.get("/:id", DOController.detail);

DORoutes.get("/:id/export", DOController.exportDetail);

// SOP: Direct validateBody in routes
DORoutes.post("/", validateBody(RequestDeliveryOrderSchema), DOController.create);
DORoutes.patch("/:id/status", validateBody(UpdateDeliveryOrderStatusSchema), DOController.updateStatus);

export default DORoutes;
