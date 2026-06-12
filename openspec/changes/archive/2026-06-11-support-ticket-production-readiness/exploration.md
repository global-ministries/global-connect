## Exploration: support-ticket-production-readiness

### Current State

The archived `support-ticket-system` change delivered a local/staging-verified MVP: support tables/RLS, reporter ticket pages, staff queue, R2 signing/finalization/download routes, support email templates, Inngest-shaped event helpers, Sentry privacy scrubbers, and a documented GitHub sync boundary. The canonical spec still describes a complete support domain, but archive verification carried forward warnings: live R2 upload was not proven, assignment/status UI controls were not manually available, live Inngest/Resend provider execution was intentionally not run, and production rollout remained a reviewed manual operation.

Current implementation evidence:
- `app/(auth)/ayuda/reportar/page.tsx` asks non-technical users to type `Ruta`, `Viewport`, `Navegador`, `Sistema operativo`, and `ID de evento de Sentry`; it also states attachments are uploaded after ticket creation, so the create flow is not a simple inline user flow.
- `lib/support/support-evidence.ts` sanitizes allowlisted evidence, but collection is form-field driven rather than automatic behind consent.
- `app/api/support/attachments/**` and `lib/support/r2*.ts` implement private R2 intent/finalize/download helpers, but `/ayuda/reportar` and ticket detail do not expose inline attachment upload/finalize UX.
- `lib/actions/support.actions.ts` exports staff reply, assignment, and status actions, but current app usage only calls reporter create/reply; `app/(auth)/ayuda/admin/page.tsx` is a queue/filter list without assignment/status controls.
- `lib/support/inngest.ts` defines ID-only event contracts and email dispatch helpers, but `package.json` has no `inngest` dependency, no `/api/inngest` route, and support actions do not emit live events.
- `docs/support-operations.md` documents provider and production rollout checks, but production Supabase was previously found missing support migrations/tables while the app had already been deployed.

### Affected Areas

