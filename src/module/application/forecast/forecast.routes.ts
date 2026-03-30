import { Hono } from "hono";
import { validateBody } from "../../../middleware/validation.js";
import { ForecastPercentageRoutes } from "./percentages/percentages.routes.js";
import { ForecastController } from "./forecast.controller.js";
import {
    DeleteForecastByPeriodSchema,
    FinalizeForecastSchema,
    RunForecastSchema,
    UpdateManualForecastSchema,
} from "./forecast.schema.js";

export const ForecastRoutes = new Hono();

ForecastRoutes.route("/forecast-percentages", ForecastPercentageRoutes);

// Static routes (must be before /:product_id / /:id)
ForecastRoutes.post("/run", validateBody(RunForecastSchema), ForecastController.run);
ForecastRoutes.patch("/finalize", validateBody(FinalizeForecastSchema), ForecastController.finalize);
ForecastRoutes.delete("/period", validateBody(DeleteForecastByPeriodSchema), ForecastController.deleteByPeriod);
ForecastRoutes.patch("/manual-update", validateBody(UpdateManualForecastSchema), ForecastController.updateManual);

ForecastRoutes.get("/", ForecastController.list);
ForecastRoutes.post("/", validateBody(RunForecastSchema), ForecastController.run);

// Parameterized routes
ForecastRoutes.get("/:product_id", ForecastController.detail);
ForecastRoutes.delete("/:id", ForecastController.destroyById);
