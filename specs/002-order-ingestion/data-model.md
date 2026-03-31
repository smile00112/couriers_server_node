# Data Model: Order Ingestion

**Feature**: `002-order-ingestion` | **Date**: 2026-03-29

---

## New Tables

### `clients`

End recipients identified by phone number within a tenant. Created automatically on first order if no record exists.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `owner_id` | UUID | NO | — | FK → `owners.id`; tenant scope |
| `phone` | VARCHAR(30) | NO | — | E.164 format, e.g., `+79001234567` |
| `name` | VARCHAR(255) | YES | NULL | Optional display name; may be populated by future features |
| `created_at` | TIMESTAMP | NO | now() | |
| `updated_at` | TIMESTAMP | NO | now() | |

**Indexes**:
- `(owner_id, phone)` — UNIQUE; primary lookup and duplicate-prevention constraint

**State rules**:
- Find-or-create: on order ingestion, INSERT with `ON CONFLICT` catch (PG `23505`), then SELECT.
- A client record belongs to exactly one tenant; the same real-world phone number can exist in multiple tenants as separate records.

---

### `orders`

The central domain entity. One record per delivery order.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `owner_id` | UUID | NO | — | FK → `owners.id`; tenant scope (from JWT, never from payload) |
| `client_id` | UUID | NO | — | FK → `clients.id` |
| `order_number` | VARCHAR(100) | NO | — | Tenant-provided identifier; unique within tenant |
| `status` | VARCHAR(50) | NO | `'created'` | Initial value; lifecycle in feature 003 |
| `pickup_address` | TEXT | NO | — | Human-readable pickup address |
| `pickup_lat` | DECIMAL(10,7) | NO | — | Pickup latitude |
| `pickup_lng` | DECIMAL(10,7) | NO | — | Pickup longitude |
| `dropoff_address` | TEXT | NO | — | Human-readable dropoff address |
| `dropoff_lat` | DECIMAL(10,7) | NO | — | Dropoff latitude |
| `dropoff_lng` | DECIMAL(10,7) | NO | — | Dropoff longitude |
| `delivery_fee` | DECIMAL(10,2) | NO | — | Courier award; snapshotted from `owners.default_delivery_fee` at creation |
| `callback_url` | TEXT | YES | NULL | External system callback; stored without validation |
| `created_by_id` | UUID | NO | — | ID of the user who created the order (from JWT `sub`); no FK (user tables may vary by role) |
| `created_by_role` | VARCHAR(50) | NO | — | Role of the creator (e.g., `operator`, `manager`, `owner`) |
| `created_at` | TIMESTAMP | NO | now() | |
| `updated_at` | TIMESTAMP | NO | now() | |

**Indexes**:
- `(owner_id, order_number)` — UNIQUE; enforces FR-004; handles concurrent duplicate detection atomically
- `(owner_id, status)` — used for the active orders list query
- `(owner_id, created_at DESC)` — used for the orders list sorted by recency
- `(client_id)` — FK lookup

**Constraints**:
- `owner_id` is always sourced from the authenticated user's JWT; it MUST NOT be accepted from the request payload (FR-012).
- `delivery_fee` is snapshotted at creation; subsequent changes to `owners.default_delivery_fee` do not affect existing orders.
- `callback_url` is stored as-is; reachability is not validated at ingestion (spec edge case).

**State rules**:
- Initial status: `created` (constitution Principle I first state).
- Status transitions are managed exclusively by the order-lifecycle service (feature 003); no code in this feature modifies status after creation.

---

### `order_items`

Line items belonging to an order. At least one required per order (FR-011).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `order_id` | UUID | NO | — | FK → `orders.id` ON DELETE CASCADE |
| `owner_id` | UUID | NO | — | FK → `owners.id`; denormalized for tenant-scoped queries |
| `name` | VARCHAR(255) | NO | — | Item name |
| `quantity` | INTEGER | NO | `1` | Must be ≥ 1 |
| `price` | DECIMAL(10,2) | NO | — | Informational; does not trigger payment processing |
| `created_at` | TIMESTAMP | NO | now() | |
| `updated_at` | TIMESTAMP | NO | now() | |

