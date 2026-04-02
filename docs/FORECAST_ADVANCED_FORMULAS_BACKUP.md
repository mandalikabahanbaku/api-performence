# Forecast Advanced Formulas & Code Backup

> **Tanggal Backup:** 2026-04-02
> **Alasan:** Disederhanakan ke Base Forecast saja. Rumus-rumus lanjutan disimpan di sini untuk referensi masa depan.

---

## 1. Dynamic MAE (Mean Absolute Error) Calculation

### Rumus
```
Deviation[M] = |Base_Forecast[M] - Actual_Sales[M-1]|
MAE = Σ Deviation / N  (N = jumlah bulan yang memiliki data aktual)
```

### Kode (di `forecast.service.ts` method `get()`)
```typescript
// Deviation: |base_forecast - prev_actual| (prev_actual = anchor for M1, previous month for rest)
monthly_data.forEach((m, idx) => {
    const prevActual =
        idx > 0 ? monthly_data[idx - 1]?.actual_sales : (anchorActual ?? null);
    m.deviation =
        prevActual != null
            ? Math.abs(Number(m.base_forecast) - Number(prevActual))
            : null;
});

// 4. Dynamic MAE: Average of Deviations (|Base - PrevActual|) across the visible horizon.
const zVal = Number(p.z_value ?? 1.65);
const validDeviations = monthly_data.filter((m) => m.deviation !== null);
const computedMae =
    validDeviations.length > 0
        ? validDeviations.reduce((sum, m) => sum + m.deviation!, 0) /
          validDeviations.length
        : ss?.mean_absolute_error
          ? Number(ss.mean_absolute_error)
          : 0;
```

---

## 2. Safety Stock Calculation

### Rumus
```
SS_quantity = MAE × Z-value
%SAFETY = (SS_quantity / Base_Forecast) + 35%
Final_Forecast (DRAFT) = |Base × (1 + %SAFETY)|
```

### Kode
```typescript
// SS quantity = MAE × z_value
const computedSsQty = computedMae * zVal;

// 5. Per-month %SAFETY = (SS_qty / Base Forecast) + 35%
monthly_data.forEach((m) => {
    const base = Number(m.base_forecast);

    // %SAFETY calculation (Ratio)
    m.safety_stock_pct =
        base > 0 ? Number((computedSsQty / base + 0.35).toFixed(4)) : 0.35;

    // Dynamically set Final Forecast for non-finalized (DRAFT/null) records
    if (!m.status || m.status === "DRAFT") {
        m.final_forecast = Math.abs(base * (1 + m.safety_stock_pct));
    }
});
```

---

## 3. Safety Stock Summary (Response DTO)

### Kode
```typescript
safety_stock_summary: {
    safety_stock_quantity:
        ss?.safety_stock_quantity != null ? Number(ss.safety_stock_quantity) : null,
    safety_stock_ratio:
        ss?.safety_stock_ratio != null ? Number(ss.safety_stock_ratio) : null,
    mean_absolute_error:
        ss?.mean_absolute_error != null ? Number(ss.mean_absolute_error) : null,
    z_value_used: ss?.z_value_used != null ? Number(ss.z_value_used) : null,
    additional_ratio:
        ss?.additional_ratio != null ? Number(ss.additional_ratio) : null,
    last_updated: ss?.created_at ? new Date(ss.created_at) : null,
    computed_mae: Number(computedMae.toFixed(2)),
    computed_ss_quantity: Number(computedSsQty.toFixed(2)),
},
```

---

## 4. Safety Stock Upsert in `updateManual()`

