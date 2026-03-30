import { redisClient } from "../config/redis.js";

export class SessionMetrics {
    static async getSessionStats(): Promise<{
        totalSessions: number;
        activeSessions: number;
        expiringSoon: number;
        byRole: Record<string, number>;
    }> {
        const pattern = "session:*";
        const keys = await redisClient.keys(pattern);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        let activeSessions = 0;
        let expiringSoon = 0;
        const byRole: Record<string, number> = {};

        for (const key of keys) {
            try {
                const type = await redisClient.type(key);
                let sessionData: any = null;
                const ttl = await redisClient.ttl(key);

                // Skip sessions that are already expired
                if (ttl <= 0) continue;

                if (type === "hash") {
                    sessionData = await redisClient.hgetall(key);
                } else if (type === "string") {
                    const data = await redisClient.get(key);
                    if (data) {
                        try {
                            sessionData = JSON.parse(data);
                        } catch (error) {
                            continue;
                        }
                    }
                } else {
                    // Unsupported type, skip
                    continue;
                }

                if (!sessionData) continue;

                activeSessions++;

                // Check if session is expiring soon (less than 1 hour)
                if (ttl < 3600) {
                    expiringSoon++;
                }

                // Parse role from session data
                let role = "unknown";
                if (sessionData.role) {
                    role = sessionData.role;
                } else if (sessionData.user && typeof sessionData.user === "string") {
                    try {
                        const user = JSON.parse(sessionData.user);
                        role = user.role || "unknown";
                    } catch (e) {
                        // Ignore parse errors
                    }
                }

                byRole[role] = (byRole[role] || 0) + 1;
            } catch (error) {
                console.error(`Error processing session key ${key}:`, error);
                continue;
            }
        }

        return {
            totalSessions: keys.length,
            activeSessions,
            expiringSoon,
            byRole,
        };
    }

    static async getSessionActivity(): Promise<{
        sessionsByHour: Record<string, number>;
        sessionsByDay: Record<string, number>;
    }> {
        const pattern = "session:*";
        const keys = await redisClient.keys(pattern);

        const sessionsByHour: Record<string, number> = {};
        const sessionsByDay: Record<string, number> = {};

        for (const key of keys) {
            try {
                const type = await redisClient.type(key);
                let createdAt = 0;

                if (type === "hash") {
                    const sessionData = await redisClient.hgetall(key);
                    createdAt = sessionData.createdAt ? parseInt(sessionData.createdAt) : 0;
                } else if (type === "string") {
                    const data = await redisClient.get(key);
                    if (data) {
                        try {
                            const sessionData = JSON.parse(data);
                            createdAt = sessionData.createdAt || 0;
                        } catch (error) {
                            continue;
                        }
                    }
                }

                if (!createdAt) continue;

                const date = new Date(createdAt);

                // Group by hour
                const hourKey = `${date.getFullYear()}-${(date.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}-${date
                    .getDate()
                    .toString()
                    .padStart(2, "0")} ${date.getHours()}:00`;
                sessionsByHour[hourKey] = (sessionsByHour[hourKey] || 0) + 1;

                // Group by day
                const dayKey = `${date.getFullYear()}-${(date.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
                sessionsByDay[dayKey] = (sessionsByDay[dayKey] || 0) + 1;
            } catch (error) {
                console.error(`Error processing session activity for key ${key}:`, error);
            }
        }

        return {
            sessionsByHour,
            sessionsByDay,
        };
    }
}
