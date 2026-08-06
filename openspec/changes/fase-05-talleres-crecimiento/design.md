# Design: Fase 5 — Talleres de Crecimiento (Operating)

> Additive on F1+F2+F3+F4. Workshops = `OperatingCoreEvent(kind='workshop')` extended via additive sibling tables. 16 protected files byte-identical. Direct `auth.uid()` RLS with unique `_select/_insert/_update/_delete` suffixes. Capability inheritance derived from role + scope; no manual grants. Strict RED→GREEN→REFACTOR TDD.

Decision needed before apply: No | Chained PRs recommended: Yes | Chain: stacked-to-main | 400-line budget risk: High

## 1. Architecture overview

| Concern | Approach | Rationale |
|---|---|---|
| Workshop model | `talleres_crecimiento_metadata` FK → `operating_core_events(id)` with `kind='workshop'` | F3 already supports `kind='workshop'` (`operating-core/types.ts:18-24`); no new entity. |
| Coordinator/leader/volunteer | `taller_grupo_asignaciones` referencing `dream_team_servicios` rows with `experiencia='talleres_crecimiento'` | F2 enum already declares that experience; reuses team model byte-identical. |
| Enrollment | `taller_inscripciones` (additive) with couple-unit support | F3 6-state machine cannot express couple units + custom modality. |
| Attendance | `taller_asistencias` append-only; corrections via self-FK | R3 handoff; UPDATE `USING(false)` + append-only corrections. |
| F4 mentor-cascade adapter | Complete body of `lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` (signature intact) | F4 `mentor-cascade.ts:81-90` already consumes `resolverLiderDeTaller` as Level 2. |
| Capabilities | Derived from role + scope via trigger on `dream_team_servicios` + `taller_grupo_asignaciones` | Proposal §Capabilities; auto-revoke on deactivation. |

## 2. Module layout

```
lib/platform/talleres/
├── flags.ts, route-access.ts, capabilities.ts, participation-kinds.ts,
│   state.ts, errors.ts, types.ts, index.ts
├── enrollment.ts, groups.ts, attendance.ts, reports.ts, certificates.ts,
│   events.ts, metrics.ts, route-integration.ts, recurrence.ts
├── repository-supabase.ts, repository-fake.ts
├── participation-ledger-talleres-writer.ts
├── notifications/{outbox-mapper.ts, template-keys.ts}
├── dashboards/loader.ts
└── adapters/{operating-core-supabase-adapter.ts, dream-team-supabase-adapter.ts}
app/api/talleres/{workshops,inscripciones,grupos,sesiones,asistencia,reportes,certificados,eventos,metricas,ruta-integracion}/...
app/(auth)/talleres/{explorar,mis-talleres,historial,certificados/[id],equipo/*,coordinacion/*,direccion/*}/...
app/verificar-certificado/[codigo]/page.tsx
```

## 3. Data model (14 additive tables; `database.types.ts` regenerated)

