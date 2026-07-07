# Delta — Dream Team Metrics Endpoint

## Purpose

Define a read-only metrics endpoint exposing aggregates: active counts, role distribution, and expired requirements. No dashboard widget in Fase 2.

## Requirements

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

### Requirement: Expired requirements exposed without blocking

The `requisitos_vencidos` metric SHALL list every verification row where `estado = 'completado'` AND `fecha_vencimiento < now()`, grouped by persona/equipo/rol. The metric SHALL NOT trigger automatic service state changes. The `requisito_vencido` motivo exists for manual admin use only.

#### Scenario: Expired requirement appears in metrics
- GIVEN Ana's capacitación requirement expired on 2026-08-01 and today is 2026-08-15
- WHEN `getDreamTeamMetrics()` is called
- THEN `requisitos_vencidos` includes Ana, Estudiantes/Transit, Líder de grupo, "capacitación liderazgo", 14 days expired
- AND Ana's service estado remains `activo`.

### Requirement: Metrics gated by capability

Access to `getDreamTeamMetrics()` SHALL require capability `dream_team.metrics.read` with scope `{ experience: 'dream_team', scopeType: 'experience' }`. Without this capability, the endpoint SHALL return empty or denied.

#### Scenario: Unauthorized access denied
- GIVEN a persona without `dream_team.metrics.read`
- WHEN calling metrics endpoint
- THEN the system SHALL deny access
- AND audit records the denial via `PlatformGrantAuditEvent`.
