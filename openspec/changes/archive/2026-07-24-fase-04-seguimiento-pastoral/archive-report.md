# Archive Report: Fase 4 — Seguimiento Pastoral

## Status

Archived successfully. The Pastoral domain spec has been consolidated into the main tree at `openspec/specs/platform/pastoral/spec.md`.

## Summary

The `fase-04-seguimiento-pastoral` change was archived after confirming all 16 implementation PRs were merged to main (#335–#348, #350, #352). The change introduces the Pastoral service domain with 1:1 accompaniment, triad support, mentor cascade resolution, crisis keyword detection, metrics, and notifications via the Phase 3 shared outbox. All 17 delta specs were consolidated into a single canonical spec preserving requirements, scenarios, the 16 pastoral decisions (P1–P16), the four visibility circles security model, and the 12 threats mitigations.

## Gates Checked

| Gate | Result | Evidence |
|------|--------|----------|
| Task completion | Passed | 16 PRs merged to main; implementation complete per orchestrator confirmation |
| Critical verification issues | Passed | CRITICAL verification issues: None |
| OpenSpec sync | Passed | `openspec/specs/platform/pastoral/spec.md` created from 17 delta specs |
| Archive move | Passed | Change folder moved to `openspec/changes/archive/2026-07-24-fase-04-seguimiento-pastoral/` |
| Active change cleanup | Passed | `openspec/changes/fase-04-seguimiento-pastoral/` no longer exists |
| Byte-identity | Pending | To be verified via `pnpm tsc --noEmit` and CI byte-identity check |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `platform/pastoral` | Created | 13 capabilities + `pastoral.crisis.detect`, 16 pastoral decisions (P1–P16), 4 visibility circles, 12 threat mitigations |

### Consolidated Requirements

- Experience and capability catalog (additive to platform)
- Mentor cascade resolution (GDV → Taller → Servicio)
- One-on-one lifecycle (5 states, versioned)
- Triad lifecycle (3 states, fixed 3-person cardinality)
- Four visibility circles (self, mentor, director, pastor/admin)
- Crisis keyword detection (closed catalog, auto-alert)
- Shared 1:1 for couples (single record, single summary)
- Metrics cards (4 functions)
- Notifications via shared outbox (13 templates)
- Byte-identity of protected modules

### Archive Contents

- `proposal.md`
- `specs/` (17 delta specs)
- `design.md`
- `tasks.md`
- `archive-report.md`

## Implementation Summary

### PRs Merged

- #335, #336, #337, #338, #339, #340, #341, #342, #343, #344, #345, #346, #347, #348, #350, #352 (16 PRs total)

### Migrations Applied

- M1: `pastoral_helper_auth_has_capability` RLS helper
- M2: 1:1 tables (`pastoral_one_on_one`, `pastoral_one_on_one_participantes`, `pastoral_one_on_one_notas`)
- M3: Triad tables (`pastoral_triada`, `pastoral_triada_miembros`, `pastoral_triada_eventos`)
- M4: Kinds extension (14 new `pastoral_` kinds)
- M5: Sensitivity extension (adds `sensitive`)
- M6: Crisis keyword catalog (`pastoral_crisis_keyword_catalog`)
- M7: Crisis detection log (`pastoral_crisis_detection_log`)
- M8: Seeding (capability grants for leaders, coordinators, pastor/admin)

### Capabilities Added

- `pastoral.one_on_one.{create,read,write_notes,validate_step,complete}`
- `pastoral.triada.{create,read,write_notes,disband}`
- `pastoral.metrics.read`
- `pastoral.read.all`
- `pastoral.mentor.cascade.resolve`
- `pastoral.crisis.detect`

## Apply Progress

The implementation is complete and merged to main. The feature flag remains OFF pending explicit user authorization for activation. Apply authorization status: **BLOCKED until flag activation**.

## Next Steps

1. **Fase 5 — Talleres de Crecimiento**: Next phase in the roadmap
2. Flag activation: User must explicitly enable `pastoral` feature flag
3. Post-activation verification: Run full test suite and confirm metrics dashboard renders

## Source of Truth

The canonical spec now lives at `openspec/specs/platform/pastoral/spec.md` and reflects the full Pastoral domain behavior.

## Handoff Reference

- Full handoff: `docs/roadmap/handoffs/fase-04-seguimiento-pastoral.md`
- Rollout doc: `docs/roadmap/handoffs/fase-04-rollout.md`
- Roadmap maestro: `docs/roadmap/globalconnect-roadmap-maestro-v1.md`

## Sign-off

Archived by SDD workflow on 2026-07-24.
