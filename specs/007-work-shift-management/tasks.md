# Tasks: Work Shift Management

**Input**: Design documents from `/specs/007-work-shift-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/shift-management.yml ✅, quickstart.md ✅

**Tests**: Test tasks included in the Polish phase (not blocking MVP delivery).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.
  - US1 (P1): Courier Opens and Closes Their Shift *(core lifecycle — implemented first)*
  - US2 (P1): Order Assignment Blocked for Off-Shift Couriers *(gate enforcement — depends on US1 entity)*
  - US4 (P2): Courier Views Own Shift Status and History *(static routes — implemented before US3 for NestJS route ordering)*
  - US5 (P3): Staff Sees Live Active Shifts *(static route — implemented before US3 for NestJS route ordering)*
  - US3 (P2): Staff Views Courier Shift History *(parameterized route — must be registered LAST in controller)*

**⚠️ Route ordering note**: NestJS resolves routes top-down. `GET /couriers/active-shifts` and `GET /couriers/shift/history` would be shadowed by `GET /couriers/:courierId/shifts` if the parameterized route is registered first. Therefore US4 and US5 controller additions precede US3's controller addition in the implementation order, even though spec priority is US3=P2, US4=P2, US5=P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to

---

## Phase 1: Setup

No new runtime dependencies required — NestJS, TypeORM, BullMQ, Socket.IO, class-validator, @nestjs/swagger are all installed from features 001–004.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migration, entity, DTOs, and module update. ALL user stories depend on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 Create migration `database/migrations/018_create_courier_shifts.ts` — `CREATE TABLE courier_shifts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES owners(id), courier_id UUID NOT NULL REFERENCES couriers(id), status VARCHAR(20) NOT NULL DEFAULT 'open', started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`; add partial unique index `CREATE UNIQUE INDEX idx_courier_shifts_one_open ON courier_shifts(courier_id) WHERE status = 'open'`; add `CREATE INDEX idx_courier_shifts_owner ON courier_shifts(owner_id, started_at DESC)`; add `CREATE INDEX idx_courier_shifts_courier ON courier_shifts(courier_id, started_at DESC)`; down() drops all three indexes then the table
- [X] T002 [P] Create `src/couriers/entities/courier-shift.entity.ts` — `@Entity('courier_shifts') CourierShift`: `@PrimaryGeneratedColumn('uuid') id`, `@Column({ type: 'uuid' }) owner_id`, `@ManyToOne(() => Owner) @JoinColumn({ name: 'owner_id' }) owner`, `@Column({ type: 'uuid' }) courier_id`, `@ManyToOne(() => Courier) @JoinColumn({ name: 'courier_id' }) courier`, `@Column({ length: 20, default: 'open' }) status: string`, `@Column({ type: 'timestamptz', default: () => 'NOW()' }) started_at: Date`, `@Column({ type: 'timestamptz', nullable: true }) ended_at: Date | null`, `@CreateDateColumn() created_at`, `@UpdateDateColumn() updated_at`; imports from typeorm + Owner + Courier entities
- [X] T003 [P] Create `src/couriers/dto/shift-response.dto.ts` — export `ShiftResponseDto` (id uuid, courier_id uuid, status string, started_at Date, ended_at Date|null, duration_minutes number|null, order_count number|null — all `@ApiProperty`/`@ApiPropertyOptional`); export `ShiftHistoryQueryDto` with `@IsOptional @IsInt @Min(1) page: number`, `@IsOptional @IsInt @Min(1) @Max(100) limit: number`, `@IsOptional @IsISO8601() from?: string`, `@IsOptional @IsISO8601() to?: string` decorated with `@Type(() => Number)` and `@Transform` as needed; export `PaginatedShiftsDto` (data: ShiftResponseDto[], meta: { total, page, limit, total_pages }); export `ActiveShiftItemDto` (id, courier_id, courier_name, started_at, elapsed_minutes, active_order_count — all `@ApiProperty`); export `ActiveShiftsResponseDto` (data: ActiveShiftItemDto[], total: number)
- [X] T004 Update `src/couriers/couriers.module.ts` — add `CourierShift` to `TypeOrmModule.forFeature([Courier, CourierPosition, CourierLocationHistory, CourierShift])` only; do NOT add `ShiftManagementService` or `ShiftManagementController` yet (those files are created in T006/T007)

**Checkpoint**: `pnpm build` compiles without errors. `pnpm migration:run` applies migration 018 cleanly.

---

## Phase 3: User Story 1 — Courier Opens and Closes Their Shift (Priority: P1) 🎯 MVP Core

**Goal**: An authenticated courier can `POST /couriers/shift/open` to start a shift and `POST /couriers/shift/close` to end it. Each operation atomically updates `couriers.status`. Attempting to open a duplicate shift returns 409. Attempting to close with no open shift returns 409. Socket.IO events are emitted to the staff room on both operations.

**Independent Test**: quickstart.md Flows 1, 2, 6. Open shift → 201 with status="open"; check current → same record; open again → 409; close → 200 with ended_at and duration_minutes; close again → 409.

- [X] T005 [P] [US1] Add `emitShiftOpened(ownerId: string, payload: object)` and `emitShiftClosed(ownerId: string, payload: object)` methods to `src/gateways/orders.gateway.ts` — each emits to `this.server.to(\`tenant:${ownerId}:staff\`).emit('courier:shift_opened', payload)` / `'courier:shift_closed'`
- [X] T006 [US1] Create `src/couriers/shift-management.service.ts` — `@Injectable() ShiftManagementService`; inject `DataSource` and `@Inject(forwardRef(() => OrdersGateway)) ordersGateway: OrdersGateway`; implement `openShift(user: AuthUser): Promise<ShiftResponseDto>`: wrap in `dataSource.transaction(async manager => { (1) INSERT courier_shift via manager.getRepository(CourierShift).save({ owner_id: user.ownerId, courier_id: user.userId }) — if throws QueryFailedError with driverError.code==='23505' (unique_violation), catch and throw ConflictException('Courier already has an open shift'); (2) UPDATE couriers SET status='available' via manager.createQueryBuilder().update(Courier).set({ status: 'available', updated_at: () => 'NOW()' }).where('id = :id AND owner_id = :ownerId', { id: user.userId, ownerId: user.ownerId }).execute(); (3) emit this.ordersGateway.emitShiftOpened(user.ownerId, { courierId: user.userId, shiftId: shift.id, startedAt: shift.started_at }); return mapToDto(shift, null) })` where `mapToDto` converts a `CourierShift` to `ShiftResponseDto` (duration_minutes computed as null while open, or Math.round((ended_at - started_at) / 60000) when closed); implement `closeShift(user: AuthUser): Promise<ShiftResponseDto>`: wrap in `dataSource.transaction(async manager => { (1) const result = await manager.createQueryBuilder().update(CourierShift).set({ status: 'closed', ended_at: () => 'NOW()', updated_at: () => 'NOW()' }).where('courier_id = :courierId AND owner_id = :ownerId AND status = \'open\'', { courierId: user.userId, ownerId: user.ownerId }).execute(); if result.affected === 0 throw ConflictException('No open shift to close'); (2) load the closed shift: manager.getRepository(CourierShift).findOne({ where: { courier_id: user.userId, owner_id: user.ownerId, status: 'closed', ended_at: Not(IsNull()) }, order: { ended_at: 'DESC' } }); (3) UPDATE couriers SET status='unavailable'; (4) emit this.ordersGateway.emitShiftClosed(user.ownerId, { courierId: user.userId, shiftId: shift.id, startedAt: shift.started_at, endedAt: shift.ended_at, durationMinutes: computed }); return mapToDto(shift, null) })`
- [X] T007 [US1] Create `src/couriers/shift-management.controller.ts` — `@Controller() @UseGuards(JwtAuthGuard, RolesGuard) @ApiTags('shift-management') @ApiBearerAuth()`; inject `ShiftManagementService`; implement `@Post('couriers/shift/open') @Roles(UserRole.COURIER) @ApiOperation @ApiCreatedResponse({ type: ShiftResponseDto }) @ApiConflictResponse @ApiForbiddenResponse @ApiUnauthorizedResponse` → calls `service.openShift(req.user)`; implement `@Post('couriers/shift/close') @Roles(UserRole.COURIER) @ApiOperation @ApiOkResponse({ type: ShiftResponseDto }) @ApiConflictResponse @ApiForbiddenResponse @ApiUnauthorizedResponse` → calls `service.closeShift(req.user)`; **IMPORTANT: this file will receive additional GET routes in later phases — add them ABOVE any parameterized `@Get('couriers/:courierId/shifts')` route when that is added in T014**
- [X] T007b [US1] Wire service and controller into `src/couriers/couriers.module.ts` — add `ShiftManagementService` to providers array; add `ShiftManagementController` to controllers array; import both from their files created in T006/T007 (this task must run AFTER T006 and T007 so the files exist and `pnpm build` succeeds)

**Checkpoint**: quickstart.md Flows 1, 2, 6. `POST /couriers/shift/open` → 201 with `status="open"`. Duplicate open → 409. `POST /couriers/shift/close` → 200 with `ended_at` set and `duration_minutes > 0`. Double-close → 409. Socket.IO staff room receives events.

---

## Phase 4: User Story 2 — Order Assignment Blocked for Off-Shift Couriers (Priority: P1)

**Goal**: A courier with no open shift cannot claim an order. The check is enforced in `OrderLifecycleService.claim()` before any other logic.

**Independent Test**: quickstart.md Flows 3, 4. Courier with no open shift claims order → 422 with `"Courier does not have an open shift"`. Courier with open shift claims order → 200.

- [X] T008 [US2] Modify `src/orders/order-lifecycle.service.ts` — add import for `CourierShift` entity (`import { CourierShift } from '../couriers/entities/courier-shift.entity'`); at the very start of `claim(id, user)`, before the `activeCount` check, add: `const openShift = await this.dataSource.getRepository(CourierShift).findOne({ where: { courier_id: user.userId, owner_id: user.ownerId, status: 'open' } }); if (!openShift) { throw new UnprocessableEntityException('Courier does not have an open shift'); }`

**Checkpoint**: quickstart.md Flows 3, 4. Off-shift courier → 422. On-shift courier → order claimed successfully.

---

## Phase 5: User Story 4 — Courier Views Own Shift Status and History (Priority: P2)

**Goal**: A courier can query their own current open shift and paginated shift history with duration and order count.

**Note**: US4 is implemented before US3 (despite both being P2) because its static routes (`/couriers/shift/current`, `/couriers/shift/history`) must appear before US3's parameterized route (`/couriers/:courierId/shifts`) in the controller class to avoid NestJS route shadowing.

**Independent Test**: quickstart.md Flows 2, 10. `GET /couriers/shift/current` → open shift record or null. `GET /couriers/shift/history` → paginated list with duration_minutes and order_count on closed shifts.

- [X] T009 [US4] Add `getCurrentShift(user: AuthUser): Promise<ShiftResponseDto | null>` and `getOwnShiftHistory(user: AuthUser, query: ShiftHistoryQueryDto): Promise<PaginatedShiftsDto>` to `src/couriers/shift-management.service.ts` — `getCurrentShift`: return `dataSource.getRepository(CourierShift).findOne({ where: { courier_id: user.userId, owner_id: user.ownerId, status: 'open' } })` mapped to `ShiftResponseDto` (with `elapsed_minutes` = `Math.round((Date.now() - started_at.getTime()) / 60000)`) or `null` if not found; `getOwnShiftHistory`: build query `WHERE courier_id = :courierId AND owner_id = :ownerId` optionally filtered by `started_at >= from` and `started_at <= to`; paginate with `skip` / `take`; for each CLOSED shift compute `duration_minutes` and fetch `order_count` with `SELECT COUNT(*) FROM courier_earnings WHERE courier_id = :courierId AND earned_at >= :startedAt AND earned_at <= :endedAt`; return `PaginatedShiftsDto`
- [X] T010 [US4] Add GET endpoints to `src/couriers/shift-management.controller.ts` — `@Get('couriers/shift/current') @Roles(UserRole.COURIER) @ApiOperation @ApiOkResponse` → `service.getCurrentShift(req.user)`; `@Get('couriers/shift/history') @Roles(UserRole.COURIER) @ApiOperation @ApiOkResponse({ type: PaginatedShiftsDto }) @ApiQuery for page, limit, from, to` → `service.getOwnShiftHistory(req.user, query)`; **add both methods BEFORE any future parameterized routes in the class body**

**Checkpoint**: quickstart.md Flows 2, 10. `GET /couriers/shift/current` returns open shift with `ended_at=null`. `GET /couriers/shift/history` returns paginated list ordered newest first with `duration_minutes` populated on closed shifts.

---

## Phase 6: User Story 5 — Staff Sees Live Active Shifts (Priority: P3)

**Goal**: Staff can query all currently open shifts in their tenant, with courier name, elapsed time, and active order count.

**Note**: US5 is implemented before US3 for the same route ordering reason — `GET /couriers/active-shifts` is a static route that must precede `GET /couriers/:courierId/shifts`.

**Independent Test**: quickstart.md Flows 8, 9. `GET /couriers/active-shifts` returns all open shifts. Socket.IO staff room receives `courier:shift_opened` and `courier:shift_closed` events within 3s.

- [X] T011 [US5] Add `getActiveShifts(ownerId: string): Promise<ActiveShiftsResponseDto>` to `src/couriers/shift-management.service.ts` — query: `SELECT cs.id, cs.courier_id, cs.started_at, c.first_name, c.last_name FROM courier_shifts cs JOIN couriers c ON c.id = cs.courier_id WHERE cs.owner_id = :ownerId AND cs.status = 'open' ORDER BY cs.started_at ASC`; for each row compute `elapsed_minutes = Math.round((Date.now() - started_at.getTime()) / 60000)` and fetch `active_order_count` via `SELECT COUNT(*) FROM orders WHERE courier_id = :courierId AND owner_id = :ownerId AND status NOT IN ('completed', 'cancelled')`; build `courier_name` as `first_name + ' ' + last_name`; return `ActiveShiftsResponseDto`
- [X] T012 [US5] Add `@Get('couriers/active-shifts') @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR) @ApiOperation @ApiOkResponse({ type: ActiveShiftsResponseDto }) @ApiForbiddenResponse @ApiUnauthorizedResponse` to `src/couriers/shift-management.controller.ts` — calls `service.getActiveShifts(req.user.ownerId)`; **add BEFORE the /couriers/:courierId/shifts route**

**Checkpoint**: quickstart.md Flows 8, 9. All open shifts visible to staff. Socket.IO events received within 3s.

---

## Phase 7: User Story 3 — Staff Views Courier Shift History (Priority: P2)

**Goal**: Staff can retrieve the paginated shift history for any courier in their tenant, filtered by optional date range.

**Note**: US3 is implemented last among US2–US5 because `GET /couriers/:courierId/shifts` is a parameterized route that must appear AFTER all static routes in the controller class (`/couriers/shift/*` and `/couriers/active-shifts`).

**Independent Test**: quickstart.md Flow 7. `GET /couriers/:courierId/shifts` returns paginated history with `duration_minutes` and correct `order_count`. Cross-tenant returns 404.

- [X] T013 [US3] Add `getCourierShifts(courierId: string, ownerId: string, query: ShiftHistoryQueryDto): Promise<PaginatedShiftsDto>` to `src/couriers/shift-management.service.ts` — first verify courier belongs to tenant: `dataSource.getRepository(Courier).findOne({ where: { id: courierId, owner_id: ownerId } })` → throw `NotFoundException('Courier not found')` if null; then paginate `courier_shifts WHERE courier_id = :courierId AND owner_id = :ownerId` with optional date range on `started_at`; compute `duration_minutes` and `order_count` per shift (same logic as `getOwnShiftHistory`); return `PaginatedShiftsDto`
- [X] T014 [US3] Add `@Get('couriers/:courierId/shifts') @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR) @ApiOperation @ApiOkResponse({ type: PaginatedShiftsDto }) @ApiNotFoundResponse @ApiForbiddenResponse @ApiUnauthorizedResponse @ApiParam({ name: 'courierId', format: 'uuid' }) @ApiQuery for page, limit, from, to` to `src/couriers/shift-management.controller.ts` — calls `service.getCourierShifts(courierId, req.user.ownerId, query)`; **this method MUST be declared last in the class body — after T010's /couriers/shift/current and /couriers/shift/history and T012's /couriers/active-shifts — to prevent NestJS from routing /couriers/shift/current as /couriers/:courierId/shifts with courierId='shift'**

**Checkpoint**: quickstart.md Flow 7. Staff retrieves courier history with pagination. Cross-tenant courier ID → 404.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T015 [P] Add complete Swagger decorators to `src/couriers/shift-management.controller.ts` per `contracts/shift-management.yml` — ensure every endpoint has `@ApiOperation`, appropriate `@ApiXxxResponse` decorators, `@ApiParam` on `:courierId`, `@ApiQuery` on paginated endpoints; verify all response DTOs are referenced correctly
- [X] T016 [P] Write unit tests `src/couriers/shift-management.service.spec.ts` — mock `DataSource` (transaction, getRepository, createQueryBuilder), `OrdersGateway`; test cases: `openShift()` success → status='open', emitShiftOpened called; `openShift()` duplicate → ConflictException (simulate 23505 error); `closeShift()` success → status='closed', duration_minutes>0, emitShiftClosed called; `closeShift()` no open shift → ConflictException (affected=0); `getCurrentShift()` with open shift → ShiftResponseDto; `getCurrentShift()` no shift → null; `getCourierShifts()` wrong tenant → NotFoundException; `getActiveShifts()` returns all open shifts with elapsed_minutes and order_count
- [X] T017 [P] Write e2e tests `test/e2e/shift-management.e2e-spec.ts` — full HTTP flows mirroring quickstart.md Flows 1–10: open shift → 201; open again → 409; close → 200 with duration; close again → 409; off-shift claim → 422; on-shift claim → 200; staff shift history → paginated list; active shifts → list; courier own history → list; cross-tenant → 404; operator open shift → 403
- [X] T018 Run quickstart.md full validation (manual step — requires running server + Redis + PostgreSQL); execute Flows 1–10; confirm real-time Socket.IO emission, order gate, route history, and active shifts list
- [X] T019 [P] Update `specs/007-work-shift-management/tasks.md` — mark all completed tasks [X]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
  - T001 (migration): independent
  - T002 (entity): independent
  - T003 (DTOs): independent
  - T004 (module entity): depends on T002 entity being defined
- **US1 (Phase 3)**: All Foundational must complete
  - T005 (gateway): independent — different file
  - T006 (service): depends on T002 (entity), T003 (DTOs)
  - T007 (controller): depends on T006 (service)
  - T007b (module service+controller wiring): depends on T006, T007
- **US2 (Phase 4)**: T002 (CourierShift entity) must complete
  - T008 (order gate): depends on T002 (entity)
- **US4 (Phase 5)**: T006 (service) + T007 (controller) must complete
  - T009 (service additions): depends on T006
  - T010 (controller additions): depends on T009, T007
- **US5 (Phase 6)**: T006 + T007 must complete; T010 should be complete (route ordering)
  - T011 (service): depends on T006
  - T012 (controller): depends on T011, T010
- **US3 (Phase 7)**: T010 + T012 must complete (all static routes in place before parameterized)
  - T013 (service): depends on T006
  - T014 (controller): depends on T013, T010, T012 (all static routes must already be in file)
- **Polish (Phase 8)**: All desired story phases complete

### User Story Dependencies

```
US1 (P1) ──→ US2 (P1): CourierShift entity needed for gate check
US1 (P1) ──→ US4 (P2): service must exist before extending it
US1 (P1) ──→ US5 (P3): service must exist before extending it
US4 (P2) ──→ US3 (P2): static routes must be in controller before parameterized route
US5 (P3) ──→ US3 (P2): static route must be in controller before parameterized route
```

### Parallel Opportunities

```
Parallel batch 1 — Foundational (all different files):
  T001: 018_create_courier_shifts.ts
  T002: courier-shift.entity.ts
  T003: shift-response.dto.ts

Sequential:
  T004: couriers.module.ts (depends on T002 entity)

Parallel batch 2 — US1 (different files):
  T005: orders.gateway.ts (add emitShiftOpened + emitShiftClosed)
  T006: shift-management.service.ts (depends on T002, T003)

Sequential after both complete:
  T007: shift-management.controller.ts (depends on T006)
  T007b: couriers.module.ts service+controller wiring (depends on T006, T007)
```

### MVP Scope

**Minimum viable**: US1 + US2 (T001–T008) delivers the shift gate — couriers manage their shifts and cannot claim orders while off-shift. US4 (T009–T010) adds self-service history. US5 (T011–T012) adds staff live view. US3 (T013–T014) completes the staff reporting picture.

---

## Implementation Strategy

1. **Foundational first** (T001–T004): Migration, entity, DTOs, module — fully parallelizable
2. **Shift lifecycle service** (T006): Core open/close with atomic transaction
3. **Gateway events** (T005): Parallel with T006 — different file
4. **Shift controller** (T007): Wire open/close endpoints
5. **Order gate** (T008): Single addition to existing claim() method
6. **Own history** (T009–T010): Self-service endpoints for couriers
7. **Active shifts** (T011–T012): Staff live view — static route before parameterized
8. **Staff history** (T013–T014): Parameterized route — added last for routing correctness
9. **Polish** (T015–T019): Swagger, tests, manual validation