### Kode (Single Period)
```typescript
// Recalculate safety stock for this period
const zValue = Number(product.z_value ?? 1.65);
const existingSS = await prisma.safetyStock.findUnique({
    where: { product_id_month_year: { product_id, month, year } },
});
const mae = existingSS ? Number(existingSS.mean_absolute_error) : 0;
const ssQty = zValue * mae;
const ssRatio = resolvedFinal > 0 ? ssQty / resolvedFinal : 0;

await prisma.safetyStock.upsert({
    where: { product_id_month_year: { product_id, month, year } },
    create: {
        product_id,
        month,
        year,
        mean_absolute_error: mae,
        safety_stock_quantity: ssQty,
        safety_stock_ratio: ssRatio,
        z_value_used: zValue,
        additional_ratio: 0,
    },
    update: {
        safety_stock_quantity: ssQty,
        safety_stock_ratio: ssRatio,
        z_value_used: zValue,
    },
});
```

### Kode (Propagation — 12-month horizon)
```typescript
const ssValues = monthsRange
    .map((m) => {
        const zValue = Number(product.z_value ?? 1.65);
        const ssRatio = 0;
        return `(${product_id}, ${m.month}, ${m.year}, 0, 0, ${ssRatio}, ${zValue.toFixed(3)}, 0, '${nowIso}', '${nowIso}')`;
    })
    .join(", ");

await tx.$executeRawUnsafe(`
    INSERT INTO "safety_stock" (
        product_id, month, year,
        mean_absolute_error, safety_stock_quantity, safety_stock_ratio,
        z_value_used, additional_ratio,
        created_at, updated_at
    ) VALUES ${ssValues}
    ON CONFLICT (product_id, month, year)
    DO UPDATE SET
        safety_stock_quantity = EXCLUDED.safety_stock_quantity,
        safety_stock_ratio    = EXCLUDED.safety_stock_ratio,
        z_value_used          = EXCLUDED.z_value_used,
        updated_at            = EXCLUDED.updated_at
`);
```

---

## 5. Safety Stock SQL Query in `get()`

### Kode
```sql
(
    SELECT row_to_json(ss)
    FROM (
        SELECT
            safety_stock_quantity,
            safety_stock_ratio,
            mean_absolute_error,
            z_value_used,
            additional_ratio,
            created_at
        FROM "safety_stock"
        WHERE product_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
    ) ss
) AS "safety_stock_data"
```

---

## 6. Total Demand Calculation

### Rumus
```
Total Demand = Total Forecast (karena buffer sudah terintegrasi ke final_forecast)
```

### Kode
```typescript
const totalForecast = monthly_data.reduce(
    (sum, m) => sum + Number(m.final_forecast ?? m.base_forecast ?? 0),
    0,
);
const totalDemand = totalForecast;
```

---

## 7. Need Produce Calculation

### Rumus
```
Need Produce = max(0, Forecast_M1 - Current_Stock)
```

### Kode
```typescript
const m1MonthData = monthly_data.find(
    (m) => m.month === startMonth && m.year === startYear,
);
const m1Forecast = m1MonthData?.final_forecast ?? 0;
const currentStock = Number(p.current_stock ?? 0);
const needProduce = Math.max(0, m1Forecast - currentStock);
```

---

## 8. Frontend Column Definitions (Advanced Columns)

### Total Demand Column
```tsx
{
    id: "total-demand",
    header: () => (
        <div className="flex items-center font-black text-[10px] uppercase text-slate-500 whitespace-nowrap">
            Jumlah Forecast
            <FormulaHint
                title="Total Demand"
                formula="Total Demand = Total Forecast + (MAE × Z-value)"
                description="Safety Stock dihitung ulang dari MAE dinamis berdasarkan horizon yang dipilih."
            />
        </div>
    ),
    cell: ({ row }) => {
        const totalDemand = row.original.total_demand;
        return (
            <div className="flex flex-col py-1">
                <span className="font-bold text-rose-700 text-[10px] leading-tight">
                    {Math.round(totalDemand).toLocaleString("id-ID")}{" "}
                    <span className="text-[8px] font-medium text-rose-500">CC</span>
                </span>
            </div>
        );
    },
    size: 140,
},
```

