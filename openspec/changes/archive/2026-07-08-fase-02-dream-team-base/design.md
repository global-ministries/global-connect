# Design: Fase 2 — Dream Team Global Base

> Stack detected: Next.js 16 + React 19 + TS strict + Supabase + Tailwind 4 + Jest 30 + pnpm.
> Architecture: additive over Fase 1 (`lib/platform/**` contratos puros + repository pattern + discriminated unions).
> Style: Strict TDD RED→GREEN→REFACTOR, PRs encadenados (force-chained, stacked-to-main), budget 400 líneas / PR con `size:exception` documentada.

## 1. Resumen arquitectónico

Fase 1 dejó una **foundation aditiva** sin modelo de servicio. Fase 2 introduce un **dominio nuevo** (`dream_team_*`) que modela `(persona, equipo, rol, estado, requisitos)` y lo expone como `PlatformSessionCapability` vía adapters. Encaja así:

| Capa | Estado Fase 1 | Cambio Fase 2 | Tipo |
|---|---|---|---|
| Persona canónica | `usuarios.id` | sin cambios | contrato |
| Experiencias | 7 keys en `PLATFORM_EXPERIENCE_CATALOG` | + `dream_team` (scopeTypes: `['experience','equipo']`) | extensión aditiva |
| Capabilities | 8 keys | +7 genéricas +7 específicas = +14 keys | extensión aditiva |
| Adapter pattern | GDV + Family | + `dream-team.ts` (servicios) + `dream-team-gdv.ts` (líderes) | nuevo |
| Grants audit | contrato puro sin adapter | orquestador Dream Team consume `lib/platform/grants.ts` | consumidor (sin tocar) |
| Participation | contrato puro + fake in-memory | writer Supabase real para `service` + extension adapter | nuevo writer + existente read |
| Navigation | 9 definiciones | + ítems Dream Team (`availableHref: undefined` hasta rollout) | extensión aditiva |
| Preflight `uno_a_uno` | bloqueado | sin cambios — sigue bloqueado | contrato (no se toca) |
| DB | 180 migraciones existentes | +1 migración aditiva (CREATE TABLE + ENUM + RLS + INDEX) | aditiva pura |
| Flags | `NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED` | + `NEXT_PUBLIC_DREAM_TEAM_ENABLED=off` por defecto | nuevo flag |

**Diagrama lógico de módulos:**

```
Domain puro (sin DB)
  dream-team/types.ts ──► tipos compartidos
  dream-team/errors.ts ──► errores tipados (discriminated union)
  dream-team/state-machine.ts ──► transiciones válidas + motivo obligatorio
  dream-team/metrics.ts ──► agregados puros (4 métricas)

Repository layer (interface + 2 impls)
  dream-team/repository.ts ──► DreamTeamRepository (read+write)
  dream-team/repository-fake.ts ──► in-memory para tests
  dream-team/repository-supabase.ts ──► impl real (S4)

Service layer (casos de uso)
  dream-team/equipos.ts ──► listar / jerarquía
  dream-team/roles.ts ──► listar / jerarquía
  dream-team/servicios.ts ──► CRUD + state machine + audit
  dream-team/requisitos.ts ──► CRUD + verificación
  dream-team/grants.ts ──► orquestador (activar/reactivar grant; pausa revoke+snapshot)
  dream-team/metrics.ts ──► expone getDreamTeamMetrics()

Adapters platform
  adapters/dream-team-gdv.ts ──► reader GDV → capabilities dream_team.gdv.lead
  adapters/participation-adapter.ts ──► +writer Supabase service events

API (Next route handlers)
  app/api/dream-team/metrics/route.ts ──► GET autenticado + capability
  app/api/dream-team/servicios/route.ts ──► GET/POST listar/asignar
  app/api/dream-team/servicios/[id]/route.ts ──► GET/PATCH/DELETE
```

## 2. Módulos nuevos (a crear)

