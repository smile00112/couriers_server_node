# Implementation Plan: Work Shift Management

**Branch**: `007-work-shift-management` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-work-shift-management/spec.md`

## Summary

Implement courier work shift management. Couriers open/close shifts via `POST /couriers/shift/open` and `POST /couriers/shift/close`. Each shift atomically updates `couriers.status` (available/unavailable) in the same transaction. A partial unique index prevents double-open. The order claim path (`OrderLifecycleService.claim()`) is extended with a shift-open gate that rejects off-shift couriers with `422`. Staff can view active shifts via `GET /couriers/active-shifts` and per-courier history via `GET /couriers/:id/shifts`. Couriers can view their own current shift and history via `GET /couriers/shift/current` and `GET /couriers/shift/history`. `courier:shift_opened` and `courier:shift_closed` Socket.IO events are added to `OrdersGateway`. One migration: create `courier_shifts`.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, class-validator/class-transformer, @nestjs/swagger, Socket.IO (Redis adapter)
**Storage**: PostgreSQL — 1 DB migration: create `courier_shifts` with partial unique index
**Testing**: Jest (unit), supertest (e2e/integration)
**Target Platform**: Linux server (Docker), multi-pod Kubernetes
**Project Type**: web-service (NestJS REST API additions to existing project)
**Performance Goals**: Shift open/close < 2s p95 (SC-001); shift gate rejection < 1s p95 (SC-002); history query < 3s (SC-003)
**Constraints**: Partial unique index (DB-enforced one-open-shift-per-courier); atomic courier status + shift INSERT/UPDATE in single transaction; multi-tenant isolation (owner_id everywhere)
**Scale/Scope**: ~100 active couriers per tenant; ~50 open shifts per tenant; up to 200 shifts/month per courier in history

## Constitution Check

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | Shift gate added to `OrderLifecycleService.claim()` as a pre-check; does NOT modify order status. Existing lifecycle state machine untouched. |
| II. Real-Time as First-Class | ✅ PASS | `courier:shift_opened` and `courier:shift_closed` emitted to `tenant:{ownerId}:staff` room on every shift state change. Added as methods on existing `OrdersGateway`. |
| III. API Contract Stability | ✅ PASS | All new endpoints under `/api/v1/couriers/...`. Swagger decorators required. Contract in `contracts/shift-management.yml`. No breaking changes to existing endpoints. |
| IV. Role-Based Authorization | ✅ PASS | Shift open/close: `@Roles(COURIER)`. Shift history (staff): `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`. Current shift + own history: `@Roles(COURIER)`. Active shifts: `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`. |
| V. Background Jobs Idempotent | ✅ PASS | No new BullMQ jobs introduced. |
| VI. Multi-Tenant Isolation | ✅ PASS | `courier_shifts.owner_id` required. All queries scoped to `owner_id`. Active shifts list scoped to operator's `owner_id`. |
| VII. Simplicity | ✅ PASS | No new gateway class — methods added to existing `OrdersGateway`. No counter column — order count derived via time-range query on existing `delivery_records`. No scheduler for auto-close. |
| VIII. Admin Panel Single-Page UX | ✅ PASS | Shift history shown in Courier detail drawer (existing right-side panel) — no new page, no new sidebar item. |

No violations.

### Post-Design Re-Check (after Phase 1)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | `OrderLifecycleService.claim()` receives a new pre-check only. No other lifecycle methods modified. |
| VI. Multi-Tenant | ✅ PASS | `courier_shifts.owner_id` on all rows; active shifts query filters by operator's `ownerId`. |
| VII. Simplicity | ✅ PASS | Order count per shift computed from `delivery_records` time-range; no counter column. |

## Project Structure

### Documentation (this feature)

```text
specs/007-work-shift-management/
├── plan.md              # This file
├── research.md          # Phase 0 output — 9 key decisions
├── data-model.md        # Phase 1 output — 1 migration, 1 new table
├── quickstart.md        # Phase 1 output — 10 test flows
├── contracts/
│   └── shift-management.yml   # OpenAPI 3.1 — 6 endpoints + 2 Socket.IO events
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root additions)

```text
src/
├── couriers/
│   ├── dto/
│   │   └── shift-response.dto.ts          # ShiftResponseDto, PaginatedShiftsDto,
│   │                                        # ActiveShiftItemDto, ActiveShiftsResponseDto,
│   │                                        # ShiftHistoryQueryDto
│   ├── entities/
│   │   └── courier-shift.entity.ts        # CourierShift entity
│   ├── shift-management.service.ts        # openShift(), closeShift(), getCurrentShift(),
│   │                                        # getShiftHistory(), getActiveShifts(), getCourierShifts()
│   └── shift-management.controller.ts     # 6 endpoints

database/
└── migrations/
    └── 018_create_courier_shifts.ts
```

**Modified files:**
- `src/couriers/couriers.module.ts` — add CourierShift entity, ShiftManagementService, ShiftManagementController
- `src/orders/order-lifecycle.service.ts` — add shift gate to claim()
- `src/gateways/orders.gateway.ts` — add emitShiftOpened(), emitShiftClosed()