| Table | Key columns |
|---|---|
| `talleres_crecimiento_metadata` | `operating_core_event_id UNIQUE FK`, `tipo∈{individual,pareja}`, `link_type∈{matrimonio,novios}`, `modalidad_inscripcion∈{periodo_general,permanente_custom}`, `recurrence_rule jsonb`, `periodo_general_id FK`, `estado∈{borrador,abierto,en_curso,cerrado,cancelado}`, `nombre_snapshot`, `sesiones_snapshot`, `duracion_estimada_minutos_snapshot`, `modalidad_inscripcion_snapshot`, `firmantes jsonb`, `version` |
| `talleres_crecimiento_cohortes` | `taller_id FK`, `dream_team_equipo_id FK`, `edicion`, `started_at`, `ended_at`, `version` |
| `taller_inscripciones` | `taller_id`, `cohorte_id`, `persona_principal_id`, `companero_id`, `link_type`, `estado∈{pendiente,aprobado,no_aprobado}`, `motivo_no_aprobado` (internal), `ocurrencia_objetivo`, `unit_estado`, `unit_estado_report_id`, `version`, `UNIQUE(taller_id,cohorte_id,persona_principal_id)` |
| `taller_grupos` | `cohorte_id`, `nombre`, `estado∈{activo,completado,cancelado}`, `capacidad`, `completed_at`, `version` |
| `taller_grupo_asignaciones` | `grupo_id`, `persona_id`, `rol∈{lider,voluntario}`, `activo`, `started_at`, `ended_at`, `motivo_retiro`, `approved_by_director_id` |
| `taller_sesiones` | `grupo_id`, `numero`, `fecha_programada`, `fecha_realizada`, `meeting_time_override`, `meeting_time_applies_to∈{this_session,this_and_subsequent}`, `estado∈{programada,en_curso,cerrada,cancelada}`, `UNIQUE(grupo_id,numero)`, `version` |
| `taller_asistencias` | `sesion_id`, `inscripcion_id`, `persona_id`, `estado∈{presente,ausente,no_aplica}`, `correccion_de_asistencia_id` self-FK, `version`, `UNIQUE(sesion_id,inscripcion_id)` |
| `taller_reportes` | `grupo_id`, `estado∈{borrador,enviado,reabierto,cerrado}`, `observaciones_generales NOT NULL`, `firma_lider_persona_id`, `firma_lider_fecha`, `reabierto_por_persona_id`, `reabierto_motivo`, `version` |
| `taller_reporte_correcciones` | `reporte_id`, `autor_persona_id`, `contenido_anterior jsonb`, `contenido_nuevo jsonb`, `motivo NOT NULL`, append-only |
| `taller_eventos` | `taller_id`, `cohorte_id`, `grupo_id`, `persona_id`, `actor_persona_id`, `schema_version`, `payload jsonb` (sensitive-excluded), `occurred_at`, `emitted_to_outbox` |
| `taller_certificados` | `inscripcion_id`, `codigo_verificacion UNIQUE` (base32-url-safe 16 chars), `taller_id`, `nombre_taller_snapshot`, `nombre_participante_snapshot`, `fecha_completitud`, `firmantes_snapshot jsonb`, `pdf_storage_path`, `revocado_at` |
| `taller_catalogo_etiquetas` | `PRIMARY KEY(taller_id, etiqueta)` |
| `taller_periodos_generales` | `fecha_apertura_automatica`, `fecha_cierre_automatico`, `fecha_apertura_manual`, `fecha_cierre_manual`, `fecha_cierre_real GENERATED COALESCE`, `motivo_cierre` |
| `taller_solicitudes_retiro` | `inscripcion_id\|grupo_asignacion_id`, `solicitante_persona_id`, `tipo∈{participante_retiro,equipo_retiro_definitivo}`, `motivo NOT NULL`, `estado∈{pendiente,aprobada,rechazada}` |

**5 new shared-ledger kinds** (additive CHECK on `operating_core_participation_eventos`; `lib/platform/operating-core/kinds.ts` byte-identical): `taller_cohort_started`, `taller_session_attended`, `taller_session_missed`, `taller_completion_recorded`, `taller_completion_failed` (all `sensitivity='internal'`).

**Snapshot rationale:** `nombre_snapshot`/`sesiones_snapshot`/`duracion_estimada_minutos_snapshot`/`modalidad_inscripcion_snapshot` freeze per-record at creation so modality changes never mutate in-flight inscriptions (R7/R10 catalog spec) and certificate history stays stable.

## 4. Authorization & RLS

```sql
CREATE FUNCTION public.auth_has_talleres_capability(p_capability_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.dream_team_capability_grants g
    WHERE g.persona_id = auth.uid() AND g.capability_key = p_capability_key
      AND g.experience = 'talleres_crecimiento' AND g.revoked_at IS NULL)
$$;
```

**Scope helpers** (mirror F4 `puede_*`): `puede_editar_taller_grupo`, `puede_gestionar_participantes_taller_grupo`, `puede_ver_taller_grupo`. All `LANGUAGE sql STABLE SECURITY DEFINER`.

