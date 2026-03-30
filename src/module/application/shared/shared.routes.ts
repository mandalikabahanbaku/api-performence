import { Hono } from "hono";
import { WarehouseSharedRoutes } from "./warehouse/warehouse.routes.js";

export const SharedRoutes = new Hono();
SharedRoutes.route("/warehouses", WarehouseSharedRoutes);
