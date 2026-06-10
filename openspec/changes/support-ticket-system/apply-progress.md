# Apply Progress: Support Ticket System

## Status

- Mode: Strict TDD
- Delivery: force-chained
- Chain strategy: feature-branch-chain
- Current slice: Phase 3, tasks 3.1, 3.2, 3.3, and 3.4 completed with reporter-safe support actions, `/ayuda` reporter pages, toast-to-link navigation replacement, privacy-hardened evidence persistence, and focused/full CI verification.
- Completed tasks: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4
- Latest update: Reporter ticket flow is implemented under the Phase 3 boundary. Server actions use authenticated Supabase server clients and RLS for create/list/detail/reply, evidence fields are allowlisted, route evidence is stripped of query/hash before persistence, browser/OS/viewport/app/Sentry diagnostics are only persisted with reporter consent, reporter detail messages explicitly filter public/non-internal messages, raw Supabase errors are mapped to stable user-safe action messages, reporter pages are server-rendered App Router routes, and navigation now links to `/ayuda` instead of showing “Próximamente” toasts.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `__tests__/supabase/support-ticket-system-migration.test.ts` | Unit/static migration contract | N/A (new files) | Blocked by missing `pnpm`/`corepack`; test written before migration and references missing migration | Verified via `node -e` contract assertions; `pnpm` unavailable | 3 cases cover tables/RLS, private helpers/no anon grants, FTS/append-only events | Fixed SQL creation order for `support_private.has_capability()` after table creation |
| 1.1 review fix | `__tests__/supabase/support-ticket-system-migration.test.ts` | Unit/static migration contract | Existing review findings | Review found over-broad reporter/internal message reads, direct audit inserts, unsafe ticket/attachment direct mutation, and admin-only capability bypass | `npx jest __tests__/supabase/support-ticket-system-migration.test.ts --runInBand` passed | 9 cases now cover destructive SQL absence, event insert/grant denial, internal message filtering, direct insert/update invariants, and explicit support capability gates | Removed direct client event insert/update paths, removed attachment update path, constrained ticket/attachment inserts, and aligned support capability helper to admin plus explicit capability |
| 1.2 partial | `__tests__/lib/support/capabilities.test.ts` | Unit/domain constants | N/A (new files) | `npx jest __tests__/lib/support/capabilities.test.ts --runInBand` failed because `@/lib/support/capabilities` did not exist | `npx jest __tests__/lib/support/capabilities.test.ts --runInBand` passed with 3/3 tests | 3 cases cover ordered capability tags, labels, and valid/invalid string narrowing | Kept a minimal strict TypeScript module with no `any`; replaced an assertion-based guard with `.some()` narrowing logic |
| 1.2 final | `lib/supabase/database.types.ts`, `__tests__/lib/support/capabilities.test.ts` | Generated types + unit/domain constants | Staging Supabase schema plus existing static tests | Previously blocked until normalized staging baseline succeeded and the support migration was applied to `global data staging` | `npm test -- __tests__/lib/support/capabilities.test.ts __tests__/supabase/support-ticket-system-migration.test.ts` passed with 2 suites and 12 tests; generated types now include support tables | Regenerated database types verify the staging schema exposes the support tables expected by follow-on implementation | No implementation refactor; artifact update only records completion evidence |
| 1.3 | Live staging RLS suite | Database/RLS | Staging service role key used locally by user | RLS validation was pending until the support migration existed in staging | User-reported live staging RLS result: 12 passed, 0 failed, 0 skipped | Coverage includes anonymous denial, reporter ownership, staff capability gates, and append-only audit policy behavior | No implementation refactor; artifact update only records verification evidence |
| 1.4 | `docs/supabase-staging-baseline.md`, `tmp/staging-baseline/staging-schema-baseline.normalized.sql` | Staging baseline workflow | Schema-only staging baseline artifacts and operator-reported staging evidence | Previously partial until the normalized baseline was confirmed applied successfully to `global data staging` | User-reported staging baseline result: normalized baseline applied successfully; required extensions verified; support migration applied afterward | Evidence confirms 1.2/1.3 were completed only after baseline preparation and staging application | No implementation refactor; artifact update only records completion evidence |
| 2.1 | `__tests__/lib/support/r2.test.ts` | Unit/domain helpers | N/A (new files) | `npm test -- __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` failed because `@/lib/support/r2` and `@/lib/support/r2-routes` did not exist | `pnpm test -- __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` passed with 2 suites and 9 tests | 5 cases cover allowed screenshots, unsafe filename normalization, oversize/MIME rejection, magic-byte sniffing, private bucket env config, and deterministic SigV4 signed URLs | Replaced an incorrect HMAC placeholder hash with real SHA-256 and added a signature fixture to guard R2 URL signing |
| 2.2 | `__tests__/app/support-attachments-route.test.ts` | Unit/route behavior with mocked R2 and metadata dependencies | N/A (new files) | Route tests referenced missing `createAttachmentIntentResponse`, `finalizeAttachmentResponse`, and `createAttachmentDownloadResponse` before implementation; follow-up RED also exposed missing explicit HEAD helper and jsdom Request/Response runtime gaps | `pnpm test -- __tests__/lib/support/capabilities.test.ts __tests__/supabase/support-ticket-system-migration.test.ts __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` passed with 4 suites and 25 tests | 8 route cases cover signed upload intent, oversize rejection, finalize HEAD/MIME rejection with cleanup, cleanup failure surfacing, adapter-level R2 DELETE HTTP failure surfacing, forbidden/unauthorized download, and bodyless HEAD status behavior | Shared download status resolution between GET and HEAD; kept HEAD bodyless and added R2 `response.ok` checks for HEAD, prefix GET, and DELETE |
| 2.3 | `__tests__/lib/support/r2.test.ts`, `__tests__/app/support-attachments-route.test.ts` | Unit + route behavior | Existing support suites included as regression coverage | Verification was pending until Phase 2 helpers and routes existed | `pnpm exec tsc --noEmit` passed; focused and support regression Jest suites passed | Coverage verifies allowed files pass, oversized/MIME failures reject, and bypassed downloads without authorized uploaded metadata return 403 | No further refactor needed |
| 3.1 | `__tests__/lib/actions/support.actions.test.ts` | Unit/server action with mocked Supabase RLS client | N/A (new file) | Test referenced missing `@/lib/actions/support.actions` and failed before implementation | `pnpm test -- __tests__/lib/actions/support.actions.test.ts __tests__/components/support-navigation.test.tsx __tests__/app/support-pages.test.tsx --runInBand` passed with 3 suites and 12 tests | 6 cases cover safe evidence allowlist, anonymous create rejection, authenticated create, list projection, detail with public messages, and reporter public replies | Wrapped page form actions separately so reusable tested actions can return results while App Router forms receive `Promise<void>` handlers |
| 3.2 | `__tests__/app/support-pages.test.tsx` | Integration/page rendering with mocked actions | N/A (new routes) | Test referenced missing `/ayuda` home/report/history/detail pages before implementation | Focused Phase 3 suites passed; `pnpm exec tsc --noEmit` passed; `pnpm test:ci` passed | 4 cases cover home links, report form safe evidence fields, ticket history link, and detail/reply rendering | Replaced design-system `SelectSistema` usage in the report form with native styled selects to avoid controlled/uncontrolled select misuse in server-rendered form defaults |
| 3.3 | `__tests__/components/support-navigation.test.tsx` | Component rendering | Existing nav components modified after RED tests | RED failed because mobile bottom nav rendered Ayuda as a button and sidebar rendered Ayuda as a toast button | Focused Phase 3 suites passed; `pnpm test:ci` passed | 2 cases cover mobile bottom `/ayuda` link and desktop sidebar `/ayuda` footer link; desktop header and mobile drawer were also changed to real links | Removed dead Ayuda toast dependency from sidebar and mobile bottom nav |
| 3.4 | `__tests__/lib/actions/support.actions.test.ts`, `__tests__/components/support-navigation.test.tsx`, `__tests__/app/support-pages.test.tsx` | Unit + component/page integration | Phase 1/2 support suites included in full CI | Verification was pending until reporter actions, pages, and nav existed | `pnpm test:ci` passed with Jest 10 suites/54 tests and Node Test Runner 17 tests; `pnpm exec tsc --noEmit` passed | Submit, anonymous rejection, reporter list/detail/reply, and mobile `/ayuda` navigation are covered by focused tests; manual browser execution was not run | `pnpm lint` blocked by missing `eslint-plugin-security` in the current install, not by Phase 3 code |
| 3.4 privacy review fix | `__tests__/lib/actions/support.actions.test.ts` | Unit/server action with mocked Supabase RLS client | Fresh Phase 3 review reported `needs_fix` privacy blocker | Existing evidence test expected `/dashboard?token=secret`, proving route query persistence; diagnostics were stored even when consent was false | `npm test -- __tests__/lib/actions/support.actions.test.ts --runInBand` passed with 8/8 tests; `npm test -- __tests__/lib/actions/support.actions.test.ts __tests__/components/support-navigation.test.tsx __tests__/app/support-pages.test.tsx --runInBand` passed with 3 suites and 14 tests; `npx tsc --noEmit` passed | Coverage now proves route query/hash redaction, diagnostics consent gating including string `"false"`, explicit public/non-internal message filtering, and stable user-safe list error mapping | Kept the fix inside `lib/actions/support.actions.ts`; no Supabase production mutation or SQL execution was performed |

