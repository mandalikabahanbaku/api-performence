import { Hono } from "hono";
import { ReturnController } from "./return.controller.js";

const router = new Hono();

router.get("/", ReturnController.list);
router.post("/", ReturnController.create);
router.get("/:id", ReturnController.detail);
router.patch("/:id/status", ReturnController.updateStatus);

export default router;
