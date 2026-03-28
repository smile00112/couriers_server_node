# Implementation Plan: Courier Authentication

**Branch**: `001-courier-auth` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-courier-auth/spec.md`

## Summary

Courier authentication enables couriers to identify themselves and obtain session credentials via three paths: SMS one-time code, Telegram one-time code, or username/password. The feature produces a short-lived access JWT and a longer-lived refresh token. It is the gateway to all other courier-facing API endpoints.

The implementation introduces a `courier_auth_codes` table (replaces the legacy `auth_sms` table), a `courier_refresh_tokens` table for logout support, and a NestJS `AuthModule` with JWT strategy, rate limiting, and tenant-scoped phone lookup. SMS and Telegram delivery are dispatched via BullMQ to keep auth endpoints fast.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.x
**Primary Dependencies**: NestJS 10, TypeORM 0.3, @nestjs/jwt, @nestjs/passport, passport-jwt, bcrypt, @nestjs/throttler (Redis store), BullMQ, class-validator/class-transformer
**Storage**: PostgreSQL — `courier_auth_codes`, `courier_refresh_tokens`; extend `couriers` with `login` / `password_hash`
**Testing**: Jest + supertest (NestJS default); integration tests hit a real PostgreSQL + Redis test instance
**Target Platform**: Docker container on Linux (Kubernetes cluster)
**Project Type**: web-service (NestJS REST API, `/api/v1/` prefix)
**Performance Goals**: Auth endpoints respond under 500ms p95; code delivery dispatched async (BullMQ)
**Constraints**: Multi-tenant isolation — `owner_id` required on every auth operation; stateless JWT access tokens (15 min TTL); refresh tokens stored in DB for revocation
**Scale/Scope**: SaaS multi-tenant; each tenant is an independent Owner; phone numbers unique per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Order Lifecycle Integrity | ✅ N/A | Auth does not touch order state |
| II. Real-Time as First-Class Concern | ✅ N/A | Auth events (login/logout) are not broadcast; no operator visibility required |
| III. API Contract Stability | ✅ Pass | All endpoints under `/api/v1/auth/courier/`; versioned from day one |
| IV. Role-Based Authorization | ✅ Pass | JWT carries `role: courier` + `owner_id` claims; guard applied to logout endpoint; no courier endpoint is unguarded |
| V. Background Jobs Idempotent | ✅ Pass | SMS/Telegram delivery jobs are idempotent — re-delivering the same code is safe (courier ignores duplicate SMS); job keyed on `auth_code.id` |
| VI. Multi-Tenant Isolation | ✅ Pass | `owner_id` is a required field on send-code; all `courier_auth_codes` and `courier_refresh_tokens` records carry `owner_id`; phone lookup is always scoped to a single tenant |
| VII. Simplicity | ✅ Pass | No plugin points or generic auth framework — only what the spec requires |
| VIII. Admin Panel UX | ✅ N/A | Courier auth has no admin panel entity |

**Complexity Tracking**: No violations. No speculative abstractions introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-courier-auth/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── auth.yml         ← Phase 1 output (OpenAPI fragment)
└── tasks.md             ← Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── auth/
│   ├── auth.module.ts
│   ├── courier-auth.controller.ts       ← send-code, verify-code, login, logout endpoints
│   ├── courier-auth.service.ts          ← orchestration, rate-limit checks, token issuance
│   ├── code-delivery/
│   │   ├── code-delivery.processor.ts   ← BullMQ job processor (SMS / Telegram dispatch)
│   │   └── code-delivery.service.ts     ← enqueues delivery job; abstracts channel selection
│   ├── strategies/
│   │   └── jwt.strategy.ts              ← passport-jwt strategy; validates access token
│   ├── guards/
│   │   └── courier-jwt.guard.ts         ← applied to all protected courier endpoints
│   ├── dto/
│   │   ├── send-code.dto.ts
│   │   ├── verify-code.dto.ts
│   │   └── login-password.dto.ts
│   └── entities/
│       ├── auth-code.entity.ts          ← courier_auth_codes table
│       └── courier-refresh-token.entity.ts  ← courier_refresh_tokens table
├── couriers/
│   └── entities/
│       └── courier.entity.ts            ← add login, password_hash columns
├── common/
│   ├── decorators/
│   │   └── current-courier.decorator.ts
│   └── pipes/
│       └── phone-normalize.pipe.ts
└── main.ts

database/
└── migrations/
    ├── 001_create_courier_auth_codes.ts
    ├── 002_create_courier_refresh_tokens.ts
    └── 003_add_courier_credentials.ts    ← login + password_hash on couriers
```

**Structure Decision**: Single NestJS project with feature modules. Auth lives in `src/auth/`. Code delivery is a sub-module inside auth (not a separate top-level module) since it has no other consumers yet — follows Principle VII (no premature extraction).
