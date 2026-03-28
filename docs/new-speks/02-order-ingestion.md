# Order Ingestion

## Purpose

Define how new delivery orders enter the system — created by an Operator via the dashboard or
pushed from an external source. Covers order aggregate creation, client resolution, initial award
assignment, and async notification fan-out.

## Scope

- Order creation through a single canonical REST endpoint.
- Client resolution (find or create) within the tenant.
- `OrderProduct` persistence.
- Initial `ActionHistory` entry.
- Async realtime and push notification fan-out to operators and online couriers.
- External callback eligibility preservation via `source_url`.

## Out of Scope

- Order status transitions after creation (see `03-order-lifecycle.md`).
- Award payment reconciliation and payout (see `06-payout-reconciliation.md`).

## Actors

- Operator App (dashboard) / Manager / Owner
- External order source (third-party system via API key or JWT)
- Backend API
- Courier App (notification target)

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `Order` | `owner_id`-scoped | Central aggregate; initial status = `onstock` |
| `Client` | `owner_id`-scoped | End customer; resolved by phone within `owner_id` |
| `OrderProduct` | belongs to `Order` | Line items |
| `ActionHistory` | `owner_id`-scoped | Audit log entry per meaningful operation |

All entities carry `owner_id` derived from the authenticated user's JWT claim. The `owner_id` MUST
NOT be accepted from the request body.

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/orders` | JWT (Operator, Manager, Owner) | Create a new order |

### Request Body

```json
{
  "order_number":  "string   — required, unique per owner_id",
  "address_from":  "string   — required",
  "address_to":    "string   — required",
  "lat_from":      "decimal  — required, range -90..90",
  "lng_from":      "decimal  — required, range -180..180",
  "lat_to":        "decimal  — required, range -90..90",
  "lng_to":        "decimal  — required, range -180..180",
  "client_phone":  "string   — required, E.164 format",
  "client_name":   "string   — optional",
  "products": [
    { "name": "string — required", "qty": "integer ≥1 — required", "price": "DECIMAL(12,2) ≥0 — required" }
  ],
  "source_url":    "string   — optional, valid URL",
  "comment":       "string   — optional"
}
```

### Response

`201 Created` — returns the created order object with `id`, `status: "onstock"`, and `courier_award`.

## Business Rules

### Authorization
- `owner_id` is taken exclusively from the authenticated user's JWT claim.
- Only roles `Operator`, `Manager`, `Owner`, `Administrator` MAY create orders.
- Courier role MUST return `403`.

### Order Number Uniqueness
- `order_number` MUST be unique per `owner_id`.
- A duplicate `order_number` for the same `owner_id` MUST return `409` with the existing order's `id`.

### Client Resolution
- The system MUST look up a `Client` by `client_phone` within the same `owner_id`.
- If none exists, a new `Client` record MUST be created.
- Client creation and order creation MUST be in a single database transaction.

### Order + Products Atomicity
- `Order` and all `OrderProduct` rows MUST be persisted in a single database transaction.
- If any product row fails validation, the entire request MUST be rejected `400`; no partial records are created.

### Initial Award Assignment
- The system MUST assign `courier_award` to the order based on the tenant's configured award formula.
- If no formula is configured for the tenant, `courier_award = 0`.
- The award formula is resolved at the service layer using `owner_id` settings; it is not accepted from the request body.

### Action History
- The system MUST create one `ActionHistory` entry (`action = 'order_created'`) linked to the order
  and the creating user, with `created_at` timestamp.

### Notification Fan-Out (Async)
- After the transaction commits, the system MUST enqueue a BullMQ job to:
  1. Broadcast `order.created` event to the operator-facing Socket.IO room.
  2. Send FCM push notifications to online couriers belonging to the same `owner_id`.
- Fan-out failure MUST NOT fail the HTTP response. Retry: 3 attempts with exponential backoff.

### External Callback
- If `source_url` is present, it MUST be stored on the order record.
- The system MUST NOT call `source_url` at ingestion time — callbacks happen during lifecycle transitions.
- `source_url` MUST be a valid URL format; invalid values MUST be rejected with `400`.

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `400` | Missing required field; invalid coordinate range; invalid `source_url`; invalid product data |
| `401` | Missing or invalid JWT |
| `403` | Role not permitted to create orders (e.g., Courier) |
| `409` | Duplicate `order_number` for this `owner_id` |
| `422` | Business rule violation (e.g., empty products array) |

Error envelope:
```json
{ "statusCode": 409, "error": "Conflict", "message": "Order number already exists", "existing_id": "uuid" }
```

## Realtime Event

Room: `owner:{owner_id}:operators`

```json
{
  "event": "order.created",
  "payload": {
    "order_id":      "uuid",
    "order_number":  "string",
    "status":        "onstock",
    "address_to":    "string",
    "courier_award": "decimal",
    "timestamp":     "ISO8601"
  }
}
```

## Dependencies

- JWT authentication guard + role guard (NestJS)
- E.164 phone normalization (shared with auth module)
- Award calculation service (formula configured per `owner_id`)
- BullMQ (async fan-out job queue)
- Socket.IO + Redis adapter (realtime broadcast)
- FCM service (push notifications)

## Acceptance Criteria

1. A valid request atomically creates `Client` (if new) + `Order` + `OrderProducts` and returns `201`.
2. A duplicate `order_number` returns `409` without creating a second order.
3. Invalid product data causes the full request to be rejected; no order is created.
4. The created order is broadcast to operator Socket.IO listeners asynchronously.
5. Online couriers in the same tenant receive FCM push notifications.
6. An order with `source_url` stores it and remains eligible for callbacks on lifecycle transitions.
7. A Courier JWT attempting to create an order receives `403`.
8. `owner_id` from a different tenant in the JWT cannot see or create orders for another tenant.
