# Tasks: Order Lifecycle

**Input**: Design documents from `/specs/003-order-lifecycle/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/order-lifecycle.yml ✅, quickstart.md ✅

**Tests**: Test tasks included in the Polish phase (not blocking MVP delivery).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.
  - US1 (P1): Courier Claims and Completes an Order
  - US2 (P1): Two Couriers Try to Claim the Same Order
  - US3 (P2): Operator Cancels an Order
  - US4 (P2): Operators See Order Status Updates in Real Time
  - US5 (P3): External System Receives Order Status Callbacks

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to

---

## Phase 1: Setup

No new runtime dependencies are required — all packages are already installed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migrations, entity updates, DTOs, and module skeleton. ALL user stories depend on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database Migrations

- [X] T001 Create migration `database/migrations/013_add_order_lifecycle_columns.ts` — `ALTER TABLE orders ADD COLUMN courier_id UUID NULL REFERENCES couriers(id)`, add `assigned_at TIMESTAMPTZ NULL`, `picked_up_at TIMESTAMPTZ NULL`, `in_delivery_at TIMESTAMPTZ NULL`, `completed_at TIMESTAMPTZ NULL`, `cancelled_at TIMESTAMPTZ NULL`; create `CREATE INDEX idx_orders_courier_id ON orders(courier_id) WHERE courier_id IS NOT NULL`
- [X] T002 [P] Create migration `database/migrations/014_create_delivery_records.ts` — create table `delivery_records` with columns: `id UUID PK DEFAULT gen_random_uuid()`, `owner_id UUID NOT NULL REFERENCES owners(id)`, `order_id UUID NOT NULL UNIQUE REFERENCES orders(id)`, `courier_id UUID NOT NULL REFERENCES couriers(id)`, `delivery_fee DECIMAL(10,2) NOT NULL`, `completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`; indexes: `idx_delivery_records_owner ON delivery_records(owner_id, completed_at DESC)`, `idx_delivery_records_courier ON delivery_records(courier_id, completed_at DESC)`
- [X] T003 [P] Create migration `database/migrations/015_create_courier_earnings.ts` — create table `courier_earnings` with columns: `id UUID PK DEFAULT gen_random_uuid()`, `owner_id UUID NOT NULL REFERENCES owners(id)`, `courier_id UUID NOT NULL REFERENCES couriers(id)`, `order_id UUID NOT NULL UNIQUE REFERENCES orders(id)`, `amount DECIMAL(10,2) NOT NULL`, `earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`; indexes: `idx_courier_earnings_courier ON courier_earnings(courier_id, earned_at DESC)`, `idx_courier_earnings_owner ON courier_earnings(owner_id, earned_at DESC)`

### TypeORM Entities

- [X] T004 Update `src/orders/entities/order.entity.ts` — add `@Column({ type: 'uuid', nullable: true }) courier_id: string | null`; add `@ManyToOne(() => Courier, { nullable: true, eager: false }) @JoinColumn({ name: 'courier_id' }) courier: Courier | null`; add five nullable timestamp columns: `@Column({ type: 'timestamptz', nullable: true }) assigned_at: Date | null`, `picked_up_at`, `in_delivery_at`, `completed_at`, `cancelled_at`; import `Courier` from `../../couriers/entities/courier.entity`
- [X] T005 [P] Create `src/orders/entities/delivery-record.entity.ts` — `@Entity('delivery_records') DeliveryRecord`: PK uuid, `owner_id UUID`, `@ManyToOne(() => Owner)`, `order_id UUID`, `@ManyToOne(() => Order)`, `courier_id UUID`, `@ManyToOne(() => Courier)`, `delivery_fee DECIMAL(10,2)`, `completed_at TIMESTAMPTZ`, `@CreateDateColumn() created_at`
- [X] T006 [P] Create `src/orders/entities/courier-earning.entity.ts` — `@Entity('courier_earnings') CourierEarning`: PK uuid, `owner_id UUID`, `@ManyToOne(() => Owner)`, `courier_id UUID`, `@ManyToOne(() => Courier)`, `order_id UUID`, `@ManyToOne(() => Order)`, `amount DECIMAL(10,2)`, `earned_at TIMESTAMPTZ`, `@CreateDateColumn() created_at`

### DTOs

- [X] T007 [P] Create `src/orders/dto/order-lifecycle-response.dto.ts` — export `CourierSummaryDto` (id, first_name, last_name, phone with `@ApiProperty`); export `OrderLifecycleResponseDto` with all fields from `contracts/order-lifecycle.yml#OrderLifecycleResponseDto`: id, owner_id, order_number, status, courier (nullable `CourierSummaryDto`), pickup_address, dropoff_address, delivery_fee, callback_url (nullable), assigned_at (nullable), picked_up_at (nullable), in_delivery_at (nullable), completed_at (nullable), cancelled_at (nullable), created_at, updated_at — all with `@ApiProperty`/`@ApiPropertyOptional`; export `CancelOrderDto` with `@IsString() @IsOptional() @MaxLength(500) reason?: string`
- [X] T008 [P] Create `src/orders/dto/available-orders-response.dto.ts` — export `AvailableOrderDto` (id, order_number, pickup_address, dropoff_address, delivery_fee, created_at with `@ApiProperty`); export `AvailableMetaDto` (total, page, limit, total_pages); export `AvailableOrdersListDto` (data: AvailableOrderDto[], meta: AvailableMetaDto)

