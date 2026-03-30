import { Hono } from "hono";
import { WarehouseSharedController } from "./warehouse.controller.js";

export const WarehouseSharedRoutes = new Hono();
WarehouseSharedRoutes.get("/", WarehouseSharedController.list);
