import { Hono } from "hono";
import { StockMovementController } from "./stock-movement.controller.js";

const app = new Hono();

app.get("/", StockMovementController.list);
app.get("/:id", StockMovementController.detail);

export default app;
