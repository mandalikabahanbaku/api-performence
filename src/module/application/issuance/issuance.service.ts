import prisma from "../../../config/prisma.js";
import { Prisma, IssuanceType, Trend } from "../../../generated/prisma/client.js";
import { ApiError } from "../../../lib/errors/api.error.js";
import { GetPagination } from "../../../lib/utils/pagination.js";

import { QueryIssuanceDTO, RequestIssuanceDTO, ResponseIssuanceDTO, QueryIssuanceRekapDTO } from "./issuance.schema.js";

export class IssuanceService {
    private static resolvePeriod(month?: number, year?: number) {
        const now = new Date();
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        return {
            month: month ?? d.getUTCMonth() + 1,
            year: year ?? d.getUTCFullYear(),
        };
    }

    private static async findProduct(id: number) {
        return prisma.product.findUnique({ where: { id } });
    }

    private static async findIssuanceByPeriod(product_id: number, month: number, year: number, type: IssuanceType = IssuanceType.ALL) {
        return prisma.productIssuance.findUnique({
            where: { product_id_year_month_type: { product_id, month, year, type } },
        });
    }

    static async create(body: RequestIssuanceDTO): Promise<void> {
        const { product_id, quantity, month: rawMonth, year: rawYear, type } = body;

        const product = await this.findProduct(product_id);
        if (!product) throw new ApiError(404, "Produk tersebut tidak ditemukan");

        const { month, year } = this.resolvePeriod(rawMonth, rawYear);

        const exist = await this.findIssuanceByPeriod(product_id, month, year, type);
        if (exist) {
            throw new ApiError(
                400,
                `Data pengeluaran ${product.name.toUpperCase()} tipe ${type} pada periode ${month}/${year} sudah tersedia`,
            );
        }

        await prisma.productIssuance.create({
            data: { product_id, quantity, month, year, type },
        });
    }

    static async update(body: RequestIssuanceDTO): Promise<void> {
        const { product_id, quantity, month, year, type } = body;

        if (!month || !year) {
            throw new ApiError(400, "Bulan dan tahun wajib diisi untuk proses update");
        }

        const issuance = await this.findIssuanceByPeriod(product_id, month, year, type);
        if (!issuance) throw new ApiError(404, "Data pengeluaran tidak ditemukan");

        await prisma.productIssuance.update({
            where: { id: issuance.id },
            data: { quantity },
        });
    }

