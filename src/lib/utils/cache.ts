import { redisClient } from "../../config/redis.js";

export class Cache {
    static async invalidateList(key: string) {
        const keys = await redisClient.keys(key);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
    }

    /**
     * Helper untuk wrap mutasi + cache invalidation
     */
    static async afterMutation<T>(fn: () => Promise<T>, key: string): Promise<T> {
        const result = await fn();
        await Cache.invalidateList(key);
        return result;
    }
}