**Capability inheritance** (trigger on `dream_team_servicios` + `taller_grupo_asignaciones`; precedent `20260727000000_pastoral_auto_grant_on_role.sql`):

| Source-of-truth row | Auto-granted (scope = taller_id) |
|---|---|
| `dream_team_servicios` `experiencia='talleres_crecimiento'` `rol='director'` `estado='activo'` | `director.{read,write}`, `admin.manage`, `metrics.read` |
| `taller_grupo_asignaciones` `rol='lider'` `activo=true` | `lead.{read,write}` |
| `taller_grupo_asignaciones` `rol='voluntario'` `activo=true` | `volunteer.read` |
| `dream_team_servicios` `rol='coordinador'` member of cohort's `dream_team_equipo_id` `estado='activo'` | `coordinator.{read,write}`, `metrics.read` |
| `taller_inscripciones` `estado='aprobado'` for persona | `participation.read` |
| `usuario_roles` `rol='admin'` | `admin.manage` (experience scope) |

**13 capabilities** additively registered in `lib/platform/experiences.ts:20-76` (closes pre-existing `admin.manage` gap at `navigation.ts:93`): `talleres_crecimiento.{director.{read,write}, admin.manage, coordinator.{read,write}, lead.{read,write}, volunteer.read, participation.read, metrics.read, team.serve, integration.read, certificates.verify}`. All `experience:'talleres_crecimiento'`, `scopeType:'taller'` (except `certificates.verify` unauthenticated public read by codigo).

**RLS pattern:** `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` from anon/authenticated + 4 policies per table with unique `_select/_insert/_update/_delete` suffixes. Direct `auth.uid()` (never `current_persona_id()`). service_role bypass via GRANT.

## 5. Protected files (16, byte-identity CI guard)

```
lib/platform/{flags,route-access,grants,participation,navigation,routeGuard,persona,preflight}.ts
lib/platform/adapters/grupos-vida.ts
lib/platform/operating-core/{kinds,state,capture-states/capture-states,capture-ux/capture-ux-types,types}.ts
lib/platform/dream-team/route-access.ts
lib/supabase/database.types.ts
```

`lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` body change permitted; signature intact. CI guard: `git diff main...HEAD -- <protected>` empty.

## 6. API design

Capability-gated `route.ts` at `app/api/talleres/**` + unauthenticated `app/api/public/verificar-certificado/[codigo]/route.ts`. Server actions co-located in `app/(auth)/talleres/**/actions.ts`. Deny-by-default: 401 unauth, 403 missing cap, 404 flag off, 409 stale `version`, 400 invalid input.

Key endpoints: `GET/POST /api/talleres/workshops`, `POST /workshops/[id]/transition`, `POST /inscripciones/[id]/{approve,reject,resume}`, `POST /grupos/[id]/assignments`, `POST /sesiones/[id]/{abrir,cerrar,asistencia}`, `POST /grupos/[id]/reporte/{enviar,reabrir}`, `GET /api/talleres/{certificados,metricas,ruta-integracion/snapshot}`. Rationale: REST for read-heavy/dashboard queries; server actions for write forms co-located with RSC pages. Mirrors F4 `app/api/pastoral/**` precedent.

## 7. State machines (`lib/platform/talleres/state.ts`)

```
workshop:    borrador → abierto → en_curso → cerrado (terminal)
                                       ↘ cancelado (terminal; motivo obligatorio)
participant: pendiente → aprobado → unit_estado (completado|no_completado|abandono)
             pendiente → no_aprobado → pendiente (only while period active)
report:      borrador → enviado → reabierto (motivo obligatorio) → cerrado
                                                  ↑ only reopener can edit
```

Optimistic concurrency via `version`; stale writes → 409. Terminal states reject all transitions.

## 8. Events & metrics

