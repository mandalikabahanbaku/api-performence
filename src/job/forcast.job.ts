// src/jobs/forecast.job.ts

// import cron from "node-cron";
// import prisma from "../config/prisma.js";
// import { ForecastService } from "../module/application/forecasts/forecast.service.js";

// export function startForecastJob() {
//     cron.schedule("0 1 1 * *", async () => {
//         const products = await prisma.product.findMany();

//         for (const product of products) {
//             await ForecastService.runRollingForecast(product.id);
//         }

//         console.log("Rolling forecast executed");
//     });
// }
