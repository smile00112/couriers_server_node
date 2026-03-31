# Research: Payout Reconciliation

**Branch**: `008-payout-reconciliation` | **Date**: 2026-03-30

## Decision Log

---

### 1. Module placement

**Decision**: New `PayoutsModule` at `src/payouts/` — standalone sibling to `OrdersModule`, `CouriersModule`.

**Rationale**: Payout reconciliation is a distinct bounded context that reads from `CourierEarning` (owned by `OrdersModule`) but introduces new domain entities (`PayoutPeriod`, `Payout`). Placing it in a separate module keeps `OrdersModule` from growing further and allows clean import of `CourierEarning` entity without coupling service logic.

**Alternatives considered**:
- Extending `OrdersModule` — rejected because it would inflate an already large module and mix financial reconciliation logic with order ingestion/lifecycle.
- Extending `CouriersModule` — rejected because payout periods are a staff concern, not courier operational state.

---

### 2. PayoutPeriod entity design

**Decision**: `PayoutPeriod` has `start_date DATE`, `end_date DATE`, `status ENUM('open','closed')`, `owner_id UUID`, `created_by UUID` (staff user who created it), `created_at`, `updated_at`.

**Rationale**: Date columns (not timestamp) suit a reconciliation window — operators think in days, not times. Status enum prevents accidental reopening via DB-level constraint. `created_by` allows audit trail without a full audit log.

**Alternatives considered**:
- Using `TIMESTAMPTZ` for start/end — rejected because the spec explicitly describes date ranges, not time ranges. Period semantics are day-boundary.
- Omitting `created_by` — rejected because financial records benefit from basic audit metadata.

---

### 3. Payout entity design

**Decision**: `Payout` has `id UUID PK`, `owner_id UUID`, `payout_period_id UUID FK`, `courier_id UUID FK`, `amount DECIMAL(10,2)`, `reference_note TEXT NULL`, `paid_at TIMESTAMPTZ DEFAULT NOW()`, `created_at TIMESTAMPTZ`. Unique constraint on `(payout_period_id, courier_id)` enforces idempotency.

**Rationale**: Unique constraint is the simplest and most reliable way to prevent double-payment — it delegates the conflict check to the database, avoiding race conditions between concurrent requests. `paid_at` is set at creation and cannot be updated (no `updated_at` column on `Payout` signals immutability).

**Alternatives considered**:
- Application-level duplicate check + optimistic lock — rejected because a unique index is simpler and race-condition-safe.
- Soft-delete / `is_active` flag for immutability — rejected because Principle VII (no speculative complexity) and the spec says records are immutable once created.

---

### 4. Earnings summary query pattern

**Decision**: Aggregate `courier_earnings` with `GROUP BY courier_id` where `earned_at >= period.start_date AND earned_at < period.end_date + 1 day` (date arithmetic). Returns `courier_id`, `COUNT(*)` as `delivery_count`, `SUM(amount)` as `total_amount`. Join with `couriers` table for names.

**Rationale**: Pure SQL aggregation is the correct tool — no need for application-level summation. The `< end_date + 1 day` boundary correctly includes all earnings on the end date regardless of time-of-day.

**Alternatives considered**:
- Loading all earnings then summing in JS — rejected as it would not scale and violates SC-001 (under 3 seconds for large date ranges).
- Storing pre-aggregated totals — rejected as YAGNI (Principle VII); PostgreSQL GROUP BY with an indexed `earned_at` column is fast enough.

---

### 5. Immutability enforcement for Payout

**Decision**: No `UPDATE` or `DELETE` operations are implemented on `Payout`. No service method exposes mutation. No `updated_at` column exists on the `payouts` table.

**Rationale**: The spec (FR-013) and constitution's wallet transaction principle both require immutability. Not implementing mutation methods is simpler and more reliable than adding update-prevention guards.

**Alternatives considered**:
- Row-level security in PostgreSQL — rejected as overkill for this stage; the application layer is sufficient.
- Adding `deleted_at` soft-delete — rejected because the spec says no deletion.

---

### 6. Courier self-service endpoints location

**Decision**: Courier earnings and payout history endpoints live in `PayoutsController` under `/couriers/me/earnings` and `/couriers/me/payouts` — not in `CouriersModule`.

**Rationale**: Keeps all payout-domain logic in one module. The path `/couriers/me/...` is clear to API consumers and consistent with existing `/couriers/shift/...` courier-facing paths.

**Alternatives considered**:
- Adding to `CouriersModule` — rejected to avoid cross-module service injection and keep the courier module focused on courier profile/tracking/shifts.

---

### 7. No Socket.IO events for payout actions

**Decision**: Staff payout actions (create period, close period, mark paid) do NOT emit Socket.IO events.

**Rationale**: Payout operations are async staff back-office workflows — no courier or operator UI needs real-time push for this. Constitution Principle II applies to entity state changes affecting mobile couriers or operators in real time; reconciliation is a batch/review operation. An optional future enhancement (push notification when marked paid) is explicitly out of scope in the spec's Assumptions.

**Alternatives considered**:
- Emitting a `payout:marked_paid` event to the courier's room — deferred to a future push notification feature.

---

### 8. Pagination pattern

**Decision**: Reuse the existing pagination pattern — query params `page` (default 1), `limit` (default 20, max 100); response wrapper `{ data: [...], meta: { total, page, limit, total_pages } }`.

**Rationale**: Consistent with `PaginatedShiftsDto` pattern already established in `ShiftManagementService`.

---

### 9. API versioning

**Decision**: No global prefix added to these endpoints, consistent with all existing controllers.

**Rationale**: The existing codebase has no `app.setGlobalPrefix()` call and all existing endpoints are unversioned (e.g., `/couriers/shift/open`). Adding versioning to only new endpoints would create inconsistency. Versioning is a future cross-cutting concern.

**Alternatives considered**:
- Adding `/api/v1/` prefix — deferred pending a codebase-wide versioning decision.
