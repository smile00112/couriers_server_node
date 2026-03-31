# Research: Order Ingestion

**Feature**: `002-order-ingestion` | **Date**: 2026-03-29

---

## Decision 1: Order Status Naming — Initial State

**Question**: What is the initial order status, and how does it map to the constitution lifecycle?

**Decision**: Initial status is `created`. The constitution (Principle I) defines the authoritative lifecycle as `created → assigned → picked_up → in_delivery → completed | cancelled`. The spec phrase "available for pickup" describes the human-readable meaning of the `created` state: the order exists and is waiting for courier assignment. No separate `available` status is introduced.

**Rationale**:
- The constitution lifecycle is the authoritative state machine; deviating creates divergence between the constitution and the DB/service logic.
- `created` accurately represents the state: the order record exists, no courier has accepted it yet.
- Downstream features (003-order-lifecycle) extend this state machine starting from `created`; a non-standard initial status would require retrofitting.

**Alternatives considered**:
- Separate `available` status: rejected — not in the constitution lifecycle; creates ambiguity between `created` and `available`.
- `pending` status: rejected — not in the constitution; same problem.

---

## Decision 2: Client Find-or-Create with Concurrent Safety

**Question**: How to resolve the find-or-create for `Client` by `(owner_id, phone)` without creating duplicates under concurrent requests?

**Decision**: Use a UNIQUE constraint on `(owner_id, phone)` in the `clients` table. Within the order creation transaction, attempt an INSERT; catch the unique constraint violation (TypeORM `QueryFailedError` with PG code `23505`) and fall back to a SELECT. Both the INSERT and the fallback SELECT happen inside the same database transaction as the order creation.

**Rationale**:
- The DB UNIQUE constraint is the only reliable guard against concurrent duplicates — an application-level SELECT-then-INSERT window is vulnerable to race conditions.
- Catching `23505` and falling back to SELECT is the standard PostgreSQL find-or-create pattern; it is safe under READ COMMITTED isolation.
- No serializable transaction is required: the worst case with `23505` catch is one extra SELECT round-trip per race condition, which is rare in practice.

**Alternatives considered**:
- `INSERT ... ON CONFLICT DO NOTHING` + separate SELECT: equivalent semantics but requires raw query; the try/catch approach is more maintainable with TypeORM.
- Application-level SELECT-then-INSERT without DB constraint: rejected — not safe under concurrent load.
- Upsert via TypeORM `save()`: rejected — `save()` with no `id` always inserts; does not handle the find side.

---

## Decision 3: Tenant Pricing Config for Delivery Fee

**Question**: Where is the initial delivery fee (courier award) configured per tenant, and how does order ingestion apply it?

**Decision**: Add a `default_delivery_fee` DECIMAL(10,2) column to the `owners` table. At order creation time, the service reads `owner.default_delivery_fee` and stores it as `order.delivery_fee`. This satisfies FR-006 with the minimum required complexity.

**Rationale**:
- The spec assumption states: "this feature stores and applies the result but does not define the formula itself." A single flat fee per tenant is the simplest representation of "configured pricing" that satisfies this.
- A separate `owner_pricing_rules` table with formula logic is speculative complexity (Principle VII) — no spec indicates multiple pricing tiers or dynamic formulas exist for this feature.
- The fee is snapshotted onto the order at creation time so that later changes to the owner's default fee do not retroactively alter existing orders.

**Alternatives considered**:
- Separate `owner_pricing_settings` table: rejected — premature abstraction for a single value (Principle VII).
- Caller-provided delivery fee in request body: rejected — contradicts FR-012 (tenant context from JWT, not payload) and FR-006 (system assigns fee, not caller).
- Distance-based formula: rejected — out of scope for ingestion; no formula is specified.

---

## Decision 4: Available Courier Targeting for Notifications

**Question**: What does "available courier" mean for notification purposes, given that work-shift management (feature 005) is not yet implemented?

**Decision**: In feature 002, target all couriers in the tenant who have a non-null `fcm_token`. The "has open work shift" filter is added in feature 005. A new `fcm_token` column is added to the `couriers` table to support push delivery.

**Rationale**:
- The spec assumption states: "An 'available courier' for notification purposes means a courier who is logged in and has an open work shift in the same tenant."
- Work shifts are not implemented in feature 002. Blocking courier notification on an unimplemented prerequisite would leave FR-008 and SC-003 unsatisfiable.
- Sending to all couriers in the tenant (who have FCM tokens) is the safe fallback: couriers without an active shift will receive the push but the assignment logic (feature 003) enforces the shift constraint before assignment.
- The `new-order-notify` BullMQ job is designed for easy extension: adding a `WHERE shift IS NOT NULL AND shift.is_open = true` filter in feature 005 requires no structural change.

