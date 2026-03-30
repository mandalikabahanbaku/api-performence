import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutletService } from "../../module/application/outlet/outlet.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

const mockWarehouse = {
    id: 1,
    name: "Gudang Utama",
    type: "FINISH_GOODS",
    deleted_at: null,
};

const mockOutlet = {
    id: 1,
    name: "Toko Utama",
    code: "TOKO001",
    phone: null,
    type: "RETAIL",
    deleted_at: null,
    created_at: new Date(),
    updated_at: null,
    address: null,
    warehouses: [
        {
            outlet_id: 1,
            warehouse_id: 1,
            priority: 1,
            warehouse: mockWarehouse,
        },
    ],
    _count: { inventories: 0 },
};

describe("OutletService", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default global mocks overrides specific to these tests
        // @ts-ignore
        prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        const body: any = {
            name: "Toko Baru",
            code: "TOKO002",
            phone: null,
            type: "RETAIL" as const,
        };

        it("should throw 409 if code already exists", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);

            await expect(OutletService.create(body)).rejects.toThrow(ApiError);
            await expect(OutletService.create(body)).rejects.toThrow(
                `Kode outlet "${body.code}" sudah digunakan`,
            );
        });

        it("should throw 404 if warehouse_ids given but not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null); // no duplicate code
            // @ts-ignore
            prisma.warehouse.findMany.mockResolvedValue([]); // warehouse not found

            await expect(
                OutletService.create({ ...body, warehouse_ids: [999] }),
            ).rejects.toThrow("Gudang dengan ID 999 tidak ditemukan");
        });

        it("should create outlet successfully", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.outlet.create.mockResolvedValue({ ...mockOutlet, name: "Toko Baru", code: "TOKO002" });

            const result = await OutletService.create(body);

            expect(result.name).toBe("Toko Baru");
            // @ts-ignore
            expect(prisma.outlet.create).toHaveBeenCalled();
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            await expect(OutletService.update(999, { name: "X" })).rejects.toThrow(ApiError);
        });

        it("should update outlet successfully", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);
            // @ts-ignore
            prisma.outlet.update.mockResolvedValue({ ...mockOutlet, name: "Toko Updated" });

            const result = await OutletService.update(1, { name: "Toko Updated" });

            expect(result.name).toBe("Toko Updated");
        });
    });

    // ─── TOGGLE STATUS ────────────────────────────────────────────────────────

    describe("toggleStatus", () => {
        it("should throw 404 if outlet not found", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(null);

            await expect(OutletService.toggleStatus(999)).rejects.toThrow(
                "Outlet tidak ditemukan atau sudah dihapus",
            );
        });

        it("should toggle status from active to deleted", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue({ ...mockOutlet, deleted_at: null });
            // @ts-ignore
            prisma.outlet.update.mockResolvedValue({ ...mockOutlet, deleted_at: new Date() });

            const result = await OutletService.toggleStatus(1);

            expect(result.deleted_at).not.toBeNull();
            // @ts-ignore
            expect(prisma.outlet.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { deleted_at: expect.any(Date) },
                }),
            );
        });

        it("should toggle status from deleted to active", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue({ ...mockOutlet, deleted_at: new Date() });
            // @ts-ignore
            prisma.outlet.update.mockResolvedValue({ ...mockOutlet, deleted_at: null });

            const result = await OutletService.toggleStatus(1);

            expect(result.deleted_at).toBeNull();
            // @ts-ignore
            expect(prisma.outlet.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { deleted_at: null },
                }),
            );
        });
    });

    // ─── BULK ACTIONS ─────────────────────────────────────────────────────────

    describe("bulkStatus", () => {
        it("should perform bulk update to active", async () => {
            // @ts-ignore
            prisma.outlet.updateMany.mockResolvedValue({ count: 2 });

            await OutletService.bulkStatus([1, 2], "active");

            // @ts-ignore
            expect(prisma.outlet.updateMany).toHaveBeenCalledWith({
                where: { id: { in: [1, 2] } },
                data: { deleted_at: null },
            });
        });

        it("should perform bulk update to deleted", async () => {
            // @ts-ignore
            prisma.outlet.updateMany.mockResolvedValue({ count: 2 });

            await OutletService.bulkStatus([1, 2], "deleted");

            // @ts-ignore
            expect(prisma.outlet.updateMany).toHaveBeenCalledWith({
                where: { id: { in: [1, 2] } },
                data: { deleted_at: expect.any(Date) },
            });
        });
    });

    describe("bulkDelete", () => {
        it("should perform bulk permanent delete on deleted items", async () => {
            // @ts-ignore
            prisma.outlet.deleteMany.mockResolvedValue({ count: 2 });

            await OutletService.bulkDelete([1, 2]);

            // @ts-ignore
            expect(prisma.outlet.deleteMany).toHaveBeenCalledWith({
                where: { 
                    id: { in: [1, 2] },
                    deleted_at: { not: null }
                }
            });
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        it("should return list with status filter (active)", async () => {
            // @ts-ignore
            prisma.outlet.findMany.mockResolvedValue([mockOutlet]);
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(1);

            const result = await OutletService.list({ status: "active" });

            expect(result.data).toHaveLength(1);
            // @ts-ignore
            expect(prisma.outlet.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deleted_at: null }),
                }),
            );
        });

        it("should return list with status filter (deleted)", async () => {
            // @ts-ignore
            prisma.outlet.findMany.mockResolvedValue([mockOutlet]);
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(1);

            await OutletService.list({ status: "deleted" });

            // @ts-ignore
            expect(prisma.outlet.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deleted_at: { not: null } }),
                }),
            );
        });
    });

    // ─── CLEAN ────────────────────────────────────────────────────────────────

    describe("clean", () => {
        it("should permanently delete all soft-deleted outlets", async () => {
            // @ts-ignore
            prisma.outlet.count.mockResolvedValue(3);
            // @ts-ignore
            prisma.outlet.deleteMany.mockResolvedValue({ count: 3 });

            const result = await OutletService.clean();

            expect(result.message).toContain("Berhasil membersihkan 3 data outlet");
            // @ts-ignore
            expect(prisma.outlet.deleteMany).toHaveBeenCalled();
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return outlet detail if not deleted", async () => {
            // @ts-ignore
            prisma.outlet.findUnique.mockResolvedValue(mockOutlet);

            const result = await OutletService.detail(1);

            expect(result.id).toBe(1);
        });
    });
});
