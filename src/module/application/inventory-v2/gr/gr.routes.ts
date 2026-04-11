import { Hono } from "hono";
import { GRController } from "./gr.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import { RequestGoodsReceiptSchema } from "./gr.schema.js";

export const GRRoutes = new Hono();

GRRoutes.get("/", GRController.list);
GRRoutes.get("/export", GRController.export);
GRRoutes.get("/:id", GRController.detail);
GRRoutes.get("/:id/export", GRController.exportDetail);
GRRoutes.post("/", validateBody(RequestGoodsReceiptSchema), GRController.create);
GRRoutes.post("/:id/post", GRController.post);
GRRoutes.patch("/:id/cancel", GRController.cancel);

export default GRRoutes;