| Path | Responsabilidad pública | Exports clave | Dependencias |
|---|---|---|---|
| `lib/platform/dream-team/state-machine.ts` | Validar transiciones del state machine de 6 estados + motivo obligatorio | `validateDreamTeamTransition(from, to, motivo)`, `DREAM_TEAM_STATES`, `DREAM_TEAM_TRANSITION_MOTIVOS`, `DREAM_TEAM_TRANSITION_MATRIX` | ninguna (puro) |
| `lib/platform/dream-team/types.ts` | Tipos compartidos: `DreamTeamEstado`, `DreamTeamServicio`, `DreamTeamEquipo`, `DreamTeamRol`, `DreamTeamRequisito`, `DreamTeamRequisitoVerificacion`, `DreamTeamTransicion` | types | ninguna |
| `lib/platform/dream-team/errors.ts` | Errores tipados: `DreamTeamErrorReason` union | `DreamTeamError`, `isDreamTeamError`, `denied(reason)` factory | ninguna |
| `lib/platform/dream-team/equipos.ts` | Listar/jeraquía de equipos dentro de experiencia | `listEquipos(reader, exp)`, `getEquipoById` | `repository.ts`, `types.ts` |
| `lib/platform/dream-team/roles.ts` | Listar/jeraquía de roles por equipo | `listRoles(reader, equipoId)`, `getRoleById` | `repository.ts`, `types.ts` |
| `lib/platform/dream-team/servicios.ts` | CRUD de servicios aplicando state machine + version + audit | `assignServicio`, `transitionServicio`, `getServicio`, `listServiciosByPersona`, `listServiciosByEquipo` | `state-machine.ts`, `repository.ts`, `grants.ts`, participation writer |
| `lib/platform/dream-team/requisitos.ts` | CRUD de requisitos + verificación manual (admin) | `listRequisitosPorRol`, `verifyRequisito`, `getRequisitosVencidos` | `repository.ts`, `metrics.ts` |
| `lib/platform/dream-team/grants.ts` | Orquestador: `applyGrantsForTransition(ctx)` decide grant/revoke + snapshot persistido | `applyGrantsForTransition`, `restoreFromSnapshot`, `serializePausedGrantsSnapshot` | `lib/platform/grants.ts`, `repository.ts` |
| `lib/platform/dream-team/metrics.ts` | Función pura `getDreamTeamMetrics()` sobre un reader | `getDreamTeamMetrics(reader)`, `DreamTeamMetrics` (4 campos) | `repository.ts` |
| `lib/platform/dream-team/repository.ts` | Interface `DreamTeamRepository` (read + write), `DreamTeamGdvMembershipReader`, `DreamTeamParticipationEventWriter`, `DreamTeamMetricsReader` | types de contrato | ninguna |
| `lib/platform/dream-team/repository-fake.ts` | In-memory implementations para tests | `createInMemoryDreamTeamRepository()` | `repository.ts`, `types.ts` |
| `lib/platform/dream-team/repository-supabase.ts` | Real Supabase-backed adapter usando `createServerClient()` | `createSupabaseDreamTeamRepository()` | `repository.ts`, supabase |
| `lib/platform/adapters/dream-team-gdv.ts` | Reader `grupo_miembros` → capability `dream_team.gdv.lead` con pause-detection | `resolveDreamTeamGdvPlatformContext(input)`, `DreamTeamGdvAdapterInput` | `repository.ts` (reader), `lib/platform/experiences` |
| `app/api/dream-team/metrics/route.ts` | GET autenticado, gating capability `dream_team.metrics.read` | handler `GET` | `repository-supabase.ts`, `metrics.ts` |
| `app/api/dream-team/servicios/route.ts` + `[id]/route.ts` | CRUD básico de servicios | handlers `GET/POST/PATCH/DELETE` | `servicios.ts`, `routeGuard.ts` |

## 3. Extensiones aditivas (sin romper Fase 1)

