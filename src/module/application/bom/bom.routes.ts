import { Hono } from "hono";
import { BOMController } from "./bom.controller.js";

const routes = new Hono();

routes.get("/", BOMController.list);
routes.get("/:id", BOMController.detail);

export default routes;
