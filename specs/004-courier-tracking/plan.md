# Implementation Plan: Courier Tracking

**Branch**: `004-courier-tracking` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-courier-tracking/spec.md`

## Summary

Implement real-time GPS location tracking for couriers. Couriers submit coordinates via `POST /couriers/location`; the platform UPSERTs their current position, appends an append-only history entry (with Haversine distance), links the entry to the courier's active order when one exists, emits `courier:location_updated` via Socket.IO to the staff room, and optionally enqueues an external HTTP callback. Operators can retrieve the full route for any order via `GET /orders/:id/route`. Rate limiting (1 update / 5s per courier) is enforced via a custom `@nestjs/throttler` guard keyed on the authenticated courier ID.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, BullMQ (`@nestjs/bullmq`), Socket.IO (Redis adapter), `class-validator`/`class-transformer`, `@nestjs/throttler` (Redis store)
**Storage**: PostgreSQL — 2 DB migrations: create `courier_positions`, create `courier_location_history`
**Testing**: Jest (unit), supertest (e2e/integration)
**Target Platform**: Linux server (Docker), multi-pod Kubernetes
**Project Type**: web-service (NestJS REST API additions to existing project)
**Performance Goals**: Location update persisted + Socket.IO emitted < 1s p95 (SC-005); Dashboard update within 3s (SC-001); External callback delivery ≤ 10s p95
**Constraints**: Rate limit per courier (not per IP); Haversine inline (no geolib dependency); multi-tenant isolation at service layer; distance stored as DECIMAL(10,2) meters
**Scale/Scope**: ~1000 GPS updates/hour per active courier; multiple concurrent couriers per tenant

## Constitution Check

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ PASS | `CourierTrackingService` reads order status only; never modifies `orders.status`. Existing `OrderLifecycleService` remains the sole owner of transitions. |
| II. Real-Time as First-Class | ✅ PASS | `courier:location_updated` Socket.IO event emitted after every accepted update to `tenant:{ownerId}:staff` room. Wired before REST response is sent. |
| III. API Contract Stability | ✅ PASS | New endpoints under `/api/v1/couriers/location` and `/api/v1/orders/:id/route`. Swagger decorators required. Contract in `contracts/courier-tracking.yml`. |
| IV. Role-Based Authorization | ✅ PASS | Location submit: `@Roles(COURIER)`. Route history: `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`. All guards at controller layer. |
| V. Background Jobs Idempotent | ✅ PASS | `location-callback` queue: HTTP POST to partner. Duplicate delivery of the same location point is acceptable; partner deduplicates by `courier_id + timestamp`. |
| VI. Multi-Tenant Isolation | ✅ PASS | Both new tables carry `owner_id` FK. Active order lookup includes `owner_id`. Route history query includes `owner_id`. |
| VII. Simplicity | ✅ PASS | Haversine inline (~10 lines). No geolib dependency. No new gateway class — `emitLocationUpdated` added as a method on existing `OrdersGateway`. |
| VIII. Admin Panel Single-Page UX | ✅ PASS | Route history visible in order detail drawer (right-side panel). No new pages. |

No violations.

### Post-Design Re-Check (after Phase 1)

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Real-Time | ✅ PASS | `emitLocationUpdated` method on `OrdersGateway`; emits to staff room only. Couriers do not receive location events for other couriers. |
| V. Idempotency | ✅ PASS | `location-callback` job has no unique DB write — HTTP POST is inherently idempotent for this use case. |
| VI. Multi-Tenant | ✅ PASS | `courier_positions.owner_id`, `courier_location_history.owner_id` both required fields. Active order lookup scoped to `owner_id`. |

## Project Structure

### Documentation (this feature)

```text
specs/004-courier-tracking/
├── plan.md              # This file
├── research.md          # Phase 0 output — 9 key decisions
├── data-model.md        # Phase 1 output — 2 migrations, 2 new tables
├── quickstart.md        # Phase 1 output — 8 test flows
├── contracts/
│   └── courier-tracking.yml   # OpenAPI 3.1 — 2 endpoints + Socket.IO event
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root additions)

```text
src/
├── couriers/
│   ├── dto/
│   │   ├── submit-location.dto.ts          # SubmitLocationDto (lat, lng with validation)
│   │   └── location-history-response.dto.ts # LocationResponseDto, RoutePointDto, RouteHistoryResponseDto
│   ├── entities/
│   │   ├── courier-position.entity.ts      # CourierPosition (UPSERT current position)
│   │   └── courier-location-history.entity.ts # CourierLocationHistory (append-only)
│   ├── jobs/
│   │   └── location-callback.processor.ts  # BullMQ: HTTP POST location to callback_url
│   ├── courier-tracking.service.ts         # submitLocation(), getOrderRoute()
│   └── courier-tracking.controller.ts      # POST /couriers/location, GET /orders/:id/route

database/
└── migrations/
    ├── 016_create_courier_positions.ts
    └── 017_create_courier_location_history.ts
```

