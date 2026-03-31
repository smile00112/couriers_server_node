# Implementation Plan: Order Ingestion

**Branch**: `002-order-ingestion` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-order-ingestion/spec.md`

## Summary

Implement order ingestion for the AI-First Couriers backend. Authenticated operators, managers, and owners can create orders — either manually via the REST API or through an external integration using the same endpoint. Each creation: resolves or creates a client by phone, writes the order + items + audit entry in a single database transaction, snapshots the tenant's configured delivery fee, emits a real-time Socket.IO event to all staff in the tenant, and enqueues a BullMQ job to push FCM notifications to available couriers. Order numbers are unique per tenant (enforced by DB constraint). The courier role is explicitly forbidden from creating orders.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, `@nestjs/jwt`, `@nestjs/throttler` (Redis store), BullMQ, `class-validator`/`class-transformer`, `socket.io`, Firebase Admin SDK (FCM)
**Storage**: PostgreSQL — 4 new tables (`clients`, `orders`, `order_items`, `order_audit_entries`); 2 columns added to existing tables (`owners.default_delivery_fee`, `couriers.fcm_token`)
**Testing**: Jest (unit), supertest (e2e/integration)
**Target Platform**: Linux server (Docker), multi-pod Kubernetes
**Project Type**: web-service (NestJS REST API)
**Performance Goals**: Order creation < 500ms p95; courier FCM notification ≤ 3s (SC-003); operator Socket.IO update ≤ 3s (SC-004)
**Constraints**: Atomic order creation (single DB transaction, FR-003); multi-tenant isolation at service layer (FR-012, Principle VI); no geocoding of coordinates
**Scale/Scope**: ~1000 orders/day per tenant; multi-tenant SaaS; supports concurrent order submission

## Constitution Check

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | Initial status `created` — first state in the authoritative lifecycle. Status field is set once at creation; no transitions in this feature. Feature 003 owns all transitions. |
| II. Real-Time as First-Class | ✅ PASS | `order:created` Socket.IO event emitted in-process post-commit. `order:new_available` emitted from BullMQ processor to couriers room. Redis adapter ensures multi-pod delivery. |
| III. API Contract Stability | ✅ PASS | Versioned endpoint `/api/v1/orders`. Swagger decorators required on all endpoints. OpenAPI contract in `contracts/orders.yml`. |
| IV. Role-Based Authorization | ✅ PASS | Roles allowed: Owner, Manager, Order Operator. Courier role returns 403 (FR-010). Guard declared at controller level, not inside service. |
| V. Background Jobs Idempotent | ✅ PASS | `new-order-notify` job keyed on `orderId`. Running it twice delivers the same FCM notification with no side-effects beyond the first run. FCM failure is logged and moves to dead-letter; does not roll back the order. |
| VI. Multi-Tenant Isolation | ✅ PASS | `owner_id` sourced exclusively from JWT claims; never from request payload (FR-012). All queries include `owner_id` filter. |
| VII. Simplicity | ✅ PASS | Clients co-located in orders module (no separate module for a single consumer). Flat delivery fee on `owners` table (no pricing engine). No speculative abstractions. |
| VIII. Admin Panel Single-Page UX | ✅ PASS | Orders list table + create drawer + detail drawer. No separate pages. All interactions via Ant Design Drawer/Modal per constitution rules. |

No violations to document.

### Post-Design Re-Check (after Phase 1)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | `order_audit_entries` table captures creation event. No other status mutations in this feature. |
| II. Real-Time as First-Class | ✅ PASS | Socket.IO event defined in contracts/orders.yml. Room strategy documented in research.md. |
| VI. Multi-Tenant Isolation | ✅ PASS | All 4 new tables carry `owner_id` FK. `order_items` and `order_audit_entries` denormalize `owner_id` for fast scoped queries without joins. |

## Project Structure

### Documentation (this feature)

```text
specs/002-order-ingestion/
├── plan.md                  # This file
├── research.md              # Phase 0 output — 7 key decisions
├── data-model.md            # Phase 1 output — 4 new tables, 2 modified
├── quickstart.md            # Phase 1 output — local setup + test flows
├── contracts/
│   └── orders.yml           # OpenAPI 3.1 contract — REST + Socket.IO events
└── tasks.md                 # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
src/
├── orders/
│   ├── dto/
│   │   ├── create-order.dto.ts        # CreateOrderRequest schema + class-validator
│   │   └── order-response.dto.ts      # OrderResponse, OrderListResponse, OrderDetailResponse
│   ├── entities/
│   │   ├── order.entity.ts            # Order TypeORM entity
│   │   ├── order-item.entity.ts       # OrderItem TypeORM entity
│   │   └── order-audit-entry.entity.ts
│   ├── jobs/
│   │   └── new-order-notify.processor.ts  # BullMQ processor: FCM push + Socket.IO courier room
│   ├── orders.controller.ts           # POST /orders, GET /orders, GET /orders/:id
│   ├── orders.service.ts              # Transactional create, list, findOne
│   └── orders.module.ts
├── clients/
│   └── entities/
│       └── client.entity.ts           # Client TypeORM entity (managed by orders module)
└── gateways/
    └── orders.gateway.ts              # Socket.IO gateway — emits order:created to staff room

