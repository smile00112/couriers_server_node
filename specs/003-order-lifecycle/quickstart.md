# Quickstart: Order Lifecycle

**Feature**: `003-order-lifecycle`

---

## Step 0: Prerequisites

1. All migrations from features 001–003 applied: `pnpm migration:run`
2. Seed test data: `pnpm seed:order-lifecycle-test`
   - Prints `OWNER_ID`, `OPERATOR_TOKEN`, `COURIER_TOKEN_1`, `COURIER_TOKEN_2`
3. Server running: `pnpm start:dev`

---

## Flow 1 — Full Happy Path (Courier Completes an Order)

```bash
# Create an order as operator
ORDER=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "LC-001",
    "client_phone": "+79001234567",
    "pickup_address": "Pickup St 1",
    "pickup_lat": 55.7558, "pickup_lng": 37.6173,
    "dropoff_address": "Dropoff Ave 2",
    "dropoff_lat": 55.789, "dropoff_lng": 37.64,
    "items": [{"name": "Pizza", "quantity": 1, "price": 850}]
  }')
ORDER_ID=$(echo $ORDER | jq -r '.id')
echo "Created order $ORDER_ID with status $(echo $ORDER | jq -r '.status')"
# Expected: status = "created"

# Courier sees the order in available list
curl -s http://localhost:3000/api/v1/orders/available \
  -H "Authorization: Bearer $COURIER_TOKEN_1" | jq '.data[0].order_number'
# Expected: "LC-001"

# Courier claims the order
CLAIMED=$(curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1")
echo "After claim: $(echo $CLAIMED | jq -r '.status')"
# Expected: status = "assigned"

# Courier picks up the package
PICKED=$(curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/pickup \
  -H "Authorization: Bearer $COURIER_TOKEN_1")
echo "After pickup: $(echo $PICKED | jq -r '.status')"
# Expected: status = "picked_up"

# Courier starts delivery
INDELIVERY=$(curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/start-delivery \
  -H "Authorization: Bearer $COURIER_TOKEN_1")
echo "After start-delivery: $(echo $INDELIVERY | jq -r '.status')"
# Expected: status = "in_delivery"

# Courier completes delivery
COMPLETED=$(curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/complete \
  -H "Authorization: Bearer $COURIER_TOKEN_1")
echo "After complete: $(echo $COMPLETED | jq -r '.status')"
echo "completed_at: $(echo $COMPLETED | jq -r '.completed_at')"
# Expected: status = "completed", completed_at not null
```

**Verify earnings recorded**:
```bash
# Check via GET order detail — delivery_fee should match owner's default (350.00)
curl -s http://localhost:3000/api/v1/orders/$ORDER_ID \
  -H "Authorization: Bearer $OPERATOR_TOKEN" | jq '.delivery_fee'
# Expected: 350
```

---

## Flow 2 — Two Couriers Race to Claim (US2)

```bash
# Create a fresh order
ORDER2=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_number":"LC-RACE","client_phone":"+79001234567","pickup_address":"A","pickup_lat":55.7,"pickup_lng":37.6,"dropoff_address":"B","dropoff_lat":55.8,"dropoff_lng":37.7,"items":[{"name":"Item","quantity":1,"price":100}]}')
ORDER2_ID=$(echo $ORDER2 | jq -r '.id')

# Two couriers claim simultaneously (run in background)
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER2_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1" &
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER2_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_2" &
wait

# Expected: one returns status=assigned, the other returns 409
```

---

## Flow 3 — Courier Already Has Active Order (FR-016)

```bash
# Courier 1 already has an assigned order from Flow 1 (or create new)
# Courier 1 tries to claim a second order
curl -s -X POST http://localhost:3000/api/v1/orders/NEW_ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 409 { message: "Courier already has an active order" }
```

---

## Flow 4 — Operator Cancels Available Order (US3, Scenario 1)

```bash
ORDER3=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_number":"LC-CANCEL-1","client_phone":"+79001234568","pickup_address":"A","pickup_lat":55.7,"pickup_lng":37.6,"dropoff_address":"B","dropoff_lat":55.8,"dropoff_lng":37.7,"items":[{"name":"X","quantity":1,"price":50}]}')
ORDER3_ID=$(echo $ORDER3 | jq -r '.id')

curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER3_ID/cancel \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Customer cancelled"}'
# Expected: 200, status = "cancelled", cancelled_at not null
```

---

## Flow 5 — Operator Cancels In-Progress Order (US3, Scenario 3)

```bash
# Create, assign, and progress an order to in_delivery, then cancel
# (Shortcut: just cancel from any non-terminal state)
ORDER4_ID="<any assigned/picked_up/in_delivery order>"

curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER4_ID/cancel \
  -H "Authorization: Bearer $OPERATOR_TOKEN"
# Expected: 200, status = "cancelled"
# Verify no courier_earnings row was created for this order
```

---

## Flow 6 — Backward Transition Rejected

```bash
# Try to go from picked_up back to assigned
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 422 { message: "Cannot transition from 'picked_up'" }
```

---

## Flow 7 — Cancel Terminal Order Rejected (Edge Case)

```bash
# Try to cancel a completed order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/cancel \
  -H "Authorization: Bearer $OPERATOR_TOKEN"
# Expected: 422 { message: "Cannot transition from 'completed'" }
```

---

## Flow 8 — Courier Cannot Cancel (FR-008)

```bash
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/cancel \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 403 Forbidden
```

---

## Flow 9 — External Callback (US5, requires callback_url)

```bash
# Create order with callback_url
ORDER_CB=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_number":"LC-CB-001","client_phone":"+79001234569","pickup_address":"A","pickup_lat":55.7,"pickup_lng":37.6,"dropoff_address":"B","dropoff_lat":55.8,"dropoff_lng":37.7,"callback_url":"https://webhook.site/<YOUR_ID>","items":[{"name":"Y","quantity":1,"price":200}]}')
ORDER_CB_ID=$(echo $ORDER_CB | jq -r '.id')

# Progress to picked_up — should trigger callback
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_CB_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_CB_ID/pickup \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Check webhook.site — should receive POST with { order_id, status: "picked_up", timestamp }
```

---

## Real-Time Verification (US4)

```bash
# Terminal 1: Connect as operator (staff room)
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket" \
  --header "Authorization: Bearer $OPERATOR_TOKEN"
# After connection: listen for "order:status_changed"

# Terminal 2: Courier claims order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"

# Terminal 1 should receive within 3 seconds:
# { event: "order:status_changed", data: { status: "assigned", previous_status: "created", ... } }
```

---

## Seed Script Reference

`pnpm seed:order-lifecycle-test` creates:
- One `Owner` with `default_delivery_fee = 350.00`
- Two `Courier` records with `fcm_token` values
- Mints JWTs: `OPERATOR_TOKEN` (role=order_operator), `COURIER_TOKEN_1`, `COURIER_TOKEN_2`
- Prints all tokens and `OWNER_ID` to console
