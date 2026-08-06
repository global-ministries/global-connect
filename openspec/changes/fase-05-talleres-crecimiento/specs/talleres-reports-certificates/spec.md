# Talleres de Crecimiento — Reports and Certificates

## Purpose

Defines the final-report workflow led by the active group leader, including administrative reopening rules, and the issuance, content, and public verification of certificates for completed participants. The domain preserves a clear separation between internal administrative content and the participant-facing summary and certificate, with tamper-evident history and minimal data exposure on the public verification page.

## Requirements

### Requirement: Leader-authored final report

The system SHALL allow only the active group leader to create or edit the group's final report. The report SHALL be enabled only when all sessions of the group are closed.

#### Scenario: Report enabled after sessions closed
- GIVEN Group A's last session is closed
- WHEN the leader opens the final report form
- THEN the form is editable

### Requirement: Mandatory final status and observations

The system SHALL require the leader to record a final status per participant (`Completado` | `No completado` | `Abandonó`) and a non-empty general observations field. All other fields SHALL be optional. For `pareja` workshops, the system SHALL capture one status per unit, not per individual.

#### Scenario: Couple unit final status
- GIVEN Ana and Luis are enrolled as a unit in a couple workshop
- WHEN the leader records final status
- THEN exactly one status is recorded for the unit

### Requirement: Submission lock and administrative reopen

Once submitted, the report SHALL be locked. Reopening SHALL be permitted only by a coordinator or the Director General, SHALL require a mandatory reason, and SHALL transfer editing rights exclusively to the reopening actor.

#### Scenario: Reopen with reason
- GIVEN the report has been submitted
- WHEN the coordinator reopens it with reason "datos incompletos"
- THEN the report becomes editable

### Requirement: Signature preservation across corrections

The system SHALL record the leader's name and a signature date at submission. Administrative corrections SHALL preserve the original signature and SHALL append a new entry identifying the correcting author and correction date.

#### Scenario: Original signature preserved
- GIVEN Carlos signed the report on `2026-08-15`
- WHEN a correction is applied on `2026-09-01`
- THEN the original signature remains visible

### Requirement: Certificate generation and public verification

The system SHALL generate a certificate automatically when a participant's (or couple unit's) final status is `Completado`. The certificate SHALL be a downloadable PDF containing a unique verification code and a scannable QR that resolves to `/verificar-certificado/[codigo]`. The public page SHALL display only non-sensitive information (workshop name, participant name, completion date, signers) and SHALL NOT expose email, phone, ID, group notes, or internal administrative metadata.

#### Scenario: No certificate for non-completion
- GIVEN Luis's final status is `No completado`
- WHEN Luis opens his certificates view
- THEN no certificate is offered

#### Scenario: Invalid code surfaces friendly error
- GIVEN an unknown code is requested
- WHEN the public page is loaded
- THEN the system returns a non-sensitive error

### Requirement: Final status rate and counts in metrics

The system SHALL expose final-status counts and a finalization rate (`completados / total_con_estado_final`) per workshop, edition, period, and type. Access SHALL be scoped per role: Director General global; coordinator for assigned workshops; leader and volunteer for their group.

#### Scenario: Rate and counts surfaced
- GIVEN Workshop X edition 2 has 30 participants with final status
- WHEN a coordinator views its metrics
- THEN counts of `Completado`, `No completado`, `Abandonó` are returned

### Requirement: Minimum service history after exit

When a coordinator, leader, or volunteer is permanently removed from a workshop, the system SHALL retain only the minimum service history: workshop, group, role, period/edition, and service dates. Contact data, internal notes, and private resources SHALL NOT remain accessible.

#### Scenario: Ex-leader retains minimum history only
- GIVEN Carlos is permanently removed as leader of Group A
- WHEN Carlos queries his service history
- THEN the entry shows workshop, group, role, period, dates