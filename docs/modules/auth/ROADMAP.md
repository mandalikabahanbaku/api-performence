# 🔐 Auth Module — Business Logic & Flow

Modul autentikasi mengelola siklus hidup akun pengguna: pendaftaran, login, manajemen sesi, dan logout. Seluruh sesi disimpan di Redis, bukan di database relasional, untuk performa dan kemudahan revoke.

---

## 1. Arsitektur Umum

```
Client Request
    │
    ▼
[Rate Limiter Middleware]    ← Cegah brute-force
    │
    ▼
[Validate Body (Zod)]        ← Validasi struktur & tipe data
    │
    ▼
[AuthController]             ← Extract request, panggil service
    │
    ▼
[AuthService]                ← Business logic (bcrypt, DB query)
    │
    ▼
[Redis]                      ← Simpan/hapus session & CSRF token
    │
    ▼
[Set httpOnly Cookie]        ← Kirim session token ke browser
```

---

## 2. Register (`POST /auth/register`)

### Flow
1. Validasi payload via `RegisterSchema` (Zod) — email format, password strength (min 8 karakter, huruf besar, angka, karakter spesial).
2. Cek duplikasi email di tabel `Account`.
3. Hash password dengan `bcrypt` (salt round dari `env.SALT_ROUND`).
4. **Dua path berdasarkan `env.EMAIL_VERIFICATION`:**

```
EMAIL_VERIFICATION = true
    → Account dibuat dengan status PENDING
    → Record emailVerify dibuat (hex token 6-char, expired 5 menit)
    → Email verifikasi wajib dikirim sebelum login bisa dilakukan

EMAIL_VERIFICATION = false
    → Account dibuat langsung dengan status ACTIVE
    → Bisa login seketika
```

### Business Rules
- Email di-normalize ke lowercase sebelum disimpan.
- `confirm_password` **tidak disimpan** ke database — hanya digunakan untuk validasi di layer Zod.
- Akun dengan status `PENDING` akan ditolak saat login.

### Known Gap (TODO)
- Endpoint `POST /auth/verify-email` belum diimplementasi meski infrastruktur `emailVerify` sudah ada di schema Prisma.

---

## 3. Login (`POST /auth/`)

### Flow
1. Validasi payload via `LoginSchema`.
2. Query `Account` ke DB — filter email + status **bukan** `BLOCK`, `DELETE`, atau `PENDING`.
3. Bandingkan password dengan `bcrypt.compare`.
4. Cek jumlah sesi aktif user di Redis — maksimal **5 device**.
5. Generate session token (hex random).
6. Ambil info koneksi: IP address + User-Agent.
7. Catat aktivitas ke log (`CreateLogger`).
8. Simpan session ke Redis dengan struktur:

```
Key  : session:{token}
Value: JSON string {
    email, role, status, user: { first_name, last_name, phone, photo, whatsapp },
    ip, userAgent,
    createdAt: timestamp,
    lastActivity: timestamp
}
TTL  : env.SESSION_TTL (default) | 7 * 86400 detik (jika remember=true)
```

9. Set cookie `httpOnly`, `secure` (production), `sameSite: Lax`.

### Session Cookie
| Property | Value |
|---|---|
| Name | `env.SESSION_COOKIE_NAME` |
| HttpOnly | `true` |
| Secure | `true` (production only) |
| SameSite | `Lax` |
| MaxAge | `SESSION_TTL` atau `7 hari` (remember me) |

### Business Rules
- Jika jumlah sesi aktif ≥ 5, request ditolak dengan `429 Too Many Requests`.
- Error login selalu generic: `"Email atau Password Salah"` — tidak membedakan email tidak ditemukan vs password salah (security best practice).
- Status `BLOCK`, `DELETE`, `PENDING` secara otomatis ditolak di level query (bukan throw manual).

---

## 4. Get Account (`GET /auth/`)

### Flow
1. `authMiddleware` membaca cookie session.
2. Lookup `session:{token}` di Redis.
3. Kembalikan data session (tanpa password) ke client.

### Business Rules
- Jika session tidak ditemukan di Redis → `401 Unauthorized`.
- Data yang dikembalikan adalah **snapshot saat login** (tidak re-query DB).

---

## 5. Logout (`DELETE /auth/`)

### Flow
1. Baca session token dari cookie atau header `Authorization: Bearer {token}`.
2. Hapus `session:{token}` dari Redis.
3. Hapus `csrf:{token}` dari Redis.
4. Delete cookie session dan CSRF dari browser.

### Business Rules
- Logout bersifat **token-specific** — hanya menghapus sesi perangkat yang melakukan logout.
- Untuk revoke semua sesi user lain, gunakan `SessionManager.revokeOtherUserSessions()`.

---

## 6. Session Management (Redis)

Semua state autentikasi disimpan di Redis, bukan di database.

| Key Pattern | Isi | TTL |
|---|---|---|
| `session:{token}` | JSON data akun + metadata | SESSION_TTL / 7 hari |
| `csrf:{sessionId}` | CSRF token string | Sama dengan session |

### SessionManager Methods
| Method | Kegunaan |
|---|---|
| `getUserActiveSessions(email, c)` | List semua sesi aktif per user |
| `getSessionWithFallback(sessionId)` | Ambil data sesi (support hash & string type) |
| `revokeOtherUserSessions(email, currentId, c)` | Revoke semua sesi kecuali yang aktif |
| `cleanupInactiveSessions(maxInactiveHours)` | Hapus sesi tidak aktif (batch SCAN) |
| `updateSessionData(sessionId, data)` | Update partial data sesi |
| `migrateSessions()` | Migrasi format lama (hash → string) |

---

## 7. Rate Limiting

| Environment | Max Request | Interval | Block Duration |
|---|---|---|---|
| Development | 50 req | 5 menit | 1 menit |
| Production | 10 req | 1 menit | 5 menit |

Berlaku untuk `POST /auth/` (login) dan `POST /auth/register`.

---

## 8. Relasi Prisma

```
Account
 ├── email          (unique)
 ├── password       (bcrypt hash)
 ├── role           (Enum: ADMIN | STAFF | ...)
 ├── status         (Enum: ACTIVE | PENDING | BLOCK | DELETE | INACTIVE)
 ├── emailVerify    (1:1, opsional — hanya jika EMAIL_VERIFICATION=true)
 └── user           (1:1, profil — first_name, last_name, phone, photo, whatsapp)
```

---

## 9. TODO / Known Issues

| # | Issue | Status |
|---|---|---|
| 1 | ~~`RegisterSchema` belum ada `first_name`/`last_name`~~ | ✅ Selesai |
| 2 | Endpoint `POST /auth/verify-email` belum ada | ⚠️ Pending |
| 3 | ~~`console.log` debug di `auth.service.ts`~~ | ✅ Selesai |
| 4 | ~~Unit test & integration test auth belum dibuat~~ | ✅ Selesai (21 tests) |