| Archivo | Extensión | Comportamiento actual preservado |
|---|---|---|
| `lib/platform/experiences.ts` | + `dream_team: { label, scopeTypes: ['experience','equipo'] }` en catalog. + 14 keys nuevas en `PLATFORM_CAPABILITIES`. | `resolvePlatformCapability` para keys existentes sigue funcionando; tests de Fase 1 verdes. |
| `lib/platform/grants.ts` | sin cambios — solo consumido por `dream-team/grants.ts` | API pública intacta |
| `lib/platform/participation.ts` | sin cambios — `PLATFORM_PARTICIPATION_EVENT_TYPES` ya incluye `'service'` | sin cambios |
| `lib/platform/adapters/participation-adapter.ts` | + `DreamTeamParticipationSupabaseWriter` que implementa `PlatformParticipationReadRepository` (write+read para eventos `service`), consumiendo `dream_team_participation_eventos`. Read para otros tipos sigue siendo fake. | `ParticipationInMemoryAdapter` intacto para los 6 tipos no-service |
| `lib/platform/navigation.ts` | + definiciones: `dream_team_global`, `dream_team_metrics`. Sin tocar los 9 actuales. `availableHref: undefined` hasta rollout. | navegación legacy intacta |

## 4. Contratos clave (interfaces)

```ts
// lib/platform/dream-team/repository.ts
export interface DreamTeamRepository {
  // equipos / roles
  listEquiposByExperiencia(exp: PlatformExperienceKey): Promise<readonly Equipo[]>
  listRolesByEquipo(equipoId: string): Promise<readonly Rol[]>
  // servicios
  getServicio(id: string): Promise<Servicio | null>
  listServiciosByPersona(personaId: string): Promise<readonly Servicio[]>
  listServiciosByEquipo(equipoId: string, estado?: DreamTeamEstado): Promise<readonly Servicio[]>
  insertServicio(input: ServicioInsert): Promise<Servicio>
  updateServicioEstado(args: { id: string; expectedVersion: number; estado: DreamTeamEstado; motivo: DreamTeamTransicionMotivo; actorPersonaId: string; pausedGrantsSnapshot?: PausedGrantsSnapshot }): Promise<{ ok: true; servicio: Servicio } | { ok: false; reason: 'version_conflict' | 'invalid_transition' | 'not_found' }>
  // requisitos
  listRequisitosPorRol(rolId: string): Promise<readonly Requisito[]>
  upsertRequisito(input: RequisitoInput): Promise<Requisito>
  listRequisitosVerificacion(servicioId: string): Promise<readonly RequisitoVerificacion[]>
  upsertRequisitoVerificacion(input: RequisitoVerificacionInput): Promise<RequisitoVerificacion>
  // historial
  insertEstadoHistorial(row: EstadoHistorialInsert): Promise<void>
  listEstadosHistorial(servicioId: string): Promise<readonly EstadoHistorial[]>
  // participation
  appendParticipationEvent(event: PlatformParticipationEvent): Promise<void>
  listParticipationEventsByPersona(personaId: string): Promise<readonly PlatformParticipationEvent[]>
  // metrics
  countServiciosPorEstado(): Promise<readonly { estado: DreamTeamEstado; count: number }[]>
  countServiciosPorExperienciaEquipo(): Promise<readonly { experiencia: PlatformExperienceKey; equipoId: string; count: number }[]>
  countServiciosPorRol(): Promise<readonly { rolId: string; count: number }[]>
  listRequisitosVencidos(asOf: Date): Promise<readonly RequisitoVencido[]>
}

export interface DreamTeamGdvMembershipReader {
  findLeadershipMembershipsByPersonaId(personaId: string): Promise<readonly { grupoId: string; rol: string; estado: 'activo' | 'historico' }[]>
  findAllActiveLeadershipMemberships(): Promise<readonly { personaId: string; grupoId: string; rol: string }[]>
}
```

