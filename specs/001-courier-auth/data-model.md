# Data Model: Courier Authentication

**Feature**: `001-courier-auth` | **Date**: 2026-03-28

---

## New Tables

### `courier_auth_codes`

Replaces legacy `auth_sms`. Stores one-time codes issued for phone-based authentication.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `owner_id` | UUID | NO | — | FK → `owners.id`; tenant scope |
| `courier_id` | UUID | YES | NULL | FK → `couriers.id`; NULL until courier is resolved |
| `phone` | VARCHAR(30) | NO | — | Normalized E.164 format, e.g., `+79001234567` |
| `code` | VARCHAR(6) | NO | — | 6-digit numeric code |
| `channel` | VARCHAR(20) | NO | `'sms'` | Delivery channel: `sms` or `telegram` |
| `used_at` | TIMESTAMP | YES | NULL | Set when the code is successfully verified |
| `expires_at` | TIMESTAMP | NO | — | `created_at + 5 minutes` |
| `created_at` | TIMESTAMP | NO | now() | |
| `updated_at` | TIMESTAMP | NO | now() | |

**Indexes**:
- `(owner_id, phone, used_at, expires_at)` — composite; used by the "unexpired unused code" lookup and the rate-limit count query
- `(expires_at)` — used for cleanup of expired rows

**Constraints**:
- No unique constraint on `(owner_id, phone)` — multiple codes may exist (expired ones remain for audit); uniqueness of the _active_ code is enforced in the service layer.

**State rules** (enforced in service layer):
- A code is **active** when `used_at IS NULL AND expires_at > now()`.
- Only one active code per `(owner_id, phone)` is allowed at a time (idempotency: existing active code is returned, no new code created).
- On successful verify, `used_at` is set; the code cannot be reused.

---

### `courier_refresh_tokens`

Stores hashed refresh tokens to support explicit logout.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | gen_random_uuid() | PK |
| `owner_id` | UUID | NO | — | FK → `owners.id`; tenant scope |
| `courier_id` | UUID | NO | — | FK → `couriers.id` ON DELETE CASCADE |
| `token_hash` | VARCHAR(64) | NO | — | SHA-256 hex of the raw refresh token; UNIQUE |
| `revoked_at` | TIMESTAMP | YES | NULL | Set on logout; NULL means active |
| `expires_at` | TIMESTAMP | NO | — | 30 days from issuance |
| `created_at` | TIMESTAMP | NO | now() | |

**Indexes**:
- `token_hash` — UNIQUE; primary lookup for refresh and logout operations
- `(courier_id, revoked_at)` — for listing active sessions (future admin use)

**State rules**:
- A refresh token is **valid** when `revoked_at IS NULL AND expires_at > now()`.
- Logout sets `revoked_at = now()` on the matching row.
- Expired rows are inert and can be cleaned up by a periodic job.

---

## Modified Tables

### `couriers` (additive columns only)

These columns support the login/password authentication path.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `login` | VARCHAR(100) | YES | NULL | Username for password-based login; UNIQUE per `owner_id` |
| `password_hash` | VARCHAR(255) | YES | NULL | bcrypt hash (cost 12); NULL means password login is not enabled for this courier |

**Unique constraint**: `(owner_id, login)` — login is unique within a tenant, not globally.

**Notes**:
- A courier with `login IS NULL` can only authenticate via phone/code.
- Credentials are set by an Admin/Owner; couriers cannot self-register.
- `password_hash` is never returned in any API response.

---

## Entities Not Modified

- `owners` — referenced as tenant anchor; no changes in this feature.
- `orders`, `courier_payments`, `courier_payouts`, `courier_working_shifts` — not touched.

---

## State Transitions

### Auth Code Lifecycle

```
                  [expires_at reached]
        created ──────────────────────────► expired (used_at NULL, expires_at < now)
           │
           │  verify-code (correct, unexpired)
           ▼
        consumed (used_at = now)         ← terminal; cannot be reused
```

### Refresh Token Lifecycle

```
        issued ──────────────────────────► expired (revoked_at NULL, expires_at < now)
           │
           │  logout / explicit revoke
           ▼
        revoked (revoked_at = now)        ← terminal
```

---

## Migration Order

1. `001_create_courier_auth_codes.ts` — new table; no dependency on couriers having `login`
2. `002_create_courier_refresh_tokens.ts` — new table; depends on `couriers.id` existing
3. `003_add_courier_credentials.ts` — `ALTER TABLE couriers ADD COLUMN login, ADD COLUMN password_hash`

---

## Legacy Mapping (auth_sms → courier_auth_codes)

| Legacy field | New field | Notes |
|-------------|-----------|-------|
| `id` | `id` | UUID in rebuild vs int in legacy |
| `courier_id` | `courier_id` | Same semantic |
| `phone` | `phone` | Normalized format |
| `code` | `code` | Same |
| `expires_at` | `expires_at` | Same |
| `ip` | *(dropped)* | Not needed in rebuild |
| `company_id` | `owner_id` | Renamed per domain model |
| *(new)* | `channel` | Adds Telegram channel support |
| *(new)* | `used_at` | Explicit consumed state vs legacy deletion |
