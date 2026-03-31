# Tasks: Courier Authentication

**Input**: Design documents from `/specs/001-courier-auth/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/auth.yml ✅ quickstart.md ✅

**Tests**: Not explicitly requested — no test tasks generated.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- No story label = Setup or Foundational phase

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the NestJS project, tooling, and local development environment.

- [x] T001 Create NestJS project at repo root: `nest new . --package-manager pnpm --skip-git`, confirm `src/main.ts` and `src/app.module.ts` exist
- [x] T002 Configure TypeScript strict mode and path aliases in `tsconfig.json` and `tsconfig.build.json`
- [x] T003 [P] Configure ESLint + Prettier: `.eslintrc.js`, `.prettierrc`; add `lint` and `format` scripts to `package.json`
- [x] T004 [P] Create `docker-compose.yml` at repo root with `postgres:16-alpine` and `redis:7-alpine` services; create `.env.example` with all variables from `quickstart.md`

**Checkpoint**: `pnpm start:dev` boots without errors; Docker Compose brings up Postgres and Redis.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Install and configure `@nestjs/config` with `ConfigModule.forRoot({ isGlobal: true })` in `src/app.module.ts`; define `src/config/env.validation.ts` using `class-validator` to validate all required env vars on startup
- [x] T006 [P] Install `@nestjs/typeorm` and `typeorm`; configure `TypeOrmModule.forRootAsync` in `src/app.module.ts` reading DB credentials from ConfigService; set `migrations: ['database/migrations/*{.ts,.js}']`, `synchronize: false`
- [x] T007 [P] Create `Owner` entity in `src/owners/entities/owner.entity.ts` (columns: `id` UUID PK, `name`, `email`, `timezone` nullable, `created_at`, `updated_at`); create migration `database/migrations/001_create_owners.ts`
- [x] T008 Create base `Courier` entity in `src/couriers/entities/courier.entity.ts` with columns from data-model.md (id, owner_id FK, first_name, last_name, phone, status, fcm_token, created_at, updated_at) — **without** `login`/`password_hash` (added in T031); create migration `database/migrations/002_create_couriers.ts`
- [x] T009 Install `@nestjs/bullmq` and `bullmq`; configure `BullModule.forRootAsync` in `src/app.module.ts` reading Redis credentials from ConfigService; create `src/queues/queues.constants.ts` with queue name constant `AUTH_CODE_DELIVERY_QUEUE`
- [x] T010 [P] Install `@nestjs/throttler` and `@nestjs/throttler/dist/throttler.store.redis`; configure `ThrottlerModule.forRootAsync` with Redis store in `src/app.module.ts`; create `src/common/guards/throttle-exception.filter.ts` to format 429 responses per `contracts/auth.yml`
- [x] T011 [P] Install `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`; create `src/auth/auth.module.ts` skeleton importing JwtModule, PassportModule; configure `JwtModule.registerAsync` reading `JWT_SECRET` and `JWT_ACCESS_TTL` from ConfigService
- [x] T012 Create JWT strategy in `src/auth/strategies/jwt.strategy.ts`: extends `PassportStrategy(Strategy)`, validates payload shape `{ sub, owner_id, role }`, returns courier identity object
- [x] T013 [P] Create `CourierJwtGuard` in `src/auth/guards/courier-jwt.guard.ts` extending `AuthGuard('jwt')`; decorate with `@Injectable()`
- [x] T014 [P] Create `@CurrentCourier()` parameter decorator in `src/common/decorators/current-courier.decorator.ts` extracting the authenticated courier from the request object

**Checkpoint**: `pnpm typeorm migration:run` runs all migrations without errors; `pnpm start:dev` boots and registers the AuthModule.

---

## Phase 3: User Story 1 — SMS Code Login (Priority: P1) 🎯 MVP

**Goal**: A courier with a phone number in a known tenant can request an SMS code and exchange it for a JWT access token + refresh token.

**Independent Test**: Run flows 1 and 4 from `quickstart.md` — request code, verify with fixed code, receive tokens; verify wrong code returns 401.

### Implementation

- [x] T015 Create `AuthCode` entity in `src/auth/entities/auth-code.entity.ts` per `data-model.md` (id, owner_id, courier_id nullable, phone, code, channel enum, used_at nullable, expires_at, created_at, updated_at); create migration `database/migrations/003_create_courier_auth_codes.ts` with composite index on `(owner_id, phone, used_at, expires_at)`
- [x] T016 Create `CourierRefreshToken` entity in `src/auth/entities/courier-refresh-token.entity.ts` per `data-model.md` (id, owner_id, courier_id, token_hash UNIQUE, revoked_at nullable, expires_at, created_at); create migration `database/migrations/004_create_courier_refresh_tokens.ts`
- [x] T017 [P] Create `PhoneNormalizePipe` in `src/common/pipes/phone-normalize.pipe.ts`: normalizes any valid national/international phone input to E.164 format using `libphonenumber-js`; throws `BadRequestException` for unparseable input
- [x] T018 [P] Create `SendCodeDto` in `src/auth/dto/send-code.dto.ts` (fields: `owner_id` UUID, `phone` string, `channel` enum `sms|telegram` default `sms`) with `class-validator` decorators matching `contracts/auth.yml`; create `VerifyCodeDto` in `src/auth/dto/verify-code.dto.ts` (fields: `owner_id` UUID, `phone` string, `code` 6-digit string)
- [x] T019 Create `CodeDeliveryService` in `src/auth/code-delivery/code-delivery.service.ts`: single method `enqueue(authCodeId, phone, channel, code)` that adds a job to `AUTH_CODE_DELIVERY_QUEUE` via BullMQ `Queue`; the job payload contains `{ authCodeId, phone, channel, code }`
- [x] T020 Create `CodeDeliveryProcessor` in `src/auth/code-delivery/code-delivery.processor.ts`: BullMQ `@Processor` on `AUTH_CODE_DELIVERY_QUEUE`; SMS branch reads `AUTH_CODE_FIXED` env var — if set, logs to stdout instead of calling provider; if unset, calls the configured SMS gateway HTTP endpoint; Telegram branch stubbed with `TODO` comment (implemented in T026)
- [x] T021 Create `CourierAuthService` in `src/auth/courier-auth.service.ts` with method `sendCode(dto: SendCodeDto)`: (1) look up Courier by `(owner_id, phone)` — throw `NotFoundException` if absent; (2) check for existing active code via `(owner_id, phone, used_at IS NULL, expires_at > now)` — return existing if found (idempotency); (3) insert new `AuthCode` row with `expires_at = now + 5min`; (4) call `CodeDeliveryService.enqueue()`; return void
- [x] T022 Add `verifyCode(dto: VerifyCodeDto)` to `CourierAuthService`: (1) find active code matching `(owner_id, phone, code, used_at IS NULL, expires_at > now)` — throw `UnauthorizedException` if not found or expired; (2) set `used_at = now`; (3) generate JWT access token (`{ sub: courierId, owner_id, role: 'courier' }`, TTL from config); (4) generate opaque refresh token (UUID v4), store SHA-256 hash in `courier_refresh_tokens` with `expires_at = now + 30d`; (5) return `{ access_token, refresh_token, token_type: 'Bearer', expires_in }`
- [x] T023 Create `CourierAuthController` in `src/auth/courier-auth.controller.ts` with `@Controller('api/v1/auth/courier')`; implement `POST send-code` handler using `CourierAuthService.sendCode()`; apply `PhoneNormalizePipe` to the `phone` field; apply Throttler guard with key `send-code:{owner_id}:{phone}` limit 5 per 600s; return `HttpStatus.ACCEPTED`
- [x] T024 Add `POST verify-code` handler to `CourierAuthController` using `CourierAuthService.verifyCode()`; return 200 with `AuthTokensResponse` shape from `contracts/auth.yml`
- [x] T025 [P] Add send-code rate-limit guard: create `src/auth/guards/send-code-throttle.guard.ts` extending ThrottlerGuard, overriding `getTracker()` to return `${dto.owner_id}:${normalizedPhone}`; apply guard to `send-code` endpoint in T023

**Checkpoint**: Curl flow 1 from `quickstart.md` succeeds end-to-end; rate-limit test blocks 6th request with 429.

---

## Phase 4: User Story 2 — Telegram Code Login (Priority: P2)

**Goal**: A courier can select `channel: 'telegram'` in the send-code request and receive the code via a Telegram bot instead of SMS.

**Independent Test**: Set `TELEGRAM_BOT_TOKEN` in `.env`; request code with `channel: 'telegram'`; confirm code arrives via Telegram bot (or log message in test mode).

### Implementation

- [x] T026 Implement Telegram delivery branch in `src/auth/code-delivery/code-delivery.processor.ts`: add env config read for `TELEGRAM_BOT_TOKEN` and courier `telegram_chat_id` (nullable on Courier entity); when `channel === 'telegram'`, call Telegram Bot API `sendMessage` endpoint via HTTP; if `AUTH_CODE_FIXED` set, log to stdout instead; throw `InternalServerErrorException` on provider failure (job will retry via BullMQ dead-letter)
- [x] T027 Add nullable `telegram_chat_id` column to `Courier` entity (`src/couriers/entities/courier.entity.ts`) and create migration `database/migrations/005_add_courier_telegram_chat_id.ts`; update `send-code.dto.ts` — no DTO change needed (channel already accepts `telegram`)
- [x] T028 Add `TELEGRAM_BOT_TOKEN` env var to `src/config/env.validation.ts` (optional, string); add to `.env.example` with placeholder comment
- [x] T029 [P] Update `CodeDeliveryService` in `src/auth/code-delivery/code-delivery.service.ts` to include `telegram_chat_id` in the BullMQ job payload when channel is `telegram` (read from AuthCode's courier relation or passed as argument)
- [x] T030 [P] Add `NotFoundException` handling in `CourierAuthService.sendCode()` when `channel === 'telegram'` and courier has no `telegram_chat_id` — throw `BadRequestException('Courier has no Telegram account linked')`

**Checkpoint**: With `AUTH_CODE_FIXED=123456` and a stubbed Telegram channel, send-code with `channel: telegram` returns 202 and logs the code delivery.

---

## Phase 5: User Story 3 — Login/Password (Priority: P2)

**Goal**: A courier with a username and password assigned by an administrator can authenticate without going through the OTP flow.

**Independent Test**: Run flow 2 from `quickstart.md` — login with seeded credentials returns tokens; wrong password returns 401; 6th failed attempt returns 429.

### Implementation

- [x] T031 Create migration `database/migrations/006_add_courier_credentials.ts`: `ALTER TABLE couriers ADD COLUMN login VARCHAR(100) NULL, ADD COLUMN password_hash VARCHAR(255) NULL`; add UNIQUE constraint on `(owner_id, login)`
- [x] T032 Update `Courier` entity in `src/couriers/entities/courier.entity.ts`: add `@Column({ nullable: true }) login: string` and `@Column({ nullable: true, select: false }) password_hash: string`; `select: false` ensures `password_hash` is never accidentally returned in API responses
- [x] T033 Create `LoginPasswordDto` in `src/auth/dto/login-password.dto.ts` (fields: `owner_id` UUID, `login` string non-empty, `password` string non-empty) with `class-validator` decorators
- [x] T034 Add `loginWithPassword(dto: LoginPasswordDto)` to `CourierAuthService` in `src/auth/courier-auth.service.ts`: (1) find Courier by `(owner_id, login)` using QueryBuilder with `addSelect('courier.password_hash')` — return `UnauthorizedException('Invalid credentials')` if not found (no disclosure); (2) compare `dto.password` against `password_hash` via `bcrypt.compare()` — return same `UnauthorizedException` if mismatch; (3) reuse token issuance logic from T022 to return `{ access_token, refresh_token, token_type, expires_in }`
- [x] T035 Create `src/auth/guards/login-throttle.guard.ts` extending ThrottlerGuard, overriding `getTracker()` to return `${dto.owner_id}:${dto.login}`; limit 5 failed attempts per 600s window; guard must increment counter only on 401 responses (failed attempts), not successes — implement via custom exception filter or guard post-hook
- [x] T036 Add `POST login` handler to `CourierAuthController` in `src/auth/courier-auth.controller.ts`: apply `LoginThrottleGuard`; call `CourierAuthService.loginWithPassword()`; return 200 with `AuthTokensResponse`
- [x] T037 [P] Create database seed script `database/seeds/auth-test.seed.ts`: creates one `Owner`, one `Courier` with phone `+79001234567`, one `Courier` with `login='courier_test'` and `password_hash=bcrypt.hashSync('Test1234!', 12)`; add `seed:auth-test` script to `package.json`

**Checkpoint**: Flow 2 from `quickstart.md` returns tokens; 6 rapid failed login attempts result in 5 × 401 then 1 × 429.

---

## Phase 6: User Story 4 — Logout (Priority: P3)

**Goal**: An authenticated courier can explicitly invalidate their session so that no new access tokens can be obtained via the revoked refresh token.

**Independent Test**: Run flow 3 from `quickstart.md` — login, logout with refresh token, confirm refresh token is revoked (attempt refresh returns 401 in future refresh flow).

### Implementation

- [x] T038 Create `LogoutDto` in `src/auth/dto/logout.dto.ts` (field: `refresh_token` string, non-empty)
- [x] T039 Add `logout(courierId: string, dto: LogoutDto)` to `CourierAuthService` in `src/auth/courier-auth.service.ts`: (1) compute SHA-256 hash of `dto.refresh_token`; (2) find `CourierRefreshToken` by `token_hash` WHERE `courier_id = courierId AND revoked_at IS NULL AND expires_at > now`; (3) if not found, return silently (idempotent logout); (4) set `revoked_at = now` and save
- [x] T040 Add `POST logout` handler to `CourierAuthController` in `src/auth/courier-auth.controller.ts`: apply `@UseGuards(CourierJwtGuard)`; inject `@CurrentCourier()` to get `courierId`; call `CourierAuthService.logout()`; return `HttpStatus.NO_CONTENT`
- [x] T041 [P] Verify JWT strategy in `src/auth/strategies/jwt.strategy.ts` correctly populates the request user object so `@CurrentCourier()` decorator can extract `courierId` and `owner_id`; update decorator if needed

**Checkpoint**: Flow 3 from `quickstart.md` — logout returns 204; attempting logout again with same token also returns 204 (idempotent).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Swagger documentation, error response consistency, and operational readiness.

- [x] T042 Install `@nestjs/swagger`; configure `SwaggerModule.setup` in `src/main.ts` with `DocumentBuilder` (title: `Couriers API`, version `1.0`); add `@ApiBearerAuth()` global security scheme
- [x] T043 [P] Add Swagger decorators to all `CourierAuthController` endpoints: `@ApiOperation`, `@ApiResponse` for each status code, `@ApiBody` — matching `contracts/auth.yml` schemas exactly
- [x] T044 [P] Create global `HttpExceptionFilter` in `src/common/filters/http-exception.filter.ts` that serializes all errors to the `{ error: { code, message } }` envelope from `contracts/auth.yml`; register in `src/main.ts` with `app.useGlobalFilters()`
- [x] T045 [P] Enable `ValidationPipe` globally in `src/main.ts` with `whitelist: true, forbidNonWhitelisted: true, transform: true`; verify all DTOs reject extra fields and invalid types
- [x] T046 [P] Add `pnpm typeorm migration:run` and `pnpm seed:auth-test` commands to `README.md` quick-start section; document `AUTH_CODE_FIXED` test mode usage
- [ ] T047 Run full quickstart.md manual verification: flows 1–4 all produce expected status codes; update `CLAUDE.md` manual additions section with any project-specific patterns discovered during implementation

**Checkpoint**: `GET /api` renders Swagger UI with all four auth endpoints documented; all error responses match `contracts/auth.yml` error schemas.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1 — SMS Login)**: Depends on Phase 2 — 🎯 MVP deliverable
- **Phase 4 (US2 — Telegram)**: Depends on Phase 3 (reuses code delivery infrastructure)
- **Phase 5 (US3 — Password Login)**: Depends on Phase 2 only — can run parallel to Phase 3/4
- **Phase 6 (US4 — Logout)**: Depends on Phase 3 (needs refresh token entity from T016)
- **Phase 7 (Polish)**: Depends on all story phases complete

### User Story Dependencies

| Story | Depends on | Can run parallel with |
|-------|-----------|----------------------|
| US1 (SMS Login) | Phase 2 | US3 (different files) |
| US2 (Telegram) | US1 (CodeDeliveryProcessor exists) | US3 |
| US3 (Password) | Phase 2 | US1, US2 |
| US4 (Logout) | US1 (CourierRefreshToken entity, token issuance) | US2, US3 |

### Within Each Phase

- Entities → Migrations → Services → Controllers
- Models before services (TypeORM relations must resolve)
- Services before controller handlers
- All `[P]` tasks within a phase can run simultaneously

### Parallel Opportunities

- **Phase 1**: T003, T004 run in parallel with T002
- **Phase 2**: T006, T007, T010, T011, T013, T014 all in parallel after T005
- **Phase 3**: T017, T018 in parallel; T015, T016 in parallel; T021 after both; T025 in parallel with T023/T024
- **Phase 5**: Entire Phase 5 can run in parallel with Phase 3 (different files, no shared state)
- **Phase 7**: T042–T046 all in parallel

---

## Parallel Example: Phase 3 (US1)

```text
# Run in parallel (no conflicts):
T015: src/auth/entities/auth-code.entity.ts + migration
T016: src/auth/entities/courier-refresh-token.entity.ts + migration
T017: src/common/pipes/phone-normalize.pipe.ts
T018: src/auth/dto/send-code.dto.ts + verify-code.dto.ts

