# 📡 Auth Module — API Reference

**Base URL:** `http://localhost:3000/api`
**Prefix:** `/auth`
**Auth:** Endpoint bertanda ✅ memerlukan session cookie yang valid.

---

## POST `/auth/register`

Mendaftarkan akun baru.

**Auth Required:** ❌
**Rate Limit:** 50 req/5min (dev) | 10 req/1min (prod)

### Request Body

```json
{
  "email": "user@example.com",
  "password": "Passw0rd!",
  "confirm_password": "Passw0rd!"
}
```

| Field | Type | Validasi |
|---|---|---|
| `email` | `string` | Format email valid, max 100 char, di-lowercase |
| `password` | `string` | Min 8 char, harus ada huruf besar, angka, dan karakter spesial |
| `confirm_password` | `string` | Wajib sama dengan `password` |

### Response Sukses

```json
HTTP 201 Created
{
  "status": "success",
  "data": {}
}
```

### Response Error

| Status | Kondisi | Message |
|---|---|---|
| `400` | Email sudah terdaftar | `"Email telah digunakan"` |
| `400` | Validasi Zod gagal | `{ "field": "...", "message": "..." }` |
| `429` | Rate limit tercapai | `"Too many requests"` |

### Catatan
- Jika `EMAIL_VERIFICATION=true` → akun berstatus `PENDING`, login ditolak sampai email diverifikasi.
- Jika `EMAIL_VERIFICATION=false` → akun berstatus `ACTIVE`, bisa login langsung.

---

## POST `/auth/`

Login dengan kredensial akun.

**Auth Required:** ❌
**Rate Limit:** 50 req/5min (dev) | 10 req/1min (prod)

### Request Body

```json
{
  "email": "user@example.com",
  "password": "Passw0rd!",
  "remember": true
}
```

| Field | Type | Validasi |
|---|---|---|
| `email` | `string` | Format email valid |
| `password` | `string` | Min 8 char |
| `remember` | `boolean` | Opsional. `true` = sesi bertahan 7 hari |

### Response Sukses

```json
HTTP 201 Created
{
  "status": "success",
  "data": {}
}
```

> Session token dikirim via **httpOnly cookie** (`SESSION_COOKIE_NAME`). Frontend tidak perlu menyimpan token secara manual.

### Response Error

| Status | Kondisi | Message |
|---|---|---|
| `401` | Email tidak ditemukan / password salah | `"Email atau Password Salah"` |
| `401` | Akun berstatus BLOCK, DELETE, atau PENDING | `"Email atau Password Salah"` |
| `429` | Melebihi 5 device aktif | `"Maksimal 5 device aktif"` |
| `429` | Rate limit tercapai | `"Too many requests"` |

### Side Effects
- Session disimpan di Redis: `session:{token}` dengan TTL sesuai `remember`.
- Aktivitas login dicatat ke tabel `Log`.
- CSRF token di-generate dan disimpan sebagai `csrf:{token}` di Redis.

---

## GET `/auth/`

Ambil data akun yang sedang login berdasarkan session aktif.

**Auth Required:** ✅ (via `authMiddleware`)

### Response Sukses

```json
HTTP 200 OK
{
  "status": "success",
  "data": {
    "email": "user@example.com",
    "role": "ADMIN",
    "status": "ACTIVE",
    "user": {
      "first_name": "John",
      "last_name": "Doe",
      "phone": "08123456789",
      "photo": null,
      "whatsapp": null
    },
    "ip": "127.0.0.1",
    "userAgent": "Mozilla/5.0 ...",
    "createdAt": 1710000000000,
    "lastActivity": 1710000000000
  }
}
```

### Response Error

| Status | Kondisi | Message |
|---|---|---|
| `401` | Cookie tidak ada / session expired | `"You must login first"` |

---

## DELETE `/auth/`

Logout — menghapus session aktif perangkat saat ini.

**Auth Required:** ✅ (via `authMiddleware`)

### Response Sukses

```json
HTTP 201 Created
{
  "status": "success",
  "data": {}
}
```

### Side Effects
- `session:{token}` dihapus dari Redis.
- `csrf:{token}` dihapus dari Redis.
- Cookie `SESSION_COOKIE_NAME` dan `CSRF_COOKIE_NAME` dihapus dari browser.

---

## GET `/csrf`

Generate CSRF token baru untuk sesi aktif.

**Auth Required:** ✅
**Catatan:** Endpoint ini dikelola oleh middleware CSRF, bukan `AuthRoutes`. Lihat `middleware/csrf.ts`.

### Response Sukses

```json
HTTP 200 OK
{
  "status": "success",
  "data": {
    "csrfToken": "abc123def456..."
  }
}
```

---

## Contoh cURL

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@erp.com",
    "password": "Admin@1234",
    "confirm_password": "Admin@1234"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/ \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "admin@erp.com",
    "password": "Admin@1234",
    "remember": false
  }'
```

### Get Account (dengan cookie)
```bash
curl -X GET http://localhost:3000/api/auth/ \
  -b cookies.txt
```

### Logout
```bash
curl -X DELETE http://localhost:3000/api/auth/ \
  -b cookies.txt \
  -H "X-CSRF-Token: <csrf_token>"
```
