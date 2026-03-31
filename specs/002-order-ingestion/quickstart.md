# Quickstart: Order Ingestion

**Feature**: `002-order-ingestion` | **Branch**: `002-order-ingestion`

This guide covers how to set up, run, and manually test the order ingestion feature in a local development environment.

---

## Prerequisites

- Node.js 20 LTS
- Docker + Docker Compose (PostgreSQL and Redis)
- `pnpm`
- Feature `001-courier-auth` must be running (JWT auth is required)

---

## Environment Setup

1. **Start infrastructure services** (if not already running):

   ```bash
   docker compose up -d postgres redis
   ```

2. **Additional environment variables** (add to `.env`):

   ```env
   # No new required variables for order ingestion.
   # The following are inherited from 001-courier-auth:
   # DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD
   # REDIS_HOST, REDIS_PORT
   # JWT_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL
   ```

3. **Run new migrations**:

   ```bash
   pnpm typeorm migration:run
   ```

   New migrations applied:
   - `007_add_owner_default_delivery_fee`
   - `008_add_courier_fcm_token`
   - `009_create_clients`
   - `010_create_orders`
   - `011_create_order_items`
   - `012_create_order_audit_entries`

4. **Start the application**:

   ```bash
   pnpm start:dev
   ```

---

## Seed Data

Run the order ingestion seed script to set up a test tenant with an operator account and a default delivery fee:

```bash
pnpm seed:order-test
```

This creates (or reuses) the seed data from `001-courier-auth` and additionally:
- Sets `owners.default_delivery_fee = 350.00` for the test tenant
- Creates an Operator user with `login = 'operator_test'`, `password = 'Test1234!'` in the test tenant
- Creates a test courier with `fcm_token = 'test-fcm-token-001'`

The script prints the `owner_id` and a valid operator JWT to the console.

---

## Manual Test Flows

### Step 0: Authenticate as an Operator

```bash
# Obtain an access token for the test operator
curl -X POST http://localhost:3000/api/v1/auth/operator/login \
  -H "Content-Type: application/json" \
  -d '{
    "owner_id": "<owner_id_from_seed>",
    "login": "operator_test",
    "password": "Test1234!"
  }'
# Expected: 200 { access_token, ... }
# Save access_token as ACCESS_TOKEN
```

---

### Flow 1: Create an Order (Happy Path)

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "ORD-2026-00001",
    "client_phone": "+79009876543",
    "pickup_address": "ул. Ленина, 10, Москва",
    "pickup_lat": 55.7558,
    "pickup_lng": 37.6173,
    "dropoff_address": "пр. Мира, 45, Москва",
    "dropoff_lat": 55.7890,
    "dropoff_lng": 37.6400,
    "items": [
      { "name": "Пицца Маргарита", "quantity": 2, "price": 850.00 },
      { "name": "Кола 0.5л", "quantity": 2, "price": 120.00 }
    ]
  }'
# Expected: 201 { id, order_number, status: "created", delivery_fee: 350.00, client: {...}, items: [...], ... }
```

Verify:
- `status` is `"created"`
- `delivery_fee` equals `350.00` (from seed tenant config)
- `client.phone` is `"+79009876543"` (new client auto-created)

---

### Flow 2: Duplicate Client Phone (Same Client Reused)

```bash
# Submit a second order with the same client phone
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "ORD-2026-00002",
    "client_phone": "+79009876543",
    "pickup_address": "ул. Пушкина, 1",
    "pickup_lat": 55.7600, "pickup_lng": 37.6200,
    "dropoff_address": "ул. Тверская, 5",
    "dropoff_lat": 55.7700, "dropoff_lng": 37.6100,
    "items": [{ "name": "Суши сет", "quantity": 1, "price": 1500.00 }]
  }'
# Expected: 201 with client.id == same UUID as the client from Flow 1
# No duplicate client record is created.
```

---

### Flow 3: Duplicate Order Number (Rejected)

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "ORD-2026-00001",
    "client_phone": "+79001112233",
    "pickup_address": "ул. Садовая, 3",
    "pickup_lat": 55.7400, "pickup_lng": 37.6000,
    "dropoff_address": "ул. Бауманская, 7",
    "dropoff_lat": 55.7550, "dropoff_lng": 37.6800,
    "items": [{ "name": "Тест", "quantity": 1, "price": 100.00 }]
  }'
# Expected: 409 { error: { code: 409, message: "An order with number 'ORD-2026-00001' already exists...", existing_order_id: "..." } }
```

---

### Flow 4: Validation Errors

```bash
# No items
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_number": "X", "client_phone": "+7900", "pickup_address": "A", "pickup_lat": 55.0, "pickup_lng": 37.0, "dropoff_address": "B", "dropoff_lat": 55.1, "dropoff_lng": 37.1, "items": [] }'
# Expected: 400 — "items must contain at least 1 elements"

# Missing required field
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "order_number": "Y", "client_phone": "+79001234567", "pickup_address": "A", "pickup_lat": 55.0, "pickup_lng": 37.0, "dropoff_address": "B", "items": [{ "name": "X", "quantity": 1, "price": 100 }] }'
# Expected: 400 — "dropoff_lat must be a number..."
```

---

### Flow 5: Courier Role Forbidden

```bash
# Obtain a courier token (from feature 001 flow)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $COURIER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... valid order payload ... }'
# Expected: 403 Forbidden
```

---

### Flow 6: List Orders

```bash
curl http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# Expected: 200 { data: [...], meta: { total, page, limit, total_pages } }

# Filter by status
curl "http://localhost:3000/api/v1/orders?status=created&page=1&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

### Flow 7: External System with Callback URL

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "EXT-9999",
    "client_phone": "+79005554433",
    "pickup_address": "Склад №3, Ленинградское шоссе",
    "pickup_lat": 55.8000, "pickup_lng": 37.5000,
    "dropoff_address": "г. Химки, ул. Молодёжная, 1",
    "dropoff_lat": 55.9000, "dropoff_lng": 37.4000,
    "callback_url": "https://partner.example.com/webhooks/orders/EXT-9999",
    "items": [{ "name": "Посылка", "quantity": 1, "price": 0 }]
  }'
# Expected: 201 with callback_url stored on the order
```

---

## Real-Time Verification (Socket.IO)

To verify the `order:created` event is broadcast to staff:

1. Open a WebSocket client (e.g., `wscat`) and connect:

   ```bash
   wscat -c "ws://localhost:3000/socket.io/?token=$ACCESS_TOKEN&EIO=4&transport=websocket"
   ```

2. Subscribe to the staff room event by sending the join message (handled automatically on connection by the gateway).

3. Create an order via the REST API in a separate terminal.

4. The WebSocket client should receive:

   ```json
   { "event": "order:created", "data": { "id": "...", "order_number": "...", "status": "created", ... } }
   ```

---

## BullMQ Notification Job

After order creation, a `new-order-notify` job is queued in BullMQ. To inspect:

```bash
docker exec -it <redis_container> redis-cli
> LRANGE bull:new-order-notify:wait 0 -1
```

In local development, the FCM processor logs the push payload to stdout instead of calling FCM (when `FCM_PROJECT_ID` is not set or `NODE_ENV=test`).

---

## Running Tests

```bash
# Unit tests (orders module)
pnpm test -- --testPathPattern=orders

# Integration tests (requires running postgres + redis)
pnpm test:e2e -- --testPathPattern=orders
```
