# Data Model: Work Shift Management

**Feature**: `007-work-shift-management`
**Date**: 2026-03-29

---

## Schema Changes Summary

| Change | Type | Migration |
|--------|------|-----------|
| Create `courier_shifts` table | CREATE TABLE | 018 |

---

## New Table: `courier_shifts`

Stores one row per courier work session. Append-only (new row per shift open); closed by updating `status` and `ended_at`.

```sql
CREATE TABLE courier_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id),
  courier_id  UUID NOT NULL REFERENCES couriers(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'open',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open shift per courier maximum (DB-enforced)
CREATE UNIQUE INDEX idx_courier_shifts_one_open
  ON courier_shifts(courier_id)
  WHERE status = 'open';

-- Tenant-scoped queries and reporting
CREATE INDEX idx_courier_shifts_owner ON courier_shifts(owner_id, started_at DESC);

-- Courier history / current shift lookup
CREATE INDEX idx_courier_shifts_courier ON courier_shifts(courier_id, started_at DESC);
```

### Fields

| Field | Description |
|-------|-------------|
| `owner_id` | Tenant scoping (denormalized for fast tenant queries) |
| `courier_id` | The courier this shift belongs to |
| `status` | `'open'` while courier is on-duty; `'closed'` after shift ends |
| `started_at` | Server-side timestamp when shift was opened |
| `ended_at` | Server-side timestamp when shift was closed (NULL if still open) |

### Shift Lifecycle

```
open  ──→  closed
 ↑
INSERT (on open)
```

- **Open**: `INSERT INTO courier_shifts (owner_id, courier_id) VALUES (...)`
  - The partial unique index rejects a duplicate insert if an open shift exists.
- **Close**: `UPDATE courier_shifts SET status='closed', ended_at=NOW(), updated_at=NOW() WHERE id=:id AND courier_id=:courierId AND status='open'`

### Atomic Courier Status Update

Both open and close operations update `couriers.status` in the same transaction:

```sql
-- On open:
UPDATE couriers SET status = 'available', updated_at = NOW()
  WHERE id = :courierId AND owner_id = :ownerId;

-- On close:
UPDATE couriers SET status = 'unavailable', updated_at = NOW()
  WHERE id = :courierId AND owner_id = :ownerId;
```

---

## Modified Table: `couriers`

No structural changes. The existing `status` column (`available`/`unavailable`) is updated atomically by shift open/close.

---

## No Changes: `orders`

The shift gate is enforced in the service layer (`OrderLifecycleService.claim()`). No FK or new column on `orders` is needed.

---

## New Entity

### CourierShift

```typescript
// src/couriers/entities/courier-shift.entity.ts
@Entity('courier_shifts')
export class CourierShift {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) owner_id: string;
  @ManyToOne(() => Owner) @JoinColumn({ name: 'owner_id' }) owner: Owner;

  @Column({ type: 'uuid' }) courier_id: string;
  @ManyToOne(() => Courier) @JoinColumn({ name: 'courier_id' }) courier: Courier;

  @Column({ length: 20, default: 'open' }) status: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' }) started_at: Date;

  @Column({ type: 'timestamptz', nullable: true }) ended_at: Date | null;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
```

---

## Order Count Per Shift (Derived)

Computed at query time from `delivery_records`. No new column required.

```sql
SELECT COUNT(*)
FROM courier_earnings
WHERE courier_id = :courierId
  AND earned_at >= :started_at
  AND earned_at <= COALESCE(:ended_at, NOW())
```

Uses the existing `idx_courier_earnings_courier` index on `courier_earnings(courier_id, earned_at DESC)`.

---

## Entity Relationships

```
Owner ──1:N──→ CourierShift
Courier ──1:N──→ CourierShift (at most one with status='open')
```

---

## Migration Sequence

| # | File | Change |
|---|------|--------|
| 018 | `018_create_courier_shifts.ts` | Create courier_shifts table + 3 indexes |
