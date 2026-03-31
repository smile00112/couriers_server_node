# Quickstart: Work Shift Management

**Feature**: `007-work-shift-management`

---

## Step 0: Prerequisites

1. All migrations from features 001–007 applied: `pnpm migration:run`
2. Seed test data: `pnpm seed:order-lifecycle-test`
   - Prints `OWNER_ID`, `OPERATOR_TOKEN`, `COURIER_TOKEN_1`, `COURIER_TOKEN_2`
3. Server running: `pnpm start:dev`

---

## Flow 1 — Courier Opens a Shift

```bash
# Courier opens a shift
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 201
# {
#   "id": "...",
#   "courier_id": "...",
#   "status": "open",
#   "started_at": "...",
#   "ended_at": null,
#   "duration_minutes": null
# }

SHIFT_ID=$(curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_1" | jq -r '.id')
# Expected: 409 Conflict (second attempt while first is open)
```

---

## Flow 2 — Courier Checks Current Shift

```bash
curl -s http://localhost:3000/api/v1/couriers/shift/current \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 200 with open shift record (started_at set, ended_at null)
```

---

## Flow 3 — Order Claim Blocked Without Open Shift

```bash
# Courier 2 has NO open shift yet
ORDER=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "SHIFT-001",
    "client_phone": "+79001234567",
    "pickup_address": "Pickup St 1",
    "pickup_lat": 55.7558, "pickup_lng": 37.6173,
    "dropoff_address": "Dropoff Ave 2",
    "dropoff_lat": 55.789, "dropoff_lng": 37.64,
    "items": [{"name": "Box", "quantity": 1, "price": 500}]
  }')
ORDER_ID=$(echo $ORDER | jq -r '.id')

# Courier 2 (no open shift) tries to claim → should be rejected
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_2"
# Expected: 422 Unprocessable Entity
# { "statusCode": 422, "message": "Courier does not have an open shift" }
```

---

## Flow 4 — Order Claim Succeeds With Open Shift

```bash
# Open shift for Courier 1 (already open from Flow 1)
# Courier 1 claims the order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 200 with order status = "assigned"
```

---

## Flow 5 — Courier Closes Shift

```bash
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/close \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 200 with status = "closed", ended_at set, duration_minutes > 0
```

---

## Flow 6 — Duplicate Open / Premature Close Rejected

```bash
# Courier 1 shift already closed — try to close again
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/close \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 409 Conflict

# Try to open a second shift while first still open (reopen Courier 1 first)
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected second response: 409 Conflict
```

---

## Flow 7 — Staff Views Shift History for a Courier

```bash
OWNER_ID="..." # from seed output

# Get shift history for Courier 1 (staff token required)
curl -s "http://localhost:3000/api/v1/couriers/$COURIER_1_ID/shifts?page=1&limit=10" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" | jq '{
  total: .meta.total,
  first_shift_status: .data[0].status,
  first_shift_duration: .data[0].duration_minutes
}'
# Expected: total >= 1, first_shift_status = "closed" (most recent), duration_minutes > 0
```

---

## Flow 8 — Staff Views All Active Shifts

```bash
# Open a shift for Courier 2 first
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_2"

curl -s http://localhost:3000/api/v1/couriers/active-shifts \
  -H "Authorization: Bearer $OPERATOR_TOKEN" | jq '{
  total: .total,
  couriers: [.data[] | .courier_name]
}'
# Expected: total >= 1, Courier 2 visible in list
```

---

## Flow 9 — Real-Time Socket.IO Notification on Shift Open

```bash
# Terminal 1: Connect as operator
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket" \
  --header "Authorization: Bearer $OPERATOR_TOKEN"

# Terminal 2: Courier 2 closes and reopens shift
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/close \
  -H "Authorization: Bearer $COURIER_TOKEN_2"
curl -s -X POST http://localhost:3000/api/v1/couriers/shift/open \
  -H "Authorization: Bearer $COURIER_TOKEN_2"

# Terminal 1 should receive within 3s:
# { event: "courier:shift_closed", data: { courierId, shiftId, durationMinutes, ... } }
# { event: "courier:shift_opened", data: { courierId, courierName, startedAt, ... } }
```

---

## Flow 10 — Courier Views Own Shift History

```bash
curl -s "http://localhost:3000/api/v1/couriers/shift/history?page=1&limit=20" \
  -H "Authorization: Bearer $COURIER_TOKEN_1" | jq '{
  total: .meta.total,
  shifts: [.data[] | { status: .status, duration_minutes: .duration_minutes }]
}'
# Expected: list of own shifts ordered newest first
```

---

## Seed Script Reference

`pnpm seed:order-lifecycle-test` provides all required tokens (from feature 003).
No new seed script is needed for this feature.
