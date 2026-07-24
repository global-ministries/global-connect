# Handoff — Fase 4: Seguimiento Pastoral (1:1 + Tríada)

## Estado del programa

- Fase 1 — Platform Foundation: cerrada, mergeada en `main`.
- Fase 2 — Dream Team Global Base: cerrada, mergeada en `main`.
- Fase 3 — Operating Core: cerrada, mergeada en `main`.
- Fase 4 — Seguimiento Pastoral: **cierre pendiente** — W14 en PR stage.

## Objetivo de la fase

Construir el módulo de **Seguimiento Pastoral** para GlobalConnect: 1:1 disciplinado entre líder GDV y asistido, tríadas de 3 personas, detección de crisis, métricas pastorales y notificaciones. El módulo es 100% aditivo sobre Operating Core y no modifica ningún módulo protegido.

## Plan de rollout

Rollout controlado por feature flags en `lib/platform/pastoral/flags.ts` (módulo hermano, no edita `lib/platform/flags.ts`).

| Stage | `NEXT_PUBLIC_PASTORAL_ENABLED` | `NEXT_PUBLIC_PASTORAL_STAGE` | Kill switch | Quién ve |
|---|---|---|---|---|
| OFF (default) | `false` | — | — | Nadie. API routes retornan 404. |
| Admin only | `true` | `admin-only` | `off` | Solo admins con `pastoral.read.all` |
| Internal | `true` | `internal` | `off` | Líderes GDV con grants activos |
| Public | `true` | `public` | `off` | Todos los usuarios autenticados con grants |

**Kill switch** (`NEXT_PUBLIC_PASTORAL_KILL_SWITCH=on`): desactiva pastoral completamente — todas las rutas retornan 404 independientemente del stage.

**Métricas** (`getPastoralMetricsGate`): visibles en `admin-only` e `internal` (no solo `public`).

## Principios no negociables

1. **Byte-identity de módulos protegidos**: 16 archivos protegidos de F1/F2/F3 nunca se editan. F4 añade módulos hermanos en `lib/platform/pastoral/**`.
2. **`auth.uid()` directo**: nunca usar `public.current_persona_id()`.
3. **Nombres únicos de policies**: siempre sufijos `_select`, `_update`, `_insert`, `_delete`.
4. **Strict TDD**: RED → GREEN → REFACTOR, `pnpm test` verde + `tsc --noEmit` 0.
5. **Cero DDL destructivo**: solo `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN`, `INSERT`.
6. **Multi-tenant fuera del MVP**: `church_id`/`campus_id` deferred a fase futura.
7. **`uno_a_uno=archive`**: `lib/platform/preflight.ts` sigue bloqueado; F4 no invoca `registerPlatformUnoAUnoDecision`.
8. **CRISIS_DECTECT kill-switch a nivel de capability**: `pastoral.crisis.detect` es capability separada; kill switch general no afecta la capability en sí.
9. **Notas append-only**: `pastoral_one_on_one_notas` y `pastoral_triada_notas` son solo INSERT; ningún UPDATE o DELETE.
10. **Sensibilidad de crisis**: `pastoral_crisis_detected` tiene `sensitivity='sensitive'` en el ledger.

## Decisiones P1–P16

| # | Decisión | Descripción |
|---|---|---|
| P1 | Modelo 1:1 | `pastoral_one_on_one` con state machine de 6 estados (D12) |
| P2 | Tríada | 3 personas fijas, contexto `nuevo_paso`\|`simultaneidad`\|`inicial`\|`reformada` (D13) |
| P3 | Catálogo motivos disolución | 5 valores cerrados: `gdv_liderazgo_removed`, `servicio_retirado`, `cambio_de_temporada`, `pastoral_decision`, `otro` (D14) |
| P4 | Mentor cascade | Discrimina GDV → taller → servicio; retorna `mentorPersonaId` + `pendingRecentChange` (D15) |
| P5 | Separación leer/escribir | `pastoral.read.all` NO otorga `validate_step`, `write_notes` ni `disband` — grants explícitos requeridos |
| P6 | Roadmap público | Field-projection: `resumen` y `notas` nunca expuestos al asistido |
| P7 | Excepción coordinador área | `contexto='simultaneidad'` + `rol='coordinador_area'` → deny notas del líder |
| P8 | Métricas | 4 funciones puras: `uno_auno_por_periodo`, `lideres_activos_por_ventana`, `triadas_por_tipo`, `alarma_gdv_sin_uno_auno_en_90_dias` (D19, D27) |
| P9 | Hitos compartidos | Asistencia a casamento do asistida visible para el asistido; individuales no cruzados |
| P10 | Notificaciones 1:1 | Destinatarios: mentor oficial + asistidos |
| P11 | Notificaciones push | Deuda: push deferred a fase futura |
| P12 | State machine 1:1 | `pending_participant → scheduled → in_progress → completed/cancelled` (D12) |
| P13 | State machine tríada | `pending_confirmation → active → en_pausa → disbanded` (D13) |
| P14 | Sin mentor = sin 1:1 | Si cascade retorna `mentor: null`, se deniega la creación (P14) |
| P15 | Multi-tenant | Deuda: `church_id`/`campus_id` deferred |
| P16 | Detección de crisis | 5 categorías cerradas, 30 keywords, match case-insensitive + unaccent |

