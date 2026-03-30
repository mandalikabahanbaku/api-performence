import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

export const redisClient = new Redis({
	port: env.REDIS_PORT,
	host: env.REDIS_HOST,
	password: env.REDIS_PASSWORD,
	db: env.REDIS_DB,
	lazyConnect: true, // Tambahkan ini
});
// Error handling
redisClient.on("error", (err: any) => {
	if (err.code === "ECONNREFUSED") {
		logger.error("Redis connection refused", { error: err.message });
	} else {
		logger.error("Redis error", { error: err.message });
	}
});

redisClient.on("connect", () => {
	logger.info("Redis connected");
});

redisClient.on("ready", () => {
	logger.debug("Redis ready");
});

redisClient.on("reconnecting", () => {
	logger.warn("Redis reconnecting");
});

redisClient.on("end", () => {
	logger.info("Redis connection closed");
});

// Fungsi untuk menutup koneksi dengan aman
export const closeRedisConnection = async () => {
	try {
		// Cek apakah koneksi masih aktif
		if (
			redisClient.status === "connecting" ||
			redisClient.status === "connect" ||
			redisClient.status === "ready"
		) {
			try {
				// Coba tutup dengan graceful
				await redisClient.quit();
				logger.info("Redis connection closed gracefully with QUIT command");
				return;
			} catch (quitError) {
				logger.warn("QUIT command failed, forcing disconnect", {
					error: (quitError as Error).message,
				});
			}
		}

		// Jika QUIT gagal atau status tidak mendukung, gunakan disconnect
		redisClient.disconnect();
		logger.info("Redis connection force-disconnected");
	} catch (error) {
		logger.error("Error closing Redis connection", {
			message: error instanceof Error ? error.message : "Unknown error",
			status: redisClient.status,
		});
	}
};
