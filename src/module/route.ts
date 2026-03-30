import { Hono } from "hono";
import { AuthRoutes } from "./auth/auth.routes.js";
import { ApplicationRoutes } from "./application/application.routes.js";

export const routes = new Hono();
routes.route("/auth", AuthRoutes);
routes.route("/app", ApplicationRoutes);