## Completed Tasks

- [x] 1.1 Created additive `supabase/migrations/20260609130000_support_ticket_system.sql` with support tables, checks, indexes, FTS, RLS, private helpers, least-privilege grants, and append-only event trigger.
- [x] 1.2 Regenerated `lib/supabase/database.types.ts` from Supabase staging after the normalized baseline succeeded and the support migration was applied; support capability constants/types are present in `lib/support/**`.
- [x] 1.3 Verified support RLS behavior in live staging: anonymous denied, reporter ownership enforced, staff capability gates enforced, and append-only audit behavior covered.
- [x] 1.4 Prepared `global data staging` with a schema-only baseline workflow before completing 1.2/1.3; `docs/supabase-staging-baseline.md` documents the workflow, `tmp/staging-baseline/staging-schema-baseline.normalized.sql` exists as the normalized baseline artifact, the baseline was applied successfully to staging, required extensions were verified, and the support migration was applied afterward.
- [x] 2.1 Added `lib/support/r2.ts` with private bucket constants, server-only env validation, attachment limits, safe key building, SigV4 signed URL generation, and MIME magic-byte sniffing.
- [x] 2.2 Added support attachment route handlers for intent, finalize, and download/HEAD, with authorization before signed URL issuance and rejected-object cleanup after failed finalization.
- [x] 2.3 Verified allowed files pass, oversized/MIME failures reject, and direct/bypassed download attempts without authorized uploaded metadata fail with 403.
- [x] 3.1 Added `lib/actions/support.actions.ts` for authenticated reporter create/list/detail/message flows with Zod validation and allowlisted evidence mapping.
- [x] 3.2 Added `/ayuda`, `/ayuda/reportar`, `/ayuda/tickets`, and `/ayuda/tickets/[id]` App Router pages using existing dashboard/design-system primitives.
- [x] 3.3 Replaced Ayuda “Próximamente” toast buttons with real `/ayuda` navigation in sidebar, mobile drawer, mobile bottom menu, and desktop header.
- [x] 3.4 Verified submit, anonymous rejection, reporter view/reply, and mobile `/ayuda` navigation through focused tests plus full CI test execution.