`DreamTeamGrantsOrchestrator.applyGrantsForTransition(ctx)` produce `PlatformGrantAuditEvent[]` que el `lib/platform/grants.ts` logger persiste; `applyAdapters()` sigue el patrón Fase 1 (`adapterResult.contexts[] → session.contexts`, `capabilities[] → session.capabilities`).

## 5. Plan de migraciones aditivas

**Una sola migración** `supabase/migrations/YYYYMMDDHHMMSS_dream_team_base.sql` (timestamp al ejecutar S4) que crea:

- 5 enums: `enum_dream_team_estado`, `enum_dream_team_requisito_tipo`, `enum_dream_team_requisito_obligatoriedad`, `enum_dream_team_requisito_estado`, `enum_dream_team_transicion_motivo`
- 7 tablas: las del alto nivel del proposal + `dream_team_participation_eventos`
- Índices: `(persona_id, estado)`, `(equipo_id, estado)`, `(rol_id)`, `(servicio_id, created_at DESC)` en historial, `(persona_id, occurred_at DESC)` en participation, `(requisito_id, estado, fecha_vencimiento)` en verificación
- RLS:
  - lectura `dream_team_servicios`: si `auth.uid()` tiene capability `dream_team.serve` o `dream_team.metrics.read` (`auth_has_capability(...)` helper o se valida vía RPC server-side)
  - escritura: rpc-gated (`requiere admin`), NUNCA acceso directo authenticated
  - `dream_team_estados_historial`: solo lectura vía RPC admin
- **NO** modifica tablas existentes (GDV, usuarios, support, etc.)
- **NO** triggers que rompan producción

> ⚠️ **Esta migración NO se aplica automáticamente.** El diseño la lista como *artifact* a aplicar durante S4 primero en `supabase_global_staging` (MCP), validar, luego producción. La aplicación se hace en `sdd-apply` de S4, nunca en este phase.

## 6. Estrategia de rollout

| Slice | Flag | Quién puede llamar | Notas |
|---|---|---|---|
| S1 Foundation pura | sin flag | nadie (solo tests) | exporta API pero no se usa en runtime |
| S2 Capabilities | sin flag | nadie | extiende allowlist pero sin source que emita; tests son internal |
| S3 Repository fake | sin flag | nadie (factory para tests) | no se importa desde runtime |
| S4 Supabase repo + migración | `DREAM_TEAM=off` | solo admin (override server-side) | migración aplicada en staging antes |
| S5 GDV adapter | `DREAM_TEAM=off` | platform session resolver | bajo flag, capabilities no se exponen |
| S6 Servicios API | `DREAM_TEAM=off` | admin con capability `dream_team.requirements.manage` | routes 404 con flag OFF |
| S7 Grants orchestrator | `DREAM_TEAM=off` | services internos | audit logger se activa |
| S8 Métricas endpoint | `DREAM_TEAM=off` | capability `dream_team.metrics.read` | endpoint gated |
| S9 Participation writer | `DREAM_TEAM=off` | internal services | writer + read real para `service` |
| **S10 Rollout flip** | `DREAM_TEAM=on` (gated via `lib/platform/rollout.ts` 0→5→25→50→100%) | público | métricas productivas + alerts |

Flag helper: `getDreamTeamFlags()` en `lib/platform/flags.ts` (extensión aditiva). Default en Vercel: `off`.

## 7. Estrategia TDD (strict)

| Capa | Qué testear | Approach |
|---|---|---|
| Unit puro | state-machine, validators, helpers de snapshot, error factories | Jest 30, sin DB. Red primero. |
| Unit con fake repo | servicios (transiciones, grants, audit), requisitos (vencimiento), grants orchestrator, metrics | Inyectar `createInMemoryDreamTeamRepository()` |
| Integration Supabase | S4: `repository-supabase.ts` contra MCP `supabase_global_staging` (test isolation por `persona_id` random UUID) | Tag `integration:supabase`, skipped sin env STAGING_URL |
| E2E | caso Ana completo (2 servicios, transición de uno, métrica refleja) | Playwright + flag ON, último slice |
| Cobertura objetivo | ≥70% unit, ≥60% integration, ≥60% e2e helpers, ≥70% overall (Fase 1 cerró 10/3/1/10) | `pnpm test --coverage` |

