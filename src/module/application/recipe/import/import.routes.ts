import { Hono } from "hono";
import { RecipeImportController } from "./import.controller.js";

const RecipeImportRoutes = new Hono();

RecipeImportRoutes.get("/preview/:import_id", RecipeImportController.getPreview);
RecipeImportRoutes.post("/preview", RecipeImportController.preview);
RecipeImportRoutes.post("/execute", RecipeImportController.execute);

export default RecipeImportRoutes;
