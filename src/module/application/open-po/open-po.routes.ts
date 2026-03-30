import { Hono } from "hono";
import { OpenPoController } from "./open-po.controller.js";

const OpenPoRoutes = new Hono();

OpenPoRoutes.get("/", OpenPoController.list);
OpenPoRoutes.get("/summary", OpenPoController.summary);
OpenPoRoutes.get("/export", OpenPoController.export);
OpenPoRoutes.patch("/:id", OpenPoController.update);

export default OpenPoRoutes;
