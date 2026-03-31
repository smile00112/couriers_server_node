# Research: Work Shift Management

**Feature**: `007-work-shift-management`
**Date**: 2026-03-29

---

## §1 — Shift State Storage

**Decision**: Dedicated `courier_shifts` table with one row per shift session.

**Rationale**: Shifts are first-class historical records (payroll, dispute resolution). An embedded column on `couriers` (e.g., `shift_started_at`) would destroy history after each close. A dedicated table with `status` (open/closed) and `started_at / ended_at` timestamps cleanly models the lifecycle and supports pagination, date-range filtering, and per-shift analytics.

**Alternatives considered**:
- Embedded columns on `couriers` table: Loses history after close; cannot paginate past shifts.
- Event log (append-only open/close events): More complex to query "current state"; total overkill for this use case.

---

## §2 — Shift Uniqueness Constraint (Prevent Double-Open)

**Decision**: PostgreSQL partial unique index on `courier_shifts(courier_id) WHERE status = 'open'`.

**Rationale**: A partial unique index enforces the "at most one open shift per courier" invariant at the DB level with zero application code — the database rejects a second INSERT if an open shift already exists. This is the canonical PostgreSQL pattern for partial uniqueness and is cheaper than a SELECT-then-INSERT pattern that risks race conditions under concurrent requests.

**Alternatives considered**:
- Application-level SELECT + INSERT: Subject to TOCTOU race (two simultaneous open requests could both succeed). Requires explicit transaction isolation.
- Advisory lock: Heavier machinery than needed.

---

## §3 — Shift Gate Enforcement in Order Claim

**Decision**: Add a shift-open check to `OrderLifecycleService.claim()` before the atomic UPDATE. Check via `dataSource.getRepository(CourierShift).findOne({ where: { courier_id, owner_id, status: 'open' } })` — throw `UnprocessableEntityException` if null.

**Rationale**: `claim()` is the only existing path by which a courier acquires an order. Inserting the check here (before the atomic claim UPDATE) ensures the gate is enforced at the earliest possible point in the same request. Future operator-assignment endpoints will need to add the same check — this is documented as a cross-cutting concern.

**Alternatives considered**:
- Guard decorator on the controller: Would require loading the courier shift in a guard, coupling the guard to the DataSource — harder to test and violates the "service layer is authoritative" principle.
- DB-level foreign key check: Not feasible — there is no FK between `orders.courier_id` and `courier_shifts`.

---

## §4 — Atomic Courier Status Update

**Decision**: Shift open/close operations update `couriers.status` (`available`/`unavailable`) in the same database transaction as the `courier_shifts` INSERT or UPDATE, using `dataSource.transaction()`.

**Rationale**: `couriers.status` is the existing assignability field consumed by other parts of the system (available orders list). Keeping it in sync atomically prevents a window where the shift is "open" but the courier still appears unavailable (or vice versa). If the transaction rolls back, both the shift record and the status change are rolled back together.

**Alternatives considered**:
- Update courier status after the shift INSERT (two separate operations): Creates a short inconsistency window; if the second UPDATE fails, the shift is open but the courier appears unavailable.
- Remove `couriers.status` and rely solely on `courier_shifts`: Breaking change to existing code that reads `courier.status`; scope creep.

---

## §5 — Order Count Per Shift

**Decision**: Compute at query time from `courier_earnings` using a time-range join: `COUNT(*) FROM courier_earnings WHERE courier_id = :courierId AND earned_at BETWEEN :started_at AND COALESCE(:ended_at, NOW())`.

**Rationale**: `courier_earnings` (migration 015) records `courier_id` and `earned_at` (timestamp of order completion). A time-range overlap query is simple, requires no new FK column, and uses an existing index on `(courier_id, earned_at DESC)`. "Order count during shift" == "completed orders within shift window" which is what `courier_earnings` tracks. Note: `delivery_records` (migration 014) has a `completed_at` column, not `earned_at` — the correct table for this query is `courier_earnings`.

**Alternatives considered**:
- Add `shift_id` FK to `orders` or `delivery_records`: Adds coupling between the tracking and lifecycle domains; more migrations; schema change needed on existing tables. The time-range approach is equivalent for the reporting use case.
- Maintain a `completed_order_count` counter on `courier_shifts`: Requires increment on order completion (BullMQ job or hook); non-trivial to keep in sync if retries occur.

---

## §6 — Real-Time Socket.IO Events

**Decision**: Add `emitShiftOpened(ownerId, payload)` and `emitShiftClosed(ownerId, payload)` methods to the existing `OrdersGateway`. Emit to `tenant:{ownerId}:staff` room only. No new gateway class.

**Rationale**: Consistent with the established pattern from feature 004 (location tracking) where `emitLocationUpdated` was added to `OrdersGateway`. Couriers do not need to receive shift events for other couriers.

**Alternatives considered**:
- New `ShiftsGateway`: Extra class for two methods; violates Simplicity principle (§VII).

---

## §7 — Pagination for Shift History

**Decision**: Cursor-free offset pagination. Default 20 per page, max 100. Query params: `?page=1&limit=20&from=ISO_DATE&to=ISO_DATE`.

**Rationale**: Shift history is not a fire-hose feed; offset pagination is sufficient for dozens to hundreds of shifts. The `idx_courier_shifts_courier` index on `(courier_id, started_at DESC)` makes range queries efficient.

**Alternatives considered**:
- Cursor pagination: Unnecessary complexity for this volume; no infinite scroll use case identified.

---

## §8 — Migration Number

**Decision**: Migration `018_create_courier_shifts.ts`. Current highest migration is `017_create_courier_location_history`.

---

## §9 — Admin Panel Integration

**Decision**: Shift history displayed in the Courier detail drawer (right-side, 720px) as a sub-table/tab — no new page or route. New feature does NOT need a new sidebar item.

**Rationale**: Constitution Principle VIII: single-page UX. The Courier entity already has a detail drawer. Adding a "Shifts" tab there is the correct integration point. No new React route is needed.
