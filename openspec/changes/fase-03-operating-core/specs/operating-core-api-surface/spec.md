# Operating Core API Surface Specification

## Purpose

Define the Operating Core API surface: authenticated routes require auth plus scoped capability plus the Operating Core flag; public token endpoints expose the minimum required behavior with expiry and single-use where configured; domain errors are stable; flag off preserves legacy behavior. Existing Fase 1 / Fase 2 / Grupos de Vida routes, RPC signatures, and protected modules SHALL remain observably unchanged.

## Requirements

### Requirement: Authenticated routes are deny-by-default

Every authenticated Operating Core route SHALL require (1) a valid session, (2) the corresponding scoped Operating Core capability, and (3) the Operating Core flag enabled for the request's scope. Routes MUST deny by default; missing capability or flag returns 403 forbidden.

#### Scenario: Authorized read succeeds
- GIVEN a director with `operating_core.events.read` and the flag enabled
- WHEN they request events
- THEN the response returns scoped events with HTTP 200.

#### Scenario: Missing capability denied
- GIVEN a member without `operating_core.events.read`
- WHEN they request events
- THEN the system returns 403 forbidden
- AND no events are leaked in the response body.

### Requirement: Public token endpoints minimize disclosure

Public token endpoints SHALL enforce expiry, optional single-use, and rate limits. They SHALL expose only the requested payload, MUST NOT disclose persona or group identifiers beyond what the token grants, and MUST be auditable.

#### Scenario: Valid public token grants access
- GIVEN a valid, unexpired, unused public token for a registration form
- WHEN an unauthenticated request hits the endpoint
- THEN the endpoint returns the form payload
- AND no persona id or director email is disclosed.

#### Scenario: Replayed public token rejected
- GIVEN a token configured for single-use that has already been consumed
- WHEN a replay request arrives
- THEN the endpoint returns an inaccessible / not-found response
- AND MUST NOT leak that the token was consumed.

### Requirement: Stable domain error vocabulary

The system SHALL return stable domain errors: `400 invalid` for validation, `401 unauthenticated` for missing session, `403 forbidden` for capability denial, `404 inaccessible / not found` for hidden or missing resources, `409 conflict` for non-waitlistable capacity conflict, invalid registration state transition, or irreconcilable idempotency conflict. The system MUST NOT raise HTTP 500 for business outcomes.

#### Scenario: Non-waitlistable capacity conflict
- GIVEN an occurrence at effective capacity with the waitlist explicitly disabled
- WHEN a new registration arrives
- THEN the API returns 409 with `{ code: capacity_exceeded }`.

#### Scenario: Waitlistable overflow succeeds
- GIVEN the same occurrence with the waitlist enabled
- WHEN a new registration arrives
- THEN the API returns HTTP 200 with `{ outcome: waitlisted }`
- AND MUST NOT return 409.

### Requirement: Existing routes and protected contracts observably unchanged

The system MUST NOT modify the existing Fase 1 / Fase 2 / Grupos de Vida API routes, RPC signatures, or protected modules in observable behavior. The platform `uno_a_uno` block MUST remain in effect.

#### Scenario: Protected contracts unchanged in observable behavior
- GIVEN Operating Core slices ship
- WHEN existing routes and the protected RPC signature are exercised
- THEN their external behavior is unchanged
- AND the `uno_a_uno` block remains in effect.

### Requirement: Flag off preserves legacy behavior

Operating Core feature flags SHALL default to OFF in the legacy codebase path. When the flag is off for a given scope, the routes SHALL NOT execute Operating Core logic and SHALL preserve prior behavior; the kill switch MUST revert to legacy semantics without migrations or destructive operations.

#### Scenario: Flag off serves legacy route
- GIVEN the Operating Core flag is disabled for a scope
- WHEN a legacy request hits a route formerly served by the legacy module
- THEN the legacy behavior runs
- AND Operating Core logic MUST NOT execute.
