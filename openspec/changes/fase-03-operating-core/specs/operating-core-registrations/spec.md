# Operating Core Registrations Specification

## Purpose

Define the Registration domain: a configurable per-event lifecycle, idempotent inserts, ordered waitlist promotion, automatic or manual confirmation per event, a `rechazada` rejection state distinct from cancellation, and a tokenized public link. Cancellations and capacity increases MUST promote the next eligible waitlist entry exactly once per slot.

## Requirements

### Requirement: Canonical registration states

Each registration SHALL persist in exactly one of `pendiente`, `confirmada`, `asistida`, `no_asistio`, `cancelada`, `rechazada`. Transitions follow a closed state machine: `pendiente → confirmada → asistida | no_asistio`; `pendiente → cancelada | rechazada` and `confirmada → cancelada` are explicit. Manual denial uses `rechazada`; user or system cancellation uses `cancelada`. `asistida`, `no_asistio`, `cancelada`, `rechazada` SHALL be terminal.

#### Scenario: Manual denial uses rechazada
- GIVEN a `pendiente` registration on a `manual` event
- WHEN an authorized operator denies it
- THEN the row transitions to `rechazada`.

### Requirement: Idempotent registration under concurrency

The system MUST guarantee at most one non-terminal registration per attendee-and-event pair.

#### Scenario: Concurrent duplicate collapses
- GIVEN a public link is opened twice for the same attendee
- WHEN both submissions race
- THEN exactly one row remains in a non-terminal state.

### Requirement: Per-event automatic or manual confirmation

Each event SHALL carry `confirmation_mode` ∈ `automatic | manual`. Default MUST be `automatic`; `automatic` confirms in arrival order until effective capacity is reached and queues overflow. `manual` MUST keep new rows in `pendiente`.

#### Scenario: Automatic confirms within capacity
- GIVEN a workshop with effective capacity = 20 and `confirmation_mode = automatic`
- WHEN 21 attendees register
- THEN rows 1–20 become `confirmada`; row 21 becomes `pendiente` at waitlist position 1.

### Requirement: Automatic overflow returns successful waitlisted outcome

When an `automatic` event receives a registration beyond effective capacity and the waitlist is enabled, the system MUST persist a `pendiente` row with ordered waitlist membership and MUST return a successful `waitlisted` outcome. Waitlistable overflow MUST NOT return 409.

#### Scenario: Waitlistable overflow succeeds
- GIVEN a workshop at effective capacity with waitlist enabled and five waitlisted
- WHEN another registration arrives
- THEN the row persists at waitlist position 6
- AND the API returns HTTP 200 with `{ outcome: waitlisted }`.

#### Scenario: Waitlist disabled returns 409
- GIVEN the same workshop with the waitlist disabled
- WHEN another registration arrives
- THEN the system returns 409 with `{ code: capacity_exceeded }`.

### Requirement: Cancellation or capacity increase promotes exactly one eligible entry per slot

When a confirmed row is cancelled or effective capacity grows by one slot, the system SHALL promote the next eligible waitlist entry to `confirmada` exactly once per available slot. Promotion MUST emit a registration event and a notification. Double promotion MUST NOT occur.

#### Scenario: Cancellation or capacity raise promotes exactly one
- GIVEN a workshop at effective capacity 20 with five waitlisted
- WHEN a confirmed row is cancelled OR effective capacity grows to 21
- THEN exactly the first waitlisted row becomes `confirmada`
- AND a waitlist-promotion notification is emitted.

### Requirement: 409 reserved for non-waitlistable capacity, invalid transition, irreconcilable idempotency

The system SHALL reserve 409 for: (a) non-waitlistable capacity conflict, (b) invalid registration state transition, (c) irreconcilable idempotency conflict.

#### Scenario: Invalid transition is 409
- GIVEN a `rechazada` registration
- WHEN a request attempts `confirmada`
- THEN the system returns 409 with `{ code: invalid_transition }`.

### Requirement: Public tokenized registration link

The system SHALL expose a public registration endpoint accepting a signed, time-limited token. No authenticated session is required. Expired or replayed tokens MUST be rejected.

#### Scenario: Valid token creates registration
- GIVEN a valid unexpired public token
- WHEN an unauthenticated submitter posts the form
- THEN a registration row is created per the event's `confirmation_mode`.

#### Scenario: Expired token rejected
- GIVEN an expired public token
- WHEN a submitter hits the public endpoint
- THEN the system rejects with an inaccessible / expired response.
