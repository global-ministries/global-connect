# Operating Core Recurrent Events Specification

## Purpose

Define Operating Core recurrent events: a recurrence rule subset with lazy, deterministic instance materialization, safe horizon and bound checks, parent relationship between series and EventInstances, and per-instance overrides or cancellations that MUST NOT mutate the series history. The term `Event` denotes a planned occurrence (Service-anchored for `kind = service`); `EventInstance` denotes a materialized occurrence.

## Requirements

### Requirement: Closed recurrence rule subset

A recurring series SHALL carry a `recurrence_rule` with a supported subset of RRULE attributes (`freq`, `interval`, `count`, `until`, `byDay`, `start_time`). The system MUST reject rule values outside the supported subset with a 400 invalid domain error.

#### Scenario: Supported rule accepted
- GIVEN a series with a weekly Sunday recurrence rule for six weeks
- WHEN the rule is validated
- THEN the rule persists unchanged.

#### Scenario: Unsupported rule rejected
- GIVEN an attempt to save a rule with an unsupported calendar attribute
- WHEN the validator inspects it
- THEN the save is rejected
- AND no series row is persisted.

### Requirement: Lazy deterministic instance materialization

The system MUST materialize EventInstances on demand rather than via a required nightly batch. Materialization MUST be deterministic for the series/date combination and idempotent across retries. The same key MUST return the same materialization result until manually overridden.

#### Scenario: Two reads produce same instance
- GIVEN a series with weekly Sunday recurrences
- WHEN two distinct reads request the second instance
- THEN both return the same materialization metadata
- AND no duplicate rows are created.

### Requirement: Safe horizon and bounds

The system MUST cap materialization horizon. Materializing beyond the cap SHALL return a structured out-of-horizon response without creating new EventInstances. Bounds MUST be exposed to operators via the API.

#### Scenario: Out of horizon rejected
- GIVEN a materialization attempt for a date far beyond the configured horizon
- WHEN the validator runs
- THEN the API returns a 400 invalid response
- AND no EventInstance is created.

### Requirement: Per-instance overrides do not mutate series

The system SHALL treat per-instance modifications as materialization overrides, not series-rule mutations. Cancelling an EventInstance SHALL mark `estado = cancelled` for that instance only. Series rule updates SHALL require an authorized operator and SHALL NOT retroactively mutate already materialized EventInstances.

#### Scenario: Instance-only cancellation
- GIVEN a weekly series with three materialized Sundays
- WHEN an operator cancels the second Sunday
- THEN only that EventInstance carries `estado = cancelled`
- AND the series rule and other EventInstances remain untouched.

### Requirement: Parent event and child EventInstance relationship

Each materialized EventInstance SHALL reference its series through a parent linkage. List views SHALL optionally include parent context. The parent row SHALL remain queryable even when all children are cancelled.

#### Scenario: Children list via parent
- GIVEN a parent series with three child EventInstances
- WHEN the operator lists children
- THEN three rows render with the parent linkage set
- AND each carries its own state.

### Requirement: Series and Service coherence

When `kind = service`, the series SHALL derive from a configured Service. Schedule edits at the Service level MUST NOT retroactively mutate already materialized EventInstances; only future materializations reflect the new schedule.

#### Scenario: Service schedule edit does not mutate past instances
- GIVEN a Service with twelve already materialized EventInstances
- WHEN the operator edits the Service start time
- THEN historical EventInstances remain unchanged
- AND only future materializations honor the new start time.
