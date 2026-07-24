# Handoff — Fase 4: Rollout de Seguimiento Pastoral

## Resumen

Fase 4 entrega el modelo **Seguimiento Pastoral**: 1:1 + Tríada + Detección de Crisis + Mentor Cascade + Notificaciones + Métricas. Toda persona acompañada tiene un mentor oficial asignado por la cascada `GDV > grupo de corto plazo > servicio` (con GDV pesando más). Las reuniones 1:1 se modelan con state machine de 6 estados y versionado optimista. Las tríadas tienen cardinalidad humana 3 fija y dos modos: por nuevo paso (P4) y por simultaneidad. La detección de crisis pastoral usa keyword scan con alerta a pastor/admin y la nota original queda intacta.

15 PRs encadenados stacked-to-main (W01 → W15, más el bundle documental), 8 migrations SQL, 16 archivos protegidos intactos de F1+F2+F3, ~21,000 insertions, 700+ tests unit GREEN + 27 tests e2e/integration.

## Plan de rollout

Staged rollout controlado por feature flags en `lib/platform/pastoral/flags.ts` vía `getPastoralFlags()` y `getPastoralStage()`.

| Stage | `NEXT_PUBLIC_PASTORAL_ENABLED` | `NEXT_PUBLIC_PASTORAL_STAGE` | Quién ve |
|---|---|---|---|
| OFF (default) | `false` | (no importa) | Nadie. API routes retornan 404. |
| Admin only | `true` | `admin-only` | Solo admins (gated por capability `pastoral.read.all`) |
| Internal | `true` | `internal` | Beta testers internos (gated por allowlist) |
| Public | `true` | `public` | Todos los usuarios autenticados |

Flags disponibles:
- `NEXT_PUBLIC_PASTORAL_ENABLED` — kill switch principal.
- `NEXT_PUBLIC_PASTORAL_STAGE` — stage del rollout.
- `NEXT_PUBLIC_PASTORAL_METRICS_ENABLED` — gate separado para el dashboard de métricas (W12).

### Defaults seguros

- **Producción**: `NEXT_PUBLIC_PASTORAL_ENABLED=false` (default) hasta validación post-merge + ≥7 días staging.
- **Staging**: `NEXT_PUBLIC_PASTORAL_ENABLED=true`, `NEXT_PUBLIC_PASTORAL_STAGE=admin-only`.
- **Flag kill-switch**: las funciones `getPastoralFlags()` y `getPastoralStageGate()` leen en **call time** (no inline build), por lo que un rollback en Vercel es instantáneo.

## Migrations aplicadas al staging

Las 8 migrations están aplicadas a `supabase_global_staging` en orden:

| # | Migration | Tabla principal | Aplica al staging |
|---|---|---|---|
| M1 | `20260722143357_pastoral_helper_auth_has_capability.sql` | `auth_has_pastoral_capability()` | ✓ |
| M2 | `20260722143358_pastoral_tables_part1_one_on_one.sql` | `pastoral_one_on_one` + `_participantes` + `_notas` | ✓ |
| M3 | `20260722172128_pastoral_tables_part2_triada.sql` | `pastoral_triada` + `_miembros` + `_eventos` (cardinalidad 3) | ✓ |
| M4 | `20260722181344_pastoral_kinds_extension.sql` | ALTER ENUM `operating_core_participation_eventos.kind` (+14 `pastoral_*`) | ✓ |
| M5 | `20260722181345_pastoral_sensitivity_extension.sql` | ALTER CHECK `sensitivity` (+`'sensitive'`) | ✓ |
| M6 | `20260723170000_pastoral_crisis_keyword_catalog.sql` | `pastoral_crisis_keyword_catalog` (5 categorías, 32 keywords) | ✓ |
| M7 | `20260723170001_pastoral_crisis_detection_log.sql` | `pastoral_crisis_detection_log` (PK idempotente) | ✓ |
| M8 | `20260724000000_pastoral_seeding.sql` | Seeding: 3 test users | ✓ |

Cada migration es **idempotente** (DO block para enums, `IF NOT EXISTS` para tablas, `CREATE OR REPLACE FUNCTION` para helper, `ALTER TABLE ... ADD CONSTRAINT` para checks). Re-ejecución es segura.

