# Implementation Plan: Order Lifecycle

**Branch**: `003-order-lifecycle` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-order-lifecycle/spec.md`

## Summary

Implement the full order lifecycle for the AI-First Couriers backend. Couriers can view available orders, claim one atomically (first-writer-wins via DB UPDATE), and progress it through `assigned → picked_up → in_delivery → completed`. Operators/Managers/Owners can cancel at any non-terminal state. On completion, a `DeliveryRecord` and `CourierEarning` entry are created in the same transaction. Every status change: (1) appends an audit entry, (2) emits `order:status_changed` via Socket.IO to the staff room, (3) optionally enqueues an external HTTP callback if `callback_url` is set. Work-shift gate (FR-015) is wired but delegates to a stub (feature 005 implements it).

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, BullMQ (`@nestjs/bullmq`), Socket.IO (Redis adapter), `class-validator`/`class-transformer`, `@nestjs/jwt`
**Storage**: PostgreSQL — 3 DB migrations: add lifecycle columns to `orders`, create `delivery_records`, create `courier_earnings`
**Testing**: Jest (unit), supertest (e2e/integration)
**Target Platform**: Linux server (Docker), multi-pod Kubernetes
**Project Type**: web-service (NestJS REST API additions to existing project)
**Performance Goals**: Each status transition < 500ms p95 (SC-001); Socket.IO update ≤ 3s (SC-004); callback delivery ≤ 10s p95 (SC-005)
**Constraints**: Atomic claim (single targeted UPDATE, FR-003); exactly-once earnings per order (UNIQUE on `order_id`); multi-tenant isolation at service layer; no backward transitions
**Scale/Scope**: ~1000 orders/day per tenant; concurrent claim contention handled at DB layer

## Constitution Check

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | All state transitions go through `OrderLifecycleService` only. Status mutation outside this service is structurally impossible (no direct `order.status = x` in other services). Atomic updates + audit entries on every transition. |
| II. Real-Time as First-Class | ✅ PASS | `order:status_changed` Socket.IO event emitted after every transition commit. `order:cancelled` also emitted to couriers room when assigned courier exists. Redis adapter in place from feature 002. |
| III. API Contract Stability | ✅ PASS | All new endpoints under `/api/v1/orders/:id/{action}`. Swagger decorators required. Contract in `contracts/order-lifecycle.yml`. |
| IV. Role-Based Authorization | ✅ PASS | Courier endpoints: `@Roles(UserRole.COURIER)`. Cancel endpoint: `@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ORDER_OPERATOR)`. Available-orders list: `@Roles(UserRole.COURIER)`. All guards at controller layer. |
| V. Background Jobs Idempotent | ✅ PASS | `order-callback` queue: idempotent because HTTP POST to partner is best-effort; duplicate delivery of a `picked_up` callback is acceptable (partner deduplicates by order_id+status). FCM cancel notification: same per-courier graceful-degradation pattern as feature 002. |
| VI. Multi-Tenant Isolation | ✅ PASS | All queries include `owner_id` from JWT. `delivery_records` and `courier_earnings` both carry `owner_id`. Claim endpoint verifies `owner_id` matches courier's tenant. |
| VII. Simplicity | ✅ PASS | No external state machine library. Simple transition map in service. `OrderLifecycleService` is justified by Constitution Principle I (not speculative). |
| VIII. Admin Panel Single-Page UX | ✅ PASS | Status change visible in order detail drawer (real-time via Socket.IO). Cancel action in order detail drawer via Modal confirmation. No new pages. |

No violations.

### Post-Design Re-Check (after Phase 1)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | `COURIER_TRANSITIONS` and `OPERATOR_TRANSITIONS` maps enforce valid transitions. Audit entry created in same transaction as every status update. |
| V. Background Jobs Idempotent | ✅ PASS | `courier_earnings` has UNIQUE on `order_id` — duplicate job execution produces an upsert-safe no-op (or DB constraint prevents double earnings). |
| VI. Multi-Tenant Isolation | ✅ PASS | `delivery_records` and `courier_earnings` both carry `owner_id` FK. All queries include `owner_id`. |

## Project Structure

### Documentation (this feature)

```text
specs/003-order-lifecycle/
├── plan.md              # This file
├── research.md          # Phase 0 output — 9 key decisions
├── data-model.md        # Phase 1 output — 3 migrations, 2 new tables
├── quickstart.md        # Phase 1 output — 9 test flows
├── contracts/
│   └── order-lifecycle.yml   # OpenAPI 3.1 — 6 action endpoints + Socket.IO events
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root additions)

```text
src/
├── orders/
│   ├── dto/
│   │   ├── order-lifecycle-response.dto.ts   # OrderLifecycleResponseDto, AvailableOrderDto, CancelOrderDto
│   │   └── available-orders-response.dto.ts  # AvailableOrdersListDto + MetaDto
│   ├── entities/
│   │   ├── delivery-record.entity.ts         # DeliveryRecord TypeORM entity
│   │   └── courier-earning.entity.ts         # CourierEarning TypeORM entity
│   ├── jobs/
│   │   ├── order-callback.processor.ts       # BullMQ: HTTP POST to callback_url
│   │   └── cancel-notify.processor.ts        # BullMQ: FCM push to assigned courier on cancel
│   ├── order-lifecycle.service.ts            # All status transitions (claim, pickup, start-delivery, complete, cancel)
│   ├── order-lifecycle.controller.ts         # 5 action endpoints + GET /orders/available
│   └── orders.module.ts                      # Updated: add new entities, queues, providers
│
└── orders/entities/order.entity.ts           # Updated: courier_id + lifecycle timestamp columns

database/
└── migrations/
    ├── 013_add_order_lifecycle_columns.ts    # courier_id, assigned_at, ..., cancelled_at on orders
    ├── 014_create_delivery_records.ts
    └── 015_create_courier_earnings.ts

database/seeds/
└── order-lifecycle-test.seed.ts             # 1 owner, 2 couriers with FCM tokens, operator JWT + 2 courier JWTs
```

