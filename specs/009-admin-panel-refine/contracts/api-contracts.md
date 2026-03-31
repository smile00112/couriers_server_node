# API Contracts: Admin Panel

**Branch**: `009-admin-panel-refine` | **Date**: 2026-03-30

These contracts define the REST API surface the admin panel frontend consumes.
Endpoints marked **[EXISTING]** are already implemented in the backend.
Endpoints marked **[NEW]** must be added to the backend as part of this feature.

---

## Authentication

### POST /api/v1/auth/courier/login [EXISTING - repurposed for staff]

> **Note**: The admin panel uses the same login endpoint as mobile couriers but
> expects a JWT with a non-courier role (`owner`, `manager`, `order_operator`).
> If a separate staff auth endpoint is added, update this contract.

**Request**:
```json
{
  "username": "manager@example.com",
  "password": "securepassword"
}
```

**Response 200**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "role": "manager",
    "owner_id": "uuid"
  }
}
```

**Response 401**: Invalid credentials

**JWT payload decoded**:
```json
{
  "sub": "user-uuid",
  "owner_id": "tenant-uuid",
  "role": "manager"
}
```

---

## Orders

### GET /orders [EXISTING]

**Query params**: `page` (default 1), `limit` (default 20), `status` (optional)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "order_number": "ORD-001",
      "status": "assigned",
      "client": { "id": "uuid", "phone": "+79001234567", "name": null },
      "courier": { "id": "uuid", "first_name": "Ivan", "last_name": "Petrov", "phone": "+79007654321" },
      "pickup_address": "Moscow, Tverskaya 1",
      "dropoff_address": "Moscow, Arbat 5",
      "delivery_fee": 250.00,
      "created_at": "2026-03-30T10:00:00Z",
      "updated_at": "2026-03-30T10:15:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8
  }
}
```

**Auth**: Bearer token (owner / manager / order_operator)

---

### GET /orders/:id [EXISTING]

**Response 200**:
```json
{
  "id": "uuid",
  "order_number": "ORD-001",
  "status": "in_delivery",
  "client": { "id": "uuid", "phone": "+79001234567", "name": "Иван Иванов" },
  "courier": { "id": "uuid", "first_name": "Ivan", "last_name": "Petrov", "phone": "+79007654321" },
  "pickup_address": "Moscow, Tverskaya 1",
  "pickup_lat": 55.7558,
  "pickup_lng": 37.6176,
  "dropoff_address": "Moscow, Arbat 5",
  "dropoff_lat": 55.7494,
  "dropoff_lng": 37.5900,
  "delivery_fee": 250.00,
  "callback_url": null,
  "items": [
    { "id": "uuid", "name": "Pizza Margherita", "quantity": 2, "price": 550.00 }
  ],
  "assigned_at": "2026-03-30T10:05:00Z",
  "picked_up_at": "2026-03-30T10:20:00Z",
  "in_delivery_at": "2026-03-30T10:25:00Z",
  "completed_at": null,
  "cancelled_at": null,
  "audit_entries": [
    {
      "id": "uuid",
      "action": "created",
      "actor_id": "uuid",
      "actor_role": "order_operator",
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T10:25:00Z"
}
```

**Response 404**: Order not found or belongs to different tenant

---

### POST /orders/:id/cancel [EXISTING]

**Request**:
```json
{ "reason": "Customer request" }
```

**Response 200**: Updated order object (same shape as GET /orders/:id)

**Response 404**: Order not found

**Response 409**: Order already in terminal state (completed or cancelled)

---

## Couriers

### GET /api/v1/couriers [NEW]

