# Tasks: Payout Reconciliation

**Input**: Design documents from `/specs/008-payout-reconciliation/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api-contracts.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Module Scaffolding)

**Purpose**: Create the directory and file skeleton for the new `PayoutsModule`. No logic yet — just structure that subsequent phases fill in.

- [x] T001 Create `src/payouts/` directory tree: `entities/`, `dto/` subdirs and empty placeholder files matching the structure in plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migrations, TypeORM entities, and module registration. MUST be complete before any user story endpoint can run.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Create migration `database/migrations/019_create_payout_periods.ts` — `payout_periods` table: `id UUID PK`, `owner_id UUID NOT NULL FK owners`, `created_by UUID NOT NULL`, `start_date DATE NOT NULL`, `end_date DATE NOT NULL`, `status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK IN ('open','closed')`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, CHECK `(end_date >= start_date)`, index `idx_payout_periods_owner` on `(owner_id, created_at DESC)`

- [x] T003 Create migration `database/migrations/020_create_payouts.ts` — `payouts` table: `id UUID PK`, `owner_id UUID NOT NULL FK owners`, `payout_period_id UUID NOT NULL FK payout_periods`, `courier_id UUID NOT NULL FK couriers`, `amount DECIMAL(10,2) NOT NULL`, `reference_note TEXT NULL`, `paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, UNIQUE `(payout_period_id, courier_id)`, index `idx_payouts_period` on `(payout_period_id, courier_id)`, index `idx_payouts_courier` on `(courier_id, paid_at DESC)`

- [x] T004 [P] Create `PayoutPeriod` TypeORM entity `src/payouts/entities/payout-period.entity.ts` — columns matching T002 schema, `@ManyToOne(() => Owner)` for `owner_id`, status typed as `'open' | 'closed'`

- [x] T005 [P] Create `Payout` TypeORM entity `src/payouts/entities/payout.entity.ts` — columns matching T003 schema, `@ManyToOne(() => PayoutPeriod)` for `payout_period_id`, `@ManyToOne(() => Courier)` for `courier_id`, `@ManyToOne(() => Owner)` for `owner_id`; no `updated_at` column (immutability signal)

- [x] T006 Create `PayoutsModule` scaffold `src/payouts/payouts.module.ts` — `TypeOrmModule.forFeature([PayoutPeriod, Payout, CourierEarning, Courier])`, declare `PayoutsService`, `PayoutsController`, `CourierPayoutsController`; import `AuthModule` with `forwardRef`

- [x] T007 Register `PayoutsModule` in `src/app.module.ts` imports array

**Checkpoint**: Migrations and entities exist; module is registered. `npm run build` must pass.

---

## Phase 3: User Story 1 — Staff Creates/Lists/Closes Periods and Reviews Earnings Summary (Priority: P1) 🎯 MVP

**Goal**: Staff can create a payout period, list all tenant periods, close an open period, and view an aggregated per-courier earnings summary for a period.

**Independent Test**: Create a payout period covering a date range with existing `courier_earnings` rows → `GET /payout-periods/:id/summary` returns correct per-courier totals. Close the period → status becomes `closed` and the endpoint still works. Verify tenant isolation by using a JWT from a different owner.

- [x] T008 [P] [US1] Create `CreatePayoutPeriodDto` `src/payouts/dto/create-payout-period.dto.ts` — `@IsDateString()` for `start_date` and `end_date`; add `@ApiProperty` decorators

- [x] T009 [P] [US1] Create `PayoutPeriodResponseDto` `src/payouts/dto/payout-period-response.dto.ts` — exposes `id`, `owner_id`, `start_date`, `end_date`, `status`, `created_by`, `created_at`, `updated_at`

- [x] T010 [P] [US1] Create `PeriodSummaryResponseDto` `src/payouts/dto/period-summary-response.dto.ts` — nested `PeriodInfoDto` (id, start_date, end_date, status) and array of `CourierSummaryItemDto` (courier_id, courier_name, delivery_count, total_amount as string, is_paid boolean)