## Catálogo de crisis (P16)

| Categoría | Keywords |
|---|---|
| `duelo` | fallecido, murió, muerte, perdido, deuil, bereavement, duelo |
| `crisis_matrimonial` | infiel, separación, divorcio, affair, traición, crisis |
| `ideacion_suicida` | suicidio, quitarme la vida, autolesión, self-harm, no vale la pena, mejor no estar |
| `violencia_intrafamiliar` | violencia, golpe, abuso, amenaza, maltrato, agresión |
| `crisis_de_fe` | dudar de dios, perdí la fe, no me importa, abandonado por dios, crisis de fe, dios me abandonó, no tengo fe |

## Estado de las tablas en staging

8 migrations M1–M8 aplicadas en staging:

| Migration | Tabla/feature |
|---|---|
| M1 | `auth_has_pastoral_capability()` helper |
| M2 | `pastoral_one_on_one`, `pastoral_one_on_one_participantes`, `pastoral_one_on_one_notas` |
| M3 | `pastoral_triada`, `pastoral_triada_miembros`, `pastoral_triada_eventos` |
| M4 | Extensión CHECK `operating_core_participation_eventos.kind` (+14 kinds `pastoral_*`) |
| M5 | Extensión CHECK `sensitivity` (+ `sensitive`) |
| M6 | `pastoral_crisis_keyword_catalog` (32 rows, 5 categorías) |
| M7 | `pastoral_crisis_detection_log` (PK idempotente) |
| M8 | Seeding: keywords (si vacío), admin user, test users |

## Mapa de capacidades

| Capability | Quien la recibe |
|---|---|
| `pastoral.one_on_one.create` | Líder GDV activo, coordinador de área activo |
| `pastoral.one_on_one.read` | Líder autor, asistido (roadmap), pastor/admin |
| `pastoral.one_on_one.write_notes` | Líder autor |
| `pastoral.one_on_one.validate_step` | Líder oficial |
| `pastoral.one_on_one.complete` | Líder autor |
| `pastoral.triada.create` | Líder GDV activo, coordinador de área activo |
| `pastoral.triada.read` | Miembro de tríada, director agregado, pastor/admin |
| `pastoral.triada.write_notes` | Miembro de tríada (excepto P7) |
| `pastoral.triada.disband` | Líder oficial de la tríada |
| `pastoral.metrics.read` | Líder GDV activo, coordinador, pastor/admin |
| `pastoral.read.all` | Pastor, admin |
| `pastoral.mentor.cascade.resolve` | Líder GDV activo, coordinador, pastor/admin |
| `pastoral.crisis.detect` | Pastor, admin |

## Amenazas OWASP-pastoral T1–T12 (cubiertas)

| # | Threat | Mitigación |
|---|---|---|
| T1 | Evasión de detección de crisis | Detector puro + log append-only + audit |
| T2 | Notas modificadas post-creación | Tabla notas append-only (INSERT only) |
| T3 | Capability drift | RLS con `auth.uid()` directo, grants idempotentes |
| T4 | Escalación de privileges | `pastoral.read.all` no otorga write_notes ni validate_step |
| T5 | Validación de resumen | Bounded 500 chars + regex sensible |
| T6 | Coordinador ve notas en simultaneidad | Excepción P7: deny en contexto simultaneidad |
| T7 | Auto-validación del asistido | `validate_step` solo mentor oficial (no asistido) |
| T8 | Retransmisión de crisis | PK idempotente en `pastoral_crisis_detection_log` |
| T9 | 409 stale version | State machine con `expectedVersion` + 409 Conflict |
| T10 | Auditoría de lecturas pastorales | `pastoral_access_audit_log` append-only |
| T11 | Dato sensible en metadata del ledger | Sin PII en `metadata` (no cedula/telefono/email) |
| T12 | 1:1 sin mentor válido | Denied si cascade retorna `mentor: null` (P14) |

