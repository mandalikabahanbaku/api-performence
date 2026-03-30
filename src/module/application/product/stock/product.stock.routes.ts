import { Hono } from "hono";
import { ProductStockController } from "./product.stock.controller.js";
import ProductStockImportRoutes from "./import/import.routes.js";

export const ProductStockRoutes = new Hono();

ProductStockRoutes.route("/import", ProductStockImportRoutes);
ProductStockRoutes.get("/warehouses", ProductStockController.listWarehouses);
ProductStockRoutes.get("/", ProductStockController.listProductStock);
