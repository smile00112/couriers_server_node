# Research: Courier Tracking

**Feature**: `004-courier-tracking`
**Date**: 2026-03-29

---

## Decision 1: Current Position Storage Strategy

**Decision**: Separate `courier_positions` table with one row per courier (UPSERT on each accepted update).

**Rationale**: Keeping current position separate from the `couriers` table maintains single responsibility and avoids bloating a frequently-joined entity. A dedicated table makes index design clean (`courier_id UNIQUE`) and allows the UPSERT to be a targeted single-row write.

**Alternatives considered**:
- Adding `last_lat`, `last_lng`, `last_seen_at` columns directly to `couriers` table — rejected because it mixes courier identity data with operational telemetry and complicates queries on the couriers table.
- Redis-only storage for current position — rejected because it bypasses the PostgreSQL audit trail and loses data on Redis restart; Redis is used only for the Socket.IO adapter and BullMQ queues.

---

## Decision 2: Movement History Storage

**Decision**: Append-only `courier_location_history` table. Each accepted location update inserts one row with: `courier_id`, `owner_id`, `order_id` (nullable), `lat`, `lng`, `distance_meters`, `recorded_at`.

**Rationale**: Append-only design satisfies FR-003, FR-004, FR-011, FR-012. The `order_id` FK allows efficient `WHERE order_id = :id ORDER BY recorded_at ASC` queries for route history. A partial index on `order_id WHERE order_id IS NOT NULL` keeps non-delivery rows out of delivery queries.

**Alternatives considered**:
- Storing history in a time-series DB — rejected as speculative infrastructure complexity with no current volume justification.
- Storing history inside the `orders` table as a JSONB column — rejected because it prevents efficient ordering and violates single-entity responsibility.

---

## Decision 3: Rate Limiting Per Courier

**Decision**: Use the existing `@nestjs/throttler` with a Redis store at the controller level, keyed by authenticated `userId` (not IP). Limit: 1 request per 5 seconds per courier (`LOCATION_THROTTLE_TTL=5000ms, LOCATION_THROTTLE_LIMIT=1`). Configuration via environment variables (`LOCATION_THROTTLE_TTL`, `LOCATION_THROTTLE_LIMIT`).

**Rationale**: Courier apps typically send GPS updates every 5–10 seconds. A 5-second minimum interval (1 update per 5s) prevents app bugs or aggressive polling from flooding the DB. Keying by `userId` (not IP) ensures proper per-courier isolation even when all couriers share a NAT gateway. Reuses existing `@nestjs/throttler` infrastructure from feature 001.

**Alternatives considered**:
- Redis `INCR` + `EXPIRE` manual rate limit — rejected because `@nestjs/throttler` already does this correctly.
- Fixed window per IP — rejected because couriers behind NAT would share a quota.

---

## Decision 4: Active Order Detection for Link

**Decision**: "Active order" for linking means `status IN ('assigned', 'picked_up', 'in_delivery') AND courier_id = :courierId AND owner_id = :ownerId`. Query runs once per location update inside the service (no caching). If multiple rows somehow match (data inconsistency), take the most recently `assigned_at` one.

**Rationale**: Matches the spec assumption exactly. The query is a fast indexed lookup (index `idx_orders_courier_id` added in feature 003 migration 013). Acceptable cost per location update at 1 update/5s.

**Alternatives considered**:
- Caching the active order ID in Redis per courier — rejected as premature optimization. At 1 update/5s, the DB query adds ~1ms, well within the 1-second SC-005 budget.

---

## Decision 5: Distance Calculation

**Decision**: Haversine formula implemented inline in TypeScript (no external library). Returns meters. Stored as `DECIMAL(10,2)` in `courier_location_history.distance_meters`.

**Rationale**: Haversine is ~10 lines of code, well-understood, and accurate enough for delivery-route distances (error < 0.5% at urban scales). No additional dependency justified.

**Alternatives considered**:
- Vincenty formula — more accurate but adds complexity; unnecessary for urban courier tracking.
- `geolib` npm package — adds a dependency for a trivial formula; rejected per Constitution Principle VII.
- PostGIS extension — adds infrastructure complexity; not warranted at current scale.

---

## Decision 6: Real-Time Dispatch

**Decision**: Emit `courier:location_updated` event to `tenant:{ownerId}:staff` room via the existing `OrdersGateway` (new method `emitLocationUpdated`). This reuses the established Socket.IO infrastructure from feature 002.

**Rationale**: A separate gateway for courier tracking would duplicate the JWT auth handshake and Redis adapter setup. The existing `OrdersGateway` already handles the staff room correctly. Adding a method is sufficient; no new gateway class needed.

**Payload**: `{ courierId, lat, lng, recordedAt, orderId (nullable), ownerId }`

**Alternatives considered**:
- A separate `CourierGateway` class — rejected because it duplicates connection management and room joining logic. Per Constitution Principle VII (no speculative complexity), the single-gateway approach is correct until scale requires separation.

---

## Decision 7: External Location Callback

**Decision**: New BullMQ queue `location-callback` with 3 retries + exponential backoff. Job payload: `{ courierId, orderId, callbackUrl, lat, lng, timestamp, ownerId }`. HTTP POST to `order.callback_url`. Enqueued only when the courier has an active order with a non-null `callback_url`.

**Rationale**: Separating from the existing `order-callback` queue avoids mixing order-event semantics with location-event semantics. The callback payload is different (`{ courier_id, lat, lng, timestamp }` vs `{ order_id, status, timestamp }`). The queue remains idempotent per Constitution Principle V.

**Alternatives considered**:
- Reusing `order-callback` queue — rejected because the job type and payload differ, making the processor harder to maintain.
- Sending the callback inline (synchronously) — rejected because it violates SC-005 (app must receive response within 1s regardless of callback outcome).

---

## Decision 8: 90-Day Retention

**Decision**: A `created_at` index on `courier_location_history` supports future cleanup. For v1, no automatic deletion job is implemented — this is documented as a follow-up (feature 006 or DB-level policy). The `recorded_at` column doubles as the natural retention timestamp.

**Rationale**: Implementing a cron job now is premature; no volume data exists yet. The index structure supports adding it later. FR-011 says "retained for at least 90 days" — at v1 scale, data will not expire within the first release window, so this is acceptable.

**Alternatives considered**:
- PostgreSQL `pg_partman` table partitioning by month — excessive complexity for v1.
- BullMQ scheduled job — adds a cron-style dependency; deferred.

---

## Decision 9: Coordinate Precision

**Decision**: Store `lat` and `lng` as `DECIMAL(10,7)` — same precision as the `orders` table (7 decimal places ≈ 1.1cm resolution at the equator). Input validation: `lat` in `[-90, 90]`, `lng` in `[-180, 180]`.

**Rationale**: Consistent precision across the schema. 7 decimal places exceeds GPS hardware precision (6 decimal places ≈ 11cm), so no useful information is lost by rounding.

**Alternatives considered**:
- `FLOAT8` (double precision) — adds floating-point rounding noise in arithmetic; DECIMAL is cleaner for display and comparison.
- `DECIMAL(9,6)` — lower precision; no reason to lose the extra digit already established in the schema.
