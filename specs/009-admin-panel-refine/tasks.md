# Tasks: Admin Panel (Refine.dev)

**Input**: Design documents from `specs/009-admin-panel-refine/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api-contracts.md ✓, quickstart.md ✓

**Organization**: Tasks are grouped by user story. Backend endpoint additions are placed
in the phase of the user story that requires them.

**Remediation applied** (2026-03-30):
- C1: Added staff_users migration + entity tasks (T034, T035)
- C2: Added bulk action tasks for FR-007 (T020, T021, T022)
- H1: Tasks reflect owner-only create/delete; constitution-compliant roles
- H2: Added CourierStatusModal task (T028) for FR-006 courier status confirmation
- H3: Column sorting added to all table page tasks (T017, T030, T042, T050)
- M2–M5: Minor task description fixes throughout

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `admin/` standalone Vite project and configure the development environment.

- [x] T001 Create `admin/` directory at repo root with `npm create vite@latest admin -- --template react-ts`
- [x] T002 Install Refine.dev packages in `admin/`: `@refinedev/core @refinedev/antd @refinedev/react-router @refinedev/simple-rest`
- [x] T003 [P] Install UI and data packages in `admin/`: `antd @ant-design/icons react-router axios @tanstack/react-query`
- [x] T004 Configure `admin/vite.config.ts` with `@` path alias pointing to `admin/src`
- [x] T005 [P] Configure `admin/tsconfig.json` with strict mode, path aliases `@/*: ["src/*"]`
- [x] T006 [P] Create `admin/.env.example` with `VITE_API_URL=http://localhost:3000` and add `admin/.env.local` to `.gitignore`
- [x] T007 [P] Clean up Vite template boilerplate: remove default `App.css`, `index.css` content, and `assets/react.svg`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Frontend infrastructure shared by ALL user stories. No user story can function without this.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [x] T008 Create `admin/src/dataProvider.ts`: axios instance with (a) request interceptor injecting `Authorization: Bearer <token>` from `localStorage.access_token`, (b) response interceptor mapping 401 → `authProvider.logout()`, 403/404/409/422/500 → human-readable error messages per `contracts/api-contracts.md` error convention; wrap with `@refinedev/simple-rest` provider pointing at `VITE_API_URL`; override `getList` to map `{ data, meta }` → `{ data, total: meta.total }`
- [x] T009 Create `admin/src/authProvider.ts`: implement `login()` (POST to login endpoint, store JWT in `localStorage.access_token`), `logout()` (clear storage, redirect `/login`), `check()` (verify token present), `getIdentity()` (decode JWT payload → `{ id, name, role, owner_id }`), `onError()` (401 → logout)
- [x] T010 Create `admin/src/components/AppLayout.tsx`: `ThemedLayoutV2` wrapper with custom `Sider` listing 4 resources (Orders, Couriers, Users, Route History) using Ant Design `Menu`
- [x] T011 Create `admin/src/App.tsx`: `<Refine>` root with `authProvider`, `dataProvider`, `routerProvider` (from `@refinedev/react-router`), `notificationProvider` (from `@refinedev/antd`), and 4 resources: `orders`, `couriers`, `users`, `route-history`; wrap with `<App>` from `antd` and `<BrowserRouter>`
- [x] T012 [P] Create `admin/src/components/ConfirmModal.tsx`: reusable Ant Design `Modal.confirm` wrapper accepting `title`, `content`, `onConfirm`, `onCancel` props; used for delete and status-change confirmations
- [x] T013 Update `admin/src/main.tsx`: remove Vite boilerplate, render `<App />` from `admin/src/App.tsx` wrapped in `<React.StrictMode>`

**Checkpoint**: `npm run dev` in `admin/` starts the Vite server; navigating to `/` redirects to `/login`; auth provider resolves.

---

## Phase 3: User Story 1 — Staff Logs In and Accesses the Admin Workspace (P1) 🎯 MVP

**Goal**: Staff member can log in with email/password, land on the main workspace with sidebar, and have their session restored on return.

**Independent Test**: Enter valid owner/manager credentials → workspace loads with sidebar and Orders section visible. Invalid credentials show an error and stay on login. Return visit (token in localStorage) skips login screen.

- [x] T014 [US1] Create `admin/src/pages/login/LoginPage.tsx`: Ant Design `Form` with Email and Password fields, submit calls `authProvider.login()`, shows error message on 401 response
- [x] T015 [US1] Register login route in `admin/src/App.tsx`: add `<Route path="/login" element={<LoginPage />} />` and `<Authenticated>` guard wrapping resource routes so unauthenticated users redirect to `/login`
- [x] T016 [US1] Add default redirect in `admin/src/App.tsx`: unauthenticated root `/` → `/login`; authenticated root `/` → `/orders`

**Checkpoint**: US1 fully testable — login/logout cycle, session persistence, sidebar visible after auth.

---

## Phase 4: User Story 2 — Staff Views and Manages Orders (P1)

**Goal**: Staff can view a paginated, sortable, filterable Orders table; open an order detail drawer; cancel an order with confirmation; and perform bulk actions on selected rows with a confirmation listing affected orders.

**Independent Test**: Load `/orders` → skeleton rows → table populates with sortable columns. Apply status filter → inline results update. Click row → detail drawer opens. Cancel order → confirmation modal → success toast → table refreshes. Select multiple rows → bulk action confirmation shows list of affected orders. No page navigation occurs at any step.

**Backend**: Existing endpoints (`GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`) — no backend work needed.

- [x] T017 [US2] Create `admin/src/pages/orders/OrdersPage.tsx`: `useTable` hook from `@refinedev/antd` with server-side pagination; columns: Order # (with `sorter: true`), Status (`<Tag>`, with `sorter: true`), Client Phone, Courier Name, Pickup Address, Created At (with `sorter: true`); inline Status filter `<Select>` + search `<Input>` (by order number or client phone) above table calling `setFilters()`; `loading={tableProps.loading}` for skeleton rows; row click sets `selectedOrderId` state; `rowSelection` prop on `<Table>` for checkbox multi-select (tracks `selectedRowKeys` state)
- [x] T018 [US2] Create `admin/src/pages/orders/OrderDrawer.tsx`: Ant Design `<Drawer>` (width 720, `placement` from `useBreakpoint`); uses `useShow({ resource: 'orders', id: selectedOrderId })` to fetch detail; sections: Order Info, Items table, Courier info, Lifecycle timestamps, Audit log entries; "Cancel Order" button visible when status is non-terminal
- [x] T019 [US2] Create `admin/src/pages/orders/CancelOrderModal.tsx`: Ant Design `Modal` (width 480); optional reason `<Input.TextArea>`; confirm triggers `useCustomMutation` → `POST /orders/:id/cancel`; on success: `invalidate(['orders'])`, close modal + drawer, success toast; on error: error toast, modal stays open
- [x] T020 [US2] Create `admin/src/pages/orders/BulkActionBar.tsx`: shown when `selectedRowKeys.length > 0`; displays "X orders selected" count; contains "Cancel Selected" button; on click opens `BulkConfirmModal` passing the selected order IDs
- [x] T021 [US2] Create `admin/src/pages/orders/BulkConfirmModal.tsx`: Ant Design `Modal` (width 480); lists all affected order numbers in a scrollable preview; confirm triggers sequential `useCustomMutation` calls for each selected order ID → `POST /orders/:id/cancel`; on all complete: `invalidate(['orders'])`, clear selection, success toast with count; on any error: partial-success toast listing failed IDs
- [x] T022 [US2] Wire `BulkActionBar` into `OrdersPage.tsx`: render `<BulkActionBar>` above the table (below filter row); pass `selectedRowKeys` and `onClearSelection` callback; `BulkConfirmModal` clears selection on close
- [x] T023 [US2] Register Orders routes in `admin/src/App.tsx`: add `list: '/orders'` and `show: '/orders/:id'` to the `orders` resource; add `<Route>` entries pointing to `OrdersPage`
- [x] T024 [P] [US2] Create `admin/src/pages/orders/index.ts`: barrel export for `OrdersPage`, `OrderDrawer`, `CancelOrderModal`, `BulkActionBar`, `BulkConfirmModal`

**Checkpoint**: US2 fully testable — orders table with sorting, search + filter, detail drawer, cancel with modal, bulk cancel with confirmation, all without page navigation.

---

## Phase 5: User Story 3 — Staff Views and Manages Couriers (P1)

**Goal**: Staff can view couriers table, open courier detail (with GPS position and shift state), edit editable profile fields, and confirm status changes via a dedicated modal.

**Independent Test**: Load `/couriers` → table shows courier list with sortable columns. Click row → detail drawer shows profile + GPS + shift info. Edit first_name, save → table row updates. Change status → confirmation modal appears. Unsaved edits + close → discard-changes confirmation dialog.

### Backend Tasks (US3)

- [x] T025 [US3] Create `src/couriers/couriers-admin.service.ts` (new file): `findAll(ownerId, page, limit, search)` → paginated courier list (search matches first_name, last_name, or phone); `findOne(ownerId, courierId)` → courier detail with latest `CourierPosition` row and current open `CourierShift`; `update(ownerId, courierId, dto)` → PATCH editable fields; all queries scoped by `ownerId`
- [x] T026 [US3] Create `src/couriers/dto/update-courier.dto.ts`: `UpdateCourierDto` with optional `first_name`, `last_name`, `phone`, `status`, `login`, `telegram_chat_id`; class-validator decorators; `@ApiProperty` Swagger decorators
- [x] T027 [US3] Create `src/couriers/dto/courier-admin-response.dto.ts`: `CourierAdminListItemDto` and `CourierAdminDetailDto` (extends list item, adds `current_position: { lat, lng, recorded_at }`, `current_shift: { id, status, started_at, elapsed_minutes } | null`); `PaginatedCouriersDto` wrapper
- [x] T028 [US3] Create `admin/src/pages/couriers/CourierStatusModal.tsx`: Ant Design `Modal` (width 480); shows "Change courier status to [new status]?"; confirm triggers `useCustomMutation` → `PATCH /api/v1/couriers/:id` with `{ status }` payload; on success: `invalidate(['couriers'])`, close modal, success toast; on error: error toast, modal stays open (satisfies FR-006 for courier status changes)
- [x] T029 [US3] Create `src/couriers/couriers-admin.controller.ts`: `@Controller('api/v1/couriers')` with `@ApiTags('couriers-admin')` and `@ApiBearerAuth()`; `GET /` (`@Roles(OWNER, MANAGER, ORDER_OPERATOR)`), `GET /:id` (`@Roles(OWNER, MANAGER, ORDER_OPERATOR)`), `PATCH /:id` (`@Roles(OWNER, MANAGER)`); all guarded with `@UseGuards(JwtAuthGuard, RolesGuard)`; register in `src/couriers/couriers.module.ts`

### Frontend Tasks (US3)

- [x] T030 [US3] Create `admin/src/pages/couriers/CouriersPage.tsx`: `useTable` with `syncWithLocation`; columns: Name (with `sorter: true`), Phone, Status (`<Tag>`, with `sorter: true`), Login, Created At (with `sorter: true`); `loading={tableProps.loading}` for skeleton rows; search `<Input>` above table calling `setFilters([{ field: 'search', value, operator: 'contains' }])`; row-hover action icons (edit icon opens drawer in edit mode) via CSS `opacity: 0 → 1` on `tr:hover .row-actions`
- [x] T031 [US3] Create `admin/src/pages/couriers/CourierDrawer.tsx`: `<Drawer>` (width 720); view mode shows full profile, `current_position` as lat/lng text, `current_shift` open/closed badge; edit mode uses `useDrawerForm` with `action="edit"`; status field change in edit mode opens `<CourierStatusModal>` instead of saving directly (FR-006); unsaved-changes guard: `onClose` checks `form.isFieldsTouched()` → `Modal.confirm` before closing (FR-012); Save/Cancel buttons pinned at drawer footer
- [x] T032 [US3] Register Couriers routes in `admin/src/App.tsx`: add `list: '/couriers'` and `edit: '/couriers/:id/edit'` to `couriers` resource; add `<Route>` entries
- [x] T033 [P] [US3] Create `admin/src/pages/couriers/index.ts`: barrel export for `CouriersPage`, `CourierDrawer`, `CourierStatusModal`

**Checkpoint**: US3 fully testable — courier table with sorting/search, detail with GPS/shift, edit with dirty-check guard, status change with confirmation modal, backend CRUD endpoints accessible.

---

## Phase 6: User Story 4 — Staff Manages User Accounts (P2)

**Goal**: Owners can fully manage staff accounts (create, edit, delete). Managers and order operators see the table in read-only mode with no create/edit/delete controls.

**Independent Test**: Login as owner → Users table → click "Create User" → creation drawer → fill form → save → new user in table. Login as manager → Users section → table visible, no Create button, no row edit/delete icons.

### Backend Tasks (US4)

- [x] T034 [US4] Create database migration `database/migrations/021_create_staff_users.ts`: table `staff_users` with columns `id UUID PK`, `owner_id UUID FK(owners.id)`, `name VARCHAR(255)`, `email VARCHAR(255) UNIQUE`, `role ENUM('owner','manager','order_operator')`, `password_hash VARCHAR(255)`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`; index on `(owner_id, created_at DESC)`
- [x] T035 [US4] Create `src/users/entities/staff-user.entity.ts`: TypeORM `@Entity('staff_users')` with all columns from migration; `@ManyToOne(() => Owner)` relation on `owner_id`; `password_hash` has `select: false`
- [x] T036 [US4] Create `src/users/users.service.ts`: `findAll(ownerId, page, limit)` → paginated staff users scoped to tenant; `create(ownerId, dto)` → new staff user with `bcrypt.hash(password)` stored in `password_hash`; `update(ownerId, userId, dto)` → update name and/or role; `remove(ownerId, userId)` → delete (throw 403 if `userId === requesterId`); all queries scoped by `ownerId`
- [x] T037 [US4] Create `src/users/dto/create-user.dto.ts`: `CreateUserDto` with `name` (string), `email` (IsEmail), `role` (IsIn(['manager','order_operator'])), `password` (MinLength(8)); class-validator + `@ApiProperty` decorators
- [x] T038 [P] [US4] Create `src/users/dto/update-user.dto.ts`: `UpdateUserDto` with optional `name`, `role` (IsIn(['manager','order_operator']))
- [x] T039 [P] [US4] Create `src/users/dto/user-response.dto.ts`: `UserResponseDto` with `id`, `name`, `email`, `role`, `created_at`; `PaginatedUsersDto` wrapper
- [x] T040 [US4] Create `src/users/users.controller.ts`: `@Controller('api/v1/users')` with `@ApiTags('users-admin')` and `@ApiBearerAuth()`; `GET /` (`@Roles(OWNER, MANAGER, ORDER_OPERATOR)`), `POST /` (`@Roles(OWNER)`), `PATCH /:id` (`@Roles(OWNER)`), `DELETE /:id` (`@Roles(OWNER)`); all with `@UseGuards(JwtAuthGuard, RolesGuard)`
- [x] T041 [US4] Create `src/users/users.module.ts`: `TypeOrmModule.forFeature([StaffUser])`, `forwardRef(() => AuthModule)`, export `UsersService`; import `UsersModule` in `src/app.module.ts`

### Frontend Tasks (US4)

- [x] T042 [US4] Create `admin/src/pages/users/UsersPage.tsx`: `useTable`; columns: Name (with `sorter: true`), Email, Role (`<Tag>`, with `sorter: true`), Created At (with `sorter: true`); `loading={tableProps.loading}` for skeleton rows; "Create User" button shown only if `identity.role === 'owner'`; row action icons (edit, delete on hover) shown only if `identity.role === 'owner'`; delete icon → `<ConfirmModal>` → `DELETE /api/v1/users/:id`
- [x] T043 [US4] Create `admin/src/pages/users/CreateUserDrawer.tsx`: `<Drawer>` (width 480); `useDrawerForm({ action: 'create', resource: 'users' })`; fields: Name, Email, Role (`<Select>` with manager/order_operator options), Password; `onClose` checks `form.isFieldsTouched()` → `Modal.confirm` before closing (FR-012); Save/Cancel pinned at footer
- [x] T044 [US4] Create `admin/src/pages/users/UserDrawer.tsx`: `<Drawer>` (width 480); `useDrawerForm({ action: 'edit', resource: 'users' })`; editable: Name, Role (shown only if `identity.role === 'owner'`); read-only: Email (disabled input), Created At; unsaved-changes guard: `onClose` checks `form.isFieldsTouched()` → `Modal.confirm` before closing
- [x] T045 [US4] Register Users routes in `admin/src/App.tsx`: add `list: '/users'`, `create: '/users/create'`, `edit: '/users/:id/edit'` to `users` resource; add `<Route>` entries
- [x] T046 [P] [US4] Create `admin/src/pages/users/index.ts`: barrel export for `UsersPage`, `CreateUserDrawer`, `UserDrawer`

**Checkpoint**: US4 fully testable — owner CRUD on users; manager/order_operator read-only table; staff_users migration applied.

---

## Phase 7: User Story 5 — Staff Browses Courier Route History (P2)

**Goal**: Staff can view a paginated, filterable log of delivery routes, filter by courier/order/date, and inspect full coordinate path in a detail drawer.

**Independent Test**: Load `/route-history` → table populates with sortable columns. Apply courier filter → results update inline. Click row → detail drawer shows coordinate list with timestamps.

### Backend Tasks (US5)

- [x] T047 [US5] Add `getRouteHistoryList(ownerId, page, limit, filters)` method to `src/couriers/courier-tracking.service.ts`: query `courier_location_history` JOINing `orders` and `couriers`, grouped by `(order_id, courier_id)` with `COUNT(*) as point_count`, `MIN(recorded_at) as recorded_date`, `SUM(distance_meters) as total_distance_meters`; derive `courier_name` and `order_number` from joins; support filter params `courier_id`, `order_id`, `from`/`to` date range; return paginated `{ data, meta }`; scope by `ownerId`
- [x] T048 [US5] Add `GET /api/v1/route-history` endpoint to `src/couriers/courier-tracking.controller.ts`: query params `page`, `limit`, `courier_id`, `order_id`, `from`, `to`; `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`; `@UseGuards(JwtAuthGuard, RolesGuard)`; `@ApiTags('courier-tracking')` and `@ApiBearerAuth()`; `@ApiOkResponse({ type: PaginatedRouteHistoryDto })`; return `RouteHistoryListItemDto[]` in paginated wrapper
- [x] T049 [P] [US5] Create `src/couriers/dto/route-history-list.dto.ts`: `RouteHistoryListItemDto` with `order_id`, `courier_id`, `courier_name`, `order_number`, `total_distance_meters`, `recorded_date`, `point_count`; `PaginatedRouteHistoryDto` wrapper with `data` and `meta`

### Frontend Tasks (US5)

- [x] T050 [US5] Create `admin/src/pages/route-history/RouteHistoryPage.tsx`: `useTable` with resource `route-history`; columns: Courier Name (with `sorter: true`), Order #, Date (with `sorter: true`), Distance (m), Points; `loading={tableProps.loading}` for skeleton rows; inline filters: Courier `<Select>` (populated via `useSelect({ resource: 'couriers' })`), Date range `<DatePicker.RangePicker>`; filters call `setFilters()`; row click sets `selectedRouteOrderId` state
- [x] T051 [US5] Create `admin/src/pages/route-history/RouteHistoryDrawer.tsx`: `<Drawer>` (width 720); on open, fetches `GET /orders/:id/route` via `useCustom({ url: \`/orders/${id}/route\`, method: 'get' })`; displays points as Ant Design `<Table>` with columns: #, Lat, Lng, Distance (m), Recorded At; `loading` prop shows skeleton; no map rendering (text coordinates only per spec Assumptions)
- [x] T052 [US5] Register Route History routes in `admin/src/App.tsx`: add `list: '/route-history'` and `show: '/route-history/:id'` to `route-history` resource; add `<Route>` entries
- [x] T053 [P] [US5] Create `admin/src/pages/route-history/index.ts`: barrel export for `RouteHistoryPage`, `RouteHistoryDrawer`

**Checkpoint**: US5 fully testable — route history table with sorting/filters, coordinate detail drawer, backend list endpoint operational.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Mobile layout, empty states, and final production readiness.

- [x] T054 Add `useBreakpoint` hook from `antd` to all Drawer components (`OrderDrawer`, `CourierDrawer`, `CourierStatusModal`, `UserDrawer`, `CreateUserDrawer`, `RouteHistoryDrawer`): set `placement={screens.xs ? 'bottom' : 'right'}` so drawers render as bottom sheets on screens < 768px (FR-011)
- [x] T055 [P] Add empty state to each Page component (`OrdersPage`, `CouriersPage`, `UsersPage`, `RouteHistoryPage`): when `tableProps.dataSource?.length === 0 && !tableProps.loading`, render Ant Design `<Empty description="No [entity] found">` with a primary action button (e.g., "Create first user" → opens `CreateUserDrawer`); satisfies FR-015
- [x] T056 [P] Verify and add missing Swagger decorators on all new backend controllers: `src/couriers/couriers-admin.controller.ts` (add `@ApiOkResponse` per endpoint), `src/users/users.controller.ts` (add `@ApiCreatedResponse`, `@ApiOkResponse`, `@ApiNoContentResponse`), route-history endpoint in `src/couriers/courier-tracking.controller.ts` (add `@ApiOkResponse({ type: PaginatedRouteHistoryDto })`)
- [ ] T057 Run quickstart.md acceptance checklist manually: verify all 20 checklist items pass against the running admin panel; document any deviations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 — Login (Phase 3)**: Depends on Phase 2 only
- **US2 — Orders (Phase 4)**: Depends on Phase 2; backend already exists — can start after Phase 2
- **US3 — Couriers (Phase 5)**: Depends on Phase 2; backend T025–T029 must complete before frontend T030–T033
- **US4 — Users (Phase 6)**: Depends on Phase 2; migration T034 + entity T035 must complete before service T036
- **US5 — Route History (Phase 7)**: Depends on Phase 2; backend T047–T049 must complete before frontend T050–T053
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — independent
- **US2 (P1)**: Can start after Phase 2 — independent (uses existing backend)
- **US3 (P1)**: Can start after Phase 2 — backend-first within the phase
- **US4 (P2)**: T034 (migration) → T035 (entity) → T036 (service) → T037–T041 (dto/controller/module) → T042–T046 (frontend)
- **US5 (P2)**: Can start after Phase 2 — backend-first within the phase

### Within Each User Story

- Backend tasks (migration → entity → service → dto → controller → module) before frontend tasks
- Page component before Drawer/Modal components (they are rendered from Page)
- Route registration last (after components exist)

### Parallel Opportunities

- T003, T005, T006, T007 (Phase 1 setup): all parallel
- T012 ConfirmModal (Phase 2): parallel with T008–T011
- US3 backend (T025–T029) + US4 backend (T034–T041) + US5 backend (T047–T049): all parallel (different modules)
- US3 frontend + US4 frontend + US5 frontend: parallel after their respective backends complete
- T038, T039 (US4 DTOs): parallel with each other and with T037
- T049 (US5 DTO): parallel with T047

---

## Parallel Example: User Story 3 (Couriers)

```bash
# Backend (parallel with US4 and US5 backend work):
Task T025: Create couriers-admin.service.ts
Task T026: Create update-courier.dto.ts       [parallel]
Task T027: Create courier-admin-response.dto.ts [parallel]
# Then:
Task T029: Create couriers-admin.controller.ts

# Concurrently in frontend:
Task T028: Create CourierStatusModal.tsx      [parallel with T029]
# After T025-T029 complete:
Task T030: CouriersPage.tsx
Task T031: CourierDrawer.tsx
Task T032: Register routes in App.tsx
```

---

## Implementation Strategy

### MVP First (US1 + US2 — Login and Orders)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 — Login (3 tasks)
4. Complete Phase 4: US2 — Orders (8 tasks, zero new backend)
5. **STOP and VALIDATE**: Login → Orders table with sorting/search/filter → detail drawer → cancel order → bulk cancel — all working
6. Demo-ready: covers the most time-critical daily workflow (FR-001 through FR-008 including FR-007 bulk actions)

### Incremental Delivery

1. Setup + Foundational → dev environment running
2. US1 → auth works (MVP gate)
3. US2 → orders fully functional with bulk actions (operational MVP)
4. US3 → courier management live (P1 complete)
5. US4 → user management live (P2 partial)
6. US5 → route history live (P2 complete)
7. Polish → production-ready

### Parallel Team Strategy (2 developers)

After completing Phases 1–2 together:
- **Dev A**: US1 (Phase 3) → US2 (Phase 4) → US4 backend (T034–T041) → US4 frontend (T042–T046)
- **Dev B**: US3 backend (T025–T029) + US3 frontend (T030–T033) → US5 backend (T047–T049) → US5 frontend (T050–T053)
- Both: Phase 8 Polish together

---

## Notes

- [P] tasks = different files, no unresolved dependencies on sibling tasks
- [Story] label maps each task to its user story for traceability
- **FR-006 compliance**: Order cancel → CancelOrderModal (T019). Courier status change → CourierStatusModal (T028). User delete → ConfirmModal (T042). All status/delete mutations gated by confirmation.
- **FR-007 compliance**: Bulk order actions implemented via BulkActionBar (T020) + BulkConfirmModal (T021). Lists all affected orders before execution.
- **FR-013 role matrix**: OWNER = full access everywhere. MANAGER = full access to Orders/Couriers/RouteHistory + read-only Users. ORDER_OPERATOR = read-only Users. Backend roles in T029, T040, T048 reflect this.
- **Constitution IV**: Users create/edit/delete restricted to OWNER only (Manager "cannot manage users or billing").
- Refine's `notificationProvider` from `@refinedev/antd` handles success/error toasts automatically for standard CRUD; use `useCustomMutation` for cancel and status-change operations.
- Row-hover action icons: implement via Ant Design Table `rowClassName` + CSS `.ant-table-row:hover .row-actions { opacity: 1 }`.
- Unsaved-changes guard pattern: `onClose` override → `if (form.isFieldsTouched()) Modal.confirm(...)` → only close if user confirms discard (T031, T043, T044).
- Bottom-sheet pattern: `const { xs } = Grid.useBreakpoint(); <Drawer placement={xs ? 'bottom' : 'right'}>`.
- Migration numbering: staff_users is migration `021` (019 = payout_periods, 020 = payouts; verify sequence at implementation time).
