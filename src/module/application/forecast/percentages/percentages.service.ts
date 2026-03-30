import prisma from "../../../../config/prisma.js";
import { ApiError } from "../../../../lib/errors/api.error.js";
import { GetPagination } from "../../../../lib/utils/pagination.js";
import type {
    QueryForecastPercentageDTO,
    RequestForecastPercentageBulkDTO,
    RequestForecastPercentageDTO,
    ResponseForecastPercentageDTO,
} from "./percentages.schema.js";

export class ForecastPercentageService {
    static async create(
        body: RequestForecastPercentageDTO,
    ): Promise<ResponseForecastPercentageDTO> {
        const { month, year, value } = body;

        const existing = await prisma.forecastPercentage.findUnique({
            where: { month_year: { month, year } },
            select: { id: true },
        });
        if (existing) {
            throw new ApiError(
                400,
                `Data persentase forecast untuk periode ${month}/${year} sudah tersedia`,
            );
        }

        const result = await prisma.forecastPercentage.create({
            data: { month, year, value },
        });

        return { ...result, value: Number(result.value) };
    }

    static async createMany(
        body: RequestForecastPercentageBulkDTO,
    ): Promise<{ count: number; data: ResponseForecastPercentageDTO[] }> {
        const { items } = body;

        const created = await prisma.$transaction(
            items.map((item) =>
                prisma.forecastPercentage.upsert({
                    where: { month_year: { month: item.month, year: item.year } },
                    update: { value: item.value },
                    create: { month: item.month, year: item.year, value: item.value },
                }),
            ),
        );

        return {
            count: created.length,
            data: created.map((r: any) => ({ ...r, value: Number(r.value) })),
        };
    }

    static async list(
        query: QueryForecastPercentageDTO,
    ): Promise<{ data: ResponseForecastPercentageDTO[]; len: number }> {
        const { year, page = 1, take = 25 } = query;
        const { skip, take: limit } = GetPagination(page, take);

        const where: { year?: number } = {};
        if (year) where.year = year;

        const [data, len] = await Promise.all([
            prisma.forecastPercentage.findMany({
                where,
                orderBy: [{ year: "desc" }, { month: "asc" }],
                skip,
                take: limit,
            }),
            prisma.forecastPercentage.count({ where }),
        ]);

        return {
            len,
            data: data.map((r: any) => ({ ...r, value: Number(r.value) })),
        };
    }

    static async detail(id: number): Promise<ResponseForecastPercentageDTO> {
        const result = await prisma.forecastPercentage.findUnique({ where: { id } });
        if (!result) throw new ApiError(404, "Data persentase forecast tidak ditemukan");

        return { ...result, value: Number(result.value) };
    }

    static async update(
        id: number,
        body: Partial<RequestForecastPercentageDTO>,
    ): Promise<ResponseForecastPercentageDTO> {
        const existing = await prisma.forecastPercentage.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new ApiError(404, "Data persentase forecast tidak ditemukan");

        const result = await prisma.forecastPercentage.update({
            where: { id },
            data: body,
        });

        return { ...result, value: Number(result.value) };
    }

    static async destroy(id: number): Promise<void> {
        const existing = await prisma.forecastPercentage.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) throw new ApiError(404, "Data persentase forecast tidak ditemukan");

        await prisma.forecastPercentage.delete({ where: { id } });
    }

    static async destroyMany(ids: number[]): Promise<{ count: number }> {
        const result = await prisma.forecastPercentage.deleteMany({
            where: { id: { in: ids } },
        });
        return { count: result.count };
    }
}
