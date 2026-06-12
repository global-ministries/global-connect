# Apply Progress: Support Ticket Production Readiness

## Status

- Change: `support-ticket-production-readiness`
- Mode: Strict TDD
- Artifact store: Hybrid
- Current status: 17/17 original tasks complete; critical verify fixes applied; ready for re-verify.
- Production mutation: None.

## Previous Evidence Preserved

Engram observation `#7330` recorded cumulative completion through PR5.3: all 17 OpenSpec tasks complete, staging migrations applied, staging RLS passed 12/12, and guarded non-production provider smoke checks passed for `inngest`, `external`, `r2`, and `resend`.

The previous apply-progress did not include an auditable Strict TDD Cycle Evidence table. Per the verify report, RED-cycle and safety-net evidence for the original 17 tasks cannot be reconstructed from the current artifacts without fabricating history. Existing tests and command output prove GREEN state, but not test-before-code ordering for every original task.

## Critical Fixes Applied

- Added reporter ticket creation audit events and post-commit ID-only event dispatch.
- Added reporter public message audit events.
- Added guarded support event provider dispatch and support-staff notification delivery that fetches active support staff recipients and uses the existing Resend helpers with per-recipient idempotency.
- Added an additive RLS/grant migration allowing authenticated reporters to append only their own reporter-created support audit events.
- Repaired local dependency installation from the frozen lockfile so `pnpm lint` can load `eslint-plugin-security` and execute.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 Reporter form fields | `__tests__/app/support-pages.test.tsx` | Integration | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 1.2 Subject mapping / safe results | `__tests__/lib/actions/support.actions.test.ts` | Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 1.3 Safe evidence / Sentry privacy | `__tests__/lib/support/sentry-privacy.test.ts`, `__tests__/lib/actions/support.actions.test.ts` | Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 1.4 Reporter UX/evidence tests | `__tests__/app/support-pages.test.tsx`, `__tests__/lib/actions/support.actions.test.ts` | Integration/Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 2.1 Inline upload progress/retry/finalize | `__tests__/app/support-pages.test.tsx`, `__tests__/app/support-attachments-route.test.ts` | Integration | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 2.2 Attachment metadata/downloads | `__tests__/app/support-pages.test.tsx`, `__tests__/app/support-attachments-route.test.ts` | Integration | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 2.3 Attachment accept/reject/retry/direct access tests | `__tests__/app/support-attachments-route.test.ts` | Integration | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 3.1 Capability-aware navigation | `__tests__/components/support-navigation.test.tsx` | Integration | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 3.2 Staff console lifecycle | `__tests__/app/support-pages.test.tsx`, `__tests__/lib/actions/support.actions.test.ts` | Integration/Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 3.3 Capability admin grant/revoke | `__tests__/lib/actions/support-capabilities.actions.test.ts` | Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 3.4 Staff/capability tests | `__tests__/components/support-navigation.test.tsx`, `__tests__/lib/actions/support-capabilities.actions.test.ts` | Integration/Unit | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 4.1 Inngest/Resend notifications | `__tests__/lib/support/inngest.test.ts`, `__tests__/app/support-inngest-route.test.ts`, `__tests__/lib/actions/support.actions.test.ts` | Unit/Route | Baseline before fix: focused tests produced RED failures for missing `dispatchSupportInngestEvent`, missing `deliverSupportNotificationEvent`, and no reporter event insert/dispatch | RED captured 2026-06-11: `dispatchSupportInngestEvent is not a function`, `deliverSupportNotificationEvent is not a function`, and `eventInsert` not called | GREEN captured 2026-06-11: focused 35/35 passing; full `pnpm test -- --runInBand` 149/149 passing | Added disabled-provider and configured-provider dispatch cases; added duplicate/no-email staff recipient case; added reporter audit/dispatch case | Dynamic email import prevents route import from loading Resend provider during tests; focused tests remained green |
| 4.2 External bridge | `__tests__/lib/support/external-bridge.test.ts`, `__tests__/app/support-external-route.test.ts` | Unit/Route | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 4.3 Notification/audit/duplicate/GitHub boundary tests | `__tests__/lib/support/inngest.test.ts`, `__tests__/lib/actions/support.actions.test.ts`, `__tests__/docs/support-operations.test.ts` | Unit/Docs | Baseline before fix: existing helper tests passed but new required behavior failed | RED captured 2026-06-11 for reporter audit events and support-staff delivery | GREEN captured 2026-06-11: focused 35/35 passing; full `pnpm test -- --runInBand` 149/149 passing | Added one notification per unique active support staff recipient and no sensitive payload assertions | Provider email import delayed; tests remained green |
| 5.1 Additive support migrations/types | `__tests__/supabase/support-ticket-system-migration.test.ts`, `pnpm lint:migrations` | Static/DB lint | Baseline before fix: migration lint passed with legacy warnings | RED not applicable to previous migrations; new reporter audit policy added after behavior tests failed | GREEN captured 2026-06-11: `pnpm lint:migrations` checked 159 files, 0 errors, 183 warnings, 121 info | New migration restricts insert to reporter-owned ticket events and specific reporter actions | No refactor needed |
| 5.2 Support operations docs | `__tests__/docs/support-operations.test.ts` | Docs static | Not reconstructable | Not reconstructable from current artifacts | Preserved by `pnpm test -- --runInBand` on 2026-06-11: 149/149 passing | Existing coverage present; ordering not reconstructable | Not reconstructable |
| 5.3 Verification commands/smoke | Command evidence | Command | Prior evidence from Engram `#7330`; current local rerun below | Not reconstructable for prior smoke cycle | Current GREEN: focused tests, full Jest, typecheck, migration lint, lint all executed | Command coverage covers fixed paths and full suite | Local dependency reinstall made lint executable |

## Current Verification

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm exec jest __tests__/lib/actions/support.actions.test.ts --runInBand` | Passed | 22/22 |
| `pnpm exec jest __tests__/lib/support/inngest.test.ts --runInBand` | Passed | 9/9 |
| `pnpm exec jest __tests__/app/support-inngest-route.test.ts --runInBand` | Passed | 4/4 |
| `pnpm exec jest __tests__/lib/support/inngest.test.ts __tests__/lib/actions/support.actions.test.ts __tests__/app/support-inngest-route.test.ts --runInBand` | Passed | 35/35 |
| `pnpm test -- --runInBand` | Passed | 19 suites, 149 tests; existing React `act(...)` warnings remain in support page tests |
| `pnpm exec tsc --noEmit` | Passed | No output |
| `pnpm lint:migrations` | Passed with warnings | 159 files checked, 0 errors, 183 warnings, 121 info; warnings are legacy/existing |
| `CI=true pnpm install --frozen-lockfile` | Passed | Recreated local `node_modules` from lockfile and installed `eslint-plugin-security` |
| `pnpm lint` | Passed with warnings | 0 errors, 453 warnings; lint now executes instead of failing on missing plugin |

## Remaining Risks

- Historical Strict TDD RED evidence for the original 17 completed tasks remains unavailable and is explicitly not reconstructed.
- No production provider call or production DB mutation was run.
- New migration is additive and locally linted, but not applied to staging in this fix pass.
- Existing lint warnings and React `act(...)` warnings remain outside this critical-fix scope.
