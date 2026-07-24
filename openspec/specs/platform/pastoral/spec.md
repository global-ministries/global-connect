# Spec: Pastoral

## Purpose

Define the Pastoral service domain: one-on-one (1:1) accompaniment between a formal leader (mentor) and a person being accompanied, and the triad (three-person pastoral conversation) involving the person, their official mentor, and a third pastoral actor. The domain supports individual and couple accompaniment, automatic mentor assignment via a cascade resolution (GDV → Taller → Servicio), visibility circles, crisis keyword detection, metrics, and notifications via the shared outbox.

The Pastoral domain reuses Phase 3 infrastructure (participation ledger, outbox, capability helpers) without modification. It introduces 13 capabilities + 1 crisis detection capability, all additive to the platform capability catalog.

---

## Capabilities

| Capability | ScopeType | Description |
|---|---|---|
| `pastoral.one_on_one.create` | one_on_one | Create a new 1:1 pastoral record |
| `pastoral.one_on_one.read` | one_on_one | Read 1:1 records per visibility circle |
| `pastoral.one_on_one.write_notes` | one_on_one | Add private notes to a 1:1 |
| `pastoral.one_on_one.validate_step` | one_on_one | Validate a spiritual step in a 1:1 |
| `pastoral.one_on_one.complete` | one_on_one | Complete a 1:1 with summary |
| `pastoral.triada.create` | triada | Create a triad (manual or automatic by new step) |
| `pastoral.triada.read` | triada | Read triad records per visibility circle |
| `pastoral.triada.write_notes` | triada | Add notes to a triad |
| `pastoral.triada.disband` | triada | Disband an active triad |
| `pastoral.metrics.read` | experiencia | Read pastoral metrics cards |
| `pastoral.read.all` | experiencia | Full read access for pastor/admin (no write/validate) |
| `pastoral.mentor.cascade.resolve` | experiencia | Resolve official mentor via cascade |
| `pastoral.crisis.detect` | experiencia | Detect crisis keywords on 1:1 close |

---

## Pastoral Decisions (P1–P16)

| ID | Decision | Description |
|---|---|---|
| P1 | GDV weights most | If person in active GDV season → GDV leader is official mentor |
| P2 | No mentor confirmation step | System assigns mentor automatically; leader does not confirm |
| P3 | Person cannot reject assignment | Accompanied person cannot reject the assigned mentor |
| P4 | Triad auto-created on new step | New step (taller, bautismo, servicio) triggers triad creation |
| P5 | Read vs validate separation | `pastoral.read.all` allows full read but NOT step validation |
| P6 | Person sees only roadmap | Accompanied person sees only aggregated roadmap, never private notes |
| P7 | Coordinator area exception in simultaneity | In simultaneity context, coordinator area cannot read other leaders' notes |
| P8 | Shared 1:1 for couples | Couple shares one 1:1 record, single summary at close |
| P9 | Marriage group milestones shared | Marriage group milestones projected to both partners' roadmaps; individual milestones not crossed |
| P10 | Both notified on schedule | On 1:1 scheduled, BOTH mentor and accompanied person receive notification |
| P11 | Both reminded | Reminder sent to both mentor and accompanied person (channels: email + WhatsApp; push deferred) |
| P12 | No hard metrics in MVP | No percentages, hard targets, or mid-term alerts in MVP |
| P13 | Triad: 3-person fixed cardinality | Exactly three persons required in a triad |
| P14 | No default mentor on cascade fail | Cascade returns explicit "no candidate" when person in no GDV/taller/servicio |
| P15 | Multi-tenant deferred | `church_id`/`campus_id`/`tenant_id` deferred to future phase |
| P16 | Crisis keyword detection | On 1:1 close, scan summary + notes for crisis keywords; auto-alert pastor/admin |

---

## Requirements

### Requirement: Experience and capability catalog

The system SHALL add `experience = 'pastoral'` to the platform experience catalog as a new entry, without modifying existing entries. Two new scope types SHALL be declared: `one_on_one` and `triada`. The system SHALL register 13 new capabilities plus `pastoral.crisis.detect` in the capability catalog.

#### Scenario: Additive experience declaration
- GIVEN the platform has Phase 1–3 experiences
- WHEN Phase 4 is deployed
- THEN existing experiences remain unchanged
- AND `pastoral` appears as an additional experience

### Requirement: Mentor cascade resolution

The system SHALL resolve the official mentor via a cascade: GDV leader → Taller leader → Servicio coordinator. If the person belongs to an active GDV season, that leader is the official mentor (P1). If not, but in a short-term taller, that leader is the mentor. If not, but serving in a team, the service coordinator is the mentor. If none, return explicit "no candidate" (P14). The assignment is automatic and cannot be rejected by the accompanied person (P2, P3).

