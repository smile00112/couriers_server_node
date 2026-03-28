# Courier Authentication

## Purpose

Define the authentication capability for courier users. Couriers authenticate via a one-time code
delivered by SMS or Telegram, or via login/password. Successful authentication issues a JWT for
subsequent API access.

## Scope

- Courier sign-in by phone number and one-time code (SMS or Telegram channel).
- Courier sign-in by login and password.
- Code issuance, TTL, and idempotency.
- JWT access and refresh token issuance.
- Token revocation (logout).
- Courier-only access validation for the courier app.

## Out of Scope

- Authentication for Operators, Managers, Owners, or Administrators (separate flow).
- OAuth2 / third-party SSO.
- Device fingerprinting or biometric auth.

## Actors

- Courier App
- Backend API
- SMS gateway or Telegram bot

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `User` | `owner_id`-scoped | Base user record; role = `courier` |
| `Courier` | `owner_id`-scoped | Courier profile linked to `User` |
| `AuthCode` | `owner_id`-scoped | One-time code: phone, code, channel, expires_at, used_at |

All entities carry `owner_id` and are isolated per tenant. Cross-tenant authentication is not possible.

## API Surface

All endpoints are public (no JWT required) except logout.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/courier/send-code` | — | Request a one-time code |
| POST | `/api/v1/auth/courier/verify-code` | — | Verify code and receive JWT |
| POST | `/api/v1/auth/courier/login` | — | Login with password |
| DELETE | `/api/v1/auth/courier/session` | JWT (Courier) | Revoke current JWT (logout) |

## Business Rules

### Phone Normalization
- Phone numbers MUST be normalized to E.164 format (e.g., `+79001234567`) before storage and lookup.
- Requests with a phone number that cannot be normalized to E.164 MUST be rejected with `400`.

### Code Issuance (`POST /api/v1/auth/courier/send-code`)

Request body:
```json
{ "phone": "string (required)", "channel": "sms | telegram (optional, default: sms)", "owner_id": "uuid (required)" }
```

- The system MUST verify that a `Courier` exists for the given phone + `owner_id` before issuing a code.
- If a non-expired `AuthCode` already exists for this phone + `owner_id`, the same code MUST be returned
  without triggering a new delivery (idempotent within TTL window).
- A new code is a **6-digit random numeric string**.
- Code TTL: **5 minutes** from creation.
- If the delivery provider returns an error, the system MUST return `502` and MUST NOT persist the code.
- Rate limit: **5 requests per phone per 10 minutes** (enforced via Redis). Excess requests MUST return `429`.

### Code Verification (`POST /api/v1/auth/courier/verify-code`)

Request body:
```json
{ "phone": "string (required)", "code": "string (required)", "owner_id": "uuid (required)" }
```

- Expired codes (`expires_at < now`) MUST be rejected with `422`.
- Already-used codes MUST be rejected with `422`.
- Non-matching codes MUST be rejected with `422`.
- On success, the `AuthCode` record MUST be marked `used_at = now`.
- On success, the system MUST issue a JWT pair (access + refresh) and return them in the response.

### Password Login (`POST /api/v1/auth/courier/login`)

Request body:
```json
{ "login": "string (phone or email, required)", "password": "string (required)", "owner_id": "uuid (required)" }
```

- Rate limit: **5 failed attempts per identity per 10 minutes**. Excess MUST return `429`.
- Invalid credentials MUST return `401` (do not distinguish phone-not-found vs wrong-password).

### JWT Tokens
- **Access token TTL**: 24 hours.
- **Refresh token TTL**: 30 days.
- Token payload MUST include: `sub` (user_id), `role` (`courier`), `owner_id`, `courier_id`, `iat`, `exp`.
- Refresh tokens MUST be stored server-side in Redis (key: `refresh:{owner_id}:{user_id}:{jti}`) to support revocation.
- Access tokens are stateless; revocation is achieved by removing the refresh token from Redis.

### Logout (`DELETE /api/v1/auth/courier/session`)
- Requires a valid Bearer JWT.
- Removes the associated refresh token from Redis.
- Subsequent refresh attempts MUST return `401`. Existing access tokens expire naturally within their TTL.

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `400` | Phone cannot be normalized to E.164; missing required field |
| `401` | Invalid credentials (login/password flow); invalid JWT (logout) |
| `404` | No courier found for this phone + `owner_id` |
| `422` | Code expired; code already used; code mismatch |
| `429` | Rate limit exceeded |
| `502` | SMS / Telegram delivery provider unavailable |

All error responses follow the standard envelope:
```json
{ "statusCode": 422, "error": "Unprocessable Entity", "message": "Code has expired" }
```

## Dependencies

- E.164 phone normalization utility
- Redis (rate limiting counter, refresh token store)
- SMS provider integration
- Telegram bot integration
- NestJS `@nestjs/jwt` (JWT signing/verification)

## Acceptance Criteria

1. A known courier requests a code — delivery confirmation is returned; re-requesting within TTL returns the same code without sending a second SMS.
2. A valid non-expired code returns an access + refresh JWT pair.
3. An expired code returns `422`.
4. An unknown phone (no matching courier for `owner_id`) returns `404`.
5. After 5 code requests in 10 minutes the next request returns `429`.
6. Logging out removes the refresh token; a subsequent refresh attempt returns `401`.
7. Password login with correct credentials returns a JWT pair; incorrect credentials return `401`.
8. A Courier from tenant A cannot authenticate into tenant B even with the correct code.
