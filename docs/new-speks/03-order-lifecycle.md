# Order Lifecycle

## Purpose

Define the state machine for an order after creation. Covers courier assignment, pickup, delivery
progression, completion, cancellation, and all side-effects: history records, payment creation,
realtime updates, and external source callbacks.

## Scope

- Open-order feed for couriers (filterable list).
- Order detail retrieval.
- All status transitions via a single PATCH endpoint.
- Concurrency protection during courier assignment.
- External callbacks on key transitions.
- `DeliveryHistory` and `CourierPayments` creation at completion.
- Realtime updates for operators and couriers on every transition.

## Out of Scope

- Order creation (see `02-order-ingestion.md`).
- Payout reconciliation (see `06-payout-reconciliation.md`).

## Actors

- Courier App
- Backend API
- Operator / Manager / Owner (via dashboard)
- External source callback endpoint

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `Order` | `owner_id`-scoped | Carries `status`, `courier_id`, transition timestamps |
| `Courier` | `owner_id`-scoped | Carries `status` (`available` / `busy`) |
| `DeliveryHistory` | `owner_id`-scoped | Created atomically at `complete` |
| `CourierPayments` | `owner_id`-scoped | Created atomically at `complete`; status = `unpaid` |
| `ActionHistory` | `owner_id`-scoped | Audit entry per every transition |

All entities carry `owner_id` enforced at the service layer.

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/orders` | JWT | List orders with filters and pagination |
| GET | `/api/v1/orders/{id}` | JWT | Get single order detail |
| PATCH | `/api/v1/orders/{id}/status` | JWT | Perform a status transition |

### GET `/api/v1/orders` — Query Parameters

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | string | — | Filter by order status |
| `courier_id` | uuid | — | Filter by assigned courier |
| `date_from` | ISO8601 date | — | Inclusive |
| `date_to` | ISO8601 date | — | Inclusive |
| `limit` | integer | `20` | Max 100 |
| `offset` | integer | `0` | |

Couriers see only orders scoped to their `owner_id`. When `status=onstock` and caller is a Courier,
only unassigned orders are returned.

### PATCH `/api/v1/orders/{id}/status` — Request Body

```json
{
  "action": "take | pick_up | deliver | complete | cancel",
  "reason": "string — optional, stored in ActionHistory (relevant for cancel)"
}
```

### PATCH Response

`200 OK` — returns the updated order object with new `status` and transition timestamps.
Repeating the same action when the order is already in the resulting state MUST return `200` (idempotent — no duplicate side-effects).

## State Machine

```
onstock ──take──▶ assigned ──pick_up──▶ picked_up ──deliver──▶ in_delivery ──complete──▶ completed
   │                 │                      │                       │
   └──cancel──▶      └───────cancel──────────┴───────cancel─────────┘
               cancelled (terminal)
