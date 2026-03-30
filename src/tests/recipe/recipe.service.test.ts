import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecipeService } from "../../module/application/recipe/recipe.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

// ── Shared mock data ──────────────────────────────────────────────────────────

const mockRawQueryCount = [{ total: 1n }];

const mockRawRecipeRow = {
    id: 1,
    quantity: "2.50",
    product_id: 1,
    product_name: "T-Shirt",
    product_code: "TSHIRT",
    pt_id: 1,
    pt_name: "Apparel",
    pt_slug: "apparel",
    unit_id: 1,
    unit_name: "pcs",
    unit_slug: "pcs",
    size_id: 1,
    size_val: 40,
    rm_name: "Kain Katun",
    rm_barcode: "RM-001",
    rm_price: "50000",
    urm_id: 1,
    urm_name: "meter",
    current_stock: "100",
};

const mockRawDetailRows = [
    {
        product_id: 1,
        code: "TSHIRT",
        name: "T-Shirt",
        type_name: "Apparel",
        unit_name: "pcs",
        raw_mat_id: 1,
        barcode: "RM-001",
        rm_name: "Kain Katun",
        rm_price: "50000",
        rm_quantity: "2.50",
        urm_name: "meter",
    },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("RecipeService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── UPSERT ────────────────────────────────────────────────────────────────

    describe("upsert", () => {
        const validBody = {
            product_id: 1,
            raw_material: [
                { raw_material_id: 1, quantity: 2.5 },
                { raw_material_id: 2, quantity: 1.0 },
            ],
        };

        it("should upsert recipe successfully", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });
            // @ts-ignore
            prisma.rawMaterial.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

            const result = await RecipeService.upsert(validBody);

            expect(result).toMatchObject({
                product_id: 1,
                total_material: 2,
            });
            // @ts-ignore
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it("should throw 400 if raw_material has duplicate ids", async () => {
            const body = {
                product_id: 1,
                raw_material: [
                    { raw_material_id: 1, quantity: 2 },
                    { raw_material_id: 1, quantity: 3 },
                ],
            };

            await expect(RecipeService.upsert(body)).rejects.toThrow(ApiError);
            await expect(RecipeService.upsert(body)).rejects.toThrow("Raw material tidak boleh duplikasi");
        });

        it("should throw 404 if product not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(RecipeService.upsert(validBody)).rejects.toThrow(ApiError);
            await expect(RecipeService.upsert(validBody)).rejects.toThrow("Produk tidak ditemukan");
        });

        it("should throw 404 if one or more raw materials not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });
            // only one found, but two requested
            // @ts-ignore
            prisma.rawMaterial.findMany.mockResolvedValue([{ id: 1 }]);

            await expect(RecipeService.upsert(validBody)).rejects.toThrow(ApiError);
            await expect(RecipeService.upsert(validBody)).rejects.toThrow("tidak ditemukan");
        });

        it("should not call $transaction if product not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(RecipeService.upsert(validBody)).rejects.toThrow(ApiError);
            // @ts-ignore
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    // ── LIST ──────────────────────────────────────────────────────────────────

    describe("list", () => {
        it("should return list of recipes", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore — count then rows
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "desc" });

            expect(result.len).toBe(1);
            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.quantity).toBe(2.5);
            expect(result.data[0]?.product?.name).toBe("T-Shirt");
            expect(result.data[0]?.raw_material?.name).toBe("Kain Katun");
            expect(result.data[0]?.raw_material?.current_stock).toBe(100);
        });

        it("should return empty list when count is 0", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce([{ total: 0n }]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "desc" });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
            // rawMaterialInventory.findFirst is ORM (not $queryRaw); only count query fires
            // @ts-ignore
            expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        });

        it("should filter by product_id", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "asc", product_id: 1 });
            expect(result.len).toBe(1);
        });

        it("should filter by raw_mat_id", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "desc", raw_mat_id: 1 });
            expect(result.len).toBe(1);
        });

        it("should filter by search term", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({
                sortBy: "product",
                sortOrder: "desc",
                search: "kain",
            });
            expect(result.data[0]?.raw_material?.name).toBe("Kain Katun");
        });

        it("should sort by quantity ascending", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue({ month: 3, year: 2025 });
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({ sortBy: "quantity", sortOrder: "asc" });
            expect(result.len).toBe(1);
        });

        it("should handle product_type and unit as null", async () => {
            const rowNoType = { ...mockRawRecipeRow, pt_id: null, pt_name: null, pt_slug: null, unit_id: null, unit_name: null, unit_slug: null };
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue(null);
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([rowNoType]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "desc" });
            expect(result.data[0]?.product?.product_type).toBeNull();
            expect(result.data[0]?.product?.unit).toBeNull();
        });

        it("should use current date as fallback when no inventory period found", async () => {
            // @ts-ignore
            prisma.rawMaterialInventory.findFirst.mockResolvedValue(null);
            // @ts-ignore
            (prisma.$queryRaw as any)
                .mockResolvedValueOnce(mockRawQueryCount)
                .mockResolvedValueOnce([mockRawRecipeRow]);

            const result = await RecipeService.list({ sortBy: "product", sortOrder: "desc" });
            expect(result.len).toBe(1);
        });
    });

    // ── DETAIL ────────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return recipe detail for a product", async () => {
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce(mockRawDetailRows);

            const result = await RecipeService.detail(1);

            expect(result.product_id).toBe(1);
            expect(result.code).toBe("TSHIRT");
            expect(result.name).toBe("T-Shirt");
            expect(result.type).toBe("Apparel");
            expect(result.unit).toBe("pcs");
            expect(result.recipes).toHaveLength(1);
            expect(result.recipes[0]?.raw_mat_id).toBe(1);
            expect(result.recipes[0]?.quantity).toBe(2.5);
            expect(result.recipes[0]?.price).toBe(50000);
        });

        it("should return empty recipes array if product has no BOM", async () => {
            const rowNoRecipe = [{
                product_id: 1,
                code: "TSHIRT",
                name: "T-Shirt",
                type_name: "Apparel",
                unit_name: "pcs",
                raw_mat_id: null,
                barcode: null,
                rm_name: null,
                rm_price: null,
                rm_quantity: null,
                urm_name: null,
            }];
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce(rowNoRecipe);

            const result = await RecipeService.detail(1);
            expect(result.recipes).toHaveLength(0);
        });

        it("should throw 404 if product not found", async () => {
            // Use mockResolvedValue (persistent override) to reliably overwrite the global setup implementation
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValue([]);

            await expect(RecipeService.detail(999)).rejects.toThrow(ApiError);
            await expect(RecipeService.detail(999)).rejects.toThrow("tidak ditemukan");
        });

        it("should use empty string for missing type/unit", async () => {
            const rowNoType = [{ ...mockRawDetailRows[0], type_name: null, unit_name: null }];
            // @ts-ignore
            (prisma.$queryRaw as any).mockResolvedValueOnce(rowNoType);

            const result = await RecipeService.detail(1);
            expect(result.type).toBe("");
            expect(result.unit).toBe("");
        });
    });
});
