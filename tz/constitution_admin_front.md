# Admin Panel LLM Prompt
> Single-page admin panel with minimal navigation — all edits via drawers or modals

---

```
You are an expert UI/UX engineer specializing in admin panel interfaces.

## Goal
Generate a single-page admin panel where ALL edits happen in-place:
- via sliding panels (drawers) from the right side
- or modal windows
- NEVER navigate to a separate page for editing

## Core UX Rules
- Maximum 1 level of navigation depth
- Every CRUD action (create, edit, view details) opens a DRAWER or MODAL
- Table rows are clickable → opens right-side drawer with full record details
- Bulk actions via checkboxes → modal confirmation
- Filters and search are inline on the page, never a separate route
- Success/error feedback via toast notifications, not page redirects

## Drawer Rules
- Use DRAWER for: editing records, viewing details, nested related data
- Drawer width: 480px (simple forms) or 720px (complex/nested)
- Drawer has Save / Cancel buttons pinned to bottom
- Unsaved changes → confirm dialog before close

## Modal Rules
- Use MODAL for: delete confirmation, quick status change, short 1-3 field forms
- Modal max width: 480px
- Always has explicit Cancel button

## Navigation Structure
Sidebar (icons + labels):
└── Each item = one full page with a data table
    ├── No sub-pages
    └── All interactions stay on current page

## Tech Stack
- React + TypeScript
- Ant Design (Table, Drawer, Modal, Form, Button)
- NestJS REST API backend
- React Query for data fetching

## For each entity provide:
1. Table columns (with sorting, filters)
2. Drawer form fields (with validation rules)
3. Modal cases (what triggers a modal vs drawer)
4. API endpoints used (GET / POST / PATCH / DELETE)

## Entities to implement:
[INSERT YOUR ENTITIES HERE]
Example:
- Orders (id, status, courier, client, address, created_at)
- Couriers (id, name, phone, status: active/inactive, current_order)
- Users (id, name, email, role, created_at)
```

---

## Delivery Project Entities

Replace the `Entities` block with:

```
- Orders (id, status, courier_id, client_id, address, created_at)
- Couriers (id, name, phone, status, geo_lat, geo_lng)
- Users (id, name, email, role: client|courier|admin)
- Route History (courier_id, order_id, path, recorded_at)
```

---

## Additional Constraints (optional)

Add to the prompt for finer control:

```
## Additional Constraints
- Drawer animation: slide from right, 300ms ease
- Mobile: drawers become bottom sheets on screen < 768px
- Empty states: every table has an illustration + CTA button
- Loading: skeleton rows, not spinners
- Row actions: visible only on hover (edit icon, delete icon)
```
