# Handoff — Fase 2: Rollout de Dream Team

## Resumen

Fase 2 entrega el modelo **Dream Team Global Base**: toda persona que sirve en cualquier experiencia queda modelada como `DreamTeamServicio` con estado versionado, grants derivados, audit log, métricas y participation events.

10 slices encadenados stacked-to-main (`S1` → `S10`), 10 PRs, ~812 tests unit verde + 24 integration tests skipped sin credenciales staging.

## Plan de rollout

Staged rollout controlado por feature flags en `lib/platform/flags.ts` vía `getDreamTeamFlags()`.

| Stage | `NEXT_PUBLIC_DREAM_TEAM_ENABLED` | `NEXT_PUBLIC_DREAM_TEAM_STAGE` | Quién ve |
|---|---|---|---|
| OFF (default) | `false` | (no importa) | Nadie. API routes retornan 404. |
| Admin only | `true` | `admin-only` | Solo admins (gated por capability `dream_team.requirements.manage`) |
| Internal | `true` | `internal` | Beta testers internos (gated por allowlist) |
| Public | `true` | `public` | Todos los usuarios autenticados |

`minVersion` opcional (`NEXT_PUBLIC_DREAM_TEAM_MIN_VERSION`) gatea por versión mínima del cliente.

### Defaults seguros

- **Producción**: `NEXT_PUBLIC_DREAM_TEAM_ENABLED=false` (default) hasta validación post-merge + ≥7 días staging.
- **Staging**: `NEXT_PUBLIC_DREAM_TEAM_ENABLED=true`, `NEXT_PUBLIC_DREAM_TEAM_STAGE=admin-only`.
- **Flag kill-switch**: la función `getDreamTeamFlags()` lee en **call time** (no inline build), por lo que un rollback en Vercel es instantáneo.

## Arquitectura clave

- **Modelo versionado**: `dream_team_servicios.version` previene lost updates. `updateServicio` con `expectedVersion` mismatch → `409 Conflict`.
- **State machine forward-only**: `postulado → en_orientacion → activo → en_pausa/inactivo/retirado`. `en_pausa → activo` requiere `previousSnapshot`.
- **Grants orchestrator**: `applyGrantsForTransition` decide grant/revoke/restore basándose en estado nuevo. Snapshot persistido en `dream_team_estados_historial.paused_grants_snapshot` (JSONB).
- **Audit**: consume `createPlatformGrantAudit()` de Fase 1 — cero modificaciones a `lib/platform/grants.ts`.
- **Participation**: eventos `service_state_changed`, `service_paused_grants_snapshot`, `service_reactivated`, `service_retired` con retention 365-1095 días.
- **Métricas**: agregados puros (`getDreamTeamMetrics`) — `servicios_por_experiencia_equipo`, `servicios_por_estado`, `distribucion_roles`, `requisitos_vencidos`.

## Métricas a monitorear en producción

| Señal | Origen | Acción |
|---|---|---|
| denials de capability | `lib/platform/grants.ts` audit | Revisar allowlist + grants |
| `409 Conflict` en API routes | `repository-supabase.updateServicio` | Indica concurrencia, no es error |
| `500` en `/api/dream-team/*` | Vercel logs | Revisar staging primero |
| Latency de `getDreamTeamMetrics` | endpoint `/api/dream-team/metrics` | p95 < 500 ms esperado |
| Eventos participation faltantes | `dream_team_participation_eventos` count | Revisar writer pipeline |

## Cero cambios destructivos

- Migración SQL S4 **solo crea** tablas/enums/índices/policies (cero `DROP`/`ALTER` a tablas existentes).
- `lib/platform/grants.ts` **intacto** (consumido, no modificado).
- `lib/platform/adapters/grupos-vida.ts` **intacto** (adapter S5 read-only sin tocar el original).

## Próximos pasos

- **Fase 3** — Operating Core (inscripciones, eventos, asistencia).
- **Revisar y mergear PRs S1 → S10 en orden stacked-to-main.**
- **Post-merge S10**: levantar flag a `admin-only` en staging, validar 24-48 h, luego `internal`, luego `public`.

## Archivos clave del slice S10

- `lib/platform/flags.ts` — `getDreamTeamFlags()` (extensión aditiva).
- `lib/platform/dream-team/route-access.ts` — usa `getDreamTeamFlags()` para `isDreamTeamEnabled`.
- `__tests__/lib/platform/flags.test.ts` — 6 unit tests cubriendo default, enabled, stage, fallback de stage inválido, custom env.
- `__tests__/lib/platform/dream-team/end-to-end-ana.test.ts` — 1 integration test corrido contra staging (~16s).
