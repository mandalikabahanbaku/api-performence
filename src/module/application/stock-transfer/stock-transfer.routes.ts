import { Hono } from "hono";
import { StockTransferController } from "./stock-transfer.controller.js";
import { validateBody } from "../../../middleware/validation.js";
import { RequestStockTransferSchema, RequestUpdateStockTransferStatusSchema } from "./stock-transfer.schema.js";

const app = new Hono();

app.get("/", StockTransferController.list);
app.post("/", validateBody(RequestStockTransferSchema), StockTransferController.create);
app.get("/:id", StockTransferController.detail);
app.patch("/:id/status", validateBody(RequestUpdateStockTransferStatusSchema), StockTransferController.updateStatus);

export default app;
