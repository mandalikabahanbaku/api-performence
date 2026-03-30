import { Hono } from "hono";
import { ProductImportController } from "./import.controller.js";

const ProductImportRoutes = new Hono();

ProductImportRoutes.get("/preview/:import_id", ProductImportController.getPreview);
ProductImportRoutes.post("/preview", ProductImportController.preview);
ProductImportRoutes.post("/execute", ProductImportController.execute);

export default ProductImportRoutes;
