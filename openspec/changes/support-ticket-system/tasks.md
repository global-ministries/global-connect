# Tasks: Support Ticket System

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,500-2,200 total; target <400 per slice |
| Changed files estimate | 25-35 total; 4-8 per slice |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | schema → R2 → create/list → console → notifications → hardening/docs |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema, RLS, capabilities, types | PR 1 | Base = tracker; verify RLS. |
| 2 | Private R2 intent/finalize/download | PR 2 | Base = PR 1. |
| 3 | Reporter `/ayuda` create/history/detail | PR 3 | Base = PR 2; nav links. |
| 4 | Staff queue, FTS, replies, lifecycle | PR 4 | Base = PR 3. |
| 5 | Inngest/Resend notifications | PR 5 | Base = PR 4. |
| 6 | Evidence hardening and docs | PR 6 | Base = PR 5; no GitHub sync. |

## Phase 1: Schema and Capabilities

- [x] 1.1 Create `supabase/migrations/*support_ticket_system.sql` with tables, checks, indexes, FTS, RLS, helpers, and append-only events.
- [x] 1.2 Regenerate `lib/supabase/database.types.ts` and add support capability constants/types in `lib/support/**`.
- [x] 1.3 Verify `pnpm test:rls`: anonymous denied, reporter ownership, staff capability gates, append-only audit.
- [x] 1.4 Prepare `global data staging` with a schema-only baseline workflow before completing 1.2/1.3; see `docs/supabase-staging-baseline.md`.

## Phase 2: R2 Integration

- [x] 2.1 Add `lib/support/r2*.ts` validators/key builder for private `global-connect-support`, limits, signed URLs, and envs.
- [x] 2.2 Create `app/api/support/attachments/**/route.ts` for intent, finalize, download, HEAD, MIME checks, and cleanup hooks.
- [x] 2.3 Verify allowed files pass, oversized/MIME failures reject, and R2 bypass fails.

## Phase 3: Reporter Ticket Flow

- [x] 3.1 Create `lib/actions/support*.ts` for authenticated ticket create/list/detail/message with Zod validation and safe evidence fields.
- [x] 3.2 Build `app/(auth)/ayuda/**` home, report form, history, and detail with UI components.
- [x] 3.3 Replace Ayuda toasts in `sidebar-moderna.tsx`, `header-movil.tsx`, `menu-inferior-movil.tsx`, and `desktop-header`.
- [x] 3.4 Verify submit, anonymous rejection, reporter view/reply, and mobile `/ayuda` navigation.

## Phase 4: Support Console

- [x] 4.1 Build `app/(auth)/ayuda/admin` queue with filters and Postgres FTS.
- [x] 4.2 Add staff reply, assignment, and status transition actions in `lib/actions/support*.ts` with audit events.
- [x] 4.3 Verify capabilities, unauthorized denial, search/filter, and audited status saves.

## Phase 5: Notifications and Audit

- [x] 5.1 Add `emails/support-*.tsx` templates and `lib/email/**` calls with safe authenticated links only.
- [ ] 5.2 Add `lib/support/inngest*.ts` events with ID-only payloads and idempotency keys.
- [ ] 5.3 Verify one email per event/recipient and no evidence, attachments, raw Sentry, or GitHub issues.

## Phase 6: Hardening and Documentation

- [ ] 6.1 Harden `instrumentation-client.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts` for no default PII/raw replay.
- [ ] 6.2 Document R2/Inngest/Resend envs, rollback, retention question, and future sanitized GitHub boundary.
- [ ] 6.3 Run `pnpm test:rls`, unit/integration suites, build/typecheck, and manual reporter/staff flows.
