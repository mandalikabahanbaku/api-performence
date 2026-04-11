# Goods Receipt (GR) Integration Guide - Inventory V2

This document provides the necessary information for the frontend to integrate with the new Goods Receipt (GR) backend module.

## Endpoints

Base URL: `/api/app/inventory-v2/gr`

### 1. List Goods Receipts
- **Method:** `GET`
- **URL:** `/`
- **Query Parameters:**
  - `page` (optional): Page number (default: 1)
  - `take` (optional): Items per page (default: 10)
  - `search` (optional): Search by GR Number or Notes
  - `warehouse_id` (optional): Filter by warehouse
  - `status` (optional): Filter by status (`PENDING`, `COMPLETED`, `CANCELLED`)
- **Response:**
  ```json
  {
    "data": [
      {
        "id": 1,
        "gr_number": "GR-202603-001",
        "date": "2026-03-31T00:00:00.000Z",
        "status": "PENDING",
        "type": "MANUAL",
        "warehouse_id": 1,
        "warehouse": { "name": "Gudang Utama" },
        "_count": { "items": 5 }
      }
    ],
    "len": 1
  }
  ```

### 2. Get GR Detail
- **Method:** `GET`
- **URL:** `/:id`
- **Response:** Detailed GR object including `items` and related `product` data.

### 3. Create Goods Receipt
- **Method:** `POST`
- **URL:** `/`
- **Body:**
  ```json
  {
    "type": "MANUAL", // or "QC_FG"
    "warehouse_id": 1,
    "date": "2026-03-31", // optional, defaults to now
    "notes": "Produksi Manual",
    "items": [
      {
        "product_id": 10,
        "quantity_planned": 100, // what was expected
        "quantity_actual": 100,  // what was actually received
        "notes": "Grade A"
      }
    ]
  }
  ```

### 4. Post/Finalize Goods Receipt
- **Method:** `POST`
- **URL:** `/:id/post`
- **Description:** Moves status from `PENDING` to `COMPLETED`. This action:
  1. Updates the `ProductInventory` for the specific warehouse.
  2. Automatically creates a `StockMovement` entry (Type: `IN`, Reference: `GOODS_RECEIPT`).
- **Response:** The updated GR object.

## Enums & Constants

### GoodsReceiptStatus
- `PENDING`: Initial state, editable.
- `COMPLETED`: Stock has been added, non-editable.
- `CANCELLED`: Document voided.

### GoodsReceiptType
- `MANUAL`: Manual input from inventory staff.
- `QC_FG`: Coming from Quality Control production.

---

## Example Flow for Frontend

1. **User opens "Add GR"**: Frontend fetches warehouses and products.
2. **User submits form**: `POST /gr` creates a `PENDING` document.
3. **User reviews list**: Shows `PENDING` status with "Post" button.
4. **User clicks "Post"**: `POST /gr/:id/post` is called. UI refreshes, and stock is now updated in the system.