```

| From status | Allowed actions | To status |
|-------------|-----------------|-----------|
| `onstock` | `take`, `cancel` | `assigned`, `cancelled` |
| `assigned` | `pick_up`, `cancel` | `picked_up`, `cancelled` |
| `picked_up` | `deliver`, `cancel` | `in_delivery`, `cancelled` |
| `in_delivery` | `complete`, `cancel` | `completed`, `cancelled` |
| `completed` | — | terminal |
| `cancelled` | — | terminal |

Any action not listed for the current status MUST return `422`.

## Business Rules

### Multi-Tenancy
- All queries and mutations MUST be scoped by `owner_id` from the caller's JWT.
- An order not belonging to the caller's `owner_id` MUST return `404` (not `403`).

### `take` — Courier Assignment
- Only `Courier` role MAY perform `take`.
- The courier MUST have an open shift (`courier.status = 'available'`). Attempting without returns `403`.
- **Concurrency**: the system MUST acquire a PostgreSQL advisory lock (`pg_advisory_xact_lock`) on the
  order row before reading and updating status. If the order is already `assigned` (another courier won
  the race), the system MUST return `409`.
- On success (in one transaction):
  - Set `order.courier_id`, `order.status = 'assigned'`, `order.assigned_at = now`.
  - Set `courier.status = 'busy'`.
  - Create `ActionHistory` entry.

### `pick_up`
- Only the assigned courier (`order.courier_id == caller.courier_id`) MAY perform `pick_up`.
- Set `order.status = 'picked_up'`, `order.picked_up_at = now`.
- If `order.source_url` is set: enqueue BullMQ callback job.
- Create `ActionHistory` entry.

### `deliver`
- Only the assigned courier MAY perform `deliver`.
- Set `order.status = 'in_delivery'`, `order.delivery_started_at = now`.
- Create `ActionHistory` entry.

### `complete`
- Only the assigned courier MAY perform `complete`.
- In a **single database transaction**:
  1. Set `order.status = 'completed'`, `order.completed_at = now`.
  2. Create `DeliveryHistory` record linked to order + courier.
  3. Create `CourierPayments` record: `amount = order.courier_award`, `status = 'unpaid'`.
  4. Set `courier.status = 'available'`.
  5. Create `ActionHistory` entry.
- If `order.source_url` is set: enqueue BullMQ callback job after transaction commits.
- If the transaction fails, the entire operation is rolled back — no partial records.

### `cancel`
- Allowed roles: `Operator`, `Manager`, `Owner`, `Administrator`.
- Courier role MUST NOT cancel orders — returns `403`.
- On success (in one transaction):
  - Set `order.status = 'cancelled'`, `order.cancelled_at = now`.
  - If order was `assigned`, `picked_up`, or `in_delivery`: set `courier.status = 'available'`.
  - No `CourierPayments` record is created.
  - Create `ActionHistory` entry (include `reason` if provided).
- If `order.source_url` is set: enqueue BullMQ callback job.

### Action History
Every transition MUST create an `ActionHistory` row:
`order_id`, `user_id`, `action`, `from_status`, `to_status`, `reason (nullable)`, `created_at`.

### Idempotency
Sending the same `action` when the order is already in the target state MUST return `200` with the
current order state. No duplicate `ActionHistory`, `DeliveryHistory`, or `CourierPayments` records are created.

## External Callbacks

Callbacks are sent at: `pick_up`, `complete`, `cancel`.

```json
{
  "order_number": "string",
  "status":       "picked_up | completed | cancelled",
  "timestamp":    "ISO8601"
}
```

Delivery: async via BullMQ, MUST NOT block the HTTP response.
- 3 attempts, exponential backoff: 1 s → 5 s → 30 s.
- Timeout per attempt: 10 seconds.
- After 3 failures: move to dead-letter queue and trigger alert.
- Callback failure MUST NOT change or roll back the order's persisted status.

## Realtime Events

Emitted after each successful transition to:
- Room `owner:{owner_id}:operators`
- Room `courier:{courier_id}` (when a courier is assigned)

```json
{
  "event": "order.status_changed",
  "payload": {
    "order_id":     "uuid",
    "status":       "string",
    "courier_id":   "uuid | null",
    "assigned_at":  "ISO8601 | null",
    "completed_at": "ISO8601 | null",
    "cancelled_at": "ISO8601 | null",
    "timestamp":    "ISO8601"
  }
}
```

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `400` | Missing `action` field |
| `401` | Missing or invalid JWT |
| `403` | Role not permitted for this action; courier has no open shift |
| `404` | Order not found within `owner_id` |
| `409` | Concurrency conflict — order already taken by another courier |
| `422` | Invalid transition for current status |

## Dependencies

- JWT auth + role guards (NestJS)
- PostgreSQL advisory locks (`pg_advisory_xact_lock`)
- BullMQ (external callbacks, async fan-out)
- Socket.IO + Redis adapter (realtime)
- FCM service (push to courier on assignment)

## Acceptance Criteria

1. A courier with an open shift takes an `onstock` order → moves to `assigned`, disappears from open feed.
2. Two couriers taking the same order simultaneously: exactly one receives `200`, the other `409`.
3. A courier without an open shift attempting `take` receives `403`.
4. Completing an order atomically creates `DeliveryHistory` + `CourierPayments` (`status=unpaid`).
5. Cancelling an `assigned` order frees the courier; no `CourierPayments` is created.
6. Every transition emits `order.status_changed` to the operator Socket.IO room.
7. Orders with `source_url` receive async callbacks at `pick_up`, `complete`, and `cancel`.
8. Repeating an already-applied action returns `200` without duplicate side-effects.
9. A Courier attempting to cancel an order receives `403`.
10. An order belonging to a different tenant returns `404` regardless of caller role.
