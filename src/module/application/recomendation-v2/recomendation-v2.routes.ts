import { Hono } from "hono";
import { RecomendationV2Controller } from "./recomendation-v2.controller.js";

const routes = new Hono();

routes.get("/", RecomendationV2Controller.list);
routes.get("/export", RecomendationV2Controller.export);
routes.post("/order", RecomendationV2Controller.saveWorkOrder);
routes.post("/approve", RecomendationV2Controller.approveWorkOrder);
routes.post("/bulk-horizon", RecomendationV2Controller.bulkSaveHorizon);
routes.delete("/:id", RecomendationV2Controller.destroyWorkOrder);

export default routes;
