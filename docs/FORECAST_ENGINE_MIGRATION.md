# Forecast Engine Migration — Dokumentasi Perubahan

> **Status:** Draft — Pending Review
> **Tanggal:** 2026-03-30
> **Scope:** `src/module/application/forecast/` + downstream

---

## 1. Ringkasan Eksekutif

Sistem forecast saat ini menggunakan **rumus pertumbuhan berbasis persentase bulanan** (`ForecastPercentage`). Template baru mengintroduksi arsitektur **multi-model statistik** (SMA, Exponential Smoothing, Holt-Winters, dll) dengan versioning, tracking akurasi, dan pemisahan rasio sistem vs. rasio manual.

---

## 2. Perbandingan: Current vs. Template

### 2.1 Model `Forecast` (tabel `forecasts`)

| Field | Current API | Template | Keterangan |
|---|---|---|---|
| `id` | ✅ | ✅ | — |
| `product_id` | ✅ | ✅ | — |
| `month` | ✅ SmallInt | ✅ SmallInt | — |
| `year` | ✅ SmallInt | ✅ SmallInt | — |
| `trend` | ✅ Enum Trend | ✅ Enum Trend | — |
| `status` | ✅ ForecastStatus | ✅ ForecastStatus | — |
| `base_forecast` | ✅ Decimal | ✅ Decimal | — |
| `final_forecast` | ✅ Decimal | ✅ Decimal | — |
| `ratio` | ✅ Decimal? | ❌ dihapus | Digantikan `additional_ratio` + `system_ratio` |
| `forecast_percentage_id` | ✅ FK → ForecastPercentage | ❌ dihapus | Tabel ForecastPercentage dihapus di template |
| `model_used` | ❌ | ✅ ForecastModel? | Model statistik yg digunakan (AUTO, SMA, ES, dll) |
| `version` | ❌ | ✅ Int default 1 | Versi forecast per periode |
| `is_latest` | ❌ | ✅ Boolean default true | Penanda versi terbaru |
| `absolute_error` | ❌ | ✅ Decimal? | Akurasi forecast (MAE per record) |
| `adjusted_at` | ❌ | ✅ DateTime? | Kapan forecast di-adjust manual |
| `forecast_for` | ❌ | ✅ DateTime @Date | Tanggal eksplisit periode forecast |
| `generated_in` | ❌ | ✅ DateTime @Date | Tanggal forecast di-generate |
| `is_actionable` | ❌ | ✅ Boolean default false | Apakah forecast siap dieksekusi |
| `valid_from` | ❌ | ✅ DateTime? @Date | Tanggal mulai berlaku |
| `additional_ratio` | ❌ | ✅ Decimal? | Rasio tambahan manual (pengganti `ratio`) |
| `system_ratio` | ❌ | ✅ Decimal? | Rasio yang dihitung oleh model sistem |
| **Unique constraint** | `[product_id, month, year]` | `[product_id, month, year, version]` | Berubah — support versioning |

### 2.2 Model `SafetyStock` (tabel `safety_stock`)

| Field | Current API | Template | Keterangan |
|---|---|---|---|
| `safety_stock_quantity` | ✅ | ✅ | — |
| `safety_stock_ratio` | ✅ | ✅ | — |
| `avg_forecast` | ✅ | ❌ dihapus | Diganti dengan kalkulasi berbasis MAE |
| `horizon` | ✅ | ❌ dihapus | — |
| `total_forecast` | ✅ | ❌ dihapus | — |
| `mean_absolute_error` | ❌ | ✅ Decimal | MAE antar forecast vs. aktual |
| `z_value_used` | ❌ | ✅ Decimal | Z-score yang dipakai (dari `Product.z_value`) |
| `additional_ratio` | ❌ | ✅ Decimal | Buffer tambahan di atas safety stock |

### 2.3 Model Lain yang Berubah

