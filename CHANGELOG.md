# Changelog - API (Backend)

Semua perubahan utama pada sisi server dicatat di sini.

## [2026-03-18] — Patch 4

### Refactor

- **OutletInventory Module Reorganization**: File-file inventory dipindahkan ke subdirektori `outlet/inventory/` agar struktur modul lebih rapi.
  - `outlet/outlet-inventory.schema.ts` → `outlet/inventory/outlet-inventory.schema.ts`
  - `outlet/outlet-inventory.service.ts` → `outlet/inventory/outlet-inventory.service.ts`
  - `outlet/outlet-inventory.controller.ts` → `outlet/inventory/outlet-inventory.controller.ts`
  - Import di `outlet.routes.ts` diperbarui mengikuti path baru.

---

## [2026-03-18] — Patch 3

### Added

- **OutletInventory Module (S1-B)**: Implementasi lengkap modul stok real-time per outlet.
  - `outlet-inventory.schema.ts` — Zod: `RequestInitInventorySchema`, `RequestSetMinStockSchema`, `QueryInventorySchema`, `ResponseInventorySchema` + DTO export
  - `outlet-inventory.service.ts` — 5 methods: `getStock`, `listStock`, `initProducts`, `setMinStock`, `adjustQuantity`
  - `outlet-inventory.controller.ts` — 4 handler: `list`, `detail`, `init`, `setMinStock`
  - 4 endpoint baru di `outlet.routes.ts`: `GET /:id/inventory`, `GET /:id/inventory/:product_id`, `POST /:id/inventory/init`, `PATCH /:id/inventory/:product_id/min-stock`
  - `is_low_stock` computed flag di setiap item response (qty < min_stock)
  - `low_stock=true` query filter (computed in-memory, idiomatic untuk skala outlet)
  - `adjustQuantity(delta, tx?)` sebagai internal method untuk StockTransfer + POS — throw 422 jika qty < 0

### Fixed

- **Outlet Service**: Ekstrak duplikat warehouse validation (`create` + `update`) ke `private static validateFinishGoodsWarehouse()`.
- **Outlet Service**: Ganti string literal `"FINISH_GOODS"` dengan enum `WarehouseType.FINISH_GOODS` dari generated Prisma client.
- **Outlet Controller**: Hapus `parseQuery()` yang meng-implementasi ulang schema coercion secara manual; `list()` kini langsung call `QueryOutletSchema.parse(c.req.query())`.

### Tests

- **outlet-inventory.service.test.ts**: 19 unit test (getStock, listStock, initProducts, setMinStock, adjustQuantity ±delta + negative qty guard)
- **outlet-inventory.routes.test.ts**: 20 integration test (4 endpoints: 200/201/400/404)
- **Total tests**: 363 → 402 (39 test baru)

---

## [2026-03-18] — Patch 2

### Fixed

- **Outlet ↔ Warehouse Type Validation**: Koreksi business rule — outlet hanya boleh terhubung dengan warehouse bertipe `FINISH_GOODS`. Warehouse bertipe `RAW_MATERIAL` kini mengembalikan error `422 Unprocessable Entity` dengan pesan yang jelas. Fix berlaku di `create()` dan `update()` pada `OutletService`.
- **Test Coverage**: Tambah 3 test case baru (2 service + 1 routes) untuk validasi tipe warehouse yang salah (422). Total test naik dari 356 → 359.
- **Global Prisma Mock**: Tambah `id: 3` ke mock `warehouse.findUnique` di `setup.ts` sebagai fixture gudang `RAW_MATERIAL` untuk test scenario validasi tipe.

### Frontend

- **Outlet Form**: Ganti `useWarehouses()` (semua tipe) dengan `useWarehouseStatic({ type: "FINISH_GOODS" })` — dropdown gudang di form create/edit outlet kini **hanya menampilkan gudang Barang Jadi**.
- **Outlet List Filter**: Filter dropdown gudang di halaman list outlet juga diperbarui hanya menampilkan FINISH_GOODS.
- **Label & Description**: Label field warehouse diupdate menjadi "Gudang Barang Jadi (Finish Goods)" dengan `FormDescription` penjelasan constraint.
- **Schema Fix**: Hapus field `pos_enabled` dari `ResponseOutletSchema` frontend (field tidak ada di backend response).
- **Outlet UI Redesign**: Mengubah tampilan list Outlet dari `DataTable` menjadi layout berbasis kartu (card grid) yang lebih modern dan selaras dengan desain Moka POS, lengkap dengan custom pagination.
- **Outlet Form Migration**: Melakukan refaktorisasi `OutletForm` agar menggunakan custom Form Components (`<Form>`, `<InputForm>`, `<SelectForm>`), menggantikan tag form element default lama.
- **Outlet Action Dialog**: Memperbaiki fungsi hapus agar tidak menggunakan popup `window.confirm` dari sistem operasi, melainkan menggunakan memanggil custom UI `<DialogAlert>`.

