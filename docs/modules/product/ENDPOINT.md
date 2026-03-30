# 📦 Product Module — API Reference

Base path: `/api/app/products`

Semua endpoint memerlukan **autentikasi session** (`authMiddleware`).

---

## Product Endpoints

---

### `GET /api/app/products`

Mendapatkan daftar produk dengan pagination, filter, dan sorting.

**Query Parameters:**

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `search` | string | - | Cari di `name` dan `code` (ILIKE) |
| `status` | PENDING \| ACTIVE \| FAVOURITE \| BLOCK \| DELETE | - | Filter by status; tanpa filter: exclude DELETE |
| `gender` | WOMEN \| MEN \| UNISEX | - | Filter by gender |
| `type_id` | number | - | Filter by product type ID |
| `page` | number | 1 | Halaman |
| `take` | number | 25 | Item per halaman (max 100) |
| `sortBy` | code \| name \| updated_at \| created_at \| gender \| type \| size \| lead_time \| distribution_percentage \| safety_percentage | `name` | Kolom sort |
| `sortOrder` | asc \| desc | `asc` | Arah sort |

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "data": [
      {
        "id": 1,
        "code": "EDP_110",
        "name": "Eau De Parfum 110ml",
        "gender": "UNISEX",
        "status": "ACTIVE",
        "z_value": 1.65,
        "lead_time": 14,
        "review_period": 30,
        "distribution_percentage": 50,
        "safety_percentage": 10,
        "description": null,
        "deleted_at": null,
        "product_type": { "id": 1, "name": "EDP", "slug": "edp" },
        "unit": { "id": 1, "name": "pcs", "slug": "pcs" },
        "size": { "id": 1, "size": 110 }
      }
    ],
    "len": 42
  },
  "query": { "page": 1, "take": 25, ... }
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/app/products?search=edp&status=ACTIVE&sortBy=name&page=1&take=10" \
  -H "Cookie: SESSION-ID=your-session-id"
```

---

### `POST /api/app/products`

Membuat produk baru.

**Request Body:**
```json
{
  "code": "EDP_110",
  "name": "Eau De Parfum 110ml",
  "size": 110,
  "gender": "UNISEX",
  "status": "PENDING",
  "z_value": 1.65,
  "lead_time": 14,
  "review_period": 30,
  "unit": "pcs",
  "product_type": "EDP",
  "distribution_percentage": 50,
  "safety_percentage": 10,
  "description": null
}
```

| Field | Tipe | Required | Keterangan |
|---|---|---|---|
| `code` | string | ✅ | Max 100, no whitespace (gunakan `_`) |
| `name` | string | ✅ | 5–100 karakter |
| `size` | number | ✅ | Integer ≥ 2, auto find-or-create di `product_size` |
| `gender` | GENDER | - | Default `UNISEX` |
| `status` | STATUS | - | Default `PENDING` |
| `z_value` | number | - | Default `1.65` |
| `lead_time` | number | - | Default `14` hari |
| `review_period` | number | - | Default `30` hari |
| `unit` | string \| null | - | Nama satuan, auto find-or-create |
| `product_type` | string \| null | - | Nama tipe, auto find-or-create |
| `distribution_percentage` | number | - | Default `0` |
| `safety_percentage` | number | - | Default `0` |

**Response 201:** Object produk lengkap (sama dengan item dalam list).

**Errors:**
- `400` — Kode produk sudah digunakan

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/app/products" \
  -H "Content-Type: application/json" \
  -H "Cookie: SESSION-ID=your-session-id" \
  -d '{"code":"EDP_110","name":"Eau De Parfum 110ml","size":110}'
```

---

### `GET /api/app/products/:id`

Detail produk berdasarkan ID.

**Response 200:** Object produk tunggal.

**Errors:**
- `400` — ID tidak di-pass
- `404` — Produk tidak ditemukan

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/app/products/1" \
  -H "Cookie: SESSION-ID=your-session-id"
