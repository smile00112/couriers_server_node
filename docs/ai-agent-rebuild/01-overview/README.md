# Courier App Rebuild Spec (AI Agent)

## Objective

This specification describes how an AI agent should recreate the `courier-app` project on a new platform based on Docker and Kubernetes.

The rebuilt platform must preserve:
- Business behavior (courier workflow, order lifecycle, payouts)
- API contracts (auth, courier app, operator app, external order ingestion)
- Data model and relations
- Real-time events and push notifications

## Scope

- Backend: Laravel 9 (`PHP 8.x`), Sanctum tokens, events/broadcasting
- Frontend: Vue 3 + Laravel Mix assets
- Data: MySQL schema, migrations, seeders, queue tables
- Integrations: Pusher, FCM, SMS/WhatsApp auth channels, external order source callbacks
- Runtime: Containerized services and Kubernetes workloads

## Main Source Files

- Routes and API entrypoint: `routes/api.php`
- Courier app V2 controllers:
  - `app/Http/Controllers/API/V2/courierApp/CourierController.php`
  - `app/Http/Controllers/API/V2/courierApp/OrderController.php`
  - `app/Http/Controllers/API/V2/courierApp/PayoutController.php`
- Auth and delivery channels:
  - `app/Models/AuthSms.php`
  - `app/Services/Authorize/AuthService.php`
  - `app/Services/Authorize/RedSmsService.php`
  - `app/Services/Authorize/WhatsappService.php`
- Tokens and notifications:
  - `app/Services/TokenService.php`
  - `app/Services/NotificationService.php`
  - `app/Services/Traits/NotificationTrait.php`
- Domain models and DTOs:
  - `app/Models/*.php`
  - `app/Data/*.php`
  - `app/Http/Resources/*.php`
- Database schema:
  - `database/migrations/*.php`
- Infra-relevant config:
  - `.env.example`
  - `config/broadcasting.php`
  - `config/queue.php`
  - `config/sanctum.php`
  - `package.json`
  - `webpack.mix.js`

## Target Deliverables (Produced By Agent)

The agent must produce:
- Docker build/runtime assets for app and web serving
- Kubernetes manifests (or Helm chart) for all required workloads
- Environment variable contract (ConfigMap/Secret split)
- DB migration and seed execution strategy
- Equivalent API behavior and response contracts
- Equivalent event and push delivery behavior

## Non-Goals

- Exposing existing secrets from runtime `.env`
- Rewriting business logic semantics
- Changing public API behavior without explicit migration note

## Build Validation Checklist

- API health endpoint and authenticated endpoints work in cluster
- Sanctum token issuing/validation works
- Courier login via code (`send_code` / `check_code`) works
- Order lifecycle transitions (`take`, `pickup`, `delivery`, `complete`) work
- Payout creation/approval flow works
- Broadcast events are delivered to expected channels
- FCM token storage and test push endpoint work
- Migrations and seeders run idempotently in K8s