## Prerrequisitos para merge

- [x] F1 (Platform Foundation) mergeada a `main`.
- [x] F2 (Dream Team Global Base) mergeada a `main`.
- [x] F3 (Operating Core) mergeada a `main`.
- [x] Issue #103 (SECURITY DEFINER audit) cerrado.
- [ ] W01–W14 todos mergeados a `main`.
- [ ] `git diff main...HEAD -- <16 protected files>` = VACÍO.
- [ ] `pnpm test:ci` verde con 0 failed.
- [ ] `tsc --noEmit` exit 0.

## Riesgos residuales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Capability grants no se propagan a nuevos usuarios | Media | Media | Seeding M8 incluye grants para roles existentes; nuevos usuarios requieren onboarding |
| Crisis keywords insuficientes para языка local | Baja | Alta | Catálogo extensible vía futuro `pastoral_crisis_keyword_catalog` UPDATE |
| Métricas de líder pausado false negatives | Media | Baja | `liveOnly=false` preserva histórico; solo pausas actuales se excluyen |
| Multi-tenant requerido antes de lo esperado | Baja | Alta | `church_id` documentado como deuda P15 |

## Rollout plan (4 etapas)

### Etapa 1 — Admin only (semana 1)
- `NEXT_PUBLIC_PASTORAL_ENABLED=true`, `STAGE=admin-only`, `KILL_SWITCH=off`
- Solo el pastor y admins ven el dashboard pastoral.
- Verificación: métricas visibles, crisis log vacío.

### Etapa 2 — Internal beta (semana 2–3)
- `STAGE=internal`
- 3–5 líderes GDV piloto con cuentas de prueba.
- Verificación: creación de 1:1, notas, métricas de líder piloto.

### Etapa 3 — GDV leaders (semana 4–6)
- `STAGE=public`
- Todos los líderes GDV activos con grants.
- Verificación: funnel completo 1:1, tasa de completado, crisis alerts.

### Etapa 4 — Tríadas + métricas públicas (semana 7+)
- Tríadas visibles para todos los roles.
- Métricas pastorales en dashboard general.
- Kill switch disponible para desactivación inmediata.

## Criterios de éxito

- [ ] `pastoral_one_on_one_completed` events en ledger después de cada 1:1 completado.
- [ ] Crisis detection log registra alertas cuando `resumen` contiene keywords de catálogo.
- [ ] Métricas `lideres_activos_por_ventana` muestra conteo ≠ 0 cuando hay líderes activos.
- [ ] 404 en todas las rutas pastorales cuando `KILL_SWITCH=on`.
- [ ] 0 diff en los 16 archivos protegidos después de F4 completo.
- [ ] `pnpm test` >95% pass rate en suite pastoral.

## Archivos protegidos (byte-identity)

F4 NO modifica estos archivos (byte-identity verificado en CI):

```
lib/platform/flags.ts
lib/platform/route-access.ts
lib/platform/grants.ts
lib/platform/participation.ts
lib/platform/navigation.ts
lib/platform/routeGuard.ts
lib/platform/persona.ts
lib/platform/preflight.ts
lib/platform/adapters/grupos-vida.ts
lib/platform/operating-core/kinds.ts
lib/platform/operating-core/state.ts
lib/platform/operating-core/capture-states/capture-states.ts
lib/platform/operating-core/capture-ux/capture-ux-types.ts
lib/platform/operating-core/types.ts
lib/platform/dream-team/route-access.ts
lib/supabase/database.types.ts
```

## Estructura de archivos F4

