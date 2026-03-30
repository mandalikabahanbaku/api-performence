import { env } from "../config/env.js";
import { v4 as uuid } from "uuid";
import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { redisClient } from "../config/redis.js";
import { Account, User } from "../generated/prisma/client.js";

type UserResDTO = Omit<User, "created_at" | "updated_at" | "deleted_at" | "id" | "account_id">;
type AccountResDTO = Omit<
    Account & {
        user: UserResDTO;
    },
    "password" | "created_at" | "updated_at" | "deleted_at" | "id"
>;

// Cache session data dalam memory untuk mengurangi Redis calls
export const sessionCache = new Map<string, { data: any; expiry: number }>();

export class SessionManager {
    static async createMultipleSessions(
        sessions: Array<{
            email: string;
            data: AccountResDTO;
            ttl?: number;
        }>
    ): Promise<string[]> {
        const pipeline = redisClient.pipeline();
        const sessionIds: string[] = [];

        for (const session of sessions) {
            const sessionId = uuid();
            const sessionKey = `session:${sessionId}`;
            const ttl = session.ttl || env.SESSION_TTL;
            const sessionData = {
                ...session.data,
                createdAt: Date.now().toString(),
                lastActivity: Date.now().toString(),
            };

            // Save as hash
            pipeline.set(sessionKey, JSON.stringify(sessionData));
            pipeline.expire(sessionKey, ttl);

            sessionIds.push(sessionId);
        }

        await pipeline.exec();
        return sessionIds;
    }

    static async getSessionWithFallback(sessionId: string): Promise<AccountResDTO | null> {
        try {
            const sessionKey = `session:${sessionId}`;
            const type = await redisClient.type(sessionKey);

            let sessionData: any = {};
            if (type === "hash") {
                sessionData = await redisClient.hgetall(sessionKey);
            } else if (type === "string") {
                const data = await redisClient.get(sessionKey);
                if (data) sessionData = JSON.parse(data);
            }

            // Parse user object if exists
            if (sessionData.user && typeof sessionData.user === "string") {
                try {
                    sessionData.user = JSON.parse(sessionData.user);
                } catch (e) {
                    console.error("Error parsing user data:", e);
                }
            }

            return sessionData;
        } catch (error) {
            console.error("Session retrieval error:", error);
            return null;
        }
    }

    static async updateSessionData(sessionId: string, data: Partial<AccountResDTO>): Promise<void> {
        const sessionKey = `session:${sessionId}`;

        // Get existing session data
        const existing = await redisClient.hgetall(sessionKey);
        if (!existing || Object.keys(existing).length === 0) return;

        // Prepare updated data
        const updateData: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
            if (key === "user" && typeof value === "object") {
                updateData.user = JSON.stringify(value);
            } else if (value !== undefined) {
                updateData[key] = value!.toString();
            }
        }

        updateData.lastActivity = Date.now().toString();

