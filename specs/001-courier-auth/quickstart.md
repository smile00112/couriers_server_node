# Quickstart: Courier Authentication

**Feature**: `001-courier-auth` | **Branch**: `001-courier-auth`

This guide covers how to set up, run, and manually test the courier authentication feature in a local development environment.

---

## Prerequisites

- Node.js 20 LTS
- Docker + Docker Compose (for PostgreSQL and Redis)
- `pnpm` or `npm`

---

## Environment Setup

1. **Start infrastructure services**:

   ```bash
   docker compose up -d postgres redis
   ```

   Minimum `docker-compose.yml` services needed:
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       environment:
         POSTGRES_DB: couriers
         POSTGRES_USER: couriers
         POSTGRES_PASSWORD: couriers
       ports: ["5432:5432"]

     redis:
       image: redis:7-alpine
       ports: ["6379:6379"]
   ```

2. **Copy and configure environment**:

   ```bash
   cp .env.example .env
   ```

   Minimum required variables for auth:

   ```env
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_DATABASE=couriers
   DB_USERNAME=couriers
   DB_PASSWORD=couriers

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # JWT
   JWT_SECRET=local-dev-secret-change-in-production
   JWT_ACCESS_TTL=900           # 15 minutes in seconds
   JWT_REFRESH_TTL=2592000      # 30 days in seconds

   # Rate limiting
   THROTTLE_CODE_LIMIT=5        # max send-code requests
   THROTTLE_CODE_TTL=600        # per 10-minute window (seconds)
   THROTTLE_LOGIN_LIMIT=5
   THROTTLE_LOGIN_TTL=600

   # Code delivery (test mode — skip real SMS)
   AUTH_CODE_FIXED=123456       # set to use a fixed code in all local tests; unset in production
   AUTH_CHANNEL_DEFAULT=sms
   ```

3. **Install dependencies**:

   ```bash
   pnpm install
   ```

4. **Run migrations**:

   ```bash
   pnpm typeorm migration:run
   ```

5. **Start the application**:

   ```bash
   pnpm start:dev
   ```

---

## Seed Data

Before testing, create a test tenant and courier. Run the seed script:

```bash
pnpm seed:auth-test
```

This creates:
- An `Owner` with a known `owner_id` (printed to console)
- A `Courier` with phone `+79001234567` in that tenant
- A second `Courier` with `login = 'courier_test'` and `password = 'Test1234!'`

---

## Manual Test Flows

### Flow 1: SMS Code Login (Happy Path)

```bash
# Step 1 — Request a code (AUTH_CODE_FIXED must be set in .env)
curl -X POST http://localhost:3000/api/v1/auth/courier/send-code \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<owner_id_from_seed>",
    "phone": "+79001234567",
    "channel": "sms"
  }'
# Expected: 202 No Content

# Step 2 — Verify the fixed code
curl -X POST http://localhost:3000/api/v1/auth/courier/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<owner_id_from_seed>",
    "phone": "+79001234567",
    "code": "123456"
  }'
# Expected: 200 { access_token, refresh_token, token_type, expires_in }
```

### Flow 2: Password Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/courier/login \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<owner_id_from_seed>",
    "login": "courier_test",
    "password": "Test1234!"
  }'
# Expected: 200 { access_token, refresh_token, token_type, expires_in }
```

### Flow 3: Logout

```bash
# Use the access_token and refresh_token from Flow 1 or 2
curl -X POST http://localhost:3000/api/v1/auth/courier/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "refresh_token": "<refresh_token>" }'
# Expected: 204 No Content
```

### Flow 4: Error Cases

```bash
# Expired / wrong code
curl -X POST http://localhost:3000/api/v1/auth/courier/verify-code \
  -H "Content-Type: application/json" \
  -d '{ "owner_id": "<id>", "phone": "+79001234567", "code": "000000" }'
# Expected: 401

# Unknown phone
curl -X POST http://localhost:3000/api/v1/auth/courier/send-code \
  -H "Content-Type: application/json" \
  -d '{ "owner_id": "<id>", "phone": "+70000000000" }'
# Expected: 404

# Wrong password
curl -X POST http://localhost:3000/api/v1/auth/courier/login \
  -H "Content-Type: application/json" \
  -d '{ "owner_id": "<id>", "login": "courier_test", "password": "wrong" }'
# Expected: 401
```

---

## Running Tests

```bash
# Unit tests (auth module only)
pnpm test -- --testPathPattern=auth

# Integration tests (requires running postgres + redis)
pnpm test:e2e -- --testPathPattern=auth
```

---

## Checking the BullMQ Queue (Code Delivery)

In local development with `AUTH_CODE_FIXED` set, the BullMQ job is still enqueued but the delivery processor uses the fixed code and logs to stdout instead of calling an SMS provider. To inspect the queue:

```bash
# Open Bull Board UI (if configured)
open http://localhost:3000/admin/queues

# Or inspect via Redis CLI
docker exec -it <redis_container> redis-cli
> LRANGE bull:code-delivery:wait 0 -1
```
