# Feature Specification: Work Shift Management

**Feature Branch**: `007-work-shift-management`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "005-work-shift-management"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Courier Opens and Closes Their Shift (Priority: P1)

A courier starts their working day by opening a shift through the courier app. This marks them as on-duty and available for order assignment. When finished for the day, the courier closes the shift. The shift records start and end times, allowing duration calculation.

**Why this priority**: Opening/closing a shift is the core gating mechanism for the entire delivery operation. The system requires that a courier without an open shift cannot be assigned orders. Without this story, no work shift feature exists.

**Independent Test**: Can be fully tested by: (1) courier opens shift → sees status "open"; (2) courier closes shift → sees status "closed" with end time; (3) courier cannot open a second shift while one is already open. Delivers standalone value as shift state tracking.

**Acceptance Scenarios**:

1. **Given** a courier has no open shift, **When** they open a shift, **Then** a new shift record is created with status "open", start time is recorded, and the courier's availability status updates to "available".
2. **Given** a courier has an open shift, **When** they close the shift, **Then** the shift record is updated with status "closed", end time is recorded, and the courier's availability status updates to "unavailable".
3. **Given** a courier already has an open shift, **When** they attempt to open another shift, **Then** the request is rejected with a clear error message.
4. **Given** a courier has no open shift, **When** they attempt to close a shift, **Then** the request is rejected with a clear error message.

---

### User Story 2 — Order Assignment Blocked for Off-Shift Couriers (Priority: P1)

When an operator attempts to assign an order to a courier, or when a courier attempts to claim an available order, the system must verify that the courier has an open shift. Off-shift couriers are ineligible for order assignment.

**Why this priority**: This is a hard system constraint. The constitution states: "a courier without an open shift MUST NOT be assignable to orders." Without this enforcement story, the shift management feature has no operational value.

**Independent Test**: Can be tested by: (1) assign an order to a courier with no open shift → rejected with a clear error; (2) courier with no open shift attempts to claim an order → rejected; (3) courier with open shift claims an order → succeeds.

**Acceptance Scenarios**:

1. **Given** a courier has no open shift, **When** an operator tries to assign an order to them, **Then** the assignment is rejected with a clear message indicating the courier is not on shift.
2. **Given** a courier has no open shift, **When** the courier attempts to claim an available order, **Then** the claim is rejected with a clear message indicating they must open a shift first.
3. **Given** a courier has an open shift, **When** they claim an available order, **Then** the order is successfully claimed.
4. **Given** a courier's shift is closed while they have an order in progress, **When** the order reaches a terminal state (completed or cancelled), **Then** no automatic shift reopening occurs.

---

### User Story 3 — Staff Views Courier Shift History (Priority: P2)

Owners, managers, and operators can view the shift history for any courier in their tenant: a chronological list of past and current shifts with open/close times and duration. This supports payroll reconciliation, performance review, and dispute resolution.

**Why this priority**: Shift records are operationally valuable for reporting but are not blocking. The core shift gate (US1 + US2) must work before history reporting adds value.

**Independent Test**: Can be tested by: staff requests shift history for a specific courier → receives paginated list with date range and duration per shift. Operates independently of shift lifecycle logic.

**Acceptance Scenarios**:

1. **Given** a courier has completed several shifts, **When** an owner or manager requests that courier's shift history, **Then** they receive a chronological list of shifts with open time, close time (or null if open), and duration in minutes.
2. **Given** a request for shift history with a date range filter, **When** the staff member specifies start and end dates, **Then** only shifts that overlap the requested range are returned.
3. **Given** a courier with no shifts, **When** staff requests their shift history, **Then** an empty list is returned (not an error).
4. **Given** a staff member from Tenant A, **When** they request shift history for a courier from Tenant B, **Then** they receive a 404 — cross-tenant data is never exposed.

---

### User Story 4 — Courier Views Own Shift Status and History (Priority: P2)

A courier can see their own current shift status (open or closed) and review their own historical shifts, including shift durations and order counts per shift. This supports personal time tracking and self-service verification of worked hours.

**Why this priority**: Valuable for courier self-service but non-blocking. Read access to own data is lower risk than the gating logic in US1–US2.

**Independent Test**: Can be tested by: courier requests own current shift → receives shift record or null; courier requests own shift history → receives paginated list with duration and order count.

**Acceptance Scenarios**:

1. **Given** a courier has an open shift, **When** they query their current shift status, **Then** they receive the shift record with status "open", start time, and elapsed duration in minutes.
2. **Given** a courier has no open shift, **When** they query their current shift status, **Then** they receive a response indicating no active shift (empty result, not an error).
3. **Given** a courier has historical shifts, **When** they request their own shift history, **Then** they receive a list ordered by most recent first, with each shift showing duration in minutes and order count completed during that shift.

---

### User Story 5 — Staff Sees Live Active Shifts (Priority: P3)

An operator or manager can view a real-time list of all currently open shifts across their tenant. Each entry shows the courier name, shift start time, and how many orders are currently assigned to them. When a courier opens or closes a shift, the list updates within 3 seconds via a real-time notification.

**Why this priority**: Useful for operational oversight but depends on US1–US3 being complete. Real-time visibility is an enhancement over the polling approach.