### % Safety Column
```tsx
{
    id: "safety_percentage",
    header: () => (
        <div className="flex items-center font-black text-[10px] uppercase text-slate-500 whitespace-nowrap">
            % SAFETY
            <FormulaHint
                title="% Safety Stock"
                formula="(MAE × Z-value) / Forecast_bulan + 35%"
                description="MAE dihitung dari bulan yang memiliki data aktual dalam window horizon."
            />
        </div>
    ),
    cell: ({ row }) => {
        const firstMonth =
            row.original.monthly_data.find((m) => m.is_actionable) ??
            row.original.monthly_data[0];
        const pct = firstMonth?.safety_stock_pct;
        const display = pct != null ? `${(pct * 100).toFixed(1)}%` : "–";
        return (
            <div className="text-[10px] font-black text-amber-600 bg-amber-50 ...">
                {display}
            </div>
        );
    },
    size: 90,
},
```

### Safety Stock Column
```tsx
{
    id: "safety-stock",
    header: () => (
        <div className="flex items-center font-black text-[10px] uppercase text-slate-500 whitespace-nowrap">
            Safety Stock
            <FormulaHint
                title="Safety Stock"
                formula="SS = MAE × Z-value"
                description="MAE dihitung ulang dari data aktual dalam window horizon."
            />
        </div>
    ),
    cell: ({ row }) => {
        const ssQty = row.original.safety_stock_summary?.computed_ss_quantity ?? 0;
        return (
            <div className="flex flex-col py-1">
                <span className="font-bold text-emerald-700 text-[10px]">
                    {Math.round(ssQty).toLocaleString("id-ID")} CC
                </span>
                {row.original.safety_stock_summary?.computed_mae != null && 
                 row.original.safety_stock_summary.computed_mae > 0 && (
                    <span className="text-[8px] text-slate-400 font-medium">
                        MAE {row.original.safety_stock_summary.computed_mae.toFixed(1)}
                    </span>
                )}
            </div>
        );
    },
    size: 130,
},
```

---

## 9. Tooltip Detail (Safety Stock % in Cell Tooltip)

```tsx
{found.safety_stock_pct != null && (
    <div className="flex justify-between text-[10px] text-amber-700 font-bold bg-amber-50 px-1 rounded">
        <span>% Safety:</span>
        <span className="font-mono">
            {(found.safety_stock_pct * 100).toFixed(1)}%
        </span>
    </div>
)}
```

---

## 10. Response DTO Types (Advanced Fields)

### Backend (`forecast.schema.ts`)
```typescript
export type ResponseForecastDTO = {
    // ... base fields ...
    z_value: number;
    total_demand: number;
    monthly_data: Array<{
        // ... base fields ...
        deviation: number | null;
        safety_stock_pct: number | null;
    }>;
    safety_stock_summary: {
        safety_stock_quantity: number | null;
        safety_stock_ratio: number | null;
        mean_absolute_error: number | null;
        z_value_used: number | null;
        additional_ratio: number | null;
        last_updated: Date | null;
        computed_mae: number;
        computed_ss_quantity: number;
    } | null;
};
```

---

## 11. Prisma Schema — SafetyStock Model

```prisma
model SafetyStock {
  id                    Int      @id @default(autoincrement())
  product_id            Int
  year                  Int
  month                 Int
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt
  mean_absolute_error   Decimal  @db.Decimal(18, 2)
  safety_stock_quantity Decimal  @db.Decimal(18, 2)
  safety_stock_ratio    Decimal  @db.Decimal(18, 2)
  z_value_used          Decimal  @db.Decimal(6, 3)
  additional_ratio      Decimal  @db.Decimal(18, 2)
  product               Product  @relation(fields: [product_id], references: [id], onDelete: Cascade)

  @@unique([product_id, month, year])
  @@index([product_id])
  @@map("safety_stock")
}
```

---

> **CATATAN:** Semua kode di atas telah di-backup sebelum dihapus dari codebase utama.
> Jika ingin mengaktifkan kembali fitur-fitur ini, gunakan referensi di atas.
