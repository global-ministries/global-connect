# Spec: Dream Team

## Purpose

Define the Dream Team service domain: assign a persona to serve in an experience with a team and role, supporting multiple simultaneous services with independent lifecycles, configurable requirements with verification tracking, hybrid capability model, full audit trail via grants and participation events, and metrics endpoint.

---

## Requirements

### Requirement: Service as (persona, equipo, rol) triple

The system SHALL represent each service as a row in `dream_team_servicios` with FK to `usuarios.id` (persona canónica), FK to `dream_team_roles` (which references `dream_team_equipos` → experience), estado, fechas, and audit metadata. A persona SHALL hold multiple simultaneous services across different experiences. Each active service SHALL produce capabilities scoped to its experience/team.

#### Scenario: Two simultaneous services
- GIVEN Ana exists as persona
- WHEN assigned to DPS/Producción Técnica/Cámara as Voluntario AND Estudiantes/Transit as Líder
- THEN both services coexist independently in `dream_team_servicios`
- AND each produces its own `PlatformSessionCapability[]` entries with distinct scopes.

#### Scenario: Service for persona without auth account
- GIVEN a persona has no linked `auth_id`
- WHEN assigned to a service
- THEN the service references `usuarios.id` (persona canónica)
- AND SHALL NOT require auth account creation.

### Requirement: State changes with mandatory motivo and audit

Every state transition SHALL require a motivo from `dream_team_transicion_motivo`. Each transition SHALL insert a row in `dream_team_estados_historial` with `estado_anterior`, `estado_nuevo`, `motivo`, `actor_persona_id`, `paused_grants_snapshot` (nullable JSONB), and `created_at`. Transitions without motivo SHALL be rejected.

#### Scenario: Transition without motive rejected
- GIVEN a service in estado `activo`
- WHEN an admin attempts transition to `en_pausa` with `motivo` null or empty
- THEN the system SHALL reject with error.

#### Scenario: Complete audit trail across lifecycle
- GIVEN service transitions `postulado → en_orientacion → activo → en_pausa → activo → retirado`
- WHEN audit history is queried by `servicio_id`
- THEN 5 rows exist in `dream_team_estados_historial`
- AND each row records `actor_persona_id`, `motivo`, and timestamp.

### Requirement: History preserved on pause and retire

When a service enters `en_pausa` or `retirado`, all historical rows in `dream_team_estados_historial` and `dream_team_requisitos_verificacion` SHALL remain queryable. The service row SHALL NOT be deleted. A persona with zero active services SHALL preserve full historical record.

#### Scenario: Persona with zero active services
- GIVEN a persona's last active service transitions to `retirado`
- WHEN querying that persona's Dream Team history
- THEN all prior services, transitions, and requirement verifications remain accessible.

### Requirement: Concurrency — last-write-wins with audit detection

When two admins concurrently edit the same service, the system SHALL apply last-write-wins via a `version` column on `dream_team_servicios`, incremented on every write. Stale writes (version mismatch) SHALL succeed but produce an audit flag for human review.

#### Scenario: Concurrent edit detected via version
- GIVEN Admin A reads service with `version=3` and Admin B reads same service with `version=3`
- WHEN Admin A writes first (version becomes 4), then Admin B writes with stale `version=3`
- THEN Admin B's write SHALL succeed (last-write-wins)
- AND audit SHALL flag the concurrent edit exposing both writes.

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

When a persona's service role remains the same but the equipo/scope changes, the system SHALL close the current service (`retirado` with motivo `admin_promocion`) and create a new service (`postulado` with motivo `admin_asignacion`). In-place scope mutation SHALL NOT be supported in Fase 2.

#### Scenario: Reassignment handled as close + open
- GIVEN Ana serves in DPS/Producción Técnica/Cámara as Voluntario (activo)
- WHEN admin reassigns her to DPS/Música as Voluntario (same role, different equipo)
- THEN Cámara service transitions to `retirado` with motivo `admin_promocion`
- AND a new service is created in Música with initial estado `postulado`.

### Requirement: Requirements configurable by equipo and rol

The system SHALL store requirements in `dream_team_requisitos` with FK to `dream_team_roles`. Each requirement SHALL have: `codigo` (unique per rol), `label`, `tipo` (documento | capacitacion | entrevista | firma | otro), and `obligatoriedad` (requerido | opcional | no_aplica). Requirements SHALL be activable/inactivable via `activo` boolean.

#### Scenario: Role with three requirements
- GIVEN rol "Líder de grupo" configured with: política firmada (requerido, documento), capacitación liderazgo (requerido, capacitacion), entrevista pastoral (opcional, entrevista)
- WHEN a persona is assigned to that rol
- THEN three rows are created in `dream_team_requisitos_verificacion` — one per requirement, all in `pendiente`.

### Requirement: Verification tracks state, date, and verifier