## Key Design Decisions Summary

| Decision | Choice | Reference |
|----------|--------|-----------|
| Shift storage | `courier_shifts` table, one row per session | research.md §1 |
| Double-open prevention | Partial unique index on `(courier_id) WHERE status='open'` | research.md §2 |
| Order gate enforcement | Pre-check in `OrderLifecycleService.claim()` | research.md §3 |
| Courier status sync | Atomic UPDATE in same transaction as shift INSERT/UPDATE | research.md §4 |
| Order count per shift | Time-range query on `delivery_records` | research.md §5 |
| Real-time events | `emitShiftOpened/Closed` on existing `OrdersGateway` | research.md §6 |
| Pagination | Offset, default 20/page, max 100 | research.md §7 |
| Migration number | 018 | research.md §8 |
| Admin panel | Shift history tab in Courier detail drawer | research.md §9 |

## Implementation Phases (for /speckit.tasks)

### Phase A: Database Layer
1. Migration `018`: Create `courier_shifts` table (id, owner_id, courier_id, status, started_at, ended_at, created_at, updated_at) + partial unique index `idx_courier_shifts_one_open` + `idx_courier_shifts_owner` + `idx_courier_shifts_courier`

### Phase B: Entity
2. Create `src/couriers/entities/courier-shift.entity.ts` — `CourierShift` entity with all fields

### Phase C: DTOs
3. Create `src/couriers/dto/shift-response.dto.ts` — `ShiftResponseDto`, `PaginatedShiftsDto`, `ActiveShiftItemDto`, `ActiveShiftsResponseDto`, `ShiftHistoryQueryDto`

### Phase D: Gateway Extension
4. Add `emitShiftOpened(ownerId, payload)` and `emitShiftClosed(ownerId, payload)` to `src/gateways/orders.gateway.ts`

### Phase E: Core Service
5. Create `src/couriers/shift-management.service.ts`:
   - `openShift(user: AuthUser)`: dataSource.transaction → INSERT courier_shifts + UPDATE couriers.status='available' → emit shift_opened; throw 409 if unique constraint violation
   - `closeShift(user: AuthUser)`: dataSource.transaction → UPDATE courier_shifts SET status='closed', ended_at=NOW() WHERE courier_id=userId AND status='open' (check affected=1) + UPDATE couriers.status='unavailable' → compute duration → emit shift_closed; throw 409 if no open shift
   - `getCurrentShift(user: AuthUser)`: find one WHERE courier_id=userId AND status='open'; return null if none
   - `getShiftHistory(user: AuthUser, query)`: paginated, newest first, with duration; order count for closed shifts via delivery_records time-range
   - `getCourierShifts(courierId, ownerId, query)`: same as above but for any courier in tenant; verify courier belongs to tenant first
   - `getActiveShifts(ownerId)`: JOIN courier_shifts with couriers WHERE status='open' AND owner_id=ownerId; add elapsed_minutes and active_order_count per courier

### Phase F: Controller
6. Create `src/couriers/shift-management.controller.ts`:
   - `POST /couriers/shift/open` — `@Roles(COURIER)` → openShift()
   - `POST /couriers/shift/close` — `@Roles(COURIER)` → closeShift()
   - `GET /couriers/shift/current` — `@Roles(COURIER)` → getCurrentShift()
   - `GET /couriers/shift/history` — `@Roles(COURIER)` → getShiftHistory()
   - `GET /couriers/active-shifts` — `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → getActiveShifts()
   - `GET /couriers/:courierId/shifts` — `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → getCourierShifts()
   - Swagger decorators per `contracts/shift-management.yml`
   - **Route registration order**: static paths (`shift/open`, `shift/close`, `shift/current`, `shift/history`, `active-shifts`) MUST be registered before parameterized paths (`:courierId/shifts`) to prevent NestJS routing conflicts

### Phase G: Order Gate
7. Modify `src/orders/order-lifecycle.service.ts` `claim()`:
   - Add `CourierShift` repository import (injected via DataSource)
   - Before the `activeCount` check, verify open shift: `dataSource.getRepository(CourierShift).findOne({ where: { courier_id: user.userId, owner_id: user.ownerId, status: 'open' } })`
   - If null → `throw new UnprocessableEntityException('Courier does not have an open shift')`

### Phase H: Module Wiring
8. Update `src/couriers/couriers.module.ts` — add `CourierShift` to `TypeOrmModule.forFeature`; add `ShiftManagementService` and `ShiftManagementController` to providers/controllers

### Phase I: Tests
9. Unit tests `src/couriers/shift-management.service.spec.ts` — mock DataSource + gateway; test: openShift success; openShift duplicate → 409; closeShift success with duration; closeShift no open shift → 409; getCurrentShift with open shift; getCurrentShift no shift → null; getCourierShifts wrong tenant → 404; getActiveShifts returns open shifts
10. E2E tests `test/e2e/shift-management.e2e-spec.ts` — full HTTP flows matching quickstart.md Flows 1–10

## Complexity Tracking

No constitution violations. No speculative complexity introduced.
