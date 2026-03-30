# 📦 Product Module — Business Logic & Flow

---

## 1. Arsitektur

```
ProductRoutes (/api/app/products)
    │
    ├── /units    → UnitRoutes
    ├── /types    → TypeRoutes
    ├── /sizes    → SizeRoutes
    ├── /stocks   → ProductStockRoutes  (skip)
    └── /import   → ProductImportRoutes (skip)
    │
    ├── ProductController
    │       └── ProductService
    │
    └── Sub-controllers: ProductSizeController, UnitController, TypeController
```

---

## 2. Prisma Model

```
Product
├── id                      Int (PK)
├── code                    String UNIQUE (max 100, no whitespace)
├── name                    String (max 100)
├── gender                  GENDER (WOMEN | MEN | UNISEX) default UNISEX
├── status                  STATUS default PENDING
├── z_value                 Decimal(5,2) default 1.65
├── lead_time               Int default 30  (hari)
├── review_period           Int default 30  (hari)
├── distribution_percentage Decimal(5,2) default 0
├── safety_percentage       Decimal(5,2) default 0
├── description             String?
├── deleted_at              DateTime? (soft delete flag)
│
├── size_id → ProductSize { id, size: Int UNIQUE }
├── type_id → ProductType { id, slug UNIQUE, name }
└── unit_id → Unit        { id, slug UNIQUE, name }
```

**Index kritis:** `code`, `name`, `type_id`, `status`, `updated_at`, `(code, name, status)`

---

## 3. Service Methods

### `ProductService.create(body)`

```
1. Cek kode unik → 400 jika sudah ada
2. Mulai $transaction:
   a. getOrCreate(productType) — cari by slug, create jika belum ada
   b. getOrCreate(unit) — cari by slug, create jika belum ada
   c. getOrCreateSize(size) — cari by ukuran exact, create jika belum ada
   d. product.create() dengan relasi ids
3. Return product + convert Decimal → Number
```

**Business rule:** `code` bersifat unik permanen, tidak bisa diubah ke kode yang sudah dipakai produk lain.

**Helper `getOrCreate(model, name)`:**
- Jika `name` bukan string (sudah berupa ID number) → langsung return ID
- Generate slug via `normalizeSlug(name)`
- `findUnique({ where: { slug } })` — return id jika ada
- `create({ name, slug })` — buat baru jika belum ada
- Dipakai oleh: `productType`, `unit`

---

### `ProductService.update(id, body)`

```
1. Cek produk exists → 404 jika tidak ada
2. Jika code berubah → cek kode baru belum dipakai → 400 jika bentrok
3. Mulai $transaction:
   a. Resolve type_id, unit_id, size_id (getOrCreate / pertahankan existing)
   b. product.update() dengan data baru
4. Return product + convert Decimal → Number
```

---

### `ProductService.status(id, status)`

```
1. Cek produk exists → 404 jika tidak ada
2. Update status:
   - status = "DELETE" → set deleted_at = now()
   - status lainnya   → set deleted_at = null
```

**Status flow (STATUS enum):**
```
PENDING → ACTIVE → FAVOURITE (unggulan)
                 → BLOCK     (nonaktif)
                 → DELETE    (soft delete, menunggu clean)
```

---

### `ProductService.clean()`

```
1. Count produk dengan deleted_at NOT NULL → 400 jika 0 (tidak ada yang perlu dihapus)
2. deleteMany({ where: { deleted_at: { not: null } } }) — permanent delete
```

**Catatan:** Cache `products:list` di-invalidate via `Cache.afterMutation()`.

---

### `ProductService.list(query)`

Raw SQL dengan LEFT JOIN ke `product_types`, `unit_of_materials`, `product_size`.

**Filter yang didukung:**

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `search` | string | - | ILIKE pada `name` DAN `code` |
| `status` | STATUS | - | Jika tidak di-set: exclude DELETE |
| `gender` | GENDER | - | Filter exact |
| `type_id` | number | - | Filter by product type |
| `size_id` | number | - | Filter by ukuran |
| `sortBy` | enum | `name` | Lihat daftar kolom di bawah |
| `sortOrder` | asc/desc | `asc` | |
| `page` | number | 1 | |
| `take` | number | 25 | Max 100 |

