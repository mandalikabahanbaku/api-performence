import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../../module/auth/auth.service.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";

vi.mock("bcrypt", () => ({
    default: {
        genSalt: vi.fn().mockResolvedValue("salt"),
        hash: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
        compare: vi.fn().mockResolvedValue(true),
    },
}));

const validRegisterBody = {
    email: "new@example.com",
    password: "Password@123",
    first_name: "John",
    last_name: "Doe",
};

const validLoginBody = {
    email: "test@example.com",
    password: "Password@123",
};

describe("AuthService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── register ─────────────────────────────────────────────────────────────

    describe("register", () => {
        it("should throw 400 if email already exists", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue({
                email: "new@example.com",
                status: "ACTIVE",
            });

            await expect(AuthService.register(validRegisterBody)).rejects.toThrow(ApiError);
            await expect(AuthService.register(validRegisterBody)).rejects.toMatchObject({
                statusCode: 400,
                message: "Email telah digunakan",
            });
        });

        it("should create account with ACTIVE status and nested user when EMAIL_VERIFICATION=false", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.account.create.mockResolvedValue({ id: "uuid-1", email: validRegisterBody.email });

            await expect(AuthService.register(validRegisterBody)).resolves.not.toThrow();

            // @ts-ignore
            expect(prisma.account.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        email: validRegisterBody.email,
                        status: "ACTIVE",
                        user: expect.objectContaining({
                            create: expect.objectContaining({
                                first_name: validRegisterBody.first_name,
                                last_name: validRegisterBody.last_name,
                            }),
                        }),
                    }),
                }),
            );
        });

        it("should create account with emailVerify and nested user when EMAIL_VERIFICATION=true", async () => {
            const { env } = await import("../../config/env.js");
            (env as any).EMAIL_VERIFICATION = true;

            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.account.create.mockResolvedValue({ id: "uuid-2", email: validRegisterBody.email });

            await expect(AuthService.register(validRegisterBody)).resolves.not.toThrow();

            // @ts-ignore
            expect(prisma.account.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        email: validRegisterBody.email,
                        emailVerify: expect.objectContaining({ create: expect.any(Object) }),
                        user: expect.objectContaining({
                            create: expect.objectContaining({
                                first_name: validRegisterBody.first_name,
                            }),
                        }),
                    }),
                }),
            );

            (env as any).EMAIL_VERIFICATION = false;
        });

        it("should hash password before saving", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue(null);
            // @ts-ignore
            prisma.account.create.mockResolvedValue({ id: "uuid-1" });

            await AuthService.register(validRegisterBody);

            const bcrypt = (await import("bcrypt")).default;
            expect(bcrypt.hash).toHaveBeenCalled();

            // @ts-ignore
            const createCall = prisma.account.create.mock.calls[0][0];
            expect(createCall.data.password).toBe("$2b$10$hashedpassword");
            expect(createCall.data.password).not.toBe(validRegisterBody.password);
        });
    });

    // ─── login ────────────────────────────────────────────────────────────────

    describe("login", () => {
        it("should throw 401 if account not found", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue(null);

            await expect(AuthService.login(validLoginBody)).rejects.toThrow(ApiError);
            await expect(AuthService.login(validLoginBody)).rejects.toMatchObject({
                statusCode: 401,
                message: "Email atau Password Salah",
            });
        });

        it("should throw 401 if password does not match", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue({
                email: "test@example.com",
                role: "STAFF",
                status: "ACTIVE",
                password: "$2b$10$hashedpassword",
                user: null,
            });

            const bcrypt = (await import("bcrypt")).default;
            // @ts-ignore
            bcrypt.compare.mockResolvedValue(false);

            await expect(AuthService.login(validLoginBody)).rejects.toThrow(ApiError);
            await expect(AuthService.login(validLoginBody)).rejects.toMatchObject({
                statusCode: 401,
            });

            // Reset ke default
            // @ts-ignore
            bcrypt.compare.mockResolvedValue(true);
        });

        it("should return account data (without password) on successful login", async () => {
            const mockAccount = {
                email: "owner@example.com",
                role: "OWNER",
                status: "ACTIVE",
                password: "$2b$10$hashedpassword",
                user: {
                    first_name: "Admin",
                    last_name: "Utama",
                    phone: "08123456789",
                    photo: null,
                    whatsapp: null,
                },
            };
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue(mockAccount);

            const result = await AuthService.login({
                email: "owner@example.com",
                password: "Password@123",
            });

            expect(result.email).toBe("owner@example.com");
            expect(result.role).toBe("OWNER");
            expect(result.status).toBe("ACTIVE");
            expect(result.user?.first_name).toBe("Admin");
            expect(result).not.toHaveProperty("password");
        });

        it("should return null user if account has no linked user profile", async () => {
            // @ts-ignore
            prisma.account.findUnique.mockResolvedValue({
                email: "nouser@example.com",
                role: "STAFF",
                status: "ACTIVE",
                password: "$2b$10$hashedpassword",
                user: null,
            });

            const result = await AuthService.login({
                email: "nouser@example.com",
                password: "Password@123",
            });

            expect(result.user).toBeNull();
        });
    });
});
