import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { dbLogger, logger } from "../lib/logger.js";

const connectionString = env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
    adapter,
    errorFormat: env.isDevelopment ? "pretty" : "minimal",
    log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
    ],
});

prisma.$on("query", (e: any) => {
    if (env.isDevelopment) {
        dbLogger.info("Query executed", {
            type: "QUERY",
            query: e.query,
            duration_ms: e.duration,
        });
    }
});

prisma.$on("error", (e: any) => {
    dbLogger.error("Database error", e);
});

export const initializeDatabase = async (): Promise<void> => {
    logger.info("Connecting to database...");

    // 1. Paksa connect
    await prisma.$connect();

    // 2. Paksa timeout (ANTI STUCK)
    await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Database connection timeout")), 5000),
        ),
    ]);

    logger.info("Database connected successfully");
};

export const closeDatabase = async (): Promise<void> => {
    await prisma.$disconnect();
    logger.info("Database disconnected");
};

export default prisma;
