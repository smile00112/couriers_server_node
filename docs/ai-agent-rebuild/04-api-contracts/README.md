# API Contracts

## Conventions

- Auth: `Bearer` Sanctum token for protected routes
- Base prefix: `/api`
- Error envelope pattern (frequently used):
  - `{ "error": { "code": number, "message": string } }`
- Pagination pattern (DTO collections):
  - `{ "data": [...], "meta": { "current_page": n, "total": n, "path": "...", "page_param": "page" } }`

## Authentication

### Courier code auth (V2)

- `POST /auth/courier/send_code`
  - input: `phone`
  - behavior: validates phone, checks courier existence, sends code via `AuthSms::sendCode`
- `POST /auth/courier/check_code`
  - input: `phone`, `code`
  - output: `{ "token": "<sanctum_token>" }`

### Email/password auth (V1)

- `POST /token`, `/auth/token`, `/auth/signInWithPassword`
  - input: `email`, `password`
  - output: token payload with `accessToken`, `refreshToken`
- `POST /auth/courier/token`
  - same base auth, additionally checks user is courier
- `POST /auth/refresh_token`
  - currently returns provided token (legacy behavior)

## Courier App API (V2, authenticated)

Prefix group: `/courier`

- `GET /courier`
  - output: `CourierData`
- `POST /courier`
  - updates courier profile fields (`transport`, names, optional avatar, optional coordinates)
- `GET /courier/orders`
  - output: paginated current courier orders (`status in [2,3]`)
- `GET /courier/completed_orders`
  - output: paginated completed orders (`status = 4`)
- `GET /courier/settings`
  - output: settings payload (`SettingsData` + statuses + transports + channel)
- `POST /courier/work_shift`
  - creates open shift and sets courier online
- `DELETE /courier/work_shift`
  - creates close shift and sets courier offline
- `GET /courier/work_shift`
  - checks if today shift is open
- `POST /courier/coordinates`
  - updates coordinates and tracking history

Payout-related:
- `GET /courier/payments`
- `GET /courier/payout`
- `POST /courier/payout`
- `GET /courier/payout/{id}`
- `GET /courier/payout/{id}/approve`

Push token/testing:
- `POST /courier/token/fcm`
- `GET /courier/token/fcm_test`

## Orders API (V2, authenticated)

- `GET /orders`
  - open orders feed (`status = onstock`)
- `GET /orders/{id}`
  - single order details
- `POST /orders/{id}/update`
  - generic status update path

Shortcut transitions:
- `GET /orders/{id}/take`
- `GET /orders/{id}/pick_up`
- `GET /orders/{id}/delivery`
- `GET /orders/{id}/complete`

External ingestion:
- `POST /orders/add` (requires Sanctum ability `create-outer-order`)

## Operator API (V1, authenticated where configured)

Prefix: `/operator`

- Order management:
  - `GET /operator/orders`
  - `POST /operator/orders/add`
  - `GET /operator/orders/{id}`
  - `POST /operator/orders/{id}`
  - `DELETE /operator/orders/{id}`
  - status transition and assignment routes
- Courier management:
  - `GET /operator/couriers`
  - `GET /operator/couriers/{id}`
  - `POST /operator/couriers/add`
  - `DELETE /operator/couriers/delete/{id}`
  - `POST /operator/couriers/{id}/new_coordinates`
  - `POST /operator/couriers/edit/{id}`

## Config and Push Utility Endpoints

- `GET /config`
  - returns delivery and app feature toggles from settings
- `POST /token/fcm` (authenticated)
  - stores current user FCM token
- `GET /token/fcm_test` (authenticated)
  - sends test push notification

## Request Validation Highlights

- `CourierUpdateRequest`
  - `transport`, `first_name`, `last_name`, `otchestvo`, `avatar`, optional `coordinates[]`
- `UpdateCourierCoordinatesRequest`
  - required `coordinates`
- `OrderStoreRequest`
  - required: `address_from`, `address_to`, `coordinates_from`, `coordinates_to`, `number`
- `OrderChangeStatusRequest`
  - required `status`, optional `transport`

## Response DTO/Resource Mapping

- `CourierData` for courier profile API
- `OrderData` and `OrderDataCollection` for V2 order lists
- `PaymentData`, `PayoutData` for payout/payment routes
- `OrdersResource`/`CouriersResource` for V1-style responses
- `OrderPusherResource`/`CourierPusherResource` for event payloads
