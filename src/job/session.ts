import cron from "node-cron";
import { SessionManager } from "../lib/session.management.js";
import { SessionMetrics } from "../lib/monitor.js";

// Gunakan timezone yang sesuai
cron.schedule(
    "0 2 * * *",
    async () => {
        console.log("🚀 Starting session cleanup...");

        try {
            // 🔥 Optimalkan dengan parameter yang lebih agresif
            const cleaned = await SessionManager.cleanupInactiveSessions(24, 1000);
            console.log(`✅ Cleaned up ${cleaned} inactive sessions`);

            // Log metrics secara selektif
            if (cleaned > 0) {
                const metrics = await SessionMetrics.getSessionStats();
                console.log("📊 Session Stats:", metrics);
            }
        } catch (error) {
            console.error("❌ Session cleanup failed:", error);
        }
    },
    {
        timezone: "Asia/Jakarta", // Sesuaikan dengan timezone server
    }
);