- [x] T011 [US1] Create `PayoutsService` `src/payouts/payouts.service.ts` and implement:
  - `createPeriod(user: AuthUser, dto: CreatePayoutPeriodDto)` → inserts open `PayoutPeriod`, returns `PayoutPeriodResponseDto`; throws `BadRequestException` if `end_date < start_date`
  - `listPeriods(ownerId, query)` → paginated query on `payout_periods` filtered by `owner_id` and optional `status`; returns `{ data, meta }`
  - `closePeriod(ownerId, periodId)` → updates status to `closed`; throws `NotFoundException` if not found; throws `ConflictException` if already closed
  - `getPeriodSummary(ownerId, periodId)` → fetches period (404 if not found); runs `GROUP BY` aggregate on `courier_earnings` joined with `couriers` for the period's date range; left-joins `payouts` to compute `is_paid`; returns `PeriodSummaryResponseDto`

- [x] T012 [US1] Create `PayoutsController` `src/payouts/payouts.controller.ts` with `@ApiTags('payout-reconciliation')`, `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard, RolesGuard)`:
  - `POST /payout-periods` `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → `createPeriod`; `@ApiCreatedResponse`
  - `GET /payout-periods` `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → `listPeriods` with `page`, `limit`, `status` query params; `@ApiOkResponse`
  - `POST /payout-periods/:id/close` `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → `closePeriod`; `@ApiOkResponse`, `@ApiConflictResponse`, `@ApiNotFoundResponse`
  - `GET /payout-periods/:id/summary` `@Roles(OWNER, MANAGER, ORDER_OPERATOR)` → `getPeriodSummary`; `@ApiOkResponse`, `@ApiNotFoundResponse`

**Checkpoint**: US1 is independently testable. POST/GET period + close + summary all working with tenant isolation.

---

## Phase 4: User Story 2 — Staff Marks a Courier as Paid (Priority: P1)

**Goal**: Staff can record that a specific courier was paid within a closed payout period. Duplicate payments and payment against an open period are rejected.

**Independent Test**: Close a period, call `POST /payout-periods/:id/payouts` with a courier_id and amount → `201` created, Payout record exists. Call again with same courier → `409 Conflict`. Call against an open period → `422 Unprocessable Entity`.

- [x] T013 [P] [US2] Create `CreatePayoutDto` `src/payouts/dto/create-payout.dto.ts` — `@IsUUID()` for `courier_id`, `@IsPositive() @IsNumber()` for `amount`, `@IsOptional() @IsString()` for `reference_note`; add `@ApiProperty` decorators

- [x] T014 [P] [US2] Create `PayoutResponseDto` `src/payouts/dto/payout-response.dto.ts` — exposes `id`, `owner_id`, `payout_period_id`, `courier_id`, `amount`, `reference_note`, `paid_at`, `created_at`

- [x] T015 [US2] Add `recordPayout(ownerId, periodId, dto: CreatePayoutDto)` to `PayoutsService` `src/payouts/payouts.service.ts`:
  - Fetch period → `NotFoundException` if not found in tenant
  - `UnprocessableEntityException` if period status is `'open'`
  - Fetch courier → `NotFoundException` if not in tenant
  - Insert `Payout`; catch unique constraint violation (pg error `23505`) → `ConflictException('Courier already paid in this period')`
  - Return `PayoutResponseDto`

- [x] T016 [US2] Add `POST /payout-periods/:id/payouts` endpoint to `PayoutsController` `src/payouts/payouts.controller.ts` with `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`, `@ApiCreatedResponse`, `@ApiConflictResponse`, `@ApiNotFoundResponse`, `@ApiUnprocessableEntityResponse`

**Checkpoint**: US2 independently testable. Duplicate-payment rejection and open-period guard both verified.

---

## Phase 5: User Story 3 — Courier Views Own Earnings and Payout History (Priority: P2)

**Goal**: Couriers can retrieve a paginated list of their own delivery earnings (with optional date filter) and a paginated list of payout records received from staff.

**Independent Test**: As a courier JWT, call `GET /couriers/me/earnings` → receive paginated `courier_earnings` rows for that courier only, ordered newest first. Call `GET /couriers/me/payouts` → receive paginated payout records with joined period dates. Attempt to call either endpoint with a staff JWT → `403 Forbidden`.

- [x] T017 [P] [US3] Create `CourierEarningsResponseDto` `src/payouts/dto/courier-earnings-response.dto.ts` — item shape: `id`, `order_id`, `amount`, `earned_at`; wrap with `{ data, meta }` pagination shape

- [x] T018 [P] [US3] Create `CourierPayoutsResponseDto` `src/payouts/dto/courier-payouts-response.dto.ts` — item shape: `id`, `payout_period_id`, `period_start_date`, `period_end_date`, `amount`, `reference_note`, `paid_at`; wrap with `{ data, meta }` pagination shape

- [x] T019 [US3] Add `getCourierEarnings(courierId, ownerId, query)` and `getCourierPayouts(courierId, ownerId, query)` to `PayoutsService` `src/payouts/payouts.service.ts`:
  - `getCourierEarnings`: paginated query on `courier_earnings` where `courier_id` and `owner_id` match; optional `from`/`to` date filter on `earned_at`; ordered `earned_at DESC`
  - `getCourierPayouts`: paginated query on `payouts` where `courier_id` and `owner_id` match; LEFT JOIN `payout_periods` to include period dates; ordered `paid_at DESC`

- [x] T020 [US3] Create `CourierPayoutsController` `src/payouts/courier-payouts.controller.ts` with `@ApiTags('payout-reconciliation')`, `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard, RolesGuard)`:
  - `GET /couriers/me/earnings` `@Roles(COURIER)` → `getCourierEarnings(req.user.userId, req.user.ownerId, query)`; query params: `page`, `limit`, `from`, `to`; `@ApiOkResponse`
  - `GET /couriers/me/payouts` `@Roles(COURIER)` → `getCourierPayouts(req.user.userId, req.user.ownerId, query)`; query params: `page`, `limit`; `@ApiOkResponse`

- [x] T021 [US3] Register `CourierPayoutsController` in `PayoutsModule` `src/payouts/payouts.module.ts` controllers array

**Checkpoint**: US3 independently testable. Courier sees own data only; staff JWTs get 403.

---

## Phase 6: User Story 4 — Staff Views Pending (Unpaid) Couriers (Priority: P2)

**Goal**: Within a closed period, staff can see which couriers have earned but have not yet been marked as paid.

**Independent Test**: Close a period with 3 earning couriers, mark 1 as paid → `GET /payout-periods/:id/pending` returns exactly 2. Mark all as paid → returns empty list. Call on an open period → `409 Conflict`.

- [x] T022 [US4] Create `PendingCouriersResponseDto` `src/payouts/dto/pending-couriers-response.dto.ts` — shape: `{ period_id: string, couriers: Array<{ courier_id, courier_name, delivery_count, total_amount }> }`

- [x] T023 [US4] Add `getPendingCouriers(ownerId, periodId)` to `PayoutsService` `src/payouts/payouts.service.ts`:
  - Fetch period → `NotFoundException` if not found in tenant
  - `ConflictException` if status is `'open'`
  - Run the earnings GROUP BY aggregate (same as `getPeriodSummary`) but exclude couriers who have a `Payout` record in this period
  - Return `PendingCouriersResponseDto`

- [x] T024 [US4] Add `GET /payout-periods/:id/pending` endpoint to `PayoutsController` `src/payouts/payouts.controller.ts` with `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`, `@ApiOkResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`

**Checkpoint**: All four user stories independently testable and functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Tests, lint, and verification. Runs after all user story phases complete.

- [x] T025 [P] Write `PayoutsService` unit tests `test/payouts/payouts.service.spec.ts` — mock `DataSource`; cover: createPeriod success, closePeriod conflict, getPeriodSummary empty range, recordPayout duplicate-payment rejection, recordPayout open-period rejection, getCourierEarnings pagination, getPendingCouriers open-period rejection

- [x] T026 [P] Write `PayoutsController` and `CourierPayoutsController` unit tests `test/payouts/payouts.controller.spec.ts` — mock `PayoutsService`; verify role guards prevent wrong roles on each endpoint; verify correct service method is called with correct args

- [x] T027 Run `npm test` and `npm run lint` from repo root; fix any compilation errors, lint violations, or test failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — first story to implement
- **Phase 4 (US2)**: Depends on Phase 2 — builds on US1's controller and service file
- **Phase 5 (US3)**: Depends on Phase 2 — independent of US1/US2 service methods
- **Phase 6 (US4)**: Depends on Phase 2 + US1 (reuses summary aggregate logic in service)
- **Phase 7 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies. MVP starting point.
- **US2 (P1)**: After Phase 2 — adds to US1's service/controller files but independently testable
- **US3 (P2)**: After Phase 2 — entirely independent of US1/US2
- **US4 (P2)**: After US1 — shares summary aggregate query logic; references closed-period concept from US1

### Within Each User Story

- DTOs (marked [P]) can be written in parallel
- Service method before controller endpoint (service is the dependency)
- Module registration before integration testing

### Parallel Opportunities

Within Phase 2: T004 and T005 (entities) can be written in parallel after T002/T003 migrations are written.

Within Phase 3: T008, T009, T010 (DTOs) can be written in parallel before T011 (service).

Within Phase 4: T013 and T014 (DTOs) can be written in parallel before T015 (service method).

Within Phase 5: T017 and T018 (DTOs) can be written in parallel before T019 (service methods).

Within Phase 7: T025 and T026 (tests) can be written in parallel.

---

## Parallel Example: Phase 3 (User Story 1)

```
# Launch DTO tasks together:
Task T008: CreatePayoutPeriodDto in src/payouts/dto/create-payout-period.dto.ts
Task T009: PayoutPeriodResponseDto in src/payouts/dto/payout-period-response.dto.ts
Task T010: PeriodSummaryResponseDto in src/payouts/dto/period-summary-response.dto.ts