# After T015 + T016 complete:
T019: src/auth/code-delivery/code-delivery.service.ts
T020: src/auth/code-delivery/code-delivery.processor.ts  (parallel with T019)

# After T019 + T020 complete:
T021: CourierAuthService.sendCode()
T022: CourierAuthService.verifyCode()  (parallel with T021)

# After T021 + T022:
T023: Controller POST /send-code
T024: Controller POST /verify-code  (parallel with T023)
T025: Send-code throttle guard  (parallel with T023/T024)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T014) — blocks everything
3. Complete Phase 3: US1 SMS Login (T015–T025)
4. **STOP and VALIDATE**: Run quickstart.md flows 1 and 4
5. **MVP delivered**: Couriers can log in via SMS code

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation ready
2. Phase 3 (US1) → SMS login works → MVP ✅
3. Phase 4 (US2) + Phase 5 (US3) → Telegram + password paths (can run in parallel)
4. Phase 6 (US4) → logout works
5. Phase 7 → polished, Swagger-documented, production-ready

### Parallel Team Strategy

With two developers after Phase 2 completes:
- **Developer A**: Phase 3 (US1 SMS) → Phase 4 (US2 Telegram) → Phase 6 (US4 Logout)
- **Developer B**: Phase 5 (US3 Password) → Phase 7 (Polish)

---

## Notes

- `[P]` = different files, no blocking dependency within the same phase
- `[USn]` = maps to User Story n in `spec.md` for traceability
- `password_hash` column uses `select: false` — never returned by default; always query via QueryBuilder with explicit `addSelect`
- All monetary values not present in this feature; see `006-payout-reconciliation` for DECIMAL(12,2) rules
- Commit after each checkpoint; do not batch across phases
- `AUTH_CODE_FIXED` env var enables test mode for local development without a real SMS provider
