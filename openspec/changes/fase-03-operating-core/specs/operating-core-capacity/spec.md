# Operating Core Capacity Specification

## Purpose

Define Operating Core capacity: a base capacity per occurrence plus a per-instance operational override that requires an authorized motive and scoped capability (no role-string checks), bounded validation against the base, ordered waitlist interaction, and clear over-capacity rejection at the domain layer rather than at the HTTP layer. Algorithmic volunteer-derived capacity is explicitly deferred.

## Requirements

### Requirement: Capacity base and per-instance operational override

Each occurrence SHALL persist a `capacity_base` (integer, non-negative). The system MAY carry a `capacity_operativa` override per occurrence with `set_by`, timestamp, and reason. When unset, the effective limit equals `capacity_base`.

#### Scenario: Override narrows limit
- GIVEN `capacity_base = 30` and no override
- WHEN a director sets `capacity_operativa = 25` with reason "venue layout"
- THEN the effective limit becomes 25.

#### Scenario: Unset override falls back to base
- GIVEN no override is set
- WHEN the effective limit is queried
- THEN it equals `capacity_base`
- AND the response includes the source label "base".

### Requirement: Override above base is rejected

The system MUST reject any override greater than `capacity_base`. Such overrides SHALL NOT be silently capped nor persisted. Lowering below base remains valid and alerts scoped capacity managers.

#### Scenario: Above-base override rejected
- GIVEN `capacity_base = 20`
- WHEN a director attempts to set `capacity_operativa = 25`
- THEN the system rejects with a domain validation error
- AND no override row is created.

#### Scenario: Lowering below base alerts
- GIVEN `capacity_base = 20` and `capacity_operativa = 20`
- WHEN a director lowers `capacity_operativa` to 14
- THEN the override persists
- AND a low-capacity alert is delivered to scoped capacity managers.

### Requirement: Override authorization via scoped capability

The system SHALL authorize overrides through the `operating_core.capacity.manage` capability scoped to the relevant Experience. Directors SHALL receive it by default; delegation SHALL be scope-bound. Authorization MUST NOT depend on a role-string check.

#### Scenario: Out of scope director denied
- GIVEN a director scoped only to `talleres_crecimiento`
- WHEN they attempt to override a `grupos_vida` occurrence
- THEN the system rejects the request.

### Requirement: Clear over-capacity rejection, never HTTP 500

Waitlistable overflow MUST return a successful `waitlisted` outcome. Non-waitlistable overflow MUST return 409 with a structured reason. The system MUST NOT raise HTTP 500 for business outcomes.

#### Scenario: Waitlistable overflow succeeds
- GIVEN an occurrence with effective capacity 14, waitlist enabled, and 14 confirmed
- WHEN a fifteenth registration arrives
- THEN the capture contract returns a successful `waitlisted` outcome.

#### Scenario: Waitlist disabled returns 409
- GIVEN the same occurrence with the waitlist disabled
- WHEN a fifteenth registration arrives
- THEN the system returns 409 with `{ code: capacity_exceeded }`.

### Requirement: Waitlist promotion interaction

When effective capacity grows or a confirmed row is cancelled, the system SHALL promote the next eligible waitlist entry exactly once per slot, idempotently. See `operating-core-registrations`.

#### Scenario: Capacity raise promotes one
- GIVEN a workshop with effective capacity 14, 14 confirmed, and a waitlist of two
- WHEN `capacity_operativa` rises to 15
- THEN the first waitlist row becomes `confirmada`
- AND the second remains in position 2.

### Requirement: Algorithmic capacity deferred

The system MUST NOT compute capacity from a volunteer-availability algorithm in the MVP.

#### Scenario: Director manual mode only
- GIVEN an occurrence without an algorithmic opt-in flag
- WHEN the manager reads the effective limit
- THEN it equals the override or base value.

### Requirement: Check-out releases slot

Capacity flow SHALL accommodate check-in and check-out for domains that observe student transitions. Check-out releases the slot back to the effective pool without altering `capacity_base` and emits a `check_out` participation event.

#### Scenario: Check-out releases slot
- GIVEN a confirmed registrant who has checked in
- WHEN a leader records a check-out
- THEN the slot is released back to the effective pool
- AND a `check_out` participation event is emitted.
