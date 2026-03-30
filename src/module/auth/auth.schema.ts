import z from "zod";

// Base schemas untuk komponen yang bisa digunakan kembali
const EmailSchema = z
	.string({ error: "Email wajib diisi" })
	.max(100, { message: "Panjang email maksimal 100 karakter" })
	.email({ message: "Format email tidak valid" })
	.transform((m) => m.toLowerCase());

const PasswordSchema = z
	.string({ error: "Kata sandi wajib diisi" })
	.min(8, { message: "Kata sandi minimal 8 karakter" })
	.max(100, { message: "Panjang kata sandi maksimal 100 karakter" })
	.regex(/[A-Z]/, { message: "Kata sandi harus mengandung huruf besar" })
	.regex(/[0-9]/, { message: "Kata sandi harus mengandung angka" })
	.regex(/[^A-Za-z0-9]/, { message: "Kata sandi harus mengandung karakter spesial" });

// Base schema untuk auth (email + password)
const AuthBaseSchema = z.object({
	email: EmailSchema,
	password: PasswordSchema,
});

// Extend dari AuthBaseSchema untuk Login
export const LoginSchema = AuthBaseSchema.extend({
	remember: z.boolean().optional(),
});

// Extend dari AuthBaseSchema untuk Register
export const RegisterSchema = AuthBaseSchema.extend({
	first_name: z
		.string({ error: "Nama depan wajib diisi" })
		.min(1, { message: "Nama depan wajib diisi" })
		.max(100, { message: "Nama depan maksimal 100 karakter" }),
	last_name: z
		.string()
		.max(100, { message: "Nama belakang maksimal 100 karakter" })
		.optional(),
	confirm_password: z.string({
		error: "Konfirmasi kata sandi wajib diisi",
	}),
}).refine((data) => data.password === data.confirm_password, {
	path: ["body", "confirm_password"],
	message: "Konfirmasi kata sandi tidak cocok",
});

export type LoginRequestDTO = z.infer<typeof LoginSchema>;
export type RegisterRequestDTO = Omit<z.infer<typeof RegisterSchema>, "confirm_password">;
