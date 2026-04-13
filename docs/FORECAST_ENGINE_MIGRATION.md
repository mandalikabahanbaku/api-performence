# Forecast Engine Migration — Dokumentasi Perubahan

> **Status:** IMPLEMENTED / LIVE
> **Tanggal Update Dokumen:** 2026-04-13
> **Scope:** `src/module/application/forecast/`

---

## 1. Ringkasan Eksekutif

Sistem forecast telah dimigrasi dari rumus pertumbuhan berbasis persentase statis ke **Arsitektur Multi-Model Statistik** (Linear Regression, SMA, WMA, Exponential Smoothing, Holt-Winters). Sistem ini menyertakan tracking akurasi (MAE), dynamic safety stock, dan pemisahan rasio sistem (`system_ratio`) serta rasio manual (`additional_ratio`).

---

## 2. Status Model & Schema

### 2.1 Model `Forecast` (tabel `forecasts`) — [LIVE]

| Field | Tipe | Keterangan |
|---|---|---|
| `base_forecast` | Decimal | Output murni dari model statistik. |
| `final_forecast` | Decimal | Hasil akhir (Base × Rasio). |
| `model_used` | Enum | Model yang digunakan (AUTO, SMA, LINEAR_REGRESSION, dll). |
| `system_ratio` | Decimal | Growth rate yang dihitung oleh model sistem. |
| `additional_ratio` | Decimal | Rasio tambahan manual dari PIC Forecast. |
| `version` | Int | Increment otomatis setiap kali rerunning forecast. |
| `is_latest` | Boolean | Penanda versi terbaru per periode. |
| `absolute_error` | Decimal | Nilai MAE pada saat record dibuat. |
| `is_actionable` | Boolean | `true` hanya untuk bulan pertama (M1) hasil generate. |

### 2.2 Model `SafetyStock` (tabel `safety_stock`) — [LIVE]

| Field | Tipe | Keterangan |
|---|---|---|
| `mean_absolute_error` | Decimal | MAE historis untuk menghitung SS qty. |
| `z_value_used` | Decimal | Z-score (misal 1.65 untuk 95% service level). |
| `safety_stock_quantity` | Decimal | `MAE × Z-value`. |
| `safety_stock_ratio` | Decimal | `(SS_qty / Avg_Forecast) × 100`. |
| `additional_ratio` | Decimal | Buffer tambahan khusus Safety Stock. |
| `avg_forecast` | Decimal | Rata-rata forecast dalam window horizon. |

---

## 3. Rumus Forecast Engine

### 3.1 Base Forecast (Statistical Engine)

Sistem menggunakan dispatcher `runForecastEngine` yang memilih model terbaik berdasarkan jumlah data aktual yang tersedia:
- **12+ Bulan**: Holt-Winters (Seasonal).
- **6-11 Bulan**: Exponential Smoothing (Holt-Linear).
- **3-5 Bulan**: Weighted Moving Average (WMA).
- **<3 Bulan**: Linear Regression.

### 3.2 Safety Stock Calculation

```
MAE = Average Absolute Error (History vs Fitted)
SS_qty = MAE × Z-value
SS_ratio = (SS_qty / Base_Forecast_M1) × 100
```

### 3.3 Final Forecast (M1 vs Others)

- **Mulan M1 (Actionable)**:
  `Final = Base × (1 + (SS_ratio + additional_ratio) / 100)`
- **Bulan M2 dst**:
  `Final = Base × (1 + additional_ratio / 100)`

> [!NOTE]
> `additional_ratio` pada M1 diambil dari tabel `safety_stock` (add_ss_ratio), sedangkan pada bulan lainnya diambil dari `additional_ratio` per record di tabel `forecasts`.

### 3.4 Need Produce

```
Need Produce = max(0, Final_Forecast_M1 - Current_Stock)
```
- Jika hasil `<= 0`, stock dianggap **Cukup**.

---

## 4. Dampak ke Modul Lain

### 4.1 Recommendation V2
- Query menggunakan `SUM(f.final_forecast)` dengan filter `is_latest = true`.
- Safety stock terintegrasi melalui `final_forecast` pada bulan pertama horizon.

### 4.2 Legacy Modules
- `ForecastPercentage`: **DEPRECATED**. Tidak lagi digunakan sebagai trigger utama engine.
- `ProductIssuance`: Masih digunakan sebagai input aktual sales utama (`type: 'ALL'`).

---

## 5. Sinkronisasi Database (floating vs percentage)
Semua ratio (`system_ratio`, `additional_ratio`, `safety_stock_ratio`) disimpan di database dalam bentuk **angka riil/floating** (contoh: 5.2 untuk 5.2%), bukan decimal 0.052. Pembagian dengan 100 dilakukan di level aplikasi saat menghitung `final_forecast`.
