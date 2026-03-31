# Data Model: Courier Tracking

**Feature**: `004-courier-tracking`
**Date**: 2026-03-29

---

## Schema Changes Summary

| Change | Type | Migration |
|--------|------|-----------|
| Create `courier_positions` table | CREATE TABLE | 016 |
| Create `courier_location_history` table | CREATE TABLE | 017 |

---

## New Table: `courier_positions`

Stores the **current known position** of each courier. One row per courier, UPSERT on each accepted update.

```sql
CREATE TABLE courier_positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id),
  courier_id  UUID NOT NULL UNIQUE REFERENCES couriers(id),
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_positions_owner ON courier_positions(owner_id);
```

### Fields

| Field | Description |
|-------|-------------|
| `courier_id` | UNIQUE — exactly one position per courier |
| `owner_id` | Tenant scoping (denormalized for fast tenant queries) |
| `lat` / `lng` | Current coordinates, DECIMAL(10,7) |
| `recorded_at` | Timestamp from the courier's last accepted location update |

### UPSERT Pattern

```sql
INSERT INTO courier_positions (owner_id, courier_id, lat, lng, recorded_at, updated_at)
VALUES (:ownerId, :courierId, :lat, :lng, :recordedAt, NOW())
ON CONFLICT (courier_id) DO UPDATE
  SET lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      recorded_at = EXCLUDED.recorded_at,
      updated_at = NOW();
```

---

## New Table: `courier_location_history`

**Append-only** history of every accepted location update. Supports route replay, distance reporting, and dispute resolution.

```sql
CREATE TABLE courier_location_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES owners(id),
  courier_id       UUID NOT NULL REFERENCES couriers(id),
  order_id         UUID NULL REFERENCES orders(id),
  lat              DECIMAL(10,7) NOT NULL,
  lng              DECIMAL(10,7) NOT NULL,
  distance_meters  DECIMAL(10,2) NOT NULL DEFAULT 0,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Route history query: WHERE order_id = :id ORDER BY recorded_at ASC
CREATE INDEX idx_location_history_order ON courier_location_history(order_id, recorded_at ASC)
  WHERE order_id IS NOT NULL;

-- Retention / courier history
CREATE INDEX idx_location_history_courier ON courier_location_history(courier_id, recorded_at DESC);

-- Tenant-scoped queries
CREATE INDEX idx_location_history_owner ON courier_location_history(owner_id, recorded_at DESC);
```

### Fields

| Field | Description |
|-------|-------------|
| `owner_id` | Tenant scoping |
| `courier_id` | The courier who sent the update |
| `order_id` | Active order at time of update (NULL if no active order) |
| `lat` / `lng` | Coordinates at this update, DECIMAL(10,7) |
| `distance_meters` | Haversine distance from previous update for this courier (0 for first update) |
| `recorded_at` | Server-side timestamp of receipt |

---

## New Entities

### CourierPosition

```typescript
// src/couriers/entities/courier-position.entity.ts
@Entity('courier_positions')
export class CourierPosition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) owner_id: string;
  @ManyToOne(() => Owner) @JoinColumn({ name: 'owner_id' }) owner: Owner;
  @Column({ type: 'uuid' }) courier_id: string;
  @ManyToOne(() => Courier) @JoinColumn({ name: 'courier_id' }) courier: Courier;
  @Column({ type: 'decimal', precision: 10, scale: 7 }) lat: number;
  @Column({ type: 'decimal', precision: 10, scale: 7 }) lng: number;
  @Column({ type: 'timestamptz' }) recorded_at: Date;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
```

### CourierLocationHistory

```typescript
// src/couriers/entities/courier-location-history.entity.ts
@Entity('courier_location_history')
export class CourierLocationHistory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) owner_id: string;
  @ManyToOne(() => Owner) @JoinColumn({ name: 'owner_id' }) owner: Owner;
  @Column({ type: 'uuid' }) courier_id: string;
  @ManyToOne(() => Courier) @JoinColumn({ name: 'courier_id' }) courier: Courier;
  @Column({ type: 'uuid', nullable: true }) order_id: string | null;
  @ManyToOne(() => Order, { nullable: true }) @JoinColumn({ name: 'order_id' }) order: Order | null;
  @Column({ type: 'decimal', precision: 10, scale: 7 }) lat: number;
  @Column({ type: 'decimal', precision: 10, scale: 7 }) lng: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) distance_meters: number;
  @CreateDateColumn() recorded_at: Date;
}
```

---

## Entity Relationships

```
Owner ──1:N──→ CourierPosition (one per courier)
Owner ──1:N──→ CourierLocationHistory
Courier ──1:1──→ CourierPosition
Courier ──1:N──→ CourierLocationHistory
Order ──1:N──→ CourierLocationHistory  (optional — only during active delivery)
```

---

## Haversine Distance Formula

Used in `CourierTrackingService` to compute `distance_meters` for each new history entry:

```typescript
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

---

## Migration Sequence

| # | File | Change |
|---|------|--------|
| 016 | `016_create_courier_positions.ts` | Create courier_positions table + index |
| 017 | `017_create_courier_location_history.ts` | Create courier_location_history table + indexes |
