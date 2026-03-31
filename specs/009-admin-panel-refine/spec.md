# Feature Specification: Admin Panel

**Feature Branch**: `009-admin-panel-refine`
**Created**: 2026-03-30
**Status**: Draft
**Input**: Admin panel — single-page React + TypeScript + Ant Design + Refine.dev + React Query. Sidebar navigation (1 level, no sub-pages). All CRUD actions via drawers/modals — never navigate to a separate page. Entities: Orders, Couriers, Users, Route History.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Staff Logs In and Accesses the Admin Workspace (Priority: P1)

A staff member (owner, manager, or order operator) opens the admin panel and enters their credentials. After successful authentication, they land on the main workspace showing a sidebar with all available sections. Subsequent visits restore the session without re-entering credentials until the session expires.

**Why this priority**: Authentication is the entry gate to all other functionality. Nothing else works without it. All downstream stories depend on this story being complete.

**Independent Test**: Can be fully tested by entering valid credentials and confirming the workspace loads with sidebar navigation and the default section visible. Invalid credentials should be rejected with a clear error message.

**Acceptance Scenarios**:

1. **Given** a staff member with valid credentials, **When** they submit the login form, **Then** they are taken to the main workspace with the sidebar navigation visible and the default section (Orders) loaded.
2. **Given** a staff member who enters wrong credentials, **When** they submit the form, **Then** an error message is shown and they remain on the login screen.
3. **Given** a logged-in staff member, **When** they return to the admin panel in a new tab within the same session, **Then** they land directly in the workspace without re-authenticating.
4. **Given** a logged-in staff member, **When** their session expires, **Then** they are redirected to the login screen.

---

### User Story 2 — Staff Views and Manages Orders (Priority: P1)

A staff member navigates to the Orders section and sees a paginated, filterable table of all orders in their organisation. They can search by order ID or client, and filter by status. Clicking any row opens a right-side detail panel with the complete order record, including assigned courier, client info, and status history. From this panel, staff can update the order status. Deleting an order requires confirmation in a small window.

**Why this priority**: Orders are the core operational entity. Tracking and updating order status is the most time-critical daily task for operators.

**Independent Test**: Can be tested by loading the Orders section with existing data, verifying table columns, opening a row detail panel, changing an order's status, and confirming the change appears in the table — all without navigating away.

**Acceptance Scenarios**:

1. **Given** the Orders section is open, **When** the page loads, **Then** a paginated table shows orders with columns for ID, status, courier, client, address, and creation date.
2. **Given** the Orders table, **When** a status filter is applied, **Then** only orders matching that status appear; the filter control is inline on the page with no navigation.
3. **Given** the Orders table, **When** a row is clicked, **Then** a right-side detail panel slides in with the complete order record.
4. **Given** the order detail panel is open, **When** staff changes the order status and saves, **Then** the status updates and a success notification appears.
5. **Given** multiple orders are selected via checkboxes, **When** a bulk action is triggered, **Then** a confirmation window lists affected orders before the action runs.
6. **Given** an order deletion is initiated, **When** the confirmation window is confirmed, **Then** the order is removed and the table refreshes.

---

### User Story 3 — Staff Views and Manages Couriers (Priority: P1)

A staff member navigates to the Couriers section and sees a table of all couriers with their current status and key contact details. Clicking a courier row opens a detail panel showing their full profile, current GPS position, active shift state, and recent delivery stats. Staff can edit profile fields from within the panel. Status changes require a small confirmation window.

**Why this priority**: Courier management is the second most critical operational function — operators need to monitor courier availability and act quickly when issues arise.

**Independent Test**: Can be tested by opening the Couriers section, clicking a courier row to open the detail panel, editing a field, saving, and confirming the change is reflected in the table.

**Acceptance Scenarios**:

1. **Given** the Couriers section is open, **When** the page loads, **Then** a table shows couriers with name, phone, current status, and location availability.
2. **Given** a courier row is clicked, **When** the detail panel opens, **Then** the full profile with GPS coordinates, shift status, and recent activity is displayed.
3. **Given** the courier detail panel is open with edits made, **When** staff saves, **Then** the updated data is reflected in the panel and table; a success notification appears.
4. **Given** a courier status change is triggered, **When** a confirmation window appears and is confirmed, **Then** the status updates immediately.
5. **Given** the Couriers table, **When** staff types in the search field, **Then** results filter inline by courier name or phone number.

---

### User Story 4 — Staff Manages User Accounts (Priority: P2)

An owner can view all user accounts in their organisation, create new staff accounts, edit existing accounts, and delete accounts. All actions happen in sliding panels and confirmation windows. Managers and order operators can view the Users section in read-only mode but cannot create, edit, or delete accounts.

**Why this priority**: User management is important for onboarding but is less time-sensitive than order and courier operations. It is used infrequently compared to P1 stories.

**Independent Test**: Can be tested by opening the Users section as an owner, creating a new user via the creation panel, verifying the new user appears in the table, then editing their role. Separately, log in as a manager and confirm that create/edit/delete controls are absent.

**Acceptance Scenarios**:

1. **Given** any staff member is logged in, **When** they open the Users section, **Then** a table of all users with name, email, role, and creation date is shown.
2. **Given** the Users section, **When** an owner clicks "Create User", **Then** a right-side creation panel opens with fields for name, email, role, and password.
3. **Given** the creation form is filled and valid, **When** submitted, **Then** the new user appears in the table and a success notification is shown.
4. **Given** an owner clicks a user row, **When** the detail panel opens, **Then** name and role are editable; email is read-only.
5. **Given** a manager or order_operator is logged in, **When** they open the Users section, **Then** the table is visible but create/edit/delete controls are absent.
6. **Given** an owner initiates a user deletion, **When** confirmed in the confirmation window, **Then** the account is removed.

