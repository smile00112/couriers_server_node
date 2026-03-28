# Feature Specification: Courier Authentication

**Feature Branch**: `001-courier-auth`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "courier-authentication"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Courier Logs In via SMS Code (Priority: P1)

A courier opens the app, enters their phone number, requests a one-time code via SMS,
receives it, enters it, and gains access to their courier dashboard.

**Why this priority**: The primary and most common login method. Without it, couriers
cannot access any part of the system. All other auth stories build on this verification flow.

**Independent Test**: Can be fully tested by sending a code to a known courier's phone
and verifying the app receives a valid session token. Delivers a fully functional login
flow independently.

**Acceptance Scenarios**:

1. **Given** a courier exists in the tenant with phone `+79001234567`, **When** they
   request a code via SMS, **Then** they receive a confirmation response and a 6-digit code is sent.
2. **Given** a valid non-expired code, **When** the courier submits it, **Then** they
   receive an access token and a refresh token.
3. **Given** an expired code (older than 5 minutes), **When** the courier submits it,
   **Then** they receive a clear error message indicating the code has expired.
4. **Given** an unknown phone number (no courier account in the tenant), **When** a
   code is requested, **Then** the system rejects the request with an appropriate error.
5. **Given** a courier requests a code twice within 5 minutes, **When** the second
   request arrives, **Then** no new SMS is sent; the original code remains valid.

---

### User Story 2 — Courier Logs In via Telegram (Priority: P2)

A courier selects Telegram as their delivery channel, receives the one-time code via
Telegram bot, and completes authentication using the same verification step as SMS.

**Why this priority**: Alternative channel for markets where SMS delivery is unreliable
or costly. Shares the same code-verification flow as Story 1.

**Independent Test**: Can be tested by requesting a code with the Telegram channel selected
and confirming the code is received in the Telegram bot. Same verify-code step as Story 1.

**Acceptance Scenarios**:

1. **Given** a courier requests a code with Telegram selected as channel, **When** the
   request is processed, **Then** the code is delivered via Telegram bot, not SMS.
2. **Given** the Telegram delivery provider is unavailable, **When** the request is
   made, **Then** the courier receives a clear error and no code is stored.

---

### User Story 3 — Courier Logs In via Login/Password (Priority: P2)

A courier who has been issued a username and password by the administrator logs in
directly, without going through a one-time code flow.

**Why this priority**: Required for environments where phone-based auth is unavailable
(e.g., desktop operators with courier role, low-signal areas).

**Independent Test**: Can be fully tested by logging in with known credentials and
verifying a valid session token is returned.

**Acceptance Scenarios**:

1. **Given** a courier with valid credentials, **When** they submit login + password,
   **Then** they receive an access token and a refresh token.
2. **Given** incorrect credentials, **When** submitted, **Then** the system rejects
   the request without revealing whether the login or password is wrong.
3. **Given** 5 failed login attempts within 10 minutes, **When** a 6th attempt is made,
   **Then** further attempts are blocked for the remainder of the window.

---

### User Story 4 — Courier Logs Out (Priority: P3)

A courier explicitly logs out of the app, immediately invalidating their session so
the device can no longer make authenticated requests.

**Why this priority**: Required for security on shared devices and end-of-shift
scenarios. Builds on the session issued in Stories 1–3.

**Independent Test**: Log in, log out, attempt a protected action — must be rejected.

**Acceptance Scenarios**:

1. **Given** an authenticated courier, **When** they log out, **Then** their session
   is invalidated and the next protected request with the same token is rejected.

---

### Edge Cases

- What happens when a courier requests a code for a phone that belongs to a different
  tenant? → System returns courier-not-found without confirming or denying the phone exists.
- What if the same courier logs in on two devices simultaneously? → Both sessions are
  valid independently (multi-device support assumed).
- What if the SMS gateway reports success but the message is never delivered? → Code is
  stored; courier may re-request after the TTL expires. No automatic retry at the platform level.
- What if a courier's account is deactivated while they have an active session? → Existing
  token remains valid until it expires; deactivation takes effect on next login attempt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a phone number and deliver a 6-digit one-time code via
  the selected channel (SMS or Telegram).
- **FR-002**: System MUST normalize phone numbers to standard international format before
  lookup and storage; invalid formats MUST be rejected.
- **FR-003**: System MUST verify that a courier account exists for the given phone number
  within the requesting tenant before issuing a code.
- **FR-004**: Issued codes MUST expire after 5 minutes from the time of creation.
- **FR-005**: If a valid unexpired code already exists for a phone number within the
  tenant, requesting a new code MUST return a confirmation without triggering a new delivery.
- **FR-006**: System MUST verify a submitted code is non-expired, unused, and matches
  the correct phone number and tenant before granting access.
- **FR-007**: Successful authentication MUST issue a short-lived access credential and
  a longer-lived refresh credential.
- **FR-008**: System MUST support login via username/password as an alternative to
  one-time codes.
- **FR-009**: Code request attempts MUST be limited to 5 per phone number per 10 minutes;
  excess requests MUST be rejected with a clear message.
- **FR-010**: Failed password login attempts MUST be limited to 5 per identity per
  10 minutes; excess attempts MUST be temporarily blocked.
- **FR-011**: System MUST allow a courier to explicitly end their session (logout), after
  which the credential MUST be rejected on all subsequent requests.
- **FR-012**: All issued credentials MUST carry tenant identity, preventing a credential
  issued for one tenant from being used in another.

### Key Entities

- **Courier**: The person authenticating; belongs to one tenant; identified by phone number
  and optionally by login/password credentials.
- **AuthCode**: A short-lived one-time code record — captures phone, code value, delivery
  channel (SMS / Telegram), expiry time, and whether it has been used.
- **Session**: The credential granted after successful authentication — carries courier
  identity, role, and tenant; supports explicit revocation via logout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A courier can complete the full SMS login flow (request → receive → enter →
  access) in under 60 seconds under normal network conditions.
- **SC-002**: Re-requesting a code within the 5-minute TTL window never triggers an
  additional SMS delivery (0 duplicate sends confirmed by delivery logs).
- **SC-003**: An expired or invalid code is rejected 100% of the time with a clear
  user-facing error message.
- **SC-004**: A courier credential from tenant A is rejected 100% of the time when
  used against tenant B's resources.
- **SC-005**: After logout, the revoked credential is rejected on the very next protected
  request with no grace period.
- **SC-006**: The 6th code request within a 10-minute window is blocked; requests succeed
  again after the window resets.

## Assumptions

- Each courier belongs to exactly one tenant (Owner); phone numbers are unique within a
  tenant but may repeat across different tenants.
- The SMS and Telegram delivery providers are external services; this feature integrates
  with existing provider adapters and does not implement them.
- Courier password credentials are set by an Administrator or Owner; couriers cannot
  self-register or self-reset passwords (separate admin flow, out of scope).
- Multi-device login is permitted — a courier may hold active sessions on multiple devices
  simultaneously.
- Token refresh (using the refresh credential to obtain a new access credential) is handled
  by a generic token management mechanism; it is out of scope for this feature specification.
- The tenant context is derived from the phone number lookup or provided as a parameter
  in the request; the exact mechanism is confirmed during planning.