| Model | Perubahan |
|---|---|
| `ForecastPercentage` | **DIHAPUS** di template. Tidak ada lagi `forecasts_percentages` table. |
| `ProductIssuance` | **DIHAPUS** di template. Diganti `SalesActual` (`sales_actuals`). |
| `Product.distribution_percentage` | **DIHAPUS** di template. |
| `Product.safety_percentage` | **DIHAPUS** di template. |
| `Product.size_id` (FK) | Template menggunakan `Product.size Int` langsung. |

---

## 3. Perubahan Rumus Forecast Engine

### 3.1 Rumus Saat Ini (Percentage-Growth)

```
base_forecast[M]  = actual_sales[M-1] × (1 + pct_value)
final_forecast[M] = base_forecast[M]  × special_rules(product_type, size)
```

- `pct_value` diambil dari tabel `ForecastPercentage` per bulan/tahun
- Special rules: Atomizer mirrors total pool; EDP/Parfum split by `distribution_percentage`; 2ml mirrors Main bottle

### 3.2 Rumus Target (Multi-Model Statistical Engine)

```
system_ratio    = model.predict(historical_sales)  → float (growth rate per period)
base_forecast   = last_period × (1 + system_ratio)
additional_ratio = manual_override ?? 0
final_forecast  = base_forecast × (1 + additional_ratio / 100)
```

Model yang tersedia (`ForecastModel` enum):

| Enum | Deskripsi |
|---|---|
| `SIMPLE_MOVING_AVERAGE` | Rata-rata N bulan terakhir |
| `EXPONENTIAL_SMOOTHING` | Bobot eksponensial pada data terbaru |
| `HOLT_WINTERS` | SMA + trend + seasonality |
| `LINEAR_REGRESSION` | Regresi linear dari historical sales |
| `ARIMA` | Auto-Regressive Integrated Moving Average |
| `ENSEMBLE` | Kombinasi weighted dari beberapa model |
| `AUTO` | Sistem memilih model terbaik berdasarkan MAE |

### 3.3 Safety Stock Formula (Target)

```
MAE = mean(|actual[t] - forecast[t]|)  per product
safety_stock = z_value_used × MAE × sqrt(lead_time / review_period)
additional_ratio = buffer pct di atas safety_stock
```

Vs. rumus saat ini: `avg(4-month forecast) × safety_percentage`

---

## 4. Analisis Dampak ke Fitur Lain

### 4.1 Data Flow Lengkap

```
ProductIssuance (input aktual)
         ↓
  [Forecast Engine]
         ↓
  forecasts table
         ↓
  safety_stock table
         ↓
  recomendation-v2
         ↓
  material_purchase_drafts
```

### 4.2 Modul yang Terdampak

#### `forecast/percentages/` — **TERDAMPAK BESAR**
- **Sumber masalah:** Seluruh modul `percentages` akan obsolete jika `ForecastPercentage` dihapus.
- **Aksi:** Jika migrasi penuh, hapus modul ini. Jika migrasi bertahap, pertahankan sementara sebagai seed untuk `system_ratio`.

#### `issuance/` — **TERDAMPAK SEDANG**
- **Sumber masalah:** `ForecastService.run()` membaca `prisma.productIssuance` sebagai input base aktual (baris 72–79 forecast.service.ts). Template menggunakan `SalesActual`.
- **Aksi:** Jika `ProductIssuance` diganti `SalesActual`, query input di forecast engine harus diupdate.
- **Implikasi:** `issuance.service.ts` juga perlu direfactor. Atau, buat alias/bridge query.

#### `recomendation-v2/` — **TERDAMPAK SEDANG**
- **Sumber masalah:** Raw SQL di baris 141–175 `recomendation-v2.service.ts` langsung query tabel `forecasts`:
  ```sql
  SUM(f.final_forecast) as total_forecast_horizon
  FROM "forecasts" f
  WHERE f.product_id = rec.product_id
    AND f.month BETWEEN ...
  ```
