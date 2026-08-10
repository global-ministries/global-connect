# Talleres de Crecimiento — Catalog

## Purpose

Defines the catalog of Growth Workshops: workshop definitions with individual or couple modalities, enrollment modalities (general period vs permanent/custom recurrence), tags and prerequisites, and the role-based authorization model that derives capabilities from role and scope. The catalog never mutates existing enrollments when configuration changes and preserves protected file byte-identity.

## Requirements

### Requirement: Workshop definition and modalities

The system SHALL register each workshop with a unique identifier, name, description, type (`individual` | `pareja`), enrollment modality, and lifecycle state. For `pareja` workshops the system SHALL distinguish the couple link as `matrimonio` or `novios`; link verification is performed outside the system and only its result is recorded.

#### Scenario: Couple workshop with marriage link
- GIVEN a couple workshop with link type `matrimonio`
- WHEN the workshop is registered
- THEN `type='pareja'` and `link_type='matrimonio'` are recorded

### Requirement: Enrollment modalities

The system SHALL support two enrollment modalities: `periodo_general` and `permanente_custom`. `periodo_general` is opened/closed by the Director General, manually or by date. `permanente_custom` uses a configurable recurrence rule (e.g. `primer domingo del mes`) from which the system calculates the next valid occurrence.

#### Scenario: Manual close overrides automatic schedule
- GIVEN a general-period workshop with automatic close `2026-08-01`
- WHEN the Director General closes the period on `2026-07-20`
- THEN the workshop closes on `2026-07-20`
- AND the scheduled close is suppressed

### Requirement: Lifecycle states

The system SHALL enforce the lifecycle: `borrador → abierto → en_curso → cerrado | cancelado`. Transitions outside this set SHALL be rejected. State changes SHALL be versioned; stale writes SHALL return 409.

#### Scenario: Happy path lifecycle
- GIVEN a workshop in `abierto`
- WHEN the Director General transitions it through `en_curso` to `cerrado`
- THEN each transition succeeds
- AND each step increments the version

### Requirement: Tags and prerequisites

The system SHALL allow free-form tags and declarative prerequisites (e.g. "Taller X completed"). Prerequisites SHALL be evaluated as a warning, never a hard block; the leader or coordinator may override.

#### Scenario: Prerequisite evaluated as warning
- GIVEN Ana enrolls in a workshop requiring `taller_x_completed`
- WHEN she has not completed `taller_x`
- THEN the enrollment proceeds
- AND a warning is surfaced to the coordinator

### Requirement: Role-based capability inheritance

The system SHALL NOT require manual capability grants. Capabilities SHALL be derived from role and assignment scope: the Director General inherits the full director set; coordinators inherit scoped sets per assigned workshop; leaders and volunteers inherit per assigned group; participants inherit per active enrollment. Removing the role or assignment SHALL revoke capabilities automatically.

#### Scenario: Leader role revoked on reassignment
- GIVEN Carlos is leader of Group A
- WHEN Carlos is reassigned away from Group A
- THEN his leader capabilities are revoked
- AND his UI sidebar items derived from that scope disappear

### Requirement: Single role per workshop, with Director exception

The system SHALL enforce that, within a single workshop, a person MAY hold at most one operational role (coordinator, leader, volunteer, or participant). The Director General SHALL be the sole exception and MAY simultaneously be a participant in the same workshop.

#### Scenario: Conflict rejected
- GIVEN María is already a leader in Workshop X
- WHEN an attempt registers her as volunteer in the same workshop
- THEN the system rejects the second assignment
- AND surfaces a clear conflict message

### Requirement: Authorized team assignment

The system SHALL allow only the Director General to authorize the service team of a workshop. Coordinators MAY reassign non-terminal roles within the authorized team; permanent removal SHALL require a Director-approved withdrawal request with mandatory reason.

#### Scenario: Permanent withdrawal requires Director approval
- GIVEN Carlos submits a withdrawal request from Workshop X
- WHEN the coordinator forwards it without Director approval
- THEN the request is queued, not applied
- AND only a Director decision with reason SHALL finalize the withdrawal