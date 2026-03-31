# Implementation Plan: Payout Reconciliation

**Branch**: `008-payout-reconciliation` | **Date**: 2026-03-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-payout-reconciliation/spec.md`

## Summary

Add staff-facing payout reconciliation: create date-range payout periods, aggregate courier earnings summaries, close periods, and record immutable per-courier payout records. Add courier self-service earnings and payout history endpoints. Reads existing `courier_earnings` table; introduces two new entities (`PayoutPeriod`, `Payout`) in a new `PayoutsModule`.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, class-validator/class-transformer, @nestjs/swagger
**Storage**: PostgreSQL (2 new tables: `payout_periods`, `payouts`; reads `courier_earnings`)
**Testing**: Jest (unit + integration, consistent with existing test suite)
**Target Platform**: Linux server (Docker container)
**Project Type**: REST web-service (NestJS)
**Performance Goals**: Period summary query < 3 seconds; mark-paid < 1 second; courier earnings page < 2 seconds
**Constraints**: Multi-tenant isolation enforced at service layer; payout records immutable once created; no Socket.IO events for payout actions
**Scale/Scope**: Per-tenant operation; tens of couriers, hundreds of periods, thousands of earnings records

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Order Lifecycle Integrity | ✅ Pass | Reads `courier_earnings`; does not touch orders or order state transitions |
| II. Real-Time as First-Class | ✅ Pass | Payout reconciliation is a batch/back-office workflow; no real-time events needed per research decision #7 |
| III. API Contract Stability | ✅ Pass | All endpoints have Swagger decorators; no breaking changes to existing contracts |
| IV. Role-Based Authorization | ✅ Pass | Every endpoint declares explicit `@Roles()` guard; staff = owner/manager/order_operator; courier = courier only |
| V. Background Jobs Idempotent | ✅ Pass | No new BullMQ jobs introduced |
| VI. Multi-Tenant Isolation | ✅ Pass | All queries include `owner_id` filter; unique constraint scoped within period (which is already tenant-scoped) |
| VII. No Speculative Complexity | ✅ Pass | No abstractions beyond what the feature requires; no BullMQ jobs, no caching layer, no repository pattern |
| VIII. Admin Panel UX | ⚠️ N/A | Backend-only feature; admin panel UI deferred to a future frontend ticket |

*Post-design re-check*: All principles pass. No complexity violations to document.

## Project Structure

### Documentation (this feature)

```text
specs/008-payout-reconciliation/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── api-contracts.md ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code

```text
src/payouts/
├── payouts.module.ts
├── payouts.controller.ts            # Staff endpoints: /payout-periods/*
├── payouts.service.ts               # Business logic (period lifecycle, summary, mark-paid)
├── courier-payouts.controller.ts    # Courier endpoints: /couriers/me/earnings|payouts
├── entities/
│   ├── payout-period.entity.ts
│   └── payout.entity.ts
└── dto/
    ├── create-payout-period.dto.ts
    ├── create-payout.dto.ts
    ├── payout-period-response.dto.ts
    ├── payout-response.dto.ts
    ├── period-summary-response.dto.ts
    ├── pending-couriers-response.dto.ts
    ├── courier-earnings-response.dto.ts
    └── courier-payouts-response.dto.ts

database/migrations/
├── 019_create_payout_periods.ts
└── 020_create_payouts.ts

test/
└── payouts/
    ├── payouts.service.spec.ts
    └── payouts.controller.spec.ts
```

**Structure Decision**: Single-project NestJS backend. New `PayoutsModule` follows the same layout as `OrdersModule` / `CouriersModule`. Two controllers in one module: `PayoutsController` for staff routes and `CourierPayoutsController` for courier routes — separating role concerns while keeping all payout domain logic co-located.

## Implementation Phases

### Phase A — Migrations & Entities

1. Migration `019_create_payout_periods.ts` — create `payout_periods` table with index
2. Migration `020_create_payouts.ts` — create `payouts` table with unique constraint and indexes
3. `PayoutPeriod` TypeORM entity
4. `Payout` TypeORM entity

### Phase B — DTOs

5. `CreatePayoutPeriodDto` — `start_date`, `end_date` (IsDateString validation)
6. `CreatePayoutDto` — `courier_id`, `amount`, `reference_note?`
7. Response DTOs: `PayoutPeriodResponseDto`, `PayoutResponseDto`, `PeriodSummaryResponseDto`, `PendingCouriersResponseDto`, `CourierEarningsResponseDto`, `CourierPayoutsResponseDto`

### Phase C — Service

8. `PayoutsService` with methods:
   - `createPeriod(user, dto)` → create open PayoutPeriod
   - `listPeriods(ownerId, query)` → paginated list
   - `closePeriod(ownerId, periodId)` → close; 404 if not found; 409 if already closed
   - `getPeriodSummary(ownerId, periodId)` → aggregate courier_earnings + join payouts for is_paid
   - `getPendingCouriers(ownerId, periodId)` → summary minus paid; 409 if period open
   - `recordPayout(ownerId, periodId, dto)` → insert Payout; 422 if period open; 409 on duplicate; 404 on unknown courier
   - `getCourierEarnings(courierId, ownerId, query)` → paginated courier_earnings
   - `getCourierPayouts(courierId, ownerId, query)` → paginated payouts + joined period dates

### Phase D — Controllers

9. `PayoutsController` — staff routes under `/payout-periods` with `@Roles(OWNER, MANAGER, ORDER_OPERATOR)`
10. `CourierPayoutsController` — courier routes under `/couriers/me` with `@Roles(COURIER)`
11. `PayoutsModule` — wire entities, service, controllers; import `CourierEarning` entity

### Phase E — Registration & Tests

12. Register `PayoutsModule` in `AppModule`
13. Unit tests for `PayoutsService` (mock DataSource)
14. Controller tests with role guard verification

## Complexity Tracking

No constitution violations. No complexity justification required.
