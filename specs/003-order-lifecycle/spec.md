# Feature Specification: Order Lifecycle

**Feature Branch**: `003-order-lifecycle`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "order-lifecycle"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Courier Claims and Completes an Order (Priority: P1)

A courier opens the app, sees a list of available orders, takes one, picks it up from
the sender, delivers it to the recipient, and marks it as complete. After completion,
their earnings for the delivery are recorded automatically.

**Why this priority**: This is the core courier workflow — the full happy path from
order availability to completion. All other lifecycle stories are variations or extensions
of this flow. Without it, the platform delivers no value.

**Independent Test**: Can be fully tested by having a courier take an available order
and walk it through to completion. Confirms the full status progression and that earnings
are recorded. Independently demonstrable as the MVP.

**Acceptance Scenarios**:

1. **Given** an available order exists in the courier's tenant, **When** the courier views
   the orders list, **Then** they see the order with pickup address and delivery fee.
2. **Given** a courier views an available order, **When** they claim it, **Then** the order
   is assigned exclusively to that courier and disappears from the open orders list for others.
3. **Given** a courier has claimed an order, **When** they confirm they have collected the
   package from the sender, **Then** the order status updates to "picked up."
4. **Given** a courier has picked up the package, **When** they start heading to the recipient,
   **Then** the order status updates to "in delivery."
5. **Given** a courier is in delivery, **When** they mark the order as delivered, **Then** the
   order is completed, a delivery record is created, and the courier's earnings for the order
   are recorded.
6. **Given** an order is completed, **When** operators or managers view the order, **Then**
   they see the full status history and the assigned courier.

---

### User Story 2 — Two Couriers Try to Claim the Same Order (Priority: P1)

Two couriers simultaneously attempt to claim the same available order. Exactly one succeeds
and receives the assignment; the other is immediately informed the order is no longer available.

**Why this priority**: Without conflict resolution, two couriers could both think they own an
order, leading to double delivery attempts, disputes, and incorrect earnings. Critical for
operational correctness.

**Independent Test**: Can be tested by simulating two simultaneous claim requests on the same
order and verifying only one succeeds.

**Acceptance Scenarios**:

1. **Given** two couriers claim the same order at the same moment, **When** the system processes
   both requests, **Then** exactly one courier receives the assignment and the other receives
   a clear "order already taken" response.
2. **Given** an order has been claimed by another courier, **When** a second courier attempts
   to claim it, **Then** the order no longer appears in the second courier's available orders list.

---

### User Story 3 — Operator Cancels an Order (Priority: P2)

An operator cancels an order that is no longer needed — whether it is still waiting for a
courier or already in progress. The courier (if assigned) is freed up and the cancellation
is recorded.

**Why this priority**: Cancellations happen regularly in delivery operations (customer changed
mind, incorrect address, etc.). Operators must be able to cancel at any stage.

**Independent Test**: Can be tested by cancelling orders in each non-terminal status and
confirming the courier is freed and the order is closed.

**Acceptance Scenarios**:

1. **Given** an available order with no courier assigned, **When** an operator cancels it,
   **Then** the order is marked as cancelled and disappears from the available orders list.
2. **Given** an order assigned to a courier, **When** an operator cancels it, **Then** the
   order is cancelled, the courier is notified, and they become available to take new orders.
3. **Given** an order in delivery, **When** an operator cancels it, **Then** the order is
   cancelled, the courier is freed, and no earnings are recorded for that order.
4. **Given** a cancelled or completed order, **When** anyone attempts to cancel it again,
   **Then** the system rejects the action with a clear message.

---

### User Story 4 — Operators See Order Status Updates in Real Time (Priority: P2)

An operator is monitoring the orders dashboard. As couriers progress through their
deliveries, every status change appears on the operator's screen immediately, without
needing to refresh.

**Why this priority**: Real-time visibility is essential for dispatch operations — operators
need to know which orders are progressing and which may need attention.

**Independent Test**: Can be tested by having a courier update an order status while an
operator watches the dashboard — the status change must appear within seconds.

**Acceptance Scenarios**:

1. **Given** an operator is viewing the orders list, **When** a courier claims an order,
   **Then** the order's status and assigned courier appear on the operator's screen within
   a few seconds, without a page refresh.
2. **Given** an operator is viewing an order, **When** the courier marks it as completed,
   **Then** the operator's view updates to show the completed status and timestamp.

---

### User Story 5 — External System Receives Order Status Callbacks (Priority: P3)

When an order that originated from an external system progresses through key milestones
(picked up, delivered, cancelled), the external system receives an automated status
notification at the URL it provided when the order was created.

**Why this priority**: Required for integrations with partner platforms that need to track
their orders in their own systems. Depends on order creation (feature 002) having stored
the callback URL.

**Independent Test**: Can be tested by creating an order with a test callback URL and
verifying the callback is received at each milestone.

**Acceptance Scenarios**:

1. **Given** an order was created with an external callback URL, **When** the courier picks
   it up, **Then** the external system receives a status notification at the stored URL.
