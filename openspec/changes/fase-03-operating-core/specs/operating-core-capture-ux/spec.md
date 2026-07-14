# Operating Core Capture UX Specification

## Purpose

Define domain-neutral capture contracts over one Operating Core participation ledger so future domain experiences (GDV leader attendance, Niños check-in/check-out, Estudiantes and TLR leader lists, DPS coordinator capture, Workshop registration and attendance) integrate as adapters without changing the ledger core. Fase 3 defines capture contracts and shared states only — no domain-specific production UI. Hardware (QR, printer, tablet, kiosk) is optional; phone and desktop flows MUST work without it.

## Requirements

### Requirement: Domain-neutral capture contracts

The system SHALL expose capture contracts over the single participation ledger. A contract MUST declare the required actor capability, the captured subject, the resulting participation kind, and the `capture_source` label. Adapters MUST NOT require ledger schema changes to add a domain.

#### Scenario: GDV leader uses shared contract
- GIVEN a GDV leader on Sunday morning
- WHEN they mark attendance through the leader capture flow
- THEN a participation event is written via the shared contract
- AND the same contract used by Workshops and DPS captures.

### Requirement: Adapters integrate new domains without ledger changes

A new domain SHALL integrate via an adapter mapping UX to the existing contract. The adapter MUST NOT alter ledger schema, the kind union, or the read guard.

#### Scenario: New adapter requires no schema change
- GIVEN a new domain wishes to record attendance
- WHEN an adapter maps to the existing contract
- THEN no new table, kind, or guard change is required
- AND `capture_source` distinguishes the new domain.

### Requirement: Hardware-independent capture flows

Capture flows MUST work on phone and desktop without hardware. Quick mark, manual search, and bulk select SHALL be available so no QR, printer, tablet, or kiosk is required.

#### Scenario: Phone quick mark
- GIVEN a leader with capture scope and a phone
- WHEN they search by name and mark attendance
- THEN the event is recorded with no hardware requirement.

#### Scenario: Desktop bulk select
- GIVEN an operator with capture scope on a desktop session
- WHEN they select attendees and confirm
- THEN every participation event records without hardware.

### Requirement: Shared capture states across flows

The contract SHALL expose a closed state set for every domain: `idle`, `in_progress`, `awaiting_resolution`, `confirmed`, `overridden`, `rejected`. State names SHALL NOT embed domain semantics.

#### Scenario: Awaiting resolution is uniform
- GIVEN the capture cannot resolve a subject
- WHEN the contract enters `awaiting_resolution`
- THEN the same surface treats that state across domains.

#### Scenario: Override requires capability
- GIVEN a capture `in_progress`
- WHEN an operator with override scope submits an override
- THEN the contract transitions to `overridden`
- AND the override action is auditable.

### Requirement: Reassignment guidance is contract-driven

When a subject cannot be admitted (over-capacity, age-group mismatch), the contract SHALL return a structured reassignment guidance payload (target queue, eligibility reason, next step). Adapters render guidance in their own UX; no Niños-specific or GDV-specific component is mandated.

#### Scenario: Over-capacity returns guidance
- GIVEN a children's workshop at operational capacity 14 with overflow
- WHEN the contract returns its outcome
- THEN the response includes a reassignment guidance field
- AND no Niños-specific component is required to render it.

### Requirement: Counts derivable from the single ledger

Each domain SHALL expose observable counts for events created, registrations in flight, and attendance observed. These counts SHALL be derivable from the single ledger.

#### Scenario: Counts from ledger only
- GIVEN a director opens the dashboard for a campus
- WHEN the dashboard queries events, registrations, and attendance counts
- THEN each count is returned from the single ledger
- AND no domain-specific aggregation table is required.
