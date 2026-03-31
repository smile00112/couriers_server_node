# Research: Courier Authentication

**Feature**: `001-courier-auth` | **Date**: 2026-03-28

---

## Decision 1: Tenant Context Without a JWT

**Question**: How is the tenant (`owner_id`) established during authentication, before a JWT exists?

**Decision**: Require `owner_id` (UUID) as an explicit field in every unauthenticated auth request body (`send-code`, `verify-code`, `login`).

**Rationale**:
- The existing system scopes `auth_sms` records by `company_id`, confirming that tenant was always a first-class input — not derived.
- Phone numbers are unique within a tenant but may collide across tenants, so a global phone lookup would be ambiguous.
- Subdomain-based tenancy would require DNS/routing infrastructure that is not yet in place and is speculative complexity (Principle VII).
- A UUID `owner_id` in the request body is the simplest, most explicit approach that works with the current data model.

**Alternatives considered**:
- Subdomain extraction from `Host` header (`tenant.platform.com`): rejected — adds routing complexity not present in the current architecture.
- Global phone uniqueness enforcement: rejected — spec explicitly states phones can repeat across tenants.
- `owner_slug` string lookup: rejected — UUID is already the canonical identifier; slug adds a lookup join.

---

## Decision 2: JWT Access + Refresh Token Strategy

**Question**: What are the TTLs and revocation mechanism for JWT credentials?

**Decision**:
- **Access token**: signed JWT, 15-minute TTL, stateless (not stored in DB), carries `{ sub: courierId, owner_id, role: 'courier' }`.
- **Refresh token**: opaque UUID (256-bit random), stored as a SHA-256 hash in `courier_refresh_tokens` table, 30-day TTL.
- **Logout**: marks the refresh token row as revoked (`revoked_at = now`). Access tokens are short-lived enough that no denylist is needed.
- **Token refresh**: caller exchanges a valid refresh token for a new access token; this endpoint is out of scope for this feature but the table is designed to support it.

**Rationale**:
- The constitution mandates JWT; opaque Sanctum tokens (the legacy approach) are not used in the rebuild.
- 15-minute access token TTL is the industry-standard tradeoff: short enough to limit exposure, long enough to avoid constant refresh round-trips.
- Storing only the hash of the refresh token in the DB prevents token theft from a DB read.
- A Redis denylist for access tokens was considered but rejected: the 15-minute window is short enough that a revoked access token poses minimal risk, and a Redis dependency in the auth hot path increases operational complexity for marginal security gain.

**Alternatives considered**:
- Long-lived access tokens (24h) with a Redis denylist: rejected — stateful denylist couples auth to Redis availability; 15min TTL is sufficient.
- Storing full refresh tokens in DB: rejected — hashing limits damage from DB leaks.
- No refresh token (access-only): rejected — spec FR-007 explicitly requires a longer-lived refresh credential.

---

## Decision 3: Rate Limiting Implementation

**Question**: Where is rate limiting enforced (5 code requests per phone per 10 minutes; 5 password failures per identity per 10 minutes)?

**Decision**: Use `@nestjs/throttler` with the Redis store (`@nestjs/throttler/dist/throttler.store.redis`). Rate-limit keys are namespaced as `ratelimit:send-code:{owner_id}:{phone}` and `ratelimit:login:{owner_id}:{login}`. Limits are enforced at the guard layer, before the service layer, to prevent DB calls on blocked requests.

**Rationale**:
- In-process rate limiting (memory store) fails in a multi-pod Kubernetes deployment: separate pods would each track their own counter.
- Redis is already a required dependency (Socket.IO adapter, BullMQ); no new infrastructure is introduced.
- Namespacing by `{owner_id}:{phone}` prevents a courier in tenant A from being blocked by rate-limit exhaustion caused by a different courier with the same phone in tenant B.

**Alternatives considered**:
- In-memory Throttler store: rejected — not suitable for multi-instance deployment.
- Custom Redis rate-limit implementation: rejected — `@nestjs/throttler` with Redis store is the idiomatic NestJS solution and is already well-tested.

---

## Decision 4: Code Delivery Queue vs Synchronous Send

**Question**: Should SMS/Telegram delivery be synchronous (blocking the HTTP response) or asynchronous (via BullMQ)?

**Decision**: Asynchronous via BullMQ. The `send-code` endpoint enqueues a delivery job after writing the `auth_code` record and returns `202 Accepted` immediately. The BullMQ processor dispatches via the provider (SMS/Telegram).

**Rationale**:
- SMS gateway calls can take 300–800ms; blocking the HTTP response on them degrades latency and creates a retry footgun.
- The spec SC-001 requires the full login flow (including code receipt) to complete in under 60 seconds — this is not a sub-second SLA on the API endpoint itself.
- BullMQ idempotency (Principle V): the delivery job is keyed on `auth_code.id`; if re-run, the provider receives the same code for the same record — safe to re-attempt.
- Delivery failure: the job moves to dead-letter queue; the courier can re-request a code after TTL expiry.

**Alternatives considered**:
- Synchronous send with retry: rejected — ties HTTP response time to SMS provider SLA; provider timeouts would cause 500s on the auth endpoint.
- Fire-and-forget (no queue): rejected — no retry capability, no dead-letter visibility, violates Principle V.

---

## Decision 5: ORM Choice

**Question**: TypeORM or Prisma for this project?

**Decision**: TypeORM with `@nestjs/typeorm`.

**Rationale**:
- TypeORM is the default and most documented ORM choice in the NestJS ecosystem; first-party `@nestjs/typeorm` module exists.
- TypeORM supports migration generation from entity decorators, aligning with the constitution's requirement for versioned migrations.
- Prisma was considered but introduces a separate schema file and build step that complicates the development workflow without meaningful benefit at this scale.

**Alternatives considered**:
- Prisma: rejected — separate schema file, more complex migration workflow; no strong technical advantage at this project's scale.
- Knex (query builder only): rejected — no entity model layer; requires more boilerplate.

---

## Decision 6: Password Hashing

**Question**: Which hashing algorithm for courier passwords?

**Decision**: bcrypt with cost factor 12 (`bcrypt.hash(password, 12)`).

**Rationale**:
- bcrypt is the industry standard for password hashing in Node.js and is used by `@nestjs/passport` local strategy examples.
- Cost factor 12 is the current recommendation: ~250ms on modern hardware, providing strong resistance to brute-force.
- argon2 was considered but adds a native dependency with compilation requirements, increasing Docker build complexity for marginal improvement.

---

## Summary Table

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Tenant context | `owner_id` in request body | Ambiguous global phone lookup; explicit is simpler |
| Token strategy | JWT 15min + hashed refresh token 30d | Constitution mandates JWT; short access TTL avoids denylist |
| Rate limiting | `@nestjs/throttler` + Redis store | Multi-pod safe; Redis already required |
| Code delivery | BullMQ async | Provider latency; idempotency; dead-letter support |
| ORM | TypeORM | NestJS first-party integration; migration support |
| Password hashing | bcrypt cost=12 | Industry standard; no native compilation required |
