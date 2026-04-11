import { Hono } from "hono";
import { validateBody } from "../../../middleware/validation.js";
import { RequestIssuanceSchema } from "./issuance.schema.js";
import { IssuanceController } from "./issuance.controller.js";
import IssuanceImportRoutes from "./import/import.routes.js";

export const IssuanceRoutes = new Hono();
IssuanceRoutes.route("/import", IssuanceImportRoutes);

IssuanceRoutes.get("/rekap", IssuanceController.rekap);
IssuanceRoutes.get("/:product_id", IssuanceController.detail);

IssuanceRoutes.get("/", IssuanceController.list);

IssuanceRoutes.put("/", validateBody(RequestIssuanceSchema), IssuanceController.save);
IssuanceRoutes.post("/", validateBody(RequestIssuanceSchema), IssuanceController.save);
