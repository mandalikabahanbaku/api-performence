import { Hono } from "hono";
import { OutletImportController } from "./import.controller.js";

const app = new Hono();

app.get("/preview/:import_id", OutletImportController.getPreview);
app.post("/preview", OutletImportController.preview);
app.post("/execute", OutletImportController.execute);

export const OutletImportRoutes = app;
