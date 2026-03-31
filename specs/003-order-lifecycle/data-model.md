# Data Model: Order Lifecycle

**Feature**: `003-order-lifecycle`
**Date**: 2026-03-29

---

## Schema Changes Summary

| Change | Type | Migration |
|--------|------|-----------|
| Add `courier_id`, `assigned_at`, `completed_at`, `cancelled_at` to `orders` | ALTER TABLE | 013 |
| Create `delivery_records` table | CREATE TABLE | 014 |
| Create `courier_earnings` table | CREATE TABLE | 015 |

---

## Modified Table: `orders`

Adds courier assignment and key transition timestamps. All existing columns unchanged.

### New Columns

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `courier_id` | UUID FK → couriers | YES | NULL | Set on claim; cleared on cancel if not yet completed |
| `assigned_at` | TIMESTAMPTZ | YES | NULL | Set when status → assigned |
| `picked_up_at` | TIMESTAMPTZ | YES | NULL | Set when status → picked_up |
| `in_delivery_at` | TIMESTAMPTZ | YES | NULL | Set when status → in_delivery |
| `completed_at` | TIMESTAMPTZ | YES | NULL | Set when status → completed |
| `cancelled_at` | TIMESTAMPTZ | YES | NULL | Set when status → cancelled |

### Indexes (new)

```sql
CREATE INDEX idx_orders_courier_id ON orders(courier_id) WHERE courier_id IS NOT NULL;
CREATE INDEX idx_orders_owner_status ON orders(owner_id, status);  -- already exists from 010, keep
```

### State Machine

```
created ──claim──→ assigned ──pickup──→ picked_up ──start──→ in_delivery ──complete──→ completed
    └──────────────────────────────────cancel─────────────────────────────────┘
                                                                              (terminal)
                                                                    cancelled (terminal)
```

All terminals (`completed`, `cancelled`) are irreversible. The `order_audit_entries` table (from feature 002) captures every transition with actor, timestamp, and previous status.

---

## New Table: `delivery_records`

Created atomically with the `completed` status transition. One record per completed order.

```sql
CREATE TABLE delivery_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES owners(id),
  order_id     UUID NOT NULL UNIQUE REFERENCES orders(id),
  courier_id   UUID NOT NULL REFERENCES couriers(id),
  delivery_fee DECIMAL(10,2) NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_records_owner    ON delivery_records(owner_id, completed_at DESC);
CREATE INDEX idx_delivery_records_courier  ON delivery_records(courier_id, completed_at DESC);
```

### Fields

| Field | Description |
|-------|-------------|
| `owner_id` | Tenant scoping (denormalized for fast scoped queries) |
| `order_id` | UNIQUE — enforces one delivery record per order |
| `courier_id` | The courier who completed the delivery |
| `delivery_fee` | Snapshotted from order at completion time |
| `completed_at` | Timestamp of the `completed` transition |

---

## New Table: `courier_earnings`

Created atomically with `delivery_records` on order completion. One record per completed order. Forms the basis for the future Wallet/Payout feature.

```sql
CREATE TABLE courier_earnings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES owners(id),
  courier_id UUID NOT NULL REFERENCES couriers(id),
  order_id   UUID NOT NULL UNIQUE REFERENCES orders(id),
  amount     DECIMAL(10,2) NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_earnings_courier ON courier_earnings(courier_id, earned_at DESC);
CREATE INDEX idx_courier_earnings_owner   ON courier_earnings(owner_id, earned_at DESC);
```

### Fields

| Field | Description |
|-------|-------------|
| `owner_id` | Tenant scoping |
| `courier_id` | The earning courier |
| `order_id` | UNIQUE — no duplicate earnings per order |
| `amount` | = `order.delivery_fee` at completion time |
| `earned_at` | Timestamp of the `completed` transition |

---

## Updated Entities

### Order entity additions

```typescript
// src/orders/entities/order.entity.ts — new columns
@Column({ type: 'uuid', nullable: true }) courier_id: string | null;
@ManyToOne(() => Courier, { nullable: true }) @JoinColumn({ name: 'courier_id' }) courier: Courier | null;
@Column({ type: 'timestamptz', nullable: true }) assigned_at: Date | null;
@Column({ type: 'timestamptz', nullable: true }) picked_up_at: Date | null;
@Column({ type: 'timestamptz', nullable: true }) in_delivery_at: Date | null;
@Column({ type: 'timestamptz', nullable: true }) completed_at: Date | null;
@Column({ type: 'timestamptz', nullable: true }) cancelled_at: Date | null;
```

### New entities

- `src/orders/entities/delivery-record.entity.ts`
- `src/orders/entities/courier-earning.entity.ts`

---

## Entity Relationships

```
Owner ──1:N──→ Order ──1:1──→ DeliveryRecord
               Order ──1:1──→ CourierEarning
               Order ──N:1──→ Courier (via courier_id)
               Order ──1:N──→ OrderAuditEntry  (from feature 002)
               Order ──1:N──→ OrderItem        (from feature 002)
```

---

## Audit Log Usage

The existing `order_audit_entries` table (feature 002) records every status transition:

```
action    = 'status_changed'
metadata  = { from: 'created', to: 'assigned' }
actor_id  = <courier or operator uuid>
actor_role = 'courier' | 'order_operator' | ...
```

No schema changes to `order_audit_entries`.

---

## Migration Sequence

| # | File | Change |
|---|------|--------|
| 013 | `013_add_order_lifecycle_columns.ts` | Add courier_id, assigned_at … cancelled_at to orders; add courier_id index |
| 014 | `014_create_delivery_records.ts` | Create delivery_records table + indexes |
| 015 | `015_create_courier_earnings.ts` | Create courier_earnings table + indexes |
