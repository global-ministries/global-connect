# Delta — Dream Team Capabilities and Grants

## Purpose

Define the hybrid capability model (generic + domain-specific), grant lifecycle tied to service state, and audit contract via `lib/platform/grants.ts`.

## Requirements

### Requirement: Hybrid capability model — generic + specific

The system SHALL extend `PLATFORM_CAPABILITIES` with two families. Generic capabilities SHALL use `experience: 'dream_team'` (new entry in `PLATFORM_EXPERIENCE_CATALOG` with `scopeTypes: ['experience', 'equipo']`). Domain-specific capabilities SHALL use their concrete experience. The adapter `dream-team.ts` SHALL produce both families per service.

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

All grant/revoke operations SHALL use `createPlatformGrantAudit().logger.record(event)`. The system SHALL record: `actorPersonaId`, `source: 'dream_team'`, `decision`, `scope`, `before`/`after` state snapshots, and `reason` when applicable. The `metrics` accumulator SHALL track per-experience grant/revoke counts.

#### Scenario: Revoke with reason
- GIVEN service transitions `activo → en_pausa` with motivo `admin_pausa`
- WHEN grant audit is emitted
- THEN event includes `reason: 'admin_pausa'`, `before: { active: true, capabilityKey: 'dps.team.serve' }`, `after: { active: false }`.