**Events** (`lib/platform/talleres/events.ts`, `schemaVersion:'v1'`): each carries `taller_id`, `cohorte_id`, `grupo_id?`, `persona_id`, `actor_persona_id`, `occurred_at`. Sensitive fields excluded. Emitted via `participation-ledger-talleres-writer.ts` to shared ledger with `kind ∈ taller_*`; no external channels.

**Metrics** (`lib/platform/talleres/metrics.ts`): role-scoped via session capability. `finalizationRateByTaller(tallerId)`, `finalizationRateByPeriodoGeneral(periodoId)`, `inscripcionesActivas(tallerId)`, `asistenciaPromedio(tallerId)`, `noAprobadosPorMotivo(tallerId)` (internal). Rate = `completados / total_con_estado_final`.

## 9. UI / navigation

Capability-filtered group `Talleres de Crecimiento` rendered via additive extension to `usePlatformNavigationViewItems` (`components/ui/platform-navigation-view-items.ts`; sidebar-moderna.tsx + header-movil.tsx untouched beyond new MenuItem definition). Sub-items per role union:

| Sub-item | Cap | Roles |
|---|---|---|
| Explorar/Mis-Talleres/Historial/Certificados | `participation.read` | P |
| Mis-Grupos/Próximas-Sesiones/Recursos | `lead.read` \| `volunteer.read` | L, V |
| Resumen/Inscripciones-Pendientes/Talleres/Equipos/Reportes | `coordinator.read` | C |
| Resumen-Global/Talleres/Periodos/Equipos/Solicitudes/Métricas/Reportes | `director.read`/`metrics.read` | D |

Counter badges via `BadgeSistema`; FAB from Grupos de Vida reused. Multi-role users see union of inherited sub-items.

## 10. Route integration layer

`lib/platform/talleres/route-integration.ts`: versioned contract `SCHEMA_VERSION='v1'` exposing ONLY `taller_id`, `nombre` (snapshot), `tipo`, `edicion`, `periodo{id,nombre,fecha_cierre_real}`, `sesiones_total`, `estado`, `inscripcion.{estado,unit_estado,fecha_completitud}`, `certificado.{id,codigo_verificacion,emitido_at}`. EXCLUDES motivos, attendance rows, group notes, correction history, contact data. Future Path modules MUST consume via contract; CI grep guard blocks `taller_*` table access from `app/(pastoral)/ruta/**`.

## 11. Certificate subsystem

`lib/platform/talleres/certificates.ts`: `generateCertificateForInscription(inscripcionId, actorPersonaId)`, `verifyCertificate(codigo)` (unauthenticated), `composeCertificatePdf(snapshot)`. Codigo = base32-url-safe 16 chars of `randomUUID()`. QR embedded as SVG in PDF → resolves to `${PUBLIC_BASE_URL}/verificar-certificado/${codigo}`. Signers snapshot at completion from `talleres_crecimiento_metadata.firmantes`. Public page renders ONLY non-sensitive data; invalid/revoked codes return friendly neutral error.

## 12. Recurrence & period scheduling

`lib/platform/talleres/recurrence.ts`: `periodo_general` reads `taller_periodos_generales.fecha_cierre_real = COALESCE(manual, automatic)` (R1). `permanente_custom` reads `recurrence_rule jsonb` and computes next occurrence via existing F3 recurrence engine. Reschedule ONLY when inscription `pendiente` at start (R2). Scheduled job `talleres_period_closer` detects overdue `en_curso` talleres and emits internal notice; never auto-closes (R5 closed decision).

## 13. Migration strategy

| File | Slice |
|---|---|
| `<ts>_talleres_helper_auth_has_capability.sql` | §4 helper + scope helpers |
| `<ts>_talleres_tables_metadata_cohortes.sql` | metadata + cohortes + indexes |
| `<ts>_talleres_tables_inscripciones_grupos.sql` | inscripciones + grupos + asignaciones |
| `<ts>_talleres_tables_sesiones_asistencia.sql` | sesiones + asistencias + immutability |
| `<ts>_talleres_tables_reportes_eventos.sql` | reportes + correcciones + eventos |
| `<ts>_talleres_tables_certificados_periodos.sql` | certificados + periodos_generales + solicitudes_retiro |
| `<ts>_talleres_kinds_extension.sql` | §3 CHECK extension (5 taller_*) |
| `<ts>_talleres_role_auto_grant.sql` | §4 inheritance trigger |
| `<ts>_talleres_period_closer.sql` | §12 scheduler |
| `<ts>_talleres_seed_initial_grants.sql` | initial director grants |