**Kolom sortBy yang valid:** `code`, `name`, `updated_at`, `created_at`, `gender`, `type` (JOIN), `size` (JOIN), `lead_time`, `distribution_percentage`, `safety_percentage`

**Penting:** `Prisma.raw()` digunakan untuk kolom sort yang sudah divalidasi dengan allow-list, bukan user input langsung — aman dari SQL injection.

Return: `{ data: ResponseProductDTO[], len: number }` (len = total count sebelum pagination)

---

### `ProductService.detail(id)`

Raw SQL yang sama dengan `list` tapi dengan `WHERE p.id = ${id} LIMIT 1`.

Return: `ResponseProductDTO` tunggal, atau 404 jika tidak ditemukan.

---

## 4. Sub-Module: ProductSize

**Model:** `ProductSize { id, size: Int UNIQUE }`

| Method | Business Rule |
|---|---|
| `create(body)` | Tolak jika ukuran (angka) sudah ada |
| `list(query)` | Filter by exact size number; pagination |
| `update(id, body)` | Cek exist → cek konflik ukuran baru |
| `delete(id)` | Tolak jika masih digunakan produk (`_count.products > 0`) |

---

## 5. Sub-Module: Unit (Satuan)

**Model:** `Unit { id, slug UNIQUE, name }`

| Method | Business Rule |
|---|---|
| `create(body)` | Generate slug dari name; tolak jika slug sudah ada |
| `list(query)` | ILIKE search pada `name`; pagination |
| `update(id, body)` | Recalculate slug; cek konflik jika slug berubah |
| `delete(id)` | Tolak jika masih digunakan produk |

---

## 6. Sub-Module: ProductType (Tipe)

Identik dengan Unit. Model: `ProductType { id, slug UNIQUE, name }`.

| Method | Business Rule |
|---|---|
| `create(body)` | Generate slug; tolak duplikat |
| `list(query)` | ILIKE search; pagination |
| `update(id, body)` | Cek konflik slug baru |
| `delete(id)` | Tolak jika masih digunakan produk |

---

## 7. Decimal Handling

Prisma mengembalikan field `Decimal` (dari `@db.Decimal`) sebagai objek `Prisma.Decimal`, bukan `number`. Ketiga field ini selalu dikonversi manual:

```ts
z_value: Number(result.z_value),
distribution_percentage: Number(result.distribution_percentage),
safety_percentage: Number(result.safety_percentage),
```

Ini berlaku di `create`, `update`, `list`, dan `detail`.

---

## 8. Activity Logging

Setiap mutasi di `ProductController` mencatat log ke `LoggingActivity`:

| Action | Description |
|---|---|
| `create` | `"Produk {code}: {name}"` |
| `update` | `"Produk {code}: {name}"` |
| `status` | `"Status Produk {id}"` |
| `clean` | `"Produk"` |

---

## 9. Cache Strategy

Saat ini `Cache.afterMutation(PRODUCT_LIST_KEY)` hanya aktif di `clean()`. Bagian `create`, `update`, dan `status` memiliki cache yang dikomentari (pending re-enable).

```ts
const PRODUCT_LIST_KEY = "products:list";
```

---

## 10. Known Issues / TODO

| # | Issue | Status |
|---|---|---|
| 1 | Cache `create/update/status` dikomentari | ⚠️ Pending re-enable |
| 2 | `redisProduct()` method dikomentari (untuk Redis warm-up) | ⚠️ Pending |
| 3 | `getProductRedis` endpoint dikomentari di controller | ⚠️ Pending |
| 4 | `list()` tidak punya filter `size_id` di controller (query param belum di-pass) | ⚠️ Bug |
| 5 | Unit test untuk size/unit/type belum mencakup routes test | ⚠️ Partial |