## Staging Baseline Setup

- [x] Staging prep documented in `docs/supabase-staging-baseline.md`; unsafe staging package commands are blocked or dry-run only, and the schema-only baseline plan defines export, review, manual apply, verification, recovery, and support-ticket unblock steps.
- [x] Added `scripts/generate-staging-schema-baseline.mjs` and `npm run baseline:staging:generate` to create a schema-only staging baseline review artifact in a controlled operator environment.
- [x] Added `scripts/normalize-staging-schema-baseline.mjs`, `npm run baseline:staging:normalize`, and `tmp/staging-baseline/staging-schema-baseline.normalized.sql` to remove Supabase-managed `storage` internals and isolate platform ACL/default privilege replay from the generated review artifact.

## Verification

- `pnpm test __tests__/supabase/support-ticket-system-migration.test.ts` failed before execution because `pnpm` is not installed.
- `corepack pnpm test __tests__/supabase/support-ticket-system-migration.test.ts` failed before execution because `corepack` is not installed.
- `node -e "...migration contract assertions..."` passed.
- `node supabase/tests/lint-migrations.mjs` passed with 0 errors; warnings are repo-wide historical warnings plus informational `SECURITY DEFINER` notice for the new migration.
- Review fix verification: `npx jest __tests__/supabase/support-ticket-system-migration.test.ts --runInBand` passed with 9/9 tests.
- Review fix verification: `node supabase/tests/lint-migrations.mjs` passed with 0 errors; warnings remain repo-wide historical warnings plus informational `SECURITY DEFINER` notice for the new migration.
- `pnpm --version` failed because `pnpm` is not installed.
- `corepack --version` failed because `corepack` is not installed.
- `supabase --version` failed because `supabase` is not installed on PATH.
- `npx supabase --version` failed because the Supabase CLI binary is unavailable.
- `npx jest __tests__/lib/support/capabilities.test.ts --runInBand` passed with 3/3 tests.
- `npx tsc --noEmit` passed.
- Staging baseline prep verification was limited to static checks; no SQL was executed and no Supabase migration was applied in this task.
- Complete staging baseline plan verification was limited to static file review; no SQL was executed, no Supabase mutation tools were called, and no Supabase migration was applied in this task.
- Baseline generator verification was limited to static Node checks and command-construction tests; the generator was not executed, `pg_dump` was not run, SQL was not executed, and no database was mutated.
- Baseline normalizer verification was limited to Node unit tests and static grep checks against `tmp/staging-baseline/staging-schema-baseline.normalized.sql`; SQL was not executed and no database was mutated.
- User-reported staging status: normalized baseline succeeded and the support migration was applied to Supabase staging.
- Staging baseline completion evidence: `tmp/staging-baseline/staging-schema-baseline.normalized.sql` applied successfully to Supabase staging before 1.2/1.3 completion.
- Required staging extensions verified: `btree_gist` in `extensions`, `pg_trgm` in `public`, and `uuid-ossp` in `extensions`.
- Support migration sequencing evidence: support migration applied to Supabase staging after the normalized baseline succeeded.
- Type generation evidence: `lib/supabase/database.types.ts` was regenerated from staging and changed relative to HEAD with support tables included (`526 insertions(+), 18 deletions(-)`).
- Static support verification: `npm test -- __tests__/lib/support/capabilities.test.ts __tests__/supabase/support-ticket-system-migration.test.ts` passed with 2 suites and 12 tests.
- Live staging RLS verification: user-reported staging service-role RLS run passed with 12 passed, 0 failed, 0 skipped.
- Phase 2 RED baseline: `npm test -- __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` failed because the R2 modules did not exist yet.
- Phase 2 focused GREEN: `pnpm test -- __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` passed with 2 suites and 9 tests.
- Phase 2 required runner verification: `pnpm test -- __tests__/lib/support/capabilities.test.ts __tests__/supabase/support-ticket-system-migration.test.ts __tests__/lib/support/r2.test.ts __tests__/app/support-attachments-route.test.ts --runInBand` passed with 4 suites and 25 tests after the R2/HEAD hardening follow-up.
- Phase 2 type verification: `pnpm exec tsc --noEmit` passed.
- Phase 3 RED baseline: `pnpm test -- __tests__/lib/actions/support.actions.test.ts __tests__/components/support-navigation.test.tsx --runInBand` failed because `@/lib/actions/support.actions` did not exist and Ayuda navigation still rendered toast buttons.
- Phase 3 focused GREEN: `pnpm test -- __tests__/lib/actions/support.actions.test.ts __tests__/components/support-navigation.test.tsx __tests__/app/support-pages.test.tsx --runInBand` passed with 3 suites and 12 tests. React emitted non-failing Suspense/act warnings from lazy desktop header resolution in page tests.
- Phase 3 type verification: `pnpm exec tsc --noEmit` passed after page-local void-returning form action wrappers were added.
- Phase 3 full CI verification: `pnpm test:ci` passed with Jest 10 suites/54 tests and Node Test Runner 17 tests.
- Phase 3 Node Test Runner verification: `pnpm test:node` passed with 17 tests.
- Phase 3 lint verification: `pnpm lint` failed before linting because `eslint-plugin-security` could not be resolved from the current install.
- Phase 3 privacy review fix verification: `npm test -- __tests__/lib/actions/support.actions.test.ts --runInBand` passed with 1 suite and 8 tests.
- Phase 3 related regression verification: `npm test -- __tests__/lib/actions/support.actions.test.ts __tests__/components/support-navigation.test.tsx __tests__/app/support-pages.test.tsx --runInBand` passed with 3 suites and 14 tests. React emitted the existing non-failing Suspense/act warnings from page tests.
- Phase 3 privacy review type verification: `npx tsc --noEmit` passed.

