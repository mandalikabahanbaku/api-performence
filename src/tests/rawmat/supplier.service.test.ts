import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierService } from "../../module/application/rawmat/supplier/supplier.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

describe("SupplierService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── CREATE ───────────────────────────────────────────────────────────────

    describe("create", () => {
        const mockBody = {
            name: "PT Supplier Baru",
            addresses: "Jl. Test No. 1, Jakarta",
            country: "Indonesia",
        };

        it("should create supplier successfully without phone", async () => {
            // @ts-ignore
            prisma.supplier.create.mockResolvedValue({
                id: 2,
                name: "PT Supplier Baru",
                country: "Indonesia",
                phone: null,
            });

            const result = await SupplierService.create(mockBody);

            expect(result.id).toBe(2);
            expect(result.name).toBe("PT Supplier Baru");
            // @ts-ignore
            expect(prisma.supplier.create).toHaveBeenCalledOnce();
        });

        it("should throw 400 if phone is already used by another supplier", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 99, phone: "08000000000" });

            await expect(
                SupplierService.create({ ...mockBody, phone: "08000000000" }),
            ).rejects.toThrow(ApiError);
            await expect(
                SupplierService.create({ ...mockBody, phone: "08000000000" }),
            ).rejects.toThrow("Nomor telepon supplier sudah digunakan");
        });

        it("should create supplier with unique phone successfully", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.supplier.create.mockResolvedValue({
                id: 3,
                name: "PT Baru",
                country: "Malaysia",
                phone: "08111111111",
            });

            const result = await SupplierService.create({
                ...mockBody,
                phone: "08111111111",
            });

            expect(result.phone).toBe("08111111111");
        });
    });

    // ─── UPDATE ───────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should throw 404 if supplier not found", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(SupplierService.update(999, { name: "Updated" })).rejects.toThrow(ApiError);
            await expect(SupplierService.update(999, { name: "Updated" })).rejects.toThrow(
                "Supplier tidak ditemukan",
            );
        });

        it("should throw 400 if new phone conflicts with another supplier", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia", phone: null });
            // @ts-ignore
            prisma.supplier.findFirst.mockResolvedValue({ id: 2, phone: "08000000000" });

            await expect(
                SupplierService.update(1, { phone: "08000000000" }),
            ).rejects.toThrow(ApiError);
            await expect(
                SupplierService.update(1, { phone: "08000000000" }),
            ).rejects.toThrow("Nomor telepon supplier sudah digunakan");
        });

        it("should update supplier name successfully", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia", phone: null });
            // @ts-ignore
            prisma.supplier.update.mockResolvedValue({ id: 1, name: "PT ABC Updated", country: "Indonesia", phone: null });

            const result = await SupplierService.update(1, { name: "PT ABC Updated" });

            expect(result.name).toBe("PT ABC Updated");
            // @ts-ignore
            expect(prisma.supplier.update).toHaveBeenCalledOnce();
        });

        it("should update phone successfully when unique", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia", phone: null });
            // @ts-ignore
            prisma.supplier.findFirst.mockResolvedValue(null);
            // @ts-ignore
            prisma.supplier.update.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia", phone: "08222222222" });

            const result = await SupplierService.update(1, { phone: "08222222222" });

            expect(result.phone).toBe("08222222222");
        });
    });

    // ─── DETAIL ───────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return supplier detail", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([
                {
                    id: 1,
                    name: "PT Supplier ABC",
                    addresses: "Jl. Test No. 1",
                    country: "Indonesia",
                    phone: null,
                    created_at: new Date(),
                    updated_at: null,
                },
            ]);

            const result = await SupplierService.detail(1);
            expect(result.id).toBe(1);
            expect(result.country).toBe("Indonesia");
        });

        it("should throw 404 if supplier not found", async () => {
            // @ts-ignore
            prisma.$queryRaw.mockResolvedValueOnce([]);

            await expect(SupplierService.detail(999)).rejects.toThrow("Supplier tidak ditemukan");
        });
    });

    // ─── LIST ─────────────────────────────────────────────────────────────────

    describe("list", () => {
        const mockRow = {
            id: 1,
            name: "PT Supplier ABC",
            addresses: "Jl. Test No. 1",
            country: "Indonesia",
            phone: null,
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

            const result = await SupplierService.list({ page: 1, take: 10, sortBy: "updated_at", sortOrder: "desc" });

            expect(result.data).toHaveLength(1);
            expect(result.len).toBe(1);
        });

        it("should return empty list when no suppliers", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 0n }]);

            const result = await SupplierService.list({ page: 1, take: 10, sortBy: "updated_at", sortOrder: "desc" });

            expect(result.data).toHaveLength(0);
            expect(result.len).toBe(0);
        });

        it("should filter by search term", async () => {
            // @ts-ignore
            prisma.$queryRaw
                // @ts-ignore
                .mockResolvedValueOnce([mockRow])
                // @ts-ignore
                .mockResolvedValueOnce([{ count: 1n }]);

            const result = await SupplierService.list({
                page: 1,
                take: 10,
                search: "Supplier",
                sortBy: "name",
                sortOrder: "asc",
            });

            expect(result).toBeDefined();
            expect(result.data).toHaveLength(1);
        });
    });

    // ─── DELETE ───────────────────────────────────────────────────────────────

    describe("delete", () => {
        it("should throw 404 if supplier not found", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(SupplierService.delete(999)).rejects.toThrow(ApiError);
            await expect(SupplierService.delete(999)).rejects.toThrow("Supplier tidak ditemukan");
        });

        it("should throw 400 if supplier still used by raw materials", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(5);

            await expect(SupplierService.delete(1)).rejects.toThrow(ApiError);
            await expect(SupplierService.delete(1)).rejects.toThrow(
                "Supplier masih digunakan oleh beberapa Raw Material",
            );
        });

        it("should delete supplier successfully when not in use", async () => {
            // @ts-ignore
            prisma.supplier.findUnique.mockResolvedValue({ id: 1, name: "PT ABC", country: "Indonesia" });
            // @ts-ignore
            prisma.rawMaterial.count.mockResolvedValue(0);
            // @ts-ignore
            prisma.supplier.delete.mockResolvedValue({ id: 1 });

            const result = await SupplierService.delete(1);

            expect(result).toBeDefined();
            // @ts-ignore
            expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });
    });
});
