import { vi } from "vitest";

// Mock env before anything else
vi.mock("../config/env.js", () => ({
    env: {
        NODE_ENV: "test",
        APP_NAME: "Eveterinary",
        BASE_URL: "http://localhost",
        PORT: 3000,
        HOSTNAME: "localhost",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        LOG_LEVEL: "info",
        REDIS_HOST: "localhost",
        REDIS_PORT: 6379,
        REDIS_PASSWORD: "password",
        REDIS_DB: 0,
        SESSION_COOKIE_NAME: "session",
        SESSION_TTL: 3600,
        CSRF_COOKIE_NAME: "csrf",
        CSRF_HEADER_NAME: "x-csrf-token",
        CORS_ORIGINS: [],
        CORS_METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        CORS_ALLOWED_HEADERS: ["Content-Type", "Authorization"],
        CORS_EXPOSED_HEADERS: ["Content-Length"],
        CORS_MAX_AGE: 86400,
        RATE_VIOLATION: 3,
        EMAIL_VERIFICATION: false,
        SALT_ROUND: 10,
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@example.com",
        GOOGLE_PRIVATE_KEY: "private-key",
        GOOGLE_SHEET_ID: "sheet-id",
        SHEET_FORECAST: "forecast",
        isDevelopment: true,
        isProduction: false,
        isProd: false,
    },
    corsConfig: {
        origins: [],
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["Content-Length"],
        maxAge: 86400,
    },
}));

