<!--
SYNC IMPACT REPORT
==================
Version change: 1.3.0 → 1.4.0 (MINOR: new Principle VIII — Admin Panel UX;
  Technology Stack Constraints expanded with frontend stack)

Modified principles:
  - None

Added sections:
  - Core Principles: VIII. Admin Panel — Single-Page UX (NON-NEGOTIABLE)
  - Technology Stack Constraints: Frontend subsection (React, TypeScript, Ant Design, React Query)

Removed sections:
  - None

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ Compatible as-is
  - .specify/templates/spec-template.md ✅ Compatible as-is — admin panel specs MUST include
    drawer/modal breakdown per entity
  - .specify/templates/tasks-template.md ✅ Compatible as-is

Follow-up TODOs:
  - All existing and future data models must be reviewed for owner_id presence
  - Admin panel entity list (Orders, Couriers, Users, Route History) to be expanded
    as new entities are added to the domain model
-->

# AI-First Couriers Backend Constitution

## Core Principles

### I. Order Lifecycle Integrity (NON-NEGOTIABLE)

The `Order` is the central domain entity. All business logic MUST flow through
explicit, validated state transitions (created → assigned → picked_up → in_delivery
→ completed | cancelled). No code MAY modify order status outside the designated
order-lifecycle service. Every transition MUST be persisted atomically and MUST
emit a corresponding real-time event.

**Rationale**: The courier app is built around order state. Silent or partial
transitions cause data inconsistencies visible to couriers, operators, and the
external order source simultaneously.

### II. Real-Time as a First-Class Concern

Every entity state change that affects a courier or operator MUST be broadcast
via Socket.IO in addition to being persisted. WebSocket events MUST follow a
consistent schema (entity type, event name, payload). Redis MUST be used as the
Socket.IO adapter to support horizontal scaling. Real-time delivery MUST NOT be
a fire-and-forget afterthought added after REST endpoints.

**Rationale**: Mobile couriers rely on push and socket events to act; a REST-only
approach creates polling lag and missed assignments.

### III. API Contract Stability

All REST endpoints consumed by mobile or desktop clients MUST be versioned
(e.g., `/api/v1/...`). Breaking changes (field removal, type change, endpoint
removal) MUST be introduced under a new version with a documented migration note.
Non-breaking additions (new optional fields, new endpoints) MAY be added to an
existing version. Swagger/OpenAPI documentation MUST be kept in sync with every
endpoint change.

**Rationale**: Mobile apps are released on store schedules; breaking the contract
without versioning forces emergency releases and user-facing failures.

### IV. Role-Based Authorization Everywhere

Every controller endpoint MUST declare an explicit role guard. The five system
roles MUST be enforced at the NestJS guard layer, not inside service logic.
Authentication channels (SMS code, Telegram, login/password) MUST all produce
a standard JWT with identical role and identity claims. No endpoint MAY rely
solely on authentication without also checking authorization.

**Role definitions** (authoritative — all guards and access checks MUST reference these):

| Role | Scope | Key Capabilities |
|------|-------|-----------------|
| **Administrator** | Platform-wide | Full access across all tenants; platform configuration; tenant management |
| **Owner** | Own tenant | Full access within their tenant; user management; analytics; billing |
| **Manager** | Own tenant | Order management; courier management; reports; cannot manage users or billing |
| **Order Operator** | Own tenant | Create and manage orders; assign couriers; update order status |
| **Courier** | Own tenant | View and act on assigned orders; manage own shift; view own wallet |

A role MUST NOT grant capabilities beyond its defined scope. Privilege escalation
(e.g., a Courier accessing order management endpoints) MUST be rejected at the
guard layer with `403 Forbidden`.

**Rationale**: Multiple actor types share a single API surface; missing or
misapplied guards create privilege escalation and cross-tenant data risks.

### V. Background Jobs MUST Be Idempotent

All tasks processed via BullMQ MUST be designed for at-least-once delivery.
Every job handler MUST be idempotent: running it twice with the same input MUST
produce no additional side-effects after the first successful run. FCM push
notifications MUST degrade gracefully (log and continue) if the FCM call fails;
push failure MUST NOT block the primary business operation. Failed jobs MUST be
moved to a dead-letter queue and alerted on.

**Rationale**: Redis queues do not guarantee exactly-once; non-idempotent handlers
cause duplicate wallet credits, double notifications, or repeated external API
calls.

### VI. Multi-Tenant Isolation (NON-NEGOTIABLE)

This is a SaaS application. Every `Owner` is a fully independent tenant. ALL
domain entities — users, couriers, orders, shifts, wallet transactions, and
reports — MUST be scoped to an `owner_id`. Every database query that retrieves
or mutates tenant data MUST include an `owner_id` filter. No API endpoint MAY
return or modify data belonging to a different tenant, regardless of the
requesting user's role. Tenant isolation MUST be enforced at the service layer,
not solely at the controller layer.

Cross-tenant data access (e.g., global analytics for platform administrators)
MUST be handled through explicitly designated platform-admin endpoints, clearly
separated from tenant-scoped endpoints.

