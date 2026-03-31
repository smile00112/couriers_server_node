# Tasks: Order Ingestion

**Input**: Design documents from `/specs/002-order-ingestion/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/orders.yml ✅, quickstart.md ✅

**Tests**: Test tasks are included in the Polish phase (not blocking MVP delivery).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.
  - US1 (P1): Operator Creates an Order Manually
  - US2 (P1): External System Pushes an Order
  - US3 (P2): Manager Reviews Newly Created Orders

**Changelog** (post-analysis remediation):
  - Added T002 (Socket.IO packages + IoAdapter — H2)
  - Added T017 (UserRole enum — H1/M4), T018 (@Roles decorator — H1), T019 (JwtAuthGuard — H1), T020 (RolesGuard — H1), T021 (AuthUser rename — M5)
  - Added T024 (FirebaseModule — M2)
  - Fixed T027 (OrdersModule): corrected `@nestjs/bullmq`, added dead-letter config (H3, M3)
  - Fixed T033 (seed): removed undefined operator user table; seed mints JWT directly (M1)
  - Fixed T034 (processor): corrected `@nestjs/bullmq` decorators, added FR-008 deferral note (H3, L2)
  - Moved `findAll()` to [US3] label (L3)
  - Quickstart Step 0 note updated (L1)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install all runtime dependencies absent from `package.json` and wire the Socket.IO adapter required by Constitution Principle II.

- [x] T001 Install missing runtime dependencies: run `pnpm add firebase-admin` and confirm `package.json` and `pnpm-lock.yaml` are updated
- [x] T002 Install Socket.IO packages and configure IoAdapter: run `pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io ioredis`; update `src/main.ts` to replace `app.listen` with Socket.IO + Redis adapter initialization — `app.useWebSocketAdapter(new RedisIoAdapter(app))` using `RedisIoAdapter` from `@nestjs/platform-socket.io` configured with `REDIS_HOST`/`REDIS_PORT`; create `src/adapters/redis-io.adapter.ts` with the standard NestJS Redis Socket.IO adapter pattern

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, shared auth infrastructure, TypeORM entities, DTOs, Firebase module, and NestJS module skeleton. ALL user stories depend on this phase completing.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database Migrations

- [x] T003 Create migration `database/migrations/007_add_owner_default_delivery_fee.ts` — `ALTER TABLE owners ADD COLUMN default_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00`
- [x] T004 [P] Create migration `database/migrations/008_add_courier_fcm_token.ts` — already in `002_create_couriers.ts`; skipped
- [x] T005 [P] Create migration `database/migrations/009_create_clients.ts` — clients table with columns: id UUID PK, owner_id UUID FK→owners, phone VARCHAR(30), name VARCHAR(255) NULL, created_at, updated_at; UNIQUE INDEX on (owner_id, phone)
- [x] T006 Create migration `database/migrations/010_create_orders.ts` — orders table with all columns per data-model.md (id, owner_id, client_id, order_number, status DEFAULT 'created', pickup/dropoff address+lat+lng, delivery_fee, callback_url, created_by_id, created_by_role, created_at, updated_at); UNIQUE INDEX on (owner_id, order_number); INDEX on (owner_id, status) and (owner_id, created_at DESC)
- [x] T007 [P] Create migration `database/migrations/011_create_order_items.ts` — order_items table: id, order_id FK→orders CASCADE, owner_id FK→owners, name VARCHAR(255), quantity INTEGER CHECK(quantity>=1), price DECIMAL(10,2), created_at, updated_at; INDEX on (order_id)
- [x] T008 [P] Create migration `database/migrations/012_create_order_audit_entries.ts` — order_audit_entries table: id, order_id FK→orders CASCADE, owner_id FK→owners, action VARCHAR(50), actor_id UUID, actor_role VARCHAR(50), metadata JSONB NULL, created_at; INDEX on (order_id, created_at) and (owner_id, created_at DESC)

### Shared Auth Infrastructure (new — required for role-based access on order endpoints)

- [x] T009 Create `src/auth/enums/user-role.enum.ts` — export `UserRole` enum with values: `ADMINISTRATOR = 'administrator'`, `OWNER = 'owner'`, `MANAGER = 'manager'`, `ORDER_OPERATOR = 'order_operator'`, `COURIER = 'courier'`; these are the canonical JWT role claim strings; "Order Operator" (constitution) maps to `'order_operator'`
- [x] T010 [P] Create `src/auth/decorators/roles.decorator.ts` — `export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles)` using `@nestjs/common` `SetMetadata`
- [x] T011 [P] Create `src/auth/guards/jwt-auth.guard.ts` — generic `JwtAuthGuard extends AuthGuard('jwt')` (role-agnostic, replaces courier-specific `CourierJwtGuard` for endpoints that serve multiple roles); keep `CourierJwtGuard` for the existing courier auth endpoints unchanged
- [x] T012 [P] Create `src/auth/guards/roles.guard.ts` — `RolesGuard implements CanActivate`; reads `roles` metadata via `Reflector`; compares `request.user.role` against allowed roles; returns `true` if allowed, throws `ForbiddenException` if not; import `UserRole` from the enum
- [x] T013 Update `src/auth/interfaces/jwt-payload.interface.ts` — rename `AuthUser.courierId → AuthUser.userId` to make the interface role-agnostic; update all usages of `AuthUser.courierId` in `src/auth/courier-auth.service.ts` and `src/auth/courier-auth.controller.ts` to use `userId`; the `JwtStrategy.validate()` return value changes accordingly

### TypeORM Entities

- [x] T014 [P] Create `src/clients/entities/client.entity.ts` — Client entity with `@Entity('clients')`, columns: id (UUID PK), ownerId (UUID), phone (varchar 30), name (varchar 255 nullable), createdAt, updatedAt; `@Unique(['ownerId', 'phone'])`
- [x] T015 [P] Create `src/orders/entities/order.entity.ts` — Order entity with `@Entity('orders')`, all columns per data-model.md; `@Unique(['ownerId', 'orderNumber'])`; `@ManyToOne` to Owner; `@ManyToOne` to Client; `@OneToMany` to OrderItem; `@OneToMany` to OrderAuditEntry
- [x] T016 [P] Create `src/orders/entities/order-item.entity.ts` — OrderItem entity with `@Entity('order_items')`, columns: id, orderId, ownerId, name, quantity, price, createdAt, updatedAt; `@ManyToOne` to Order
- [x] T017 [P] Create `src/orders/entities/order-audit-entry.entity.ts` — OrderAuditEntry entity with `@Entity('order_audit_entries')`, columns: id, orderId, ownerId, action, actorId, actorRole, metadata (JSONB nullable), createdAt (no updatedAt — immutable); `@ManyToOne` to Order
- [x] T018 [P] Update `src/owners/entities/owner.entity.ts` — add `@Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) defaultDeliveryFee: number`
- [x] T019 [P] Update `src/couriers/entities/courier.entity.ts` — add `@Column({ nullable: true }) fcmToken: string`

### DTOs

- [x] T020 [P] Create `src/orders/dto/create-order.dto.ts` — CreateOrderDto with class-validator decorators: orderNumber (`@IsString @MaxLength(100) @IsNotEmpty`), clientPhone (`@IsPhoneNumber`), pickupAddress/dropoffAddress (`@IsString @IsNotEmpty`), pickupLat/pickupLng/dropoffLat/dropoffLng (`@IsNumber @Min/@Max`), callbackUrl (`@IsUrl @IsOptional`), items (`@IsArray @ArrayMinSize(1) @ValidateNested @Type(() => OrderItemDto)`); nested OrderItemDto: name (`@IsString`), quantity (`@IsInt @Min(1)`), price (`@IsNumber @Min(0)`)
- [x] T021 [P] Create `src/orders/dto/order-response.dto.ts` — OrderResponseDto, ClientSummaryDto, OrderItemResponseDto, AuditEntryResponseDto, OrderListResponseDto (with MetaDto: total, page, limit, totalPages), OrderDetailResponseDto (extends OrderResponseDto, adds auditEntries array)

### Firebase Module

- [x] T022 [P] Create `src/firebase/firebase.module.ts` and `src/firebase/firebase.service.ts` — `FirebaseService` reads `FIREBASE_SERVICE_ACCOUNT_JSON` env var (base64-encoded service account JSON); calls `admin.initializeApp({ credential: admin.credential.cert(parsedJson) })` once (guard against re-init with `admin.apps.length`); exposes `getMessaging(): admin.messaging.Messaging`; add `FCM_DISABLED=false` env var for test mode (when `true`, `getMessaging()` returns a no-op stub); register `FIREBASE_SERVICE_ACCOUNT_JSON` and `FCM_DISABLED` in `src/config/env.validation.ts` (both optional with defaults); `FirebaseModule` is `@Global()` so any module can inject `FirebaseService`; register it in `AppModule`

### Module Skeleton

- [x] T023 Create `src/orders/orders.module.ts` — import `TypeOrmModule.forFeature([Order, OrderItem, OrderAuditEntry, Client])`; import `BullModule.registerQueue({ name: 'new-order-notify', defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnFail: false } })` from `@nestjs/bullmq`; import `FirebaseModule`; register `OrdersService`, `OrdersGateway`, `NewOrderNotifyProcessor` as providers; export `OrdersService`
- [x] T024 Register `OrdersModule` in `src/app.module.ts` — add `OrdersModule` to the imports array

**Checkpoint**: `pnpm typeorm migration:run` applies all 6 migrations cleanly. `pnpm build` compiles without errors. The new `UserRole` enum, `RolesGuard`, `JwtAuthGuard`, and `FirebaseModule` are all importable.

---

## Phase 3: User Story 1 — Operator Creates an Order Manually (Priority: P1) 🎯 MVP

**Goal**: An authenticated operator submits a valid order form; the order is created atomically (client resolved, items saved, audit entry written, delivery fee snapshotted), a BullMQ job is enqueued to notify couriers, and the new order is returned as a 201 response.

**Independent Test**: Run `pnpm seed:order-test`, use the printed JWT as `$ACCESS_TOKEN`, then execute Flows 1–5 from `quickstart.md`. Verify: 201 response with `status: "created"`, correct `delivery_fee`, `client.phone` present; same client.id reused on second submission (Flow 2); duplicate order_number → 409 (Flow 3); missing items → 400 (Flow 4); Courier JWT → 403 (Flow 5).

### Implementation

- [x] T025 [US1] Create `src/orders/orders.service.ts` — inject `DataSource`, `OrdersGateway` (forward reference), `@InjectQueue('new-order-notify') queue: Queue` from `@nestjs/bullmq`; implement `create(dto: CreateOrderDto, user: AuthUser)`: begin TypeORM transaction → load `Owner` by `user.ownerId` (throw `NotFoundException` if absent) → find-or-create `Client` by `(ownerId, phone)` catching `QueryFailedError` with `driverError.code === '23505'` → `INSERT Order` using `owner.defaultDeliveryFee` as `deliveryFee`, `user.userId` as `createdById`, `user.role` as `createdByRole` → `INSERT OrderItems` (one per dto.items) → `INSERT OrderAuditEntry` (action=`'created'`, actorId=`user.userId`, actorRole=`user.role`) → commit → call `this.ordersGateway.emitOrderCreated(ownerId, payload)` → call `this.queue.add('notify', { orderId: order.id, ownerId })` → return mapped `OrderResponseDto`; catch `QueryFailedError` with code `'23505'` on order INSERT → query existing order by `(ownerId, orderNumber)` → throw `ConflictException` with `{ message, existingOrderId }`
- [x] T026 [US1] Add `findAll(query: { status?, page, limit }, ownerId: string)` to `src/orders/orders.service.ts` — paginated `ORDER BY created_at DESC`; apply optional `status` WHERE clause; return `OrderListResponseDto` with meta (`total`, `page`, `limit`, `totalPages`)
- [x] T027 [P] [US3] Add `findOne(id: string, ownerId: string)` to `src/orders/orders.service.ts` — `LEFT JOIN` items and auditEntries; `WHERE id = :id AND owner_id = :ownerId`; throw `NotFoundException` if not found; return `OrderDetailResponseDto`
- [x] T028 [US1] Create `src/orders/orders.controller.ts` — `@Controller('orders') @UseGuards(JwtAuthGuard, RolesGuard)`; `POST /` → `@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)` → `create(dto, @Req() req)`; `GET /` → `@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)` → `findAll(query, req.user)`; `GET /:id` → same roles → `findOne(id, req.user.ownerId)`; inject `OrdersService`; `req.user` is `AuthUser` populated by `JwtAuthGuard`
- [x] T029 [US1] Create `src/orders/jobs/new-order-notify.processor.ts` — import `Processor`, `WorkerHost` from `@nestjs/bullmq`; `@Processor('new-order-notify') class NewOrderNotifyProcessor extends WorkerHost`; implement `process(job: Job<{ orderId, ownerId }>)`: query all `Courier` records where `ownerId = job.data.ownerId AND fcmToken IS NOT NULL`; for each courier, call `firebaseService.getMessaging().send({ token: courier.fcmToken, data: { orderId, orderNumber } })`; **NOTE (FR-008 / research.md Decision 4)**: "available" is currently defined as "has FCM token"; the open-work-shift filter is intentionally deferred to feature 005; on individual FCM failure: `logger.error(...)` and `continue` — do NOT throw (prevents job failure and dead-letter on per-courier FCM errors); if the whole courier query fails, allow the exception to propagate so BullMQ retries per `defaultJobOptions`
- [x] T030 [US1] Create `database/seeds/order-test.seed.ts` — using the app's TypeORM `DataSource`: find-or-create test `Owner` with `defaultDeliveryFee = 350.00`; find-or-create test `Courier` with `fcmToken = 'test-fcm-token-001'`; **do NOT create an operator user record** (operator auth is deferred to a future feature); instead, use `JwtService.sign({ sub: 'test-operator-uuid', owner_id: owner.id, role: UserRole.ORDER_OPERATOR })` to mint a test operator JWT; print `owner_id` and `ACCESS_TOKEN` to console; export the DataSource config for the script runner

**Checkpoint**: All quickstart.md Flows 1–5 pass using the JWT printed by `pnpm seed:order-test`. `POST /api/v1/orders` → 201. Duplicate order_number → 409 with `existingOrderId`. Missing items → 400. Courier JWT → 403.

---

## Phase 4: User Story 2 — External System Pushes an Order (Priority: P1)

**Goal**: An external system sends an order with a `callback_url`. The order is created identically to US1 and the callback URL is stored. A duplicate submission is rejected with a 409 that includes `existingOrderId`.

**Independent Test**: Execute quickstart.md Flow 7 (external system with `callback_url`). Verify: 201 with `callbackUrl` present in the response body. Submit the same `order_number` a second time → 409 with `existingOrderId` field populated.

**Note**: US2 uses the same `POST /api/v1/orders` endpoint as US1. All foundational work is already done. These tasks verify and complete the US2-specific fields.

- [x] T031 [US2] Verify `callbackUrl` round-trip in `src/orders/dto/create-order.dto.ts` and `src/orders/dto/order-response.dto.ts` — confirm `@IsUrl() @IsOptional() callbackUrl?: string` is present in `CreateOrderDto`; confirm `callbackUrl` is mapped in `OrderResponseDto`; confirm `OrdersService.create()` passes `dto.callbackUrl` to the Order entity; manually execute quickstart.md Flow 7 to confirm `callback_url` appears in the 201 response
- [x] T032 [US2] Verify `existingOrderId` in 409 response — confirm the `ConflictException` thrown in `OrdersService.create()` (T025) includes `existingOrderId` in its response body matching the `DuplicateOrderError` schema in `contracts/orders.yml`; execute quickstart.md Flow 3 and confirm the 409 body contains `existingOrderId`

**Checkpoint**: quickstart.md Flow 7 → 201 with `callbackUrl`. Duplicate order_number → 409 with `existingOrderId`. US1 acceptance scenarios still pass.

---

## Phase 5: User Story 3 — Manager Reviews Newly Created Orders (Priority: P2)

**Goal**: A Manager's order list view receives the `order:created` Socket.IO event the moment a new order is created, without refreshing the page. Couriers also receive `order:new_available` on their room.

**Independent Test**: Connect a WebSocket client using a Manager JWT (`wscat -c "ws://localhost:3000/socket.io/?token=$ACCESS_TOKEN&EIO=4&transport=websocket"`) and listen for events. Create an order via `POST /api/v1/orders` in a separate terminal. The WebSocket client must receive `order:created` within 3 seconds (quickstart.md Real-Time Verification section).

- [x] T033 [US3] Create `src/gateways/orders.gateway.ts` — `@WebSocketGateway({ cors: true }) OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect`; inject `JwtService`; `handleConnection(client: Socket)`: extract Bearer token from `client.handshake.auth.token` (or `Authorization` header), decode via `jwtService.verify()`, extract `ownerId` and `role`; if `role === UserRole.COURIER` join room `tenant:{ownerId}:couriers`; else join room `tenant:{ownerId}:staff`; `handleDisconnect`: log; expose `emitOrderCreated(ownerId: string, payload: object)`: calls `this.server.to('tenant:{ownerId}:staff').emit('order:created', payload)` AND `this.server.to('tenant:{ownerId}:couriers').emit('order:new_available', payload)`; `@WebSocketServer() server: Server` from `socket.io`
- [x] T034 [US3] Wire `OrdersGateway` into `OrdersService`: in `src/orders/orders.service.ts` (T025), inject `OrdersGateway` using `@Inject(forwardRef(() => OrdersGateway))`; after transaction commit and before enqueue, call `this.ordersGateway.emitOrderCreated(user.ownerId, { id: order.id, orderNumber: order.orderNumber, status: order.status, pickupAddress: order.pickupAddress, dropoffAddress: order.dropoffAddress, deliveryFee: order.deliveryFee, clientPhone: dto.clientPhone, createdAt: order.createdAt })`
- [x] T035 [US3] Add `OrdersGateway` to providers in `src/orders/orders.module.ts` (T023); add `forwardRef(() => OrdersModule)` cycle resolution if needed; import `JwtModule` (re-export from `AuthModule` is already available via `AuthModule` exports) so the gateway can call `jwtService.verify()`

**Checkpoint**: WebSocket client in `tenant:{ownerId}:staff` room receives `order:created` within 3 seconds of `POST /api/v1/orders`. WebSocket client in `tenant:{ownerId}:couriers` receives `order:new_available`. quickstart.md Real-Time Verification section passes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Swagger documentation, tests, and final validation.

- [x] T036 [P] Add Swagger decorators to `src/orders/orders.controller.ts` — `@ApiTags('orders')`, `@ApiBearerAuth()`, `@ApiOperation`, `@ApiCreatedResponse`, `@ApiOkResponse`, `@ApiConflictResponse`, `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse` per `contracts/orders.yml`
- [x] T037 [P] Add `@ApiProperty` decorators to all classes in `src/orders/dto/create-order.dto.ts` and `src/orders/dto/order-response.dto.ts` — include example values from `contracts/orders.yml`
- [x] T038 [P] Write unit tests for `OrdersService.create()` in `test/unit/orders/orders.service.spec.ts` — mock TypeORM `DataSource` and repository; test: happy path (returns `OrderResponseDto`), duplicate `order_number` (`ConflictException` with `existingOrderId`), empty items (rejected by DTO validator), `deliveryFee` snapshotted from `owner.defaultDeliveryFee`
- [x] T039 [P] Write integration/e2e tests in `test/e2e/orders.e2e-spec.ts` — full HTTP flow with real DB and Redis: POST happy path (201), duplicate `order_number` (409 with `existingOrderId`), missing items (400), `callback_url` stored (201), Courier JWT forbidden (403), GET /orders list (200 with pagination), GET /orders/:id (200 with items and audit entries), GET /orders/:id not in tenant (404)
- [ ] T040 Run quickstart.md full validation  ← requires running server (manual step) — execute Flows 1–7 plus the Real-Time Verification section; confirm all expected HTTP status codes and response bodies; **NOTE for Step 0**: use the `ACCESS_TOKEN` printed by `pnpm seed:order-test` (the seed mints an operator JWT directly — `POST /api/v1/auth/operator/login` does not exist yet; operator auth is a future feature)
- [x] T041 [P] Update `specs/002-order-ingestion/tasks.md` — mark all completed tasks; confirm no tasks remain open

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T001 and T002 can run in parallel
- **Foundational (Phase 2)**: Depends on T001 + T002 completion; BLOCKS all user stories
  - T003–T008 (migrations): parallel
  - T009–T013 (auth infrastructure): parallel with migrations
  - T014–T019 (entities): parallel; logically after migrations are designed
  - T020–T021 (DTOs): parallel with entities
  - T022 (Firebase): parallel with entities/DTOs
  - T023 (module): depends on T014–T022
  - T024 (AppModule): depends on T023
- **US1 (Phase 3)**: All of Foundational must be complete
- **US2 (Phase 4)**: T025–T030 must be complete (US2 verifies callback_url and 409 body)
- **US3 (Phase 5)**: T025 must be complete (gateway wires into service); T002 must be complete (Socket.IO adapter)
- **Polish (Phase 6)**: All desired story phases complete

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational — no dependency on US2 or US3
- **US2 (P1)**: Starts after US1 (T025–T030 complete)
- **US3 (P2)**: Starts after US1 (T025 complete); T027 (findOne) can be done in parallel with US1 service tasks

### Within Phase 2 Parallel Opportunities

```
Parallel batch 1 — migrations + auth infra (all different files):
  T003: 007_add_owner_default_delivery_fee.ts
  T004: 008_add_courier_fcm_token.ts
  T005: 009_create_clients.ts
  T006: 010_create_orders.ts
  T007: 011_create_order_items.ts
  T008: 012_create_order_audit_entries.ts
  T009: user-role.enum.ts
  T010: roles.decorator.ts
  T011: jwt-auth.guard.ts
  T012: roles.guard.ts

