# Operating Core Services Specification

## Purpose

Define Service as a first-class configurable weekly schedule across one or more campuses. Service is distinct from Experience (ministry context) and from Event / EventInstance (concrete occurrences). Services feed Event instances, capacity, attendance, and dashboards without requiring code change when adding or removing a schedule.

## Requirements

### Requirement: Service is a configurable schedule distinct from Experience and Event

A Service SHALL represent a recurring weekly schedule for a given campus, configured through Operating Core surface area only. Service is distinct from an Experience and from an Event or EventInstance. Editing the Service MUST NOT create, mutate, or duplicate Event rows.

#### Scenario: Service edit does not mutate Event
- GIVEN a configured Service "Sunday Service — North Campus"
- WHEN a director edits the Service start time by 15 minutes
- THEN the Service schedule reflects the change
- AND no historical Event row is mutated.

#### Scenario: One campus with multiple Services
- GIVEN a campus with services on Sunday, Wednesday, and Friday
- WHEN the operator lists Services for that campus
- THEN three Service records are returned
- AND each is independently schedulable without code change.

### Requirement: Multiple Services per campus, zero-Services campuses are valid

A campus MAY have zero, one, or many Services. Adding or removing a Service MUST require no code or migration. New campuses with no Services SHALL remain valid and SHALL NOT block dashboard or capture rendering.

#### Scenario: New campus without Services
- GIVEN a new campus opens with no configured Service
- WHEN a director views the dashboard for that campus
- THEN the dashboard renders without errors
- AND shows zero Services explicitly.

#### Scenario: Adding a fourth Service needs no code
- GIVEN a campus with three active Services
- WHEN an authorized operator configures a fourth
- THEN the new Service is queryable immediately
- AND no code change or migration is required.

### Requirement: Service context feeds events, capacity, attendance, dashboards

The Service context SHALL be available to Event instances, capacity configuration, attendance capture, and dashboards. Service queries MUST return context (campus, weekday, start time, status) and MUST remain consistent under concurrent reads.

#### Scenario: EventInstance carries Service context
- GIVEN a confirmed Service
- WHEN a capture flow creates an EventInstance
- THEN the EventInstance carries Service context
- AND dashboards group by Service correctly.

### Requirement: Schedule removal and disable preserve history

Removing or disabling a Service MUST preserve historical Event rows, attendance records, and capacity decisions. Disabled Services produce no new EventInstances; historical rows remain queryable.

#### Scenario: Disable preserves history
- GIVEN a Service with twelve weeks of Event rows and attendance
- WHEN an authorized operator disables the Service
- THEN historical rows remain queryable
- AND no new EventInstance is materialized going forward.

#### Scenario: Remove does not hard-delete history
- GIVEN a Service disabled for two weeks
- WHEN a director removes the Service record
- THEN historical rows remain
- AND the Service row transitions to `removed`, not hard-deleted.

### Requirement: No duplicated Event rows to represent a schedule

The system MUST NOT clone Event rows to represent a schedule. A schedule is represented by the Service; each EventInstance is one row per occurrence. Schedule edits MUST NOT trigger bulk Event-instance duplication.

#### Scenario: Schedule edit does not duplicate rows
- GIVEN a Service with one materialized EventInstance per week for six weeks
- WHEN the operator changes the start time
- THEN the EventInstance row count remains unchanged
- AND only future materializations honor the new start time.