Reglas: tests RED antes de implementación; merge sin tests verdes = blocked.

## 8. Plan de slices/PRs encadenados (force-chained, stacked-to-main)

| ID | Título | Archivos tocados | Estimado | Tests | Bloqueo | Riesgo budget |
|---|---|---|---|---|---|---|
| **S1** | Foundation pura | `dream-team/{types,errors,state-machine}.ts` + tests | ~150 prod / 150 test = **300** | 100% unit | — | bajo |
| **S2** | Capabilities + experiences | `experiences.ts` extension (~25 líneas) + tests | **150** | unit | S1 | bajo |
| **S3** | Repository interfaces + fake | `dream-team/{repository,repository-fake}.ts` + tests | ~200 prod / 200 test = **400** | unit | S1 | **justo al límite** |
| **S4** | Supabase repository + migración | `repository-supabase.ts` + migración SQL + tests integration contra MCP staging | ~250 prod / 200 test / 200 SQL = **650** | integration | S3 | **requiere `size:exception`** |
| **S5** | GDV adapter | `adapters/dream-team-gdv.ts` + tests | ~180 prod / 180 test = **360** | unit+integration | S3 | bajo |
| **S6** | Servicios API routes | `app/api/dream-team/servicios/{route.ts,[id]/route.ts}` + tests | ~200 prod / 200 test = **400** | unit | S4 | **justo al límite** |
| **S7** | Grants orchestrator + audit | `dream-team/grants.ts` + integration con `lib/platform/grants.ts` + tests | ~180 prod / 200 test = **380** | unit | S4+S6 | bajo |
| **S8** | Métricas + endpoint | `dream-team/metrics.ts` + `app/api/dream-team/metrics/route.ts` + tests | ~150 prod / 150 test = **300** | unit | S4 | bajo |
| **S9** | Participation events writer | extension `adapters/participation-adapter.ts` + integration con state machine + tests | ~200 prod / 200 test = **400** | unit+integration | S4+S7 | **justo al límite** |
| **S10** | Rollout flag + integration tests + docs | `lib/platform/flags.ts` extension + `dream-team/rollout.ts` + e2e Ana | ~80 prod / 80 test = **160** | e2e | S8+S9 | bajo |

**Total estimado**: ~3,750 líneas (sumando prod + test + migración).

**Verificación por slice**: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `checkPlatformRolloutGate` de Fase 1. S4 además: aplicar SQL a staging, correr smoke de RLS, validar que las tablas existen y RLS bloquea authenticated sin capability.

## 9. Manejo de Supabase staging

- MCP `supabase_global_staging` ya conectado al workspace.
- **S4 es el único slice que toca DB**. Orden obligatorio dentro del PR:
  1. Branch → migración SQL committed en `supabase/migrations/` (no aplicada todavía).
  2. PR abierto → CI corre unit/integration localmente (Supabase repo code-only con tests skipped).
  3. Una vez merged y antes del siguiente PR stacked → aplicar la migración al staging vía MCP, validar que 7 tablas + 5 enums existen y RLS bloquea, **luego** continuar.
  4. Producción: NO hasta que todas las slices S1-S10 estén mergeadas y staging valide ≥7 días.
- Drift check: comparar `supabase/migrations/` y staging; cualquier mismatch bloquea `sdd-apply` de la siguiente slice.
- Tests en integration tag (skipped sin env).

## 10. Compatibilidad con `uno_a_uno`

