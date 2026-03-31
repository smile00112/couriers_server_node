# Data Model: Payout Reconciliation

**Branch**: `008-payout-reconciliation` | **Date**: 2026-03-30

## New Entities

---

### PayoutPeriod

**Table**: `payout_periods`
**Purpose**: A reconciliation window defined by a date range. Staff create periods, review earnings summaries, and close them before recording payments.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `owner_id` | UUID | NOT NULL, FK → owners(id) | Multi-tenant scope |
| `created_by` | UUID | NOT NULL, FK → owners(id) or couriers? | Staff user UUID (from JWT). FK to owners table as staff users are owners/managers. |
| `start_date` | DATE | NOT NULL | Inclusive lower bound of period |
| `end_date` | DATE | NOT NULL | Inclusive upper bound of period |
| `status` | VARCHAR(10) | NOT NULL, DEFAULT 'open', CHECK IN ('open','closed') | Lifecycle state |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Updated on close |

**Indexes**:
- `idx_payout_periods_owner` on `(owner_id, created_at DESC)` — tenant list query

**Constraints**:
- `CHECK (end_date >= start_date)` — prevents invalid date ranges
- No unique constraint on date ranges — overlapping periods are allowed by design

**Entity State Transitions**:
```
open → closed   (via POST /payout-periods/:id/close)
closed → *      (blocked — terminal state)
```

---

### Payout

**Table**: `payouts`
**Purpose**: An immutable record that a specific courier was paid within a payout period.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `owner_id` | UUID | NOT NULL, FK → owners(id) | Multi-tenant scope |
| `payout_period_id` | UUID | NOT NULL, FK → payout_periods(id) | |
| `courier_id` | UUID | NOT NULL, FK → couriers(id) | |
| `amount` | DECIMAL(10,2) | NOT NULL | Total paid amount |
| `reference_note` | TEXT | NULL | Optional bank transfer ID or note |
| `paid_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Set at record creation; never updated |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**No `updated_at`** — immutability is signalled by the absence of an update timestamp.

**Indexes**:
- `idx_payouts_period` on `(payout_period_id, courier_id)` — period summary and pending queries
- `idx_payouts_courier` on `(courier_id, paid_at DESC)` — courier payout history

**Constraints**:
- `UNIQUE (payout_period_id, courier_id)` — prevents double-payment for same courier in same period (DB-enforced idempotency)

---

## Existing Entity Read (No Changes)

### CourierEarning *(read-only)*

**Table**: `courier_earnings`
**Source**: Feature 003-order-lifecycle

Relevant columns used by this feature:
- `courier_id` — group by courier
- `owner_id` — tenant scope filter
- `amount` — sum for period totals
- `earned_at` — filter by period date range
- `order_id` — count for delivery_count

Query pattern used for period summary:
```sql
SELECT
  ce.courier_id,
  c.first_name,
  c.last_name,
  COUNT(ce.id)       AS delivery_count,
  SUM(ce.amount)     AS total_amount
FROM courier_earnings ce
JOIN couriers c ON c.id = ce.courier_id
WHERE ce.owner_id = :ownerId
  AND ce.earned_at >= :startDate        -- start_date at 00:00:00 UTC
  AND ce.earned_at < :endDateExclusive  -- end_date + 1 day at 00:00:00 UTC
GROUP BY ce.courier_id, c.first_name, c.last_name
ORDER BY total_amount DESC
```

---

## Entity Relationships

```text
Owner ──< PayoutPeriod ──< Payout >── Courier

PayoutPeriod (date range) ──[query]──> CourierEarning (read-only)
```

---

## Migration Plan

| Migration | File | Action |
|---|---|---|
| 019 | `019_create_payout_periods.ts` | Create `payout_periods` table + index |
| 020 | `020_create_payouts.ts` | Create `payouts` table + unique constraint + indexes |
