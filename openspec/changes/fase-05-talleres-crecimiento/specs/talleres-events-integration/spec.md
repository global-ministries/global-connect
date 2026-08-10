# Talleres de Crecimiento — Events and Integration

## Purpose

Defines the cross-cutting event surface of Growth Workshops: the internal event catalog (versioned, no external delivery channels), the metrics accessible by role, and the dedicated integration layer that exposes workshop data to the future Spiritual Growth Path. Integration is decoupled, capabilities remain derived (never manually granted), and event/metric data carries enough context to power downstream pastoral journeys without leaking sensitive material.

## Requirements

### Requirement: Versioned internal event catalog

The system SHALL maintain a documented, versioned catalog of internal events emitted by Growth Workshops. Each event SHALL include actor, scope, timestamp, and structured metadata. Events SHALL be persisted internally; the system SHALL NOT integrate with external delivery channels (email, push, WhatsApp) in this phase.

#### Scenario: No external channels wired
- GIVEN an internal event is emitted
- WHEN the event reaches the outbox
- THEN only the internal ledger records it

### Requirement: Event metadata completeness

Every emitted event SHALL carry the full context required for downstream replay: workshop identifier, edition/period, group identifier (when applicable), person identifier, timestamp, and structured metadata. Sensitive fields (national ID, phone, email, free-text private notes) SHALL NOT appear in event payloads.

#### Scenario: Event payload carries full context
- GIVEN a session-attended event for Ana in Workshop X, Group A, Session 2
- WHEN the event is persisted
- THEN workshop, group, person, session, and timestamp are present

### Requirement: Metrics by role scope

The system SHALL expose metrics for completion rates and counts across workshops, periods, editions, and types. Access SHALL be scoped: Director General global; coordinator for assigned workshops; leader and volunteer for their group. Metrics SHALL include both absolute counts and a finalization rate.

#### Scenario: Coordinator sees assigned workshops only
- GIVEN María coordinates Workshop X but not Workshop Y
- WHEN María queries metrics
- THEN only Workshop X metrics are returned

### Requirement: Capability revocation on role or scope loss

The system SHALL NOT rely on manual capability grants. Capabilities SHALL be derived from current role and assignment scope. When role or assignment ends, the system SHALL revoke the derived capabilities automatically on the next capability resolution.

#### Scenario: Automatic revocation
- GIVEN Ana was granted `talleres_crecimiento.lead.write` as leader of Group A
- WHEN Ana is removed from Group A
- THEN the capability is revoked

### Requirement: Integration layer for the future Spiritual Path

The system SHALL expose Growth Workshop data to the future Spiritual Growth Path exclusively through a dedicated integration layer. Direct access to workshop tables from external modules SHALL be forbidden. The integration layer SHALL version its contract and SHALL publish snapshots of workshops, periods, sessions, final statuses, and reports.

#### Scenario: Path consumes via integration layer
- GIVEN the future Path module requests workshop snapshots
- WHEN it invokes the integration layer
- THEN it receives the published contract version's payload

### Requirement: Sensitive data boundary on integration

The integration layer SHALL expose only the data needed by the future Path: workshop identity, period, session count, final status, and report summaries. It SHALL NOT expose administrative notes, internal rejection reasons, attendance rows, or contact data.

#### Scenario: Sensitive fields excluded
- GIVEN the integration layer returns a workshop snapshot
- WHEN the payload is inspected
- THEN final status, period, and session count are present

### Requirement: Protected file byte-identity

The system SHALL NOT modify any protected file from prior phases. All additions SHALL be additive: sibling modules under the talleres namespace, new API routes, new UI pages, and additive schema migrations. A byte-level diff against protected files SHALL be empty after Phase 5 merges.

#### Scenario: Protected files unchanged
- GIVEN the protected file list from prior phases
- WHEN the system is applied
- THEN a byte-for-byte comparison shows zero diff on all protected files