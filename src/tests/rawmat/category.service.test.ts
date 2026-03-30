import { describe, it, expect, vi, beforeEach } from "vitest";
import { RawMatCategoryService } from "../../module/application/rawmat/category/category.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("RawMatCategoryService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("should throw 400 if category with same name already exists", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" });

            await expect(
                RawMatCategoryService.create({ name: "Fabric" }),
            ).rejects.toThrow(ApiError);
            await expect(
                RawMatCategoryService.create({ name: "Fabric" }),
            ).rejects.toThrow("Category dengan nama tersebut sudah tersedia");
        });

        it("should create category successfully when name is unique", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.rawMatCategories.create.mockResolvedValue({
                id: 3,
                name: "Thread",
                slug: "thread",
                status: "ACTIVE",
            });

            const result = await RawMatCategoryService.create({ name: "Thread" });

            expect(result.id).toBe(3);
            expect(result.slug).toBe("thread");
            // @ts-ignore
            expect(prisma.rawMatCategories.create).toHaveBeenCalledOnce();
        });

        it("should use provided status when creating", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.rawMatCategories.create.mockResolvedValue({
                id: 4,
                name: "Chemical",
                slug: "chemical",
                status: "INACTIVE",
            });

            const result = await RawMatCategoryService.create({ name: "Chemical", status: "INACTIVE" as any });
            expect(result.status).toBe("INACTIVE");
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 404 if category not found", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);

            await expect(
                RawMatCategoryService.update(999, { name: "New Name" }),
            ).rejects.toThrow(ApiError);
            await expect(
                RawMatCategoryService.update(999, { name: "New Name" }),
            ).rejects.toThrow("Category tidak ditemukan");
        });

        it("should throw 400 if new name slug conflicts with another category", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique
                // @ts-ignore
                .mockResolvedValueOnce({ id: 1, name: "Fabric", slug: "fabric" }) // existing
                // @ts-ignore
                .mockResolvedValueOnce({ id: 2, name: "Fabrics", slug: "fabrics" }); // conflict

            await expect(
                RawMatCategoryService.update(1, { name: "Fabrics" }),
            ).rejects.toThrow("Slug category sudah digunakan");
        });

        it("should update name and slug successfully", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique
                // @ts-ignore
                .mockResolvedValueOnce({ id: 1, name: "Fabric", slug: "fabric" }) // existing
                // @ts-ignore
                .mockResolvedValueOnce(null); // no conflict
            // @ts-ignore
            prisma.rawMatCategories.update.mockResolvedValue({
                id: 1,
                name: "Thread",
                slug: "thread",
                status: "ACTIVE",
            });

            const result = await RawMatCategoryService.update(1, { name: "Thread" });

            expect(result.name).toBe("Thread");
            // @ts-ignore
            expect(prisma.rawMatCategories.update).toHaveBeenCalledOnce();
        });

        it("should update status only without touching name", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({
                id: 1,
                name: "Fabric",
                slug: "fabric",
            });
            // @ts-ignore
            prisma.rawMatCategories.update.mockResolvedValue({
                id: 1,
                name: "Fabric",
                slug: "fabric",
                status: "INACTIVE",
            });

            const result = await RawMatCategoryService.update(1, { status: "INACTIVE" as any });
            expect(result.status).toBe("INACTIVE");
        });
    });

    // ─── CHANGE STATUS ────────────────────────────────────────────────────────

    describe("changeStatus", () => {
        it("should throw 404 if category not found", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);

            await expect(
                // @ts-ignore
                RawMatCategoryService.changeStatus(999, "INACTIVE"),
            ).rejects.toThrow(ApiError);
        });

        it("should update status successfully", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" });
            // @ts-ignore
            prisma.rawMatCategories.update.mockResolvedValue({ id: 1, status: "INACTIVE" });

            // @ts-ignore
            const result = await RawMatCategoryService.changeStatus(1, "INACTIVE");
            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.rawMatCategories.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { status: "INACTIVE" } }),
            );
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return category detail", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([
                { id: 1, name: "Fabric", slug: "fabric", status: "ACTIVE", created_at: new Date(), updated_at: null },
            ]);

            const result = await RawMatCategoryService.detail(1);
            expect(result.id).toBe(1);
            expect(result.name).toBe("Fabric");
        });

        it("should throw 404 if not found", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([]);

            await expect(RawMatCategoryService.detail(999)).rejects.toThrow("Category tidak ditemukan");
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        const mockRow = {
            id: 1,
            name: "Fabric",
            slug: "fabric",
            status: "ACTIVE",
            created_at: new Date(),
            updated_at: null,
        };

        it("should return list with pagination", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([mockRow])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 1n }]);

            const result = await RawMatCategoryService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "desc",
            });

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
            expect(result.data[0]?.name).toBe("Fabric");
        });

        it("should return empty list when no data", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 0n }]);

            const result = await RawMatCategoryService.list({ page: 1, take: 10 });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });

        it("should filter by status and search", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([mockRow])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 1n }]);

            const result = await RawMatCategoryService.list({
                page: 1,
                take: 10,
                status: "ACTIVE" as any,
                search: "Fab",
            });

            expect(result).toBeDefined();
        });
    });

    // ─── DELETE ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("should throw 404 if category not found", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);

            await expect(RawMatCategoryService.delete(999)).rejects.toThrow(ApiError);
            await expect(RawMatCategoryService.delete(999)).rejects.toThrow("Category tidak ditemukan");
        });

        it("should throw 400 if category is still used by raw materials", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(3);

            await expect(RawMatCategoryService.delete(1)).rejects.toThrow(ApiError);
            await expect(RawMatCategoryService.delete(1)).rejects.toThrow(
                "Category masih digunakan oleh beberapa Raw Material",
            );
        });

        it("should delete category successfully when not in use", async () => {
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(0);
            // @ts-ignore
            prisma.rawMatCategories.delete.mockResolvedValue({ id: 1 });

            await expect(RawMatCategoryService.delete(1)).resolves.toBeUndefined();
            // @ts-ignore
            expect(prisma.rawMatCategories.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });
});
