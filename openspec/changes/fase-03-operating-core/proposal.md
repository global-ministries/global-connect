# Proposal: Fase 3 — Operating Core

## Intent

Downstream ministries duplicate event/registration/attendance/capacity/forms/resources/notification logic. Fase 3 ships one Operating Core so every downstream phase consumes one pipeline. Issue #261.

## Scope

### In Scope
- Events (`service | group_meeting | workshop | activity | custom`), lazy `EventInstance`; registrations with idempotent `(persona_id, event_id)` partial unique index, per-event `automatic|manual` confirmation, ordered waitlist, idempotent promotion.
- Visitor-resolution adapter reusing `usuarios.cedula` + `PlatformPersonaUsuario.cedula`; exact match reuses `usuarios.id`; auth via `usuarios.auth_id`; no duplicate rows; additive participation ledger (10 kinds) where `visitor_capture` records only non-PII metadata.
- Configurable Service schedules (multi-campus) + domain capture contracts over one ledger; no domain UI in Fase 3.
- Forms, resources, notification outbox (mirror `support_event_outbox`), Spanish templates, dashboards, read-only GDV bridge, capacity + scoped `operating_core.capacity.manage`.

### Out of Scope
Niños/Estudiantes/TLR/DPS flows, analytics, WhatsApp/SMS, payments, hardware, Fase 4, GDV redesign, workflow fixes.

## Capabilities

### New Capabilities
- `operating-core-events`: taxonomy/recurrence.
- `operating-core-services`: schedules/multi-campus.
- `operating-core-visitor-resolution`: identity/non-PII.
- `operating-core-registrations`: lifecycle/waitlist.
- `operating-core-participation-ledger`: kinds/guard.
- `operating-core-capacity`: base/override.
- `operating-core-forms`: schema/sub.
- `operating-core-resources`: media library.
- `operating-core-notifications`: outbox/templates.
- `operating-core-dashboards`: dashboards.
- `operating-core-capture-ux`: domain contracts over ledger.
- `operating-core-recurrent-events`: RRULE/materialisation.
- `operating-core-grupos-vida-bridge`: read-only adapter.
- `operating-core-api-surface`: capability/routes.

### Modified Capabilities
None (Fase 1/2 + GDV byte-identical; `buscar_usuarios_para_grupo` signature intact).

## Approach

Additive namespace `lib/platform/operating-core/**` (Fase 2 `dream-team/**`); one additive migration with RLS helper `auth_has_operating_core_capability(...)`. `uno_a_uno` blocked.

## Affected Areas

| Area | Impact |
|------|--------|
| `lib/platform/operating-core/**`, bridge, API, tests, migration | New |
| `lib/platform/experiences.ts`, `lib/supabase/database.types.ts` | Modified (additive) |
| Fase 1/Fase 2 protected modules, GDV tables/RPCs/RLS, workflows | Untouched |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema/API before SECURITY DEFINER audit; `visitor_capture` leaks PII; `rol === director` hard-coding; migration > 400-line; retention pre-legal; test timeout. | Med | Issue #103 closes first; non-PII schema with tests; `operating_core.capacity.manage`; sub-divide/`size:exception`; tables MUST NOT bake retention; restore green baseline. |

## Rollback Plan

Slice/flag-based, additive only. Each slice behind `NEXT_PUBLIC_OPERATING_CORE_*` flag; flip OFF or revert. Forward-compatible migration (no `DROP`/`ALTER`); reverting restores schema.

## Dependencies

Issue #103 closes before schema/API; green baseline (separate PR for `mobile-platform-navigation.test.tsx`); first PR drops `coverageThreshold` from `jest.config.ts`; Issue #261 approved

## Success Criteria

- [ ] 14 capabilities under `openspec/specs/operating-core/<name>/spec.md` with Given/When/Then
- [ ] Visitor resolution reuses `usuarios.cedula` + `PlatformPersonaUsuario.cedula`; ambiguity requires operator; only `no_match` creates minimal (`autoMerge=false`); non-PII `visitor_capture`
- [ ] Registration idempotency: partial unique index `(persona_id, event_id) WHERE estado <> 'cancelada'`; automatic confirms until `capacity_operativa` + waitlist; cancellation/capacity increase promotes next eligible
- [ ] Capability-scoped capacity (`operating_core.capacity.manage`; directors default); protected modules + GDV adapter byte-identical; `buscar_usuarios_para_grupo` signature unchanged; preflight blocked; no `uno_a_uno`/`one_on_one_logged`; Service schedules configurable; capture-ux domain-neutral
- [ ] Each slice ≤ 400 authored lines or `size:exception`; stacked-to-main; force-chained
