import { describe, it, expect, vi, beforeEach } from "vitest";
import { RawMaterialService } from "../../module/application/rawmat/rawmat.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("RawMaterialService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        const mockBody = {
            barcode: "RM-NEW-001",
            name: "Kain Katun Baru",
            price: 50000,
            unit: "meter",
        };

        it("should create raw material successfully", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);

            const result = await RawMaterialService.create(mockBody);

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it("should throw 400 if barcode already exists", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, barcode: "RM-NEW-001" });

            await expect(RawMaterialService.create(mockBody)).rejects.toThrow(ApiError);
            await expect(RawMaterialService.create(mockBody)).rejects.toThrow(
                "Barcode telah digunakan",
            );
        });

        it("should throw 404 if supplier_id provided but supplier not found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(
                RawMaterialService.create({ ...mockBody, supplier_id: 999 }),
            ).rejects.toThrow(ApiError);
            await expect(
                RawMaterialService.create({ ...mockBody, supplier_id: 999 }),
            ).rejects.toThrow("Supplier tidak ditemukan");
        });

        it("should connect to existing unit if slug found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue({ id: 1 });
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue(null);

            const result = await RawMaterialService.create(mockBody);
            expect(result).toBeDefined();
        });

        it("should connect to existing category if slug found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.unitRawMaterial.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.rawMatCategories.findUnique.mockResolvedValue({ id: 1 });

            const result = await RawMaterialService.create({
                ...mockBody,
                raw_mat_category: "Fabric",
            });
            expect(result).toBeDefined();
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 404 if raw material not found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);

            await expect(RawMaterialService.update(999, { name: "Updated" })).rejects.toThrow(
                ApiError,
            );
            await expect(RawMaterialService.update(999, { name: "Updated" })).rejects.toThrow(
                "Data raw material tidak ditemukan",
            );
        });

        it("should throw 404 if supplier_id given but supplier not found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, deleted_at: null });
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(RawMaterialService.update(1, { supplier_id: 999 })).rejects.toThrow(
                ApiError,
            );
        });

        it("should update successfully", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, deleted_at: null });

            const result = await RawMaterialService.update(1, { name: "Updated Name" });
            expect(result).toBeDefined();
            expect(result.name).toContain("Updated");
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        const rawRow = {
            id: 1,
            barcode: "RM-001",
            name: "Kain Katun",
            price: 50000,
            min_buy: 10,
            min_stock: 5,
            lead_time: 7,
            type: "FABRIC",
            deleted_at: null,
            created_at: new Date(),
            updated_at: null,
            unit_id: 1,
            unit_name: "meter",
            unit_slug: "meter",
            cat_id: 1,
            cat_name: "Fabric",
            cat_slug: "fabric",
            sup_id: null,
            sup_name: null,
            sup_country: null,
        };

        it("should return raw material detail", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([rawRow]);

            const result = await RawMaterialService.detail(1);

            expect(result.id).toBe(1);
            expect(result.name).toBe("Kain Katun");
            expect(result.price).toBe(50000);
            expect(result.unit_raw_material).toBeDefined();
        });

        it("should throw 404 if not found", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValue([]);

            await expect(RawMaterialService.detail(999)).rejects.toThrow(ApiError);
            await expect(RawMaterialService.detail(999)).rejects.toThrow(
                "Raw material tidak ditemukan",
            );
        });
    });

    // ─── DELETE (soft) ────────────────────────────────────────────────────────

    describe("delete", () => {
        it("should soft delete raw material", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, deleted_at: null });

            await RawMaterialService.delete(1);

            // @ts-ignore
            expect(prisma.rawMaterial.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ id: 1 }),
                    data: expect.objectContaining({ deleted_at: expect.any(Date) }),
                }),
            );
        });

        it("should throw 404 if raw material not found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);

            await expect(RawMaterialService.delete(999)).rejects.toThrow(ApiError);
        });

        it("should throw 400 if already deleted", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({
                id: 1,
                deleted_at: new Date(),
            });

            await expect(RawMaterialService.delete(1)).rejects.toThrow(ApiError);
            await expect(RawMaterialService.delete(1)).rejects.toThrow(
                "Raw material sudah berada pada status deleted",
            );
        });
    });

    // ─── RESTORE ──────────────────────────────────────────────────────────────

    describe("restore", () => {
        it("should restore raw material", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, deleted_at: new Date() });

            await RawMaterialService.restore(1);

            // @ts-ignore
            expect(prisma.rawMaterial.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ id: 1 }),
                    data: { deleted_at: null },
                }),
            );
        });

        it("should throw 404 if not found", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue(null);

            await expect(RawMaterialService.restore(999)).rejects.toThrow(ApiError);
        });

        it("should throw 400 if not in deleted state", async () => {
            // @ts-ignore
            prisma.rawMaterial.findUnique.mockResolvedValue({ id: 1, deleted_at: null });

            await expect(RawMaterialService.restore(1)).rejects.toThrow(ApiError);
            await expect(RawMaterialService.restore(1)).rejects.toThrow(
                "Raw material tidak berada pada status deleted",
            );
        });
    });

    // ─── CLEAN ────────────────────────────────────────────────────────────────

    describe("clean", () => {
        it("should permanently delete all soft-deleted raw materials", async () => {
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(3);

            const result = await RawMaterialService.clean();
            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.rawMaterial.deleteMany).toHaveBeenCalled();
        });

        it("should throw 400 if no deleted raw materials", async () => {
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(0);

            await expect(RawMaterialService.clean()).rejects.toThrow(ApiError);
            await expect(RawMaterialService.clean()).rejects.toThrow(
                "Tidak ada raw material yang akan dihapus",
            );
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        const rawRow = {
            id: 1,
            barcode: "RM-001",
            name: "Kain Katun",
            price: 50000,
            min_buy: 10,
            min_stock: 5,
            lead_time: 7,
            type: "FABRIC",
            deleted_at: null,
            created_at: new Date(),
            updated_at: null,
            unit_id: 1,
            unit_name: "meter",
            unit_slug: "meter",
            cat_id: 1,
            cat_name: "Fabric",
            cat_slug: "fabric",
            sup_id: null,
            sup_name: null,
            sup_country: null,
        };

        it("should return list of raw materials with pagination", async () => {
            // Promise.all fires data then count
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([rawRow]);
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ count: 1n }]);

            const result = await RawMaterialService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "asc",
                status: "actived",
            });

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
            expect(result.data[0]?.price).toBe(50000);
        });

        it("should filter by type when provided", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([]);
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);

            const result = await RawMaterialService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "asc",
                status: "actived",
                type: "FABRIC" as any,
            });

            expect(result).toBeDefined();
        });

        it("should filter deleted status", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([]);
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);

            const result = await RawMaterialService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "asc",
                status: "deleted",
            });

            expect(result.len).toBe(0);
        });
    });

    // ─── UTILS ────────────────────────────────────────────────────────────────

    describe("getUtils", () => {
        it("should return units, suppliers, and categories", async () => {
            const result = await RawMaterialService.getUtils();

            expect(result).toHaveProperty("units");
            expect(result).toHaveProperty("suppliers");
            expect(result).toHaveProperty("categories");
            expect(Array.isArray(result.units)).toBe(true);
        });
    });

    describe("countUtils", () => {
        it("should return counts for units, suppliers, and categories", async () => {
            const result = await RawMaterialService.countUtils();

            expect(result).toHaveProperty("units");
            expect(result).toHaveProperty("suppliers");
            expect(result).toHaveProperty("categories");
            expect(typeof result.units).toBe("number");
        });
    });
});
