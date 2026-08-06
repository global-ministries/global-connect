# Proposal: Phase 5 — Growth Workshops

## Intent
F5 operationalizes workshops as auditable pastoral programs—catalog, enrollment, groups, sessions, completion, history, and certificates—for participants/staff. It closes workshop-navigation/mentor-adapter gaps and prepares the Spiritual Growth Path (Ruta de Crecimiento Espiritual) contract.

## Scope
**In:** catalog/editions; individual/couple workshops (`matrimonio`/`novios`); general periods or permanent/custom recurrence; roles/capabilities; simultaneous groups; resources; sequential attendance; reports/history; certificates; internal events; metrics; APIs/UI; Path layer.

**Out:** curriculum/assessments/academic certification; marketplace/payments/checkout/logistics; email/push/WhatsApp; advanced analytics; multi-tenant/campus; full Path; Grupos de Vida redesign; `uno_a_uno`; destructive DDL.

## Personas and contract
**Roles:** Director General—catalog/periods, team authorization, withdrawals, coordinator powers; Coordinador—assigned workshops, approvals, groups/team, content/resources, withdrawal requests; Líder—group attendance/session closure, manual final status/report, meeting time; Voluntario—assigned-group read access; Participante—enrollment and own workshop/group/resources/status/history/certificate.

**Hierarchy:** `Taller → Coordinadores → grupos simultáneos → Líderes/Voluntarios/Participantes`; one role per workshop, Director General dual-role exception. Enrollment is per person; couples enroll as one unit (individual attendance, one outcome/report). Registration is `pendiente → aprobado | no aprobado`; modality changes never affect existing registrations.

**Operations:** attendance is `Presente/Ausente`, immutable after save, sequential. Leader decides completion; group completes after sessions/attendance/reports close. Submitted reports lock; coordinator/director may reopen with reason; only the reopener edits/re-publishes. D15–D26: workshop `borrador→abierto→en_curso→cerrado|cancelado`; participant `inscripto→asistiendo→completado|abandono|no_completado`; five `taller_*` kinds; both modes; live/snapshot resources; group-owned reports; PDF/QR certificates; versioned internal events; dedicated Path layer.

**Certificates/metrics:** completion produces a non-sensitive PDF/QR verified at `/verificar-certificado/[codigo]`; metrics expose rates/counts by workshop, period, edition, and type. Events have no delivery channels.

## Capabilities and Role Inheritance

Capabilities in F5 are **derived from role and scope**, not assigned manually. Each role brings the set of `talleres_crecimiento.*` capabilities it needs to operate; revocation is automatic when the role or assignment ends. This avoids manual grants and keeps authorization predictable.

### Inheritance model

| Role | Inherited capability set | Source of truth |
|---|---|---|
| `director_general` (de Talleres) | `talleres_crecimiento.director.*` (full) | Global role; inheres all workshop capabilities |
| `coordinador` (per Taller) | `talleres_crecimiento.coordinator.*` + scoped `lead.*` / `volunteer.*` | `taller_coordinadores` membership per Taller |
| `lider` (per Grupo) | `talleres_crecimiento.lead.*` | Active `taller_grupo_asignaciones` with `rol='lider'` |
| `voluntario` (per Grupo) | `talleres_crecimiento.volunteer.*` (read-only) | Active `taller_grupo_asignaciones` with `rol='voluntario'` |
| `participante` (per Inscripción) | `talleres_crecimiento.participation.*` | Active `taller_inscripciones` with `estado='aprobado'` |

### Rules

1. The Director General inherits the full set without manual grants.
2. Coordinators, leaders, and volunteers inherit capabilities **proportional to the scope of their assignment** (taller or grupo). Removing the assignment revokes capabilities automatically.
3. Participants inherit only the capabilities needed for their own enrollment, history, and certificate.
4. The UI capability filter resolves inheritance at session time; no item appears in the sidebar if no inherited capability is present.
5. A user with multiple roles (e.g., Director General who is also a leader in a specific group) sees the union of inherited capabilities, scoped per assignment.
6. `sdd-spec` locks the canonical key names, suffixes, and SQL helper functions. No manual grants exist at the user level.

## Affected Areas and Approach
Additive `lib/platform/talleres/**`, `app/api/talleres/**`; URLs `/talleres/{explorar,mis-talleres,historial,certificados/[id]}`, `/talleres/equipo/*`, `/talleres/coordinacion/*`, `/talleres/direccion/*`, `/verificar-certificado/[codigo]`. Capability-filtered `Talleres de Crecimiento` group: P[Explorar,Mis-Talleres,Historial];V[Mis-Grupos,Próximas-Sesiones,Recursos];L[Mis-Grupos,Asistencia,Reportes-Finales,Recursos];C[Resumen,Inscripciones-Pendientes,Talleres,Equipos,Reportes];D[Resumen-Global,Talleres,Periodos,Equipos,Solicitudes,Métricas,Reportes]. Extend `OperatingCoreEvent(kind='workshop')`, Dream Team/shared ledgers, RLS helper, and Path adapter; reuse SistemaDiseno/GDV visual patterns, not GDV permissions. Force-chain slices under 400 reviewed lines.

## Risks and Threats
Orphaned/rescheduled registrations, cross-scope leakage, capability/navigation or GDV-parity drift, protected-file drift, and oversized slices; mitigate with binding/audit, RLS/projections/snapshots, parity/byte tests, kill-switch flags, and chained review.

## Non-negotiable Principles
Handoff’s 16 protected files stay byte-identical; direct `auth.uid()` (never `public.current_persona_id()`); unique policy suffixes `_select/_insert/_update/_delete`; strict RED–GREEN–REFACTOR TDD; additive DDL; multi-tenancy deferred; existing UI system; dynamic menus; internal events/no channels; payments out.

## Rollback Plan
Disable `NEXT_PUBLIC_TALLERES_*`, hide navigation, stop new writes, preserve history, revert slices, and use forward-only corrective migrations—never drop data or protected files.

## Dependencies
F1–F4, Operating Core, Dream Team, Pastoral adapter, Supabase Auth/RLS, staging, SistemaDiseno.

## Success Criteria
Role/type/mode flows, attendance/reports/certificates, metrics/events/routes, authorization, byte checks, `pnpm test`, and `tsc --noEmit` pass.

## Open Questions
None blocking; final schema, event payloads, and capability names are locked in `sdd-spec`/`sdd-design`.
