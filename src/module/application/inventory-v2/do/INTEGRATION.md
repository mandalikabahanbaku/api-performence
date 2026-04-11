# Delivery Order (DO) Integration Guide - Inventory V2

This document provides the necessary information for the frontend to integrate with the new Delivery Order (DO) backend module.

## Endpoints

Base URL: `/api/app/inventory-v2/do`

### 1. List Delivery Orders
- **Method:** `GET`
- **URL:** `/`
- **Query Parameters:**
  - `page` (optional): Page number (default: 1)
  - `take` (optional): Items per page (default: 10)
  - `search` (optional): Search by DO Number or Barcode
  - `status` (optional): Filter by TransferStatus
  - `from_warehouse_id` (optional): Filter by source warehouse
  - `to_outlet_id` (optional): Filter by target outlet
- **Response:**
  ```json
  {
    "data": [
      {
        "id": 1,
        "transfer_number": "DO-202603-0001",
        "barcode": "DOBC12345",
        "status": "SHIPMENT",
        "from_warehouse_id": 1,
        "to_outlet_id": 5,
        "from_warehouse": { "name": "Main Warehouse" },
        "to_outlet": { "name": "Outlet A" },
        "items": [...]
      }
    ],
    "len": 1
  }
  ```

### 2. Get DO Detail
- **Method:** `GET`
- **URL:** `/:id`
- **Response:** Detailed DO object including `items`, `product`, and `photos`.

### 3. Create Delivery Order
- **Method:** `POST`
- **URL:** `/`
- **Body:**
  ```json
  {
    "barcode": "DOBC123456",
    "from_warehouse_id": 1,
    "to_outlet_id": 5,
    "notes": "Sending to Outlet A",
    "items": [
      {
        "product_id": 10,
        "quantity_requested": 50,
        "notes": "Urgent"
      }
    ]
  }
  ```

### 4. Update DO Status
- **Method:** `PATCH`
- **URL:** `/:id/status`
- **Body:**
  ```json
  {
    "status": "SHIPMENT", // or APPROVED, RECEIVED, FULFILLMENT, CANCELLED
    "notes": "On the way",
    "items": [ // Required for FULFILLMENT stage to confirm actual quantities
      {
        "id": 101,
        "quantity_fulfilled": 48,
        "quantity_missing": 2
      }
    ]
  }
  ```

---

## Workflow & Inventory Impact

1. **PENDING**: Initial state. No stock changes.
2. **APPROVED**: Managerial approval. No stock changes.
3. **SHIPMENT**: Goods are leaving the warehouse.
   - **TRIM**: Stock is **deducted** from the source `WAREHOUSE`.
4. **RECEIVED**: Goods arrived at the outlet but not yet put into system stock.
5. **FULFILLMENT**: Final verification of goods.
   - **ADD**: Stock is **added** to the destination `OUTLET`.
   - The document status moves to `COMPLETED`, `PARTIAL`, `MISSING`, or `REJECTED` automatically.

---

## Export Features

### 1. Export List
- **Method:** `GET`
- **URL:** `/export`
- **Description:** Generates an XLSX file of the filtered DO list. Use query parameters for filtering.

### 2. Export Detail
- **Method:** `GET`
- **URL:** `/:id/export`
- **Description:** Generates a professional document-style XLSX report for a single DO.