```

---

### `PUT /api/app/products/:id`

Update produk (partial — semua field opsional).

**Request Body:** Sama dengan POST, tapi semua field opsional.

**Response 201:** Object produk yang sudah diupdate.

**Errors:**
- `404` — Produk tidak ditemukan
- `400` — Kode baru sudah digunakan produk lain

**cURL:**
```bash
curl -X PUT "http://localhost:3000/api/app/products/1" \
  -H "Content-Type: application/json" \
  -H "Cookie: SESSION-ID=your-session-id" \
  -d '{"name":"Nama Baru","lead_time":21}'
```

---

### `PATCH /api/app/products/status/:id?status=STATUS`

Ubah status produk.

**Query Parameter:**

| Parameter | Tipe | Required | Keterangan |
|---|---|---|---|
| `status` | STATUS | ✅ | PENDING \| ACTIVE \| FAVOURITE \| BLOCK \| DELETE |

**Catatan:** `status=DELETE` akan men-set `deleted_at = now()`. Status lain me-null-kan `deleted_at`.

**Response 201:** `{}`

**Errors:**
- `400` — ID tidak ada
- `404` — Produk tidak ditemukan

**cURL:**
```bash
curl -X PATCH "http://localhost:3000/api/app/products/status/1?status=ACTIVE" \
  -H "Cookie: SESSION-ID=your-session-id"
```

---

### `DELETE /api/app/products/clean`

Hapus permanen semua produk dengan `status=DELETE` (`deleted_at != null`).

**Response 201:** `{}`

**Errors:**
- `400` — Tidak ada produk yang perlu dihapus

**cURL:**
```bash
curl -X DELETE "http://localhost:3000/api/app/products/clean" \
  -H "Cookie: SESSION-ID=your-session-id"
```

---

## Size Sub-Endpoints (`/api/app/products/sizes`)

---

### `GET /api/app/products/sizes`

**Query:** `search` (number exact), `page`, `take`

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "data": [{ "id": 1, "size": 110 }, { "id": 2, "size": 125 }],
    "len": 5
  }
}
```

---

### `POST /api/app/products/sizes`

```json
{ "size": 110 }
```

**Errors:** `400` — Ukuran sudah tersedia

---

### `PUT /api/app/products/sizes/:id`

```json
{ "size": 125 }
```

**Errors:** `404` — Tidak ditemukan; `400` — Konflik ukuran

---

### `DELETE /api/app/products/sizes/:id`

**Errors:** `404` — Tidak ditemukan; `400` — Masih digunakan produk

---

## Unit Sub-Endpoints (`/api/app/products/units`)

---

### `GET /api/app/products/units`

**Query:** `search` (string ILIKE), `page`, `take`

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "data": [{ "id": 1, "name": "pcs", "slug": "pcs" }],
    "len": 3
  }
}
```

---

### `POST /api/app/products/units`

```json
{ "name": "pcs" }
```

**Errors:** `400` — Satuan sudah tersedia (same slug)

---

### `PUT /api/app/products/units/:id`

```json
{ "name": "lusin" }
```

---

### `DELETE /api/app/products/units/:id`

**Errors:** `404` — Tidak ditemukan; `400` — Masih digunakan produk

---

## Type Sub-Endpoints (`/api/app/products/types`)

Identik dengan Units. Model: `ProductType { id, slug, name }`.

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/app/products/types` | GET | List tipe produk |
| `/api/app/products/types` | POST | `{ "name": "EDP" }` |
| `/api/app/products/types/:id` | PUT | Update nama tipe |
| `/api/app/products/types/:id` | DELETE | Hapus (tolak jika digunakan) |

---

## Error Response Format

```json
{
  "status": "error",
  "message": "Deskripsi error"
}
```

| Status Code | Kondisi |
|---|---|
| `400` | Validasi gagal / duplikasi / constraint |
| `401` | Tidak ada session |
| `403` | Role tidak memiliki akses |
| `404` | Resource tidak ditemukan |
| `500` | Server error |
