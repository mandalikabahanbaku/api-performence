import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../app.js";
import prisma from "../../config/prisma.js";

// ─── Mock Redis ────────────────────────────────────────────────────────────────
vi.mock("../../config/redis.js", () => {
    const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        setex: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue([]),
        ping: vi.fn().mockResolvedValue("PONG"),
        type: vi.fn().mockResolvedValue("none"),
        hgetall: vi.fn().mockResolvedValue({}),
        expire: vi.fn().mockResolvedValue(true),
        ttl: vi.fn().mockResolvedValue(3600),
        incr: vi.fn().mockResolvedValue(1),
        zadd: vi.fn().mockResolvedValue(1),
        zcard: vi.fn().mockResolvedValue(0),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        pipeline: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([]),
        }),
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
        status: "ready",
    };
    return { redisClient: mockRedis, closeRedisConnection: vi.fn() };
});

// ─── Mock Cookie ───────────────────────────────────────────────────────────────
vi.mock("hono/cookie", async (importOriginal) => {
    const original = await importOriginal<typeof import("hono/cookie")>();
    return {
        ...original,
        getCookie: vi.fn().mockReturnValue(undefined), // default: tidak ada session
    };
});

// ─── Bypass CSRF ───────────────────────────────────────────────────────────────
vi.mock("../../middleware/csrf.js", () => ({
    csrfMiddleware: async (c: any, next: any) => await next(),
}));

// ─── Bypass Rate Limiter ────────────────────────────────────────────────────────
vi.mock("../../middleware/rate.limit.js", () => ({
    rateLimiter: () => async (c: any, next: any) => await next(),
}));

// ─── Mock ConnInfo (tidak tersedia di test environment) ─────────────────────────
vi.mock("@hono/node-server/conninfo", () => ({
    getConnInfo: () => ({ remote: { address: "127.0.0.1" } }),
}));

// ─── Mock bcrypt ───────────────────────────────────────────────────────────────
vi.mock("bcrypt", () => ({
    default: {
        genSalt: vi.fn().mockResolvedValue("salt"),
        hash: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
        compare: vi.fn().mockResolvedValue(true),
    },
}));

import { redisClient } from "../../config/redis.js";
import { getCookie } from "hono/cookie";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const validRegisterPayload = {
    email: "newuser@example.com",
    password: "Password@123",
    first_name: "New",
    last_name: "User",
    confirm_password: "Password@123",
};

const validLoginPayload = {
    email: "test@example.com",
    password: "Password@123",
};

const SESSION_DATA = JSON.stringify({
    email: "test@example.com",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    user: { first_name: "Test", last_name: "User", phone: null, photo: null, whatsapp: null },
    createdAt: Date.now(),
    lastActivity: Date.now(),
});

// Simulate authenticated session
function mockAuthSession() {
    // @ts-ignore
    getCookie.mockReturnValue("mock-session-id");
    // @ts-ignore
    redisClient.type.mockResolvedValue("string");
    // @ts-ignore
    redisClient.get.mockResolvedValue(SESSION_DATA);
}

// Simulate no session
function mockNoSession() {
    // @ts-ignore
    getCookie.mockReturnValue(undefined);
    // @ts-ignore
    redisClient.type.mockResolvedValue("none");
    // @ts-ignore
    redisClient.get.mockResolvedValue(null);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AuthRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockNoSession();
    });

    // ─── POST /api/auth/register ───────────────────────────────────────────────

    describe("POST /api/auth/register", () => {
        it("should return 201 on successful registration", async () => {
            // Email baru — findUnique harus return null (tidak ada duplikat)
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValueOnce(null);

            const res = await app.request("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validRegisterPayload),
            });

            const body = await res.json();
            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
        });

        it("should return 400 if email already exists", async () => {
            // default mock setup.ts sudah return data untuk email yang ada
            const res = await app.request("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...validRegisterPayload,
                    email: "test@example.com",
                }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if password is too weak (no uppercase)", async () => {
            const res = await app.request("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...validRegisterPayload,
                    password: "weakpassword1!",
                    confirm_password: "weakpassword1!",
                }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if confirm_password does not match", async () => {
            const res = await app.request("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...validRegisterPayload,
                    confirm_password: "Different@123",
                }),
            });

            expect(res.status).toBe(400);
        });

        it("should return 400 if first_name is missing", async () => {
            const { first_name, ...withoutFirstName } = validRegisterPayload;
            const res = await app.request("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(withoutFirstName),
            });

            expect(res.status).toBe(400);
        });
    });

    // ─── POST /api/auth (login) ────────────────────────────────────────────────

    describe("POST /api/auth (login)", () => {
        it("should return 201 and set session cookie on successful login", async () => {
            const res = await app.request("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validLoginPayload),
            });

            const body = await res.json();
            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
        });

        it("should return 401 if account not found", async () => {
            const res = await app.request("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "notfound@example.com",
                    password: "Password@123",
                }),
            });

            expect(res.status).toBe(401);
        });

        it("should return 401 if password is wrong", async () => {
            const bcrypt = (await import("bcrypt")).default;
            // @ts-ignore
            bcrypt.compare.mockResolvedValue(false);

            const res = await app.request("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validLoginPayload),
            });

            expect(res.status).toBe(401);

            // @ts-ignore
            bcrypt.compare.mockResolvedValue(true);
        });

        it("should return 400 if request body is invalid", async () => {
            const res = await app.request("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "not-an-email", password: "short" }),
            });

            expect(res.status).toBe(400);
        });
    });

    // ─── GET /api/auth (getAccount) ───────────────────────────────────────────

    describe("GET /api/auth", () => {
        it("should return 200 with account data when session is valid", async () => {
            mockAuthSession();

            const res = await app.request("/api/auth", {
                method: "GET",
                headers: { Cookie: "session=mock-session-id" },
            });

            const body = await res.json();
            expect(res.status).toBe(200);
            expect(body.status).toBe("success");
            expect(body.data.email).toBe("test@example.com");
        });

        it("should return 401 when no session", async () => {
            mockNoSession();

            const res = await app.request("/api/auth", {
                method: "GET",
            });

            expect(res.status).toBe(401);
        });
    });

    // ─── DELETE /api/auth (logout) ────────────────────────────────────────────

    describe("DELETE /api/auth", () => {
        it("should return 201 and clear session on logout", async () => {
            mockAuthSession();

            const res = await app.request("/api/auth", {
                method: "DELETE",
                headers: { Cookie: "session=mock-session-id" },
            });

            const body = await res.json();
            expect(res.status).toBe(201);
            expect(body.status).toBe("success");
            expect(redisClient.del).toHaveBeenCalled();
        });

        it("should return 401 when trying to logout without session", async () => {
            mockNoSession();

            const res = await app.request("/api/auth", {
                method: "DELETE",
            });

            expect(res.status).toBe(401);
        });
    });
});