**Query params**: `page` (default 1), `limit` (default 20), `search` (optional, matches name or phone)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "first_name": "Ivan",
      "last_name": "Petrov",
      "phone": "+79001234567",
      "status": "available",
      "login": "ivan.petrov",
      "telegram_chat_id": null,
      "created_at": "2026-01-15T09:00:00Z",
      "updated_at": "2026-03-30T10:00:00Z"
    }
  ],
  "meta": { "total": 25, "page": 1, "limit": 20, "total_pages": 2 }
}
```

**Auth**: Bearer token (owner / manager / order_operator)

---

### GET /api/v1/couriers/:id [NEW]

**Response 200**:
```json
{
  "id": "uuid",
  "first_name": "Ivan",
  "last_name": "Petrov",
  "phone": "+79001234567",
  "status": "available",
  "login": "ivan.petrov",
  "telegram_chat_id": null,
  "current_position": {
    "lat": 55.7558,
    "lng": 37.6176,
    "recorded_at": "2026-03-30T10:30:00Z"
  },
  "current_shift": {
    "id": "uuid",
    "status": "open",
    "started_at": "2026-03-30T08:00:00Z",
    "elapsed_minutes": 150
  },
  "created_at": "2026-01-15T09:00:00Z",
  "updated_at": "2026-03-30T10:00:00Z"
}
```

**Response 404**: Courier not found or belongs to different tenant

---

### PATCH /api/v1/couriers/:id [NEW]

**Request**:
```json
{
  "first_name": "Ivan",
  "last_name": "Sidorov",
  "phone": "+79001234567",
  "status": "unavailable",
  "login": "ivan.sidorov",
  "telegram_chat_id": null
}
```
All fields optional; only provided fields are updated.

**Response 200**: Updated courier object (same shape as GET /api/v1/couriers/:id)

**Response 404**: Courier not found

**Response 409**: Phone or login already in use by another courier

---

## Users (Staff Accounts)

### GET /api/v1/users [NEW]

**Query params**: `page` (default 1), `limit` (default 20)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Алексей Менеджер",
      "email": "manager@acme.com",
      "role": "manager",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20, "total_pages": 1 }
}
```

**Auth**: Bearer token (owner / manager)
**Note**: order_operator role receives 403 on create/edit/delete; list is accessible.

---

### POST /api/v1/users [NEW]

**Request**:
```json
{
  "name": "Новый Менеджер",
  "email": "newmanager@acme.com",
  "role": "manager",
  "password": "securepassword123"
}
```

**Response 201**: Created user object (no password in response)

**Response 409**: Email already registered

**Auth**: Bearer token (**owner only** — Constitution Principle IV: Manager cannot manage users)

---

### PATCH /api/v1/users/:id [NEW]

**Request**:
```json
{
  "name": "Обновлённое Имя",
  "role": "order_operator"
}
```

**Response 200**: Updated user object

**Response 403**: Manager or order_operator attempting this; or self-delete attempt

**Auth**: Bearer token (**owner only** — Constitution Principle IV)

---

### DELETE /api/v1/users/:id [NEW]

**Response 204**: No content

**Response 403**: Cannot delete own account; only owner role may call this

**Response 404**: User not found

**Auth**: Bearer token (**owner only** — Constitution Principle IV)

---

## Route History

### GET /api/v1/route-history [NEW]

**Query params**:
- `page` (default 1), `limit` (default 20)
- `courier_id` (optional, UUID)
- `order_id` (optional, UUID)
- `from` (optional, ISO date)
- `to` (optional, ISO date)

**Response 200**:
```json
{
  "data": [
    {
      "order_id": "uuid",
      "courier_id": "uuid",
      "courier_name": "Ivan Petrov",
      "order_number": "ORD-001",
      "total_distance_meters": 4250,
      "recorded_date": "2026-03-30",
      "point_count": 87
    }
  ],
  "meta": { "total": 340, "page": 1, "limit": 20, "total_pages": 17 }
}
```

**Auth**: Bearer token (owner / manager / order_operator)

---

### GET /orders/:id/route [EXISTING]

**Response 200**:
```json
{
  "order_id": "uuid",
  "courier_id": "uuid",
  "total_distance_meters": 4250,
  "points": [
    {
      "id": "uuid",
      "lat": 55.7558,
      "lng": 37.6176,
      "distance_meters": 0,
      "recorded_at": "2026-03-30T10:25:00Z"
    }
  ]
}
```

**Response 404**: Order not found or no route recorded yet

---

## Error Response Convention

All endpoints return errors in this format:
```json
{
  "statusCode": 404,
  "message": "Order not found",
  "error": "Not Found"
}
```

The admin panel maps HTTP status codes to user-facing messages:
- `401` → Redirect to login
- `403` → Toast: "You do not have permission to perform this action"
- `404` → Toast: "Record not found"
- `409` → Toast: specific conflict message from `message` field
- `422` → Toast: validation error message
- `500` → Toast: "An unexpected error occurred. Please try again."