**Indexes**:
- `(order_id)` — lookup all items for an order

**Constraints**:
- `quantity` ≥ 1 enforced at the application layer (class-validator) and the DB level (CHECK constraint).
- `price` ≥ 0 enforced at the application layer.

---

### `order_audit_entries`

Immutable audit log of order events. One record per state-changing action.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `order_id` | UUID | NO | — | FK → `orders.id` ON DELETE CASCADE |
| `owner_id` | UUID | NO | — | FK → `owners.id`; denormalized for tenant queries |
| `action` | VARCHAR(50) | NO | — | Event type, e.g., `created` |
| `actor_id` | UUID | NO | — | ID of the user who triggered the action; no FK (polymorphic — may be courier, operator, or system) |
| `actor_role` | VARCHAR(50) | NO | — | Role of the actor at the time of the action |
| `metadata` | JSONB | YES | NULL | Optional context (e.g., external system identifier) |
| `created_at` | TIMESTAMP | NO | now() | Immutable; no `updated_at` |

**Indexes**:
- `(order_id, created_at)` — chronological audit trail for an order
- `(owner_id, created_at DESC)` — tenant-scoped audit queries

**State rules**:
- Records are insert-only; no UPDATE or DELETE is permitted.
- One `created` entry is written per order, atomically within the order creation transaction.

---

## Modified Tables

### `owners` (additive column)

Adds tenant-level delivery fee configuration required by FR-006.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `default_delivery_fee` | DECIMAL(10,2) | NO | `0.00` | Default courier award applied to all new orders |

**Notes**:
- Default of `0.00` allows the system to function before an owner configures their fee.
- This value is snapshotted onto `orders.delivery_fee` at creation time.

---

### `couriers` (additive column)

Adds FCM device token for push notification delivery (FR-008).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `fcm_token` | VARCHAR(255) | YES | NULL | Firebase Cloud Messaging device token; nullable — couriers without a token receive Socket.IO notification only |

**Notes**:
- A courier with `fcm_token IS NULL` can still receive real-time notifications via Socket.IO when online.
- Token is registered/updated by the courier mobile app after login; the endpoint for this is out of scope for feature 002 but the column is added now to support the notification job.

---

## Entities Not Modified

- `courier_auth_codes`, `courier_refresh_tokens` — not touched.

---

## State Transitions

### Order Status Lifecycle

This feature introduces the `created` state only. Full transitions are implemented in feature 003.

```
  [order ingested]
       │
       ▼
    created   ← this feature stops here
       │
       │  (feature 003: assign courier)
       ▼
   assigned → picked_up → in_delivery → completed
                                      → cancelled
```

---

## Migration Order

1. `007_add_owner_default_delivery_fee.ts` — `ALTER TABLE owners ADD COLUMN default_delivery_fee`
2. `008_add_courier_fcm_token.ts` — `ALTER TABLE couriers ADD COLUMN fcm_token`
3. `009_create_clients.ts` — new table; depends on `owners.id` existing
4. `010_create_orders.ts` — new table; depends on `clients.id` and `owners.id`
5. `011_create_order_items.ts` — new table; depends on `orders.id`
6. `012_create_order_audit_entries.ts` — new table; depends on `orders.id`

---

## Client Find-or-Create Sequence

```
  POST /api/v1/orders
       │
       ▼
  BEGIN TRANSACTION
       │
       ├─► Try INSERT INTO clients (owner_id, phone)
       │       │
       │       ├── Success → use new client.id
       │       └── 23505 (unique violation) → SELECT client WHERE owner_id + phone
       │
       ├─► INSERT INTO orders (..., client_id, delivery_fee = owner.default_delivery_fee)
       │       │
       │       └── 23505 on order_number → ROLLBACK → 409 Conflict
       │
       ├─► INSERT INTO order_items (one per item in request)
       │
       ├─► INSERT INTO order_audit_entries (action='created')
       │
       └─► COMMIT
              │
              ├─► emit Socket.IO `order:created` to `tenant:{ownerId}:staff`
              └─► enqueue BullMQ job `new-order-notify` { orderId, ownerId }
```