    private static getLastNMonths(n: number): { year: number; month: number }[] {
        const periods: { year: number; month: number }[] = [];
        const now = new Date();

        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i, 1));
            periods.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
        }
        return periods;
    }

    static async list({
        gender,
        horizon = 6,
        size,
        variant,
        product_id,
        product_id_2,
        sortBy = "quantity",
        sortOrder = "desc",
        page = 1,
        take = 10,
        search,
        type,
    }: QueryIssuanceDTO): Promise<{ issuances: IssuanceListItem[]; len: number }> {
        const periods = this.getLastNMonths(horizon || 13);
        const start = periods[0]!;
        const end = periods.at(-1)!;

        const startVal = start.year * 12 + start.month;
        const endVal = end.year * 12 + end.month;

        const { skip, take: limit } = GetPagination(page, take);

        const conditions: Prisma.Sql[] = [
            Prisma.sql`p.status NOT IN ('BLOCK'::"STATUS", 'DELETE'::"STATUS", 'PENDING'::"STATUS")`,
        ];

        if (search) {
            const pattern = `%${search}%`;
            conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.code ILIKE ${pattern})`);
        }

        if (gender) {
            conditions.push(Prisma.sql`p.gender = CAST(${gender} AS "GENDER")`);
        }

        if (size) {
            conditions.push(Prisma.sql`ps.size = ${Number(size)}`);
        }

        if (variant) {
            conditions.push(Prisma.sql`pt.slug = ${variant}`);
        }

        if (product_id_2) {
            conditions.push(Prisma.sql`p.id IN (${product_id}, ${product_id_2})`);
        } else if (product_id) {
            conditions.push(Prisma.sql`p.id = ${product_id}`);
        }

        const saTypeFilter = type
            ? Prisma.sql`AND sa.type = CAST(${type} AS "IssuanceType")`
            : Prisma.sql`AND sa.type = 'ALL'::"IssuanceType"`;

        const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

        const countResult = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
            SELECT COUNT(p.id)::int AS total
            FROM products p
            LEFT JOIN product_types pt ON p.type_id = pt.id
            LEFT JOIN product_size ps ON p.size_id = ps.id
            ${whereSql}
        `);
        const total = Number(countResult[0]?.total ?? 0);

        if (total === 0) return { issuances: [], len: 0 };

        const orderBySql =
            sortBy === "name" && sortOrder === "asc"
                ? Prisma.sql`ORDER BY p.name ASC`
                : sortBy === "name" && sortOrder === "desc"
                  ? Prisma.sql`ORDER BY p.name DESC`
                  : sortBy === "code" && sortOrder === "asc"
                    ? Prisma.sql`ORDER BY p.code ASC`
                    : sortBy === "code" && sortOrder === "desc"
                      ? Prisma.sql`ORDER BY p.code DESC`
                      : sortBy === "quantity" && sortOrder === "asc"
                        ? Prisma.sql`ORDER BY "totalQuantity" ASC`
                        : Prisma.sql`ORDER BY "totalQuantity" DESC`;

        const rows = await prisma.$queryRaw<RawIssuanceRow[]>(Prisma.sql`
            SELECT
                p.id,
                p.code,
                p.name,
                ps.size                          AS size_val,
                u.name                           AS unit_name,
                pt.id                            AS pt_id,
                pt.name                          AS pt_name,
                pt.slug                          AS pt_slug,
                COALESCE(SUM(sa.quantity), 0)    AS "totalQuantity",
                COALESCE(
                    json_agg(
                        json_build_object(
                            'year',     sa.year,
                            'month',    sa.month,
                            'quantity', sa.quantity
                        )
                    ) FILTER (WHERE sa.year IS NOT NULL),
                    '[]'::json
                )                                AS issuances_data
            FROM products p
            LEFT JOIN product_types pt   ON p.type_id  = pt.id
            LEFT JOIN unit_of_materials u ON p.unit_id  = u.id
            LEFT JOIN product_size ps    ON p.size_id  = ps.id
            LEFT JOIN product_issuances sa
                ON  sa.product_id = p.id
                AND (sa.year * 12 + sa.month) >= ${startVal}
                AND (sa.year * 12 + sa.month) <= ${endVal}
                ${saTypeFilter}
            ${whereSql}
            GROUP BY p.id, p.code, p.name, ps.size, u.name, pt.id, pt.name, pt.slug
            ${orderBySql}
            LIMIT ${product_id && product_id_2 ? 2 : limit} OFFSET ${skip}
        `);

        const issuances = rows.map((row) => {
            const actuals = (
                typeof row.issuances_data === "string"
                    ? JSON.parse(row.issuances_data)
                    : row.issuances_data
            ) as Array<{ year: number; month: number; quantity: string | number }>;

            const issuanceMap = new Map<string, number>(
                actuals.map((s) => [`${s.year}-${s.month}`, Number(s.quantity)]),
            );

            let totalQuantity = 0;
            const rawSeries = periods.map(({ year, month }) => {
                const qty = issuanceMap.get(`${year}-${month}`) ?? 0;
                totalQuantity += qty;
                return { year, month, quantity: qty };
            });

            const trends = this.calculateTrendSeries(rawSeries.map((r) => r.quantity));
            const quantitySeries = rawSeries.map((r, i) => ({
                ...r,
                trend: trends[i] ?? Trend.STABLE,
            }));

            return {
                product_id: row.id,
                year: end.year,
                month: end.month,
                product: {
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    product_type:
                        row.pt_id && row.pt_name && row.pt_slug
                            ? { id: row.pt_id, name: row.pt_name, slug: row.pt_slug }
                            : null,
                    size: `${row.size_val ?? ""} ${row.unit_name ?? ""}`.trim(),
                },
                quantity: quantitySeries,
                totalQuantity,
            };
        });

        return { issuances, len: total };
    }

    static async detail(
        product_id: number,
        year: number,
        month: number,
        type?: IssuanceType,
    ): Promise<ResponseIssuanceDTO> {
        if (!year || !month) throw new ApiError(400, "Tahun dan bulan wajib diisi");

        const issuance = await prisma.productIssuance.findUnique({
            where: {
                product_id_year_month_type: {
                    product_id,
                    year,
                    month,
                    type: type ?? IssuanceType.ALL,
                },
            },
            include: {
                product: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        product_type: { select: { name: true, id: true, slug: true } },
                    },
                },
            },
        });

        if (!issuance) throw new ApiError(404, "Data pengeluaran tidak ditemukan");

        return {
            ...issuance,
            quantity: Number(issuance.quantity),
            product: {
                id: issuance.product.id,
                name: issuance.product.name,
                code: issuance.product.code,
                product_type: issuance.product.product_type ?? null,
            },
        };
    }

    static async rekap({
        year: rawYear,
        month: rawMonth,
        search,
        gender,
        size,
        variant,
        page = 1,
        take = 25,
        sortBy = "name",
        sortOrder = "asc",
    }: QueryIssuanceRekapDTO): Promise<{ rekap: any[]; len: number }> {
        const { year, month } = this.resolvePeriod(rawMonth, rawYear);
        const { skip, take: limit } = GetPagination(page, take);

        const conditions: Prisma.Sql[] = [
            Prisma.sql`p.status NOT IN ('BLOCK'::"STATUS", 'DELETE'::"STATUS", 'PENDING'::"STATUS")`,
        ];

        if (search) {
            const pattern = `%${search}%`;
            conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.code ILIKE ${pattern})`);
        }
        if (gender) conditions.push(Prisma.sql`p.gender = CAST(${gender} AS "GENDER")`);
        if (size) conditions.push(Prisma.sql`ps.size = ${Number(size)}`);
        if (variant) conditions.push(Prisma.sql`pt.slug = ${variant}`);

        const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

        const countResult = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
            SELECT COUNT(p.id)::int AS total
            FROM products p
            LEFT JOIN product_types pt ON p.type_id = pt.id
            LEFT JOIN product_size ps ON p.size_id = ps.id
            ${whereSql}
        `);
        const total = Number(countResult[0]?.total ?? 0);

        if (total === 0) return { rekap: [], len: 0 };

        const validSortFields = ["name", "code", "offline", "online", "spin_wheel", "garansi_out", "all_qty", "total_qty"];
        const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "name";
        const actualSortOrder = sortOrder === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
        
        let orderBySql = Prisma.sql`ORDER BY p.name ASC`;
        if (actualSortBy === "name") orderBySql = Prisma.sql`ORDER BY p.name ${actualSortOrder}`;
        else if (actualSortBy === "code") orderBySql = Prisma.sql`ORDER BY p.code ${actualSortOrder}`;
        else if (actualSortBy === "offline") orderBySql = Prisma.sql`ORDER BY offline ${actualSortOrder}`;
        else if (actualSortBy === "online") orderBySql = Prisma.sql`ORDER BY online ${actualSortOrder}`;
        else if (actualSortBy === "spin_wheel") orderBySql = Prisma.sql`ORDER BY spin_wheel ${actualSortOrder}`;
        else if (actualSortBy === "garansi_out") orderBySql = Prisma.sql`ORDER BY garansi_out ${actualSortOrder}`;
        else if (actualSortBy === "all_qty") orderBySql = Prisma.sql`ORDER BY all_qty ${actualSortOrder}`;
        else if (actualSortBy === "total_qty") orderBySql = Prisma.sql`ORDER BY total_qty ${actualSortOrder}`;

        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT
                p.id,
                p.code,
                p.name,
                ps.size                          AS size_val,
                u.name                           AS unit_name,
                pt.name                          AS pt_name,
                COALESCE(SUM(CASE WHEN sa.type = 'OFFLINE' THEN sa.quantity ELSE 0 END), 0)::float AS offline,
                COALESCE(SUM(CASE WHEN sa.type = 'ONLINE' THEN sa.quantity ELSE 0 END), 0)::float AS online,
                COALESCE(SUM(CASE WHEN sa.type = 'SPIN_WHEEL' THEN sa.quantity ELSE 0 END), 0)::float AS spin_wheel,
                COALESCE(SUM(CASE WHEN sa.type = 'GARANSI_OUT' THEN sa.quantity ELSE 0 END), 0)::float AS garansi_out,
                COALESCE(SUM(CASE WHEN sa.type = 'ALL' THEN sa.quantity ELSE 0 END), 0)::float AS all_qty,
                (
                    COALESCE(SUM(CASE WHEN sa.type = 'OFFLINE' THEN sa.quantity ELSE 0 END), 0) +
                    COALESCE(SUM(CASE WHEN sa.type = 'ONLINE' THEN sa.quantity ELSE 0 END), 0) +
                    COALESCE(SUM(CASE WHEN sa.type = 'SPIN_WHEEL' THEN sa.quantity ELSE 0 END), 0) +
                    COALESCE(SUM(CASE WHEN sa.type = 'GARANSI_OUT' THEN sa.quantity ELSE 0 END), 0)
                )::float AS total_qty
            FROM products p
            LEFT JOIN product_types pt ON p.type_id = pt.id
            LEFT JOIN product_size ps ON p.size_id = ps.id
            LEFT JOIN unit_of_materials u ON p.unit_id = u.id
            LEFT JOIN product_issuances sa ON sa.product_id = p.id AND sa.month = ${month} AND sa.year = ${year}
            ${whereSql}
            GROUP BY p.id, p.code, p.name, ps.size, u.name, pt.name
            ${orderBySql}
            LIMIT ${limit} OFFSET ${skip}
        `);

        return {
            rekap: rows.map(row => ({
                product_id: row.id,
                product: {
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    size: `${row.size_val ?? ""} ${row.unit_name ?? ""}`.trim(),
                    product_type: row.pt_name,
                },
                offline: row.offline,
                online: row.online,
                spin_wheel: row.spin_wheel,
                garansi_out: row.garansi_out,
                all_qty: row.all_qty,
                total_qty: row.total_qty,
            })),
            len: total
        };
    }

    private static calculateTrendSeries(values: number[], threshold = 5): Trend[] {
        return values.map((current, i) => {
            if (i === 0) return Trend.STABLE;
            const prev = values[i - 1]!;
            if (prev === 0) return Trend.STABLE;
            const delta = ((current - prev) / prev) * 100;
            if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return Trend.STABLE;
            return delta > 0 ? Trend.UP : Trend.DOWN;
        });
    }
}

type RawIssuanceRow = {
    id: number;
    code: string;
    name: string;
    size_val: number | null;
    unit_name: string | null;
    pt_id: number | null;
    pt_name: string | null;
    pt_slug: string | null;
    totalQuantity: string | number;
    issuances_data: string | Array<{ year: number; month: number; quantity: string | number }>;
};

type IssuanceListItem = {
    product_id: number;
    year: number;
    month: number;
    product: {
        id: number;
        code: string;
        name: string;
        product_type: { id: number; name: string; slug: string } | null;
        size: string;
    };
    quantity: Array<{ year: number; month: number; quantity: number; trend: Trend }>;
    totalQuantity: number;
};
