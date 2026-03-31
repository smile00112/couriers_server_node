# Feature Specification: Courier Tracking

**Feature Branch**: `004-courier-tracking`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "courier-tracking"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Operator Sees Courier Locations on the Dashboard (Priority: P1)

An operator opens the dashboard and sees all active couriers in their tenant moving
in real time. Each courier's position updates automatically as the courier moves, so
the operator always has an accurate picture of where deliveries stand.

**Why this priority**: Live courier visibility is the primary value of this feature.
Without it, operators must call couriers individually to learn their whereabouts,
which is the main operational pain point this feature solves.

**Independent Test**: Can be tested by having a courier send location updates from
the app while an operator watches the dashboard — courier position must update
without page refresh.

**Acceptance Scenarios**:

1. **Given** an operator is viewing the dashboard, **When** an active courier sends
   a location update, **Then** the courier's position on the dashboard updates within
   a few seconds without a manual refresh.
2. **Given** multiple couriers are active in the same tenant, **When** they send
   location updates at different times, **Then** each courier's position updates
   independently without affecting others.
3. **Given** a courier has not sent any location update recently, **When** an operator
   views the dashboard, **Then** the courier's last known position and the time it was
   recorded are shown.

---

### User Story 2 — Courier App Sends Location Updates (Priority: P1)

The courier app periodically sends the courier's current GPS coordinates to the
platform. The platform records each update and keeps the courier's latest known
position current.

**Why this priority**: Without the courier sending updates, there is nothing to show
on the operator dashboard. This is the data-source story for Story 1.

**Independent Test**: Can be tested independently by verifying that a location
submission from the courier app updates the courier's recorded position.

**Acceptance Scenarios**:

1. **Given** an authenticated courier on an active shift, **When** their app sends
   a GPS coordinate, **Then** the courier's latest recorded position is updated.
2. **Given** a courier sends the same or very close coordinates as their previous
   update, **When** the platform receives it, **Then** it is recorded without error.
3. **Given** a courier sends an invalid coordinate (e.g., latitude outside the valid
   range), **When** the platform receives it, **Then** the update is rejected with a
   clear error and no position change is recorded.
4. **Given** a courier sends updates more frequently than the allowed rate, **When**
   the excess request arrives, **Then** it is rejected with an appropriate response
   and the courier's existing position remains unchanged.

---

### User Story 3 — Route History Is Recorded Per Delivery (Priority: P2)

Each location update sent while a courier has an active order is linked to that order,
building a complete movement history for the delivery. After the order is completed,
the full route is available for review.

**Why this priority**: Route history enables post-delivery analysis, dispute resolution,
and distance-based reporting. It builds on the core tracking flow (Stories 1 and 2).

**Independent Test**: Can be tested by verifying that location updates sent during an
active delivery are retrievable as an ordered route after the order completes.

**Acceptance Scenarios**:

1. **Given** a courier has an active order, **When** they send location updates,
   **Then** each update is associated with that order in the movement history.
2. **Given** a courier has no active order, **When** they send location updates,
   **Then** the updates are recorded but not linked to any specific order.
3. **Given** an order has been completed, **When** an operator views the delivery
   history for that order, **Then** the courier's recorded route for that delivery
   is visible in chronological order.

---

### User Story 4 — External System Receives Location Updates for Active Deliveries (Priority: P3)

When a courier is actively delivering an order that came from an external source,
the external system receives periodic location updates at the callback URL stored
on the order.

**Why this priority**: Required for partner integrations that display live courier
tracking to their own end customers. Builds on Stories 1–3 and the external callback
mechanism from order ingestion.

**Independent Test**: Can be tested by having a courier send location updates during
a delivery on an order with a test callback URL and verifying the external system
receives the updates.

**Acceptance Scenarios**:

1. **Given** a courier is actively delivering an order with an external callback URL,
   **When** the courier sends a location update, **Then** the external system receives
   a location notification at the stored URL.
