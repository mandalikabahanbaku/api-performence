import { Account, STATUS, User } from "../../generated/prisma/client.js";
import { LoginRequestDTO, RegisterRequestDTO } from "./auth.schema.js";
import prisma from "../../config/prisma.js";
import { ApiError } from "../../lib/errors/api.error.js";
import { env } from "../../config/env.js";
import bcrypt from "bcrypt";
import { generateHexToken } from "../../lib/index.js";

type AuthResponse = Omit<
    Account,
    "id" | "created_at" | "updated_at" | "deleted_at" | "password"
> & {
    user: Omit<
        User,
        "id" | "account_id" | "created_at" | "updated_at" | "deleted_at" | "password"
    > | null;
};

export class AuthService {
    // Register
    private static async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(env.SALT_ROUND);
        return bcrypt.hash(password, salt);
    }
    static async register(body: RegisterRequestDTO) {
        const { email, password, first_name, last_name } = body;
        const findEmail = await this.findEmail(email);
        if (findEmail) throw new ApiError(400, "Email telah digunakan");

        const hashedPassword = await this.hashPassword(password);

        const emailVerifyData = env.EMAIL_VERIFICATION
            ? { emailVerify: { create: { code: generateHexToken(), expired_at: new Date(Date.now() + 5 * 60 * 1000) } } }
            : { status: "ACTIVE" as const };

        await prisma.account.create({
            data: {
                email,
                password: hashedPassword,
                ...emailVerifyData,
                user: { create: { first_name, last_name } },
            },
        });
    }

    static async login(body: LoginRequestDTO): Promise<AuthResponse> {
        const { email, password } = body;
        const account = await prisma.account.findUnique({
            where: {
                email,
                status: {
                    notIn: ["BLOCK", "DELETE", "PENDING"],
                },
            },
            select: {
                email: true,
                role: true,
                status: true,
                password: true,
                user: {
                    select: {
                        first_name: true,
                        last_name: true,
                        phone: true,
                        photo: true,
                        whatsapp: true,
                    },
                },
            },
        });
        if (!account?.email) throw new ApiError(401, "Email atau Password Salah");

        const comparePassword = await bcrypt.compare(password, account.password);
        if (!comparePassword) throw new ApiError(401, "Email atau Password Salah");

        return {
            email: account.email,
            role: account.role,
            status: account.status,
            user: account.user,
        };
    }

    // Helper Method
    private static async findEmail(
        email: string,
    ): Promise<{ email: string; password: string; status: STATUS } | null> {
        const find = await prisma.account.findUnique({
            where: {
                email,
            },
            select: {
                email: true,
                password: true,
                status: true,
            },
        });

        return find;
    }
}