---

### User Story 5 — Staff Browses Courier Route History (Priority: P2)

A staff member can browse the recorded movement history of couriers. The Route History section shows a filterable log of position records linked to couriers and orders. Staff can filter by courier, by order, or by date range. Clicking a record shows a detail panel with the full path data and timestamps.

**Why this priority**: Route history is an audit and analytics tool. Valuable for resolving disputes and reviewing delivery performance but not time-critical for daily operations.

**Independent Test**: Can be tested by opening Route History, filtering by a specific courier, and confirming the log shows only that courier's records with correct timestamps and order links.

**Acceptance Scenarios**:

1. **Given** the Route History section is open, **When** the page loads, **Then** a paginated table is shown with courier name, order ID, recorded date, and a path summary.
2. **Given** the Route History table, **When** filters by courier or date range are applied, **Then** results update inline without navigation.
3. **Given** a route history row is clicked, **When** the detail panel opens, **Then** the full path coordinates and timestamps are visible.

---

### Edge Cases

- What happens when staff has unsaved form changes in an open panel and tries to close it? A confirmation dialog must appear before the panel closes and changes are discarded.
- What if the backend returns an error during a save operation? An error notification appears with a human-readable message; the panel remains open with entered data preserved.
- What if a table section has no records? Each section shows a meaningful empty state with an explanatory message and a primary action button (e.g., "Create first courier").
- What if the screen is narrower than 768px? Sliding panels render as bottom sheets; all functionality remains accessible.
- What if a bulk action is triggered with no rows selected? The bulk action control is disabled until at least one row is checked.
- What if a staff member's session expires while a panel is open? They are redirected to login; on return, they land on the same section (not the panel).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Staff MUST be able to log in with their existing credentials (email/password) and access the admin workspace.
- **FR-002**: The workspace MUST present a sidebar navigation with links to four sections: Orders, Couriers, Users, Route History.
- **FR-003**: Each section MUST display its data in a paginated, sortable table with inline search and filter controls.
- **FR-004**: Clicking any table row MUST open a right-side detail panel without navigating to a new page.
- **FR-005**: All create and edit operations MUST be performed inside a sliding panel — the background table MUST remain visible.
- **FR-006**: Delete operations and status changes MUST require confirmation in a small confirmation window before executing.
- **FR-007**: Bulk actions on selected rows MUST display a confirmation window listing affected records before the action runs.
- **FR-008**: All data mutations (create, edit, delete, status change) MUST produce a toast notification confirming success or describing the error.
- **FR-009**: Tables MUST display skeleton placeholder rows during initial data loading; spinner overlays MUST NOT be used.
- **FR-010**: Row-level action icons (edit, delete) MUST be hidden by default and appear only when the cursor hovers over that row.
- **FR-011**: On screens narrower than 768px, sliding panels MUST render as bottom sheets.
- **FR-012**: A sliding panel with unsaved form changes MUST show a discard-changes confirmation dialog before closing.
- **FR-013**: Owners have full access to all sections including user account management. Managers have full access to Orders, Couriers, and Route History, and read-only access to the Users section. Order operators have read-only access to the Users section only.
- **FR-014**: All API calls MUST include the authenticated user's session token; unauthenticated requests MUST redirect to the login screen.
- **FR-015**: Each section MUST show a meaningful empty state (message and primary action button) when no records exist.

### Key Entities

- **Order**: A delivery job with status, linked courier, client, delivery address, and creation date. The primary action is status change.
- **Courier**: A delivery person with name, phone, operational status, current GPS position, and shift state. Profile fields are editable; GPS position is read-only.
- **User (Staff Account)**: A staff member with name, email, role (owner, manager, order_operator), and account creation date. Role is the primary editable field.
- **Route History Entry**: A recorded courier movement log linked to a courier and an order, containing a sequence of position coordinates and a recorded timestamp. Entirely read-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can locate any specific order using search or filters and open its detail panel in under 10 seconds.
- **SC-002**: Zero full-page navigations occur during any CRUD operation — all actions complete within the current section view, verifiable by browser navigation history.
- **SC-003**: Staff can complete a full order workflow (find → view details → update status) in under 60 seconds from landing on the Orders section.
- **SC-004**: All table sections load and display initial data within 3 seconds on a standard broadband connection.
- **SC-005**: The admin panel is fully functional on screens 768px wide and above; panels render as bottom sheets on smaller screens with no loss of functionality.
- **SC-006**: Order operators are blocked from creating, editing, or deleting user accounts in 100% of attempts.

## Assumptions

- The existing NestJS backend exposes REST endpoints for all four entities (Orders, Couriers, Users, Route History) that the admin panel will consume.
- Authentication uses the existing JWT-based auth system already implemented in the backend — no new auth backend work is needed.
- The admin panel is a standalone web application living in an `admin/` directory at the repository root, with its own `package.json` and build process, deployed independently of the NestJS backend.
- Real-time live updates (e.g., auto-refreshing courier positions) are out of scope for this version — staff refreshes data manually.
- Map visualisation (interactive map rendering of route paths) is out of scope; route history is displayed as coordinate data in text form.
- Export to CSV or PDF for any entity list is out of scope for this version.
- The admin panel targets modern desktop and tablet browsers (Chrome, Firefox, Safari, Edge). Internet Explorer and legacy browsers are not supported.
- Currency formatting, date localisation, and number formatting are client-side concerns; the backend returns raw numeric and ISO date values.