### Module Skeleton

- [X] T009 Update `src/orders/orders.module.ts` — add `DeliveryRecord`, `CourierEarning` to `TypeOrmModule.forFeature([...])`; add BullMQ queues `courier-cancel-notify` and `order-callback` (both with `defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false }`); keep existing providers; **do NOT add OrderLifecycleService or OrderLifecycleController yet** (added in T012/T018)

**Checkpoint**: `pnpm typeorm migration:run` applies migrations 013–015 cleanly. `pnpm build` compiles without errors.

---

## Phase 3: User Story 1 — Courier Claims and Completes an Order (Priority: P1) 🎯 MVP

**Goal**: A courier views available orders, claims one atomically, progresses through `assigned → picked_up → in_delivery → completed`, and earnings + delivery record are created automatically on completion.

**Independent Test**: Run `pnpm seed:order-lifecycle-test`, use `$COURIER_TOKEN_1` to execute quickstart.md Flows 1 and 3. Verify: GET /available returns created orders; POST /claim returns status=assigned; subsequent pickup/start-delivery/complete each return the next status; completed order has non-null completed_at; duplicate claim attempt returns 422.

### Implementation

- [X] T010 [US1] Create `src/orders/order-lifecycle.service.ts` — inject `DataSource`, `@Inject(forwardRef(() => OrdersGateway)) ordersGateway`, `@InjectQueue('courier-cancel-notify') cancelQueue: Queue`, `@InjectQueue('order-callback') callbackQueue: Queue` from `@nestjs/bullmq`; define `COURIER_TRANSITIONS: Record<string, string> = { assigned: 'picked_up', picked_up: 'in_delivery', in_delivery: 'completed' }` and `OPERATOR_TRANSITIONS: Record<string, string> = { created: 'cancelled', assigned: 'cancelled', picked_up: 'cancelled', in_delivery: 'cancelled' }`; define `TIMESTAMP_COLUMN: Record<string, string> = { assigned: 'assigned_at', picked_up: 'picked_up_at', in_delivery: 'in_delivery_at', completed: 'completed_at', cancelled: 'cancelled_at' }`; implement `getAvailableOrders(query: { page?, limit? }, ownerId: string): Promise<AvailableOrdersListDto>` — query orders WHERE `status = 'created' AND owner_id = :ownerId` ORDER BY created_at ASC paginated; implement `claim(id: string, user: AuthUser): Promise<OrderLifecycleResponseDto>` — (1) check courier has no active order: `SELECT COUNT(*) FROM orders WHERE courier_id = :userId AND status NOT IN ('completed','cancelled') AND owner_id = :ownerId` → throw `ConflictException({ message: 'Courier already has an active order' })` if > 0; (2) run `UPDATE orders SET status='assigned', courier_id=:courierId, assigned_at=NOW(), updated_at=NOW() WHERE id=:id AND owner_id=:ownerId AND status='created' AND courier_id IS NULL RETURNING *` via `QueryBuilder.execute()`; if `affected === 0` → load existing order and throw `ConflictException({ message: 'Order is no longer available', existingCourierId: order.courier_id })`; (3) append `order_audit_entries` row (action='status_changed', metadata={from:'created',to:'assigned'}, actor_id=user.userId, actor_role=user.role, owner_id=user.ownerId); (4) call `this.emitStatusChanged(order)` and `this.enqueueCallbackIfNeeded(order, 'assigned')`; return `OrderLifecycleResponseDto`; implement `advanceStatus(id: string, targetStatus: string, user: AuthUser): Promise<OrderLifecycleResponseDto>` — load order WHERE id AND owner_id; verify `COURIER_TRANSITIONS[order.status] === targetStatus` else throw `UnprocessableEntityException(\`Cannot transition from '${order.status}'\`)`; verify `order.courier_id === user.userId` else throw `ForbiddenException('Not the assigned courier')`; run UPDATE with new status + timestamp column; if targetStatus==='completed': in same transaction INSERT `delivery_records` (order_id, courier_id, owner_id, delivery_fee, completed_at=NOW()) and INSERT `courier_earnings` (order_id, courier_id, owner_id, amount=order.delivery_fee, earned_at=NOW()); append audit entry; call `emitStatusChanged(order)`; `enqueueCallbackIfNeeded(order, targetStatus)`; return dto; implement private `emitStatusChanged(order, previousStatus)`: try `this.ordersGateway.emitStatusChanged(order.owner_id, { id: order.id, order_number: order.order_number, status: order.status, previous_status: previousStatus, courier_id: order.courier_id, updated_at: order.updated_at })` catch err logger.error; implement private `enqueueCallbackIfNeeded(order, status)`: if `order.callback_url && ['picked_up','completed','cancelled'].includes(status)` → `await this.callbackQueue.add('send', { orderId: order.id, callbackUrl: order.callback_url, eventStatus: status, ownerId: order.owner_id })`; implement private `mapToDto(order: Order): OrderLifecycleResponseDto`
- [X] T011 [US1] Create `src/orders/order-lifecycle.controller.ts` — `@Controller('orders') @UseGuards(JwtAuthGuard, RolesGuard) @ApiTags('orders-lifecycle') @ApiBearerAuth()`; `GET /orders/available @Roles(COURIER)` → `getAvailableOrders(page, limit, req.user.ownerId)`; `POST /orders/:id/claim @Roles(COURIER)` → `claim(id, req.user)`; `POST /orders/:id/pickup @Roles(COURIER)` → `advanceStatus(id, 'picked_up', req.user)`; `POST /orders/:id/start-delivery @Roles(COURIER)` → `advanceStatus(id, 'in_delivery', req.user)`; `POST /orders/:id/complete @Roles(COURIER)` → `advanceStatus(id, 'completed', req.user)`; inject `OrderLifecycleService`
- [X] T012 [US1] Update `src/orders/orders.module.ts` — add `OrderLifecycleService` and `OrderLifecycleController` to providers/controllers; add `forwardRef(() => AuthModule)` if not already present so `JwtService` is available to `OrdersGateway`
- [X] T013 [US1] Create `database/seeds/order-lifecycle-test.seed.ts` — connect via TypeORM DataSource; upsert Owner (email='lifecycle-test-owner@test.local', default_delivery_fee=350); upsert Courier 1 (phone='+79001111111', fcm_token='lifecycle-fcm-001') and Courier 2 (phone='+79002222222', fcm_token='lifecycle-fcm-002') both belonging to the owner; mint `OPERATOR_TOKEN` (role=ORDER_OPERATOR, owner_id=owner.id), `COURIER_TOKEN_1` (role=COURIER, sub=courier1.id, owner_id=owner.id), `COURIER_TOKEN_2` (role=COURIER, sub=courier2.id, owner_id=owner.id) using `new JwtService({ secret: process.env.JWT_SECRET }).sign(...)`; print all tokens and owner_id to console; add `seed:order-lifecycle-test` script to `package.json`: `ts-node -r tsconfig-paths/register database/seeds/order-lifecycle-test.seed.ts`

