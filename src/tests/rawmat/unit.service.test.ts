import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnitRawMaterialService } from "../../module/application/rawmat/unit/unit.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("UnitRawMaterialService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        it("should throw 400 if unit with same name already exists", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });

            await expect(
                UnitRawMaterialService.create({ name: "meter" }),
            ).rejects.toThrow(ApiError);
            await expect(
                UnitRawMaterialService.create({ name: "meter" }),
            ).rejects.toThrow("Unit dengan nama tersebut sudah tersedia");
        });

        it("should create unit successfully when name is unique", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.create.mockResolvedValue({ id: 4, name: "liter", slug: "liter" });

            const result = await UnitRawMaterialService.create({ name: "liter" });

            expect(result.id).toBe(4);
            expect(result.slug).toBe("liter");
            // @ts-ignore
            expect(prisma.unitRawMaterial.create).toHaveBeenCalledOnce();
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 404 if unit not found", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);

            await expect(UnitRawMaterialService.update(999, { name: "liter" })).rejects.toThrow(ApiError);
            await expect(UnitRawMaterialService.update(999, { name: "liter" })).rejects.toThrow(
                "Unit tidak ditemukan",
            );
        });

        it("should throw 400 if no name provided", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });

            await expect(UnitRawMaterialService.update(1, {})).rejects.toThrow(ApiError);
            await expect(UnitRawMaterialService.update(1, {})).rejects.toThrow("Nama unit wajib diisi");
        });

        it("should throw 400 if new name slug conflicts with another unit", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });
            // @ts-ignore
            prisma.unitRawMaterial.findFirst.mockResolvedValue({ id: 2, name: "kg", slug: "kg" });

            await expect(UnitRawMaterialService.update(1, { name: "kg" })).rejects.toThrow(ApiError);
            await expect(UnitRawMaterialService.update(1, { name: "kg" })).rejects.toThrow(
                "Nama unit menghasilkan slug yang sudah digunakan",
            );
        });

        it("should update unit successfully", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });
            // @ts-ignore
            prisma.unitRawMaterial.findFirst.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.update.mockResolvedValue({ id: 1, name: "Meter Baru", slug: "meter-baru" });

            const result = await UnitRawMaterialService.update(1, { name: "Meter Baru" });

            expect(result.name).toBe("Meter Baru");
            // @ts-ignore
            expect(prisma.unitRawMaterial.update).toHaveBeenCalledOnce();
        });

        it("should update without conflict check when slug is unchanged", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "Meter", slug: "meter" });
            // @ts-ignore
            prisma.unitRawMaterial.update.mockResolvedValue({ id: 1, name: "Meter", slug: "meter" });

            // Same slug → no findFirst call
            const result = await UnitRawMaterialService.update(1, { name: "Meter" });

            expect(result.slug).toBe("meter");
            // @ts-ignore
            expect(prisma.unitRawMaterial.findFirst).not.toHaveBeenCalled();
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return unit detail", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ id: 1, name: "meter", slug: "meter" }]);

            const result = await UnitRawMaterialService.detail(1);
            expect(result.id).toBe(1);
            expect(result.name).toBe("meter");
        });

        it("should throw 404 if unit not found", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([]);

            await expect(UnitRawMaterialService.detail(999)).rejects.toThrow("Unit tidak ditemukan");
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        it("should return list with pagination", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([
                    { id: 1, name: "meter", slug: "meter" },
                    { id: 2, name: "kg", slug: "kg" },
                ])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 2n }]);

            const result = await UnitRawMaterialService.list({ page: 1, take: 10 });

            expect(result.data).toHaveLength(2);
            expect(result.len).toBe(2);
        });

        it("should return empty list when no units", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 0n }]);

            const result = await UnitRawMaterialService.list({ page: 1, take: 10 });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });

        it("should filter by search term", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([{ id: 1, name: "meter", slug: "meter" }])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 1n }]);

            const result = await UnitRawMaterialService.list({
                page: 1,
                take: 10,
                search: "met",
                sortBy: "name",
                sortOrder: "asc",
            });

            expect(result.data).toHaveLength(1);
        });
    });

    // ─── DELETE ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("should throw 404 if unit not found", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);

            await expect(UnitRawMaterialService.delete(999)).rejects.toThrow(ApiError);
            await expect(UnitRawMaterialService.delete(999)).rejects.toThrow("Unit tidak ditemukan");
        });

        it("should throw 400 if unit is still used by raw materials", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(4);

            await expect(UnitRawMaterialService.delete(1)).rejects.toThrow(ApiError);
            await expect(UnitRawMaterialService.delete(1)).rejects.toThrow(
                "Satuan masih digunakan oleh beberapa Raw Material",
            );
        });

        it("should delete unit successfully when not in use", async () => {
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1, name: "meter", slug: "meter" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(0);
            // @ts-ignore
            prisma.unitRawMaterial.delete.mockResolvedValue({ id: 1 });

            const result = await UnitRawMaterialService.delete(1);

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.unitRawMaterial.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });
});