- **Dampak jika unique constraint berubah:** Query ini tetap valid selama `WHERE` clause menggunakan `product_id + month + year`. Namun dengan versioning, perlu tambahkan filter `is_latest = true` agar tidak double-count.
- **Dampak jika `system_ratio`/`additional_ratio` menggantikan `ratio`:** Response DTO di `forecast.schema.ts` yang mengembalikan `ratio` harus diupdate.
- **Aksi:** Tambahkan `AND f.is_latest = true` pada semua raw SQL query di rekomendasi.

#### `bom/` — **TERDAMPAK RINGAN**
- BOM service menggunakan `safety_stock` dari `SafetyStock.safety_stock_quantity` melalui kalkulasi manual (baris 190, 226).
- Jika field `avg_forecast`, `horizon`, `total_forecast` dihapus dari `SafetyStock`, query yang memanfaatkan kolom-kolom ini akan error.
- **Aksi:** Audit query BOM apakah bergantung pada `avg_forecast`/`horizon`/`total_forecast`.

#### `consolidation/` — **TIDAK TERDAMPAK**
- Tidak ditemukan penggunaan forecast atau safety_stock di modul konsolidasi.

#### `stock-movement/`, `stock-transfer/`, `warehouse/` — **TIDAK TERDAMPAK**
- Tidak ada ketergantungan langsung pada forecast engine.

---

## 5. Perubahan yang Direncanakan

### 5.1 Fase 1 — Schema Migration (Database)

**File: `prisma/schema.prisma`**

```diff
model Forecast {
  ...
- ratio                  Decimal?           @db.Decimal(5, 2)
- forecast_percentage_id Int
- forecast_percentage    ForecastPercentage @relation(...)
+ model_used       ForecastModel? @default(AUTO)
+ version          Int            @default(1)
+ is_latest        Boolean        @default(true)
+ absolute_error   Decimal?       @db.Decimal(18, 2)
+ adjusted_at      DateTime?
+ forecast_for     DateTime       @db.Date
+ generated_in     DateTime       @db.Date
+ is_actionable    Boolean        @default(false)
+ valid_from       DateTime?      @db.Date
+ additional_ratio Decimal?       @db.Decimal(5, 2)
+ system_ratio     Decimal?       @db.Decimal(5, 2)

- @@unique([product_id, month, year])
+ @@unique([product_id, month, year, version])
}

model SafetyStock {
  ...
- avg_forecast   Decimal  @db.Decimal(18, 2)
- horizon        Int
- total_forecast Decimal  @db.Decimal(18, 2)
+ mean_absolute_error Decimal @db.Decimal(18, 2)
+ z_value_used       Decimal @db.Decimal(6, 3)
+ additional_ratio   Decimal @db.Decimal(18, 2)
}

+ enum ForecastModel {
+   SIMPLE_MOVING_AVERAGE
+   EXPONENTIAL_SMOOTHING
+   HOLT_WINTERS
+   LINEAR_REGRESSION
+   ARIMA
+   ENSEMBLE
+   AUTO
+ }
```

> ⚠️ **ForecastPercentage**: Keputusan perlu dikonfirmasi — hapus atau pertahankan untuk backward compat.

### 5.2 Fase 2 — Forecast Engine (`forecast.service.ts`)

Perubahan inti pada method `ForecastService.run()`:

1. **Input sumber data:** Dari `ProductIssuance` ke `SalesActual` (atau conditional berdasarkan availabilitas)
2. **Algoritma:** Ganti formula `input * (1 + pctValue)` dengan modul engine per model:
   - `SMAEngine.predict(historical, n)`
   - `ExponentialSmoothingEngine.predict(historical, alpha)`
   - `HoltWintersEngine.predict(historical, alpha, beta, gamma)`
3. **system_ratio:** Simpan growth rate yang dihitung model sebagai `system_ratio`
4. **Versioning:** Sebelum insert, set `is_latest = false` pada records sebelumnya untuk periode yang sama
5. **forecast_for / generated_in:** Isi dari parameter `start_month/start_year` dan `new Date()`
6. **is_actionable:** Set `true` untuk M+1, `false` untuk selebihnya (atau sesuai business logic)
7. **absolute_error:** Hitung setelah aktual tersedia (rekonsiliasi batch terpisah)