- `lib/platform/preflight.ts` intacto (sigue bloqueando `uno_a_uno.global.read` con `reason: 'no_formal_decision'`).
- **Fase 2 NO introduce `uno_a_uno`.** Requisitos son tracking de estado (`pendiente | completado | vencido | no_aplica`), nunca workflows de 1:1.
- Si Fase 3 (Operating Core) quiere modelar `entrevista pastoral` o similar, debe:
  - Pedir excepción formal al producto (`registerPlatformUnoAUnoDecision`).
  - No hacer short-cut vía adapter Dream Team.

## 11. Riesgos del diseño y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Over-engineering jerarquías | Validar con 2 equipos reales (DPS Producción Técnica + Estudiantes Transit) antes de cerrar API; adjacency list máx 3 niveles. |
| Acoplar con `support_user_capabilities` | **NO** reutilizar tabla. Crear `dream_team_*` con RLS aislado. Tests verifican 0 referencias cruzadas. |
| Romper GDV | Adapter separado `dream-team-gdv.ts`, cero cambios a `lib/platform/adapters/grupos-vida.ts`, RPCs ni RLS. CI test: diff del archivo debe ser 0 bytes en la rama de Fase 2. |
| Pérdida silenciosa de servicios | Audit obligatorio con motivo; nunca borrar; historial de transiciones consultable. Spec `dream-team-domain` lo exige. |
| Concurrencia con 409 conflict | Column `version` en `dream_team_servicios`, UPDATE con `WHERE version = ?`, cliente recibe HTTP 409 + log de audit. (Ver §14 open question sobre ajuste de spec wording.) |
| Migración rompe producción | Solo `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/`CREATE POLICY`. No `DROP`, no `ALTER` a tablas existentes. Aplicada primero a staging. |
| Métricas exponen info sensible | Endpoint gated por `dream_team.metrics.read` capability; sin capability → 403 + audit `deny`. |
| Capabilities genéricas con `(variable)` experience | **Resuelto** con modelo híbrido: genéricas usan `experience: 'dream_team'`, específicas usan experiencia real. Evitamos keys variables que `resolvePlatformCapability` rechaza. |
| Rollout expone capabilities antes que UI | Definiciones de navegación con `availableHref: undefined` → items no son links hasta que UI exista en Fase 3. |

## 12. Validación contra Fase 1

| Componente | Estado | Acción |
|---|---|---|
| `lib/platform/experiences.ts` | extendido (catalog + 14 capabilities) | tests Fase 1 siguen verdes |
| `lib/platform/grants.ts` | consumido por `dream-team/grants.ts` | sin cambios al archivo |
| `lib/platform/participation.ts` | writer real para `service` | sin cambios al archivo (event type ya existe) |
| `lib/platform/persona.ts` | referenciado para FK semantics | sin cambios |
| `lib/platform/adapters/grupos-vida.ts` | intacto | 0 bytes cambiados en S5 |
| `lib/platform/adapters/family.ts` | intacto | sin tocar |
| `lib/platform/navigation.ts` | extendido con 2 items Dream Team | tests verdes; legacy sin cambios |
| `lib/platform/routeGuard.ts` | usado por S6/S8 | sin cambios al archivo |
| `lib/platform/rollout.ts` + `lib/platform/flags.ts` | `flags.ts` extendido con `getDreamTeamFlags()`; `rollout.ts` se reusa para S10 | contratos puros intactos |
| Tests Fase 1 (666) | siguen pasando | `pnpm test` post-merge |

## 13. Validación contra el caso Ana

Recorrido en pasos con el diseño:

1. **Asignación inicial**: admin via `POST /api/dream-team/servicios` con capability `dream_team.requirements.manage` → `assignServicio({ personaId: ana, rolId, motivo: 'admin_asignacion' })`. Estado inicial `postulado`. Insert en `dream_team_servicios` + historial.
2. **Orientación**: `transitionServicio({ id, to: 'en_orientacion', motivo: 'admin_promocion' })`. Sin grants ni revoke.
3. **Activación**: `transitionServicio({ id, to: 'activo', motivo: 'admin_promocion' })`. `applyGrantsForTransition` emite 4 grant events (`dream_team.serve` + `dps.team.serve` para servicio 1; `dream_team.serve` + `dream_team.lead` + `estudiantes.team.lead` para servicio 2) — 5 total pero `dream_team.serve` es genérica compartida. Writer de participation emite `service_state_changed`.
4. **Pausa de DPS Cámara**: `transitionServicio({ id, to: 'en_pausa', motivo: 'admin_pausa' })`. Grants de DPS revocados + snapshot persistido en `paused_grants_snapshot`. Estudiantes intacto.
5. **Capacitación Estudiantes vence**: ninguna transición; `getDreamTeamMetrics().requisitos_vencidos` muestra a Ana + Estudiantes + Líder + 14 días. Servicio sigue `activo`.
6. **Pérdida liderazgo Transit**: adapter `dream-team-gdv.ts` detecta ausencia de fila activa en `grupo_miembros` → emite `gdv_liderazgo_removed` → state machine transita a `en_pausa` con motivo `gdv_liderazgo_removed`. Servicio DPS intacto. Membresía GDV NO afectada.
7. **Reactivación**: `transitionServicio({ to: 'activo', motivo: 'admin_reactivacion' })`. Grants restaurados del `paused_grants_snapshot`. Evento `service_reactivated`.
8. **Métricas**: `getDreamTeamMetrics()` Ana: servicios_por_estado `activo` ×2; distribucion_roles `Voluntario` ×1 + `Líder` ×1.

## 14. Validación contra el roadmap

| Bullet Fase 2 (`roadmap-maestro`) | Cubierto en diseño |
|---|---|
| Modelar persona que sirve en experiencia/equipo/rol | §1, §2, §4 — `dream_team_servicios` triple + repository |
| Jerarquías configurables | `dream_team_roles.parent_role_id`, max 3 niveles |
| Estado de servicio + auditoría | §4 — state-machine + historial, motivo obligatorio |
| Requisitos por área/rol configurables | `dream_team_requisitos` + verificación |
| Integración con Grupos de Vida | §3 — adapter `dream-team-gdv.ts` separado |
| Capacidades de servicio | §3 — híbrido genérico + específico (15 keys) |
| Grants auditables | §4 — orquestador usa `lib/platform/grants.ts` |
| Historial longitudinal | §3 — participation writer real Supabase para `service` |
| Métricas mínimas | §2 — `getDreamTeamMetrics()` + endpoint + 4 agregados |
| Capas futuras preparadas | §4 — interfaces repository, contrato para participation read adapter |

## 15. Próximo paso

`sdd-tasks` debe descomponer cada slice (S1–S10) en tasks concretos verificables (formato Fase 1: `- [ ] X.Y descripción + archivo + test file`), lista para que `sdd-apply` futuro consuma slice por slice con gates RED→GREEN→REFACTOR.

---

**Resumen ejecutivo**
- 10 slices propuestos, total ~3,750 líneas estimadas (incluyendo tests).
- 4 PRs cerca o sobre el budget de 400 líneas (S3 al límite, S4 requiere `size:exception`, S6/S9 al límite). PR budget risk: **medium**.
- DB: 1 sola migración aditiva (7 tablas + 5 enums + RLS + índices), aplicada en S4 vía MCP staging primero, nunca automática.
- Compatibilidad Fase 1: **total** — cero cambios destructivos, 0 archivos de `lib/platform/adapters/grupos-vida.ts` modificados, capabilities extendidas con `dream_team` agregada al catálogo.
- Caso Ana: **validado paso a paso** en §13.
- Capabilities: 15 keys nuevas (7 genéricas Dream Team + 8 específicas, una de ellas `dps.team.serve` ya existía sin backend).
- Flag nuevo `NEXT_PUBLIC_DREAM_TEAM_ENABLED=off` por defecto, rollout staged 0→5→25→50→100% usando `lib/platform/rollout.ts` de Fase 1.
