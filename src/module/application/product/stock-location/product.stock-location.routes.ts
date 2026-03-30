import { Hono } from "hono";
import { ProductStockLocationController } from "./product.stock-location.controller.js";

const app = new Hono();

app.get("/", ProductStockLocationController.listStockLocation);
app.get("/locations", ProductStockLocationController.listLocations);

export default app;
