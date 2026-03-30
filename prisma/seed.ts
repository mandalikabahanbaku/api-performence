import prisma from "../src/config/prisma.js";

async function seed() {
    console.log("🌱 Cleaning up Forecast data...");

    try {
        const delForecast = await prisma.forecast.deleteMany({});
        const delPercentage = await prisma.forecastPercentage.deleteMany({});

        console.log(`✅ Deleted ${delForecast.count} forecast records.`);
        console.log(`✅ Deleted ${delPercentage.count} forecast percentage records.`);

        console.log("🌱 Forecast cleanup completed.");
    } catch (error) {
        console.error("❌ Cleanup failed:", error);
        throw error;
    }
}

seed()
    .catch((err) => {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