Each verification row in `dream_team_requisitos_verificacion` SHALL track: `estado` (pendiente | completado | vencido | no_aplica), `fecha_verificacion` (nullable), `verificado_por_persona_id` (nullable), `fecha_vencimiento` (nullable, only meaningful when `obligatoriedad = requerido`), and audit `created_at`/`updated_at`.

#### Scenario: Requirement verified with expiration
- GIVEN requirement "capacitación liderazgo" has `fecha_vencimiento: 2026-08-01`
- WHEN admin verifies it on 2026-06-15
- THEN estado becomes `completado`, `fecha_verificacion = 2026-06-15`
- AND after 2026-08-01, a metric query SHALL expose it as `vencido`.

### Requirement: Expired requirements alert without blocking

The system SHALL expose expired requirements via the metrics endpoint (`getDreamTeamMetrics().requisitos_vencidos`). Expiration SHALL NOT automatically pause or terminate a service. The `requisito_vencido` motivo exists for manual admin transition but SHALL NOT be auto-triggered.

#### Scenario: Expired requirement does not pause service
- GIVEN Ana's capacitación requirement expires while her service is `activo`
- WHEN the system evaluates her service state
- THEN her service remains `activo`
- AND `getDreamTeamMetrics()` includes her expired requirement in its count.

#### Scenario: No verification for no_aplica requirements
- GIVEN a requirement configured with `obligatoriedad: no_aplica`
- WHEN a persona is assigned to that rol
- THEN the verification row is created with `estado: no_aplica`
- AND the requirement SHALL NOT appear in expired-requirement metrics.

### Requirement: Hybrid capability model — generic + specific

The system SHALL extend `PLATFORM_CAPABILITIES` with two families. Generic capabilities SHALL use `experience: 'dream_team'` (new entry in `PLATFORM_EXPERIENCE_CATALOG` with `scopeTypes: ['experience', 'equipo']`). Domain-specific capabilities SHALL use their concrete experience. The adapter SHALL produce both families per service.

| Capability | Experience | ScopeType | Phase |
|---|---|---|---|
| `dream_team.serve` | dream_team | experience | New |
| `dream_team.lead` | dream_team | equipo | New |
| `dream_team.coordinate` | dream_team | equipo | New |
| `dream_team.director.coordinate` | dream_team | experience | New |
| `dream_team.requirements.manage` | dream_team | equipo | New |
| `dream_team.metrics.read` | dream_team | experience | New |
| `dream_team.gdv.lead` | grupos_vida | grupo | New |
| `dps.team.serve` | dps | equipo | Existing (backend) |
| `dps.team.lead` | dps | equipo | New |
| `dps.team.director` | dps | equipo | New |
| `estudiantes.team.serve` | estudiantes | equipo | New |
| `estudiantes.team.lead` | estudiantes | equipo | New |
| `talleres_crecimiento.team.serve` | talleres_crecimiento | taller | New |
| `ninos.team.serve` | ninos | salon | New |
| `the_living_room.team.serve` | the_living_room | experience | New |

#### Scenario: Ana receives both families
- GIVEN Ana serves in DPS/Cámara (activo) and Estudiantes/Transit (activo, líder)
- WHEN adapter resolves her session capabilities
- THEN she receives `dream_team.serve` (experience), `dream_team.lead` (equipo:estudiantes:transit), `dps.team.serve` (equipo:dps:produccion-tecnica), `estudiantes.team.lead` (equipo:estudiantes:transit)
- AND all 4 pass `resolvePlatformCapability()` without `conflicting_scope`.

### Requirement: Grants granted on activation, revoked on pause

On service transition to `activo`, the system SHALL emit `PlatformGrantAuditEvent` with `decision: 'grant'` for every applicable capability. On transition to `en_pausa`, it SHALL emit `revoke` for every currently-granted capability and persist `paused_grants_snapshot` in the audit row.

#### Scenario: Grant audit on activation
- GIVEN service transitions `en_orientacion → activo`
- WHEN grant audit is emitted
- THEN `logger.record()` is called with `decision: 'grant'`, `source: 'dream_team'`, scope matching the service equipo.
- AND `metrics.recordGrant('dps', 'dream_team')` increments.

### Requirement: Grant audit contract via grants.ts

All grant/revoke operations SHALL use `createPlatformGrantAudit().logger.record(event)`. The system SHALL record: `actorPersonaId`, `source: 'dream_team'`, `decision`, `scope`, `before`/`after` state snapshots, and `reason` when applicable.

#### Scenario: Revoke with reason
- GIVEN service transitions `activo → en_pausa` with motivo `admin_pausa`
- WHEN grant audit is emitted
- THEN event includes `reason: 'admin_pausa'`, `before: { active: true, capabilityKey: 'dps.team.serve' }`, `after: { active: false }`.

### Requirement: Separate adapter reads grupo_miembros for leaders

