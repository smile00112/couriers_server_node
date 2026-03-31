# API Contracts: Payout Reconciliation

**Branch**: `008-payout-reconciliation` | **Date**: 2026-03-30

All endpoints require `Authorization: Bearer <JWT>`. All responses use `Content-Type: application/json`.
Multi-tenant scope is derived from the authenticated user's JWT `ownerId` claim.

---

## Staff Endpoints

Roles: `owner`, `manager`, `order_operator`

---

### POST /payout-periods

Create a new payout period.

**Request body**:
```json
{
  "start_date": "2026-03-01",   // ISO date string (YYYY-MM-DD)
  "end_date":   "2026-03-31"    // ISO date string (YYYY-MM-DD), must be >= start_date
}
```

**Response 201**:
```json
{
  "id":         "uuid",
  "owner_id":   "uuid",
  "start_date": "2026-03-01",
  "end_date":   "2026-03-31",
  "status":     "open",
  "created_by": "uuid",
  "created_at": "2026-03-30T10:00:00.000Z",
  "updated_at": "2026-03-30T10:00:00.000Z"
}
```

**Error responses**:
- `400 Bad Request` — `end_date` before `start_date`, invalid date format
- `401 Unauthorized` — missing/invalid JWT
- `403 Forbidden` — wrong role

---

### GET /payout-periods

List all payout periods for the tenant.

**Query params**:
- `page` (integer, default 1)
- `limit` (integer, default 20, max 100)
- `status` (string, optional) — `open` or `closed`

**Response 200**:
```json
{
  "data": [
    {
      "id":         "uuid",
      "owner_id":   "uuid",
      "start_date": "2026-03-01",
      "end_date":   "2026-03-31",
      "status":     "open",
      "created_by": "uuid",
      "created_at": "2026-03-30T10:00:00.000Z",
      "updated_at": "2026-03-30T10:00:00.000Z"
    }
  ],
  "meta": {
    "total":       1,
    "page":        1,
    "limit":       20,
    "total_pages": 1
  }
}
```

**Error responses**:
- `401 Unauthorized`
- `403 Forbidden`

---

### POST /payout-periods/:id/close

Close an open payout period. Idempotent: closing an already-closed period returns 409.

**Path params**: `id` — UUID of the payout period

**Request body**: none

**Response 200**:
```json
{
  "id":         "uuid",
  "owner_id":   "uuid",
  "start_date": "2026-03-01",
  "end_date":   "2026-03-31",
  "status":     "closed",
  "created_by": "uuid",
  "created_at": "2026-03-30T10:00:00.000Z",
  "updated_at": "2026-03-30T11:00:00.000Z"
}
```

**Error responses**:
- `404 Not Found` — period not found or belongs to different tenant
- `409 Conflict` — period is already closed
- `401 Unauthorized`
- `403 Forbidden`

---

### GET /payout-periods/:id/summary

Get per-courier earnings summary for a payout period (aggregated from courier_earnings).

**Path params**: `id` — UUID of the payout period

**Response 200**:
```json
{
  "period": {
    "id":         "uuid",
    "start_date": "2026-03-01",
    "end_date":   "2026-03-31",
    "status":     "closed"
  },
  "couriers": [
    {
      "courier_id":      "uuid",
      "courier_name":    "John Smith",
      "delivery_count":  14,
      "total_amount":    "420.00",
      "is_paid":         false
    }
  ]
}
```

Notes:
- `couriers` is sorted by `total_amount DESC`
- Couriers with zero earnings in the period are not listed
- `is_paid` is `true` if a `Payout` record exists for this courier in this period

**Error responses**:
- `404 Not Found` — period not found or belongs to different tenant
- `401 Unauthorized`
- `403 Forbidden`

---

### GET /payout-periods/:id/pending

List couriers with unpaid earnings in a closed payout period.

**Path params**: `id` — UUID of the payout period

**Response 200**:
```json
{
  "period_id": "uuid",
  "couriers": [
    {
      "courier_id":     "uuid",
      "courier_name":   "John Smith",
      "delivery_count": 14,
      "total_amount":   "420.00"
    }
  ]
}
```

Notes:
- Only couriers with earnings in the period who have NOT been marked as paid are listed
- Returns empty `couriers` array if all couriers are paid

**Error responses**:
- `404 Not Found` — period not found or belongs to different tenant
- `409 Conflict` — period is still open (must be closed first)
- `401 Unauthorized`
- `403 Forbidden`

---

### POST /payout-periods/:id/payouts

Mark a courier as paid within a closed payout period.

**Path params**: `id` — UUID of the payout period

**Request body**:
```json
{
  "courier_id":     "uuid",               // required
  "amount":         420.00,               // required, positive decimal
  "reference_note": "TRF-2026-03-001"    // optional string
}
```

**Response 201**:
```json
{
  "id":               "uuid",
  "owner_id":         "uuid",
  "payout_period_id": "uuid",
  "courier_id":       "uuid",
  "amount":           "420.00",
  "reference_note":   "TRF-2026-03-001",
  "paid_at":          "2026-03-30T12:00:00.000Z",
  "created_at":       "2026-03-30T12:00:00.000Z"
}
```

**Error responses**:
- `400 Bad Request` — invalid body (missing fields, non-positive amount)
- `404 Not Found` — period or courier not found in tenant
- `409 Conflict` — courier already marked as paid in this period; or period is not closed
- `422 Unprocessable Entity` — period is still open (period must be closed before recording payouts)
- `401 Unauthorized`
- `403 Forbidden`

---

## Courier Endpoints

Role: `courier`

---

### GET /couriers/me/earnings

Get own paginated earnings history.

**Query params**:
- `page` (integer, default 1)
- `limit` (integer, default 20, max 100)
- `from` (ISO date string, optional) — filter earnings from this date (inclusive)
- `to` (ISO date string, optional) — filter earnings to this date (inclusive)

**Response 200**:
```json
{
  "data": [
    {
      "id":        "uuid",
      "order_id":  "uuid",
      "amount":    "30.00",
      "earned_at": "2026-03-15T14:30:00.000Z"
    }
  ],
  "meta": {
    "total":       45,
    "page":        1,
    "limit":       20,
    "total_pages": 3
  }
}
```

Notes:
- Ordered `earned_at DESC` (newest first)

**Error responses**:
- `401 Unauthorized`
- `403 Forbidden`

---

### GET /couriers/me/payouts

Get own payout history (records of when staff marked this courier as paid).

**Query params**:
- `page` (integer, default 1)
- `limit` (integer, default 20, max 100)

**Response 200**:
```json
{
  "data": [
    {
      "id":               "uuid",
      "payout_period_id": "uuid",
      "period_start_date": "2026-03-01",
      "period_end_date":   "2026-03-31",
      "amount":            "420.00",
      "reference_note":    "TRF-2026-03-001",
      "paid_at":           "2026-03-30T12:00:00.000Z"
    }
  ],
  "meta": {
    "total":       3,
    "page":        1,
    "limit":       20,
    "total_pages": 1
  }
}
```

Notes:
- Ordered `paid_at DESC` (newest first)
- Includes period date range joined from `payout_periods`

**Error responses**:
- `401 Unauthorized`
- `403 Forbidden`
