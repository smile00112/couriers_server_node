# Research: Order Lifecycle

**Feature**: `003-order-lifecycle`
**Date**: 2026-03-29
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## Decision 1: Claim Atomicity (FR-003 — exactly one winner)

**Decision**: Use a single targeted `UPDATE … WHERE status = 'created' AND courier_id IS NULL` and check `affectedRows`. No optimistic-lock version column needed.

**Rationale**: PostgreSQL's row-level lock during `UPDATE` is sufficient for the claim race. If two couriers hit the endpoint simultaneously, the DB serializes the writes; the second UPDATE finds `status ≠ 'created'` and affects 0 rows, which the service maps to `ConflictException(409)`. This is simpler than `SELECT FOR UPDATE SKIP LOCKED` (which is better suited to queue-style work) and avoids application-level locking.

**Alternatives considered**:
- `SELECT FOR UPDATE SKIP LOCKED` — overkill here; intended for queue consumption, not single-row claim.
- Optimistic locking (`@VersionColumn`) — adds a version column and requires retry logic in the caller; more complexity for the same outcome.

---

## Decision 2: Status Transition State Machine

**Decision**: Define a `COURIER_TRANSITIONS` map and an `OPERATOR_TRANSITIONS` map in `OrdersLifecycleService` (separate from the existing `OrdersService`). Enforce at service layer before any DB write.

```
COURIER_TRANSITIONS = {
  assigned   → picked_up,
  picked_up  → in_delivery,
  in_delivery → completed,
}

OPERATOR_TRANSITIONS = {
  created     → cancelled,
  assigned    → cancelled,
  picked_up   → cancelled,
  in_delivery → cancelled,
}
```

Backward transitions (e.g., `picked_up → assigned`) are always rejected with `422 Unprocessable Entity`.

**Rationale**: A map-based validator is the simplest approach with no external dependency. Having two separate maps reflects the different authority of couriers vs operators without overcomplicating the logic.

**Alternatives considered**:
- XState / state machine library — external dependency for a simple 5-state machine; not justified (Principle VII).
- Single unified transitions map — would allow operators to do courier transitions and vice versa; rejected for clarity and security.

---

## Decision 3: Work Shift Gate (FR-015) — Deferral

**Decision**: FR-015 (courier must have an open work shift to claim orders) is **deferred to feature 005 (Shift Management)**. In this feature, the shift check is a **no-op stub** — a `ShiftService.isShiftOpen(courierId)` method that always returns `true`. The method MUST be called from the claim endpoint so wiring is in place; the actual validation will be filled in by feature 005.

**Rationale**: Feature 005 owns the `shifts` table and the open/close logic. Building a stub now ensures the call site exists without creating a partial implementation that would need to be reconciled later.

---

## Decision 4: One Active Order Per Courier (FR-016)

**Decision**: Enforce in the service layer before writing: query `SELECT COUNT(*) FROM orders WHERE courier_id = $1 AND status NOT IN ('completed', 'cancelled') AND owner_id = $2`. If count > 0, reject with `409 Conflict` and message `"Courier already has an active order"`.

**Rationale**: A DB-level unique constraint on `(courier_id WHERE status ≠ terminal)` is a partial unique index — achievable in PostgreSQL but awkward with TypeORM migrations and hard to query for a meaningful error message. The service-level check is clearer and easier to maintain.

---

## Decision 5: Earnings and Delivery Record Creation

**Decision**: When an order transitions to `completed`:
1. Insert a `delivery_records` row (captures courier, order, delivery_fee, completed_at).
2. Insert a `courier_earnings` row (captures courier, owner, order, amount = `order.delivery_fee`).
Both inserts occur in the same DB transaction as the status update. No wallet/payout logic in this feature — earnings are read-only records that a future Wallet feature will aggregate.

**Rationale**: Constitution §Development Workflow: "Courier wallet operations MUST be wrapped in database transactions." Keeping earnings creation in the same transaction as order completion ensures consistency. Separating DeliveryRecord (operational history) from EarningsEntry (financial record) is intentional — they serve different downstream purposes.

---

## Decision 6: External Callback Delivery (FR-013, FR-014)

**Decision**: New BullMQ queue `order-callback`. Enqueued for status changes to `picked_up`, `completed`, `cancelled` — but only when `order.callback_url` is not null. Job data: `{ orderId, callbackUrl, eventStatus, ownerId }`. Retry: 5 attempts, exponential backoff (2000ms base). `removeOnFail: false` (dead-letter). Processor performs an HTTP POST with JSON payload `{ order_id, status, timestamp }`. Individual HTTP failures log and propagate (BullMQ handles retry). Callback failure MUST NOT affect the status write (fire-and-forget after enqueue).

**Rationale**: Decoupling callback delivery from the status transition via BullMQ satisfies FR-014 (failure must not block courier workflow). 5 retries with exponential backoff gives ~62 seconds of retry window before dead-letter — reasonable for partner API downtime.

**Alternatives considered**:
- Inline HTTP call — would block courier workflow if partner is slow/down; rejected per FR-014.
- Dedicated microservice — speculative complexity (Principle VII); rejected.

---

## Decision 7: Socket.IO Event Strategy for Lifecycle

**Decision**: Emit `order:status_changed` to `tenant:{ownerId}:staff` room on every status transition. Emit `order:cancelled` additionally to `tenant:{ownerId}:couriers` when the order had an assigned courier. Payload: `{ id, order_number, status, previous_status, courier_id, updated_at }`. Emits are called after the transaction commits (in-process, non-blocking try/catch).

**Rationale**: Consistent with the existing `order:created` / `order:new_available` pattern established in feature 002. A single `order:status_changed` event with `status` and `previous_status` fields is simpler to handle client-side than separate per-transition events.

---

## Decision 8: New Service — `OrderLifecycleService`

**Decision**: Implement `OrderLifecycleService` as a **separate NestJS service** within `OrdersModule`. The existing `OrdersService` handles creation and listing; `OrderLifecycleService` owns all state transitions (claim, pickup, start-delivery, complete, cancel).

**Rationale**: Aligns with Constitution Principle I: "No code MAY modify order status outside the designated order-lifecycle service." Keeping transitions in a dedicated service enforces this boundary. Splitting also avoids growing `OrdersService` into a god class.

---

## Decision 9: API Design for Status Transitions

**Decision**: Use POST action endpoints on the order resource:
- `POST /api/v1/orders/:id/claim` (Courier)
- `POST /api/v1/orders/:id/pickup` (Courier)
- `POST /api/v1/orders/:id/start-delivery` (Courier)
- `POST /api/v1/orders/:id/complete` (Courier)
- `POST /api/v1/orders/:id/cancel` (Owner/Manager/Operator)

No request body required except `cancel` which accepts optional `{ reason: string }`.

**Rationale**: Action endpoints are clearer than PATCH with a `status` field because they make the permitted transitions explicit at the API surface. Each action validates the current status before writing, so invalid transitions return a clear error without ambiguity about what PATCH was trying to do.

**Alternatives considered**:
- `PATCH /api/v1/orders/:id { status: "..." }` — allows any caller to set any status, pushing all validation into service; harder to apply role-based transition rules.
