import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductService } from "../../module/application/product/product.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("ProductService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("create", () => {
        it("should create a product successfully", async () => {
            const mockBody = {
                code: "TSHIRT",
                name: "Cool T-Shirt",
                size: 40,
                gender: "UNISEX" as any,
                product_type: "Apparel",
                unit: "pcs",
            };

            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(null);

            const result = await ProductService.create(mockBody as any);

            expect(result).toBeDefined();
            expect(result.code).toBe("TSHIRT");
            // @ts-ignore
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it("should throw error if product code already exists", async () => {
            const mockBody = {
                code: "TSHIRT",
                name: "Cool T-Shirt",
            };

            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });

            await expect(ProductService.create(mockBody as any)).rejects.toThrow(ApiError);
        });
    });

    describe("list", () => {
        it("should return list of products", async () => {
            const mockProducts = [
                {
                    id: 1,
                    name: "Product 1",
                    z_value: "1.65",
                    distribution_percentage: "0.5",
                    safety_percentage: "0.1",
                },
                {
                    id: 2,
                    name: "Product 2",
                    z_value: "1.65",
                    distribution_percentage: "0.5",
                    safety_percentage: "0.1",
                },
            ];
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce(mockProducts);
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ count: 2n }]);

            const result = await ProductService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "desc",
            });

            expect(result.data).toHaveLength(2);
            expect(result.len).toBe(2);
            expect(result.data?.[0]?.z_value).toBe(1.65);
            expect(result.data?.[0]?.distribution_percentage).toBe(0.5);
            expect(result.data?.[0]?.safety_percentage).toBe(0.1);
        });
    });

    describe("detail", () => {
        it("should return product detail", async () => {
            const mockProduct = {
                id: 1,
                name: "Product 1",
                z_value: "1.65",
                distribution_percentage: "0.5",
                safety_percentage: "0.1",
                product_inventories: [],
                recipes: []
            };
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            const result = await ProductService.detail(1);

            expect(result.id).toBe(1);
            expect(result.z_value).toBe(1.65);
            expect(result.distribution_percentage).toBe(0.5);
            expect(result.safety_percentage).toBe(0.1);
        });

        it("should throw error if product not found", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(ProductService.detail(999)).rejects.toThrow(ApiError);
        });
    });

    describe("status", () => {
        it("should update product status", async () => {
            // @ts-ignore
            prisma.product.findUnique.mockResolvedValue({ id: 1 });

            await ProductService.status(1, "ACTIVE" as any);

            // @ts-ignore
            expect(prisma.product.update).toHaveBeenCalledWith({
                where: { id: 1 },
                data: { deleted_at: null, status: "ACTIVE" },
            });
        });
    });
});
