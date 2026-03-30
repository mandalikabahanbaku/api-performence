import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { ProductRoutes } from "./product/product.routes.js";
import { RawMaterialRoutes } from "./rawmat/rawmat.routes.js";
import { WarehouseRoutes } from "./warehouse/warehouse.routes.js";
import { IssuanceRoutes } from "./issuance/issuance.routes.js";
import { SharedRoutes } from "./shared/shared.routes.js";
import { RecipeRoutes } from "./recipe/recipe.routes.js";
import { ForecastRoutes } from "./forecast/forecast.routes.js";
import ConsolidationRoutes from "./consolidation/consolidation.routes.js";
import OpenPoRoutes from "./open-po/open-po.routes.js";
import BOMRoutes from "./bom/bom.routes.js";
import RecomendationV2Routes from "./recomendation-v2/recomendation-v2.routes.js";
import { OutletRoutes } from "./outlet/outlet.routes.js";
import StockTransferRoutes from "./stock-transfer/stock-transfer.routes.js";
import StockMovementRoutes from "./stock-movement/stock-movement.routes.js";

export const ApplicationRoutes = new Hono().use(authMiddleware);

ApplicationRoutes.route("/products", ProductRoutes);
ApplicationRoutes.route("/rawmat", RawMaterialRoutes);
ApplicationRoutes.route("/warehouses", WarehouseRoutes);
ApplicationRoutes.route("/product-issuance", IssuanceRoutes);
ApplicationRoutes.route("/shared", SharedRoutes);
ApplicationRoutes.route("/recipes", RecipeRoutes);
ApplicationRoutes.route("/forecasts", ForecastRoutes);
ApplicationRoutes.route("/recomendations-v2", RecomendationV2Routes);
ApplicationRoutes.route("/consolidation", ConsolidationRoutes);
ApplicationRoutes.route("/po/open", OpenPoRoutes);
ApplicationRoutes.route("/bom", BOMRoutes);
ApplicationRoutes.route("/outlets", OutletRoutes);
ApplicationRoutes.route("/stock-transfers", StockTransferRoutes);
ApplicationRoutes.route("/stock-movements", StockMovementRoutes);

