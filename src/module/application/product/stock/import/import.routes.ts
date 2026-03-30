import { Hono } from "hono";
import { ProductStockImportController } from "./import.controller.js";

const ProductStockImportRoutes = new Hono();

ProductStockImportRoutes.get("/preview/:import_id", ProductStockImportController.getPreview);
ProductStockImportRoutes.post("/preview", ProductStockImportController.preview);
ProductStockImportRoutes.post("/execute", ProductStockImportController.execute);

export default ProductStockImportRoutes;