2. **Given** an external callback delivery fails, **When** the system retries, **Then** the
   order status on the courier platform is unaffected — the callback failure does not block
   the courier's workflow.

---

### Edge Cases

- What if a courier's app crashes mid-delivery and they never mark the order complete?
  → The order remains in "in delivery" status. An operator can cancel it manually. No
  automatic timeout is in scope for v1.
- What if a courier tries to move an order backward (e.g., from "picked up" back to "claimed")?
  → Backward transitions are not permitted; the system rejects such requests with a clear error.
- What if an order is completed and then someone tries to cancel it?
  → Completed orders are terminal — cancellation is rejected.
- What if the external callback URL returns an error repeatedly?
  → After a defined number of retries the callback is abandoned and logged. The order itself
  is unaffected.
- Can a courier have multiple active orders simultaneously?
  → Assumed no for v1 — a courier can only hold one active order at a time. Attempting to claim
  a second while one is in progress is rejected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a list of available (unclaimed) orders to authenticated couriers
  within their tenant, showing pickup address and delivery fee.
- **FR-002**: A courier MUST be able to claim an available order, resulting in exclusive assignment
  of that order to them.
- **FR-003**: When two couriers attempt to claim the same order simultaneously, system MUST ensure
  exactly one succeeds and the other receives an "already taken" response.
- **FR-004**: A courier MUST be able to progress their assigned order through the following statuses
  in sequence: claimed → picked up → in delivery → completed.
- **FR-005**: Skipping a status step in the defined sequence MUST NOT be permitted.
- **FR-006**: Upon order completion, system MUST automatically record a delivery history entry and
  the courier's earnings for that order.
- **FR-007**: Operators, Managers, and Owners MUST be able to cancel any order that is not yet
  completed, at any stage.
- **FR-008**: Couriers MUST NOT be permitted to cancel orders.
- **FR-009**: Cancelling an order that has an assigned courier MUST release that courier to accept
  new orders.
- **FR-010**: No earnings MUST be recorded for a cancelled order.
- **FR-011**: Every status change MUST be logged with the acting user, timestamp, and prior status
  for full traceability.
- **FR-012**: All status changes MUST be reflected on operator and manager dashboards within seconds,
  without requiring a manual refresh.
- **FR-013**: For orders created with an external callback URL, system MUST send a status notification
  to that URL when the order is picked up, completed, or cancelled.
- **FR-014**: Failure to deliver an external callback MUST NOT prevent or revert the corresponding
  order status change.
- **FR-015**: A courier without an open work shift MUST NOT be permitted to claim orders.
- **FR-016**: A courier who already has an active (uncompleted) order MUST NOT be permitted to claim
  a second order simultaneously.

### Key Entities

- **Order**: The unit of work — progresses through defined statuses; tracks assigned courier,
  transition timestamps, and (optionally) an external callback URL.
- **Delivery Record**: Created when an order is completed — captures the courier, order, and
  completion details for history and reporting.
- **Earnings Entry**: Created when an order is completed — records the delivery fee owed to the
  courier; feeds into the payout feature.
- **Status Audit Log**: An append-only record of every status transition — captures acting user,
  old status, new status, and timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier can complete the full delivery flow (claim → pick up → deliver → complete)
  with each step confirmed within 2 seconds of the action.
- **SC-002**: When two couriers simultaneously attempt to claim the same order, exactly one succeeds
  in 100% of test cases — no double-assignments ever occur.
- **SC-003**: An operator cancelling an order sees the updated status within 3 seconds, and the
  assigned courier's availability is restored within 3 seconds.
- **SC-004**: Status changes appear on the operator dashboard within 3 seconds of the courier's
  action, without a page refresh, in 95% of cases under normal load.
- **SC-005**: External callbacks are delivered within 10 seconds of the triggering status change
  in 95% of cases; callback failure never blocks the courier's workflow.
- **SC-006**: Earnings are recorded for 100% of completed orders and for 0% of cancelled orders.

## Assumptions

- Feature 001 (Courier Authentication) and Feature 002 (Order Ingestion) are prerequisites;
  authenticated couriers and existing orders must be available before this feature can operate.
- Work Shift Management (feature 005) is a prerequisite; couriers must have an open shift to
  claim orders. This feature validates shift status but does not implement shift management.
- A courier can hold at most one active order at a time in v1. This constraint may be relaxed
  in a future version.
- "Completed" and "Cancelled" are terminal states — no further transitions are possible from them.
- The delivery fee (courier award) is set at order creation time and does not change during the
  lifecycle; the earnings entry records this fixed amount.
- Real-time status updates are pushed to operator dashboards automatically; operators do not need
  to take any action to see changes.
- External callback retry behavior (number of attempts, interval) is a configuration detail to
  be confirmed during planning; the spec requires retries but does not fix the count.
- Couriers receive a push notification when an order is cancelled that was assigned to them;
  the notification mechanism is a dependency on the notification infrastructure.
