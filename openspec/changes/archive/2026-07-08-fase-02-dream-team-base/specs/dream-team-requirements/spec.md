# Delta — Dream Team Requirements

## Purpose

Define configurable requirements per team/role with verification tracking, expiration alerts, and no blocking behavior. No UI in Fase 2 — model and endpoint only.

## Requirements

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
