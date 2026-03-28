# Feature Specification: Work Shift Management

**Feature Branch**: `005-work-shift-management`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "@05-work-shift-management"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Work Shift (Priority: P1)

A courier starts their working day by opening a shift. This signals to the system that the courier is available to receive and take orders. Operator dashboards immediately reflect the courier's availability change.

**Why this priority**: Opening a shift is the prerequisite gate for all courier order activity. Without it, no orders can be assigned. It is the most critical user action in the shift lifecycle.

**Independent Test**: Can be fully tested by having a courier open a shift and verifying their availability status changes and operators are notified — delivers the core availability signal independently.

**Acceptance Scenarios**:

1. **Given** a courier with no open shift for the current day, **When** they open a shift, **Then** the system records the shift open event, sets the courier as available, and returns a success response with the new shift record.
2. **Given** a courier who already has an open shift for the current day, **When** they attempt to open another shift, **Then** the system rejects the request with a conflict error and no duplicate shift is created.
3. **Given** two concurrent open-shift requests from the same courier, **When** both arrive simultaneously, **Then** exactly one succeeds and the other is rejected with a conflict error.

---

### User Story 2 - Close Work Shift (Priority: P1)

A courier ends their working day by closing their shift. This marks them as unavailable, preventing new order assignments and updating operator dashboards in real time.

**Why this priority**: Closing a shift is equally critical — it ensures unavailable couriers are not offered or assigned orders, keeping the operational state accurate.

**Independent Test**: Can be fully tested by opening a shift, then closing it, and verifying the courier becomes unavailable and operators are notified.

**Acceptance Scenarios**:

1. **Given** a courier with an open shift for the current day, **When** they close their shift, **Then** the system records the close event, sets the courier as unavailable, and returns success.
2. **Given** a courier with no open shift for the current day, **When** they attempt to close a shift, **Then** the system rejects the request with a conflict error.
3. **Given** a courier with a closed shift, **When** they attempt to take an order, **Then** the system refuses the order assignment.

---

### User Story 3 - View Current Shift State (Priority: P2)

A courier can check the status of their current-day shift at any time — whether it is open or closed, and when it was opened or closed.

**Why this priority**: The courier app needs this to display the correct UI state. Without it, the app cannot reliably reflect current shift status, but it does not block core operations.

**Independent Test**: Can be fully tested independently by querying the current shift state after various open/close sequences and verifying the response reflects the correct state for the current day in the owner's local timezone.

**Acceptance Scenarios**:

1. **Given** a courier who has opened a shift today, **When** they request their current shift state, **Then** the response shows the shift is open with the opened timestamp.
2. **Given** a courier who has opened and then closed a shift today, **When** they request their current shift state, **Then** the response shows the shift is closed with both timestamps.
3. **Given** a courier who has not opened a shift today, **When** they request their current shift state, **Then** the response shows no open shift for today.
4. **Given** an owner with a non-UTC timezone configured, **When** a courier queries their current shift state, **Then** the "current day" boundary and the returned date are calculated in the owner's configured timezone.

---

### User Story 4 - Operator Real-Time Availability Visibility (Priority: P2)

Operators viewing a dashboard see courier availability changes in real time without refreshing. Each shift open or close event is broadcast to the relevant operator room immediately after it is recorded.

**Why this priority**: Operator visibility is a key value of the shift system. However, the broadcast is a secondary effect of the core shift actions — the primary shift operations remain functional even if broadcast is delayed.

**Independent Test**: Can be tested by subscribing to the operator event channel and triggering a shift open or close, verifying the availability event arrives with the correct courier ID and status.

**Acceptance Scenarios**:

1. **Given** an operator dashboard subscribed to availability events for a tenant, **When** a courier in that tenant opens a shift, **Then** the dashboard receives a real-time event with the courier ID and new available status.
2. **Given** a courier closes a shift, **When** the close completes, **Then** the operator receives a real-time event with the courier ID and unavailable status.
3. **Given** a broadcast delivery failure, **When** the shift open or close completes, **Then** the HTTP response to the courier still succeeds — the broadcast failure does not affect the shift operation.

---

### Edge Cases

- What happens when a courier opens a shift just before midnight and the day rolls over in the owner's configured timezone?
- How does the system determine "current day" when the owner has no timezone configured?
- What if two concurrent close requests arrive simultaneously for the same open shift?
- How is a courier with no shift record at all treated when querying current shift state?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a courier to open a shift for the current day, recording the event and marking the courier as available, in a single atomic operation.
- **FR-002**: System MUST prevent a courier from opening a second shift on the same day if one is already open, returning a conflict error.
- **FR-003**: System MUST allow a courier to close their open shift, recording the close event and marking the courier as unavailable, in a single atomic operation.
- **FR-004**: System MUST prevent a courier from closing a shift when no open shift exists for the current day, returning a conflict error.
- **FR-005**: System MUST expose an endpoint for a courier to retrieve their current-day shift state, including whether the shift is open and any open/close timestamps.
- **FR-006**: System MUST define "current day" based on the tenant owner's configured timezone. If no timezone is configured, UTC MUST be used as the default.
- **FR-007**: System MUST broadcast a real-time availability event to the relevant operator room after every shift open or close.
- **FR-008**: Broadcast delivery failure MUST NOT cause the shift operation to fail — the broadcast is best-effort and decoupled from the courier-facing response.
- **FR-009**: Concurrent duplicate shift open or close requests from the same courier MUST be handled safely — exactly one succeeds and any duplicate returns a conflict error, with no duplicate records created.
- **FR-010**: All shift timestamps MUST be stored in UTC and returned in ISO 8601 format.
- **FR-011**: The date field in the current shift state response MUST be returned in the owner's configured timezone.

### Key Entities

- **Courier**: Represents a delivery courier in the system. Carries a live availability status (`available` / `unavailable`) that is the authoritative flag used by order assignment. Scoped to a tenant owner.
- **CourierWorkingShift**: An append-only event log entry recording each shift open or close action for a courier. Each row carries an event type (open or close), a UTC timestamp, and a reference to the courier and owner. Used for history and to determine current shift state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier can open or close their shift in under 2 seconds under normal load.
- **SC-002**: Operator dashboards receive the availability event within 1 second of a shift open or close completing.
- **SC-003**: Concurrent duplicate shift requests (e.g., from network retries) result in zero duplicate shift records — exactly one operation succeeds.
- **SC-004**: 100% of shift open and close operations atomically update both the shift event log and the courier availability status — no partial state is possible.
- **SC-005**: Current-day shift state is correctly computed for all configured IANA timezones — couriers under different tenant timezones see the correct state for their local day.
- **SC-006**: Broadcast outages do not increase the courier-facing error rate for shift operations.

## Assumptions

- Couriers are authenticated via JWT and the courier identity and tenant owner are derived from the token — no additional input is required for shift operations.
- A courier can have at most one open shift per calendar day (in the owner's timezone); shifts on separate days are independent.
- The tenant owner's timezone is already stored in the system and accessible at the time of shift operations.
- Operators are already connected to the real-time event infrastructure; this feature only emits events to the existing operator room for the tenant.
- Force-closing a courier's shift by an operator is out of scope for this feature.
- Shift analytics, duration calculations, and overtime reporting are out of scope.
- Order assignment eligibility checks (verifying courier availability before assigning an order) are handled by the order lifecycle feature, not this feature.
