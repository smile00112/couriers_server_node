# Feature Specification: Payout Reconciliation

**Feature Branch**: `006-payout-reconciliation`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "@06-payout-reconciliation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Payout Request (Priority: P1)

A courier selects their unpaid order earnings and submits a payout request to group them for disbursement. The system validates ownership, calculates the total, and creates a pending payout record atomically.

**Why this priority**: Creating a payout request is the entry point of the entire payout lifecycle. Without it, no payout can be approved or disbursed. It is the most critical courier-facing action.

**Independent Test**: Can be fully tested by creating a courier with completed orders, submitting a payout request with their unpaid payments, and verifying the payout is created in pending state with the correct amount and the payments are marked as included.

**Acceptance Scenarios**:

1. **Given** a courier with two unpaid payments, **When** they submit a payout request with both payment IDs, **Then** a pending payout is created with the combined total, the payments are linked to the payout, and the courier receives a success response.
2. **Given** a courier attempting to include a payment that belongs to a different courier, **When** they submit the request, **Then** the system rejects the entire request with a validation error.
3. **Given** a courier attempting to include a payment already included in another payout, **When** they submit the request, **Then** the system rejects it with a conflict error and no duplicate payout is created.
4. **Given** a courier who submits an identical payout request for the same set of payments that already has a pending payout, **When** they submit again, **Then** the existing payout is returned instead of creating a duplicate.
5. **Given** a courier submitting an empty list of payment IDs, **When** the request is processed, **Then** the system rejects it with a validation error.

---

### User Story 2 - Approve a Payout (Priority: P1)

An operator, manager, or owner reviews a pending payout and approves it, recording who approved it and when. Both the operator and the courier are notified in real time.

**Why this priority**: Approval is the key operator action that moves a payout toward disbursement. Without it, payout requests would never progress past the pending state.

**Independent Test**: Can be fully tested by creating a pending payout and having an authorized user approve it, then verifying the payout status, audit fields, and real-time event.

**Acceptance Scenarios**:

1. **Given** a pending payout, **When** an operator approves it, **Then** the payout status changes to approved, the approver identity and timestamp are recorded, and a real-time notification is sent to both the courier and operators.
2. **Given** an already approved payout, **When** an operator attempts to approve it again, **Then** the system rejects the request with a conflict error.
3. **Given** a courier attempting to approve a payout, **When** the request is processed, **Then** the system rejects it with an authorization error.

---

### User Story 3 - Reject a Payout (Priority: P1)

An operator, manager, or owner rejects a pending payout, providing a reason. All payments that were part of the rejected payout are released back to unpaid status so the courier can include them in a future payout request.

**Why this priority**: Rejection with payment rollback is essential for correctness — without it, payments would be permanently locked in a rejected payout and the courier could never be paid for those orders.

**Independent Test**: Can be fully tested by creating a pending payout, rejecting it with a reason, then verifying the payout is rejected, the reason is stored, and the previously linked payments are returned to unpaid status.

**Acceptance Scenarios**:

1. **Given** a pending payout with two linked payments, **When** an operator rejects it with a reason, **Then** the payout status changes to rejected, the rejection details are recorded, and both linked payments revert to unpaid status.
2. **Given** a rejected payout's payments now back in unpaid status, **When** the courier creates a new payout request including those payments, **Then** the new request succeeds.
3. **Given** an already rejected payout, **When** an operator attempts to reject it again, **Then** the system rejects the request with a conflict error.
4. **Given** an operator submitting a rejection without a reason, **When** the request is processed, **Then** the system rejects it with a validation error.

---

### User Story 4 - View Payment and Payout History (Priority: P2)

A courier can browse their payment history (earnings from completed orders) and their payout history, filtering by status to see which payments are still unpaid and which are pending or completed payouts.

**Why this priority**: Visibility into payment and payout history helps couriers manage their earnings. It is essential for transparency but does not block the core payout lifecycle.

**Independent Test**: Can be tested independently by creating a courier with payments in various states and verifying the list endpoints return correctly filtered, paginated results.

**Acceptance Scenarios**:

1. **Given** a courier with a mix of unpaid and in-payout payments, **When** they request their payment list filtered to unpaid, **Then** only unpaid payments are returned.
2. **Given** a courier with multiple payouts in various states, **When** they request their payout list, **Then** all their payouts are returned in the response.
3. **Given** a courier querying payments, **When** they request the second page, **Then** the system returns the correct offset of results.
4. **Given** a courier, **When** they request another courier's payment or payout records, **Then** the system returns no results or denies access.

---

### User Story 5 - Real-Time Payout Status Notifications (Priority: P2)

The courier app and operator dashboards receive real-time notifications when a payout is created, approved, or rejected, without requiring a page refresh.

**Why this priority**: Real-time updates improve operator responsiveness and courier transparency, but the core payout lifecycle functions correctly even without them.

**Independent Test**: Can be tested by subscribing to the relevant event rooms and triggering each payout state transition, verifying the correct event and payload are received.

**Acceptance Scenarios**:

