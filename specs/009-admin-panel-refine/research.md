# Research: Admin Panel (Refine.dev)

**Branch**: `009-admin-panel-refine` | **Date**: 2026-03-30

---

## Decision 1 — UI Framework: Refine.dev vs Custom Vite SPA

**Decision**: Use Refine.dev with `@refinedev/antd` integration package.

**Rationale**: Refine.dev provides pre-built `useDrawerForm` and `useModalForm` hooks
that map directly to the constitution's Drawer/Modal UX requirement. The `@refinedev/antd`
package wraps Ant Design Table, Drawer, Form, Modal, and Button exactly as required —
no additional wiring. TanStack Query v5 is Refine's own data layer (not an add-on),
satisfying the constitution's React Query requirement without conflict. For 4 entities
with identical CRUD patterns, Refine eliminates ~40% of boilerplate.

**Alternatives considered**:
- Custom Vite SPA: Full control, zero lock-in, but requires manually wiring all
  React Query hooks, drawer open/close state, and optimistic updates per entity.
  Estimated ~40% more code for equivalent result.
- AdminJS: Rejected — uses Bootstrap, not Ant Design. Violates constitution
  technology constraint (NON-NEGOTIABLE).

---

## Decision 2 — Data Provider: @refinedev/simple-rest vs Custom

**Decision**: Use `@refinedev/simple-rest` as the base, extended with a custom
`httpClient` (axios instance) that injects `Authorization: Bearer <token>` on every
request.

**Rationale**: The NestJS backend follows REST conventions compatible with simple-rest
(paginated GET with `page`/`limit` query params, UUID-keyed resources). Custom axios
instance allows global 401 interception (redirect to login) without overriding the
entire data provider.

**Pattern**:
```ts
const axiosInstance = axios.create({ baseURL: import.meta.env.VITE_API_URL });
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
const dataProvider = simpleRestProvider(import.meta.env.VITE_API_URL, axiosInstance);
```

---

## Decision 3 — Auth Storage: localStorage vs Memory vs HttpOnly Cookie

**Decision**: Store JWT access token in `localStorage` under key `access_token`.

**Rationale**: The backend issues JWT tokens (not session cookies). The admin panel
is a first-party web app accessed by staff on trusted machines. HttpOnly cookie would
require backend changes (CORS + cookie config) out of scope for this feature. Memory
storage loses auth on tab refresh. localStorage is the standard Refine.dev auth pattern.

**Risk**: XSS can read localStorage tokens. Mitigation: CSP headers on deployment.
This risk is accepted per the spec's assumption about modern browser targets.

---

## Decision 4 — Routing: @refinedev/react-router

**Decision**: Use `@refinedev/react-router` with React Router v6.

**Rationale**: Refine's router binding wraps React Router v6, providing `<Authenticated>`,
`<NavigateToResource>`, and resource-based route generation out of the box. This eliminates
manual route guard wiring. Deep linking to a specific section (e.g., `/orders`) works
automatically.

---

## Decision 5 — Backend Endpoint Gaps

**Decision**: Add 4 new NestJS controllers as part of this feature alongside the frontend.

**Gap analysis** (endpoints required by admin panel, not yet in backend):

| Admin Panel Need | Gap | New Endpoint |
|-----------------|-----|--------------|
| List all couriers | Missing | `GET /api/v1/couriers` |
| Get courier detail | Missing | `GET /api/v1/couriers/:id` |
| Edit courier profile | Missing | `PATCH /api/v1/couriers/:id` |
| List staff users | Missing | `GET /api/v1/users` |
| Create staff user | Missing | `POST /api/v1/users` |
| Edit staff user | Missing | `PATCH /api/v1/users/:id` |
| Delete staff user | Missing | `DELETE /api/v1/users/:id` |
| Route history list | Missing | `GET /api/v1/route-history` |

**Rationale**: The spec's Assumption states "The existing NestJS backend exposes REST
endpoints for all four entities." This assumption was aspirational — a small set of
management endpoints must be added. These are simple CRUD operations over existing
entities (Courier, Owner-level staff users, CourierLocationHistory) with no new
business logic.

**Existing endpoints confirmed available**:
- Orders: `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` ✓
- Route (per order): `GET /orders/:id/route` ✓
- Shifts: `GET /couriers/active-shifts`, `GET /couriers/:id/shifts` ✓

---

## Decision 6 — Route History Display: Text Coordinates vs Map

**Decision**: Display route history as a coordinate table (text), not a map.

**Rationale**: The spec's Assumptions explicitly state: "Map visualisation is out of
scope; route history is displayed as coordinate data in text form." No map library
(Leaflet, Mapbox) is introduced.

---

## Decision 7 — Bottom Sheet on Mobile: Ant Design Drawer Placement

**Decision**: Use Ant Design Drawer `placement` prop toggled by a `useBreakpoint`
hook: `placement={isMobile ? 'bottom' : 'right'}`.

**Rationale**: Ant Design Drawer natively supports `placement="bottom"`. The
`Grid.useBreakpoint()` hook from `antd` detects `xs` breakpoint (< 768px) with no
additional dependency. This satisfies FR-011 with zero extra packages.

---

## Decision 8 — Role-Based UI Hiding: Client-Side

**Decision**: Hide create/edit/delete controls for `order_operator` role in the Users
section using a `useGetIdentity` hook check on the JWT role claim.

**Rationale**: The backend enforces authorization (403 on unauthorized requests).
Client-side hiding is a UX improvement, not a security control. The JWT payload
contains the `role` claim, accessible via Refine's `useGetIdentity()`.

---

## Decision 9 — Unsaved Changes Guard: beforeunload + Refine Drawer onClose

**Decision**: Implement unsaved-changes detection using a `isDirty` flag from
`useDrawerForm` (Ant Design Form field tracking) and show an `Modal.confirm` before
closing the drawer.

**Rationale**: Ant Design Form tracks `isFieldsTouched()` natively. Combining this
with the Drawer's `onClose` callback provides the discard-changes confirmation
required by FR-012 without extra libraries.

---

## Decision 10 — Project Location: admin/ at Repo Root

**Decision**: Create `admin/` as a standalone Vite project at the repository root.
It has its own `package.json`, `tsconfig.json`, and `vite.config.ts`. It is NOT
inside `src/` and does NOT share the NestJS package.json.

**Rationale**: The spec Assumption states "standalone web application in an `admin/`
directory at the repository root, with its own `package.json` and build process."
This maintains clean separation between NestJS backend and React frontend.
