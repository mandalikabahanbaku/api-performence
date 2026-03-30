import { Hono } from "hono";
import { validateBody } from "../../../middleware/validation.js";
import { RequestRawMaterialSchema } from "./rawmat.schema.js";
import { RawMaterialController } from "./rawmat.controller.js";
import { SupplierRoutes } from "./supplier/supplier.routes.js";
import { UnitRawMaterialRoutes } from "./unit/unit.routes.js";
import { RawMatCategoryRoutes } from "./category/category.routes.js";
import RawmatImportRoutes from "./import/import.routes.js";
import { RawMaterialStockRoutes } from "./stock/rawmat.stock.routes.js";

export const RawMaterialRoutes = new Hono();
RawMaterialRoutes.route("/suppliers", SupplierRoutes);
RawMaterialRoutes.route("/units", UnitRawMaterialRoutes);
RawMaterialRoutes.route("/categories", RawMatCategoryRoutes);
RawMaterialRoutes.route("/import", RawmatImportRoutes);
RawMaterialRoutes.route("/stocks", RawMaterialStockRoutes);

RawMaterialRoutes.get("/count-utils", RawMaterialController.countUtils);
RawMaterialRoutes.delete("/clean", RawMaterialController.clean);

RawMaterialRoutes.get("/:id", RawMaterialController.detail);
RawMaterialRoutes.put(
    "/:id",
    validateBody(RequestRawMaterialSchema.partial()),
    RawMaterialController.update,
);
RawMaterialRoutes.patch(
    "/:id",
    validateBody(RequestRawMaterialSchema.partial()),
    RawMaterialController.update,
);
RawMaterialRoutes.patch("/:id/restore", RawMaterialController.restore);
RawMaterialRoutes.delete("/:id", RawMaterialController.delete);

RawMaterialRoutes.post("/", validateBody(RequestRawMaterialSchema), RawMaterialController.create);
RawMaterialRoutes.get("/", RawMaterialController.list);
