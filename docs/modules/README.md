# 📚 Module Documentation Index

Setiap folder di sini berisi dokumentasi lengkap per-modul: business logic, API reference, dan frontend integration guide.

---

## Struktur Per Modul

```
modules/
└── [feature]/
    ├── ROADMAP.md              ← Business flow, service methods, business rules
    ├── ENDPOINT.md             ← API reference lengkap (request, response, contoh cURL)
    └── FRONTEND_INTEGRATION.md ← Panduan integrasi frontend (schema, service, hooks, UI)
```

---

## Daftar Modul

| Modul | ROADMAP | ENDPOINT | Frontend Guide | Status Test |
|---|---|---|---|---|
| [auth](./auth/ROADMAP.md) | [✅](./auth/ROADMAP.md) | [✅](./auth/ENDPOINT.md) | [✅](./auth/FRONTEND_INTEGRATION.md) | ✅ Ada |
| [product](./product/ROADMAP.md) | [✅](./product/ROADMAP.md) | [✅](./product/ENDPOINT.md) | [✅](./product/FRONTEND_INTEGRATION.md) | ✅ Ada |
| rawmat | - | - | - | ✅ Ada |
| warehouse | - | - | - | ✅ Ada |
| outlet | - | - | - | ✅ Ada |
| sales | - | - | - | ✅ Ada |
| purchase | - | - | - | - |
| bom | - | - | - | ✅ Ada |
| forecast | - | - | - | ✅ Ada |
| recipe | - | - | - | ✅ Ada |
| stock-movement | - | - | - | ✅ Ada |
| stock-transfer | - | - | - | ✅ Ada |

> Modul yang belum memiliki docs per-modul masih terdokumentasi di [`../ENDPOINT.md`](../ENDPOINT.md) dan [`../ROADMAP.md`](../ROADMAP.md) (format lama, consolidated).

---

## Konvensi Penulisan

- **ROADMAP.md** — Fokus pada *mengapa* dan *bagaimana* logika bisnis bekerja. Sertakan flow diagram (ASCII/Mermaid), business rules, dan known issues.
- **ENDPOINT.md** — Fokus pada *apa* yang dikirim dan diterima. Sertakan tabel request/response, status code, dan contoh cURL.
- **FRONTEND_INTEGRATION.md** — Fokus pada *cara pakai* dari sisi frontend. Sertakan code snippet siap pakai (schema, service, hooks, UI).
