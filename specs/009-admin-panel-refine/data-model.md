# Data Model: Admin Panel

**Branch**: `009-admin-panel-refine` | **Date**: 2026-03-30

This document describes the frontend entity shapes — what the admin panel
reads from and writes to the NestJS REST API.

---

## Entity: Order

**Source endpoints**: `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`

**List item shape** (from `OrderResponseDto`):
```ts
interface OrderListItem {
  id: string;            // UUID
  order_number: string;
  status: 'created' | 'assigned' | 'picked_up' | 'in_delivery' | 'completed' | 'cancelled';
  client: {
    id: string;
    phone: string;
    name: string | null;
  };
  courier: {             // null if unassigned
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  } | null;
  pickup_address: string;
  dropoff_address: string;
  delivery_fee: number;
  created_at: string;    // ISO-8601
  updated_at: string;
}
```

**Detail shape** (extends list item, from `OrderDetailResponseDto`):
```ts
interface OrderDetail extends OrderListItem {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  callback_url: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  assigned_at: string | null;
  picked_up_at: string | null;
  in_delivery_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  audit_entries: Array<{
    id: string;
    action: string;
    actor_id: string;
    actor_role: string;
    created_at: string;
  }>;
}
```

**Admin panel operations**:
- View list (table): `GET /orders?page=&limit=&status=`
- View detail (drawer): `GET /orders/:id`
- Cancel order (modal): `POST /orders/:id/cancel` with optional `{ reason: string }`
- Status is read-only except for cancel; lifecycle transitions are courier-driven

**Table columns**: Order #, Status, Client Phone, Courier Name, Pickup Address, Dropoff Address, Created At

---

## Entity: Courier

**Source endpoints** (new, to be added to backend):
- `GET /api/v1/couriers` — list with pagination
- `GET /api/v1/couriers/:id` — detail with current position
- `PATCH /api/v1/couriers/:id` — update editable fields

**Existing related endpoints**:
- `GET /couriers/active-shifts` — all open shifts
- `GET /couriers/:courierId/shifts` — shift history for one courier
- `GET /orders/:id/route` — route history per order

**List item shape**:
```ts
interface CourierListItem {
  id: string;                          // UUID
  first_name: string;
  last_name: string;
  phone: string;
  status: 'available' | 'unavailable';
  login: string | null;
  created_at: string;
  updated_at: string;
}
```

**Detail shape** (extends list item):
```ts
interface CourierDetail extends CourierListItem {
  telegram_chat_id: string | null;
  current_position: {                  // from courier_positions table (latest)
    lat: number;
    lng: number;
    recorded_at: string;
  } | null;
  current_shift: {                     // null if no open shift
    id: string;
    status: 'open' | 'closed';
    started_at: string;
    elapsed_minutes: number;
  } | null;
}
```

**Editable fields** (PATCH /api/v1/couriers/:id):
- `first_name`, `last_name`, `phone`, `status`
- `login` (can be changed)
- `telegram_chat_id`

**Read-only fields**: `id`, `owner_id`, `current_position`, `created_at`

**Table columns**: Name, Phone, Status, Login, Location (lat/lng), Created At

---

## Entity: User (Staff Account)

**Source endpoints** (new, to be added to backend):
- `GET /api/v1/users` — list staff users for tenant
- `POST /api/v1/users` — create staff user
- `PATCH /api/v1/users/:id` — edit staff user
- `DELETE /api/v1/users/:id` — delete staff user

**Note**: "Users" in the admin panel refers to staff accounts (owner, manager,
order_operator roles) — not couriers and not end customers (clients). These are
stored in a new `staff_users` table (migration 021) with columns: `id`, `owner_id`,
`name`, `email`, `role`, `password_hash`, `created_at`, `updated_at`. TypeORM entity:
`src/users/entities/staff-user.entity.ts`.

**List item shape**:
```ts
interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'order_operator';
  created_at: string;
}
```

**Create payload** (`POST /api/v1/users`):
```ts
interface CreateUserDto {
  name: string;
  email: string;
  role: 'manager' | 'order_operator';  // owner cannot create another owner
  password: string;
}
```

**Update payload** (`PATCH /api/v1/users/:id`):
```ts
interface UpdateUserDto {
  name?: string;
  role?: 'manager' | 'order_operator';
  // email is read-only after creation
}
```

**Table columns**: Name, Email, Role, Created At

---

## Entity: Route History

**Source endpoints**:
- `GET /api/v1/route-history` — paginated list of delivery routes (new)
- `GET /orders/:id/route` — existing per-order route (reused for detail)

**List item shape**:
```ts
interface RouteHistoryListItem {
  order_id: string;
  courier_id: string;
  courier_name: string;   // derived: first_name + last_name
  order_number: string;   // join from orders
  total_distance_meters: number;
  recorded_date: string;  // date of first point, ISO-8601
  point_count: number;
}
```

**Detail shape** (from `GET /orders/:id/route`):
```ts
interface RouteHistoryDetail {
  order_id: string;
  courier_id: string;
  total_distance_meters: number;
  points: Array<{
    id: string;
    lat: number;
    lng: number;
    distance_meters: number;
    recorded_at: string;
  }>;
}
```

**Filters available**: courier_id, order_id, date range (from/to)

**Table columns**: Courier Name, Order #, Date, Distance (m), Point Count

---

## Pagination Convention

All list endpoints follow the same pagination shape:
```ts
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
```

Refine's `@refinedev/simple-rest` maps to this via custom `dataProvider.getList` override
if the backend returns `{ data, meta }` instead of `{ data, total }`.

---

## State Transitions (Order)

```
created → assigned (courier claims)
assigned → picked_up (courier marks pickup)
picked_up → in_delivery (courier starts delivery)
in_delivery → completed (courier completes)

Any non-terminal state → cancelled (staff action, via POST /orders/:id/cancel)
completed → [terminal, no transitions]
cancelled → [terminal, no transitions]
```

Admin panel can only trigger `cancel`. All other transitions are courier-driven
via the mobile app. The detail drawer shows the full transition history via
`audit_entries`.
