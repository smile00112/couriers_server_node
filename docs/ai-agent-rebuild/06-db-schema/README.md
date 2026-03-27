# Database Schema (From Migrations)

## Engine Assumptions

- Primary DB: MySQL (`DB_CONNECTION=mysql` in `.env.example`)
- ORM: Laravel Eloquent
- Migrations are source of truth for rebuild

## Core Auth/Platform Tables

### `users`
- `id` bigint PK
- `name` string
- `email` unique string
- `email_verified_at` timestamp nullable
- `password` string
- `remember_token` string nullable
- `two_factor_secret` text nullable
- `two_factor_recovery_codes` text nullable
- `location` text nullable (later migration)
- `phone` text nullable (later migration)
- `avatar` text nullable (later migration)
- timestamps

### `personal_access_tokens`
- Sanctum polymorphic token table:
  - `tokenable_type`, `tokenable_id`
  - `name`, `token(64 unique)`, `abilities`, `last_used_at`
  - timestamps

### `failed_jobs`, `jobs`
- queue/failure infrastructure tables used by queue driver options

## Tenant and Identity

### `companies`
- `id` PK
- `parent_id` unsigned int default `0`
- `name`, `email(unique)`, `phone`, `password`
- `remember_token`
- `fcm_token` nullable
- `status` tinyint default `1`
- timestamps + soft deletes

### `operators`
- `id`, `name`, `email(unique)`, `password`, `remember_token`, `fcm_token`
- timestamps
- `company_id` foreign id (added later)

### `couriers`
- `id` big increments
- profile: `last_name`, `otchestvo`, `first_name`, `birthday`, `phone`
- runtime: `coordinates`, `score`, `rating`, `status`, `avatar`, `transport`, `fcm_token`
- references:
  - `user_id` nullable fk -> `users.id` (`set null`)
  - `current_order` nullable fk -> `orders.id` (`set null`)
  - `company_id` fk (added later)
- soft deletes + timestamps

## Order Domain

### `clients`
- `id`, `name`, `phone`, timestamps
- `company_id` fk (added later)

### `orders`
- `id` PK
- identity: `number`
- address/location:
  - `address_from`, `address_to`, `coordinates_from`, `coordinates_to`
- source integration: `source_url`
- business fields:
  - `price` unsigned int
  - `status` unsigned int
  - `payment_type` text nullable (added)
  - `award` float default 0 (added)
  - `distance` int default 0 (added)
  - `takeoff_point_name` string nullable (added)
- time fields:
  - `order_created_at`, `order_delivery_start_at`, `order_close_time`, `order_close_at`
- references:
  - `courier_id` nullable fk -> `couriers.id` (`set null`)
  - `client_id` nullable fk -> `clients.id` (`set null`)
  - `company_id` fk (added later)
- timestamps + soft deletes

### `order_products`
- `id`
- `name`
- `price` int nullable default 0
- `cost_price` int nullable default 0 (added)
- `quantity` unsigned int nullable default 0
- `external_id` unsigned int nullable default 0
- `order_id` foreign id
- timestamps

## Tracking and Operational Logs

### `courier_way_histories`
- `id`
- `coordinates` text nullable
- `distance` int nullable
- `transport_id` string nullable
- `order_id` nullable foreign id
- `courier_id` nullable foreign id
- timestamps

### `courier_working_shifts`
- `id`
- `type` string default `open`
- `courier_id` nullable foreign id
- timestamps

### `action_history`
- `id`
- `type`, `code`, `text`
- `order_id` foreign id
- `courier_id` foreign id
- timestamps

### `delivery_history`
- `id` + soft deletes
- `delivery_start_at`, `delivery_finish_at`
- `price`, `score`
- added fields:
  - `client_id`
  - `award`
  - `payment_type`
  - `time_planned`
  - `time_spent`
  - `point`
  - `number`
  - `distance` (added by migration)
  - `company_id` fk (added later)
- references:
  - `order_id`
  - `courier_id`
- timestamps

## Auth By Code

### `auth_sms`
- `id`
- `courier_id` nullable fk
- `ip` ipAddress
- `phone`, `code`
- `expires_at` timestamp
- `company_id` fk (added later)
- timestamps

## Payout and Payment Tables

### `courier_payments`
- `id`
- `award` float nullable
- `distance` int nullable default 0 (added)
- `order_id` nullable fk
- `courier_id` nullable fk
- `courier_payout_id` nullable fk -> `courier_payouts.id` (`set null`)
- `company_id` fk (added later)
- timestamps + soft deletes

### `courier_payouts`
- `id`
- `courier_id` nullable fk (`set null`)
- `sum` float nullable
- `approve` int default 0
- timestamps

## Reference Tables

### `transports`
- `id`, `code`, `name`, timestamps
- `company_id` fk (added later)

## Rebuild Constraints

- Preserve nullable behavior for optional references.
- Preserve `softDeletes` exactly where present.
- Keep foreign key `onDelete` semantics as in migrations.
- Run migrations in repository order; do not collapse without validating dependency timing.
