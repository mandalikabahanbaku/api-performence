# Forecasting "Mother Formulas" — Core Logic Reference

> **Terakhir Diperbarui:** 2026-04-13
> **Status:** AKTIF / VALID (Source of Truth)
> **Catatan:** Dokumen ini merangkum rumus inti yang digunakan dalam `forecast.service.ts` dan `engines.ts`.

---

## 1. Dynamic MAE (Mean Absolute Error)

MAE dihitung oleh engine statistik berdasarkan selisih antara data aktual historis (`Actual`) dan nilai yang dipasang oleh model (`Fitted`).

### Rumus MAE
```
MAE = Σ |Actual[t] - Fitted[t]| / N
```
*Di mana N adalah jumlah titik data dalam periode evaluasi.*

---

## 2. Safety Stock (SS) Calculations

Safety Stock dirancang untuk meng-cover ketidakpastian (error) dalam ramalan.

### 2.1 Safety Stock Quantity
```
SS_qty = MAE × Z-value
```
*Z-value default adalah 1.65 (mencakup ~95% service level).*

### 2.2 Safety Stock Ratio (%)
Sistem menghitung rasio SS terhadap base forecast pada bulan pertama (M1) hasil proyeksi.
```
SS_ratio = (SS_qty / Base_Forecast_M1) × 100
```
*Penting: Nilai disimpan sebagai floating point (misal 5.2), bukan desimal (0.052).*

---

## 3. Final Forecast Calculations

Final Forecast adalah angka yang digunakan untuk perencanaan produksi dan pembelian.

### 3.1 Bulan Pertama (Actionable / M1)
Bulan pertama menyertakan Safety Stock secara penuh untuk memastikan ketersediaan segera.
```
Final_Forecast[M1] = Base_Forecast[M1] × (1 + (SS_ratio + additional_ratio) / 100)
```

### 3.2 Bulan Selanjutnya (M2 - M12)
Bulan-bulan berikutnya hanya menyertakan rasio tambahan manual (jika ada).
```
Final_Forecast[Mn] = Base_Forecast[Mn] × (1 + additional_ratio / 100)
```
*Note: `additional_ratio` bisa berbeda tiap bulan jika di-adjust secara manual.*

---

## 4. Total Demand & Need Produce

### 4.1 Total Demand (Horizon)
Jumlah total barang yang diproyeksikan akan keluar + buffer keamanan selama periode window.
```
Total_Demand = Sum(Final_Forecast_M1..M12) + Safety_Stock_Quantity
```

### 4.2 Need Produce (Immediate Action)
Jumlah yang **harus segera diproduksi/diadakan** setelah mempertimbangkan stok yang ada saat ini.
```
Need_Produce = max(0, Final_Forecast_M1 - Current_Stock)
```
- Jika `Current_Stock >= Final_Forecast_M1`, maka Need Produce = **0 (Cukup)**.

---

## 5. Sinkronisasi Data Ratio

Semua nilai persentase dalam sistem (Rasio Sistem, Rasio Tambahan, Rasio Safety) mengikuti standar berikut:
1. **Input Backend**: Float (0 - 100+).
2. **Penyimpanan DB**: Float/Decimal (misal: 10.0 berarti 10%).
3. **Kalkulasi**: Selalu dibagi 100 sebelum dikalikan ke Base Forecast.

---

## 6. Logika Anchor (Actual Sales Input)

Untuk mendapatkan `Base Forecast` yang akurat, sistem mencari data penjualan aktual (`ProductIssuance` type `ALL`) pada periode anchor:
- **Prioritas 1 (Jantung/M-1)**: Penjualan bulan lalu.
- **Prioritas 2 (Bulan Ini/M0)**: Penjualan bulan berjalan (jika forecast dijalankan di tengah bulan).

---

> **PENTING:** Rumus di atas adalah standar yang digunakan dalam implementasi saat ini. Jika ada perubahan pada kode sumber, dokumen ini wajib diperbarui agar tetap sinkron.
