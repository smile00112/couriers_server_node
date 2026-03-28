# New Specs Index

This folder contains the first-pass functional spec briefs extracted from the legacy courier project documentation.

## Included Specs

- 01-courier-authentication.md
- 02-order-ingestion.md
- 03-order-lifecycle.md
- 04-courier-tracking.md
- 05-work-shift-management.md
- 06-payout-reconciliation.md

## Rationale

- The split follows business capabilities rather than technical layers.
- Infrastructure concerns are intentionally not extracted into standalone specs at this stage.
- Realtime events, push notifications, and external callbacks are captured inside the functional specs that depend on them.
- The set is intended as a Spec Kit starting point and can be expanded later with user stories, acceptance criteria, and implementation tasks.

## Suggested Next Step

Expand each brief into a fuller spec with scenarios, explicit non-goals, and testable acceptance criteria.