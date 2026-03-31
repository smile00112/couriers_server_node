# Quickstart & Integration Scenarios: Admin Panel

**Branch**: `009-admin-panel-refine` | **Date**: 2026-03-30

---

## Setup

```bash
# 1. Start the NestJS backend
cd D:\_WORK_\AI_first\couriers_backend
pnpm start:dev   # runs on http://localhost:3000

# 2. Start the admin panel dev server
cd admin
npm install
npm run dev      # runs on http://localhost:5173

# Environment variables (admin/.env)
VITE_API_URL=http://localhost:3000
```

## Staff Login (Owner/Manager/Operator)

The admin panel uses the same JWT issued by the NestJS backend for staff roles.
For development, obtain a token via any staff auth endpoint (or seed script):

```bash
# Seed a test owner + manager + order_operator if needed
pnpm seed:auth-test    # creates couriers; use similar seed for staff
```

**Login flow**:
1. Open http://localhost:5173 — redirected to `/login`
2. Enter email + password for an owner/manager/operator account
3. JWT stored in `localStorage.access_token`
4. Redirected to `/orders` (default section)

---

## Scenario 1 — View and Cancel an Order

```
1. Navigate to Orders section in sidebar
2. Table loads with paginated list (skeleton rows during fetch)
3. Click a row with status "in_delivery"
   → Right-side detail drawer opens (720px)
   → Shows: order number, client, courier, status, items, audit history
4. Click "Cancel Order" button inside drawer
   → Confirmation modal appears ("Cancel order #ORD-001?")
   → Confirm → POST /orders/:id/cancel fires
   → Toast: "Order cancelled successfully"
   → Table row updates status to "cancelled"
   → Drawer reflects new status
```

## Scenario 2 — Filter Orders by Status

```
1. In Orders section, locate the Status filter dropdown (inline above table)
2. Select "assigned"
3. Table reloads: only assigned orders visible
4. URL does NOT change (no navigation — filter is in-page state)
5. Clear filter → all orders reload
```

## Scenario 3 — View Courier Detail and Edit Profile

```
1. Navigate to Couriers section
2. Hover over a row → edit icon appears (right side)
3. Click row (anywhere) → detail drawer opens (720px)
   → Shows: name, phone, status, login, current position (lat/lng), current shift
4. Click Edit → form fields become editable within same drawer
5. Change status from "available" to "unavailable"
6. Click "Save" (pinned at drawer bottom)
   → PATCH /api/v1/couriers/:id fires
   → Toast: "Courier updated"
   → Table row reflects new status
7. Click X on drawer → drawer closes (no confirm needed, no edits pending)
```

## Scenario 4 — Courier with Unsaved Edits

```
1. Open courier drawer → click Edit
2. Type in "first_name" field (field becomes dirty)
3. Click X to close drawer
   → Confirmation dialog: "You have unsaved changes. Discard?"
   → Click "Discard" → drawer closes, changes lost
   → Click "Keep editing" → drawer stays open
```

## Scenario 5 — Create a New Staff User (Owner only)

```
1. Navigate to Users section
   → Table shows: name, email, role, created date
2. Click "Create User" button (top-right of table)
   → Right-side creation drawer opens (480px)
   → Fields: Name, Email, Role (dropdown: manager / order_operator), Password
3. Fill form → click Save
   → POST /api/v1/users fires
   → Toast: "User created"
   → New user appears in table
```

## Scenario 6 — Order Operator Cannot Manage Users

```
1. Log in as order_operator (email/password)
2. Navigate to Users section
   → Table visible, shows all users
   → "Create User" button is NOT present
   → Row action icons (edit, delete) are NOT present
   → Drawer opens in read-only mode on row click
```

## Scenario 7 — Browse Route History

```
1. Navigate to Route History section
2. Table loads: Courier Name | Order # | Date | Distance (m) | Points
3. Apply courier filter: select courier from dropdown
   → Table filters inline, shows only that courier's routes
4. Click a row
   → Detail drawer opens showing full coordinates list with timestamps
   → No map rendered — coordinates shown as text table
```

## Scenario 8 — Mobile / Narrow Screen

```
1. Open admin panel on 600px wide screen (or DevTools responsive mode)
2. Navigate to Orders section
3. Click a row
   → Drawer slides up from BOTTOM (bottom sheet mode)
   → All fields visible, scroll works
   → Save/Cancel pinned to bottom of sheet
```

## Scenario 9 — Session Expiry

```
1. Let JWT expire (or manually clear localStorage.access_token)
2. Attempt to navigate to any section
   → Redirected to /login
3. Log in again
   → Lands on /orders (default section), NOT on the previously open drawer
```

## Scenario 10 — Backend Error During Save

```
1. Open courier edit drawer, make changes
2. Simulate network error (DevTools → offline)
3. Click Save
   → Error toast: "Failed to update courier. Please try again."
   → Drawer remains open with entered data preserved
   → Form is not reset
```

---

## API Endpoints Called by Each Section

| Section | Endpoints Used |
|---------|---------------|
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` |
| Couriers | `GET /api/v1/couriers`, `GET /api/v1/couriers/:id`, `PATCH /api/v1/couriers/:id` |
| Users | `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/:id`, `DELETE /api/v1/users/:id` |
| Route History | `GET /api/v1/route-history`, `GET /orders/:id/route` |

---

## Acceptance Test Checklist

- [ ] Login with valid credentials → workspace loads, sidebar shows 4 sections
- [ ] Login with invalid credentials → error shown, stays on login screen
- [ ] Return visit within session → no re-auth required
- [ ] Orders table: skeleton rows on load, no spinners
- [ ] Orders table: click row → drawer opens without page navigation
- [ ] Orders: filter by status → results update inline
- [ ] Orders: cancel with confirmation modal → table updates
- [ ] Couriers: click row → drawer shows current GPS position
- [ ] Couriers: edit fields → save → table reflects change
- [ ] Couriers: unsaved edits → close → confirmation dialog appears
- [ ] Users: owner can create/edit/delete users
- [ ] Users: order_operator cannot see create/edit/delete controls
- [ ] Route History: filter by courier → inline results update
- [ ] Route History: detail drawer shows coordinate list (no map)
- [ ] Mobile (< 768px): drawers render as bottom sheets
- [ ] Error during save: error toast, drawer stays open with data
- [ ] Empty section: meaningful empty state with primary action button
