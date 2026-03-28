# Payout Reconciliation

## Purpose

Define how courier earnings are aggregated into payout requests and how those requests move through
approval or rejection. `CourierPayments` are the raw earnings from completed orders; `CourierPayout`
is the settlement record that groups them for disbursement.

## Scope

- Listing a courier's unpaid payment history.
- Creating a payout request from selected unpaid payments.
- Viewing payout details and history.
- Approving a payout (Operator / Manager / Owner).
- Rejecting a payout with rollback of payment links.
- Realtime events on payout state changes.

## Out of Scope

- Actual external money transfer / bank settlement (future integration).
- Fee deduction and tax withholding (to be defined in data-model phase).
- Platform-level payout reporting across all tenants.

## Actors

- Courier App (create payout request, view history)
- Operator / Manager / Owner (approve or reject)
- Backend API

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `CourierPayments` | `owner_id`-scoped | One row per completed order; `status`: `unpaid` / `in_payout`; `courier_payout_id` (nullable) |
| `CourierPayout` | `owner_id`-scoped | Payout request; `status`: `pending` / `approved` / `rejected`; `amount` DECIMAL(12,2) |
| `Courier` | `owner_id`-scoped | Referenced for ownership and audit |

All entities carry `owner_id` enforced at the service layer.

**Financial precision**: all monetary amounts MUST use `DECIMAL(12,2)` — never `FLOAT`.

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/courier/payments` | JWT (Courier) | List the courier's payment history |
| POST | `/api/v1/courier/payouts` | JWT (Courier) | Create a payout request |
| GET | `/api/v1/courier/payouts` | JWT (Courier) | List the courier's payouts |
| GET | `/api/v1/courier/payouts/pending` | JWT (Courier) | Get the courier's current pending payout (if any) |
| GET | `/api/v1/courier/payouts/{id}` | JWT (Courier, Operator, Manager, Owner) | Get payout detail |
| POST | `/api/v1/courier/payouts/{id}/approve` | JWT (Operator, Manager, Owner) | Approve payout |
| POST | `/api/v1/courier/payouts/{id}/reject` | JWT (Operator, Manager, Owner) | Reject payout |

### GET `/api/v1/courier/payments` — Query Parameters

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | `unpaid \| in_payout \| all` | `all` | |
| `limit` | integer | `20` | Max 100 |
| `offset` | integer | `0` | |

### POST `/api/v1/courier/payouts` — Request Body

```json
{
  "payment_ids": ["uuid", "uuid", "..."]
}
```

All listed `payment_ids` MUST belong to the requesting courier and have `status = 'unpaid'`.

### POST `/api/v1/courier/payouts/{id}/reject` — Request Body

```json
{ "reason": "string — required" }
```

## State Machine

```
pending ──approve──▶ approved (terminal)
        ──reject───▶ rejected (terminal — payment rows revert to unpaid)
```

| From | Action | To | Side-effect |
|------|--------|----|-------------|
| `pending` | `approve` | `approved` | Audit fields set; payments remain `in_payout` |
| `pending` | `reject` | `rejected` | `CourierPayments.courier_payout_id` set to NULL; `CourierPayments.status` reverts to `unpaid` |

## Business Rules

### Multi-Tenancy
- All queries MUST be scoped to `owner_id` from the caller's JWT.
- A courier MUST only see their own payments and payouts.
- Operators/Managers/Owners MUST only see payouts within their `owner_id`.

### Creating a Payout Request
- The requesting user MUST be the `Courier` role.
- All `payment_ids` in the request MUST:
  - Belong to the requesting courier.
  - Have `status = 'unpaid'` (not already linked to another payout).
  - Belong to the same `owner_id`.
- If any payment fails these checks the whole request MUST return `400`.
- **Double-booking protection**: `CourierPayments.courier_payout_id` has a UNIQUE constraint. Attempting
  to link an already-linked payment MUST raise a database constraint error, caught and returned as `409`.
- **Idempotency**: if a `pending` payout already exists containing the exact same set of `payment_ids`,
  the existing payout MUST be returned (`200`) instead of creating a duplicate.
- In a single database transaction:
  1. Calculate `amount = SUM(payment.courier_award)` for selected payments.
  2. Create `CourierPayout` with `status = 'pending'`.
  3. Set `CourierPayments.courier_payout_id` and `CourierPayments.status = 'in_payout'` for all selected rows.
- Emit `payout.created` realtime event after transaction commits.
- Returns `201 Created`.

### Approving a Payout
- Allowed roles: `Operator`, `Manager`, `Owner`.
- The payout MUST be in `pending` status; otherwise return `409`.
- In a single transaction:
  1. Set `payout.status = 'approved'`, `payout.approved_by = user_id`, `payout.approved_at = now`.
- Emit `payout.approved` realtime event.
- Returns `200 OK`.

### Rejecting a Payout
- Allowed roles: `Operator`, `Manager`, `Owner`.
- The payout MUST be in `pending` status; otherwise return `409`.
- In a single transaction:
  1. Set `payout.status = 'rejected'`, `payout.rejected_by = user_id`, `payout.rejected_at = now`, `payout.rejection_reason = reason`.
  2. Set `CourierPayments.courier_payout_id = NULL` and `CourierPayments.status = 'unpaid'` for all linked payment rows (rollback).
- Emit `payout.rejected` realtime event.
- Returns `200 OK`.

### Audit Trail
`CourierPayout` MUST carry: `approved_by (uuid nullable)`, `approved_at (timestamp nullable)`,
`rejected_by (uuid nullable)`, `rejected_at (timestamp nullable)`, `rejection_reason (text nullable)`.

## Realtime Events

Room: `courier:{courier_id}` and `owner:{owner_id}:operators`

```json
{
  "event": "payout.created | payout.approved | payout.rejected",
  "payload": {
    "payout_id":  "uuid",
    "courier_id": "uuid",
    "amount":     "decimal",
    "status":     "pending | approved | rejected",
    "timestamp":  "ISO8601"
  }
}
```

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `400` | Empty `payment_ids`; a payment not found or already linked; payment belongs to different courier |
| `401` | Missing or invalid JWT |
| `403` | Courier attempting approve/reject; Operator attempting to access another tenant's payout |
| `404` | Payout not found within `owner_id` |
| `409` | Payout already approved or rejected (can't re-approve/re-reject); double-booking detected |

## Dependencies

- JWT auth + role guards (NestJS)
- PostgreSQL transactions + UNIQUE constraint on `CourierPayments.courier_payout_id`
- Socket.IO + Redis adapter (realtime events)

## Acceptance Criteria

1. A courier with unpaid payments creates a payout request; linked payments move to `status = 'in_payout'`.
2. Payout `amount` equals the sum of selected payment awards (`DECIMAL(12,2)` precision).
3. Attempting to include the same payment in two payouts returns `409`.
4. Approving a payout sets `approved_by`, `approved_at`, and emits `payout.approved`.
5. Rejecting a payout reverts linked payments to `status = 'unpaid'` and sets `rejected_by`, `rejected_at`, `rejection_reason`.
6. A rejected payout's payments can be included in a new payout request.
7. `GET /api/v1/courier/payments?status=unpaid` with pagination returns only unpaid payments for the requesting courier.
8. A Courier attempting to approve or reject a payout receives `403`.
9. All monetary values are stored and returned as `DECIMAL(12,2)`.
