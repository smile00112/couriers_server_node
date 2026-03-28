# Courier Tracking

## Purpose

Define how courier location updates are accepted, persisted, and propagated. Covers live coordinate
updates, movement history accumulation, operator real-time visibility, and optional callbacks to
external sources tied to the courier's active order.

## Scope

- Authenticated coordinate updates from the courier app.
- Persistence of the courier's latest location on their profile.
- `CourierWayHistory` accumulation with distance delta.
- Realtime location broadcast to operator dashboards.
- Async external callback when the active order has `source_url`.

## Out of Scope

- Order status transitions (see `03-order-lifecycle.md`).
- Geofencing or boundary alerts.
- Route optimization or ETA calculation.

## Actors

- Courier App
- Backend API
- Operator dashboard (Socket.IO consumer)
- External source callback endpoint (when order has `source_url`)

## Core Entities

| Entity | Scope | Notes |
|--------|-------|-------|
| `Courier` | `owner_id`-scoped | `lat`, `lng`, `location_updated_at` updated on each call |
| `CourierWayHistory` | `owner_id`-scoped | One row per accepted update: coords, distance_delta (meters), order_id (nullable) |
| `Order` | `owner_id`-scoped | Referenced to check active order and `source_url` |

All entities carry `owner_id` enforced at the service layer.

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/courier/location` | JWT (Courier) | Submit a location update |

### Request Body

```json
{
  "lat": "decimal — required, range -90..90, max 8 decimal places",
  "lng": "decimal — required, range -180..180, max 8 decimal places"
}
```

### Response

`200 OK`
```json
{ "recorded": true }
```

## Business Rules

### Rate Limiting
- Maximum **1 update per 3 seconds** per courier, enforced via Redis sliding-window counter.
- Requests exceeding this rate MUST return `429`. The app SHOULD throttle client-side.

### Coordinate Validation
- `lat` MUST be in range `[-90, 90]`; `lng` MUST be in range `[-180, 180]`.
- Both fields are required; missing or null values MUST return `400`.
- Maximum precision: 8 decimal places. Values with more decimal places are rounded server-side.

### Courier Profile Update
- `courier.lat`, `courier.lng`, and `courier.location_updated_at` MUST be updated on every accepted request.
- This write MUST be in the same database transaction as the `CourierWayHistory` insert.

### CourierWayHistory
- One row MUST be inserted per accepted update.
- **Distance delta**: calculated using the **Haversine formula** against the courier's previous recorded
  coordinates. Stored as integer meters.
- If this is the courier's first location update (no previous coordinates), `distance_delta = 0`.
- If `distance_delta < 5 meters`, the history row is still recorded (for completeness) but the delta
  is stored as `0` to avoid noise in distance reports.
- `order_id` on the history row is set to the courier's currently active order if one exists.
  "Active order" = an order with status `assigned`, `picked_up`, or `in_delivery` assigned to this courier.

### Realtime Broadcast
- After the transaction commits, the system MUST emit a `courier.location_updated` event to the
  operator-facing Socket.IO room for the tenant (`owner:{owner_id}:operators`).
- Broadcast is async (post-transaction); failure to deliver MUST NOT fail the HTTP response.

### External Callback
- If the courier has an active order with `source_url`, the system MUST enqueue a BullMQ callback job.
- Callback is async (MUST NOT block the response).
- Delivery: 3 attempts, exponential backoff (1 s → 5 s → 30 s), 10 s timeout per attempt.
- Failure after 3 attempts: move to dead-letter queue.

### CourierWayHistory Retention
- Rows older than **90 days** MAY be purged by a scheduled cleanup job.
- Index required: `(courier_id, created_at)` for efficient time-range queries.

## Realtime Event

Room: `owner:{owner_id}:operators`

```json
{
  "event": "courier.location_updated",
  "payload": {
    "courier_id":   "uuid",
    "lat":          "decimal",
    "lng":          "decimal",
    "order_id":     "uuid | null",
    "timestamp":    "ISO8601"
  }
}
```

## External Callback Payload

```json
{
  "order_number": "string",
  "courier_lat":  "decimal",
  "courier_lng":  "decimal",
  "timestamp":    "ISO8601"
}
```

## Error Contracts

| HTTP | Scenario |
|------|----------|
| `400` | Missing or invalid `lat` / `lng` |
| `401` | Missing or invalid JWT |
| `429` | Rate limit exceeded (more than 1 update per 3 seconds) |

## Dependencies

- JWT auth + Courier role guard (NestJS)
- Redis (rate limiting counter)
- Haversine distance utility
- BullMQ (async callback jobs)
- Socket.IO + Redis adapter (realtime broadcast)

## Acceptance Criteria

1. A valid coordinate update sets `courier.lat`, `courier.lng`, `courier.location_updated_at` and inserts a `CourierWayHistory` row in one transaction.
2. `distance_delta` is calculated via Haversine against the previous location.
3. Operators receive a `courier.location_updated` Socket.IO event after every accepted update.
4. A second update within 3 seconds returns `429`.
5. An update with `lat` out of range `[-90, 90]` returns `400`.
6. If the courier has an active order with `source_url`, a location callback job is enqueued asynchronously.
7. Tracking works independently of order lifecycle — location updates are accepted whether or not an active order exists.
