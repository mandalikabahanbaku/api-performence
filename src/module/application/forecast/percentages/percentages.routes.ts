import { Hono } from "hono";
import { validateBody } from "../../../../middleware/validation.js";
import {
    RequestForecastPercentageBulkSchema,
    RequestForecastPercentageDeleteBulkSchema,
    RequestForecastPercentageSchema,
} from "./percentages.schema.js";
import { ForecastPercentageController } from "./percentages.controller.js";

export const ForecastPercentageRoutes = new Hono();

ForecastPercentageRoutes.delete(
    "/bulk",
    validateBody(RequestForecastPercentageDeleteBulkSchema),
    ForecastPercentageController.destroyMany,
);
ForecastPercentageRoutes.post(
    "/bulk",
    validateBody(RequestForecastPercentageBulkSchema),
    ForecastPercentageController.createMany,
);

ForecastPercentageRoutes.get("/:id", ForecastPercentageController.detail);
ForecastPercentageRoutes.put(
    "/:id",
    validateBody(RequestForecastPercentageSchema.partial()),
    ForecastPercentageController.update,
);
ForecastPercentageRoutes.delete("/:id", ForecastPercentageController.destroy);

ForecastPercentageRoutes.get("/", ForecastPercentageController.list);
ForecastPercentageRoutes.post(
    "/",
    validateBody(RequestForecastPercentageSchema),
    ForecastPercentageController.create,
);
