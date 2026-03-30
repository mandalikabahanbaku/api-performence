import { describe, it, expect, vi, beforeEach } from "vitest";

import prisma from "../../../config/prisma.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { ForecastPercentageService } from "../../../module/application/forecast/percentages/percentages.service.js";

describe("ForecastPercentageService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── create ────────────────────────────────────────────────────────────────

    describe("create", () => {
        it("should create a forecast percentage successfully", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.forecastPercentage.create.mockResolvedValue({
                id: 3,
                month: 3,
                year: 2025,
                value: "8.00",
            });

            const result = await ForecastPercentageService.create({
                month: 3,
                year: 2025,
                value: 8,
            });

            expect(result.id).toBe(3);
            expect(result.value).toBe(8);
            expect(typeof result.value).toBe("number");
            // @ts-ignore
            expect(prisma.forecastPercentage.create).toHaveBeenCalledOnce();
        });

        it("should throw ApiError 400 if period already exists", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue({ id: 1 });

            await expect(
                ForecastPercentageService.create({ month: 1, year: 2025, value: 10 }),
            ).rejects.toThrow(ApiError);

            await expect(
                ForecastPercentageService.create({ month: 1, year: 2025, value: 10 }),
            ).rejects.toThrow("1/2025");
        });
    });

    // ─── createMany ────────────────────────────────────────────────────────────

    describe("createMany", () => {
        it("should upsert multiple forecast percentages", async () => {
            // @ts-ignore
            prisma.$transaction.mockResolvedValue([
                { id: 1, month: 1, year: 2025, value: "10.50" },
                { id: 2, month: 2, year: 2025, value: "12.00" },
            ]);

            const result = await ForecastPercentageService.createMany({
                items: [
                    { month: 1, year: 2025, value: 10.5 },
                    { month: 2, year: 2025, value: 12 },
                ],
            });

            expect(result.count).toBe(2);
            expect(result.data).toHaveLength(2);
            expect(typeof result.data[0]!.value).toBe("number");
            // @ts-ignore
            expect(prisma.$transaction).toHaveBeenCalledOnce();
        });
    });

    // ─── list ──────────────────────────────────────────────────────────────────

    describe("list", () => {
        it("should return list with len", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findMany.mockResolvedValue([
                { id: 1, month: 1, year: 2025, value: "10.50" },
                { id: 2, month: 2, year: 2025, value: "12.00" },
            ]);
            // @ts-ignore
            prisma.forecastPercentage.count.mockResolvedValue(2);

            const result = await ForecastPercentageService.list({ page: 1, take: 25 });

            expect(result.len).toBe(2);
            expect(result.data).toHaveLength(2);
            expect(typeof result.data[0]!.value).toBe("number");
        });

        it("should filter by year", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findMany.mockResolvedValue([
                { id: 1, month: 1, year: 2024, value: "5.00" },
            ]);
            // @ts-ignore
            prisma.forecastPercentage.count.mockResolvedValue(1);

            const result = await ForecastPercentageService.list({ year: 2024, page: 1, take: 25 });

            expect(result.len).toBe(1);
            // @ts-ignore
            expect(prisma.forecastPercentage.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { year: 2024 } }),
            );
        });
    });

    // ─── detail ────────────────────────────────────────────────────────────────

    describe("detail", () => {
        it("should return detail of existing record", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue({
                id: 1,
                month: 1,
                year: 2025,
                value: "10.50",
            });

            const result = await ForecastPercentageService.detail(1);

            expect(result.id).toBe(1);
            expect(result.value).toBe(10.5);
        });

        it("should throw ApiError 404 if record not found", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue(null);

            await expect(ForecastPercentageService.detail(999)).rejects.toThrow(ApiError);
        });
    });

    // ─── update ────────────────────────────────────────────────────────────────

    describe("update", () => {
        it("should update successfully", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue({ id: 1 });
            // @ts-ignore
            prisma.forecastPercentage.update.mockResolvedValue({
                id: 1,
                month: 1,
                year: 2025,
                value: "15.00",
            });

            const result = await ForecastPercentageService.update(1, { value: 15 });

            expect(result.value).toBe(15);
        });

        it("should throw ApiError 404 if not found on update", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue(null);

            await expect(ForecastPercentageService.update(999, { value: 15 })).rejects.toThrow(
                ApiError,
            );
        });
    });

    // ─── destroy ───────────────────────────────────────────────────────────────

    describe("destroy", () => {
        it("should delete successfully", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue({ id: 1 });
            // @ts-ignore
            prisma.forecastPercentage.delete.mockResolvedValue({ id: 1 });

            await expect(ForecastPercentageService.destroy(1)).resolves.toBeUndefined();
            // @ts-ignore
            expect(prisma.forecastPercentage.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        it("should throw ApiError 404 if not found on delete", async () => {
            // @ts-ignore
            prisma.forecastPercentage.findUnique.mockResolvedValue(null);

            await expect(ForecastPercentageService.destroy(999)).rejects.toThrow(ApiError);
        });
    });

    // ─── destroyMany ───────────────────────────────────────────────────────────

    describe("destroyMany", () => {
        it("should delete multiple records", async () => {
            // @ts-ignore
            prisma.forecastPercentage.deleteMany.mockResolvedValue({ count: 3 });

            const result = await ForecastPercentageService.destroyMany([1, 2, 3]);

            expect(result.count).toBe(3);
            // @ts-ignore
            expect(prisma.forecastPercentage.deleteMany).toHaveBeenCalledWith({
                where: { id: { in: [1, 2, 3] } },
            });
        });
    });
});