database/
└── migrations/
    ├── 007_add_owner_default_delivery_fee.ts
    ├── 008_add_courier_fcm_token.ts
    ├── 009_create_clients.ts
    ├── 010_create_orders.ts
    ├── 011_create_order_items.ts
    └── 012_create_order_audit_entries.ts

database/seeds/
└── order-test.seed.ts    # Seed: operator user, owner with delivery_fee=350, courier with fcm_token
```

**Structure Decision**: Single NestJS project. `clients` entity is declared in its own directory but registered in `OrdersModule` — no separate `ClientsModule` is justified at this scale (Principle VII). The `OrdersGateway` may live in a shared `gateways/` folder if a gateway module already exists, or be declared directly in `OrdersModule`.

## Key Design Decisions Summary

| Decision | Choice | Reference |
|----------|--------|-----------|
| Initial order status | `created` | research.md §1 |
| Client find-or-create | UNIQUE constraint + `23505` catch | research.md §2 |
| Delivery fee | `owners.default_delivery_fee` column | research.md §3 |
| Available courier target | All couriers with `fcm_token` (shift filter in feature 005) | research.md §4 |
| Socket.IO staff room | `tenant:{ownerId}:staff` | research.md §5 |
| Duplicate order number | DB UNIQUE + 409 on violation | research.md §6 |
| FCM vs Socket.IO split | FCM via BullMQ, Socket.IO in-process | research.md §7 |

## Implementation Phases (for /speckit.tasks)

The following phases are provided as input to the `/speckit.tasks` command.

### Phase A: Database Layer
1. Migration `007`: `ALTER TABLE owners ADD COLUMN default_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0`
2. Migration `008`: `ALTER TABLE couriers ADD COLUMN fcm_token VARCHAR(255)`
3. Migration `009`: Create `clients` table with UNIQUE `(owner_id, phone)`
4. Migration `010`: Create `orders` table with UNIQUE `(owner_id, order_number)`, indexes on `(owner_id, status)` and `(owner_id, created_at DESC)`
5. Migration `011`: Create `order_items` table
6. Migration `012`: Create `order_audit_entries` table

### Phase B: TypeORM Entities
7. `Client` entity (clients table)
8. `Order` entity (orders table)
9. `OrderItem` entity (order_items table)
10. `OrderAuditEntry` entity (order_audit_entries table)
11. Update `Owner` entity with `defaultDeliveryFee` field
12. Update `Courier` entity with `fcmToken` field

### Phase C: DTOs and Validation
13. `CreateOrderDto` with class-validator decorators matching `contracts/orders.yml`
14. `OrderResponseDto`, `OrderListResponseDto`, `OrderDetailResponseDto`

### Phase D: Service Layer
15. `OrdersService.create()` — transactional: find-or-create client, insert order + items + audit entry, snapshot delivery fee; emit Socket.IO event post-commit; enqueue BullMQ job
16. `OrdersService.findAll()` — paginated list scoped by `owner_id`, optional status filter
17. `OrdersService.findOne()` — single order with items and audit entries, scoped by `owner_id`
18. Exception mapping: `23505` → `ConflictException(409)` for duplicate order number; other DB errors propagated as `InternalServerErrorException`

### Phase E: Controller
19. `OrdersController` — `POST /api/v1/orders`, `GET /api/v1/orders`, `GET /api/v1/orders/:id`
20. Role guard: allow `[Owner, Manager, Operator]`; block `Courier` with 403
21. Swagger decorators on all endpoints matching `contracts/orders.yml`

### Phase F: Real-Time
22. `OrdersGateway` — Socket.IO gateway; `handleConnection` assigns client to `tenant:{ownerId}:staff` or `tenant:{ownerId}:couriers` based on JWT role; exposes `emitOrderCreated()` method called by the service
23. `NewOrderNotifyProcessor` — BullMQ processor; queries all couriers in tenant with non-null `fcm_token`; sends FCM push via Firebase Admin SDK; also emits `order:new_available` to `tenant:{ownerId}:couriers` room; idempotent (no side-effects on retry after first FCM success)

### Phase G: Module Wiring
24. `OrdersModule` — imports TypeORM entities, BullMQ queue, registers processor, exports service
25. Register `OrdersModule` in `AppModule`

### Phase H: Seed and Tests
26. `order-test.seed.ts` — creates operator user, configures `owners.default_delivery_fee`, adds `couriers.fcm_token`
27. Unit tests: `OrdersService` (mock repository), exception mapping
28. Integration tests: full create flow (DB + Redis), duplicate rejection, validation errors, role guard
