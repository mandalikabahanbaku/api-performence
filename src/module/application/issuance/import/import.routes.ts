import { Hono } from "hono";

import { validateBody } from "../../../../middleware/validation.js";
import { RequestIssuanceImportSchema } from "./import.schema.js";
import IssuanceImportController from "./import.controller.js";

const IssuanceImportRoutes = new Hono();

IssuanceImportRoutes.post("/preview", IssuanceImportController.preview);
IssuanceImportRoutes.post(
    "/execute",
    validateBody(RequestIssuanceImportSchema),
    IssuanceImportController.execute,
);
IssuanceImportRoutes.get("/preview/:id", IssuanceImportController.getPreview);

export default IssuanceImportRoutes;