## Arquitectura clave

- **12 capabilities nuevas** (`pastoral.*`): `pastoral.one_on_one.{create,read,write_notes,validate_step,complete}`, `pastoral.triada.{create,read,write_notes,disband}`, `pastoral.metrics.read`, `pastoral.read.all`, `pastoral.mentor.cascade.resolve`, `pastoral.crisis.detect`.
- **Mentor cascade** (P1-P3, P14): `GDV > grupo de corto plazo > servicio`, GDV pesa más. Asignación automática, sin rechazo. Si la persona no está en ninguno, no tiene mentor.
- **Tríada** (P4, P7): cardinalidad humana 3 fija, dos modos (nuevo paso y simultaneidad), 4 estados (`pending_confirmation`, `active`, `disbanded`). Read guard P7: coordinador_area en simultaneidad NO ve notas del líder de GDV.
- **1:1**: state machine de 6 estados (`pending_participant`, `scheduled`, `in_progress`, `completed`, `cancelled`, `no_realizado`), `version+409` para optimistic locking, append-only en notas, motivos obligatorios al cerrar.
- **Detección de crisis** (P16): keyword scan sobre `resumen + notas`, alerta a pastor/admin vía outbox compartido de F3, log idempotente, nota original intacta.
- **Cero cambios destructivos**: las 8 migrations son ADITIVAS (CREATE TABLE / CREATE INDEX / ALTER ADD CONSTRAINT). Byte-identity preservada sobre los 16 archivos protegidos de F1+F2+F3.
- **Multi-tenant OUT of MVP** (P15): no se introduce `church_id` en F4.
- **`uno_a_uno=archive`** sigue bloqueado en `lib/platform/preflight.ts`; F4 NO invoca `registerPlatformUnoAUnoDecision`.

## UI implementada (W13 + W15)

- **3 vistas mobile-first:**
  - `app/(pastoral)/lider/` — dashboard + 1:1 list/detail con `MentorPanel` + captura rápida + tríada list/detail.
  - `app/(pastoral)/asistido/` — roadmap público agregado (P6: solo hitos, fechas) + 1:1 del asistido.
  - `app/(pastoral)/pastor/` — dashboard con métricas W12 + crisis list + lecturas (`pastoral.read.all`).
- **6 componentes compartidos** en `components/pastoral/`: `OneOnOneCard`, `TriadaCard`, `PastoralTimeline`, `MentorPanel`, `PublicRoadmap`, `CrisisAlertBanner`.
- **W15 follow-up**: `NotesForm`, `ValidateStepButton`, `/api/pastoral/roadmap/[persona_id]`.

## Decisiones pastorales cerradas (P1–P16)

- **P1**: persona solo en UN GDV activo por temporada. Inactivos o pasados no cuentan.
- **P2**: asignación del mentor automática, sin pedir confirmación.
- **P3**: la persona NO puede rechazar la asignación.
- **P4**: tríada por nuevo paso se crea automáticamente al detectar inscripción a taller, bautismo o servicio.
- **P5**: `pastoral.read.all` es la única capability de lectura completa para pastor/admin; NO permite validar pasos.
- **P6**: el asistido solo ve roadmap agregado (fechas, hitos); detalles solo líder y superiores.
- **P7**: coordinador_area en simultaneidad NO ve notas privadas del líder de GDV; solo hitos y roadmap.
- **P8**: pareja modelada como un solo `one_on_one` con dos participantes y un único resumen bounded 500 chars.
- **P9**: pareja comparte hitos solo de matrimonio; el resto es individual.
- **P10**: notificación al programar 1:1 va a ambos (líder y asistido).
- **P11**: recordatorio pre-1:1 va a ambos. MVP: correo + WhatsApp. Push queda como tarea futura.
- **P12, P13**: no se reabren en este ciclo.
- **P14**: persona sin GDV/taller/servicio → no tiene mentor; si solo sirve → coordinador; si solo taller → líder del taller.
- **P15**: multi-tenant fuera de MVP para F4.
- **P16**: detección de crisis pastoral con keywords dentro del MVP.

## Métricas a monitorear en producción

