# Delta — Dream Team Domain

## Purpose

Define the Dream Team service domain: assign a persona to serve in an experience with a team and role, supporting multiple simultaneous services with independent lifecycles and full audit trail.

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

When two admins concurrently edit the same service, the system SHALL apply last-write-wins via a `version` column on `dream_team_servicios`, incremented on every write. Stale writes (version mismatch) SHALL succeed but produce an audit flag for human review. The exact detection mechanism SHALL be defined in design.

#### Scenario: Concurrent edit detected via version
- GIVEN Admin A reads service with `version=3` and Admin B reads same service with `version=3`
- WHEN Admin A writes first (version becomes 4), then Admin B writes with stale `version=3`
- THEN Admin B's write SHALL succeed (last-write-wins)
- AND audit SHALL flag the concurrent edit exposing both writes.