- `app/(auth)/ayuda/reportar/page.tsx` — simplify reporter UX, auto-capture diagnostics behind consent, and add inline attachments before/around submit.
- `app/(auth)/ayuda/tickets/[id]/page.tsx` — show attachments, staff controls when authorized, and safe evidence presentation.
- `app/(auth)/ayuda/admin/page.tsx` — add assignment/status management and staff-only lifecycle operations.
- `components/ui/sidebar-moderna.tsx`, `components/ui/header-movil.tsx`, `components/ui/menu-inferior-movil.tsx`, `components/ui/desktop-header.tsx`, `app/(auth)/layout.tsx` — align support navigation with normal authenticated layout/sidebar and expose staff admin entry only to authorized users.
- `lib/actions/support.actions.ts` — emit post-commit events, preserve audit semantics, and expose user-safe action outcomes.
- `lib/support/support-evidence.ts`, `lib/support/sentry-privacy.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — move from typed diagnostics to safe automatic evidence collection and privacy verification.
- `lib/support/r2.ts`, `lib/support/r2-routes.ts`, `app/api/support/attachments/**` — connect existing R2 primitives to create/detail UI and add controlled non-production smoke evidence.
- `lib/support/inngest.ts`, `lib/email/support.ts`, `emails/support-ticket.tsx`, future `app/api/inngest/**` — convert local contracts into live Inngest functions with Resend delivery.
- `supabase/migrations/*support*`, `lib/supabase/database.types.ts`, `docs/support-operations.md` — production rollout reconciliation, migration drift checks, and release gates.
- Future GitHub integration files — only after staff-approved sanitized sync is specified.

### Gap Analysis

**UX**
- The reporter form is still technical. Users should describe the problem and optionally consent to diagnostics; route, browser, OS, viewport, build version, and Sentry reference should be captured automatically where safe.
- Attachments are not part of immediate ticket creation. The product expectation is upload/finalize in the support flow, not a separate hidden API capability.
- Spanish UI copy exists, but accent omissions and technical labels should be reviewed with product polish before production exposure.

**Staff/Admin**
- Staff queue/search exists and backend actions/RPCs support reply, assign, and status changes.
- UI lacks visible assignment/status controls and likely lacks a staff-specific detail surface for internal triage.
- Staff admin navigation is not capability-aware; `/ayuda/admin` exists but authorized staff do not get a dedicated sidebar/menu entry.

**R2**
- R2 signing, object-key rules, validation, and mocked tests exist.
- No create-form upload/finalize UX exists.
- Live R2 behavior remains unproven; production readiness needs a controlled non-production smoke that avoids printing secrets, object keys, signed URLs, or private payloads.

**Inngest/Resend**
- Safe email templates, Resend helper usage, and Inngest-shaped event factories exist.
- There is no live Inngest package/client, route, function registry, or action emission path.
- Support actions currently mutate Supabase without dispatching `support/ticket.*` events, so production notifications are not live.

**Sentry/Privacy/Observability**
- Sentry scrubbers and tests exist, and replay is documented as disabled/default-masked.
- Evidence capture remains user-typed and therefore low-quality for diagnostics while also exposing technical concepts to users.
- Production observability still needs confirmation through configuration/static evidence and safe smoke checks, not raw payload or replay inspection.

**GitHub Sync**
- MVP correctly has no GitHub issue creation.
- Future sync should remain out of the immediate readiness slice unless product explicitly wants it; when added, it must be staff-approved, sanitized, and downstream from Supabase, not the support source of truth.

**Supabase Production Rollout**
- Repo migrations include support schema/RPC follow-ups, but prior read-only production checks found production migrations only up to `20260609013148_scope_user_stats_by_campus` and no support tables/capabilities.
- Production rollout must reconcile migration history before exposing app routes. Do not edit already-applied migrations; use additive migrations and explicit drift review.
- Generated types and RLS tests need to be checked against the target environment before launch.

**Release Governance**
- The app reached `main`/deployment while production DB/provider readiness was incomplete. This is the main process failure to correct.
- Future release must gate app exposure, DB migrations, provider variables, R2 smoke, notification smoke, Sentry privacy checks, and rollback readiness as one coordinated release checklist.

### Approaches

1. **Production-readiness hardening in sequenced slices** — Keep Supabase as source of truth, finish UX/admin/provider wiring, then run controlled rollout gates.
   - Pros: Matches existing architecture; protects production data; allows chained PRs under the 400-line review budget; validates one risk boundary at a time.
   - Cons: More orchestration and QA steps; users wait longer for the fully polished experience.
   - Effort: High.

2. **Patch only the visible UX gaps** — Simplify form, add attachments, and leave provider/production rollout for later.
   - Pros: Fastest visible improvement; smaller short-term diff.
   - Cons: Still not production-ready; repeats the mistake of shipping app UI ahead of DB/provider readiness.
   - Effort: Medium.

3. **Provider-first rollout before UX polish** — Apply production DB/provider wiring first, then improve UI.
   - Pros: Resolves infrastructure drift early.
   - Cons: Risks exposing a poor/technical user flow and staff workflow gaps; harder to validate end-to-end product acceptance.
   - Effort: Medium.

### Recommendation

Proceed with approach 1. Sequence the proposal around release-safe work units:

1. UX/evidence slice: simplify reporter form, implement consent-based browser diagnostics capture, preserve privacy scrubbers, and remove user-facing technical fields.
2. R2 attachment slice: add inline upload/finalize/download UI and run one controlled non-production R2 smoke without leaking secrets, object keys, or signed URLs.
3. Staff/admin slice: add capability-aware admin navigation plus assignment/status controls on the staff workflow.
4. Inngest/Resend slice: add live Inngest dependency/client/route/functions and emit ID-only events after committed support actions; verify idempotent Resend delivery in non-production.
5. Supabase production rollout slice: reconcile migration state, dry-run/review additive migrations, apply only after approval, seed/grant support capabilities intentionally, and verify RLS/types.
6. Release governance slice: add explicit gates for app exposure, DB readiness, providers, observability, rollback, and post-release checks.
7. Future GitHub sync slice: only after production support is stable and product approves manual sanitized engineering escalation.

### Risks

- Privacy leakage if automatic diagnostics include query strings, headers, cookies, localStorage, raw Sentry payloads, replay media, attachment object keys, or signed URLs.
- Production outage or 500s if app routes assume support tables before production migrations are applied.
- Duplicate or unsafe emails if Inngest/Resend idempotency is not persisted and workers include user text/evidence in payloads.
- R2 object orphaning if inline upload creates pending rows without cleanup/retry semantics.
- Staff overexposure if admin navigation or controls are not capability-gated.
- Review overload if the next change ignores chained delivery despite the high cross-cutting scope.

### Open Product Questions

- What is the minimum reporter form: title plus description only, or should category/severity remain user-selectable?
- What exact consent copy should authorize automatic diagnostics, and should consent default off?
- Should attachments be allowed before the ticket row exists, or should the UI create the ticket first and then finalize attachments inline on the same screen?
- Who receives support emails: reporter only, assigned staff, all `support.view`, or a configured support inbox?
- What staff statuses/transitions are allowed, and should closing/resolving require a reply?
- How should support capabilities be granted in production, and who is the first support staff cohort?
- What is the production attachment/ticket retention policy and stale pending-upload cleanup cadence?
- Should GitHub sync be manual staff approval only, and what role/capability can approve it?
- What release gate must block Vercel/app exposure until production Supabase and providers are ready?

### Ready for Proposal

Yes. The proposal should be framed as production-readiness hardening and rollout governance, not a replacement for the archived MVP. The proposal must explicitly state that no production Supabase/provider mutation occurs until reviewed rollout gates pass, and it should forecast chained PRs because the combined scope is above the 400-line review budget.