**Checkpoint**: quickstart.md Flows 1 and 3 pass. `GET /api/v1/orders/available` → 200 list. `POST /claim` → 200 assigned. Full claim→pickup→start-delivery→complete chain → each 200 with correct status. Duplicate claim → 409.

---

## Phase 4: User Story 2 — Two Couriers Try to Claim the Same Order (Priority: P1)

**Goal**: Exactly one of two concurrent claim attempts succeeds; the other gets 409.

**Independent Test**: Run quickstart.md Flow 2 (two parallel curl claims). Verify exactly one returns `status=assigned` and the other returns 409 with `message: "Order is no longer available"`.

**Note**: US2 atomicity is fully implemented by the `UPDATE … WHERE status='created' AND courier_id IS NULL` pattern in T010. This phase verifies correctness — no new files required.

- [X] T014 [US2] Verify `src/orders/order-lifecycle.service.ts` claim() uses a **single atomic UPDATE** (not read-then-write): confirm the raw SQL `UPDATE orders SET status='assigned', courier_id=:courierId … WHERE … status='created' AND courier_id IS NULL` is used and that `affected === 0` is the only signal for "already taken"; confirm the active-order check (SELECT COUNT) runs **before** the UPDATE; confirm `ConflictException` body includes `existingCourierId` field matching `contracts/order-lifecycle.yml#ConflictErrorDto`; if any of these conditions are not met, fix claim() in `src/orders/order-lifecycle.service.ts`