| Señal | Origen | Acción |
|---|---|---|
| denials de capability pastoral | `lib/platform/grants.ts` audit | Revisar allowlist + grants |
| `409 Conflict` en API routes pastorales | repos `*_supabase.ts` (W05, W07) | Indica concurrencia, no es error |
| `404` en `/api/pastoral/*` | Vercel logs | Flag OFF (esperado hasta admin-only) |
| `500` en `/api/pastoral/*` | Vercel logs | Revisar staging primero |
| Alertas de crisis | `pastoral_crisis_detection_log` count | Revisar `pastoral.crisis_alert.v1` |
| Latency de métricas | `/api/pastoral/metrics/[card]` | p95 < 500 ms esperado |
| Eventos participation pastoral | `operating_core_participation_eventos` count (kind LIKE 'pastoral_%') | Revisar writer pipeline (W04) |
| Tasa de cancelación de 1:1 | `pastoral_one_on_one` count WHERE estado='cancelled' | Indica fricción pastoral |

## Cero cambios destructivos

- Las 8 migrations SQL son **solo aditivas** (CREATE TABLE / CREATE INDEX / ALTER ADD CONSTRAINT). Cero `DROP TABLE` sobre tablas existentes.
- Los 16 archivos protegidos de F1+F2+F3 quedan **byte-idénticos** después de F4. Verificado con `git diff main -- <paths>`.
- Extensiones vía **sibling pattern**: `lib/platform/pastoral/**` (nuevo módulo), `emails/pastoral-templates/**`, `lib/whatsapp/pastoral-templates/**`, `app/(pastoral)/**`, `components/pastoral/**`, `supabase/migrations/`.
- `lib/platform/dream-team/**` no modificado (F2 intacto).
- `lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts` no modificado (F3 intacto).
- `lib/platform/grants.ts`, `participation.ts`, `routeGuard.ts`, `persona.ts`, `preflight.ts`, `flags.ts`, `family.ts`, `navigation.ts` no modificados (F1 intacto).
- `lib/platform/adapters/grupos-vida.ts` no modificado (adapter de F1).

## Próximos pasos

- **Validación end-to-end** en staging: smoke test con usuarios de prueba, ejecutar `e2e-ana` test (des-skip W14), validar las 4 métricas de W12.
- **Fase 5** — Talleres de Crecimiento operativos (catálogo, cohortes, inscripción, asistencia, completación, conexión con Dream Team).
- **Revisar y mergear** cualquier PR pendiente antes del rollout.
- **Post-merge W15**: levantar flag a `admin-only` en staging, validar 24-48 h, luego `internal`, luego `public`.
- **Aplicar migrations a producción** en ventana de mantenimiento (orden M1 → M8).
- **Activar flag** en modo `admin-only` con el plan descrito arriba.

## Archivos clave del cierre W15

- `lib/platform/pastoral/flags.ts` — `getPastoralFlags()`, `getPastoralStage()`, `getPastoralMetricsGate()`.
- `lib/platform/pastoral/route-access.ts` — `hasPastoralReadAll()`, `hasPastoralMentorCascadeResolve()`, `hasPastoralCrisisDetect()`.
- `lib/platform/pastoral/mentor-cascade.ts` — `resolveMentorOficial()` con cascada GDV > taller > servicio.
- `lib/platform/pastoral/crisis/service.ts` — `scanAndAlertPastoralCrisis()` con detector puro.
- `__tests__/lib/platform/pastoral/{kill-switch,route-access,flags,e2e-ana,byte-identity,invariants}.test.ts` — cobertura de kill switch, capabilities, byte-identity, invariants (I-18, I-19), y e2e Ana completo (ciclo create → schedule → start → complete con resumen → ledger event).
- `docs/roadmap/handoffs/fase-04-seguimiento-pastoral.md` — handoff completo de F4 (P1–P16, prerrequisitos, riesgos, criterios de éxito).
- `emails/pastoral-templates/pastoral.*.v1.tsx` (13 plantillas React Email).
- `lib/whatsapp/pastoral-templates/index.ts` (13 formatters WhatsApp).
- `app/(pastoral)/{lider,asistido,pastor}/**` — UI mobile-first completa.
- `components/pastoral/{OneOnOneCard,TriadaCard,PastoralTimeline,MentorPanel,PublicRoadmap,CrisisAlertBanner}.tsx` — 6 componentes compartidos.
