# Operating Core Participation Ledger Specification

## Purpose

Define the additive Operating Core participation ledger: a single closed-shape event stream capturing events from every Operating Core domain. Correctness depends on a closed kind union (eleven kinds, no `one_on_one_logged`), append-only writes, hybrid payload with bounded metadata, scoped read authorization, and explicit deferral of participation retention until Legal sign-off.

## Requirements

### Requirement: Closed kind union — eleven kinds, no one_on_one_logged

The system SHALL persist participation events with `kind` ∈ `visitor_capture`, `registration`, `cancellation`, `check_in`, `check_out`, `attendance`, `attendance_update`, `service_assignment`, `requirement_update`, `transition`, `document_received`. The kind `one_on_one_logged` MUST NOT appear.

#### Scenario: attendance kind accepted
- GIVEN a registrar marks a confirmed registration as attended
- WHEN the participation event is emitted
- THEN the row carries `kind = attendance`.

#### Scenario: One on one rejected
- GIVEN an attempt to emit `kind = one_on_one_logged`
- WHEN the ledger validator inspects the row
- THEN the write is rejected
- AND the platform `uno_a_uno` block remains.

### Requirement: Append-only corrections

The system MUST NOT mutate a previously persisted event. Corrections SHALL be recorded as a new row with the appropriate `kind` (typically `attendance_update`) and a `corrects_event_id` reference. Auditable actor and capture source SHALL accompany every row.

#### Scenario: Attendance corrected append-only
- GIVEN a registration was incorrectly marked `no_asistio`
- WHEN a director corrects the attendance
- THEN a new `attendance_update` event is emitted
- AND the original row remains unchanged.

### Requirement: Hybrid payload with bounded metadata

Each row MUST persist fixed indexed and auditable fields (kind, subject id, occurred at, status, actor, capture source, experience, event, service) and MAY persist a bounded kind-specific metadata object. Metadata MUST NOT include sensitive PII.

#### Scenario: Fixed fields are searchable
- GIVEN a row with `kind = attendance` and `subject_id` set
- WHEN the ledger is queried by `subject_id` and `kind`
- THEN the row is returned from indexed fields.

#### Scenario: Sensitive metadata rejected
- GIVEN an attempt to write `metadata = { cedula: "..." }` on a `visitor_capture`
- WHEN the persistence layer validates
- THEN the write is rejected
- AND no row exists.

### Requirement: Bridge observes new captures only

The Grupos de Vida bridge MUST observe only new captures going forward; it MUST NOT backfill historical Grupos de Vida attendance into the Operating Core ledger. Hybrid metadata SHALL distinguish bridge origins through `capture_source`.

#### Scenario: No historical backfill
- GIVEN historical Grupos de Vida attendance rows exist before Fase 3
- WHEN the bridge runs
- THEN it MUST NOT emit historical rows
- AND only new captures are observed.

### Requirement: Scoped read authorization

The system SHALL require the same auth context used to write an event to read it back. The read guard SHALL be applied server-side and SHALL NOT be bypassable by client-supplied filters.

#### Scenario: Out of scope reader denied
- GIVEN a director without scope over a target Dream Team
- WHEN they request events for that team
- THEN the response excludes rows outside their scope
- AND no error detail leaks the events' existence.

### Requirement: Participation retention deferred to Legal

The system MUST NOT apply a retention default to Operating Core participation rows until a separate Legal decision is recorded. Until then, rows SHALL remain uncommitted to any retention policy.

#### Scenario: No automatic participation purge
- GIVEN Operating Core tables ship without a participation retention default
- WHEN a future scheduled job runs
- THEN it MUST NOT delete Operating Core ledger rows
- AND a documented Legal decision is required before any retention applies.
