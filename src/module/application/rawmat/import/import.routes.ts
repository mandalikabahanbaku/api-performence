import { Hono } from "hono";
import { RawmatImportController } from "./import.controller.js";

const RawmatImportRoutes = new Hono();

RawmatImportRoutes.get("/preview/:import_id", RawmatImportController.getPreview);
RawmatImportRoutes.post("/preview", RawmatImportController.preview);
RawmatImportRoutes.post("/execute", RawmatImportController.execute);

export default RawmatImportRoutes;
