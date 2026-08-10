# Talleres de Crecimiento — Operation

## Purpose

Defines the operational lifecycle of Growth Workshops after enrollment: how groups are formed and staffed, how sessions are scheduled, recorded, and closed sequentially, how attendance is captured immutably, and how resources are exposed live or frozen as snapshots. Every workshop that begins has a clean path to termination with auditable history.

## Requirements

### Requirement: Simultaneous groups per workshop

The system SHALL allow a workshop to host multiple groups running in parallel. Each group SHALL have its own schedule, assigned leaders and volunteers, and enrolled participants.

#### Scenario: Two parallel groups
- GIVEN Workshop X is approved to host two groups
- WHEN the coordinator creates Group A and Group B with different meeting times
- THEN both groups exist independently

### Requirement: Multiple coordinators and group-scoped assignments

The system SHALL allow more than one active coordinator per workshop; assignments SHALL be granted only by the Director General, who alone SHALL revoke them. Leaders and volunteers SHALL be assigned to a specific group; capabilities SHALL derive from the assignment and SHALL be revoked automatically when it ends.

#### Scenario: Coordinator cannot self-remove
- GIVEN María is an active coordinator of Workshop X
- WHEN María tries to remove her own assignment
- THEN the system rejects the action

#### Scenario: Group-scoped leader
- GIVEN Carlos is assigned as leader of Group A
- WHEN Carlos queries Workshop X's resources
- THEN Group A's resources are returned

### Requirement: Session count change guard

The system SHALL allow changing the total session count only when no enrollment is `aprobado`. If any enrollment is `aprobado`, the system SHALL reject the change.

#### Scenario: Session count blocked after approvals
- GIVEN Workshop X has at least one approved enrollment
- WHEN the Director General attempts to change the session count
- THEN the system rejects the change

### Requirement: Sequential session progression and attendance immutability

The system SHALL enforce strict sequential progression: a session SHALL NOT be in progress or completed until the previous is closed. Attendance SHALL be recorded per participant per session as `Presente` or `Ausente`, SHALL be immutable once saved, and SHALL be corrected only by appending. A computed `No aplica` SHALL be assigned for late enrollments.

#### Scenario: Skip ahead blocked
- GIVEN Session 1 is open and Session 2 is next
- WHEN the leader attempts to open Session 2
- THEN the system rejects the action

#### Scenario: Attendance is immutable
- GIVEN Ana's attendance for Session 2 is `Presente`
- WHEN the leader attempts to overwrite it directly
- THEN the system rejects the overwrite

### Requirement: Resource access modes and live/snapshot

Resources SHALL be classified as `taller` or `sesion`. The system SHALL support two release modes per workshop: `all_on_approval` and `progressive`. Resources SHALL be live for active groups; when a group completes, the system SHALL freeze a snapshot and subsequent edits SHALL NOT affect it.

#### Scenario: Completed group keeps snapshot
- GIVEN Group B completed with snapshot including R1 v3
- WHEN an admin updates R1 to v4
- THEN Group B still sees R1 v3 from its snapshot

### Requirement: Meeting-time change and group completion

The leader SHALL change a group's meeting time for "this session only" or "this session and all subsequent sessions"; past sessions SHALL NOT change retroactively. The system SHALL mark a group as `Completado` only when all sessions are closed, attendance is recorded, and all final reports are submitted; the transition SHALL be automatic.

#### Scenario: Single-session time change
- GIVEN Group A's Session 4 is on Wednesday
- WHEN the leader moves it to Thursday for that session only
- THEN Session 4 moves to Thursday

#### Scenario: Group auto-completes
- GIVEN Group A has all sessions closed, attendance recorded, and reports submitted
- WHEN the system evaluates completion conditions
- THEN the group transitions to `Completado`