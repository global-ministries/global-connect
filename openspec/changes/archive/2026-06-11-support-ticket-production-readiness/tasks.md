# Tasks: Support Ticket Production Readiness

## Review Workload Forecast

| Field | Value |
|--|--|
| Estimated changed lines | 1,400-2,200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 UX/evidence -> PR 2 R2 -> PR 3 staff/capabilities -> PR 4 providers/bridge -> PR 5 rollout gates |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|--|--|--|--|
| 1 | Reporter UX + safe evidence | PR 1 | Finish with Jest scrubber/form tests. |
| 2 | Private R2 attachments | PR 2 | Depends PR 1; verify intent/finalize/download. |
| 3 | Staff navigation + lifecycle + capability admin | PR 3 | Depends PR 1; verify UI/server/RLS gates. |
| 4 | Inngest/Resend + external bridge | PR 4 | Depends PR 3; mocks prove ID-only/idempotent flows. |
| 5 | Supabase reconciliation + release gates | PR 5 | Additive migrations/types/docs; no destructive production steps. |

## Phase 1: Reporter UX and Evidence

- [x] 1.1 Modify `app/(auth)/ayuda/reportar/page.tsx` to show `subject`, `description`, `category`, `attachments` only.
- [x] 1.2 Update `lib/actions/support.actions.ts` to map `subject` to current DB fields and return safe typed action results.
- [x] 1.3 Update `lib/support/support-evidence.ts`, `lib/support/sentry-privacy.ts`, and Sentry config to collect/scrub allowlisted diagnostics only.
- [x] 1.4 Test submit, reject anonymous, hide technical fields, allow diagnostics, and block sensitive evidence scenarios.

## Phase 2: R2 Attachment Flow

- [x] 2.1 Wire inline upload progress/retry/finalize in `app/(auth)/ayuda/reportar/page.tsx` using `app/api/support/attachments/**`.
- [x] 2.2 Modify `app/(auth)/ayuda/tickets/[id]/page.tsx` to show authorized attachment metadata/downloads without keys or signed URLs.
- [x] 2.3 Test accept, reject, retry, and forbid direct-access attachment scenarios with R2 mocks/smoke notes.

## Phase 3: Staff Operations and Capabilities

- [x] 3.1 Update navigation components to preserve `/ayuda` and show support admin links only for support capabilities.
- [x] 3.2 Modify `app/(auth)/ayuda/admin/page.tsx` for search, filters, replies, assignments, and status transitions.
- [x] 3.3 Create/modify `app/(auth)/configuracion/**` and `lib/actions/support-capabilities.actions.ts` for allowlisted grant/revoke with audit.
- [x] 3.4 Test staff visibility, denied access, reply, status validation, capability grant, and unsupported capability rejection.

## Phase 4: Providers and External Bridge

- [x] 4.1 Create/modify `lib/support/inngest.ts`, `app/api/inngest/route.ts`, `emails/support-ticket.tsx`, and `lib/email/support.ts`.
- [x] 4.2 Create `lib/support/external-bridge.ts` and `app/api/support/external/**` with sanitized outbound and authenticated idempotent inbound updates.
- [x] 4.3 Test safe notification, audit trail, duplicate prevention, no GitHub sync, sanitized escalation, and inbound update scenarios.

## Phase 5: Rollout and Release Gates

- [x] 5.1 Add reviewed additive `supabase/migrations/*support*.sql` reconciliation and regenerate `lib/supabase/database.types.ts`.
- [x] 5.2 Update `docs/support-operations.md` with DB/provider/env/RLS/privacy/smoke/rollback gates and safe degraded behavior.
- [x] 5.3 Run `pnpm lint:migrations`, `pnpm test:rls`, relevant Jest suites, and non-production provider smoke checks.
