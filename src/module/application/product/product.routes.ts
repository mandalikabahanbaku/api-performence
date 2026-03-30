import { Hono } from "hono";
import { validateBody } from "../../../middleware/validation.js";
import { ProductController } from "./product.controller.js";
import { UnitRoutes } from "./unit/unit.routes.js";
import { TypeRoutes } from "./type/type.routes.js";
import { SizeRoutes } from "./size/size.routes.js";
import { RequestProductSchema } from "./product.schema.js";
import ProductImportRoutes from "./import/import.routes.js";
import { ProductStockRoutes } from "./stock/product.stock.routes.js";
import ProductStockLocationRoutes from "./stock-location/product.stock-location.routes.js";

export const ProductRoutes = new Hono();

// -- Sub
ProductRoutes.route("/stock-locations", ProductStockLocationRoutes);
ProductRoutes.route("/stocks", ProductStockRoutes);
ProductRoutes.route("/import", ProductImportRoutes);
ProductRoutes.route("/units", UnitRoutes);
ProductRoutes.route("/types", TypeRoutes);
ProductRoutes.route("/sizes", SizeRoutes);

// -- Main
ProductRoutes.get("/export", ProductController.export);
ProductRoutes.put("/bulk-status", ProductController.bulkStatus);
ProductRoutes.patch("/status/:id", ProductController.status);
ProductRoutes.delete("/clean", ProductController.clean);

ProductRoutes.put("/:id", validateBody(RequestProductSchema.partial()), ProductController.update);
ProductRoutes.get("/:id", ProductController.detail);

ProductRoutes.get("/", ProductController.list);
ProductRoutes.post("/", validateBody(RequestProductSchema), ProductController.create);
