import { Hono } from "hono";
import { TGController } from "./tg.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import { RequestTransferGudangSchema, UpdateTransferGudangStatusSchema } from "./tg.schema.js";

export const TGRoutes = new Hono();

TGRoutes.get("/", TGController.list);
TGRoutes.get("/export", TGController.export);
TGRoutes.get("/stock", TGController.getStock);
TGRoutes.get("/:id", TGController.detail);

TGRoutes.post("/", validateBody(RequestTransferGudangSchema), TGController.create);
TGRoutes.patch("/:id/status", validateBody(UpdateTransferGudangStatusSchema), TGController.updateStatus);

export default TGRoutes;