## Key Design Decisions Summary

| Decision | Choice | Reference |
|----------|--------|-----------|
| Current position storage | `courier_positions` table, UPSERT on each update | research.md §1 |
| History storage | Append-only `courier_location_history`, order_id nullable FK | research.md §2 |
| Rate limiting | `@nestjs/throttler` Redis store, keyed by courier `userId`, 1/5s | research.md §3 |
| Active order detection | Query orders WHERE status IN ('assigned','picked_up','in_delivery') AND courier_id | research.md §4 |
| Distance calculation | Haversine inline TypeScript, no external lib | research.md §5 |
| Real-time dispatch | `emitLocationUpdated()` method on existing `OrdersGateway` | research.md §6 |
| External callback | New `location-callback` BullMQ queue, 3 retries exponential | research.md §7 |
| 90-day retention | Index in place; cleanup job deferred to feature 006 | research.md §8 |
| Coordinate precision | DECIMAL(10,7), validation: lat∈[-90,90], lng∈[-180,180] | research.md §9 |

## Implementation Phases (for /speckit.tasks)

### Phase A: Database Layer
1. Migration `016`: Create `courier_positions` table (id, owner_id, courier_id UNIQUE, lat, lng, recorded_at, created_at, updated_at) + `idx_courier_positions_owner`
2. Migration `017`: Create `courier_location_history` table (id, owner_id, courier_id, order_id NULL, lat, lng, distance_meters, recorded_at) + 3 indexes

### Phase B: Entities
3. Create `src/couriers/entities/courier-position.entity.ts`
4. Create `src/couriers/entities/courier-location-history.entity.ts`

### Phase C: DTOs
5. Create `src/couriers/dto/submit-location.dto.ts` — `SubmitLocationDto` with `@IsNumber @Min(-90) @Max(90) lat`, `@IsNumber @Min(-180) @Max(180) lng`
6. Create `src/couriers/dto/location-history-response.dto.ts` — `LocationResponseDto`, `RoutePointDto`, `RouteHistoryResponseDto`

### Phase D: Core Service
7. Create `src/couriers/courier-tracking.service.ts`:
   - `submitLocation(dto, user: AuthUser)`: (1) find active order for courier; (2) load previous position for distance calculation; (3) compute Haversine distance; (4) UPSERT `courier_positions`; (5) INSERT `courier_location_history`; (6) emit `courier:location_updated` via gateway; (7) enqueue `location-callback` if active order has `callback_url`; return `LocationResponseDto`
   - `getOrderRoute(orderId, ownerId)`: verify order belongs to tenant; query `courier_location_history WHERE order_id = orderId ORDER BY recorded_at ASC`; return `RouteHistoryResponseDto` with summed `total_distance_meters`
   - Private `haversineMeters(lat1, lng1, lat2, lng2): number`

### Phase E: Controller
8. Create `src/couriers/courier-tracking.controller.ts`:
   - `POST /couriers/location` — `@Roles(COURIER)` + location throttle guard
   - `GET /orders/:id/route` — `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`
   - Swagger decorators per `contracts/courier-tracking.yml`

### Phase F: Background Job
9. Create `src/couriers/jobs/location-callback.processor.ts` — `@Processor('location-callback')`; HTTP POST to `callbackUrl` with `{ courier_id, order_id, lat, lng, timestamp }`; throw on non-2xx for retry; idempotent

### Phase G: Module Wiring
10. Update `src/couriers/couriers.module.ts` — register `CourierPosition`, `CourierLocationHistory` in `TypeOrmModule.forFeature`; register `location-callback` BullMQ queue; add `CourierTrackingService`, `CourierTrackingController`, `LocationCallbackProcessor` to providers/controllers; import `OrdersModule` (for `OrdersGateway`)

### Phase H: Gateway Extension
11. Add `emitLocationUpdated(ownerId, payload)` method to `src/gateways/orders.gateway.ts`

### Phase I: Seed and Tests
12. Unit tests `src/couriers/courier-tracking.service.spec.ts` — mock DataSource + gateway + queue; test: submit no active order → distance=0, order_id=null; submit with active order → order_id set; submit twice → distance>0; invalid coords → ValidationPipe rejects; getOrderRoute → summed distance
13. E2E tests `test/e2e/courier-tracking.e2e-spec.ts` — full HTTP flows matching quickstart.md Flows 1–8

## Complexity Tracking

No constitution violations. No speculative complexity introduced.
