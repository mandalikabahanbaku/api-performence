import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnitService } from "../../module/application/product/unit/unit.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("UnitService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────
    describe("create", () => {
        it("should throw 400 if unit name/slug already exists", async () => {
            // findUnique by slug returns existing → duplikat
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue({ id: 1, name: "pcs", slug: "pcs" });

            await expect(UnitService.create({ name: "pcs" })).rejects.toThrow(ApiError);
        });

        it("should create unit successfully when name is unique", async () => {
            // slug "lusin" belum ada
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unit.create.mockResolvedValue({ id: 5, name: "lusin", slug: "lusin" });

            const result = await UnitService.create({ name: "lusin" });

            expect(result.id).toBe(5);
            expect(result.slug).toBe("lusin");
            // @ts-ignore
            expect(prisma.unit.create).toHaveBeenCalledOnce();
        });
    });

    // ─── LIST ─────────────────────────────────────────────────
    describe("list", () => {
        it("should return list with pagination metadata", async () => {
            // @ts-ignore
            prisma.unit.findMany.mockResolvedValue([
                { id: 1, name: "pcs", slug: "pcs" },
                { id: 2, name: "dozen", slug: "dozen" },
            ]);
            // @ts-ignore
            prisma.unit.count.mockResolvedValue(2);

            const result = await UnitService.list({ page: 1, take: 10 });

            expect(result.data).toHaveLength(2);
            expect(result.len).toBe(2);
        });

        it("should filter by search term", async () => {
            // @ts-ignore
            prisma.unit.findMany.mockResolvedValue([{ id: 1, name: "pcs", slug: "pcs" }]);
            // @ts-ignore
            prisma.unit.count.mockResolvedValue(1);

            const result = await UnitService.list({ search: "pcs", page: 1, take: 10 });

            expect(result.data).toHaveLength(1);
            // @ts-ignore
            expect(prisma.unit.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ name: expect.anything() }),
                }),
            );
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────
    describe("update", () => {
        it("should throw 404 if unit not found", async () => {
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue(null);

            await expect(UnitService.update(999, { name: "new-name" })).rejects.toThrow(ApiError);
        });

        it("should throw 400 if new name slug conflicts with another unit", async () => {
            // existing unit has slug "pcs"
            // @ts-ignore
            prisma.unit.findUnique
                // @ts-ignore
                .mockResolvedValueOnce({ id: 1, name: "pcs", slug: "pcs" }) // exist check
                // @ts-ignore
                .mockResolvedValueOnce({ id: 2, name: "pieces", slug: "pieces" }); // conflict check

            await expect(UnitService.update(1, { name: "pieces" })).rejects.toThrow(ApiError);
        });

        it("should update unit successfully", async () => {
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValueOnce({ id: 1, name: "pcs", slug: "pcs" });
            // no slug conflict
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValueOnce(null);
            // @ts-ignore
            prisma.unit.update.mockResolvedValue({ id: 1, name: "Pieces", slug: "pieces" });

            const result = await UnitService.update(1, { name: "Pieces" });

            expect(result.name).toBe("Pieces");
            // @ts-ignore
            expect(prisma.unit.update).toHaveBeenCalledOnce();
        });
    });

    // ─── DESTROY ──────────────────────────────────────────────
    describe("delete", () => {
        it("should throw 404 if unit not found", async () => {
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue(null);

            await expect(UnitService.delete(999)).rejects.toThrow(ApiError);
        });

        it("should throw 400 if unit is still used by products", async () => {
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue({
                id: 1,
                name: "pcs",
                slug: "pcs",
                _count: { products: 3 },
            });

            await expect(UnitService.delete(1)).rejects.toThrow(ApiError);
        });

        it("should delete unit successfully when not used", async () => {
            // @ts-ignore
            prisma.unit.findUnique.mockResolvedValue({
                id: 1,
                name: "pcs",
                slug: "pcs",
                _count: { products: 0 },
            });
            // @ts-ignore
            prisma.unit.delete.mockResolvedValue({ id: 1 });

            await expect(UnitService.delete(1)).resolves.toBeUndefined();
            // @ts-ignore
            expect(prisma.unit.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });
});
