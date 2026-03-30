import { Hono } from "hono";
import { OutletInventoryController } from "./outlet-inventory.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import {
    RequestOutletInventoryInitSchema,
    RequestOutletInventorySetMinStockSchema,
} from "./outlet-inventory.schema.js";

export const OutletInventoryRoutes = new Hono();

OutletInventoryRoutes.get("/", OutletInventoryController.list);
OutletInventoryRoutes.post(
    "/init",
    validateBody(RequestOutletInventoryInitSchema),
    OutletInventoryController.init,
);
OutletInventoryRoutes.get("/:product_id", OutletInventoryController.detail);
OutletInventoryRoutes.patch(
    "/:product_id/min-stock",
    validateBody(RequestOutletInventorySetMinStockSchema),
    OutletInventoryController.setMinStock,
);
