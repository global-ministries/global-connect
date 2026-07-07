# Tasks: Fase 2 — Dream Team Global Base

> **Change**: `fase-02-dream-team-base`
> **Status**: pending
> **Plan**: 10 slices encadenados stacked-to-main (force-chained)
> **Delivery**: force-chained, chain strategy stacked-to-main, strict TDD

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,750 (prod + test + migration) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 → PR8 → PR9 → PR10 |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| S1 | Foundation pura (types, errors, state-machine) | PR1 | Sin DB; 100% unit tests |
| S2 | Capabilities + experiences catalog | PR2 | Extensión aditiva de Fase 1; depende S1 |
| S3 | Repository interfaces + fake in-memory | PR3 | Contratos + factory para tests; depende S1 |
| S4 | Supabase repository + migración SQL | PR4 | `size:exception` (~650 líneas); depende S3 |
| S5 | GDV adapter (líderes como Dream Team) | PR5 | Read-only, sin tocar adapter existente; depende S3 |
| S6 | Servicios API routes (CRUD completo) | PR6 | Gated por capability; depende S4 |
| S7 | Grants orchestrator + audit lifecycle | PR7 | Consume `lib/platform/grants.ts`; depende S4 + S6 |
| S8 | Métricas puras + endpoint HTTP | PR8 | 4 agregados; depende S4 |
| S9 | Participation events writer (Supabase) | PR9 | Writer real para `service`; depende S4 + S7 |
| S10 | Rollout flag + integration final + docs | PR10 | Staged rollout; depende S8 + S9 |

---

## Slice S1: Foundation Pura

**PR target**: PR #1 stacked-to-main
**Depends on**: none
**Estimated lines**: ~300 (150 prod / 150 test)
**PR budget**: ok

### Tasks

- [x] 1.1 DT-001 — Definir tipos compartidos en `lib/platform/dream-team/types.ts`: `DreamTeamEstado` (6 valores), `DreamTeamMotivo` (10 valores), `PersonaId`, `DreamTeamEquipo`, `DreamTeamRol`, `DreamTeamServicio`, `DreamTeamTransicionInput`, `DreamTeamTransicionResult`. Archivos: `lib/platform/dream-team/types.ts`. Verificación: `pnpm typecheck`.
- [x] 1.2 DT-002 — Definir errores tipados en `lib/platform/dream-team/errors.ts`: `DreamTeamErrorCode` union, `DreamTeamError` interface, `dreamTeamError()` factory, helpers tipados por code, `TERMINAL_ESTADOS`. Archivos: `lib/platform/dream-team/errors.ts`. Test: `__tests__/lib/platform/dream-team/errors.test.ts`. Verificación: `pnpm test --testPathPatterns=dream-team/errors`.
- [x] 1.3 DT-003 — Implementar state machine en `lib/platform/dream-team/state-machine.ts`: `TRANSICIONES_VALIDAS` matriz, `transition(input)` → discriminated union. Forward-only con retorno limitado (`en_pausa → activo`, `inactivo → postulado`). Motivo obligatorio siempre. Archivos: `lib/platform/dream-team/state-machine.ts`. Test: `__tests__/lib/platform/dream-team/state-machine.test.ts`. Verificación: `pnpm test --testPathPatterns=dream-team/state-machine`.
- [x] 1.4 DT-004 — Tests de state machine: transiciones válidas/inválidas, self-transition, `retirado` terminal, motivo obligatorio, motivo fuera de enum, version +1, `fechaFin` en retiro, caso Ana. Archivos: `__tests__/lib/platform/dream-team/state-machine.test.ts`. Verificación: `pnpm test --testPathPatterns=dream-team/state-machine` — todos verdes.
- [x] 1.5 DT-005 — Tests de error factories: `dreamTeamError()` retorna discriminated union, helpers tipados hacen narrowing, `TERMINAL_ESTADOS` solo `retirado`. Archivos: `__tests__/lib/platform/dream-team/errors.test.ts`. Verificación: `pnpm test --testPathPatterns=dream-team/errors` — todos verdes.

## Slice S2: Capabilities + Experiences

