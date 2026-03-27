# Infrastructure Specification (Docker + Kubernetes)

## Mandatory Environment Variables

## Application
- `APP_NAME`
- `APP_ENV`
- `APP_KEY`
- `APP_DEBUG`
- `APP_URL`
- `LOG_CHANNEL`
- `LOG_LEVEL`

## Database
- `DB_CONNECTION`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`

## Queue/Cache/Session
- `QUEUE_CONNECTION`
- `CACHE_DRIVER`
- `SESSION_DRIVER`
- `SESSION_LIFETIME`
- `REDIS_HOST`
- `REDIS_PASSWORD`
- `REDIS_PORT`

## Broadcast/Realtime
- `BROADCAST_DRIVER`
- `PUSHER_APP_ID`
- `PUSHER_APP_KEY`
- `PUSHER_APP_SECRET`
- `PUSHER_APP_CLUSTER`
- `MIX_PUSHER_APP_KEY`
- `MIX_PUSHER_APP_CLUSTER`

## FCM
- `FCM_API_KEY`
- `FCM_AUTH_DOMAIN`
- `FCM_PROJECT_ID`
- `FCM_STORAGE_BUCKET`
- `FCM_MESSAGIN_SENDER_ID`
- `FCM_APP_ID`
- `FCM_JSON`
- `FCM_API_SERVER_KEY`

## Mail and Other
- `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`
- `SENTRY_LARAVEL_DSN`, `SENTRY_TRACES_SAMPLE_RATE`

## Containerization Requirements

## Docker Images

1. `app-image` (PHP-FPM + Composer deps + built code)
2. `web-image` (Nginx config + static/public serving)
3. Optionally unified image if operationally preferred

## Build Strategy

- Use CI pipeline to build immutable images.
- Node build stage compiles frontend assets.
- Composer dependencies installed with production flags.
- Cache clear/optimize commands executed during image build or release job.

## Kubernetes Workloads

## Deployments
- `api` deployment (Laravel runtime)
- `web` deployment (Nginx)
- `worker` deployment (`php artisan queue:work`)

## Services
- Cluster service for api/web depending ingress architecture.

## Ingress
- TLS-enabled ingress route to web frontend.
- Keep `/api` routed to Laravel stack.

## Jobs
- `migrate-seed` job:
  - `php artisan migrate --force`
  - selected seeder execution (`php artisan db:seed --class=...`) if required
- run once per release, not on every pod startup

## Optional Cron
- Scheduler workload for `php artisan schedule:run` every minute if schedule is used.

## Volumes and Persistence

- Required writable paths:
  - `storage/`
  - `bootstrap/cache`
- If local uploads are used (`storage/app/public/avatar`):
  - mount PVC or migrate to object storage

## ConfigMap/Secret Split

## ConfigMap (non-sensitive)
- `APP_ENV`, `APP_DEBUG`, `APP_URL`
- queue/cache/session non-secret values
- feature flags and safe defaults

## Secret (sensitive)
- `APP_KEY`
- DB password and credentials
- Pusher secret
- FCM JSON/server key
- SMS/WhatsApp provider credentials

## Operational Probes and Resources

- Liveness and readiness probes for API and web deployments
- Separate CPU/memory requests/limits:
  - API: medium memory, moderate CPU
  - Worker: CPU/memory tuned for queue throughput

## Rollout Strategy

1. Deploy Secrets/ConfigMaps
2. Deploy DB (or verify managed DB availability)
3. Run `migrate-seed` job
4. Deploy API/Web/Worker
5. Run smoke tests for:
   - token issuance
   - order list endpoint
   - courier code auth path
   - realtime and push test endpoints

## Rebuild Acceptance Criteria

- All required env vars mapped and non-empty where mandatory
- Migrations complete successfully in cluster
- API pods serve authenticated traffic
- Queue worker processes jobs
- Broadcast and FCM notifications function in deployed environment
- No runtime writes fail due to missing writable volumes
