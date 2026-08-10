# Talleres de Crecimiento — Enrollment

## Purpose

Defines enrollment behavior for Growth Workshops: how individuals and couples submit, approve, reject, and resume enrollment; how modalities interact with general periods and permanent/custom recurrence; how enrollment state survives configuration changes; and how read access is scoped. Enrollments are always reviewed; they never become effective without explicit approval.

## Requirements

### Requirement: Initial pending state and required approval

The system SHALL create every enrollment (self-service or administrative) in state `pendiente`. The enrollment SHALL NOT transition to `aprobado` or `no aprobado` without explicit coordinator or director action.

#### Scenario: Self-service enrollment pending
- GIVEN Ana submits her own enrollment to Workshop X
- WHEN the system records the enrollment
- THEN the state is `pendiente`
- AND Ana appears in the coordinator's pending queue

### Requirement: Approval and rejection with reason

The system SHALL require coordinator or director authority to approve. Rejection (`no aprobado`) SHALL require an internal administrative reason; the reason SHALL be persisted and SHALL NOT be exposed to the participant.

#### Scenario: Rejection requires internal reason
- GIVEN an enrollment in `pendiente`
- WHEN the coordinator rejects without supplying a reason
- THEN the system rejects the transition
- AND requires a non-empty reason before persisting

### Requirement: Resume only while period is active

The system SHALL allow transitioning an enrollment from `no aprobado` back to `pendiente` only when the workshop's enrollment period is still active. The transition SHALL NOT alter the original submission metadata.

#### Scenario: Resume blocked after period closed
- GIVEN Ana's enrollment is `no aprobado` and the workshop period has closed
- WHEN a coordinator attempts to resume
- THEN the system rejects the transition

### Requirement: Couple enrollment unit and individual attendance

For `pareja` workshops the system SHALL record a single enrollment unit referencing two persons with a declared link type (`matrimonio` | `novios`). Attendance SHALL be recorded per individual session and per person. The system SHALL expose a unified enrollment status per unit.

#### Scenario: Couple enrollment created as unit
- GIVEN Ana and Luis enroll together with link `matrimonio`
- WHEN the enrollment is submitted
- THEN one enrollment unit references both persons
- AND the link type is recorded

### Requirement: Permanent/custom rescheduling

For permanent/custom workshops, if an enrollment is still `pendiente` at the scheduled start time, the system SHALL automatically reschedule the enrollment to the next valid occurrence. Original submission metadata SHALL be preserved.

#### Scenario: Reschedule when start time passes
- GIVEN Ana's enrollment is `pendiente` and the current occurrence starts in 5 minutes
- WHEN that start time elapses without approval
- THEN Ana's enrollment target moves to the next valid occurrence

### Requirement: Enrollment survives modality changes and re-enrollment

The system SHALL guarantee that changing a workshop's enrollment modality does NOT affect existing enrollments. The system SHALL also allow a participant to enroll in a new edition of the same workshop; each edition SHALL produce an independent enrollment record.

#### Scenario: Modality change does not mutate in-flight enrollments
- GIVEN Workshop X switches from `periodo_general` to `permanente_custom`
- WHEN Ana has an existing `pendiente` enrollment
- THEN her enrollment state and target occurrence are unchanged

#### Scenario: New edition independent record
- GIVEN Ana completed Workshop X edition 1
- WHEN Ana enrolls in edition 2
- THEN a new enrollment record is created
- AND edition 1's completion remains in her history

### Requirement: Read access scoped to role

The system SHALL scope enrollment visibility: participants see only their own enrollments; leaders and volunteers see enrollments of their assigned groups; coordinators see enrollments of their assigned workshops; the Director General sees all enrollments within scope.

#### Scenario: Coordinator sees assigned workshops only
- GIVEN María is coordinator of Workshop X but not Workshop Y
- WHEN María queries enrollments
- THEN Workshop X is returned
- AND Workshop Y is not visible