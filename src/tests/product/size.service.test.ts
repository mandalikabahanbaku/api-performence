import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductSizeService } from "../../module/application/product/size/size.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("ProductSizeService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────
    describe("create", () => {
        it("should throw 400 if size already exists", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue({ id: 1, size: 40 });

            await expect(ProductSizeService.create({ size: 40 })).rejects.toThrow(ApiError);
        });

        it("should create size successfully when unique", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.productSize.create.mockResolvedValue({ id: 5, size: 44 });

            const result = await ProductSizeService.create({ size: 44 });

            expect(result.id).toBe(5);
            expect(result.size).toBe(44);
            // @ts-ignore
            expect(prisma.productSize.create).toHaveBeenCalledOnce();
        });
    });

    // ─── LIST ─────────────────────────────────────────────────
    describe("list", () => {
        it("should return all sizes with count", async () => {
            // @ts-ignore
            prisma.productSize.findMany.mockResolvedValue([
                { id: 1, size: 38 },
                { id: 2, size: 40 },
                { id: 3, size: 42 },
            ]);
            // @ts-ignore
            prisma.productSize.count.mockResolvedValue(3);

            const result = await ProductSizeService.list({ page: 1, take: 10 });

            expect(result.data).toHaveLength(3);
            expect(result.len).toBe(3);
        });

        it("should filter by specific size value", async () => {
            // @ts-ignore
            prisma.productSize.findMany.mockResolvedValue([{ id: 2, size: 40 }]);
            // @ts-ignore
            prisma.productSize.count.mockResolvedValue(1);

            const result = await ProductSizeService.list({ search: 40, page: 1, take: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.size).toBe(40);
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────
    describe("update", () => {
        it("should throw 404 if size not found", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue(null);

            await expect(ProductSizeService.update(999, { size: 50 })).rejects.toThrow(ApiError);
        });

        it("should throw 400 if new size value already in use", async () => {
            // @ts-ignore
            prisma.productSize.findUnique
                // @ts-ignore
                .mockResolvedValueOnce({ id: 1, size: 40 }) // exist check
                // @ts-ignore
                .mockResolvedValueOnce({ id: 2, size: 42 }); // conflict check

            await expect(ProductSizeService.update(1, { size: 42 })).rejects.toThrow(ApiError);
        });

        it("should update size successfully", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValueOnce({ id: 1, size: 40 });
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValueOnce(null); // no conflict
            // @ts-ignore
            prisma.productSize.update.mockResolvedValue({ id: 1, size: 41 });

            const result = await ProductSizeService.update(1, { size: 41 });

            expect(result.size).toBe(41);
            // @ts-ignore
            expect(prisma.productSize.update).toHaveBeenCalledOnce();
        });
    });

    // ─── DESTROY ──────────────────────────────────────────────
    describe("delete", () => {
        it("should throw 404 if size not found", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue(null);

            await expect(ProductSizeService.delete(999)).rejects.toThrow(ApiError);
        });

        it("should throw 400 if size still used by products", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue({
                id: 1,
                size: 40,
                _count: { products: 8 },
            });

            await expect(ProductSizeService.delete(1)).rejects.toThrow(ApiError);
        });

        it("should delete size permanently when not referenced by any product", async () => {
            // @ts-ignore
            prisma.productSize.findUnique.mockResolvedValue({
                id: 1,
                size: 40,
                _count: { products: 0 },
            });
            // @ts-ignore
            prisma.productSize.delete.mockResolvedValue({ id: 1 });

            await expect(ProductSizeService.delete(1)).resolves.toBeUndefined();
            // @ts-ignore
            expect(prisma.productSize.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });
});