**PR target**: PR #2 stacked-to-main
**Depends on**: S1
**Estimated lines**: ~150 (25 prod / 125 test)
**PR budget**: ok

### Tasks

- [x] 2.1 DT-006 — Agregar `dream_team` a `PLATFORM_EXPERIENCE_CATALOG` en `lib/platform/experiences.ts`: `{ label: 'Dream Team', scopeTypes: ['experience', 'equipo'] }`. Extensión aditiva, sin tocar las 7 experiencias existentes. Archivos: `lib/platform/experiences.ts`. Test: `__tests__/lib/platform/experiences.test.ts`. Verificación: `pnpm test -- --testPathPattern=experiences` — tests Fase 1 siguen verdes.
- [x] 2.2 DT-007 — Agregar 15 capabilities a `PLATFORM_CAPABILITIES` en `lib/platform/experiences.ts`: 7 genéricas (`dream_team.serve`, `dream_team.lead`, `dream_team.coordinate`, `dream_team.director.coordinate`, `dream_team.requirements.manage`, `dream_team.metrics.read`, `dream_team.gdv.lead`) + 8 específicas (`dps.team.serve` existente con backend, `dps.team.lead`, `dps.team.director`, `estudiantes.team.serve`, `estudiantes.team.lead`, `talleres_crecimiento.team.serve`, `ninos.team.serve`, `the_living_room.team.serve`). Archivos: `lib/platform/experiences.ts`. Test: `__tests__/lib/platform/experiences.test.ts`. Verificación: `pnpm test -- --testPathPattern=experiences`.
- [x] 2.3 DT-008 — Tests de resolve con capabilities nuevas: `resolvePlatformCapability` resuelve `dream_team.serve` con `experience: 'dream_team'` sin `conflicting_scope`; resuelve `dps.team.serve` con `experience: 'dps'`; capability desconocida retorna `unknown_capability`; modelo híbrido Ana (4 capabilities, 0 conflictos). Archivos: `__tests__/lib/platform/experiences.test.ts`. Verificación: `pnpm test -- --testPathPattern=experiences` — todos verdes.

## Slice S3: Repository Interfaces + Fake

**PR target**: PR #3 stacked-to-main
**Depends on**: S1
**Estimated lines**: ~400 (200 prod / 200 test)
**PR budget**: ok (justo al límite)

### Tasks

- [x] 3.1 DT-009 — Definir interface `DreamTeamRepository` en `lib/platform/dream-team/repository.ts`: métodos read+write para equipos, roles, servicios (con `expectedVersion`), requisitos, verificaciones, historial, participation events, y métricas. Incluir `DreamTeamGdvMembershipReader` y `DreamTeamParticipationEventWriter` como interfaces separadas. Archivos: `lib/platform/dream-team/repository.ts`. Test: N/A (interface-only). Verificación: `pnpm typecheck`.
- [x] 3.2 DT-010 — Implementar `createInMemoryDreamTeamRepository()` en `lib/platform/dream-team/repository-fake.ts`: implementación in-memory completa de `DreamTeamRepository` con arrays mutables, version tracking, y factory con seed opcional. Archivos: `lib/platform/dream-team/repository-fake.ts`. Test: `__tests__/lib/platform/dream-team/repository-fake.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/repository-fake`.
- [x] 3.3 DT-011 — Tests del fake repository: CRUD servicios (insert, get, list by persona, list by equipo), version increment on update, `updateServicioEstado` con `expectedVersion` mismatch retorna `version_conflict`, historial append+list, requisitos upsert+list, participation events append+list, métricas count. Archivos: `__tests__/lib/platform/dream-team/repository-fake.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/repository-fake` — todos verdes.

## Slice S4: Supabase Repository + Migración

**PR target**: PR #4 stacked-to-main
**Depends on**: S3
**Estimated lines**: ~650 (250 prod / 200 test / 200 SQL)
**PR budget**: size:exception — migración SQL (7 tablas + 5 enums + RLS + índices) + repository Supabase + integration tests exceden 400 líneas; justificado por ser el único slice con DB.

### Tasks