// Mock configuration
vi.mock("../config/prisma.js", () => ({
    default: {
        product: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.code === "NEWP_999") return null;
                return {
                    id: where.id || 1,
                    code: where.code || "TSHIRT",
                    name: "T-Shirt",
                    z_value: 1.65,
                    status: "ACTIVE",
                    deleted_at: null,
                    product_inventories: [],
                    recipes: []
                };
            }),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 1, z_value: 1.65 }),
            update: vi.fn().mockResolvedValue({ id: 1, z_value: 1.65 }),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(1),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        productType: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.slug === "not-exist") return null;
                return { id: where.id || 1, name: "Apparel", slug: where.slug || "apparel" };
            }),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, name: "Apparel", slug: "apparel" },
                { id: 2, name: "Accessories", slug: "accessories" },
            ]),
            create: vi.fn().mockResolvedValue({ id: 3, name: "NewType", slug: "newtype" }),
            update: vi.fn().mockResolvedValue({ id: 1, name: "Updated", slug: "updated" }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(2),
        },
        unit: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.slug === "not-exist") return null;
                return { id: where.id || 1, name: "pcs", slug: where.slug || "pcs" };
            }),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, name: "pcs", slug: "pcs" },
                { id: 2, name: "dozen", slug: "dozen" },
            ]),
            create: vi.fn().mockResolvedValue({ id: 3, name: "lusin", slug: "lusin" }),
            update: vi.fn().mockResolvedValue({ id: 1, name: "Updated", slug: "updated" }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(2),
        },
        productSize: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.size === 0) return null;
                return { id: where.id || 1, size: where.size || 40 };
            }),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, size: 38 },
                { id: 2, size: 40 },
                { id: 3, size: 42 },
            ]),
            create: vi.fn().mockResolvedValue({ id: 4, size: 44 }),
            update: vi.fn().mockResolvedValue({ id: 1, size: 39 }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(3),
        },
        rawMaterial: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.barcode === "BARCODE_NOTFOUND") return null;
                // id 2 is used for "already deleted" scenario in restore tests
                if (where.id === 2) {
                    return {
                        id: 2,
                        barcode: "RM-002",
                        name: "Kain Deleted",
                        price: 50000,
                        deleted_at: new Date("2024-01-01"),
                        created_at: new Date(),
                        updated_at: null,
                    };
                }
                return {
                    id: where.id || 1,
                    barcode: where.barcode || "RM-001",
                    name: "Kain Katun",
                    price: 50000,
                    min_buy: 10,
                    min_stock: 5,
                    lead_time: 7,
                    type: "FABRIC",
                    deleted_at: null,
                    created_at: new Date(),
                    updated_at: null,
                    unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                    raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                    supplier: null,
                };
            }),
            findFirst: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where?.id === 999) return null;
                return {
                    id: where?.id || 1,
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
                    unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                    raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                    supplier: null,
                };
            }),
            findMany: vi.fn().mockResolvedValue([
                {
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
                    unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                    raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                    supplier: null,
                },
            ]),
            create: vi.fn().mockResolvedValue({
                id: 1,
                barcode: "RM-001",
                name: "Kain Katun",
                price: 50000,
                deleted_at: null,
                unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                supplier: null,
            }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                barcode: "RM-001",
                name: "Kain Katun Updated",
                price: 55000,
                deleted_at: null,
                unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                supplier: null,
            }),
            count: vi.fn().mockResolvedValue(1),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        unitRawMaterial: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.slug === "not-exist") return null;
                return { id: where.id || 1, name: "meter", slug: where.slug || "meter" };
            }),
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, name: "meter", slug: "meter" },
                { id: 2, name: "kg", slug: "kg" },
            ]),
            create: vi.fn().mockResolvedValue({ id: 3, name: "liter", slug: "liter" }),
            update: vi.fn().mockResolvedValue({ id: 1, name: "Updated", slug: "updated" }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(2),
        },
        rawMatCategories: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.slug === "not-exist") return null;
                return {
                    id: where.id || 1,
                    name: "Fabric",
                    slug: where.slug || "fabric",
                    status: "ACTIVE",
                };
            }),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, name: "Fabric", slug: "fabric", status: "ACTIVE" },
                { id: 2, name: "Chemical", slug: "chemical", status: "ACTIVE" },
            ]),
            create: vi
                .fn()
                .mockResolvedValue({ id: 3, name: "Thread", slug: "thread", status: "ACTIVE" }),
            update: vi
                .fn()
                .mockResolvedValue({ id: 1, name: "Updated", slug: "updated", status: "ACTIVE" }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(2),
        },
        productIssuance: {
            findMany: vi.fn().mockResolvedValue([
                { product_id: 1, quantity: "100" },
                { product_id: 2, quantity: "80" },
            ]),
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                const { product_id, month, year } = where?.product_id_year_month ?? {};
                if (product_id === 999 || (month === 99 && year === 9999)) return null;
                return {
                    id: 1,
                    product_id: product_id || 1,
                    month: month || 1,
                    year: year || 2025,
                    quantity: 100,
                    created_at: new Date(),
                    updated_at: new Date(),
                    product: {
                        id: product_id || 1,
                        code: "TSHIRT",
                        name: "T-Shirt",
                        product_type: { id: 1, name: "Apparel", slug: "apparel" },
                    },
                };
            }),
            create: vi.fn().mockResolvedValue({
                id: 2,
                product_id: 1,
                month: 1,
                year: 2025,
                quantity: 150,
                created_at: new Date(),
                updated_at: new Date(),
            }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                product_id: 1,
                month: 1,
                year: 2025,
                quantity: 200,
                created_at: new Date(),
                updated_at: new Date(),
            }),
        },
        forecastPercentage: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                const id = where?.id;
                const period = where?.month_year;
                if (id === 999 || (period?.month === 99 && period?.year === 9999)) return null;
                // Return null for new period to allow create in tests
                if (period?.month === 5 && period?.year === 2026) return null;
                return {
                    id: id || 1,
                    month: period?.month || 1,
                    year: period?.year || 2025,
                    value: "10.50",
                };
            }),
            findMany: vi.fn().mockResolvedValue([
                { id: 1, month: 1, year: 2025, value: "10.50" },
                { id: 2, month: 2, year: 2025, value: "12.00" },
            ]),
            create: vi.fn().mockResolvedValue({ id: 3, month: 3, year: 2025, value: "8.00" }),
            update: vi.fn().mockResolvedValue({ id: 1, month: 1, year: 2025, value: "15.00" }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
            count: vi.fn().mockResolvedValue(2),
            upsert: vi.fn().mockResolvedValue({ id: 1, month: 1, year: 2025, value: "10.50" }),
        },
        recipes: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where?.id === 999) return null;
                return { id: where?.id || 1, product_id: 1, version: 1, is_active: true };
            }),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        forecast: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                const id = where?.id;
                const period = where?.product_id_month_year;
                if (id === 999 || (period?.product_id === 999)) return null;
                if (period?.month === 99 && period?.year === 9999) return null;
                return {
                    id: id || 1,
                    product_id: period?.product_id || 1,
                    month: period?.month || 1,
                    year: period?.year || 2026,
                    base_forecast: "120.00",
                    final_forecast: "120.00",
                    trend: "UP",
                    status: "DRAFT",
                    forecast_percentage_id: 1,
                    created_at: new Date(),
                    updated_at: new Date(),
                    product: {
                        id: 1, code: "EDP_110", name: "Product EDP 110ml",
                        distribution_percentage: "50.00",
                        product_type: { id: 1, name: "EDP", slug: "edp" },
                        size: { id: 1, size: 110 },
                        unit: { id: 1, name: "pcs", slug: "pcs" },
                    },
                    forecast_percentage: { id: 1, month: 1, year: 2026, value: "20.00" },
                };
            }),
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 1, product_id: 1, month: 1, year: 2026,
                    base_forecast: "120.00", final_forecast: "110.00",
                    trend: "UP", status: "DRAFT", forecast_percentage_id: 1,
                    created_at: new Date(), updated_at: new Date(),
                    product: {
                        id: 1, code: "EDP_110", name: "Product EDP 110ml",
                        distribution_percentage: "50.00",
                        product_type: { id: 1, name: "EDP", slug: "edp" },
                        size: { id: 1, size: 110 }, unit: { id: 1, name: "pcs", slug: "pcs" },
                    },
                    forecast_percentage: { id: 1, month: 1, year: 2026, value: "20.00" },
                },
            ]),
            count: vi.fn().mockResolvedValue(1),
            create: vi.fn().mockResolvedValue({ id: 2, product_id: 1, month: 2, year: 2026 }),
            update: vi.fn().mockResolvedValue({ id: 1, status: "FINALIZED" }),
            updateMany: vi.fn().mockResolvedValue({ count: 3 }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
            upsert: vi.fn().mockResolvedValue({ id: 1, product_id: 1, month: 1, year: 2026, base_forecast: "120.00", final_forecast: "110.00", trend: "UP", status: "DRAFT", forecast_percentage_id: 1 }),
        },
        rawMaterialInventory: {
            findFirst: vi.fn().mockResolvedValue({ month: 3, year: 2025 }),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        safetyStock: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
        },
        warehouseAddress: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            delete: vi.fn().mockResolvedValue({ warehouse_id: 1 }),
        },
        outlet: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999 || where.code === "NOTEXIST") return null;
                return {
                    id: where.id || 1,
                    name: "Toko Utama",
                    code: where.code || "TOKO001",
                    phone: null,
                    warehouse: { id: 1, name: "Gudang Utama", type: "FINISH_GOODS" },
                    _count: { inventories: 0 },
                };
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 1,
                    name: "Toko Utama",
                    code: "TOKO001",
                    phone: null,
                    warehouse_id: 1,
                    deleted_at: null,
                    created_at: new Date(),
                    updated_at: null,
                    address: null,
                    warehouse: { id: 1, name: "Gudang Utama", type: "FINISH_GOODS" },
                    _count: { inventories: 0 },
                },
            ]),
            create: vi.fn().mockResolvedValue({
                id: 1,
                name: "Toko Utama",
                code: "TOKO001",
                phone: null,
                warehouse_id: 1,
                deleted_at: null,
                created_at: new Date(),
                updated_at: null,
                address: null,
                warehouse: { id: 1, name: "Gudang Utama", type: "FINISH_GOODS" },
            }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                name: "Toko Updated",
                code: "TOKO001",
                phone: null,
                warehouse_id: 1,
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date(),
                address: null,
                warehouse: { id: 1, name: "Gudang Utama", type: "FINISH_GOODS" },
            }),
            count: vi.fn().mockResolvedValue(1),
        },
        outletAddress: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            delete: vi.fn().mockResolvedValue({ outlet_id: 1 }),
        },
        outletWarehouse: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue([]),
        },
        outletInventory: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const key = args?.where?.outlet_id_product_id;
                if (!key) return null;
                if (key.product_id === 999 || key.outlet_id === 999) return null;
                return {
                    id: 1,
                    outlet_id: key.outlet_id,
                    product_id: key.product_id,
                    quantity: "10.00",
                    min_stock: "5.00",
                    updated_at: new Date(),
                    product: { id: key.product_id, name: "T-Shirt", code: "TSHIRT" },
                };
            }),
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 1,
                    outlet_id: 1,
                    product_id: 1,
                    quantity: "10.00",
                    min_stock: "5.00",
                    updated_at: new Date(),
                    product: { id: 1, name: "T-Shirt", code: "TSHIRT" },
                },
            ]),
            create: vi.fn().mockResolvedValue({ id: 1 }),
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                outlet_id: 1,
                product_id: 1,
                quantity: "10.00",
                min_stock: "20.00",
                updated_at: new Date(),
                product: { id: 1, name: "T-Shirt", code: "TSHIRT" },
            }),
            count: vi.fn().mockResolvedValue(1),
        },
        warehouse: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999) return null;
                if (where.id === 2)
                    return {
                        id: 2,
                        name: "Gudang Deleted",
                        type: "FINISH_GOODS",
                        deleted_at: new Date("2024-01-01"),
                        created_at: new Date(),
                        updated_at: null,
                        warehouse_address: null,
                    };
                if (where.id === 3)
                    return {
                        id: 3,
                        name: "Gudang Bahan Baku",
                        type: "RAW_MATERIAL",
                        deleted_at: null,
                        created_at: new Date(),
                        updated_at: null,
                        warehouse_address: null,
                    };
                if (where.deleted_at === null && where.id === 2) return null;
                return {
                    id: where.id || 1,
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
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 1,
                    name: "Gudang Utama",
                    type: "FINISH_GOODS",
                    deleted_at: null,
                    created_at: new Date(),
                    updated_at: null,
                    warehouse_address: null,
                },
            ]),
            create: vi.fn().mockResolvedValue({
                id: 3,
                name: "Gudang Baru",
                type: "RAW_MATERIAL",
                deleted_at: null,
                created_at: new Date(),
                updated_at: null,
                warehouse_address: null,
            }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                name: "Gudang Updated",
                type: "FINISH_GOODS",
                deleted_at: null,
                created_at: new Date(),
                updated_at: new Date(),
                warehouse_address: null,
            }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(1),
        },
        supplier: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where.id === 999) return null;
                if (where.phone === "08000000000")
                    return { id: 99, name: "Existing", phone: "08000000000" };
                return {
                    id: where.id || 1,
                    name: "PT Supplier ABC",
                    country: "Indonesia",
                    phone: null,
                };
            }),
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi
                .fn()
                .mockResolvedValue([{ id: 1, name: "PT Supplier ABC", country: "Indonesia" }]),
            create: vi.fn().mockResolvedValue({
                id: 1,
                name: "PT Supplier ABC",
                country: "Indonesia",
                phone: null,
            }),
            update: vi.fn().mockResolvedValue({
                id: 1,
                name: "PT Supplier Updated",
                country: "Indonesia",
                phone: null,
            }),
            delete: vi.fn().mockResolvedValue({ id: 1 }),
            count: vi.fn().mockResolvedValue(1),
        },
        stockMovement: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({}),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        stockTransfer: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 1, items: [] }),
            update: vi.fn().mockResolvedValue({ id: 1, items: [] }),
        },
        stockTransferItem: {
            update: vi.fn().mockResolvedValue({}),
        },
        productInventory: {
            findFirst: vi.fn().mockResolvedValue({ id: 1, quantity: 100 }),
            update: vi.fn().mockResolvedValue({ id: 1, quantity: 90 }),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        account: {
            findUnique: vi.fn().mockImplementation(async (args) => {
                const { where } = args;
                if (where?.email === "notfound@example.com") return null;
                return {
                    email: where?.email || "test@example.com",
                    role: "STAFF",
                    status: "ACTIVE",
                    password: "$2b$10$hashedpassword",
                    user: {
                        first_name: "Test",
                        last_name: "User",
                        phone: null,
                        photo: null,
                        whatsapp: null,
                    },
                };
            }),
            create: vi.fn().mockResolvedValue({
                id: "uuid-account-1",
                email: "new@example.com",
                role: "STAFF",
                status: "ACTIVE",
            }),
        },
        user: {
            create: vi.fn().mockResolvedValue({
                id: "uuid-user-1",
                first_name: "Test",
                last_name: "User",
            }),
        },
        $transaction: vi.fn((cbOrArray) => {
            // Array form: prisma.$transaction([op1, op2])
            if (Array.isArray(cbOrArray)) return Promise.all(cbOrArray);
            // Callback form: prisma.$transaction(async (tx) => { ... })
            return cbOrArray({
                product: {
                    create: vi.fn().mockResolvedValue({
                        id: 1,
                        code: "TSHIRT",
                        z_value: 1.65,
                        product_type: {},
                        unit: {},
                        size: {},
                    }),
                    update: vi.fn().mockResolvedValue({
                        id: 1,
                        code: "TSHIRT",
                        z_value: 1.65,
                        product_type: {},
                        unit: {},
                        size: {},
                    }),
                },
                productType: {
                    findUnique: vi.fn().mockResolvedValue({ id: 1 }),
                    create: vi.fn().mockResolvedValue({ id: 1 }),
                    upsert: vi.fn().mockResolvedValue({ id: 1 }),
                },
                unit: {
                    findUnique: vi.fn().mockResolvedValue({ id: 1 }),
                    create: vi.fn().mockResolvedValue({ id: 1 }),
                    upsert: vi.fn().mockResolvedValue({ id: 1 }),
                },
                productSize: {
                    findUnique: vi.fn().mockResolvedValue({ id: 1 }),
                    create: vi.fn().mockResolvedValue({ id: 1 }),
                    upsert: vi.fn().mockResolvedValue({ id: 1 }),
                },
                rawMaterial: {
                    findFirst: vi.fn().mockResolvedValue({
                        id: 1,
                        barcode: "RM-001",
                        name: "Kain Katun",
                        price: 50000,
                        deleted_at: null,
                    }),
                    create: vi.fn().mockResolvedValue({
                        id: 1,
                        barcode: "RM-001",
                        name: "Kain Katun",
                        price: 50000,
                        deleted_at: null,
                        unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                        raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                        supplier: null,
                    }),
                    update: vi.fn().mockResolvedValue({
                        id: 1,
                        barcode: "RM-001",
                        name: "Kain Katun Updated",
                        price: 55000,
                        deleted_at: null,
                        unit_raw_material: { id: 1, name: "meter", slug: "meter" },
                        raw_mat_category: { id: 1, name: "Fabric", slug: "fabric" },
                        supplier: null,
                    }),
                },
                unitRawMaterial: {
                    findUnique: vi.fn().mockResolvedValue({ id: 1, name: "meter", slug: "meter" }),
                    create: vi.fn().mockResolvedValue({ id: 1, name: "meter", slug: "meter" }),
                },
                rawMatCategories: {
                    findUnique: vi
                        .fn()
                        .mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" }),
                    create: vi.fn().mockResolvedValue({ id: 1, name: "Fabric", slug: "fabric" }),
                },
                outletWarehouse: {
                    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                    createMany: vi.fn().mockResolvedValue({ count: 1 }),
                },
                outlet: {
                    update: vi.fn().mockResolvedValue({
                        id: 1,
                        name: "Toko Updated",
                        code: "TOKO001",
                    }),
                    upsert: vi.fn().mockResolvedValue({
                        id: 1,
                        code: "TOKO001",
                        name: "Toko UPSERT",
                    }),
                },
                outletInventory: {
                    create: vi.fn().mockResolvedValue({ id: 1 }),
                    update: vi.fn().mockResolvedValue({ id: 1 }),
                },
                productInventory: {
                    update: vi.fn().mockResolvedValue({ id: 1 }),
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 1 }),
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                stockTransfer: {
                    update: vi.fn().mockResolvedValue({ id: 1 }),
                },
                stockTransferItem: {
                    update: vi.fn().mockResolvedValue({ id: 1 }),
                },
                recipes: {
                    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                },
                $executeRawUnsafe: vi.fn().mockResolvedValue(1),
            });
        }),
        $queryRaw: vi.fn().mockImplementation(async (query: any) => {
            const sqlStr = typeof query === "string" ? query : query?.strings?.join(" ") || "";
            if (sqlStr.toUpperCase().includes("COUNT")) {
                return [{ count: 1n }];
            }
            return [{ id: 1, name: "Product", z_value: 1.65, code: "TSHIRT", status: "ACTIVE" }];
        }),
        $executeRaw: vi.fn().mockResolvedValue(1),
    },
    Prisma: {
        sql: vi.fn((strings, ...values) => ({ strings, values })),
        join: vi.fn((values) => values),
        empty: "",
        raw: (val: string) => val,
    },
}));

vi.mock("../config/redis.js", () => {
    const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("hash"),
        hgetall: vi.fn().mockResolvedValue({
            email: "test@example.com",
            role: "SUPER_ADMIN",
        }),
        expire: vi.fn().mockResolvedValue(true),
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
        status: "ready",
    };
    return {
        redisClient: mockRedis,
        closeRedisConnection: vi.fn(),
    };
});

vi.mock("../module/application/log/log.service.js", () => ({
    CreateLogger: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/logger.js", () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        http: vi.fn(),
    },
}));
