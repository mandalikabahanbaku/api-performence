import { Hono } from "hono";
import { ProductSizeController } from "./size.controller.js";
import { validateBody } from "../../../../middleware/validation.js";
import { RequestSizeSchema } from "./size.schema.js";

export const SizeRoutes = new Hono();

SizeRoutes.get("/", ProductSizeController.list);
SizeRoutes.post("/", validateBody(RequestSizeSchema), ProductSizeController.create);
SizeRoutes.put("/:id", validateBody(RequestSizeSchema.partial()), ProductSizeController.update);
SizeRoutes.delete("/:id", ProductSizeController.delete);