---

## [2026-03-18]

### Added

- **Outlet Module (CRUD)**: Implementasi lengkap modul Outlet (Toko) sebagai entitas terpisah dari Warehouse. Outlet ditujukan untuk integrasi POS ke depan.
  - `outlet.schema.ts` — Zod validation: `RequestOutletSchema`, `UpdateOutletSchema`, `QueryOutletSchema` + DTO export
  - `outlet.service.ts` — `create`, `update`, `toggleStatus`, `delete` (soft), `list`, `detail` dengan business rule validasi kode unik & warehouse exist
  - `outlet.controller.ts` — HTTP handler static class + `parseQuery`
  - `outlet.routes.ts` — 6 endpoint terdaftar: `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id`
  - Didaftarkan di `application.routes.ts` → `/api/app/outlets`

- **Schema Prisma — Inventory Control Domain**: Penambahan model dan enum baru ke `schema.prisma` untuk fondasi sistem inventory control.
  - Model baru: `Outlet`, `OutletAddress`, `OutletInventory`, `StockMovement`, `StockTransfer`, `StockTransferItem`, `StockTransferPhoto`
  - Enum baru: `TransferLocationType`, `TransferStatus` (10 status), `MovementEntityType`, `MovementLocationType`, `MovementType`, `MovementRefType`, `TransferPhotoStage`
  - Field `barcode` (8-char uppercase alphanumeric, auto-generated, `@unique`) pada `StockTransfer`
  - Relasi balik ditambahkan ke `Product` dan `Warehouse`
  - `prisma db push` + `prisma generate` selesai — DB & Prisma Client tersinkronisasi

- **Test Suite — Outlet Module**: 50 test baru ditambahkan ke `src/tests/outlet/`.
  - `outlet.service.test.ts` — 27 unit test: create (duplikat code 409, warehouse 404, sukses ±address ±warehouse), update (404, code conflict 409, warehouse 404, upsert address, skip code-check jika sama), toggleStatus (aktif↔nonaktif), delete (soft), list (filter `is_active`/`warehouse_id`/search/pagination/`deleted_at: null`), detail (found/404/soft-deleted)
  - `outlet.routes.test.ts` — 23 integration test via `app.request()`: semua 6 endpoint dengan skenario sukses, validasi Zod 400, 404, 409
  - Mock global `prisma.outlet` + `prisma.outletAddress` ditambahkan ke `src/tests/setup.ts`

- **Dokumentasi Sistem**: Dokumen lengkap ditambahkan ke `api/docs/`:
  - `SUM.md` — Analisis sistem 2-domain, arsitektur, timeline 17 minggu solo developer
  - `PRD.md` — Product Requirements Document (F01–F60), user personas, role matrix
  - `ERD.md` — Entity Relationship Diagram 13-domain format Mermaid
  - `FLOW.md` — 10 flowchart Mermaid: alur Transfer 10-status, W→W/W→O/O→O/O→W
  - `SCHEMA.md` — Referensi Prisma schema per sprint + desain barcode & photo evidence
  - `TODO.md` — Sprint backlog terstruktur S1–S6 dengan method signature & endpoint list

### Fixed

- **Prisma DB Sync Strategy**: Beralih dari `prisma migrate dev` ke `prisma db push` karena DB awal disetup tanpa migration history, menghindari drift error.

---

## [2026-03-04]

### Added

- **Sales Analytics Support**: Menambahkan dukungan filter `product_id` pada modul Sales untuk mendukung query analitik spesifik produk.
- **DTO Updates**: Memperbarui `QuerySalesSchema` di `sales.schema.ts` untuk menyertakan opsional `product_id`.
- **Logic Improvements**: Modifikasi `SalesService.list()` untuk memproses filter `product_id` dalam query Prisma.
- **Controller Enhancement**: Sinkronisasi `SalesController` untuk menangkap dan meneruskan parameter `product_id` dari request query ke service.

### Fixed

- **Postgres Enum Compatibility**: Perbaikan isu argument type pada query sales yang melibatkan filter `variant` (product type).
- **Horizon Filtering**: Implementasi filter rentang waktu (bulan) pada data penjualan agar dinamis.
