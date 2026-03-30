import { Hono } from "hono";
import { validateBody } from "../../../../middleware/validation.js";
import { SupplierController } from "./supplier.controller.js";
import { RequestSupplierSchema } from "./supplier.schema.js";

export const SupplierRoutes = new Hono();

SupplierRoutes.get("/:id", SupplierController.detail);

SupplierRoutes.put(
    "/:id",
    validateBody(RequestSupplierSchema.partial()),
    SupplierController.update,
);

SupplierRoutes.delete("/:id", SupplierController.delete);

SupplierRoutes.post("/", validateBody(RequestSupplierSchema), SupplierController.create);

SupplierRoutes.get("/", SupplierController.list);