**Checkpoint**: quickstart.md Flow 2 — parallel claims — exactly one 200, one 409. 100% reproducible.

---

## Phase 5: User Story 3 — Operator Cancels an Order (Priority: P2)

**Goal**: An operator can cancel any order not yet completed; assigned courier is freed and FCM-notified.

**Independent Test**: Run quickstart.md Flows 4 and 5. Verify: cancelling `status=created` → 200 cancelled; cancelling `status=assigned` → 200 cancelled, FCM queued; cancelling `status=completed` → 422; Courier JWT → 403.

- [X] T015 [US3] Add `cancel(id: string, reason: string | undefined, user: AuthUser): Promise<OrderLifecycleResponseDto>` to `src/orders/order-lifecycle.service.ts` — load order WHERE id AND owner_id; verify `OPERATOR_TRANSITIONS[order.status] === 'cancelled'` else throw `UnprocessableEntityException(\`Cannot transition from '${order.status}'\`)`; run `UPDATE orders SET status='cancelled', cancelled_at=NOW(), courier_id=NULL, updated_at=NOW() WHERE id=:id AND owner_id=:ownerId AND status != 'completed' AND status != 'cancelled'`; if affected === 0 throw `UnprocessableEntityException`; append audit entry (action='status_changed', metadata={from:order.status, to:'cancelled', reason}); if `order.courier_id` was set: `await this.cancelQueue.add('notify', { courierId: order.courier_id, orderId: order.id, ownerId: order.owner_id })`; emit `order:status_changed` to staff room AND `order:cancelled` to couriers room via `ordersGateway.emitOrderCancelled(order.owner_id, payload)`; call `enqueueCallbackIfNeeded(order, 'cancelled')`; return dto
- [X] T016 [US3] Add `POST /orders/:id/cancel @Roles(OWNER, MANAGER, ORDER_OPERATOR)` to `src/orders/order-lifecycle.controller.ts` — `@Body() dto: CancelOrderDto` (optional body); call `orderLifecycleService.cancel(id, dto?.reason, req.user)`
- [X] T017 [US3] Create `src/orders/jobs/cancel-notify.processor.ts` — `@Processor('courier-cancel-notify') CancelNotifyProcessor extends WorkerHost`; inject `DataSource` and `FirebaseService`; `process(job: Job<{ courierId, orderId, ownerId }>)`: load courier from DB to get current fcm_token (token may have changed since enqueue); if no fcm_token log warn and return; call `firebaseService.getMessaging()?.send({ token, data: { event: 'order_cancelled', orderId } })`; catch per-courier FCM error: log and return (do NOT rethrow — prevents dead-letter on invalid token); if whole DB query fails: propagate so BullMQ retries
- [X] T018 [US3] Update `src/orders/orders.module.ts` — confirm `courier-cancel-notify` queue is registered (added in T009); add `CancelNotifyProcessor` to providers