**Alternatives considered**:
- Block notifications until feature 005 ships: rejected — FR-008 and SC-003 require notifications in this feature.
- Target only Socket.IO-connected couriers: rejected — FCM push ensures delivery even when the app is backgrounded; Socket.IO is an enhancement, not the primary delivery path.

---

## Decision 5: Socket.IO Room Strategy for Operator Real-Time Updates

**Question**: How to broadcast the `order:created` event to all operators/managers of a specific tenant?

**Decision**: Use the Socket.IO room name `tenant:{ownerId}:staff`. After a successful order creation, emit `order:created` to this room via the NestJS WebSocket gateway. Couriers join `tenant:{ownerId}:couriers` room on connection; staff (operators, managers, owners) join `tenant:{ownerId}:staff`. Room assignment is based on the role in the JWT, performed in the gateway `handleConnection` hook.

**Rationale**:
- Redis adapter (already required by constitution Principle II) propagates room emissions across pods.
- A single `staff` room for all non-courier roles (Operator, Manager, Owner) avoids over-engineering. If per-role granularity is needed in a future feature, room names can be extended without breaking existing subscribers.
- Emitting directly from the service (not via a BullMQ job) ensures the operator update arrives within the 3-second SC-004 target — no queue lag introduced.

**Alternatives considered**:
- Per-role rooms (`tenant:{ownerId}:operators`, `:managers`): rejected — speculative complexity (Principle VII); no requirement distinguishes between roles for this event.
- Polling from the frontend: rejected — constitution Principle II mandates real-time; polling is explicitly excluded by SC-004 ("without a page refresh").
- BullMQ for operator updates: rejected — queue adds latency; SC-004 requires <3s; in-process Socket.IO emit is faster and sufficient.

---

## Decision 6: Duplicate Order Number Handling

**Question**: How to guarantee uniqueness of `order_number` within a tenant under concurrent submissions?

**Decision**: UNIQUE DB constraint on `(owner_id, order_number)`. The service catches `QueryFailedError` with PG code `23505` on the orders INSERT and returns `409 Conflict` with a message identifying the duplicate.

**Rationale**:
- DB constraint is the only race-condition-safe mechanism; any application-level check has a TOCTOU window.
- Catching the DB error and mapping it to a `409 Conflict` with a clear message satisfies FR-004 and acceptance scenario 5 (US-1).
- No additional code is needed beyond the constraint + exception mapping.

**Alternatives considered**:
- Application-level uniqueness check before INSERT: rejected — race condition window between check and INSERT.
- Soft duplicate check (log only): rejected — FR-004 is a hard requirement.

---

## Decision 7: Notification Delivery — FCM vs Socket.IO Responsibility Split

**Question**: Should the `new-order-notify` BullMQ job handle both FCM push and Socket.IO events, or should they be split?

**Decision**: The BullMQ job handles FCM push notifications only. Socket.IO `order:created` event is emitted in-process immediately after the transaction commits (not via BullMQ). This split keeps latency for the operator update minimal while using BullMQ for the slower, retriable FCM path.

**Rationale**:
- SC-003 (courier FCM notification ≤3s) and SC-004 (operator Socket.IO update ≤3s) have the same target, but FCM involves an external API call that can fail or be slow. BullMQ handles retries and dead-letter for FCM; in-process Socket.IO has no external dependency.
- Emitting Socket.IO from a BullMQ job would introduce queue lag and coupling to BullMQ for an operation that should be near-instant.
- FCM failure (Principle V) MUST NOT block the primary operation; it is already isolated in the BullMQ processor.

**Alternatives considered**:
- Single BullMQ job for both FCM and Socket.IO: rejected — adds queue lag to Socket.IO delivery; violates SC-004 reliability.
- Synchronous FCM in the order creation transaction: rejected — external API in transaction extends lock duration, risks timeouts.

---

## Summary Table

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Initial order status | `created` | Constitution lifecycle is authoritative |
| Client find-or-create | UNIQUE constraint + 23505 catch | Race-safe; no serializable transaction needed |
| Delivery fee config | `owners.default_delivery_fee` column | Minimum complexity for single-value tenant config (Principle VII) |
| Available courier filter | All couriers with FCM token (shift filter added in feature 005) | Work shifts not yet implemented |
| Socket.IO room | `tenant:{ownerId}:staff` | Flat room hierarchy; Redis adapter handles multi-pod |
| Order number uniqueness | DB UNIQUE constraint + 409 on violation | Only race-safe option |
| FCM vs Socket.IO split | FCM via BullMQ, Socket.IO in-process | Minimize Socket.IO latency; FCM needs retry capability |
