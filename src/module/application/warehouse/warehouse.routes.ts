import { Hono } from "hono";
import { WarehouseController } from "./warehouse.controller.js";
import { validateBody } from "../../../middleware/validation.js";
import { RequestWarehouseSchema } from "./warehouse.schema.js";

export const WarehouseRoutes = new Hono();

WarehouseRoutes.delete("/:id", WarehouseController.deleted);
WarehouseRoutes.get("/:id", WarehouseController.detail);
WarehouseRoutes.put(
    "/:id",
    validateBody(RequestWarehouseSchema.partial()),
    WarehouseController.update,
);
WarehouseRoutes.patch("/:id", WarehouseController.changeStatus);
WarehouseRoutes.get("/:id/stock/:product_id", WarehouseController.getStock);

WarehouseRoutes.get("/", WarehouseController.list);
WarehouseRoutes.post("/", validateBody(RequestWarehouseSchema), WarehouseController.create);
