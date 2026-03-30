# 🖥️ Auth Module — Frontend Integration Guide

Panduan ini ditujukan untuk tim Frontend dalam mengintegrasikan alur autentikasi (Register, Login, Session, Logout) ke sisi client Next.js.

---

## 1. Konsep Penting

### Cookie-Based Session
Backend menggunakan **httpOnly cookie** untuk menyimpan session token. Frontend **tidak perlu** menyimpan token di `localStorage` atau `state`. Cookie dikirim otomatis oleh browser di setiap request.

### CSRF Protection
Semua request yang **mutasi data** (`POST`, `PUT`, `PATCH`, `DELETE`) wajib menyertakan header `X-CSRF-Token`. Token ini didapat dari endpoint `GET /csrf`.

```
Flow:
1. User buka halaman → Frontend call GET /csrf → simpan csrfToken di state
2. Setiap mutasi → kirim header X-CSRF-Token: {csrfToken}
```

---

## 2. Struktur File Frontend (Konvensi Proyek)

```
app/src/app/(auth)/
└── login/
    └── page.tsx
    └── register/
        └── page.tsx

app/src/app/(application)/
└── ...protected pages

app/src/server/auth/
├── auth.schema.ts          ← Copy/sync Zod schema dari backend
├── auth.service.ts         ← Fetcher functions (api.post, api.get, api.delete)
└── use.auth.ts             ← React Query hooks
```

---

## 3. API Schema (`auth.schema.ts`)

Sync dengan backend `auth.schema.ts`. Frontend perlu schema untuk client-side validation di form.

```ts
// app/src/server/auth/auth.schema.ts
import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(8, "Minimal 8 karakter"),
  remember: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z
    .string()
    .min(8, "Minimal 8 karakter")
    .regex(/[A-Z]/, "Harus ada huruf besar")
    .regex(/[0-9]/, "Harus ada angka")
    .regex(/[^A-Za-z0-9]/, "Harus ada karakter spesial"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  path: ["confirm_password"],
  message: "Konfirmasi kata sandi tidak cocok",
});

export type LoginDTO = z.infer<typeof LoginSchema>;
export type RegisterDTO = z.infer<typeof RegisterSchema>;
```

---

## 4. API Service (`auth.service.ts`)

```ts
// app/src/server/auth/auth.service.ts
import { api } from "@/lib/fetcher"; // fetcher bawaan project
import type { LoginDTO, RegisterDTO } from "./auth.schema";

export const AuthService = {
  login: (body: LoginDTO) =>
    api.post("/auth/", body),

  register: (body: RegisterDTO) =>
    api.post("/auth/register", body),

  getAccount: () =>
    api.get("/auth/"),

  logout: () =>
    api.delete("/auth/"),
};
```

---

## 5. React Query Hooks (`use.auth.ts`)

```ts
// app/src/server/auth/use.auth.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthService } from "./auth.service";
import { useRouter } from "next/navigation";

// Key konstanta
export const AUTH_KEY = ["auth", "account"] as const;

// Ambil data session aktif
export function useAccount() {
  return useQuery({
    queryKey: AUTH_KEY,
    queryFn: AuthService.getAccount,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 menit
  });
}

// Login
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: AuthService.login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_KEY });
      router.push("/");
    },
  });
}

// Register
export function useRegister() {
  const router = useRouter();

  return useMutation({
    mutationFn: AuthService.register,
    onSuccess: () => {
      router.push("/auth/login?registered=true");
    },
  });
}

// Logout
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: AuthService.logout,
    onSuccess: () => {
      queryClient.clear();
      router.push("/auth/login");
    },
  });
}
```

---

## 6. Penggunaan di UI Component

### Login Form
```tsx
// app/src/app/(auth)/login/page.tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, LoginDTO } from "@/server/auth/auth.schema";
import { useLogin } from "@/server/auth/use.auth";

export default function LoginPage() {
  const { mutate: login, isPending, error } = useLogin();

  const form = useForm<LoginDTO>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { remember: false },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => login(data))}>
      <input {...form.register("email")} type="email" placeholder="Email" />
      <input {...form.register("password")} type="password" placeholder="Password" />
      <input {...form.register("remember")} type="checkbox" /> Remember me
      {error && <p className="text-red-500">{error.message}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? "Loading..." : "Login"}
      </button>
    </form>
  );
}
```

### Tombol Logout
```tsx
import { useLogout } from "@/server/auth/use.auth";

export function LogoutButton() {
  const { mutate: logout, isPending } = useLogout();

  return (
    <button onClick={() => logout()} disabled={isPending}>
      {isPending ? "Keluar..." : "Logout"}
    </button>
  );
}
```

### Guard Route (Protected Page)
```tsx
// Gunakan di layout atau page yang butuh autentikasi
import { useAccount } from "@/server/auth/use.auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuthGuard() {
  const { data, isLoading, isError } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isError) {
      router.push("/auth/login");
    }
  }, [isLoading, isError, router]);

  return { account: data, isLoading };
}
```

---

## 7. Error Handling

Backend mengembalikan error dalam format standar:

```json
{
  "status": "error",
  "error": "Unauthorized",
  "message": "Email atau Password Salah",
  "requestId": "uuid-v4"
}
```

Tangani di fetcher global atau di tiap mutation `onError`:

```ts
onError: (error) => {
  toast.error(error?.message || "Terjadi kesalahan");
}
```

---

## 8. Alur Session di Next.js

```
1. User buka app
   └─→ useAccount() dipanggil → GET /auth/
       ├─ 200 → render halaman, isi data user di state
       └─ 401 → redirect ke /auth/login

2. User login → POST /auth/
   └─→ Cookie di-set otomatis oleh browser
       └─→ useAccount() di-invalidate → re-fetch otomatis

3. User buka tab baru / refresh
   └─→ Cookie masih ada → useAccount() 200 → tetap login

4. Session expired / logout
   └─→ useAccount() → 401 → redirect ke /auth/login
```

---

## 9. CSRF Token Setup

Sebelum melakukan mutasi (login, logout, dsb), fetch CSRF token terlebih dahulu. Biasanya dilakukan di level layout atau fetcher:

```ts
// Di fetcher interceptor
const csrfToken = await api.get("/csrf").then(r => r.data.csrfToken);
// Set ke header default fetcher
api.defaults.headers["X-CSRF-Token"] = csrfToken;
```

> Catatan: `POST /auth/` (login) dan `POST /auth/register` mungkin **dikecualikan** dari CSRF jika backend mengonfigurasi demikian, karena user belum punya session saat register/login. Konfirmasi dengan implementasi `middleware/csrf.ts`.