- [x] 4.1 DT-012 — Crear migración SQL `supabase/migrations/20260707183000_dream_team_base.sql`: 5 enums (`enum_dream_team_estado`, `enum_dream_team_requisito_tipo`, `enum_dream_team_requisito_obligatoriedad`, `enum_dream_team_requisito_estado`, `enum_dream_team_transicion_motivo`), 7 tablas (`dream_team_equipos`, `dream_team_roles`, `dream_team_servicios` con `version` column, `dream_team_requisitos`, `dream_team_requisitos_verificacion`, `dream_team_estados_historial` con `paused_grants_snapshot` JSONB, `dream_team_participation_eventos`), helper Postgres `auth_has_dream_team_capability(text)`, tabla `dream_team_capability_grants`, RLS policies, índices. Solo `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/`CREATE POLICY` — cero `DROP`/`ALTER` a tablas existentes. Archivos: `supabase/migrations/20260707183000_dream_team_base.sql`. Test: N/A (SQL artifact). Verificación: revisión manual del SQL.
- [x] 4.2 DT-013 — Aplicar migración a `supabase_global_staging` vía MCP tool `supabase_global_staging_apply_migration`. Migración aplicada en sesión previa; validado que 8 tablas `dream_team_*` + 5 enums existen en `supabase_global_staging` (`ebwtdjtajclzciwipevw.supabase.co`), helper `auth_has_dream_team_capability` y 20 RLS policies presentes. Archivos: N/A (operación MCP). Verificación: `supabase_global_staging_list_tables` muestra `dream_team_*`; types regenerados en `lib/supabase/database.types.ts`.
- [x] 4.3 DT-014 — Implementar `createSupabaseDreamTeamRepository()` en `lib/platform/dream-team/repository-supabase.ts`: mapea cada método de `DreamTeamRepository` a queries Supabase. `updateServicio` usa `WHERE version = expectedVersion` + increment. Archivos: `lib/platform/dream-team/repository-supabase.ts`. Test: `__tests__/lib/platform/dream-team/repository-supabase.test.ts`. Verificación: `pnpm typecheck`.
- [x] 4.4 DT-015 — Integration tests contra staging (tag `integration:supabase`, skipped sin `RUN_INTEGRATION` + credenciales staging): CRUD servicios round-trip, version conflict detection, historial queries, caso Ana. Test isolation por `persona_id` random UUID. Archivos: `__tests__/lib/platform/dream-team/repository-supabase.test.ts` actualizado para usar `SUPABASE_STAGING_URL`/`SUPABASE_STAGING_SERVICE_ROLE_KEY`. Verificación: `pnpm test` pasa (734 verdes, 20 integration skipped por env); `RUN_INTEGRATION=1 pnpm exec jest --testPathPatterns='dream-team/repository-supabase'` requiere credenciales de staging (no disponibles en el worktree).
- [x] 4.5 DT-016 — Documentar `size:exception` en PR body: justificación (~650 líneas por migración SQL aditiva + repository + tests), tabla de líneas por archivo, confirmación de 0 cambios destructivos. Archivos: PR description. Verificación: review approval con `size:exception` label.

## Slice S5: GDV Adapter

**PR target**: PR #5 stacked-to-main
**Depends on**: S3
**Estimated lines**: ~360 (180 prod / 180 test)
**PR budget**: ok

### Tasks

- [x] 5.1 DT-017 — Implementar `resolveDreamTeamGdvPlatformContext(input)` en `lib/platform/adapters/dream-team-gdv.ts`: `DreamTeamGdvAdapterInput` con `session` + `DreamTeamGdvMembershipReader`, produce `{ ok, contexts[], capabilities[], audit }` con capability `dream_team.gdv.lead` scope `{ experience: 'grupos_vida', scopeType: 'grupo', scopeId }`. Detecta leadership loss comparando memberships actuales vs previas. Archivos: `lib/platform/adapters/dream-team-gdv.ts`. Test: `__tests__/lib/platform/dream-team-gdv-adapter.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team-gdv`.
- [x] 5.2 DT-018 — Tests del GDV adapter: líder de grupo produce `dream_team.gdv.lead`; miembro regular NO produce capability; director de etapa recibe AMBAS capabilities (`grupos_vida.stage.read` + `dream_team.gdv.lead`); leadership removal emite evento `gdv_liderazgo_removed`; cero bytes cambiados en `lib/platform/adapters/grupos-vida.ts`. Archivos: `__tests__/lib/platform/dream-team-gdv-adapter.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team-gdv` — todos verdes; `git diff lib/platform/adapters/grupos-vida.ts` = 0 bytes.

## Slice S6: Servicios API Routes

**PR target**: PR #6 stacked-to-main
**Depends on**: S4
**Estimated lines**: ~400 (200 prod / 200 test)
**PR budget**: ok (justo al límite)

### Tasks

- [x] 6.1 DT-019 — Implementar `GET /api/dream-team/servicios` en `app/api/dream-team/servicios/route.ts`: listar servicios filtrados por query params (`personaId`, `equipoId`, `estado`), gated por capability `dream_team.requirements.manage` o `dream_team.metrics.read`. Archivos: `app/api/dream-team/servicios/route.ts`. Test: `__tests__/app/api/dream-team/servicios.test.ts`. Verificación: `pnpm test -- --testPathPattern=api/dream-team/servicios`.
- [x] 6.2 DT-020 — Implementar `POST /api/dream-team/servicios` en `app/api/dream-team/servicios/route.ts`: asignar servicio (estado inicial `postulado`), valida input, crea verificaciones de requisitos en `pendiente`, inserta historial. Gated por `dream_team.requirements.manage`. Archivos: `app/api/dream-team/servicios/route.ts`. Test: `__tests__/app/api/dream-team/servicios.test.ts`. Verificación: `pnpm test -- --testPathPattern=api/dream-team/servicios`.
- [x] 6.3 DT-021 — Implementar `GET/PATCH /api/dream-team/servicios/[id]/route.ts`: GET retorna servicio + historial + verificaciones; PATCH aplica transición de estado vía `validateDreamTeamTransition` + `updateServicioEstado` con version check (409 on conflict). Gated por capability. Archivos: `app/api/dream-team/servicios/[id]/route.ts`. Test: `__tests__/app/api/dream-team/servicios-id.test.ts`. Verificación: `pnpm test -- --testPathPattern=api/dream-team/servicios-id`.
- [x] 6.4 DT-022 — Tests de API routes: GET lista filtrado, POST asigna con estado postulado + historial, PATCH transición válida succeed, PATCH transición inválida retorna 400, PATCH version conflict retorna 409, sin capability retorna 403, flag OFF retorna 404. Archivos: `__tests__/app/api/dream-team/servicios.test.ts`, `__tests__/app/api/dream-team/servicios-id.test.ts`. Verificación: `pnpm test -- --testPathPattern=api/dream-team` — todos verdes.

## Slice S7: Grants Orchestrator + Audit

**PR target**: PR #7 stacked-to-main
**Depends on**: S4, S6
**Estimated lines**: ~380 (180 prod / 200 test)
**PR budget**: ok

### Tasks

- [x] 7.1 DT-023 — Implementar `lib/platform/dream-team/grants.ts`: `applyGrantsForTransition(ctx)` decide grant/revoke según estado nuevo, `serializePausedGrantsSnapshot(grants[])` → JSONB, `restoreFromSnapshot(snapshot)` → grant events. Consume `createPlatformGrantAudit()` de `lib/platform/grants.ts` sin modificarlo. Archivos: `lib/platform/dream-team/grants.ts`. Test: `__tests__/lib/platform/dream-team/grants.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/grants`.
- [x] 7.2 DT-024 — Integrar grants orchestrator en flujo de transición: `transitionServicio` llama `applyGrantsForTransition` cuando estado nuevo es `activo` (grant) o `en_pausa` (revoke+snapshot). Reactivación desde pausa consume snapshot. Archivos: `lib/platform/dream-team/servicios.ts`. Test: `__tests__/lib/platform/dream-team/grants.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/grants`.
- [x] 7.3 DT-025 — Tests del grants orchestrator: activación emite grant events con `source: 'dream_team'`; pausa emite revoke events + snapshot persistido; reactivación re-grants desde snapshot (mismas keys, mismos scopes); métricas incrementan por experiencia; `lib/platform/grants.ts` sin cambios (0 bytes diff). Archivos: `__tests__/lib/platform/dream-team/grants.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/grants` — todos verdes; `git diff lib/platform/grants.ts` = 0 bytes.

## Slice S8: Métricas + Endpoint

**PR target**: PR #8 stacked-to-main
**Depends on**: S4
**Estimated lines**: ~300 (150 prod / 150 test)
**PR budget**: ok

### Tasks

- [x] 8.1 DT-026 — Implementar `getDreamTeamMetrics(reader)` en `lib/platform/dream-team/metrics.ts`: función pura que retorna `DreamTeamMetrics` con 4 campos (`servicios_por_experiencia_equipo`, `servicios_por_estado`, `distribucion_roles`, `requisitos_vencidos`). Archivos: `lib/platform/dream-team/metrics.ts`. Test: `__tests__/lib/platform/dream-team/metrics.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/metrics`.
- [x] 8.2 DT-027 — Implementar `GET /api/dream-team/metrics/route.ts`: endpoint autenticado, gating por capability `dream_team.metrics.read`, retorna JSON con las 4 métricas. Sin capability → 403 + audit deny. Archivos: `app/api/dream-team/metrics/route.ts`. Test: `__tests__/app/api/dream-team/metrics.test.ts`. Verificación: `pnpm test -- --testPathPattern=api/dream-team/metrics`.
- [x] 8.3 DT-028 — Tests de métricas: función pura retorna 4 agregados correctos con fake repo; caso Ana (2 servicios activos, distribución roles); requisitos vencidos listados sin bloquear servicio; endpoint gated (403 sin capability, 200 con capability). Archivos: `__tests__/lib/platform/dream-team/metrics.test.ts`, `__tests__/app/api/dream-team/metrics.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/metrics` — todos verdes.

## Slice S9: Participation Events Writer

**PR target**: PR #9 stacked-to-main
**Depends on**: S4, S7
**Estimated lines**: ~400 (200 prod / 200 test)
**PR budget**: ok (justo al límite)

### Tasks

- [ ] 9.1 DT-029 — Extender `lib/platform/adapters/participation-adapter.ts` con `DreamTeamParticipationSupabaseWriter`: implementa write side de `PlatformParticipationReadRepository` para eventos `service`, persiste en `dream_team_participation_eventos`. `ParticipationInMemoryAdapter` intacto para los 6 tipos no-service. Archivos: `lib/platform/adapters/participation-adapter.ts`. Test: `__tests__/lib/platform/dream-team/participation-writer.test.ts`. Verificación: `pnpm test -- --testPathPattern=participation-writer`.
- [ ] 9.2 DT-030 — Integrar participation writer con state machine: `transitionServicio` emite `PlatformParticipationEvent` tipo `service` con sub-types (`service_assigned`, `service_state_changed`, `service_paused_grants_snapshot`, `service_reactivated`, `service_retired`), sensitivity `internal`, retention 365-1095 días. Archivos: `lib/platform/dream-team/servicios.ts`. Test: `__tests__/lib/platform/dream-team/participation-writer.test.ts`. Verificación: `pnpm test -- --testPathPattern=participation-writer`.
- [ ] 9.3 DT-031 — Tests del participation writer: activación emite `service_state_changed`; pausa emite `service_paused_grants_snapshot` con JSON; reactivación emite `service_reactivated`; retiro emite `service_retired`; read side `findEventsByActorPersonaId` retorna eventos; `canReadPlatformParticipationEvent` gate aplica; `ParticipationInMemoryAdapter` sin cambios. Archivos: `__tests__/lib/platform/dream-team/participation-writer.test.ts`. Verificación: `pnpm test -- --testPathPattern=participation-writer` — todos verdes.

## Slice S10: Rollout Flag + Integration Final

**PR target**: PR #10 stacked-to-main
**Depends on**: S8, S9
**Estimated lines**: ~160 (80 prod / 80 test)
**PR budget**: ok

### Tasks

- [ ] 10.1 DT-032 — Extender `lib/platform/flags.ts` con `getDreamTeamFlags()`: retorna `{ enabled, killSwitch }` desde `NEXT_PUBLIC_DREAM_TEAM_ENABLED`. Default `off`. Integrar en API routes de S6/S8 (404 si flag OFF). Archivos: `lib/platform/flags.ts`. Test: `__tests__/lib/platform/flags.test.ts`. Verificación: `pnpm test -- --testPathPattern=flags`.
- [ ] 10.2 DT-033 — Integration test caso Ana end-to-end: asignación DPS+Cámara (postulado), promoción a activo (grants emitidos), segundo servicio Estudiantes+Transit (activo), pausa DPS (grants revoked + snapshot), capacitación vencida (alerta sin bloqueo), reactivación DPS (grants restaurados), métricas reflejan estado final. Archivos: `__tests__/lib/platform/dream-team/integration-ana.test.ts`. Verificación: `pnpm test -- --testPathPattern=dream-team/integration-ana` — todos verdes.
- [ ] 10.3 DT-034 — Documentación de rollout: staged 0→5→25→50→100% vía `lib/platform/rollout.ts`, `NEXT_PUBLIC_DREAM_TEAM_ENABLED=off` en Vercel por defecto, notas de producción en PR body. Archivos: PR description. Verificación: review approval.

---

## Tabla Resumen

| Slice | PR | Archivos principales | Líneas est. | Budget | Depende de |
|---|---|---|---|---|---|
| S1 | PR1 | `types.ts`, `errors.ts`, `state-machine.ts` | ~300 | ok | none |
| S2 | PR2 | `experiences.ts` (ext) | ~150 | ok | S1 |
| S3 | PR3 | `repository.ts`, `repository-fake.ts` | ~400 | ok | S1 |
| S4 | PR4 | `repository-supabase.ts`, migración SQL | ~650 | size:exception | S3 |
| S5 | PR5 | `dream-team-gdv.ts` | ~360 | ok | S3 |
| S6 | PR6 | `servicios/route.ts`, `[id]/route.ts` | ~400 | ok | S4 |
| S7 | PR7 | `grants.ts`, `servicios.ts` (ext) | ~380 | ok | S4, S6 |
| S8 | PR8 | `metrics.ts`, `metrics/route.ts` | ~300 | ok | S4 |
| S9 | PR9 | `participation-adapter.ts` (ext), `servicios.ts` (ext) | ~400 | ok | S4, S7 |
| S10 | PR10 | `flags.ts` (ext), integration test | ~160 | ok | S8, S9 |

## Conteo Total

- **Total tasks**: 34
- **Total líneas estimadas**: ~3,750
- **PRs encadenados**: 10
- **PRs con `size:exception`**: 1 (S4 — migración SQL + repository Supabase)
- **PRs con budget ok**: 9

## Notas de Aplicación

- **Strict TDD activo**: cada task comienza con test RED (test falla antes de implementar). Orden: RED → GREEN → REFACTOR.
- **Migración S4**: se aplica vía MCP `supabase_global_staging` primero (DT-013), se valida, y solo después se continúa con S5+. Producción NO hasta S10 mergeado + ≥7 días staging.
- **Feature flag**: `NEXT_PUBLIC_DREAM_TEAM_ENABLED=off` por defecto hasta S10. API routes retornan 404 con flag OFF.
- **Cada PR mergeado** → verificación contra staging antes de merge del siguiente (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`).
- **Cobertura objetivo**: ≥70% unit, ≥60% integration, ≥60% e2e helpers, ≥70% overall.
- **Cero cambios destructivos**: solo `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/`CREATE POLICY`. Cero `DROP`/`ALTER` a tablas existentes.
- **Cero cambios en adapter GDV existente**: `git diff lib/platform/adapters/grupos-vida.ts` = 0 bytes en cada PR.
- **`lib/platform/grants.ts` intacto**: solo consumido, nunca modificado.
