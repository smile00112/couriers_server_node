# couriers_backend Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-30

## Active Technologies
- Node.js 20 LTS, TypeScript 5.x + NestJS 10, TypeORM 0.3, class-validator/class-transformer, @nestjs/swagger (008-payout-reconciliation)
- PostgreSQL (2 new tables: `payout_periods`, `payouts`; reads `courier_earnings`) (008-payout-reconciliation)
- TypeScript 5.x (React 18 frontend) + Node.js 20 LTS (NestJS backend additions) (009-admin-panel-refine)
- N/A (frontend reads from NestJS REST API; backend additions use existing PostgreSQL) (009-admin-panel-refine)

- Node.js 20 LTS, TypeScript 5.x + NestJS 10, TypeORM 0.3, @nestjs/jwt, @nestjs/passport, passport-jwt, bcrypt, @nestjs/throttler (Redis store), BullMQ, class-validator/class-transformer (001-courier-auth)
- Socket.IO (Redis adapter), Firebase Admin SDK (FCM) (002-order-ingestion)
- OrderLifecycleService, DeliveryRecord, CourierEarning entities; BullMQ queues: order-callback, courier-cancel-notify (003-order-lifecycle)
- CourierTrackingService, CourierPosition, CourierLocationHistory entities; BullMQ queue: location-callback; Haversine distance calculation (004-courier-tracking)
- ShiftManagementService, CourierShift entity; shift gate in OrderLifecycleService.claim(); partial unique index one-open-shift-per-courier (007-work-shift-management)

## Project Structure

```text
src/                  # NestJS backend (single project)
database/migrations/  # TypeORM versioned migrations
database/seeds/       # Test seed scripts
specs/                # Feature specifications and plans
```

## Commands

npm test; npm run lint

## Code Style

Node.js 20 LTS, TypeScript 5.x: Follow standard conventions

## Recent Changes
- 009-admin-panel-refine: Added TypeScript 5.x (React 18 frontend) + Node.js 20 LTS (NestJS backend additions)
- 008-payout-reconciliation: Added Node.js 20 LTS, TypeScript 5.x + NestJS 10, TypeORM 0.3, class-validator/class-transformer, @nestjs/swagger

- 001-courier-auth: Added Node.js 20 LTS, TypeScript 5.x + NestJS 10, TypeORM 0.3, @nestjs/jwt, @nestjs/passport, passport-jwt, bcrypt, @nestjs/throttler (Redis store), BullMQ, class-validator/class-transformer