#### Scenario: GDV leader as mentor
- GIVEN Ana belongs to Carlos's GDV group
- WHEN the cascade resolves Ana's mentor
- THEN Carlos is returned as the official mentor

#### Scenario: No candidate returned
- GIVEN Ana belongs to no GDV, no taller, no servicio
- WHEN the cascade resolves
- THEN explicit "no candidate" is returned
- AND no default mentor is proposed

### Requirement: One-on-one lifecycle states

The system SHALL support five 1:1 states: `pending_participant`, `scheduled`, `in_progress`, `completed`, `cancelled`. States `completed` and `cancelled` are terminal. Each write increments a `version` field; stale writes are rejected with 409 Conflict.

#### Scenario: Happy path transition
- GIVEN a 1:1 in `scheduled` state
- WHEN mentor transitions to `in_progress` then to `completed` with summary
- THEN both transitions succeed
- AND two immutable pastoral events are emitted

### Requirement: Triad lifecycle states

The system SHALL support three triad states: `pending_confirmation`, `active`, `disbanded`. State `disbanded` is terminal. Cardinality is fixed at exactly three persons: the accompanied person, the official mentor, and a third pastoral actor.

#### Scenario: Triad formed automatically on new step
- GIVEN Ana enrolls in a taller
- WHEN the new-step event persists
- THEN the system auto-creates a triad with type `nuevo_paso`
- AND the triad starts in `pending_confirmation` state

### Requirement: Four visibility circles

The system SHALL enforce four visibility circles for 1:1 and triad reading:

1. **Self (accompanied person)**: Only aggregated roadmap (dates, validated steps, next suggested step). Never sees private mentor notes (P6).
2. **Mentor author**: Full access to their own 1:1/triad records, including their private notes.
3. **Team/area director**: Aggregated view of their team's 1:1s/triads, no private notes.
4. **Pastor/Admin with `pastoral.read.all`**: Full read access but NOT step validation or write (P5).

#### Scenario: Accompanied person reads only roadmap
- GIVEN Ana is the accompanied person of a 1:1
- WHEN Ana queries her 1:1 from the public view
- THEN only roadmap data is returned (dates, mentor, state, validated steps, next step)
- AND private mentor notes are NOT included

#### Scenario: Pastor reads all but cannot validate
- GIVEN Pablo is pastor with `pastoral.read.all`
- WHEN Pablo queries any 1:1
- THEN full content including private notes is returned
- BUT Pablo cannot validate steps (P5)

### Requirement: Crisis keyword detection

When a mentor closes a 1:1 with state `completed`, the system SHALL analyze the bounded `resumen` (500 chars max) and the mentor's private notes for crisis keywords from a closed catalog: `duelo`, `crisis_matrimonial`, `ideacion_suicida`, `violencia_intrafamiliar`, `crisis_de_fe`. If a match is found, the system SHALL:

- Emit a `pastoral_crisis_detected` event to the participation ledger (sensitivity: `sensitive`)
- Queue an alert via the Phase 3 shared outbox using template `pastoral.crisis.alert.v1`
- Target recipients: pastor, admin with `pastoral.read.all`, and the mentor author

The original note content remains unchanged (P16, REQ-04 of crisis-keywords spec).

#### Scenario: Keyword detected and alert sent
- GIVEN Carlos closes a 1:1 with summary containing "falleció"
- WHEN the system analyzes the content
- THEN an alert is sent via shared outbox
- AND a `pastoral_crisis_detected` event is recorded with category `duelo`
- AND the original note remains intact

### Requirement: Shared 1:1 for couples

For couples (P8), the system SHALL maintain a single shared 1:1 record. When the mentor closes it, a single summary applies to both partners. The state transition is shared; no parallel transitions per person.

#### Scenario: Couple shares single 1:1
- GIVEN Ana and Luis are a couple with a shared 1:1
- WHEN Carlos closes the 1:1 with a summary
- THEN a single transition to `completed` is recorded
- AND both partners see the same summary

### Requirement: Metrics cards

The system SHALL expose four pure functions for the dashboard, accessible to enabled leaders and pastor/admin:

- `uno_auno_por_periodo`: Count of scheduled and closed 1:1s in selected window
- `lideres_activos_por_ventana`: Simple ranking of leaders by closed 1:1s
- `triadas_por_tipo`: Distribution of triads by type (`nuevo_paso` vs `simultaneidad`)
- `alarma_gdv_sin_uno_auno_en_90_dias`: Persons in active GDV with no closed 1:1 in 90 days, flagged to their GDV leader

Access requires `pastoral.metrics.read` or `pastoral.read.all`. No public dashboard (P12).

#### Scenario: 90-day alarm triggered
- GIVEN Ana is in an active GDV with no closed 1:1 in 90 days
- WHEN the alarm function runs
- THEN Ana appears in the alarm list
- AND the alarm is delivered to Ana's GDV leader