## Production Safety

- No SQL was executed against Supabase production.
- Migration is additive only: creates schema/functions/tables/indexes/policies/triggers/grants.
- No `DROP`, `TRUNCATE`, `DELETE FROM`, or production data backfill/mass update was introduced.
- Review fix edited only the not-yet-applied migration contract: no production SQL execution and no destructive command was run.
- Task 1.2 type generation used Supabase staging; no production SQL or schema mutation was executed.
- Phase 2 performed no Supabase production mutations and no live R2 calls during tests; R2 interactions are signed server-side and mocked in unit coverage.
- Phase 3 performed no Supabase production mutations and no live R2 calls; Supabase access was mocked in tests and implementation uses the authenticated server client so RLS remains the authorization boundary.
- Phase 3 privacy review fix performed no Supabase production mutations, no SQL execution, and no live Supabase calls; Supabase access remained mocked in tests.
- No GitHub issue sync was implemented.
- Staging baseline docs/scripts target project ref `ebwtdjtajclzciwipevw`; old package scripts for `wcnqocyqtksxhthnquta` were blocked or replaced with staging-safe commands.

## Remaining Tasks

- [ ] 4.1 Build `app/(auth)/ayuda/admin` queue with filters and Postgres FTS.
- [ ] 4.2 Add staff reply, assignment, and status transition actions in `lib/actions/support*.ts` with audit events.
- [ ] 4.3 Verify capabilities, unauthorized denial, search/filter, and audited status saves.
- [ ] 5.1 Add `emails/support-*.tsx` templates and `lib/email/**` calls with safe authenticated links only.
- [ ] 5.2 Add `lib/support/inngest*.ts` events with ID-only payloads and idempotency keys.
- [ ] 5.3 Verify one email per event/recipient and no evidence, attachments, raw Sentry, or GitHub issues.
- [ ] 6.1 Harden `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts` for no default PII/raw replay.
- [ ] 6.2 Document R2/Inngest/Resend envs, rollback, retention question, and future sanitized GitHub boundary.
- [ ] 6.3 Run `pnpm test:rls`, unit/integration suites, build/typecheck, and manual reporter/staff flows.
