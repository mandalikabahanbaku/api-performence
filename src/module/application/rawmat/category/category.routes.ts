import { Hono } from "hono";
import { validateBody } from "../../../../middleware/validation.js";
import {
    RequestRawMatCategorySchema,
    UpdateRawMatCategorySchema,
    ChangeStatusRawMatCategorySchema,
} from "./category.schema.js";
import { RawMatCategoryController } from "./category.controller.js";

export const RawMatCategoryRoutes = new Hono();

RawMatCategoryRoutes.post(
    "/",
    validateBody(RequestRawMatCategorySchema),
    RawMatCategoryController.create,
);

RawMatCategoryRoutes.get("/", RawMatCategoryController.list);
RawMatCategoryRoutes.get("/:id", RawMatCategoryController.detail);

RawMatCategoryRoutes.put(
    "/:id",
    validateBody(UpdateRawMatCategorySchema),
    RawMatCategoryController.update,
);

RawMatCategoryRoutes.patch(
    "/:id/status",
    validateBody(ChangeStatusRawMatCategorySchema),
    RawMatCategoryController.changeStatus,
);

RawMatCategoryRoutes.delete("/:id", RawMatCategoryController.delete);
