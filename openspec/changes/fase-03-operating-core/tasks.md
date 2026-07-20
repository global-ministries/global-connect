# Tasks: Fase 3 Operating Core

> force-chained, stacked-to-main, **Apply authorization: BLOCKED until explicit user approval**, post-`06c19be`; PRs from latest `main`.

## Review Workload Forecast

High risk; Chained; 24 slices (S03+S10 except.); ~6,700 + ~1,200 gen.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Shared Acceptance Gate

One `type:*`/slice; F(x)+runtime; RED→GREEN→REFACTOR; `pnpm test` green + `tsc --noEmit`. Zero diff on `lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts`, `lib/platform/dream-team/**`, `lib/platform/adapters/grupos-vida.ts`. `buscar_usuarios_para_grupo` byte-identical test MUST compare parameter NAMES (types sort); protect `{apellido,email,id,nombre,telefono,ya_es_miembro}` by name. Visitor: `decision === 'single_candidate' && matchedSignals.includes('cedula') && reviewRequired === false`; V/E cédula collision → ambiguous. ≤400 or size:exception. Multi-tenant OUT OF SCOPE. Dashboard: `lib/platform/operating-core/dashboards/loader.ts` ≠ `obtenerDatosDashboard.ts`. Threat matrix N/A (design.md); add `F(threat-matrix-<row>)` applicable (e.g., S11 token-replay).

**Legend.** I=own issue. F(x)=`pnpm test -- x --runInBand`. Harness `DB|HTTP|UI|OFF|N/A`. R=route auth/scope/flag/error RED (API).

## Prerequisites

- [ ] **S00** mobile-nav timeout + drop `coverageThreshold`, `I`, `type:bug`, `F(mobile-platform-navigation)` + `pnpm test:ci`, `UI`, revert=baseline, ~120
- [x] **S01** SECURITY DEFINER audit Issue #103 (S03 gate), `type:bug`, `F(OC/security-definer)`, `DB`, revert=grants, ~120
  - **NOTE**: Stop condition met — unbound p_auth_id found in Fase-2 protected paths (grupos-vida/asistencia domain). 33 unique functions documented for follow-up Issue #103. Zero unbound in Fase-3 (operating-core) confirmed. See docs/audit/security-definer-audit.md.

## Foundation

- [x] **S02** Pure contracts (types/errors/kinds/6-state/capture-states), `I`, `type:feature`, `F(OC/{types,errors,state,capture})`, `N/A`, revert=contracts, ~360
- [x] **S03** Migration events+services+EventInstance+RLS helper+types, `I`, `type:feature` `size:exception`, `F(OC/schema/migration-dry-run)`, `DB`, revert=unapplied, ~520
- [x] **S04** Repos+fakes events/services/EventInstance, `I`, `type:feature`, `F(OC/{repository,repository-fake})`, `N/A`, revert=repos, ~380
- [x] **S05** Event/service APIs, `I`, `type:feature`, `F(api/OC/{events,services})`, `HTTP`+`R`, revert=404, ~380
- [x] **S06** Visitor adapter cedula+persona, 11-kind guard, non-PII, `I`, `type:feature`, `F(OC/{visitor,kinds-guard})`, `N/A`+`DB`, revert=adapter, ~340
- [x] **S07** Participation ledger schema+repo, `I`, `type:feature`, `F(OC/ledger-repository)`, `DB`, revert=unapplied, ~360

## Registrations/Capacity/Forms/Resources

- [x] **S08** GDV bridge (idempotent), `I`, `type:feature`, `F(adapters/OC-grupos-vida)`, `N/A`+`DB`, revert=gone, ~320
- [x] **S09** 6-state registration contract+repo+fake, `I`, `type:feature`, `F(OC/registration-state)`, `N/A`, revert=repo, ~360
- [x] **S10** Migration registrations+partial unique+atomic `promote_waitlist`, `I`, `type:feature` `size:exception`, `F(OC/schema/registrations-parallel)`, `DB`, revert=unapplied, ~480
- [x] **S11** Public token + reg APIs, `I`, `type:feature`, `F(api/OC/registrations)` (expiry/replay/rate/disclosure; `F(threat-matrix-token-replay)`), `HTTP`+`R`, revert=404, ~380
- [x] **S12** Capacity contract+repo (≤base), `I`, `type:feature`, `F(OC/capacity)`, `N/A`, revert=override, ~300
- [x] **S13** Capacity schema+API+waitlist, `I`, `type:feature`, `F(api/OC/capacity)`, `HTTP`+`DB`+`R`, revert=404, ~360
- [ ] **S14** Forms contract+repo, `I`, `type:feature`, `F(OC/forms-contract)`, `N/A`, revert=repo, ~320
- [ ] **S15** Forms API+publish gating, `I`, `type:feature`, `F(api/OC/forms)`, `HTTP`+`R`, revert=404, ~340
- [ ] **S16** Resources contract+repo+API, `I`, `type:feature`, `F(OC+api/resources)`, `N/A`+`HTTP`+`R`, revert=resource-route+repo, ~280

## Notifications/Capture-UX/Dashboard/Recurrence/Rollout

- [ ] **S17** Outbox schema + drain dispatch, `I`, `type:feature`, `F(OC/outbox-drain)`, `DB`, revert=legacy drain, ~360
- [ ] **S18** `*.v1` Spanish templates, `I`, `type:feature`, `F(emails/OC-templates)`, `N/A`, revert=unused, ~280
- [ ] **S19** Read/sent state + 7-day TTL + retry/backoff, `I`, `type:feature`, `F(OC/notifications-state)`, `N/A`+`DB`, revert=notification-state, ~360
- [ ] **S20** Capture-UX contracts (domain-neutral), `I`, `type:feature`, `F(OC/capture-ux)`, `N/A`+`UI`, revert=stub, ~300
- [ ] **S21** Dashboard loader+widgets behind flag (`lib/platform/operating-core/dashboards/loader.ts`; distinct from `obtenerDatosDashboard.ts`), `I`, `type:feature`, `F(OC/dashboard-loader)`, `UI`+`OFF`, revert=unmount, ~280
- [ ] **S22** Recurrent materialization — verify `buscar_usuarios_para_grupo` byte-identical by parameter NAMES, `I`, `type:feature`, `F(OC/recurrent-events)`, `N/A`+`DB`, revert=recurrence, ~320
- [ ] **S23** Flags/route-access + rollout (signature guard by parameter NAMES), `I`, `type:feature`, `F(flags-route-access-compat-e2e)`, `OFF`+`R`, revert=kill-switch OFF, ~220

## Open Owner Gates

Issue #103 before S03; Engineering floors/retention/KPIs deferred; `pr-size.yml` out-of-scope.

## Totals

24 slices (2 prereq + 22 impl); 24 PRs; except. S03+S10.

Apply authorization: BLOCKED until explicit user approval.