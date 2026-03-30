import { Hono } from "hono";
import { validateBody } from "../../../middleware/validation.js";
import { RequestRecipeSchema } from "./recipe.schema.js";
import { RecipeController } from "./recipe.controller.js";
import RecipeImportRoutes from "./import/import.routes.js";

export const RecipeRoutes = new Hono();
RecipeRoutes.route("/import", RecipeImportRoutes);

RecipeRoutes.get("/:id", RecipeController.detail);
RecipeRoutes.get("/", RecipeController.list);
RecipeRoutes.post("/", validateBody(RequestRecipeSchema), RecipeController.upsert);