**Checkpoint**: quickstart.md Flows 4, 5, 7, 8. Cancel available → 200. Cancel assigned → 200 + FCM job enqueued. Cancel completed → 422. Courier cancel → 403.

---

## Phase 6: User Story 4 — Operators See Order Status Updates in Real Time (Priority: P2)

**Goal**: Every status change emits `order:status_changed` to the staff Socket.IO room within 3s.

**Independent Test**: quickstart.md Real-Time Verification — connect wscat as operator, run Flow 1 claim step, verify event received within 3s.

**Note**: The `emitStatusChanged()` and `emitOrderCancelled()` calls are already wired in T010 and T015. This phase ensures `OrdersGateway` exposes the required methods and is properly injected.

- [X] T019 [US4] Add `emitStatusChanged(ownerId: string, payload: object)` and `emitOrderCancelled(ownerId: string, payload: object)` methods to `src/gateways/orders.gateway.ts` — `emitStatusChanged`: `this.server.to(\`tenant:${ownerId}:staff\`).emit('order:status_changed', payload)`; `emitOrderCancelled`: `this.server.to(\`tenant:${ownerId}:staff\`).emit('order:status_changed', payload)` AND `this.server.to(\`tenant:${ownerId}:couriers\`).emit('order:cancelled', payload)`
- [X] T020 [US4] Verify `src/orders/orders.module.ts` imports `forwardRef(() => AuthModule)` so `OrdersGateway` can inject `JwtService`; verify `OrdersGateway` is in the providers list (added in feature 002 — confirm no regression); verify `OrderLifecycleService` injects `OrdersGateway` via `@Inject(forwardRef(() => OrdersGateway))`; fix any missing wiring

**Checkpoint**: quickstart.md Real-Time Verification. Staff socket receives `order:status_changed` within 3s of claim. Couriers socket receives `order:cancelled` within 3s of cancel.

---

## Phase 7: User Story 5 — External System Receives Order Status Callbacks (Priority: P3)

**Goal**: HTTP POST sent to `callback_url` when order reaches `picked_up`, `completed`, or `cancelled`.

**Independent Test**: quickstart.md Flow 9. Create order with webhook.site callback_url; progress to picked_up; verify webhook.site receives POST within 10s.

- [X] T021 [US5] Create `src/orders/jobs/order-callback.processor.ts` — `@Processor('order-callback') OrderCallbackProcessor extends WorkerHost`; inject `Logger`; `process(job: Job<{ orderId: string, callbackUrl: string, eventStatus: string, ownerId: string }>)`: perform `fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, status: eventStatus, timestamp: new Date().toISOString() }), signal: AbortSignal.timeout(10000) })`; if response not ok: throw new Error so BullMQ retries; on fetch error (timeout, DNS): throw so BullMQ retries; no catch-all — all failures propagate for retry (callback failure does NOT affect order state since it was already written before this job was enqueued)
- [X] T022 [US5] Verify `src/orders/order-lifecycle.service.ts` calls `enqueueCallbackIfNeeded(order, status)` in `claim()` (no — claim goes to 'assigned' which is not in callback list), `advanceStatus()` (yes — for picked_up and completed), and `cancel()` (yes — for cancelled); confirm only `['picked_up', 'completed', 'cancelled']` trigger the queue and only when `order.callback_url` is not null; fix if needed
- [X] T023 [US5] Update `src/orders/orders.module.ts` — confirm `order-callback` queue is registered (added in T009); add `OrderCallbackProcessor` to providers

