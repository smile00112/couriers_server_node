# Codebase Map

## Repository Core

- `app/` - backend application code
- `routes/` - route declarations (`api.php` is primary API entrypoint)
- `database/` - migrations, factories, seeders
- `resources/` - Vue source code and frontend assets
- `public/` - compiled assets and publicly served files
- `config/` - framework/runtime configuration

## API Layers

- Legacy and mixed compatibility:
  - `app/Http/Controllers/API/V1`
- Main courier app API:
  - `app/Http/Controllers/API/V2/courierApp`

Key controllers:
- `CourierController` (auth by code, profile, coordinates, work shifts)
- `OrderController` (order list, status transitions, creation, external callbacks)
- `PayoutController` (payments and payout requests)
- `WebNotificationController` (FCM token management)

## Request Validation Contracts

`app/Http/Requests`:
- `OrderStoreRequest`
- `OrderUpdateRequest`
- `OrderChangeStatusRequest`
- `CourierUpdateRequest`
- `UpdateCourierCoordinatesRequest`
- `CourierStoreRequest`

## Domain Model Layer

`app/Models` major entities:
- Core: `Order`, `Courier`, `Client`, `User`, `Company`, `Operator`
- Auth: `AuthSms`
- Tracking/history: `CourierWayHistory`, `DeliveryHistory`, `ActionHistory`, `CourierWorkingShift`
- Financials: `CourierPayments`, `CourierPayout`
- Catalog inside order: `OrderProducts`
- Support: `Transport`, `BaseModel`, scopes in `app/Models/Scopes`

## Services Layer

`app/Services`:
- `TokenService` - Sanctum token issuing
- `NotificationService` - push orchestration to couriers/operators
- `LocationService` - distance/geolocation helper usage
- `PayoutApproveService` - payout approval behavior
- `Authorize/*` - SMS/WhatsApp code sending channels

Traits:
- `app/Services/Traits/HasOwnerCompany.php`
- `app/Services/Traits/NotificationTrait.php`
- `app/Services/Traits/LocationTrait.php`

## API Serialization Contracts

Two serialization styles coexist:

1. API Resources (`app/Http/Resources`)
- `OrdersResource`, `CouriersResource`
- `OrderPusherResource`, `CourierPusherResource`

2. DTO/Data Transfer Objects (`app/Data`)
- `OrderData`, `OrderDataCollection`
- `CourierData`
- `PaymentData`, `PayoutData`, `*Collection`
- `SettingsData`, `OrderStatusData`

## Event and Broadcast Layer

`app/Events` includes:
- Order channel events: `NewOrderEvent`, `UpdateOrderEvent`, `DeleteOrderEvent`
- Courier channel events: `NewCourierEvent`, `UpdateCourierEvent`, `DeleteCourierEvent`
- Courier-personal channel events: `newOrdersForCourier`, `UpdateCourierOrder`, `UpdateCourierOrders`
- Auxiliary: `NewOrderSend`

Broadcast channels observed in code:
- `operator_orders`
- `operator_couriers`
- `courier_{id}`
- `chatbox`

## Frontend Source

Vue code in `resources/js`:
- generic app
- `courier` app
- `operator` app

Build and bundle:
- `webpack.mix.js`
- `package.json` scripts (`mix`, `mix --production`)

## Cross-Cutting Notes

- Multi-tenant intent exists via `company_id` and base scopes, but scope enforcement is partially disabled/commented in `FilterByCompanyScope`.
- Business behavior is spread between V1 and V2 controllers; V2 must be treated as primary mobile courier API.
