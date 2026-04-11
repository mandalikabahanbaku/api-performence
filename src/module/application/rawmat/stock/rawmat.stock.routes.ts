import { Hono } from "hono";
import { RawMaterialStockController } from "./rawmat.stock.controller.js";
import RawMaterialStockImportRoutes from "./import/import.routes.js";

export const RawMaterialStockRoutes = new Hono();

RawMaterialStockRoutes.route("/import", RawMaterialStockImportRoutes);

RawMaterialStockRoutes.get("/warehouses", RawMaterialStockController.listWarehouses);
RawMaterialStockRoutes.get("/raw-materials", RawMaterialStockController.listRawMaterials);
RawMaterialStockRoutes.get("/export", RawMaterialStockController.export);
RawMaterialStockRoutes.post("/upsert", RawMaterialStockController.upsertStock);
RawMaterialStockRoutes.get("/", RawMaterialStockController.listRawMaterialStock);
