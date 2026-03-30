# Mandalika ERP - API (Backend)

Sistem Backend berbasis Node.js yang kuat, dirancang untuk mengelola logika bisnis inti Mandalika ERP. Dibangun dengan fokus pada kecepatan, keamanan, dan skalabilitas.

## 🚀 Teknologi Utama

- **Runtime**: Node.js dengan [Hono](https://hono.dev/) framework (Fast & Lightweight).
- **Database ORM**: [Prisma](https://www.prisma.io/) dengan PostgreSQL.
- **Caching**: [Redis](https://redis.io/) (via ioredis) untuk performa tinggi.
- **Validation**: [Zod](https://zod.dev/) untuk skema data yang aman secara tipe.
- **Logging**: [Winston](https://github.com/winstonjs/winston) logger.
- **AI Integration**: [TensorFlow.js](https://www.tensorflow.org/js) untuk kapabilitas machine learning lokal.

## 🛠️ Fitur Utama

- **Manajemen Material**: Pengelolaan Raw Material, Supplier, dan Unit.
- **Manajemen Produk**: Inventory barang jadi dan integrasi resep produk.
- **Modul Penjualan**: Pencatatan transaksi sales dengan agregasi data real-time.
- **Gudang (Warehouse)**: Tracking stok antar lokasi gudang yang berbeda.
- **Auth & Security**: Implementasi Bcrypt untuk enkripsi password dan validasi ketat via Zod.

## 📋 Prasyarat

- Node.js v18+
- PostgreSQL
- Redis Server

## ⚙️ Instalasi & Pengembangan

1. Clone repositori dan masuk ke direktori:
    ```bash
    cd api
    ```
2. Instal dependensi:
    ```bash
    npm install
    ```
3. Setup Environment:
   Salin `.env.example` ke `.env` dan sesuaikan kredensial database/redis Anda.
4. Jalankan migrasi database:
    ```bash
    npx prisma migrate dev
    ```
5. Jalankan server pengembangan:
    ```bash
    npm run dev
    ```

## 🏗️ Struktur Proyek

- `src/module/application`: Berisi logika domain bisnis (Sales, Product, RawMat, dll).
- `prisma/`: Definisi skema database dan data seeder.
- `DOCS/`: Dokumentasi teknis tambahan.

---

© 2026 Mandalika ERP.