2. **Given** a callback delivery fails, **When** the system retries, **Then** the
   courier's ability to send further location updates is unaffected.

---

### Edge Cases

- What if a courier's GPS signal is lost and they send no updates for several minutes?
  → The system retains the last known position with its timestamp. No automatic
  "offline" status is set based on location silence alone.
- What if the courier app sends coordinates with very high precision (many decimal places)?
  → The platform stores coordinates at a defined precision; excess decimals are rounded.
- What if a courier ends their shift while in the middle of a delivery?
  → Shift management is a separate concern. Location updates are accepted as long as
  the courier's session is valid, regardless of shift status.
- What if many couriers in the same tenant send updates simultaneously?
  → Each update is processed independently; no ordering guarantee is needed across
  different couriers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An authenticated courier MUST be able to submit their current GPS coordinates
  to the platform at any time during their session.
- **FR-002**: System MUST update the courier's latest known position on every accepted
  location submission.
- **FR-003**: System MUST record each accepted location update in the courier's movement
  history, along with the timestamp of receipt.
- **FR-004**: System MUST link each movement history entry to the courier's active order
  when one exists at the time of the update.
- **FR-005**: System MUST make each courier's latest position available to operators and
  managers in the same tenant without requiring a manual refresh.
- **FR-006**: Location updates MUST be reflected on the operator dashboard within a few
  seconds of receipt.
- **FR-007**: System MUST reject location submissions with coordinates outside the valid
  geographic range and return a clear error.
- **FR-008**: System MUST enforce a maximum submission rate per courier; requests
  exceeding the rate limit MUST be rejected without updating the courier's position.
- **FR-009**: For each accepted update where the courier has an active order with an
  external callback URL, system MUST send a location notification to that URL.
- **FR-010**: Failure to deliver an external location callback MUST NOT prevent the
  courier's location update from being recorded or displayed.
- **FR-011**: Movement history MUST be retained for at least 90 days and be queryable
  by order for post-delivery review.
- **FR-012**: The distance covered between consecutive location updates MUST be calculated
  and stored with each movement history entry for use in distance-based reporting.

### Key Entities

- **Courier Position**: The courier's current known location — a single record per
  courier that is overwritten on each accepted update, holding coordinates and
  the timestamp of the last update.
- **Movement History Entry**: An append-only record of a single location update —
  captures coordinates, timestamp, distance since the previous update, and optionally
  the active order at the time. Retained for 90 days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier's position on the operator dashboard updates within 3 seconds
  of the courier app sending a location update, in 95% of cases under normal load.
- **SC-002**: Location updates with invalid coordinates are rejected 100% of the time
  with a specific error message.
- **SC-003**: Rate-limit excess requests are rejected 100% of the time; the courier's
  last valid position is preserved unchanged.
- **SC-004**: Movement history for a completed delivery is fully retrievable in
  chronological order 100% of the time.
- **SC-005**: External location callbacks do not delay or block the courier's app
  — the app receives a response within 1 second regardless of callback outcome.

## Assumptions

- Feature 001 (Courier Authentication) is a prerequisite; only authenticated couriers
  can submit location updates.
- Feature 003 (Order Lifecycle) is a dependency for linking updates to active orders;
  this feature reads the courier's current order but does not manage order state.
- The courier app is responsible for sending location updates at an appropriate
  interval; the platform enforces a minimum interval (rate limit) but does not
  control the app's polling frequency.
- "Active order" for linking purposes means an order in claimed, picked-up, or
  in-delivery status assigned to the courier — to be confirmed during planning.
- The maximum location update rate (minimum interval between accepted updates) is
  a configuration value determined during planning; this spec requires enforcement
  but does not fix the number.
- Distance calculation between consecutive points uses a standard spherical geometry
  formula; the specific algorithm is a planning-phase detail.
- Location data is not exposed to the courier themselves through this feature; it
  is operator-facing only.
- Movement history older than 90 days may be archived or deleted; permanent retention
  is out of scope.
