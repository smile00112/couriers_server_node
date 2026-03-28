# Feature Specification: Order Ingestion

**Feature Branch**: `002-order-ingestion`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "order-ingestion"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Operator Creates an Order Manually (Priority: P1)

An operator opens the dashboard, fills in the order form (addresses, client phone,
items), submits it, and the order immediately appears in the active orders list and
becomes visible to available couriers.

**Why this priority**: Manual order creation is the core ingestion path. Without it,
the system has no orders to work with. All other features (lifecycle, tracking, payouts)
depend on orders existing.

**Independent Test**: Can be fully tested by submitting a valid order form and confirming
the order appears in the list and a courier receives a notification. Delivers a working
order creation flow independently.

**Acceptance Scenarios**:

1. **Given** an authenticated Operator, **When** they submit a valid order with addresses,
   coordinates, client phone, and at least one item, **Then** the order is created with
   status "available for pickup" and confirmation is shown immediately.
2. **Given** a client phone that exists in the tenant, **When** an order is submitted with
   that phone, **Then** the order is linked to the existing client record (no duplicate created).
3. **Given** a client phone that does not yet exist, **When** an order is submitted, **Then**
   a new client record is created and linked to the order.
4. **Given** an order is successfully created, **When** online couriers are present in the
   same tenant, **Then** they receive a notification about the new order without the operator
   taking any additional action.
5. **Given** an order with an order number that already exists in the tenant, **When** submitted,
   **Then** the system rejects it and informs the operator with a clear message.

---

### User Story 2 — External System Pushes an Order (Priority: P1)

A third-party system (e-commerce platform, delivery aggregator) sends an order to the
courier service via API. The order enters the system the same way as a manually created
one, and couriers are notified automatically.

**Why this priority**: External ingestion is equally critical to manual creation for
tenants that receive orders from partner platforms. Shares the same order creation path.

**Independent Test**: Can be tested by sending a valid API request from a test external
client and confirming the order appears in the operator dashboard and couriers are notified.

**Acceptance Scenarios**:

1. **Given** an external system sends a valid order payload with a callback URL, **When**
   the request is processed, **Then** the order is created and the callback URL is stored
   for future lifecycle notifications.
2. **Given** an external system sends the same order number twice, **When** the second
   request arrives, **Then** it is rejected with a clear duplicate error; no second order
   is created.
3. **Given** an external system sends an order with missing required fields, **When** the
   request is processed, **Then** it is rejected with a descriptive validation error.

---

### User Story 3 — Manager Reviews Newly Created Orders (Priority: P2)

A Manager opens the orders list immediately after orders are ingested and sees all new
orders with their details — without refreshing the page.

**Why this priority**: Real-time visibility for the operations team is essential for
fast dispatch. Builds on Story 1 and 2 (orders must exist first).

**Independent Test**: Can be tested by creating an order in one browser tab while a
Manager is viewing the orders list in another — the new order must appear automatically.

**Acceptance Scenarios**:

1. **Given** a Manager is viewing the orders list, **When** a new order is created by
   an Operator or external source, **Then** the order appears in the Manager's view
   without a manual page refresh.

---

### Edge Cases

- What if the order creation request succeeds but the courier notification fails?
  → Order is still created and saved. Notification failure is logged but does not
  roll back the order. The operator can always view and manually dispatch the order.
- What if two Operators submit orders with the same order number simultaneously?
  → Exactly one succeeds; the other receives a duplicate error. No partial duplicates.
- What if the coordinates provided are technically valid numbers but geographically
  unreasonable (e.g., in the ocean)? → Coordinates are stored as-is. Geographic
  validation is out of scope for ingestion; it is the operator's responsibility.
- What if the order has no items? → Rejected with a validation error — at least one
  item is required.
- What if the external callback URL is unreachable at order creation time?
  → The URL is stored without validation. Reachability is only relevant during
  lifecycle callbacks, not at ingestion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated Operators, Managers, and Owners to create
  orders by providing delivery addresses, coordinates, client phone number, and at least
  one item.
- **FR-002**: System MUST resolve an existing client by phone number within the tenant
  before creating a new client record; duplicate client records for the same phone MUST
  NOT be created within a tenant.
- **FR-003**: System MUST create the order and all its line items as a single all-or-nothing
  operation; partial order creation MUST NOT occur.
- **FR-004**: Order numbers MUST be unique within a tenant; submitting a duplicate order
  number MUST be rejected with a clear error identifying the existing order.
- **FR-005**: System MUST accept an optional external callback URL and store it with the
  order for use during future lifecycle events.
- **FR-006**: System MUST assign an initial delivery fee (courier award) to each order
  based on the tenant's configured pricing rules.
- **FR-007**: System MUST record a creation audit entry for each successfully created order,
  capturing who created it and when.
- **FR-008**: System MUST notify available couriers in the same tenant about the new order
  without requiring any additional action from the operator.
- **FR-009**: System MUST make the new order immediately visible to operators and managers
  viewing the orders list, without requiring a manual refresh.
- **FR-010**: Courier role MUST NOT be permitted to create orders.
- **FR-011**: System MUST validate all required fields and reject requests with missing or
  invalid data, providing a clear description of each validation error.
- **FR-012**: The tenant context of the creating user MUST determine which tenant the order
  belongs to; it MUST NOT be overridable by the request payload.

### Key Entities

- **Order**: The central record — captures pickup and dropoff addresses with coordinates,
  order number, initial status, delivery fee, optional callback URL, and creation metadata.
- **Client**: The end recipient — identified by phone number within the tenant; created
  automatically if not found.
- **Order Item**: A line item within an order — has a name, quantity, and price. At least
  one is required per order.
- **Creation Audit Entry**: A record of the order creation event — captures the creating
  user, timestamp, and action type for traceability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can complete the manual order creation form and see the confirmed
  order in the list within 5 seconds of submission under normal conditions.
- **SC-002**: A duplicate order number is rejected 100% of the time; no duplicate orders
  are created within a tenant.
- **SC-003**: Available couriers receive notification of a new order within 3 seconds of
  the order being created.
- **SC-004**: The order list updates automatically for all logged-in operators and managers
  within 3 seconds of a new order being created, without a page refresh.
- **SC-005**: An order submitted with missing required fields is rejected 100% of the time
  with a specific, actionable error message identifying each invalid field.
- **SC-006**: An external system submitting the same order twice receives a duplicate error
  on the second attempt; exactly one order exists in the system.

## Assumptions

- Courier authentication (feature 001) is a prerequisite; couriers must be authenticated
  to receive order notifications.
- The pricing/award formula for the initial delivery fee is configured per tenant by the
  Owner or Administrator; this feature stores and applies the result but does not define
  the formula itself.
- Coordinates (latitude/longitude) are provided by the caller; the system stores them
  without geocoding or reverse-geocoding.
- An "available courier" for notification purposes means a courier who is logged in and
  has an open work shift in the same tenant.
- External systems authenticate using the same JWT mechanism as internal users, with a
  role that permits order creation (Operator or above).
- Order item prices are informational and do not trigger payment processing; payment is
  handled separately via the courier wallet/payout feature.
- The order number format is not enforced by the system — any non-empty string unique
  within the tenant is valid.
