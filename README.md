# Couriers Backend

NestJS REST API for the AI-first couriers platform.

## Quick Start

### Prerequisites

- Node.js 20 LTS
- Docker + Docker Compose
- pnpm

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env as needed
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run migrations

```bash
pnpm migration:run
```

### 5. Seed test data (development only)

```bash
pnpm seed:auth-test
# Prints the owner_id for use in manual test flows
```

### 6. Start the API

```bash
pnpm start:dev
```

Swagger UI is available at: `http://localhost:3000/api`

---

## Auth Test Mode (`AUTH_CODE_FIXED`)

Set `AUTH_CODE_FIXED=123456` in `.env` to skip real SMS/Telegram delivery.
The BullMQ job still runs, but the processor logs the code to stdout instead of calling any external provider.

This is the recommended mode for local development and integration testing.

---

## Manual Test Flows

See [`specs/001-courier-auth/quickstart.md`](specs/001-courier-auth/quickstart.md) for full curl examples (flows 1–4).

---

## Commands

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Start with file watching |
| `pnpm build` | Compile TypeScript |
| `pnpm test` | Run unit tests |
| `pnpm test:e2e` | Run integration tests (requires Postgres + Redis) |
| `pnpm lint` | ESLint |
| `pnpm migration:run` | Run pending TypeORM migrations |
| `pnpm migration:revert` | Revert last migration |
| `pnpm seed:auth-test` | Seed Owner + Couriers for auth testing |
