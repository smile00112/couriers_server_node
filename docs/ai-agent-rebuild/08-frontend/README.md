# Frontend Structure and Build

## Tech Stack

- Vue 3 (`vue`, `vue-router`)
- Laravel Mix (`webpack.mix.js`, `laravel-mix`)
- Axios and realtime client deps:
  - `axios`
  - `laravel-echo`
  - `pusher-js`

## Source Layout

- Generic app entry:
  - `resources/js/app.js`
  - `resources/js/App.vue`
- Courier app module:
  - `resources/js/courier/app.js`
  - `resources/js/courier/App.vue`
  - `resources/js/courier/Pages/*`
  - `resources/js/courier/router/index.js`
- Operator app module:
  - `resources/js/operator/app.js`
  - `resources/js/operator/App.vue`
  - `resources/js/operator/Pages/*`
  - `resources/js/operator/router/index.js`

## Build Pipeline

Configured in `webpack.mix.js`:
- JS compile: `resources/js/app.js -> public/js/app.js`
- Vendor script bundle -> `public/js/all.js`
- CSS compile: `resources/css/app.css -> public/css/app.css`
- Vendor style bundle -> `public/css/all.css`
- Vue SFC processing enabled via `.vue()`

NPM scripts (`package.json`):
- `npm run dev`
- `npm run watch`
- `npm run prod`

## Runtime Serving Model

- Final assets are served from `public/`.
- Nginx must serve static files from `public/js` and `public/css`.
- PHP routes (including API and web views) should pass via Laravel app.

## Rebuild Guidance For Docker

- Use multi-stage build:
  1. Node stage: install deps, run `npm run prod`
  2. PHP stage: composer install + application code
  3. Runtime stage: copy built assets into final image (`public/js`, `public/css`)
- Ensure exact compatibility with Laravel Mix output paths.

## Rebuild Guidance For Kubernetes

- Do not build frontend assets at pod startup.
- Build in CI and bake into image.
- Deploy immutable image tags for deterministic assets.

## Frontend Runtime Config Dependencies

From env/template:
- `MIX_PUSHER_APP_KEY`
- `MIX_PUSHER_APP_CLUSTER`

These must be injected at build time if frontend directly references Mix env variables.

## Compatibility Notes

- Repo contains large static/vendor trees under `public/`; avoid rebundling vendor assets from unrelated directories.
- Existing structure mixes legacy UI assets and Vue app assets; preserve output file names expected by server-side templates.