**Checkpoint**: quickstart.md Flow 9. Webhook receives POST `{ order_id, status: "picked_up", timestamp }` within 10s.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T024 [P] Add Swagger decorators to `src/orders/order-lifecycle.controller.ts` — `@ApiOperation`, `@ApiOkResponse({ type: OrderLifecycleResponseDto })`, `@ApiConflictResponse`, `@ApiUnprocessableEntityResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, `@ApiNotFoundResponse` per `contracts/order-lifecycle.yml`; on available list endpoint `@ApiOkResponse({ type: AvailableOrdersListDto })`
- [X] T025 [P] Write unit tests `src/orders/order-lifecycle.service.spec.ts` — mock `DataSource` (with `createQueryBuilder`, `execute`, transaction callback), `OrdersGateway`, BullMQ queues; test cases: `claim()` happy path → returns assigned dto; `claim()` with active order → ConflictException; `claim()` order already taken (affected=0) → ConflictException with existingCourierId; `advanceStatus('picked_up')` happy path; `advanceStatus('completed')` → DeliveryRecord + CourierEarning inserted; `advanceStatus('completed')` backward → UnprocessableEntityException; `cancel()` from created → 200; `cancel()` from completed → UnprocessableEntityException; `cancel()` from assigned → FCM job enqueued
- [X] T026 [P] Write e2e tests `test/e2e/order-lifecycle.e2e-spec.ts` — full HTTP flows mirroring quickstart.md Flows 1–8: full delivery chain (201→200×4), race condition parallel claims (one 200 one 409), active-order block (409), cancel available (200), cancel assigned (200), cancel completed (422), backward transition (422), courier cancel forbidden (403), available list visible to courier only (403 for operator on /available — wait, actually GET /available is COURIER only so operator would get 403; but operator CAN list orders via GET /orders from feature 002)
- [ ] T027 Run quickstart.md full validation (manual step — requires running server + Redis + PostgreSQL); execute Flows 1–9 plus Real-Time Verification; confirm all expected status codes, response bodies, and Socket.IO events; **Note for Step 0**: use tokens from `pnpm seed:order-lifecycle-test`
- [X] T028 [P] Update `specs/003-order-lifecycle/tasks.md` — mark all completed tasks [x]; confirm no tasks remain open

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
  - T001–T003 (migrations): parallel
  - T004–T008 (entities + DTOs): parallel with migrations, logically after T001 design
  - T009 (module skeleton): depends on T004–T008
- **US1 (Phase 3)**: All of Foundational must complete
- **US2 (Phase 4)**: T010 must complete (verifies claim implementation)
- **US3 (Phase 5)**: T010 must complete (adds cancel to service); T011 must complete (adds cancel to controller)
- **US4 (Phase 6)**: T010 and T015 must complete (emits wired in both)
- **US5 (Phase 7)**: T010 and T015 must complete (`enqueueCallbackIfNeeded` called from both)
- **Polish (Phase 8)**: All desired story phases complete

### User Story Dependencies

```
US1 (P1) ──→ US2 (P1): verify atomicity
US1 (P1) ──→ US3 (P2): add cancel method
US1 (P1) + US3 (P2) ──→ US4 (P2): verify emits
US1 (P1) + US3 (P2) ──→ US5 (P3): add callback processor
```

### Within Phase 2 Parallel Opportunities

```
Parallel batch 1 — all different files:
  T001: 013_add_order_lifecycle_columns.ts
  T002: 014_create_delivery_records.ts
  T003: 015_create_courier_earnings.ts
  T004: order.entity.ts
  T005: delivery-record.entity.ts
  T006: courier-earning.entity.ts
  T007: order-lifecycle-response.dto.ts
  T008: available-orders-response.dto.ts

Sequential:
  T009: orders.module.ts (depends on T004–T008 entities being defined)
```

### MVP Scope

**Minimum viable**: US1 (T001–T013) delivers the full courier happy path end-to-end. US2 verification (T014) is immediate since the atomic claim is built into T010. US3 (T015–T018) is required for operational use. US4 is implicit in US1/US3. US5 (T021–T023) is optional for MVP.

---

## Implementation Strategy

1. **Foundational first** (T001–T009): Migrations, entities, DTOs — all parallelizable within this phase
2. **Core lifecycle service** (T010): The heart of the feature — implement all transition logic, audit entries, Socket.IO emits, and callback enqueueing in one well-tested unit
3. **Controller + seed** (T011–T013): Wire the HTTP surface and seed script for manual testing
4. **Verify race condition** (T014): Confirm atomic claim — no code change expected
5. **Cancel** (T015–T018): Operator cancel with FCM notification
6. **Real-time verification** (T019–T020): Add new gateway methods, verify injection
7. **Callbacks** (T021–T023): External HTTP callback processor
8. **Polish** (T024–T028): Swagger, tests, manual validation