```
lib/platform/pastoral/
├── flags.ts                    # Feature flags sibling (no toca lib/platform/flags.ts)
├── route-access.ts            # Route access predicates
├── types.ts                   # Tipos públicos
├── errors.ts                  # PastoralErrorCode discriminated union
├── capabilities.ts            # resolvePastoralCapability()
├── participation-kinds.ts      # 14 kinds con prefijo pastoral_
├── state.ts                  # ONE_ON_ONE_STATES + transitions
├── triad-state.ts            # TRIADA_STATES + TRIADA_TRANSITIONS
├── crisis/
│   ├── keyword-catalog.ts    # CRISIS_CATEGORIES (5 categorías, 30 keywords)
│   ├── detector.ts           # detectCrisisInText() puro
│   └── scan.ts               # scanAndAlert() + stub
├── one-on-one/
│   ├── repository.ts         # Interfaz
│   ├── repository-fake.ts    # Fake in-memory
│   ├── repository-supabase.ts # Adapter
│   ├── service.ts            # completeOneOnOneWithGrants()
│   ├── validators.ts         # validarResumen()
│   └── read-guard.ts         # canReadPastoralOneOnOneRoadmap()
├── triad/
│   ├── repository.ts
│   ├── repository-fake.ts
│   ├── repository-supabase.ts
│   ├── service.ts            # createTriadaWithAutoFormation()
│   ├── validators.ts        # Cardinalidad 3
│   └── read-guard.ts         # Excepción P7
├── mentor-cascade/
│   ├── mentor-cascade.ts    # resolverMentorOficial()
│   ├── pastoral-grupos-vida.ts
│   ├── pastoral-talleres.ts
│   └── pastoral-servicios.ts
├── notifications/
│   ├── outbox-mapper.ts
│   ├── reminder-cron.ts
│   └── expiring-cron.ts
├── metrics/
│   ├── metrics.ts
│   ├── metrics-repository.ts
│   ├── metrics-repository-fake.ts
│   └── types.ts
├── dashboards/
│   └── loader.ts             # loadPastoralDashboardData()
├── capture-ux/
│   └── pastoral-capture-ux.ts # CAPTURE_UX_STATES con shape pastoral
├── public-roadmap/
│   ├── types.ts
│   ├── load-public-roadmap.ts
│   └── next-step-suggestion.ts
├── participation-ledger-pastoral-writer.ts
├── adapters/
│   └── (W10 adapters)
└── build-pastoral-event.ts

supabase/migrations/
├── 20260722143357_pastoral_helper_auth_has_capability.sql  (M1)
├── 20260722143358_pastoral_tables_part1_one_on_one.sql    (M2)
├── 20260722172128_pastoral_tables_part2_triada.sql         (M3)
├── 20260722181344_pastoral_kinds_extension.sql             (M4)
├── 20260722181345_pastoral_sensitivity_extension.sql        (M5)
├── 20260723170000_pastoral_crisis_keyword_catalog.sql      (M6)
├── 20260723170001_pastoral_crisis_detection_log.sql       (M7)
└── 20260724000000_pastoral_seeding.sql                    (M8)

app/api/pastoral/
├── one-on-one/
│   ├── route.ts                          (POST create)
│   ├── [id]/route.ts                    (GET read)
│   ├── [id]/schedule/route.ts           (POST schedule)
│   ├── [id]/start/route.ts              (POST start)
│   ├── [id]/complete/route.ts          (POST complete)
│   ├── [id]/cancel/route.ts            (POST cancel)
│   ├── [id]/notes/route.ts             (GET/POST notes)
│   └── [id]/validate-step/route.ts    (POST validate)
├── triada/
│   ├── route.ts                        (POST create)
│   ├── [id]/route.ts                   (GET read)
│   ├── [id]/confirm/route.ts           (POST confirm)
│   ├── [id]/disband/route.ts          (POST disband)
│   └── [id]/notes/route.ts            (GET/POST notes)
├── crisis/
│   └── scan/route.ts                   (POST scan)
├── mentor-cascade/
│   └── resolve/route.ts                (GET resolve)
└── metrics/
    └── [card]/route.ts                (GET metric card)

app/(pastoral)/                           # Rutas UI pastorales
├── layout.tsx
├── lider/
│   ├── page.tsx                        (dashboard)
│   ├── uno-auno/
│   │   ├── page.tsx                   (listado)
│   │   └── [id]/
│   │       ├── page.tsx               (detalle)
│   │       └── captura/page.tsx       (captura rápida)
│   └── triada/
│       ├── page.tsx                   (listado)
│       └── [id]/page.tsx              (detalle)
├── asistido/
│   ├── page.tsx                        (roadmap público)
│   └── uno-auno/page.tsx             (listado)
└── pastor/
    ├── page.tsx                       (dashboard)
    ├── crisis/page.tsx                (lista crisis)
    └── lecturas/page.tsx               (lectura 1:1)

emails/pastoral-templates/               # 13 plantillas v1
__tests__/lib/platform/pastoral/         # Tests exhaustivos
```

## Nota sobre W14

W14 es el work unit de cierre de F4 e incluye:
- M8 seeding migration (catalog + test users)
- Extensiones flags + route-access (`getPastoralMetricsGate`, `hasPastoralMentorCascadeResolveCapability`, `hasPastoralCrisisDetectCapability`)
- e2e Ana pastoral test (MCP staging)
- Docs handoff
- Verificación byte-identity + invariantes

El PR de W14 se stacked a `main` después de W13 (`feat/333-W13-pastoral-ui`).