1. **Given** a courier subscribed to their own notification channel, **When** their payout is approved, **Then** they receive a real-time event with the payout ID, amount, and new status.
2. **Given** an operator subscribed to the tenant event room, **When** a new payout request is created, **Then** the operator receives a real-time notification.
3. **Given** a real-time broadcast failure, **When** a payout is approved, **Then** the approval HTTP response still succeeds — the broadcast failure does not affect the payout operation.

---

### Edge Cases

- What happens when a courier submits a payout request while a concurrent request with the same payments is in flight?
- What if the total amount rounds differently due to floating-point arithmetic for large sets of payments?
- What happens if an operator from a different tenant attempts to approve a payout in another tenant?
- How is a payout detail request handled when the payout ID exists but belongs to a different tenant?
- What happens if the rollback of payment statuses on rejection partially fails mid-transaction?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a courier to list their payment records, filterable by status (unpaid, in-payout, or all), with pagination support.
- **FR-002**: System MUST allow a courier to create a payout request by selecting one or more of their unpaid payments, calculating the total, and atomically creating the payout and linking the payments.
- **FR-003**: System MUST validate that all payment IDs in a payout request belong to the requesting courier and have unpaid status; any failure MUST reject the entire request.
- **FR-004**: System MUST prevent double-booking of payments — a payment already linked to an existing payout cannot be included in a new one; the system MUST return a conflict error.
- **FR-005**: System MUST support idempotent payout creation — if a pending payout with the exact same set of payments already exists, the existing payout MUST be returned instead of creating a duplicate.
- **FR-006**: System MUST allow authorized users (Operator, Manager, Owner) to approve a pending payout, recording the approver identity and approval timestamp.
- **FR-007**: System MUST allow authorized users (Operator, Manager, Owner) to reject a pending payout, recording the rejector identity, rejection timestamp, and a required rejection reason.
- **FR-008**: System MUST atomically roll back all linked payment records to unpaid status when a payout is rejected.
- **FR-009**: System MUST prevent approving or rejecting a payout that is not in pending status, returning a conflict error.
- **FR-010**: System MUST prevent couriers from approving or rejecting payouts — only Operator, Manager, and Owner roles are authorized.
- **FR-011**: System MUST allow any authorized user (Courier for own, Operator/Manager/Owner for tenant) to view payout details by ID.
- **FR-012**: System MUST allow a courier to retrieve their current pending payout, if one exists.
- **FR-013**: System MUST store all monetary amounts with fixed decimal precision to prevent rounding errors.
- **FR-014**: System MUST broadcast a real-time event to the courier and to the tenant operator room after each payout state change (created, approved, rejected).
- **FR-015**: Real-time broadcast failures MUST NOT cause payout operations to fail.
- **FR-016**: All data access MUST be scoped to the tenant — couriers and operators can only access records within their own tenant.
- **FR-017**: Payout records MUST carry a full audit trail: who approved or rejected the payout, and when, along with any rejection reason.

### Key Entities

- **CourierPayments**: Represents a single earnings record from a completed order. Has a status of unpaid (available for payout) or in-payout (linked to a pending or approved payout). Carries the earned amount and a nullable reference to the payout it belongs to. Scoped to a tenant.
- **CourierPayout**: Represents a grouped payout request for disbursement. Has a lifecycle status of pending, approved, or rejected. Carries the total amount of linked payments, full audit fields (approved by, rejected by, rejection reason, timestamps), and a reference to the courier and tenant. Scoped to a tenant.
- **Courier**: The delivery courier whose earnings are being reconciled. Referenced for ownership, role authorization, and audit context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier can create a payout request in under 3 seconds under normal load.
- **SC-002**: An operator can approve or reject a payout in under 2 seconds under normal load.
- **SC-003**: 100% of payout creation and rejection operations atomically update both the payout record and all linked payment records — no partial state is possible.
- **SC-004**: Concurrent duplicate payout creation requests for the same payments result in exactly one payout record — no double-booking occurs.
- **SC-005**: All monetary amounts are stored and returned with exact decimal precision — zero rounding errors across all payout calculations.
- **SC-006**: Couriers and operators receive real-time payout status events within 1 second of a state change completing.
- **SC-007**: Payments linked to a rejected payout are available for inclusion in new payout requests within the same operation — no manual intervention required.
- **SC-008**: 100% of data access is tenant-scoped — no cross-tenant data leakage is possible through any payout or payment endpoint.

## Assumptions

- Couriers are authenticated via JWT and their identity and tenant are derived from the token — no additional identity input is required for payout operations.
- A courier's earnings (`CourierPayments`) are already created by the order lifecycle feature when orders are completed; this feature only reads and groups them.
- Actual external money transfer or bank settlement is out of scope — the approved payout record is the settlement artifact; disbursement integration is a future phase.
- Fee deduction and tax withholding are out of scope for this feature and will be defined in a future data-model phase.
- Platform-level payout reporting across all tenants is out of scope.
- The real-time event infrastructure (operator rooms and courier notification channels) is already in place; this feature only emits events to existing rooms.
- Operators, Managers, and Owners are treated identically for payout approve/reject authorization — no additional approval hierarchy or quorum is required.
- A courier may have at most one pending payout at a time (enforced by the idempotency rule and the double-booking constraint).
