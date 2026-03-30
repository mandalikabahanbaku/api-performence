import { Hono } from "hono";
import { RawMaterialInventoryImportController } from "./import.controller.js";

const RawMaterialInventoryImportRoutes = new Hono();

RawMaterialInventoryImportRoutes.get(
    "/preview/:import_id",
    RawMaterialInventoryImportController.getPreview,
);
RawMaterialInventoryImportRoutes.post("/preview", RawMaterialInventoryImportController.preview);
RawMaterialInventoryImportRoutes.post("/execute", RawMaterialInventoryImportController.execute);

export default RawMaterialInventoryImportRoutes;
