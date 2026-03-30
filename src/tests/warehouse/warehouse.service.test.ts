import { describe, it, expect, vi, beforeEach } from "vitest";
import { WarehouseService } from "../../module/application/warehouse/warehouse.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

const mockWarehouse = {
    id: 1,
    code: "WH01",
    name: "Gudang Utama",
    type: "FINISH_GOODS",
    deleted_at: null,
    created_at: new Date(),
    updated_at: null,
    warehouse_address: {
        street: "Jl. Industri No. 1",
        district: "Cibodas",
        sub_district: "Cibodas Baru",
        city: "Tangerang",
        province: "Banten",
        country: "Indonesia",
        postal_code: "15138",
        notes: null,
        url_google_maps: null,
        created_at: new Date(),
        updated_at: new Date(),
    },
    _count: {
        product_inventories: 0,
        raw_material_inventories: 0,
        outlet_warehouses: 0,
    },
};

describe("WarehouseService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        const mockBody = {
            code: "WH02",
            name: "Gudang Baru",
            type: "FINISH_GOODS" as const,
            warehouse_address: {
                street: "Jl. Baru No. 5",
                district: "Ciputat",
                sub_district: "Ciputat Timur",
                city: "Tangerang Selatan",
                province: "Banten",
                country: "Indonesia",
                postal_code: "15411",
                notes: null,
                url_google_maps: null,
            },
        };

        it("should throw 409 if code already exists", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

            await expect(WarehouseService.create({ ...mockBody, code: "WH01" })).rejects.toThrow(ApiError);
            await expect(WarehouseService.create({ ...mockBody, code: "WH01" })).rejects.toThrow(
                `Kode gudang "WH01" sudah digunakan`,
            );
        });

        it("should create warehouse successfully with address", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.warehouse.create.mockResolvedValue({ ...mockWarehouse, code: "WH02", name: "Gudang Baru" });

            const result = await WarehouseService.create(mockBody);

            expect(result).toBeDefined();
            expect(result.code).toBe("WH02");
            expect(result.name).toBe("Gudang Baru");
            // @ts-ignore
            expect(prisma.warehouse.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        code: "WH02",
                        name: "Gudang Baru",
                        type: "FINISH_GOODS",
                        warehouse_address: { create: mockBody.warehouse_address },
                    }),
                    include: { warehouse_address: true },
                }),
            );
        });

        it("should create warehouse without address", async () => {
            const bodyWithoutAddress = { code: "WH-NOADDR", name: "Gudang Tanpa Alamat", type: "RAW_MATERIAL" as const };
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.warehouse.create.mockResolvedValue({
                id: 2,
                code: "WH-NOADDR",
                name: "Gudang Tanpa Alamat",
                type: "RAW_MATERIAL",
                deleted_at: null,
                warehouse_address: null,
            });

            const result = await WarehouseService.create(bodyWithoutAddress);

            expect(result).toBeDefined();
            expect(result.name).toBe("Gudang Tanpa Alamat");
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 409 if changing to a code that already exists", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockImplementation(async ({ where }) => {
                if (where.id === 1) return mockWarehouse; // current warehouse
                if (where.code === "WH-EXIST") return { id: 2, code: "WH-EXIST" }; // conflicting warehouse
                return null;
            });

            await expect(WarehouseService.update(1, { code: "WH-EXIST" })).rejects.toThrow(ApiError);
            await expect(WarehouseService.update(1, { code: "WH-EXIST" })).rejects.toThrow(
                `Kode gudang "WH-EXIST" sudah digunakan`,
            );
        });

        it("should update warehouse name and code successfully", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse); // For id=1 and code uniqueness check it will resolve to the same mock which logic ignores as identical or can just mock null for code check if changed
            
            // To be precise
            // @ts-ignore
            prisma.warehouse.findUnique.mockImplementation(async ({ where }) => {
                if (where.id === 1) return mockWarehouse;
                if (where.code === "WH03") return null;
                return null;
            });

            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, code: "WH03", name: "Gudang Updated" });

            const result = await WarehouseService.update(1, { code: "WH03", name: "Gudang Updated" });

            expect(result.code).toBe("WH03");
            expect(result.name).toBe("Gudang Updated");
        });

        it("should throw 404 if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.update(999, { name: "X" })).rejects.toThrow(ApiError);
            await expect(WarehouseService.update(999, { name: "X" })).rejects.toThrow(
                "Gudang tidak ditemukan",
            );
        });

        it("should throw 404 if warehouse is soft-deleted", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null); // deleted_at: null filter excludes it

            await expect(WarehouseService.update(2, { name: "X" })).rejects.toThrow(ApiError);
        });

        it("should upsert warehouse_address when provided on update", async () => {
            const newAddress = {
                street: "Jl. Updated No. 10",
                district: "Baru",
                sub_district: "Baru Timur",
                city: "Jakarta",
                province: "DKI Jakarta",
                country: "Indonesia",
                postal_code: "10110",
                notes: null,
                url_google_maps: null,
            };
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, warehouse_address: newAddress });

            const result = await WarehouseService.update(1, { warehouse_address: newAddress });

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.warehouse.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        warehouse_address: {
                            upsert: { create: newAddress, update: newAddress },
                        },
                    }),
                }),
            );
        });

        it("should not include warehouse_address in update data when not provided", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue(mockWarehouse);

            await WarehouseService.update(1, { name: "Only Name" });

            // @ts-ignore
            expect(prisma.warehouse.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ warehouse_address: undefined }),
                }),
            );
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        it("should return list of warehouses with pagination", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const result = await WarehouseService.list({ page: 1, take: 10, sortBy: "updated_at", sortOrder: "asc" });

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
            expect(result.data[0]?.name).toBe("Gudang Utama");
        });

        it("should use default pagination when not provided", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const result = await WarehouseService.list({ sortBy: "updated_at", sortOrder: "asc" });

            expect(result.data).toHaveLength(1);
        });

        it("should filter by type when provided", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(0);

            const result = await WarehouseService.list({
                page: 1,
                take: 10,
                sortBy: "updated_at",
                sortOrder: "asc",
                type: "RAW_MATERIAL" as any,
            });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });

        it("should filter by search term (case-insensitive)", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            const result = await WarehouseService.list({
                page: 1,
                take: 10,
                sortBy: "name",
                sortOrder: "asc",
                search: "gudang",
            });

            expect(result.data).toHaveLength(1);
            // @ts-ignore
            expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        name: { contains: "gudang", mode: "insensitive" },
                    }),
                }),
            );
        });

        it("should sort by name descending", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(1);

            await WarehouseService.list({ sortBy: "name", sortOrder: "desc" });

            // @ts-ignore
            expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { name: "desc" },
                }),
            );
        });

        it("should return empty list when no warehouses found", async () => {
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([]);
            // @ts-ignore
            prisma.warehouse.count.mockResolvedValue(0);

            const result = await WarehouseService.list({ sortBy: "updated_at", sortOrder: "asc" });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return warehouse detail", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

            const result = await WarehouseService.detail(1);

            expect(result.id).toBe(1);
            expect(result.name).toBe("Gudang Utama");
            expect(result.warehouse_address).toBeDefined();
        });

        it("should throw 404 if not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.detail(999)).rejects.toThrow(ApiError);
            await expect(WarehouseService.detail(999)).rejects.toThrow("Gudang tidak ditemukan");
        });

        it("should throw 404 for soft-deleted warehouse", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null); // deleted_at: null filter
            await expect(WarehouseService.detail(2)).rejects.toThrow(ApiError);
        });
    });

    // ─── CHANGE STATUS ────────────────────────────────────────────────────────

    describe("changeStatus", () => {
        it("should soft-delete an active warehouse (DELETE)", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, deleted_at: new Date(), name: "Gudang Utama" });

            const result = await WarehouseService.changeStatus(1, "DELETE" as any);

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.warehouse.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ deleted_at: expect.any(Date) }),
                }),
            );
        });

        it("should restore a soft-deleted warehouse (ACTIVE)", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue({
                ...mockWarehouse,
                deleted_at: new Date(),
            });
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, deleted_at: null, name: "Gudang Utama" });

            const result = await WarehouseService.changeStatus(1, "ACTIVE" as any);

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.warehouse.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { deleted_at: null },
                }),
            );
        });

        it("should throw 404 if warehouse not found for DELETE", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.changeStatus(999, "DELETE" as any)).rejects.toThrow(ApiError);
            await expect(WarehouseService.changeStatus(999, "DELETE" as any)).rejects.toThrow(
                "Data gudang tidak ditemukan",
            );
        });

        it("should throw 404 if trying to restore non-deleted warehouse", async () => {
            // findUnique returns null because deleted_at condition is { not: null }
            // but the active warehouse has deleted_at: null so it won't match
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.changeStatus(1, "ACTIVE" as any)).rejects.toThrow(ApiError);
        });

        it("should query with deleted_at: null for DELETE status", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
            // @ts-ignore
            prisma.warehouse.update.mockResolvedValue({ ...mockWarehouse, name: "Gudang Utama" });

            await WarehouseService.changeStatus(1, "DELETE" as any);

            // @ts-ignore
            expect(prisma.warehouse.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deleted_at: null }),
                }),
            );
        });
    });

    // ─── DELETED (permanent) ─────────────────────────────────────────────────

    describe("deleted", () => {
        it("should permanently delete a warehouse", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

            await WarehouseService.deleted(1);

            // @ts-ignore
            expect(prisma.warehouse.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        it("should throw 404 if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.deleted(999)).rejects.toThrow(ApiError);
            await expect(WarehouseService.deleted(999)).rejects.toThrow("Data gudang tidak ditemukan");
        });

        it("should not call delete if warehouse not found", async () => {
            // @ts-ignore
            prisma.warehouse.findUnique.mockResolvedValue(null);

            await expect(WarehouseService.deleted(999)).rejects.toThrow(ApiError);
            // @ts-ignore
            expect(prisma.warehouse.delete).not.toHaveBeenCalled();
        });
    });
});
