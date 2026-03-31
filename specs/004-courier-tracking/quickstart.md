# Quickstart: Courier Tracking

**Feature**: `004-courier-tracking`

---

## Step 0: Prerequisites

1. All migrations from features 001–004 applied: `pnpm migration:run`
2. Seed test data: `pnpm seed:order-lifecycle-test`
   - Prints `OWNER_ID`, `OPERATOR_TOKEN`, `COURIER_TOKEN_1`, `COURIER_TOKEN_2`
3. Server running: `pnpm start:dev`

---

## Flow 1 — Courier Submits Location, Operator Sees Update

```bash
# Courier submits a GPS coordinate
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"lat": 55.7558, "lng": 37.6173}'
# Expected: 200
# {
#   "courier_id": "...",
#   "lat": 55.7558,
#   "lng": 37.6173,
#   "recorded_at": "...",
#   "order_id": null,
#   "distance_meters": 0
# }
```

**Verify real-time (Terminal 1)**:
```bash
# Connect as operator to staff room (Socket.IO)
wscat -c "ws://localhost:3000/socket.io/?EIO=4&transport=websocket" \
  --header "Authorization: Bearer $OPERATOR_TOKEN"
# After courier submits location, Terminal 1 should receive within 3s:
# { event: "courier:location_updated", data: { courierId, lat, lng, recordedAt, ... } }
```

---

## Flow 2 — Location Updates Linked to Active Order

```bash
# 1. Operator creates an order
ORDER=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "TRK-001",
    "client_phone": "+79001234567",
    "pickup_address": "Pickup St 1",
    "pickup_lat": 55.7558, "pickup_lng": 37.6173,
    "dropoff_address": "Dropoff Ave 2",
    "dropoff_lat": 55.789, "dropoff_lng": 37.64,
    "items": [{"name": "Box", "quantity": 1, "price": 500}]
  }')
ORDER_ID=$(echo $ORDER | jq -r '.id')

# 2. Courier claims the order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: status = "assigned"

# 3. Courier submits location — should be linked to order
LOCATION=$(curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"lat": 55.7560, "lng": 37.6175}')
echo "order_id in response: $(echo $LOCATION | jq -r '.order_id')"
# Expected: order_id = ORDER_ID
```

---

## Flow 3 — Route History Retrievable After Delivery

```bash
# Continue from Flow 2 — progress order to complete, sending intermediate locations
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -d '{"lat": 55.760, "lng": 37.620}' -H "Content-Type: application/json"
sleep 5
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -d '{"lat": 55.770, "lng": 37.630}' -H "Content-Type: application/json"
sleep 5

# Progress order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/pickup \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/start-delivery \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_ID/complete \
  -H "Authorization: Bearer $COURIER_TOKEN_1"

# Retrieve route history
curl -s http://localhost:3000/api/v1/orders/$ORDER_ID/route \
  -H "Authorization: Bearer $OPERATOR_TOKEN" | jq '{
  total_distance_meters: .total_distance_meters,
  point_count: (.points | length)
}'
# Expected: point_count > 0, total_distance_meters > 0
```

---

## Flow 4 — Rate Limit Enforced

```bash
# Submit two requests within 5 seconds — second should be rejected
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -d '{"lat": 55.756, "lng": 37.617}' -H "Content-Type: application/json"

curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -d '{"lat": 55.757, "lng": 37.618}' -H "Content-Type: application/json"
# Expected second response: 429 Too Many Requests
```

---

## Flow 5 — Invalid Coordinates Rejected

```bash
# Latitude > 90 (invalid)
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"lat": 95.0, "lng": 37.6173}'
# Expected: 400 Bad Request (validation error)

# Missing lat (invalid)
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"lng": 37.6173}'
# Expected: 400 Bad Request
```

---

## Flow 6 — Operator Cannot Submit Location (403)

```bash
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lat": 55.7558, "lng": 37.6173}'
# Expected: 403 Forbidden
```

---

## Flow 7 — Route History Access Control

```bash
# Courier cannot access route history
curl -s http://localhost:3000/api/v1/orders/$ORDER_ID/route \
  -H "Authorization: Bearer $COURIER_TOKEN_1"
# Expected: 403 Forbidden

# Cross-tenant 404
FAKE_ORDER_ID="00000000-0000-0000-0000-000000000099"
curl -s http://localhost:3000/api/v1/orders/$FAKE_ORDER_ID/route \
  -H "Authorization: Bearer $OPERATOR_TOKEN"
# Expected: 404 Not Found
```

---

## Flow 8 — External Callback for Location Update (requires callback_url on order)

```bash
# Create order with callback_url
ORDER_CB=$(curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_number": "TRK-CB-001",
    "client_phone": "+79001234569",
    "pickup_address": "A", "pickup_lat": 55.7, "pickup_lng": 37.6,
    "dropoff_address": "B", "dropoff_lat": 55.8, "dropoff_lng": 37.7,
    "callback_url": "https://webhook.site/<YOUR_ID>",
    "items": [{"name": "Y", "quantity": 1, "price": 200}]
  }')
ORDER_CB_ID=$(echo $ORDER_CB | jq -r '.id')

# Claim order
curl -s -X POST http://localhost:3000/api/v1/orders/$ORDER_CB_ID/claim \
  -H "Authorization: Bearer $COURIER_TOKEN_1"

# Submit location — should trigger callback
curl -s -X POST http://localhost:3000/api/v1/couriers/location \
  -H "Authorization: Bearer $COURIER_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"lat": 55.756, "lng": 37.617}'
# Check webhook.site — should receive POST:
# { courier_id: "...", order_id: "...", lat: 55.756, lng: 37.617, timestamp: "..." }
```

---

## Seed Script Reference

`pnpm seed:order-lifecycle-test` provides all required tokens (from feature 003).
No new seed script is needed for this feature.
