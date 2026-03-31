# Feature Specification: Payout Reconciliation

**Feature Branch**: `008-payout-reconciliation`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "006-payout-reconciliation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Staff Closes a Payout Period and Reviews Earnings (Priority: P1)

A business owner or manager selects a date range and generates a payout summary showing how much each courier earned during that period. The summary breaks down earnings by delivery count and total amount. Staff can then review the numbers before committing to payment.

**Why this priority**: This is the core reconciliation action. Without it, no payout can be initiated. All other stories depend on periods being created and reviewed.

**Independent Test**: Can be fully tested by creating a payout period for a date range with existing courier earnings and verifying the correct per-courier totals are returned.

**Acceptance Scenarios**:

1. **Given** there are completed deliveries with earnings in the system, **When** staff creates a payout period with a start and end date, **Then** the system returns a summary listing each courier's total earned amount and delivery count for that range.
2. **Given** a payout period is open, **When** staff closes it, **Then** the period status changes to "closed" and cannot be reopened.
3. **Given** a date range with no earnings, **When** staff creates a payout period, **Then** the system returns an empty courier summary (no couriers listed).
4. **Given** staff from Tenant A, **When** they view payout periods, **Then** they only see periods and earnings belonging to their tenant.

---

### User Story 2 — Staff Marks a Courier's Earnings as Paid (Priority: P1)

After reviewing the earnings summary for a closed payout period, staff records that a specific courier has been paid, optionally adding a reference note (e.g., bank transfer ID). This creates an immutable payout record.

**Why this priority**: Completing the reconciliation loop — tracking who has been paid — is the primary business value. Required before couriers can check their payout status.

**Independent Test**: Can be tested by closing a payout period, marking one courier as paid, and confirming the payout record exists with status "paid" and the correct amount.

**Acceptance Scenarios**:

1. **Given** a closed payout period with unpaid courier earnings, **When** staff marks a courier as paid with an optional reference note, **Then** a payout record is created with amount, paid timestamp, and note.
2. **Given** a courier already marked as paid in a period, **When** staff attempts to mark them paid again, **Then** the system returns a conflict error.
3. **Given** a courier from a different tenant, **When** staff attempts to mark them paid, **Then** the system returns a not-found error.
4. **Given** an open (not yet closed) payout period, **When** staff attempts to mark a courier as paid, **Then** the system returns a validation error requiring the period to be closed first.

---

### User Story 3 — Courier Views Own Earnings and Payout History (Priority: P2)

A courier can see a paginated list of their own delivery earnings — each entry showing the delivery, amount, and date — as well as a list of payout records showing when they were paid and how much.

**Why this priority**: Transparency for couriers builds trust. Read-only and does not block business operations.

**Independent Test**: Can be tested by having a courier call their earnings history endpoint and verify entries match completed deliveries, and call payout history to verify settled amounts.

**Acceptance Scenarios**:

1. **Given** a courier with several completed deliveries, **When** they request their earnings history with optional date filter, **Then** they receive a paginated list of earnings ordered newest first, each with delivery amount and earned date.
2. **Given** a courier with at least one payout recorded by staff, **When** they request their payout history, **Then** they see a list of payouts with period dates, total amount, paid date, and optional reference note.
3. **Given** a courier requesting another courier's earnings, **Then** the system returns a forbidden error.

---

### User Story 4 — Staff Views Pending (Unpaid) Couriers for a Period (Priority: P2)

Within a closed payout period, staff can see which couriers have not yet been marked as paid — making it easy to track outstanding obligations.

**Why this priority**: Reduces the chance of missed payments during reconciliation. Useful but derives value from US1 and US2 already being complete.

**Independent Test**: Can be tested by closing a period, paying some couriers but not others, and calling the pending-couriers endpoint to confirm only unpaid couriers appear.

**Acceptance Scenarios**:

1. **Given** a closed period with 3 couriers earning and 1 already paid, **When** staff requests pending couriers for that period, **Then** 2 couriers are returned with their unpaid totals.
2. **Given** all couriers in a period marked as paid, **When** staff requests pending, **Then** an empty list is returned.

---

### Edge Cases

- What happens when a delivery's earning is created after a payout period covering that date has already been closed? The earning remains in the system but is not retroactively included in the closed period.
- What if a payout period's date range overlaps with another period? Allowed by design — periods are views over earnings data, not exclusive buckets. Staff controls date ranges.
- What if staff tries to create a payout period with end date before start date? The system returns a validation error.
- What if a courier had zero earnings in a period? They are not listed in the period summary or pending list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Staff (owner, manager, order_operator) MUST be able to create a payout period by specifying a start date and end date.
- **FR-002**: The system MUST calculate each courier's total earned amount and delivery count within a payout period's date range from existing courier earnings data.
- **FR-003**: Staff MUST be able to close an open payout period; once closed its status cannot be changed.
- **FR-004**: Staff MUST be able to mark a courier as paid within a closed payout period, providing the amount and an optional reference note.
- **FR-005**: The system MUST prevent marking the same courier as paid more than once within the same payout period (conflict error).
- **FR-006**: The system MUST prevent marking a courier as paid in a period that is not yet closed (validation error).
- **FR-007**: Staff MUST be able to list all payout periods for their tenant, with status (open/closed) and period dates.
- **FR-008**: Staff MUST be able to retrieve the earnings summary for a specific payout period (list of couriers with totals and delivery counts).
- **FR-009**: Staff MUST be able to retrieve the list of couriers with unpaid earnings within a closed payout period.
- **FR-010**: Couriers MUST be able to view their own paginated earnings history with optional date-range filter.
- **FR-011**: Couriers MUST be able to view their own payout records (settled payments with amounts, dates, and reference notes).
- **FR-012**: All data access MUST be scoped to the authenticated user's tenant — cross-tenant access MUST be rejected with not-found or forbidden errors.
- **FR-013**: Payout records MUST be immutable once created (no editing or deletion permitted).

### Key Entities

- **PayoutPeriod**: A reconciliation window defined by start date and end date. Has a status (open/closed), belongs to an owner (tenant). Once closed, further state changes are blocked.
- **Payout**: Records that a specific courier was paid within a payout period. Contains courier reference, payout period reference, total paid amount, paid timestamp, and optional reference note. Immutable once created.
- **CourierEarning** *(existing)*: Per-delivery earning record with amount and earned_at timestamp. Read by this feature; not modified.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can generate a full payout summary for any date range in under 3 seconds, regardless of number of couriers or deliveries in that range.
- **SC-002**: Marking a courier as paid is a single action that completes in under 1 second and is immediately reflected in the pending-couriers list.
- **SC-003**: Couriers can retrieve their earnings history (paginated) with each page loading in under 2 seconds.
- **SC-004**: Zero cases of double-payment: the system rejects duplicate payout records for the same courier within the same period with an explicit error in 100% of attempts.
- **SC-005**: All data returned to any user is exclusively scoped to their tenant — verified by cross-tenant test scenarios returning no foreign data.

## Assumptions

- The existing `courier_earnings` table stores per-delivery earned amounts with `earned_at` timestamps and `courier_id` / `owner_id` columns — these are the source of truth for all calculations.
- Payout periods are informational views over earnings data and are not exclusive locks — the same earning can appear in multiple overlapping periods (staff controls date ranges by design).
- Currency is stored and returned as a numeric decimal value; formatting and currency symbol are client concerns.
- Modifying or deleting historical earnings (written by prior features) is out of scope for this feature.
- Export to PDF or CSV is out of scope for this version.
- Push notifications to couriers when marked as paid are out of scope for this version.
- Authentication and role-based access control are already fully implemented (feature 001).
