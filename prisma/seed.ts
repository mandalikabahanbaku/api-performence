import prisma from "../src/config/prisma.js";

async function seed() {
    console.log("🌱 Cleaning up Forecast data...");

  try {
        const minQty = 1;
        const findRecipe = await prisma.recipes.updateMany({
            where: { quantity: { gte: minQty } },
            data: {
                use_size_calc: false,
            },
        });

        console.log(`✅ Found ${findRecipe.count} recipes.`);
        // const delForecast = await prisma.forecast.deleteMany({});
        // const delPercentage = await prisma.forecastPercentage.deleteMany({});
        // const delPo = await prisma.rawMaterialOpenPo.deleteMany({});
        // const delDraft = await prisma.materialPurchaseDraft.deleteMany({});

        // console.log(`✅ Deleted ${delForecast.count} forecast records.`);
        // console.log(`✅ Deleted ${delPercentage.count} forecast percentage records.`);
        // console.log(`✅ Deleted ${delPo.count} open po records.`);
        // console.log(`✅ Deleted ${delDraft.count} work order/purchase draft records.`);

        // console.log("🌱 Cleanup completed.");
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
