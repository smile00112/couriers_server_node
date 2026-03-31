# Tasks: Courier Tracking

**Input**: Design documents from `/specs/004-courier-tracking/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/courier-tracking.yml ✅, quickstart.md ✅

**Tests**: Test tasks included in the Polish phase (not blocking MVP delivery).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.
  - US2 (P1): Courier App Sends Location Updates *(data source — implemented first)*
  - US1 (P1): Operator Sees Courier Locations on the Dashboard *(real-time emission — depends on US2)*
  - US3 (P2): Route History Is Recorded Per Delivery
  - US4 (P3): External System Receives Location Updates for Active Deliveries

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to

---

## Phase 1: Setup

No new runtime dependencies are required — `@nestjs/throttler`, BullMQ, and all required packages are already installed from features 001–003.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migrations, TypeORM entities, DTOs, and module skeleton. ALL user stories depend on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database Migrations

- [X] T001 Create migration `database/migrations/016_create_courier_positions.ts` — `CREATE TABLE courier_positions (id UUID PK DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES owners(id), courier_id UUID NOT NULL UNIQUE REFERENCES couriers(id), lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`; add `CREATE INDEX idx_courier_positions_owner ON courier_positions(owner_id)`
- [X] T002 [P] Create migration `database/migrations/017_create_courier_location_history.ts` — `CREATE TABLE courier_location_history (id UUID PK DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES owners(id), courier_id UUID NOT NULL REFERENCES couriers(id), order_id UUID NULL REFERENCES orders(id), lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL, distance_meters DECIMAL(10,2) NOT NULL DEFAULT 0, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`; add three indexes: `idx_location_history_order ON courier_location_history(order_id, recorded_at ASC) WHERE order_id IS NOT NULL`, `idx_location_history_courier ON courier_location_history(courier_id, recorded_at DESC)`, `idx_location_history_owner ON courier_location_history(owner_id, recorded_at DESC)`

### TypeORM Entities

- [X] T003 [P] Create `src/couriers/entities/courier-position.entity.ts` — `@Entity('courier_positions') CourierPosition`: `@PrimaryGeneratedColumn('uuid') id`, `@Column({ type: 'uuid' }) owner_id`, `@ManyToOne(() => Owner) @JoinColumn({ name: 'owner_id' }) owner`, `@Column({ type: 'uuid' }) courier_id`, `@ManyToOne(() => Courier) @JoinColumn({ name: 'courier_id' }) courier`, `@Column({ type: 'decimal', precision: 10, scale: 7 }) lat`, `@Column({ type: 'decimal', precision: 10, scale: 7 }) lng`, `@Column({ type: 'timestamptz' }) recorded_at: Date`, `@CreateDateColumn() created_at`, `@UpdateDateColumn() updated_at`
- [X] T004 [P] Create `src/couriers/entities/courier-location-history.entity.ts` — `@Entity('courier_location_history') CourierLocationHistory`: `@PrimaryGeneratedColumn('uuid') id`, `owner_id UUID`, `@ManyToOne(() => Owner)`, `courier_id UUID`, `@ManyToOne(() => Courier)`, `@Column({ type: 'uuid', nullable: true }) order_id: string | null`, `@ManyToOne(() => Order, { nullable: true }) @JoinColumn({ name: 'order_id' }) order: Order | null`, `lat DECIMAL(10,7)`, `lng DECIMAL(10,7)`, `@Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) distance_meters: number`, `@CreateDateColumn() recorded_at: Date`

### DTOs

- [X] T005 [P] Create `src/couriers/dto/submit-location.dto.ts` — export `SubmitLocationDto` with `@ApiProperty({ example: 55.7558 }) @IsNumber() @Min(-90) @Max(90) lat: number` and `@ApiProperty({ example: 37.6173 }) @IsNumber() @Min(-180) @Max(180) lng: number`; import decorators from `class-validator` and `@nestjs/swagger`
- [X] T006 [P] Create `src/couriers/dto/location-history-response.dto.ts` — export `LocationResponseDto` (courier_id, lat, lng, recorded_at, order_id nullable, distance_meters — all with `@ApiProperty`/`@ApiPropertyOptional`); export `RoutePointDto` (id, lat, lng, distance_meters, recorded_at with `@ApiProperty`); export `RouteHistoryResponseDto` (order_id, courier_id, total_distance_meters, points: RoutePointDto[] with `@ApiProperty`)

### Module Skeleton

- [X] T007 Update `src/couriers/couriers.module.ts` — add `CourierPosition`, `CourierLocationHistory` to `TypeOrmModule.forFeature([...])`; register BullMQ queue `location-callback` with `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false }`; import `forwardRef(() => OrdersModule)` so `OrdersGateway` is injectable; **do NOT add CourierTrackingService or CourierTrackingController yet** (added in T012)

**Checkpoint**: `pnpm migration:run` applies migrations 016–017 cleanly. `pnpm build` compiles without errors.

---

## Phase 3: User Story 2 — Courier App Sends Location Updates (Priority: P1) 🎯 MVP Core

**Goal**: An authenticated courier can `POST /couriers/location` with valid GPS coordinates. The platform records their current position (UPSERT), appends a history entry with Haversine distance, enforces a per-courier rate limit (1 update/5s), rejects invalid coordinates with 400, and returns a `LocationResponseDto`.

**Note**: US2 is implemented before US1 because it is the data source. US1 (real-time dashboard) adds the Socket.IO emission in the next phase but the service stub is wired here.

**Independent Test**: Run quickstart.md Flows 4 and 5. `POST /couriers/location` with valid coords → 200, `recorded_at` non-null, `distance_meters` = 0 for first update. Second identical POST within 5s → 429. POST with `lat=95` → 400.

### Implementation

- [X] T008 [US2] Create `src/couriers/courier-tracking.service.ts` — `@Injectable() CourierTrackingService`; inject `DataSource`, `@Inject(forwardRef(() => OrdersGateway)) ordersGateway: OrdersGateway`, `@InjectQueue('location-callback') locationCallbackQueue: Queue`; implement private `haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number` — `R=6371000`, standard Haversine formula, returns distance in metres; implement `submitLocation(dto: SubmitLocationDto, user: AuthUser): Promise<LocationResponseDto>`: (1) find active order: `SELECT id, callback_url FROM orders WHERE courier_id = :courierId AND owner_id = :ownerId AND status IN ('assigned','picked_up','in_delivery') LIMIT 1` using `dataSource.getRepository(Order).findOne(...)` — returns null if none; (2) load previous position: `dataSource.getRepository(CourierPosition).findOne({ where: { courier_id: user.userId } })` — null for first update; (3) compute `distanceMeters = previous ? haversineMeters(previous.lat, previous.lng, dto.lat, dto.lng) : 0`; (4) UPSERT courier_positions using raw SQL `INSERT INTO courier_positions (owner_id, courier_id, lat, lng, recorded_at, updated_at) VALUES (...) ON CONFLICT (courier_id) DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, recorded_at=EXCLUDED.recorded_at, updated_at=NOW()` via `dataSource.query()`; (5) INSERT history entry: `dataSource.getRepository(CourierLocationHistory).save({ owner_id: user.ownerId, courier_id: user.userId, order_id: activeOrder?.id ?? null, lat: dto.lat, lng: dto.lng, distance_meters: distanceMeters })`; (6) call `this.emitLocationUpdated(user.ownerId, { ... })` (stubbed — actual gateway call wired in T011); (7) if activeOrder?.callback_url: `await locationCallbackQueue.add('send', { courierId: user.userId, orderId: activeOrder.id, callbackUrl: activeOrder.callback_url, lat: dto.lat, lng: dto.lng, timestamp: now.toISOString(), ownerId: user.ownerId })`; return `LocationResponseDto`; add private `emitLocationUpdated(ownerId, payload)`: try `this.ordersGateway.emitLocationUpdated(ownerId, payload)` catch err `logger.error(...)`
- [X] T009 [US2] Create `src/couriers/guards/location-throttle.guard.ts` — extend `ThrottlerGuard` from `@nestjs/throttler`; override `getTracker(req: Request): Promise<string>` to return `req['user']?.userId ?? req.ip` (key throttle on authenticated courier ID, not IP); override `errorMessage` to `'Too many location updates'`
- [X] T010 [US2] Create `src/couriers/courier-tracking.controller.ts` — `@Controller() @UseGuards(JwtAuthGuard, RolesGuard) @ApiTags('courier-tracking') @ApiBearerAuth()`; implement `POST /couriers/location` with `@UseGuards(LocationThrottleGuard) @Roles(UserRole.COURIER) @Throttle({ default: { ttl: 5000, limit: 1 } })` → call `courierTrackingService.submitLocation(dto, req.user)`; **do NOT add the route history endpoint yet** (added in T014)
- [X] T011 [US2] Add `emitLocationUpdated(ownerId: string, payload: object)` method to `src/gateways/orders.gateway.ts` — `this.server.to(\`tenant:${ownerId}:staff\`).emit('courier:location_updated', payload)`
- [X] T012 [US2] Update `src/couriers/couriers.module.ts` — add `CourierTrackingService` and `CourierTrackingController` to providers/controllers; ensure `forwardRef(() => OrdersModule)` is imported so `OrdersGateway` resolves correctly; confirm `LocationThrottleGuard` does not need explicit module registration (it extends `ThrottlerGuard` which relies on global `ThrottlerModule` from `AppModule`)

**Checkpoint**: quickstart.md Flows 4 and 5. `POST /couriers/location` → 200 with `distance_meters=0` for first update. Second request within 5s → 429. `lat=95` → 400.

---

## Phase 4: User Story 1 — Operator Sees Courier Locations on the Dashboard (Priority: P1)

**Goal**: Every accepted location update emits a `courier:location_updated` Socket.IO event to the `tenant:{ownerId}:staff` room within 3 seconds, so operators see live courier positions without page refresh.

**Note**: The `emitLocationUpdated` method on `OrdersGateway` was added in T011. This phase verifies the wiring and tests the real-time flow end-to-end.

**Independent Test**: quickstart.md Flow 1 Real-Time Verification — connect wscat as operator to staff room, submit location as courier, verify `courier:location_updated` event received within 3s.

- [X] T013 [US1] Verify `src/couriers/courier-tracking.service.ts` calls `this.emitLocationUpdated(user.ownerId, { courierId: user.userId, lat: dto.lat, lng: dto.lng, recordedAt: now, orderId: activeOrder?.id ?? null, distanceMeters })` AFTER the history INSERT succeeds; verify `ordersGateway` is injected via `@Inject(forwardRef(() => OrdersGateway))`; verify `src/couriers/couriers.module.ts` imports `forwardRef(() => OrdersModule)` so `OrdersGateway` is provided; if any wiring is missing, fix it

**Checkpoint**: quickstart.md Flow 1. Staff Socket.IO room receives `courier:location_updated` within 3s of POST /couriers/location.

---

## Phase 5: User Story 3 — Route History Is Recorded Per Delivery (Priority: P2)

**Goal**: Every location update sent while a courier has an active order is linked to that order (`order_id` set in `courier_location_history`). After completion, `GET /orders/:id/route` returns the full chronological route with per-segment distances and total distance.

**Independent Test**: quickstart.md Flow 2 and Flow 3. Create order → claim → submit 3 locations (sleep 5s between) → complete → `GET /orders/:id/route` returns 3 points in order, `total_distance_meters > 0`.

- [X] T014 [US3] Add `getOrderRoute(orderId: string, ownerId: string): Promise<RouteHistoryResponseDto>` to `src/couriers/courier-tracking.service.ts` — (1) verify order belongs to tenant: `dataSource.getRepository(Order).findOne({ where: { id: orderId, owner_id: ownerId } })` → throw `NotFoundException('Order not found')` if null; (2) query history: `dataSource.getRepository(CourierLocationHistory).find({ where: { order_id: orderId }, order: { recorded_at: 'ASC' } })`; (3) compute `total_distance_meters = points.reduce((sum, p) => sum + Number(p.distance_meters), 0)`; (4) return `RouteHistoryResponseDto` with `order_id`, `courier_id` (from first point or order), `total_distance_meters`, `points` mapped to `RoutePointDto[]`
- [X] T015 [US3] Add `GET /orders/:id/route @Roles(OWNER, MANAGER, ORDER_OPERATOR)` to `src/couriers/courier-tracking.controller.ts` — `@Get('orders/:id/route') @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)` → call `courierTrackingService.getOrderRoute(id, req.user.ownerId)`; add Swagger decorators `@ApiOperation`, `@ApiOkResponse({ type: RouteHistoryResponseDto })`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`

**Checkpoint**: quickstart.md Flows 2 and 3. Location submissions during assigned order have `order_id` set. `GET /orders/:id/route` returns chronological points with non-zero total distance.

---

## Phase 6: User Story 4 — External System Receives Location Updates (Priority: P3)

**Goal**: When a courier delivers an order that has a `callback_url`, each accepted location update triggers an HTTP POST to that URL with `{ courier_id, order_id, lat, lng, timestamp }`. Delivery failures retry without affecting the courier's app response time.

**Independent Test**: quickstart.md Flow 8. Create order with webhook.site callback_url → claim → submit location → verify webhook.site receives POST within 10s.

- [X] T016 [US4] Create `src/couriers/jobs/location-callback.processor.ts` — `@Processor('location-callback') LocationCallbackProcessor extends WorkerHost`; inject `Logger`; `process(job: Job<{ courierId, orderId, callbackUrl, lat, lng, timestamp, ownerId }>)`: perform `fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courier_id: courierId, order_id: orderId, lat, lng, timestamp }), signal: AbortSignal.timeout(10000) })`; if `!response.ok` throw `new Error(\`Callback returned ${response.status}\`)` so BullMQ retries; on fetch error (DNS, timeout) throw so BullMQ retries; no catch-all — the order state and history were already written before this job was enqueued, so retries are idempotent
- [X] T017 [US4] Update `src/couriers/couriers.module.ts` — confirm `location-callback` queue is registered (added in T007); add `LocationCallbackProcessor` to providers
- [X] T018 [US4] Verify `src/couriers/courier-tracking.service.ts` enqueues `location-callback` job ONLY when `activeOrder !== null && activeOrder.callback_url !== null`; verify job payload includes `courierId`, `orderId`, `callbackUrl`, `lat`, `lng`, `timestamp` (ISO string), `ownerId`; fix if needed

**Checkpoint**: quickstart.md Flow 8. Webhook receives `{ courier_id, order_id, lat, lng, timestamp }` within 10s of POST /couriers/location.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T019 [P] Add full Swagger decorators to `src/couriers/courier-tracking.controller.ts` — `POST /couriers/location`: `@ApiOperation`, `@ApiOkResponse({ type: LocationResponseDto })`, `@ApiBadRequestResponse` (invalid coords), `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiTooManyRequestsResponse`; `GET /orders/:id/route`: all applicable decorators per `contracts/courier-tracking.yml`
- [X] T020 [P] Write unit tests `src/couriers/courier-tracking.service.spec.ts` — mock `DataSource` (getRepository, query), `OrdersGateway`, `locationCallbackQueue`; test cases: `submitLocation()` no previous position → `distance_meters=0`, `order_id=null`; `submitLocation()` with previous position → `distance_meters>0`; `submitLocation()` with active order → `order_id` set + callback enqueued; `submitLocation()` active order, no callback_url → callback NOT enqueued; `getOrderRoute()` happy path → points in order, correct total; `getOrderRoute()` wrong tenant → NotFoundException
- [X] T021 [P] Write e2e tests `test/e2e/courier-tracking.e2e-spec.ts` — full HTTP flows mirroring quickstart.md Flows 1–8: valid location → 200 with distance_meters; second request within 5s → 429; invalid lat → 400; operator submit → 403; unauthenticated → 401; route history after delivery → points in order; route courier access → 403; cross-tenant route → 404
- [ ] T022 Run quickstart.md full validation (manual step — requires running server + Redis + PostgreSQL); execute Flows 1–8; confirm real-time Socket.IO emission, rate limit, route history, and callback delivery
- [X] T023 [P] Update `specs/004-courier-tracking/tasks.md` — mark all completed tasks [x]; confirm no tasks remain open

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
  - T001–T002 (migrations): parallel
  - T003–T006 (entities + DTOs): parallel with migrations
  - T007 (module skeleton): depends on T003–T006 being defined
- **US2 (Phase 3)**: All Foundational must complete
  - T008 (service): depends on T003, T004, T005, T006
  - T009 (throttle guard): independent — different file
  - T010 (controller): depends on T008, T009
  - T011 (gateway method): independent — different file
  - T012 (module wiring): depends on T008, T010, T011
- **US1 (Phase 4)**: T008, T011, T012 must complete (verifies wiring)
- **US3 (Phase 5)**: T008 must complete (adds getOrderRoute to service); T010 must complete (adds route endpoint to controller)
- **US4 (Phase 6)**: T008 must complete (enqueue call already in service); T007 must complete (queue registered)
- **Polish (Phase 7)**: All desired story phases complete

### User Story Dependencies

```
US2 (P1) ──→ US1 (P1): verify Socket.IO emission
US2 (P1) ──→ US3 (P2): add route history service + endpoint
US2 (P1) ──→ US4 (P3): verify callback enqueueing
```

### Within Phase 2 Parallel Opportunities

```
Parallel batch 1 — all different files:
  T001: 016_create_courier_positions.ts
  T002: 017_create_courier_location_history.ts
  T003: courier-position.entity.ts
  T004: courier-location-history.entity.ts
  T005: submit-location.dto.ts
  T006: location-history-response.dto.ts

Sequential:
  T007: couriers.module.ts (depends on T003–T006 entities being defined)
```

### Within Phase 3 Parallel Opportunities

```
Parallel batch 2 — all different files:
  T008: courier-tracking.service.ts
  T009: location-throttle.guard.ts
  T011: orders.gateway.ts (add emitLocationUpdated)

Sequential:
  T010: courier-tracking.controller.ts (depends on T008, T009)
  T012: couriers.module.ts update (depends on T008, T010)
```

### MVP Scope

**Minimum viable**: US2 + US1 (T001–T013) delivers the core tracking loop — courier submits, operator sees live position. US3 (T014–T015) adds route history for delivery review. US4 (T016–T018) is optional for MVP.

---

## Implementation Strategy

1. **Foundational first** (T001–T007): Migrations, entities, DTOs — all parallelizable within this phase
2. **Core tracking service** (T008): Heart of the feature — Haversine, UPSERT, history insert, Socket.IO emit stub, callback enqueue
3. **Rate limit guard + controller** (T009–T010): HTTP surface with per-courier throttling
4. **Gateway method** (T011): Add `emitLocationUpdated` to existing `OrdersGateway`
5. **Module wiring** (T012): Connect all pieces
6. **Real-time verification** (T013): Confirm Socket.IO emission path
7. **Route history** (T014–T015): Service method + controller endpoint
8. **External callback** (T016–T018): BullMQ processor + verification
9. **Polish** (T019–T023): Swagger, tests, manual validation