        // Get current TTL
        const ttl = await redisClient.ttl(sessionKey);
        if (ttl > 0) {
            await redisClient.set(sessionKey, JSON.stringify(updateData));
            sessionCache.delete(sessionId);
        }
    }

    static async cleanupInactiveSessions(
        maxInactiveHours = 24,
        batchSize = 500 // Batasi jumlah operasi per batch
    ): Promise<number> {
        const pattern = "session:*";
        const cutoffTime = Date.now() - maxInactiveHours * 60 * 60 * 1000;
        let cleanedCount = 0;
        let cursor = "0";

        try {
            do {
                // Gunakan SCAN untuk iterasi yang aman
                const [nextCursor, keys] = await redisClient.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    batchSize
                );

                cursor = nextCursor;

                if (keys.length === 0) continue;

                const pipeline = redisClient.pipeline();
                const mgetKeys = [];

                // Kumpulkan keys untuk pemeriksaan
                for (const key of keys) {
                    mgetKeys.push(key);
                }

                // Gunakan MGET untuk efisiensi
                const sessionDataList = await redisClient.mget(...mgetKeys);

                for (let i = 0; i < sessionDataList.length; i++) {
                    const data = sessionDataList[i];
                    const key = keys[i];

                    if (!data) {
                        pipeline.del(String(key));
                        cleanedCount++;
                        continue;
                    }

                    try {
                        const session = JSON.parse(data);
                        const lastActivity = session.lastActivity || 0;

                        if (lastActivity < cutoffTime) {
                            pipeline.del(String(key));
                            cleanedCount++;
                        }
                    } catch (error) {
                        // Data korup
                        pipeline.del(String(key));
                        cleanedCount++;
                    }
                }

                // Eksekusi pipeline dalam batch
                if (pipeline.length > 0) {
                    await pipeline.exec();
                }
            } while (cursor !== "0");

            return cleanedCount;
        } catch (error) {
            console.error("Cleanup error:", error);
            return 0;
        }
    }

    static getCurrentSessionId(c: Context): string | null {
        try {
            // Gunakan getCookie untuk mendapatkan nilai cookie
            return getCookie(c, env.SESSION_COOKIE_NAME) || null;
        } catch (error) {
            console.error("Error getting session cookie:", error);
            return null;
        }
    }

    static async getUserActiveSessions(
        email: string,
        c: Context
    ): Promise<
        Array<{
            sessionId: string;
            lastActivity: number;
            createdAt: number;
            userAgent?: string;
            ipAddress?: string;
            location?: string;
            isCurrent?: boolean;
        }>
    > {
        const pattern = "session:*";
        const keys = await redisClient.keys(pattern);
        const userSessions: any[] = [];

        // Gunakan method yang sudah diperbaiki
        const currentSessionId = this.getCurrentSessionId(c);

        for (const key of keys) {
            try {
                const type = await redisClient.type(key);
                let sessionData: Record<string, string> = {};

                if (type === "hash") {
                    sessionData = await redisClient.hgetall(key);
                } else if (type === "string") {
                    const data = await redisClient.get(key);
                    if (data) sessionData = JSON.parse(data);
                } else {
                    console.warn(`Unsupported data type for key ${key}: ${type}`);
                    continue;
                }

                if (sessionData.email === email) {
                    const sessionId = key.replace("session:", "");
                    // const location = await this.getLocationFromIP(sessionData.ip || "");

                    userSessions.push({
                        sessionId,
                        lastActivity: sessionData.lastActivity
                            ? parseInt(sessionData.lastActivity)
                            : Date.now(),
                        createdAt: sessionData.createdAt
                            ? parseInt(sessionData.createdAt)
                            : Date.now(),
                        userAgent: sessionData.userAgent,
                        ipAddress: sessionData.ip,
                        // location,
                        isCurrent: sessionId === currentSessionId,
                    });
                }
            } catch (error) {
                console.error(`Error processing session ${key}:`, error);
                continue;
            }
        }

        return userSessions.sort((a, b) => b.lastActivity - a.lastActivity);
    }

    // static async getLocationFromIP(ip: string): Promise<string> {
    // 	if (!ip || ip === "Unknown") return "Unknown";
    // 	if (ip.startsWith("127.0.0.") || ip === "::1") return "Local";

    // 	try {
    // 		const response = await fetch(`https://ipinfo.io/${ip}/json?token=${env.IPINFO_TOKEN}`);
    // 		const data = (await response.json()) as any;

    // 		if (data.error) return "Unknown";
    // 		if (!data.city) return "Unknown";

    // 		return `${data.city}, ${data.region}, ${data.country}`;
    // 	} catch (error) {
    // 		console.error("Geolocation error:", error);
    // 		return "Unknown";
    // 	}
    // }

    static async revokeOtherUserSessions(
        email: string,
        currentSessionId: string,
        c: Context
    ): Promise<number> {
        const userSessions = await this.getUserActiveSessions(email, c);
        const sessionsToRevoke = userSessions
            .filter((session) => session.sessionId !== currentSessionId)
            .map((session) => `session:${session.sessionId}`);

        if (sessionsToRevoke.length > 0) {
            await redisClient.del(sessionsToRevoke);
            for (const sessionId of sessionsToRevoke) {
                sessionCache.delete(sessionId.replace("session:", ""));
            }
        }

        return sessionsToRevoke.length;
    }

    static async migrateSessions(): Promise<number> {
        const keys = await redisClient.keys("session:*");
        let migrated = 0;

        for (const key of keys) {
            try {
                const type = await redisClient.type(key);
                if (type !== "string") continue;

                const data = await redisClient.get(key);
                if (!data) continue;

                const ttl = await redisClient.ttl(key);
                const sessionData = JSON.parse(data);

                await redisClient.del(String(key));
                await redisClient.set(key, JSON.stringify(sessionData));
                if (ttl > 0) await redisClient.expire(key, ttl);

                migrated++;
            } catch (error) {
                console.error(`Migration error for ${key}:`, error);
            }
        }

        return migrated;
    }
}