The system SHALL implement `lib/platform/adapters/dream-team-gdv.ts` as a read-only adapter. It SHALL read `grupo_miembros` filtering by liderazgo roles. For each active leader membership, it SHALL produce a `PlatformSessionCapability` with key `dream_team.gdv.lead` and scope `{ experience: 'grupos_vida', scopeType: 'grupo', scopeId: grupoId }`. The adapter SHALL NOT modify existing GDV adapter, RPCs, or RLS policies.

#### Scenario: GDV group leader recognized as Dream Team
- GIVEN persona with active `grupo_miembros` row where `tipo_lider` indicates leadership
- WHEN adapter resolves
- THEN capability `dream_team.gdv.lead` is produced with scope grupo
- AND the existing GDV adapter continues to produce `grupos_vida.stage.read` for directores de etapa independently.

### Requirement: Leadership loss detected as pausa event

The adapter SHALL compare current leadership memberships against previous state. When a leadership membership is removed, the adapter SHALL emit a `gdv_liderazgo_removed` event. The Dream Team domain layer SHALL consume this event and transition the corresponding service to `en_pausa` with motivo `gdv_liderazgo_removed`.

#### Scenario: Leader removed from grupo_miembros
- GIVEN persona was líder of grupo X, producing `dream_team.gdv.lead`
- WHEN their leadership row is removed from `grupo_miembros`
- THEN adapter emits `gdv_liderazgo_removed` event
- AND their Dream Team service transitions to `en_pausa`
- AND their regular group membership (if still present) is unaffected.

### Requirement: GDV membership and Dream Team leadership are independent

A persona SHALL be able to be a regular member of a GDV group WITHOUT receiving `dream_team.gdv.lead`. The adapter SHALL only map rows where the membership role indicates leadership. A director de etapa who is also a leader SHALL receive BOTH `grupos_vida.stage.read` AND `dream_team.gdv.lead`.

#### Scenario: Regular member not treated as Dream Team
- GIVEN persona is a regular member of a GDV group (no liderazgo role)
- WHEN adapter resolves
- THEN `dream_team.gdv.lead` is NOT produced
- AND only the existing GDV membership context applies.

### Requirement: Read-only endpoint returns four aggregates

The system SHALL expose `getDreamTeamMetrics()` as a pure function or HTTP endpoint. It SHALL return:

| Metric | Description |
|---|---|
| `servicios_por_experiencia_equipo` | Active service count grouped by experience and equipo |
| `servicios_por_estado` | Count per estado across all services |
| `distribucion_roles` | Active service count grouped by rol label |
| `requisitos_vencidos` | List of expired requirement verifications with persona, equipo, rol, and days expired |

#### Scenario: Metrics reflect Ana's two services
- GIVEN Ana has active services in DPS/Cámara and Estudiantes/Transit
- WHEN `getDreamTeamMetrics()` is called
- THEN `servicios_por_experiencia_equipo` shows 1 for `dps:produccion-tecnica` and 1 for `estudiantes:transit`
- AND `distribucion_roles` shows 1 Voluntario, 1 Líder de grupo.

### Requirement: Metrics gated by capability

Access to `getDreamTeamMetrics()` SHALL require capability `dream_team.metrics.read` with scope `{ experience: 'dream_team', scopeType: 'experience' }`. Without this capability, the endpoint SHALL return empty or denied.

#### Scenario: Unauthorized access denied
- GIVEN a persona without `dream_team.metrics.read`
- WHEN calling metrics endpoint
- THEN the system SHALL deny access
- AND audit records the denial via `PlatformGrantAuditEvent`.

### Requirement: Service events emitted on state transitions

The system SHALL emit `PlatformParticipationEvent` with `eventType: 'service'` on every Dream Team state transition. Events SHALL include: `source: 'dream_team'`, `occurredAt`, `scope: { experience, scopeType, scopeId }`, and `actorPersonaId`. Event sub-types: `service_assigned`, `service_state_changed`, `service_paused_grants_snapshot`, `service_reactivated`, `service_retired`.

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

The system SHALL implement a Supabase-backed adapter that satisfies `PlatformParticipationReadRepository`. It SHALL write rows to `dream_team_participation_eventos` with columns: `persona_id`, `experience_key`, `scope_type`, `scope_id`, `event_type`, `occurred_at`, `payload` (JSONB).

#### Scenario: Event persisted and readable
- GIVEN a service state change event is emitted for Ana
- WHEN `findEventsByActorPersonaId(ana.personaId)` is called
- THEN the event is returned with all fields
- AND `canReadPlatformParticipationEvent()` gate is applied before exposing.

### Requirement: Read gate applies sensitivity and scope rules

The existing `canReadPlatformParticipationEvent()` guard SHALL apply to `service` events: self-access allowed, scoped capabilities allow per-experience reading, sensitive events require explicit capability. `service` events have sensitivity `internal`.

#### Scenario: Director reads Ana's service history
- GIVEN director has `dream_team.metrics.read` capability with scope `experience: dream_team`
- WHEN they query Ana's participation events
- THEN `canReadPlatformParticipationEvent()` allows via `scoped_capability`
- AND only events within Ana's scope are returned.