Parallel batch 2 — entities + DTOs + Firebase (all different files):
  T013: jwt-payload.interface.ts (update)
  T014: client.entity.ts
  T015: order.entity.ts
  T016: order-item.entity.ts
  T017: order-audit-entry.entity.ts
  T018: owner.entity.ts (update)
  T019: courier.entity.ts (update)
  T020: create-order.dto.ts
  T021: order-response.dto.ts
  T022: firebase.module.ts + firebase.service.ts

Sequential:
  T023: orders.module.ts (needs entities, Firebase, queue)
  T024: app.module.ts (needs OrdersModule)
```

---

## Parallel Example: User Story 1

```
Sequential (service methods, share one file):
  T025 → T026 → T028   (service create → findAll → controller)

Parallel with T026:
  T027: findOne() [US3]   (different logical section of same file, can be done by second dev)
  T029: new-order-notify.processor.ts   (different file entirely)
  T030: order-test.seed.ts              (different file entirely)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001–T002 — install deps + Socket.IO adapter
2. Phase 2 (T003–T024) — Foundational
3. Phase 3 (T025–T030) — US1: service + controller + BullMQ processor + seed
4. **STOP and VALIDATE**: `pnpm seed:order-test`, execute quickstart.md Flows 1–5
5. MVP shipped: operators can create orders, clients auto-resolved, couriers notified via FCM

