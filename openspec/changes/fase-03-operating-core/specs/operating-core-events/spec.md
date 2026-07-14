# Operating Core Events Specification

## Purpose

Define the Operating Core event domain: a single taxonomy for gatherings, a clear distinction between Service (the configured schedule), Event (a planned occurrence), and EventInstance (a materialized occurrence), soft cancellation that preserves history, and an optional responsible Dream Team assignment scoped by capability.

## Requirements

### Requirement: Event kinds and discriminator

The system SHALL represent every Operating Core event as a single row with an explicit `kind` discriminator. Valid kinds SHALL be exactly `service`, `group_meeting`, `workshop`, `activity`, `custom`. Kind `camp` SHALL NOT be implemented and is deferred. Per-kind contract logic MUST be selected through a typed discriminator.

#### Scenario: Single table with kind discriminator
- GIVEN the Operating Core flag is enabled
- WHEN a director creates a Sunday service, a Thursday workshop, and a custom town hall
- THEN three rows exist with `kind` set to `service`, `workshop`, `custom` respectively.

#### Scenario: Rejected camp kind
- GIVEN the system receives `kind = camp`
- WHEN the create event action validates input
- THEN the system rejects the request
- AND MUST NOT persist the event.

### Requirement: Service, Event, and EventInstance semantics

The system MUST distinguish three concepts. A Service represents the configured weekly schedule. An Event represents a planned occurrence and references the Service when `kind = service`. An EventInstance represents a concrete materialized occurrence with its own start time and lifecycle.

#### Scenario: Event kind service references Service
- GIVEN a configured Service
- WHEN the operator creates an Event with `kind = service`
- THEN the Event references the Service
- AND future EventInstances are derived from that combination.

#### Scenario: EventInstance carries its own lifecycle
- GIVEN an Event with `kind = service`
- WHEN the system materializes an EventInstance
- THEN the EventInstance has its own `estado`, capacity, and registration set
- AND cancelling the EventInstance does NOT mutate the Service or Event rows.

### Requirement: Capability-scoped event creation

The system SHALL authorize event creation through the `operating_core.events.manage` capability scoped to the relevant Experience. Directors SHALL receive that capability by default; delegation SHALL be scope-bound. Authorization MUST NOT depend on a role-string check.

#### Scenario: Out of scope director denied
- GIVEN a director scoped only to `talleres_crecimiento`
- WHEN they attempt to create an event for `grupos_vida`
- THEN the system rejects the request
- AND MUST NOT persist the event.

### Requirement: Lifecycle, optional Dream Team, parent linkage

The system SHALL persist `estado` (active | cancelled), visibility scope, an optional responsible Dream Team assignment, and a parent linkage for series. Cancellation MUST set `estado = cancelled` and preserve history; no hard delete SHALL occur. Linking to a Dream Team MUST NOT mutate the Dream Team row and SHALL respect the actor's scope.

#### Scenario: Cancelled event preserves history
- GIVEN an event with five registrations
- WHEN a director cancels it with a motive
- THEN `estado` becomes `cancelled`
- AND registrations remain queryable with their prior states.

#### Scenario: Dream Team link respects scope
- GIVEN a director scoped only to one Dream Team
- WHEN they assign a different Dream Team as responsible
- THEN the assignment is rejected
- AND the event lifecycle remains unaffected.

### Requirement: Groups and protected contracts unchanged

The system MUST NOT alter Grupos de Vida event tables, RPCs, or RLS, and MUST NOT introduce a `camp` kind. Operating Core event contracts SHALL be additive only.