All `IF NOT EXISTS` / `CREATE OR REPLACE`, additive only.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Orphan inscriptions after modality change | Snapshot `modalidad_inscripcion_snapshot`; modality change never mutates in-flight rows. |
| Silent rescheduling | Scheduler emits event with old+new occurrence; coordinator UI surfaces rescheduled state. |
| Cross-scope leakage | All RLS via `auth_has_talleres_capability` + `puede_*` helpers; matrix tests cover all role × scope combos. |
| Capability/navigation drift | Auto-grant trigger closes `admin.manage` gap; CI guard rejects drift between `navigation.ts` and `experiences.ts`. |
| GDV-parity drift | Shared design system; `talleres/dashboards/parity.test.ts` enforces visual parity. |
| Oversized slices | Chained PRs under `force-chained stacked-to-main`; `sdd-tasks` forecasts; `size:exception` only for table/UI slices. |
| Sensitive data leak via integration | Contract field allowlist; CI grep guard blocks raw table access from `app/(pastoral)/ruta/**`. |
| Capability auto-grant drift | Trigger scopes via `source='role-auto-grant'`/`source='taller-asignacion-auto-grant'`; manual grants stay distinct. |

## 15. Implementation plan — chained PRs (~19 slices)

Rough ordering: capability + adapter → catalog → enrollment → groups + assignments → attendance + sessions → resources → reports → certificates → events → metrics → integration layer → UI.

| # | Slice | Lines | `size:exception` |
|---|---|---|---|
| W0 | Hygiene + CI byte-identity guard + preflight | ~80 | — |
| W1 | Participation kinds sibling + tests | ~150 | — |
| W2 | Helper + scope helpers + migration + tests | ~250 | — |
| W3 | Capabilities extension + auto-grant trigger | ~200 | — |
| W4 | metadata + cohortes + RLS | ~450 | yes |
| W5 | inscripciones + grupos + asignaciones + RLS | ~450 | yes |
| W6 | sesiones + asistencias + immutability + RLS | ~400 | — |
| W7 | state.ts + transitions tests | ~350 | — |
| W8 | reportes + correcciones + signature + RLS | ~400 | — |
| W9 | eventos + taller_* kinds migration + writer | ~350 | — |
| W10 | certificados + QR + verification route/page | ~500 | yes |
| W11 | periodos_generales + solicitudes_retiro + scheduler | ~400 | — |
| W12 | API: workshops/inscripciones/grupos | ~500 | yes |
| W13 | API: sesiones/asistencia/reportes/certificados | ~500 | yes |
| W14 | API: eventos/metricas | ~350 | — |
| W15 | F4 mentor-cascade adapter completion | ~200 | — |
| W16 | Route-integration contract | ~300 | — |
| W17 | UI: navigation extension + sidebar/header | ~250 | — |
| W18 | UI: participante RSC pages + actions | ~600 | yes |
| W19 | UI: equipo/coordinacion/direccion dashboards + verification page | ~700 | yes |

## 16. Open questions for `sdd-tasks`

- OQ-1: Confirm final list of 5 `taller_*` kinds vs add `taller_inscripcion_rescheduled`.
- OQ-2: `persona_principal_id` vs `usuario_id` reference (F3 schema uses `usuario_id`).
- OQ-3: `firmantes` JSON shape (`{persona_id, rol_etiqueta, orden}[]` vs simpler `{nombre, rol}[]` snapshot).
- OQ-4: `firma_lider_persona_id` required when `estado='borrador'` or only `enviado`.

No blockers for `sdd-design`.