**Independent Test**: Can be tested by: staff requests active shifts endpoint → sees all open shifts; courier opens shift → staff Socket.IO connection receives `courier:shift_opened` event within 3 seconds.

**Acceptance Scenarios**:

1. **Given** multiple couriers have open shifts, **When** a manager requests the active shifts list, **Then** they see all open shifts with courier name, start time, current order count, and elapsed duration.
2. **Given** a courier opens a new shift, **When** the staff is connected to the real-time feed, **Then** they receive a `courier:shift_opened` event within 3 seconds.
3. **Given** a courier closes their shift, **When** the staff is connected to the real-time feed, **Then** they receive a `courier:shift_closed` event within 3 seconds.

---

### Edge Cases

- What happens when a courier's device goes offline mid-shift? The shift remains open until explicitly closed; no automatic timeout.
- What happens if a courier has an order in progress (status: assigned, picked_up, or in_delivery) when they attempt to close their shift? Closing is allowed — orders in progress remain assigned to the courier; only new assignments are blocked after shift closes.
- What happens if a shift record has a start time but no end time after 24 hours? It is treated as still open; no automatic closure.
- What happens if an operator assigns an order to a courier who closes their shift between the check and the assignment? The shift gate check is atomic with the assignment; if the shift is closed at the moment of assignment, the assignment is rejected.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a courier to open a shift, recording the start timestamp server-side.
- **FR-002**: System MUST allow a courier to close their open shift, recording the end timestamp server-side.
- **FR-003**: System MUST reject an open-shift request if the courier already has a shift with status "open", returning a conflict error.
- **FR-004**: System MUST reject a close-shift request if the courier has no shift with status "open", returning an appropriate error.
- **FR-005**: System MUST prevent order assignment (via courier claim or operator assignment) to any courier whose current shift is not "open", returning a clear error identifying the reason.
- **FR-006**: System MUST expose a staff-accessible endpoint to retrieve a courier's shift history, supporting optional date range filtering and pagination (20 records per page default).
- **FR-007**: System MUST expose a courier-accessible endpoint to return their own current shift status (active shift or null).
- **FR-008**: System MUST expose a courier-accessible endpoint to return their own shift history with per-shift duration and order count.
- **FR-009**: All shift records MUST carry an `owner_id` (tenant identifier) and MUST NOT be accessible across tenants.
- **FR-010**: System MUST expose a staff-accessible endpoint to list all currently open shifts across the tenant, showing courier name, start time, elapsed duration, and current active order count.
- **FR-011**: When a courier opens a shift, the system MUST emit a `courier:shift_opened` Socket.IO event to the `tenant:{ownerId}:staff` room.
- **FR-012**: When a courier closes a shift, the system MUST emit a `courier:shift_closed` Socket.IO event to the `tenant:{ownerId}:staff` room.
- **FR-013**: Shift open and close operations MUST update the courier's availability status atomically within the same transaction.

### Key Entities

- **Shift**: Represents a single work session for a courier. Key attributes: tenant (owner_id), courier reference, status (open/closed), start time, end time (nullable), derived duration in minutes, count of orders completed during the shift.
- **Courier** (existing): Associated with their current active shift; courier assignability is gated by whether they have an open shift.
- **Order** (existing): Order claim and assignment flows must enforce the shift gate before proceeding.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier can open or close a shift and receive confirmation in under 2 seconds (end-to-end round trip).
- **SC-002**: An order assignment attempt targeting an off-shift courier is rejected in under 1 second with a clear, actionable error message.
- **SC-003**: Staff can retrieve the last 30 days of shift history for any courier in their tenant in under 3 seconds.
- **SC-004**: All open shift events appear on the staff real-time feed within 3 seconds of shift open.
- **SC-005**: Zero off-shift couriers are successfully assigned orders — the shift gate has a 100% block rate across all assignment paths (courier claim and operator assignment).
- **SC-006**: Shift state transitions (open/close) are atomic — no partially committed shift records (e.g., shift opened without start time) ever appear in the database.
- **SC-007**: The active shifts list for a tenant with 50 concurrent open shifts loads in under 2 seconds.

---

## Assumptions

- The courier app is a mobile REST client; shift open/close is triggered by an explicit user action (a button tap), not by geofencing, GPS, or automatic detection.
- A courier can have at most one open shift at a time; overlapping or concurrent shifts for the same courier are not supported.
- Shift duration is calculated server-side as `end_time - start_time`; the courier's device clock is not used.
- Force-closing a stale open shift (e.g., courier went offline without closing) is out of scope for this feature; a future admin-tooling feature will handle it.
- The courier's `status` field (`available`/`unavailable`) on the couriers record remains the source of truth for assignability and is updated atomically when a shift is opened or closed.
- A courier closing their shift while an order is actively in progress does not cancel or reassign the order — the delivery continues to completion; only new order assignments are blocked.
- Pagination defaults to 20 shifts per page; clients may request up to 100 per page.
- All timestamps are stored and returned in UTC.
- The admin panel (React + Ant Design) will expose shift history in the Courier detail drawer as a tab or sub-section — no separate page is introduced (consistent with the single-page UX principle).
- Order count per shift is computed at query time from the `courier_location_history` or `courier_earnings` table — no separate counter column is maintained.
