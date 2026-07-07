# Delta — Dream Team Participation Events

## Purpose

Define the `service` event producer for the longitudinal participation ledger, emitting events on state transitions and persisting via Supabase adapter.

## Requirements

### Requirement: Service events emitted on state transitions

The system SHALL emit `PlatformParticipationEvent` with `eventType: 'service'` on every Dream Team state transition. Events SHALL include: `source: 'dream_team'`, `occurredAt`, `scope: { experience, scopeType, scopeId }`, and `actorPersonaId`. Event sub-types SHALL be carried in event payload: `service_assigned`, `service_state_changed`, `service_paused_grants_snapshot`, `service_reactivated`, `service_retired`.

#### Scenario: Service activation emits event
- GIVEN service transitions `en_orientacion → activo`
- WHEN participation event is emitted
- THEN event type is `service`, sensitivity `internal`, retention 365-1095 days
- AND payload includes `subType: 'service_state_changed'`, `estado_anterior: 'en_orientacion'`, `estado_nuevo: 'activo'`.

#### Scenario: Pause with grant snapshot emits event
- GIVEN service transitions `activo → en_pausa`
- WHEN participation event is emitted
- THEN event payload includes `subType: 'service_paused_grants_snapshot'` with the snapshot JSON.

### Requirement: Real Supabase adapter writes to dream_team_participation_eventos

The system SHALL implement a Supabase-backed adapter that satisfies `PlatformParticipationReadRepository`. It SHALL write rows to `dream_team_participation_eventos` with columns: `persona_id`, `experience_key`, `scope_type`, `scope_id`, `event_type`, `occurred_at`, `payload` (JSONB). The read side SHALL support `findEventsByActorPersonaId` and `findEventsByScope`.

#### Scenario: Event persisted and readable
- GIVEN a service state change event is emitted for Ana
- WHEN `findEventsByActorPersonaId(ana.personaId)` is called
- THEN the event is returned with all fields
- AND `canReadPlatformParticipationEvent()` gate is applied before exposing.

### Requirement: Read gate applies sensitivity and scope rules

The existing `canReadPlatformParticipationEvent()` guard SHALL apply to `service` events: self-access allowed, scoped capabilities allow per-experience reading, sensitive events require explicit capability. `service` events have sensitivity `internal` — visible to scoped capabilities but not publicly.

#### Scenario: Director reads Ana's service history
- GIVEN director has `dream_team.metrics.read` capability with scope `experience: dream_team`
- WHEN they query Ana's participation events
- THEN `canReadPlatformParticipationEvent()` allows via `scoped_capability`
- AND only events within Ana's scope are returned.
