---
name: Project Overview
description: Core facts about the AI-first couriers backend project — tech stack, features, domain
type: project
---

NestJS backend service for courier delivery management. Rebuilt from Laravel to Node.js.

**Why:** AI-first rebuild on modern stack with Docker/Kubernetes infrastructure.

**How to apply:** Frame all suggestions in terms of NestJS patterns, PostgreSQL, Redis, BullMQ, Socket.IO, FCM.

**Multi-tenant SaaS**: each Owner is an isolated tenant; all domain data (users, couriers, orders, wallets, shifts) is scoped to `owner_id`. Cross-tenant data access is prohibited except via explicit platform-admin endpoints.

Key domains: order lifecycle, courier geolocation + real-time tracking, courier wallet (earnings + payouts), courier shifts, role-based auth (Admin/Owner/Manager/Operator/Courier).

Auth channels: SMS code, Telegram, login/password — all produce JWT.

Constitution ratified 2026-03-28 at `.specify/memory/constitution.md` (v1.0.0). Six core principles: Order Lifecycle Integrity, Real-Time First, API Contract Stability, Role-Based Authorization, Idempotent Background Jobs, Simplicity/YAGNI.