### Incremental Delivery

1. MVP (US1 done) → validate → demo
2. US2 (T031–T032): callback_url + 409 body → validate → demo
3. US3 (T033–T035): real-time Socket.IO → validate → demo
4. Polish (T036–T041): Swagger, tests, final sign-off

### Parallel Team Strategy

With two developers after Foundational phase complete:
- **Dev A**: US1 T025–T030 (service + controller + BullMQ)
- **Dev B**: US3 T033–T035 (Socket.IO gateway — wires into service at T034 as final step)

---

## Notes

- `[P]` tasks can run in parallel within their phase — different files, no unresolved dependencies
- `[Story]` labels map tasks to spec user stories for traceability
- **Operator auth**: no `users` table for operators exists yet; T030 seed mints a JWT directly; `POST /api/v1/auth/operator/login` is a future feature — do not attempt to call it
- **FR-008 partial**: "available courier" = "has FCM token" in this feature; open-shift filter added in feature 005
- **Role string canonical form**: `UserRole.ORDER_OPERATOR = 'order_operator'` (matches constitution "Order Operator" role)
- **`@nestjs/bullmq` (not `@nestjs/bull`)**: all queue imports use `@nestjs/bullmq`; processor extends `WorkerHost`, uses `@Processor` from `@nestjs/bullmq`
- `owner_id` always comes from JWT claims — never from the request payload (FR-012)
- Commit after each phase checkpoint at minimum
