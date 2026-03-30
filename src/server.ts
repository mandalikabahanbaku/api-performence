import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import app from "./app.js";
import { closeRedisConnection, redisClient } from "./config/redis.js";
import { closeDatabase, initializeDatabase } from "./config/prisma.js";
import "./job/session.js";

// Pastikan env terload
console.log("Environment loaded:", {
    PORT: env.PORT,
    HOSTNAME: env.HOSTNAME,
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL ? "defined" : "missing",
    REDIS_HOST: env.REDIS_HOST,
});

// Start server
const port = env.PORT;
const hostname = env.HOSTNAME;
console.log(`Starting server on port ${port}...`);

app.get("/", (c) => {
    console.log("Request received");
    return c.text("Hello Hono!");
});
// const getLocalIp = () => {
//     const nets = networkInterfaces();
//     for (const name of Object.keys(nets)) {
//         for (const net of nets[name]!) {
//             if (net.family === "IPv4" && !net.internal) {
//                 return net.address;
//             }
//         }
//     }
//     return "localhost";
// };

const server = serve(
    {
        fetch: app.fetch,
        hostname,
        port,
    },
    () => {
        logger.info(`Server running at http://${hostname}:${port}`);
    },
);
// Initialize services
const initialize = async () => {
    try {
        console.log("Initializing database...");
        await initializeDatabase();

        console.log("Initializing Redis...");

        // Connect secara manual karena lazyConnect: true
        try {
            await redisClient.connect();

            logger.info("Redis connected successfully");
        } catch (redisError) {
            logger.error("Redis connection failed", redisError);
            throw redisError;
        }
        logger.info("Testing Redis connection...");
        const pong = await redisClient.ping();
        logger.info(`Redis ping response: ${pong}`);

        logger.info("Server initialized successfully");
    } catch (error) {
        logger.error("Initialization failed:", error);
        logger.error("Initialization failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    }
};

initialize();
// startForecastJob();

const shutdown = async () => {
    logger.info("Shutting down server...");

    try {
        // 1. Hentikan server HTTP
        server.close();
        logger.info("HTTP server closed");

        // 2. Tutup koneksi Redis
        await closeRedisConnection();

        // 3. Tutup koneksi database
        await closeDatabase();
    } catch (error) {
        logger.error("Error during shutdown", {
            message: error instanceof Error ? error.message : "Unknown error",
        });
    } finally {
        // Beri sedikit waktu untuk cleanup sebelum exit
        setTimeout(() => process.exit(0), 100);
    }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