## Key Design Decisions Summary

| Decision | Choice | Reference |
|----------|--------|-----------|
| Claim atomicity | Single `UPDATE … WHERE status='created' AND courier_id IS NULL`; 0 affectedRows → 409 | research.md §1 |
| Transition validation | `COURIER_TRANSITIONS` + `OPERATOR_TRANSITIONS` maps in service | research.md §2 |
| Work-shift gate | Stub (always passes); wired for feature 005 | research.md §3 |
| One active order per courier | Service-layer count check before claim | research.md §4 |
| Earnings + delivery record | Same transaction as `completed` transition | research.md §5 |
| External callback | BullMQ `order-callback` queue; 5 retries, exponential backoff | research.md §6 |
| Socket.IO events | `order:status_changed` to staff room; `order:cancelled` to couriers room | research.md §7 |
| Service boundary | `OrderLifecycleService` separate from `OrdersService` | research.md §8 |
| API design | POST action endpoints (not PATCH) | research.md §9 |

## Implementation Phases (for /speckit.tasks)

### Phase A: Database Layer
1. Migration `013`: Add `courier_id UUID NULL FK→couriers`, `assigned_at`, `picked_up_at`, `in_delivery_at`, `completed_at`, `cancelled_at` (all TIMESTAMPTZ NULL) to `orders`; add `idx_orders_courier_id` index
2. Migration `014`: Create `delivery_records` table (id, owner_id, order_id UNIQUE, courier_id, delivery_fee, completed_at, created_at) + indexes
3. Migration `015`: Create `courier_earnings` table (id, owner_id, courier_id, order_id UNIQUE, amount, earned_at, created_at) + indexes

### Phase B: Entities
4. Update `src/orders/entities/order.entity.ts` — add `courier_id`, `@ManyToOne Courier`, and 5 lifecycle timestamp columns
5. Create `src/orders/entities/delivery-record.entity.ts`
6. Create `src/orders/entities/courier-earning.entity.ts`

### Phase C: DTOs
7. Create `src/orders/dto/order-lifecycle-response.dto.ts` — `OrderLifecycleResponseDto` (full order with lifecycle fields), `CancelOrderDto`
8. Create `src/orders/dto/available-orders-response.dto.ts` — `AvailableOrderDto`, `AvailableOrdersListDto`

### Phase D: Core Service
9. Create `src/orders/order-lifecycle.service.ts`:
   - `COURIER_TRANSITIONS` and `OPERATOR_TRANSITIONS` maps
   - `getAvailableOrders(query, courierId, ownerId)` — paginated, status=created, ORDER BY created_at ASC
   - `claim(id, user: AuthUser)` — UPDATE WHERE status=created AND courier_id IS NULL, check affectedRows, check active order count; emit event, enqueue cancel-notify if applicable
   - `advanceStatus(id, targetStatus, user: AuthUser)` — generic transition for pickup/start-delivery/complete; validates courier is assigned courier; on complete: create DeliveryRecord + CourierEarning in same tx
   - `cancel(id, reason, user: AuthUser)` — validates non-terminal; clears courier_id; enqueues FCM cancel-notify + callback if applicable; emits Socket.IO event
   - All methods append to `order_audit_entries`; emit `order:status_changed` post-commit

### Phase E: Controller
10. Create `src/orders/order-lifecycle.controller.ts`:
    - `GET /orders/available` — `@Roles(COURIER)`
    - `POST /orders/:id/claim` — `@Roles(COURIER)`
    - `POST /orders/:id/pickup` — `@Roles(COURIER)`
    - `POST /orders/:id/start-delivery` — `@Roles(COURIER)`
    - `POST /orders/:id/complete` — `@Roles(COURIER)`
    - `POST /orders/:id/cancel` — `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`
    - Swagger decorators per `contracts/order-lifecycle.yml`

### Phase F: Background Jobs
11. Create `src/orders/jobs/order-callback.processor.ts` — `@Processor('order-callback')`; HTTP POST to `callbackUrl`; payload `{ order_id, status, timestamp }`; idempotent (no side-effects on retry); log and propagate on HTTP failure (BullMQ handles retry)
12. Create `src/orders/jobs/cancel-notify.processor.ts` — `@Processor('courier-cancel-notify')`; FCM push to assigned courier's `fcm_token`; same graceful-degradation pattern as `new-order-notify`

### Phase G: Module Wiring
13. Update `src/orders/orders.module.ts` — register `DeliveryRecord`, `CourierEarning` in `TypeOrmModule.forFeature`; register `order-callback` and `courier-cancel-notify` BullMQ queues; add `OrderLifecycleService`, `OrderLifecycleController`, `OrderCallbackProcessor`, `CancelNotifyProcessor` to providers/controllers

### Phase H: Seed and Tests
14. Create `database/seeds/order-lifecycle-test.seed.ts` — upsert Owner (delivery_fee=350), upsert 2 Couriers with FCM tokens, mint OPERATOR_TOKEN + COURIER_TOKEN_1 + COURIER_TOKEN_2
15. Unit tests `src/orders/order-lifecycle.service.spec.ts` — mock DataSource + gateway + queues; test: claim happy path, claim conflict (409), claim with active order (409), complete creates earnings, cancel terminal (422), invalid transition (422)
16. E2E tests `test/e2e/order-lifecycle.e2e-spec.ts` — full HTTP flows matching quickstart Flows 1–8

## Complexity Tracking

No constitution violations. No speculative complexity introduced.
