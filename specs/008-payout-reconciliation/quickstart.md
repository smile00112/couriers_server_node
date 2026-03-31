# Quickstart: Payout Reconciliation

**Branch**: `008-payout-reconciliation` | **Date**: 2026-03-30

## What This Feature Does

Adds a payout reconciliation workflow: staff can define date-range payout periods, review per-courier earnings summaries, close periods, and record payments. Couriers can view their own earnings history and payout records.

## Key Concepts

| Concept | Description |
|---|---|
| **PayoutPeriod** | A staff-defined date window. Created open, explicitly closed before payments can be recorded. |
| **Payout** | An immutable record that a courier was paid X amount in a given period. One per courier per period. |
| **Earnings summary** | Aggregated read of existing `courier_earnings` table for a period's date range — no new data written. |

## Module Layout

```text
src/payouts/
├── payouts.module.ts
├── payouts.controller.ts         # Staff endpoints (payout-periods/*)
├── payouts.service.ts            # Business logic
├── courier-payouts.controller.ts # Courier self-service endpoints
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
```

## Typical Reconciliation Workflow

```
1. Staff creates a payout period (POST /payout-periods)
   → period.status = "open"

2. Staff reviews earnings summary (GET /payout-periods/:id/summary)
   → sees per-courier totals aggregated from courier_earnings

3. Staff closes the period (POST /payout-periods/:id/close)
   → period.status = "closed"

4. Staff records payments one by one (POST /payout-periods/:id/payouts)
   → creates immutable Payout record per courier

5. Staff checks remaining unpaid couriers (GET /payout-periods/:id/pending)
   → confirms all are paid (empty list)

6. Courier checks own records (GET /couriers/me/earnings, GET /couriers/me/payouts)
   → sees their earnings history and received payouts
```

## Running Migrations

```bash
# Apply new migrations
npx typeorm migration:run -d src/data-source.ts

# Or via npm script if available
npm run migration:run
```

## Running Tests

```bash
npm test -- --testPathPattern=payouts
```

## Role Access Matrix

| Endpoint | owner | manager | order_operator | courier |
|---|---|---|---|---|
| POST /payout-periods | ✓ | ✓ | ✓ | — |
| GET /payout-periods | ✓ | ✓ | ✓ | — |
| POST /payout-periods/:id/close | ✓ | ✓ | ✓ | — |
| GET /payout-periods/:id/summary | ✓ | ✓ | ✓ | — |
| GET /payout-periods/:id/pending | ✓ | ✓ | ✓ | — |
| POST /payout-periods/:id/payouts | ✓ | ✓ | ✓ | — |
| GET /couriers/me/earnings | — | — | — | ✓ |
| GET /couriers/me/payouts | — | — | — | ✓ |

## Key Constraints

- A period must be **closed** before payouts can be recorded against it.
- Each courier can only be marked as paid **once per period** (unique constraint).
- Payout records are **immutable** — no update or delete operations exist.
- All data is scoped to `owner_id` from the JWT — no cross-tenant access.
- Overlapping date ranges between periods are allowed by design.
