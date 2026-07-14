# Operating Core Grupos de Vida Bridge Specification

## Purpose

Define the read-only bridge from Grupos de Vida attendance into the Operating Core participation ledger. The bridge SHALL consume existing Grupos de Vida behavior, emit Operating Core `attendance` participation events, never mutate Grupos de Vida tables, RPCs, RLS, or the protected adapter, and MUST be tolerant of partial failures. The bridge MUST observe only new captures going forward; it MUST NOT backfill historical Grupos de Vida attendance into the Operating Core ledger.

## Requirements

### Requirement: Read-only consumption of Grupos de Vida attendance

The system SHALL consume Grupos de Vida attendance through existing RPCs and adapter surfaces without modifying the protected adapter or any Grupo de Vida table, RPC, or RLS.

#### Scenario: Protected adapter behavior unchanged
- GIVEN the bridge runs a capture sync
- WHEN the bridge executes
- THEN the Grupos de Vida adapter and tables remain observably unchanged.

### Requirement: Emit Operating Core attendance events

For each Grupo de Vida attendance record observed, the bridge SHALL emit an `attendance` Operating Core participation event with the resolved persona and a `capture_source` that identifies the bridge origin. The bridge SHALL NOT emit a `registration` event from the bridge path.

#### Scenario: Attendance propagated
- GIVEN a leader marks a member as present in Grupo de Vida
- WHEN the bridge reads the new attendance
- THEN an `attendance` event is written in the Operating Core ledger
- AND `capture_source` identifies the bridge origin.

### Requirement: Start-clean, no historical backfill

The bridge MUST observe only new captures going forward; it MUST NOT backfill historical Grupos de Vida attendance into the Operating Core ledger.

#### Scenario: No historical backfill
- GIVEN historical Grupos de Vida attendance rows exist before bridge deployment
- WHEN the bridge first runs
- THEN it MUST NOT emit historical rows
- AND only new captures from that point forward are observed.

### Requirement: Idempotent bridging and partial-failure tolerance

The bridge MUST be idempotent: the same attendance record observed twice MUST NOT create two Operating Core events. Partial failure MUST NOT corrupt Grupo de Vida state.

#### Scenario: Duplicate observation collapses
- GIVEN the bridge observes attendance record R twice
- WHEN the second observation runs
- THEN exactly one Operating Core event exists for R.

#### Scenario: Bridge failure does not mutate GDV
- GIVEN a transient failure mid-capture
- WHEN the operator retries
- THEN Grupo de Vida attendance state is unchanged.

### Requirement: New visitor on a GDV Sunday routes through the adapter

For a normal Grupos de Vida Sunday with a brand-new visitor, the bridge SHALL classify the new visitor through the visitor-resolution contract and emit a `visitor_capture` event in addition to the `attendance` event. The bridge MUST NOT bypass the adapter.

#### Scenario: New visitor routed via adapter
- GIVEN a Sunday service where a new visitor arrives
- WHEN the bridge processes the attendance
- THEN a `visitor_capture` event is emitted via the existing adapter
- AND an `attendance` event follows resolution.

#### Scenario: Ambiguous visitor not auto-resolved
- GIVEN ambiguous persona candidates
- WHEN the bridge cannot resolve automatically
- THEN the bridge surfaces a manual-confirmation state
- AND MUST NOT silently auto-link.

### Requirement: Bridge uses dedicated attendance kind

The bridge SHALL use `attendance` for routine observation and `attendance_update` only for corrections to a prior observation.

#### Scenario: Routine attendance uses attendance kind
- GIVEN a leader marks a member as present
- WHEN the bridge observes the new attendance
- THEN the row carries `kind = attendance`.

#### Scenario: Corrected attendance uses attendance_update kind
- GIVEN a corrected attendance
- WHEN the bridge observes the correction
- THEN the row carries `kind = attendance_update`.