### Requirement: Notifications via shared outbox

The system SHALL deliver all pastoral notifications via the Phase 3 shared outbox (no parallel pastoral outbox). Each notification uses versioned templates with prefix `pastoral.`:

- `pastoral.one_on_one_scheduled.v1` → mentor + accompanied (P10)
- `pastoral.one_on_one_reminder.v1` → mentor + accompanied (P11)
- `pastoral.one_on_one_completed.v1` → area director
- `pastoral.one_on_one_cancelled.v1` → area director
- `pastoral.triada_formed.v1` → all three members
- `pastoral.triada_disbanded.v1` → all three members
- `pastoral.crisis_alert.v1` → pastor + admin + mentor author

Channels: email + WhatsApp (P11). Push notification deferred.

### Requirement: Byte-identity of protected modules

The system SHALL NOT modify any protected module from Phase 1, Phase 2, or Phase 3. All additions SHALL be additive: a new `lib/platform/pastoral/` sibling module, new API routes under `app/api/pastoral/`, new UI pages under `app/(pastoral)/`, and additive schema migrations.

#### Scenario: Protected modules unchanged
- GIVEN Phase 1–3 protected modules are inspected
- WHEN Phase 4 is applied
- THEN byte-for-byte comparison shows zero diff on all protected files

---

## Security Model

### Four Circles of Visibility

| Circle | 1:1 Access | Triad Access | Notes |
|---|---|---|---|
| Accompanied person | Aggregated roadmap only (P6) | Member view | No private notes |
| Mentor author | Full (own records) | Full (own records) | Own notes visible |
| Area director | Aggregated team view | Aggregated team view | No private notes |
| Pastor/Admin (`pastoral.read.all`) | Full read, no validate (P5) | Full read, no validate | Full audit log |

### Threats and Mitigations

| Threat | Mitigation |
|---|---|
| T1: Partial crisis keyword evasion | Full scan of summary + all mentor notes (not just first match) |
| T2: Private notes leaked via public roadmap | Field projection strips private notes before serialization |
| T3: Unauthorized write via stale version | Optimistic locking with version increment, 409 on stale |
| T4: Byte-identity drift | CI verification script runs `git diff` on all protected files |
| T5: Non-mentor validates step | Capability gate `pastoral.one_on_one.validate_step` restricted to mentor author |
| T6: Coordinator reads other leader's notes in simultaneity | Exception P7: deny in `contexto='simultaneidad'` when actor != note author |
| T7: Self-validation by accompanied person | Actor != mentor author rejection in validate-step endpoint |
| T8: Idempotent crisis detection | PK on `one_on_one_id` in `pastoral_crisis_detection_log` prevents duplicate alerts |
| T9: Sensitive data in event metadata | Bounded metadata; explicit ban on `cedula/telefono/email` in ledger payload |
| T10: Audit log bypass | Every `pastoral.read.all` GET appends to append-only audit table |
| T11: Cascade return false positive | Explicit "no candidate" returned when no GDV/taller/servicio (P14) |
| T12: SQL injection in repo writes | Parameterized queries in all Supabase adapters |

---

## Dependencies

- **F1 (Grupos de Vida)**: GDV membership, leadership roles → cascade input
- **F2 (Dream Team)**: Capability catalog pattern, repository interface pattern, fake repository for tests
- **F3 (Operating Core)**: Participation ledger (shared event table), shared outbox, capability resolution helper, RLS policies pattern

The Pastoral domain reuses:
- `operating_core_participation_eventos` table (additive `kind` values with `pastoral_` prefix)
- Phase 3 outbox (additive template keys with `pastoral.` prefix)
- `resolveOperatingCoreCapability` shape for `resolvePastoralCapability`

---

## Success Criteria

1. All 13 capabilities + `pastoral.crisis.detect` registered in `PLATFORM_CAPABILITIES`
2. Byte-identity verified: zero diff on all 20 protected modules from F1–F3
3. All 8 migrations applied: M1 (RLS helper), M2 (1:1 tables), M3 (triad tables), M4 (kinds extension), M5 (sensitivity extension), M6 (crisis keyword catalog), M7 (crisis detection log), M8 (seeding)
4. All 16 PRs merged to main (#335–#348, #350, #352)
5. `pnpm tsc --noEmit` returns 0 errors
6. 4 visibility circles enforced in all read endpoints
7. Crisis detection scans both `resumen` and notes, emits single alert per 1:1
8. Cascade resolves mentor for person in GDV/taller/servicio or returns explicit no-candidate
9. Notifications delivered via shared outbox, no parallel pastoral outbox
10. Metrics cards accessible only to authorized leaders and pastor/admin
