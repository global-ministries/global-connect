# Delta — Dream Team State Machine

## Purpose

Define the service state machine with 6 estados, valid transitions, mandatory motivo per transition, grant lifecycle hooks, and audit logging.

## Requirements

### Requirement: Six states with explicit valid transitions

The system SHALL support 6 estados: `postulado`, `en_orientacion`, `activo`, `en_pausa`, `inactivo`, `retirado`. Valid transitions SHALL follow a forward-only model with limited return. The following matrix SHALL be enforced:

| From → To | postulado | en_orientacion | activo | en_pausa | inactivo | retirado |
|---|---|---|---|---|---|---|
| postulado | — | ✅ | ❌ | ❌ | ❌ | ❌ |
| en_orientacion | ❌ | — | ✅ | ❌ | ❌ | ❌ |
| activo | ❌ | ❌ | — | ✅ | ✅ | ✅ |
| en_pausa | ❌ | ❌ | ✅ | — | ❌ | ✅ |
| inactivo | ✅ | ❌ | ❌ | ❌ | — | ❌ |
| retirado | ❌ | ❌ | ❌ | ❌ | ❌ | — (terminal) |

#### Scenario: Invalid transition rejected
- GIVEN service in `postulado`
- WHEN admin attempts transition to `activo` (skipping `en_orientacion`)
- THEN the system SHALL reject with `invalid_transition` error.

#### Scenario: Pause → active return
- GIVEN service in `en_pausa` with motivo `gdv_liderazgo_removed`
- WHEN admin reactivates to `activo` with motivo `admin_reactivacion`
- THEN transition succeeds
- AND `paused_grants_snapshot` is consumed to re-grant capabilities.

### Requirement: Mandatory motivo per transition

Every transition SHALL require a `motivo` from the closed enum `dream_team_transicion_motivo`: `admin_asignacion`, `admin_promocion`, `admin_pausa`, `admin_reactivacion`, `admin_retiro`, `requisito_vencido`, `gdv_liderazgo_removed`, `auto_pausa`, `otro`. The transition SHALL insert an audit row in `dream_team_estados_historial`.

#### Scenario: GDV leadership loss triggers pause
- GIVEN service in `activo` with source `dream_team:gdv:leader`
- WHEN adapter `dream-team-gdv.ts` detects leadership removal
- THEN service SHALL transition to `en_pausa` with motivo `gdv_liderazgo_removed`
- AND audit row records the adapter as `actor_persona_id` (system).

### Requirement: Grants paused on pause, re-granted on reactivation

On transition `activo → en_pausa`, the system SHALL emit `PlatformGrantAuditEvent` with `decision: 'revoke'` for every capability currently granted and SHALL persist them as `paused_grants_snapshot` (JSONB array of `{ key, scope }`) in the audit row. On transition `en_pausa → activo`, the system SHALL re-grant every capability from the most recent snapshot.

#### Scenario: Pause revokes grants
- GIVEN service with grants `dps.team.serve` and `dream_team.serve`
- WHEN service transitions to `en_pausa`
- THEN two `revoke` events are recorded in grant audit
- AND snapshot `[{ key: 'dps.team.serve', scope: {...} }, { key: 'dream_team.serve', scope: {...} }]` is persisted.

#### Scenario: Reactivation re-grants from snapshot
- GIVEN paused service with snapshot from prior scenario
- WHEN service transitions to `activo`
- THEN two `grant` events restore `dps.team.serve` and `dream_team.serve`
- AND scopes match exactly those in the snapshot.

### Requirement: Reassignment — same role, different scope

When a persona's service role remains the same but the equipo/scope changes, the system SHALL close the current service (`retirado` with motivo `admin_promocion`) and create a new service (`postulado` with motivo `admin_asignacion`). In-place scope mutation SHALL NOT be supported in Fase 2; this behavior SHALL be defined in design.

#### Scenario: Reassignment handled as close + open
- GIVEN Ana serves in DPS/Producción Técnica/Cámara as Voluntario (activo)
- WHEN admin reassigns her to DPS/Música as Voluntario (same role, different equipo)
- THEN Cámara service transitions to `retirado` with motivo `admin_promocion`
- AND a new service is created in Música with initial estado `postulado`.
