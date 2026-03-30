import { redisClient } from "../../../../../config/redis.js";

const PREFIX = "rawmat-inventory:import:";

export class RawMaterialInventoryImportCacheService {
    static key(importId: string) {
        return `${PREFIX}${importId}`;
    }

    static async save(importId: string, payload: any, ttl = 300) {
        await redisClient.set(this.key(importId), JSON.stringify(payload), "EX", ttl);
    }

    static async get(importId: string) {
        const raw = await redisClient.get(this.key(importId));
        return raw ? JSON.parse(raw) : null;
    }

    static async exists(importId: string) {
        return (await redisClient.exists(this.key(importId))) === 1;
    }

    static async remove(importId: string) {
        await redisClient.del(this.key(importId));
    }

    static async listActiveKeys() {
        return redisClient.keys(`${PREFIX}*`);
    }
}
