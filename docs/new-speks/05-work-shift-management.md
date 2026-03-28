# Work Shift Management

## Purpose

Define the courier availability lifecycle driven by opening and closing work shifts. Shift state is
the gate for courier eligibility to receive and take orders, and the source of availability data
shown on operator dashboards.

## Scope

- Opening a courier shift.
- Closing a courier shift.
- Reading the current-day shift state.
- Atomic `courier.status` update on shift open/close.
- Realtime availability broadcast to operator dashboards.

## Out of Scope

- Order assignment eligibility check itself (see `03-order-lifecycle.md` — `take` action).
- Shift analytics, duration reports, or overtime calculation.
- Force-closing a courier's shift by an operator (future feature).

## Actors

- Courier App
- Backend API
- Operator dashboard (Socket.IO consumer)

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `Courier` | `owner_id`-scoped | Carries `status`: `available` / `unavailable` — the live availability flag |
| `CourierWorkingShift` | `owner_id`-scoped | Event log: one row per open or close action (type: `open` / `close`) |

**Single source of truth**: `courier.status` is the authoritative availability flag used by all
order-assignment checks. `CourierWorkingShift` is an append-only event log for history and reporting.
Both are updated atomically in the same database transaction.

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/courier/shifts` | JWT (Courier) | Open a shift |
| POST | `/api/v1/courier/shifts/close` | JWT (Courier) | Close the current shift |
| GET | `/api/v1/courier/shifts/current` | JWT (Courier) | Get current-day shift state |

> `DELETE /api/courier/work_shift` is replaced by `POST /api/v1/courier/shifts/close` — an explicit
> action endpoint is clearer and avoids idempotency ambiguity of DELETE semantics.

### POST `/api/v1/courier/shifts` — Request Body

No body required. The courier identity and `owner_id` are derived from the JWT.

### POST `/api/v1/courier/shifts/close` — Request Body

No body required.

### GET `/api/v1/courier/shifts/current` — Response

```json
{
  "is_open":    "boolean",
  "opened_at":  "ISO8601 | null",
  "closed_at":  "ISO8601 | null",
  "date":       "YYYY-MM-DD (in owner timezone)"
}
```

## Business Rules

### Timezone Handling
- All timestamps are stored as UTC in the database.
- "Current day" for shift queries is derived from the `owner.timezone` setting (IANA timezone string,
  e.g., `"Asia/Almaty"`). If the owner has no timezone configured, UTC is used as default.
- The `date` field in the response is returned in the owner's timezone.

### Opening a Shift
- If the courier already has an open shift for the current day (no `close` row after the last `open`),
  the system MUST return `409` — duplicate open is not allowed.
- In a single transaction:
  1. Insert a `CourierWorkingShift` row with `type = 'open'`, `created_at = now (UTC)`.
  2. Set `courier.status = 'available'`.
- Returns `201 Created` with the new shift record.

### Closing a Shift
- If no open shift exists for the current day, the system MUST return `409`.
- In a single transaction:
  1. Insert a `CourierWorkingShift` row with `type = 'close'`, `created_at = now (UTC)`.
  2. Set `courier.status = 'unavailable'`.
- Returns `200 OK`.

### Concurrent Open/Close
- Concurrent open and close requests from the same courier (e.g., network retries) MUST be handled
  safely via a database-level uniqueness check or advisory lock. The second duplicate request MUST
  return `409` without creating a duplicate row.

### Order Eligibility
- The `take` action in the order lifecycle checks `courier.status = 'available'` before assigning an
  order. A courier who has not opened a shift (`status = 'unavailable'`) MUST NOT be able to take orders.
- This check is the responsibility of the order-lifecycle service, not the shift service itself.

### Realtime Broadcast
- After each open or close, the system MUST emit `courier.availability_changed` to the
  operator-facing Socket.IO room for the tenant.
- Broadcast is async (post-transaction); failure MUST NOT fail the HTTP response.

## Realtime Event

Room: `owner:{owner_id}:operators`

```json
{
  "event": "courier.availability_changed",
  "payload": {
    "courier_id": "uuid",
    "status":     "available | unavailable",
    "timestamp":  "ISO8601"
  }
}
```

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `401` | Missing or invalid JWT |
| `409` | Open: shift already open for current day. Close: no open shift to close. |

## Dependencies

- JWT auth + Courier role guard (NestJS)
- `owner.timezone` setting (IANA string)
- Socket.IO + Redis adapter (realtime broadcast)
- PostgreSQL transaction (atomic shift row + courier status update)

## Acceptance Criteria

1. Opening a shift creates a `CourierWorkingShift` row (`type=open`) and sets `courier.status = 'available'` atomically.
2. Closing a shift creates a `CourierWorkingShift` row (`type=close`) and sets `courier.status = 'unavailable'` atomically.
3. Opening a shift when one is already open returns `409`.
4. Closing a shift when none is open returns `409`.
5. `GET /api/v1/courier/shifts/current` returns `is_open: true` after open, `false` after close.
6. Operators receive `courier.availability_changed` after every open or close.
7. A courier with `status = 'unavailable'` is rejected with `403` when attempting `take` on an order.
8. Two concurrent open requests result in exactly one success and one `409`.