# Then sequential:
Task T011: PayoutsService (depends on DTOs from T008, T009, T010)
Task T012: PayoutsController (depends on T011)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (create/close period + summary)
4. Complete Phase 4: User Story 2 (mark courier paid)
5. **STOP and VALIDATE**: Full staff reconciliation workflow end-to-end
6. Ship if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Staff can create periods and view summaries (read-only reporting)
3. US2 → Staff can record payments (closes the reconciliation loop)
4. US3 → Couriers gain visibility into their own earnings and payouts
5. US4 → Staff gets pending-couriers convenience endpoint

### Parallel Team Strategy

After Phase 2 completes:
- Developer A: US1 + US2 (staff reconciliation flow, same service file)
- Developer B: US3 (courier self-service, separate controller file)
- Developer C: US4 (pending couriers, small addition to existing service)

---

## Notes

- [P] tasks operate on different files and have no dependency on incomplete sibling tasks
- [Story] label maps each task to the acceptance scenarios in spec.md for traceability
- Payout records are immutable by design — do not add update/delete service methods
- All service methods MUST include `owner_id` in every DB query (Constitution Principle VI)
- `getPeriodSummary` and `getPendingCouriers` share the same aggregate query pattern — extract a private helper in `PayoutsService` to avoid duplication
- `closePeriod` should use a single UPDATE statement to avoid race conditions
- The unique constraint on `(payout_period_id, courier_id)` catches concurrent duplicate-payment requests safely at the DB layer