### 5.3 Fase 3 — Safety Stock Recalculation

Ubah dari `avg * safety_pct` ke formula MAE-based:
```
SS = z_value × MAE × sqrt(lead_time / review_period)
```

Fields `avg_forecast`, `horizon`, `total_forecast` di tabel dihapus. `mean_absolute_error` dan `z_value_used` menjadi mandatory.

### 5.4 Fase 4 — Downstream Fix

| Modul | Perubahan |
|---|---|
| `recomendation-v2.service.ts` | Tambah `AND f.is_latest = true` di semua raw SQL query pada `forecasts` |
| `forecast.service.ts` (GET) | Update `ratio` → `additional_ratio` di raw SQL SELECT dan response mapping |
| `forecast.schema.ts` | Update `ResponseForecastDTO.monthly_data.ratio` → `additional_ratio` |
| `percentages/` | Deprecated — hapus routes atau tandai sebagai legacy |
| `bom.service.ts` | Audit: pastikan tidak ada query ke `avg_forecast`/`horizon`/`total_forecast` |

---

## 6. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Perubahan unique constraint `forecasts` | Breaking — ON CONFLICT query di raw SQL akan error | Update semua raw upsert SQL + migration script |
| Hapus `ForecastPercentage` | Modul `percentages/` mati sepenuhnya | Hapus routes dan service, atau jadikan read-only historical |
| Hapus `ProductIssuance` | `issuance/` module tidak bisa berfungsi | Migrasi data ke `SalesActual` + update issuance service |
| Hapus `avg_forecast` dari SafetyStock | Response forecast GET akan error di `safety_stock_data` | Update query GET, hapus field dari DTO |
| `recomendation-v2` double count | Jika versioning aktif tanpa `is_latest` filter | Wajib tambah `AND f.is_latest = true` sebelum deploy |
| Model statistik baru butuh data historis cukup | SMA butuh min 3 data, HW butuh min 24 | Fallback ke Simple mode jika data tidak cukup |

---

## 7. File yang Akan Diubah

```
prisma/schema.prisma                                    ← Schema migration
src/module/application/forecast/
  forecast.service.ts                                   ← Core engine change
  forecast.schema.ts                                    ← DTO update (ratio → additional_ratio)
  forecast.controller.ts                                ← Minor (jika ada field baru di response)
  percentages/                                          ← Deprecated / hapus
src/module/application/recomendation-v2/
  recomendation-v2.service.ts                           ← Tambah is_latest filter
src/module/application/bom/
  bom.service.ts                                        ← Audit only
src/module/application/issuance/
  issuance.service.ts                                   ← Jika ProductIssuance → SalesActual
```

---

## 8. Pertanyaan yang Perlu Dikonfirmasi Sebelum Eksekusi

1. **Apakah `ForecastPercentage` dihapus sepenuhnya**, atau dipertahankan sebagai fallback `system_ratio` untuk bulan-bulan yang belum ada data historis cukup?
2. **Apakah `ProductIssuance` → `SalesActual` dilakukan dalam scope ini**, atau hanya Forecast engine yang diupdate dulu?
3. **Model mana yang menjadi default?** `AUTO` (template) atau tetap percentage-based untuk produk Display?
4. **Special rules (Atomizer, EDP/Parfum split, 2ml mirror) tetap dipertahankan?** Atau digantikan sepenuhnya oleh model statistik?
5. **Apakah perlu migration script** untuk mengisi `forecast_for` dan `generated_in` dari data existing?
6. **Versioning**: Apakah langsung diaktifkan, atau dimulai dengan `version = 1` dan `is_latest = true` untuk semua?

---

*Dokumentasi ini harus di-review dan pertanyaan di bagian 8 dikonfirmasi sebelum eksekusi.*