**Rationale**: SaaS multi-tenancy is a security and correctness boundary.
A missing `owner_id` filter is a data-leak vulnerability that exposes one
business's operational data to another.

### VIII. Admin Panel — Single-Page UX (NON-NEGOTIABLE)

The operator/admin web interface MUST be implemented as a single-page application where
ALL create, edit, view-detail, and delete actions are performed without navigating to a
separate page. The maximum navigation depth is one level (sidebar item → full-page table).

**Interaction rules:**

- **Drawers** (sliding panel from the right) MUST be used for: editing records, viewing
  record details, and displaying nested/related data.
  - Simple forms: 480px width.
  - Complex or nested forms: 720px width.
  - Save and Cancel buttons MUST be pinned to the drawer bottom.
  - Unsaved changes MUST trigger a confirmation dialog before the drawer closes.
- **Modals** MUST be used for: delete confirmation, quick status changes, and short
  forms with 1–3 fields. Maximum modal width: 480px. A Cancel button MUST always
  be present.
- Table rows MUST be clickable and open a right-side drawer with full record details.
- Bulk actions via checkboxes MUST trigger a modal confirmation before execution.
- Filters and search MUST be inline on the page — never a separate route.
- Success and error feedback MUST use toast notifications, not page redirects.
- Loading states MUST use skeleton rows, not spinners.
- Row action icons (edit, delete) MUST be visible only on row hover.
- On screens narrower than 768px, drawers MUST render as bottom sheets.

**Entities managed via the admin panel** (current baseline):
Orders, Couriers, Users, Route History. New domain entities MUST be added to the
admin panel following the same drawer/modal pattern.

**Rationale**: A consistent single-page interaction model eliminates navigation
context loss, reduces cognitive load for operators managing high order volumes,
and keeps all data visible without full-page reloads.

### VII. Simplicity — No Speculative Complexity

New abstractions MUST be justified by a concrete, present need — not anticipated
future requirements. The YAGNI principle applies: do not build configuration
systems, plugin points, or generic frameworks for single-use cases. Complexity
introduced in violation of this principle MUST be documented in the plan's
Complexity Tracking table with explicit justification.

**Rationale**: This is a focused domain service. Premature abstractions increase
onboarding time and maintenance surface without delivering value.

## Technology Stack Constraints

The following technology choices are fixed for this project and MUST NOT be
replaced without a constitution amendment.

### Backend

- **Runtime**: Node.js with NestJS framework
- **Primary database**: PostgreSQL (relational data, migrations required)
- **Cache / real-time layer**: Redis (Socket.IO adapter, BullMQ queue backend)
- **Auth tokens**: JWT (issued after SMS / Telegram / password verification)
- **Real-time transport**: Socket.IO (WebSocket with Redis adapter)
- **Background queues**: BullMQ backed by Redis
- **Push notifications**: Firebase Cloud Messaging (FCM)
- **API documentation**: Swagger / OpenAPI (auto-generated via NestJS decorators)
- **Containerization**: Docker (all services containerized)
- **CI/CD**: GitHub Actions

External integrations (order ingestion from external systems) MUST be consumed
via REST API with clear error handling and retry logic via BullMQ.

### Admin Panel Frontend

- **Framework**: React with TypeScript
- **UI component library**: Ant Design (Table, Drawer, Modal, Form, Button)
- **Data fetching**: React Query (server state management, caching, background refetch)
- **API target**: NestJS REST API backend (`/api/v1/...`)

The admin panel frontend MUST NOT introduce an alternative component library or
state management solution (e.g., MUI, Zustand, Redux) without a constitution amendment.

## Development Workflow

- **Feature specs** MUST be written and reviewed before implementation begins.
- **Database changes** MUST be expressed as versioned migrations; direct schema
  mutation in production is prohibited.
- **Every new endpoint** MUST have a corresponding Swagger decorator and MUST
  be covered by at least one integration or contract test.
- **Courier wallet operations** (credits, debits, payouts) MUST be wrapped in
  database transactions to prevent race conditions.
- **Shift management** logic (open/close shift) MUST gate any order-taking
  capability; a courier without an open shift MUST NOT be assignable to orders.
- **Feature branches**: Every new feature or non-trivial change MUST be developed
  in a dedicated branch named after the feature (e.g., `feature/order-lifecycle`).
  Direct commits to `main` are prohibited.
- **All PRs** MUST pass CI (lint, build, test) before merge; direct pushes to
  `main` are prohibited.

## Governance

This constitution supersedes all other development practices and guidelines for
this project. Amendments require:

1. A written proposal describing the change and motivation.
2. Update of `CONSTITUTION_VERSION` per semantic versioning rules.
3. Update of `LAST_AMENDED_DATE` to the amendment date.
4. A migration or refactor plan for any code that violates the new/changed rule.

All PRs MUST include a Constitution Check confirming no principle is violated.
Complexity violations MUST be documented in the plan's Complexity Tracking table.
The Swagger documentation serves as the authoritative runtime API contract.

**Version**: 1.4.0 | **Ratified**: 2026-03-28 | **Last Amended**: 2026-03-28
