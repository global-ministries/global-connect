# Support Operations Runbook

This runbook covers the operational path for the support ticket system. It is intentionally non-mutating: production Supabase migrations, provider changes, and credential rotation remain explicit reviewed operations.

## Quick Path

1. Confirm the support feature slice being released and review the migration diff before any hosted apply.
2. Configure server-only provider environment variables for R2, Inngest, Resend, and Sentry/privacy controls in the target environment.
3. Apply support migrations only after explicit review approval; do not apply production migrations from an unreviewed local branch.
4. Verify `/ayuda` reporter flow, staff queue access, private attachment signing, and safe notification payloads with test accounts.
5. If a rollout issue appears, hide support entry points and disable side effects first; preserve production data unless a reviewed retention/export plan exists.

## Safety Boundary

| Area | Rule |
|------|------|
| Production Supabase | Migration application is manual, explicit, reviewed, and separate from this documentation change. |
| R2 | Buckets stay private; signed URLs are issued only after app authorization. |
| Inngest | Safe dual mode is intentional: `/api/inngest` remains the compatibility custom webhook, while `/api/inngest/official` exposes the official SDK foundation. Events carry IDs only; workers must fetch data after authorization and must be idempotent. |
| Resend | Emails contain safe authenticated links only; no evidence, attachments, or raw diagnostics. |
| Sentry | Support stores Sentry references only; raw payloads, replay media, cookies, headers, and diagnostics are scrubbed. |
| GitHub | No MVP sync. Future GitHub issues are downstream engineering artifacts only. |

## Production Readiness Gates

Support must remain in a safe degraded state until every gate below has explicit review evidence. Safe degraded means users can be protected by hidden navigation, disabled side effects, or unavailable provider workflows without deleting tickets, messages, audit events, or private attachment metadata.

| Gate | Required evidence | Failure behavior |
|------|-------------------|------------------|
| DB gate | Support migrations are reviewed as additive and non-destructive; generated Supabase types match the reviewed schema. | Do not claim production readiness; keep support data preserved and ship only additive corrections. |
| provider gate | Non-production R2, Inngest, Resend, and Sentry checks prove private storage, ID-only events, safe emails, and scrubbed evidence. | Disable provider side effects and keep app flows authenticated/degraded. |
| environment gate | Server-only secrets exist in the target runtime and no secret appears in `NEXT_PUBLIC_*`, docs, logs, or tickets. | Block rollout until secrets are configured or rotate any exposed value. |
| RLS/privacy gate | `pnpm test:rls` or the approved staging RLS equivalent passes; privacy tests prove diagnostics, attachments, signed URLs, object keys, cookies, storage, and raw payloads are excluded. | Hide staff surfaces and do not expose cross-user support data. |
| smoke gate | Reporter create, attachment upload/finalize/download, staff queue/detail, notification, inbound bridge, and rollback smoke checks pass in non-production. | Keep the feature degraded and document the failed check before retry. |
| rollback gate | Rollback starts by hiding entry points and disabling side effects, not by deleting production data. | Do not proceed until the rollback owner and first action are known. |

## External Escalation Approval

Outbound bridge payloads are staff-approved sanitized external escalation only. The bridge sanitizer removes known support secrets, signed URL markers, token-like query values, and object-key patterns, but it must not be treated as a general PII scrubber. Staff must rewrite summaries and reproduction steps before escalation so user-identifying details, private church/member context, free-form sensitive text, attachments, raw diagnostics, and internal notes are not sent downstream.

## Environment Checklist

Set secrets only in the runtime provider or deployment environment. Never commit them to the repository, docs, OpenSpec artifacts, screenshots, or support tickets.

### Cloudflare R2

| Variable / Setting | Required | Notes |
|--------------------|----------|-------|
| `R2_ACCOUNT_ID` | Yes | Used to build the Cloudflare R2 endpoint. |
| `R2_ACCESS_KEY_ID` | Yes | Must be scoped to the private support bucket where possible. |
| `R2_SECRET_ACCESS_KEY` | Yes | Server-only secret. Rotate on suspected exposure. |
| Bucket name | Yes | Code expects private bucket `global-connect-support`. |
| Public access | Must be disabled | Attachment reads use short-lived signed GET URLs after authorization. |
| CORS | Required for browser uploads | Allow the deployed app origin for signed PUT uploads only. |

Operational limits from code and spec:

- Signed upload URLs expire after 5 minutes.
- Signed download URLs expire after 60 seconds.
- Screenshots: PNG, JPG, or WebP, max 10 MB each, max 5 per ticket.
- Videos: MP4, WebM, or MOV, max 100 MB, max 1 per ticket.
- Total active attachments per ticket: max 150 MB.
- Object keys follow `support/{ticket_id}/{attachment_id}/{safe_filename}`; object keys are not authorization proof.

### Support event processing: safe dual mode

The app retains `/api/inngest` as a custom authenticated bearer webhook for compatibility with the existing notification path. PR 1 also introduces the official Inngest SDK foundation at `/api/inngest/official` with app id `global-connect`; it must not replace the custom webhook until a later reviewed migration proves equivalent behavior.

| Setting | Required | Notes |
|---------|----------|-------|
| Event names | Yes | `support/ticket.created`, `support/ticket.message.created`, `support/ticket.status.changed`, `support/attachment.finalized`, `support/external.update.received`. |
| Payload shape | Yes | IDs only: `eventId`, `ticketId`, optional `actorUserId`, and relevant message or attachment IDs. |
| Idempotency | Yes | Email keys use `email:{eventId}:{recipient}`. Preserve this shape in any worker integration. |
| Custom webhook credentials | Existing compatibility path | `SUPPORT_INNGEST_EVENT_URL` and `SUPPORT_INNGEST_WEBHOOK_SECRET` post to `/api/inngest`. Preserve this behavior until replacement is explicitly reviewed. |
| Official Inngest credentials | Optional foundation path | `SUPPORT_OFFICIAL_INNGEST_ENABLED` and `INNGEST_EVENT_KEY` allow ID-only events to be sent through the official SDK. The official route is `/api/inngest/official`. |

Workers must fetch ticket data server-side, avoid long user text in events, and never include evidence, attachment URLs, R2 keys, raw Sentry payloads, diagnostics, cookies, tokens, emails beyond the intended recipient, phone numbers, church/member details, or database internals in queued payloads.

### Hermes outbound dispatch

PR 2 adds outbound Global Connect to Hermes ticket-created dispatch through the official Inngest `support/ticket.created` worker. Inbound callbacks/actions from Hermes are not part of this PR, live Hermes remains disabled unless explicitly configured, and Global Connect must not create GitHub issues.

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPPORT_HERMES_DISPATCH_MODE` | Optional | `disabled`, `dry-run`, or `live`. Defaults to `dry-run`, so no network call is made by default. |
| `SUPPORT_HERMES_WEBHOOK_URL` | Required only for `live` | Hermes route is `POST /webhooks/support-ticket`. |
| `SUPPORT_HERMES_WEBHOOK_SECRET` | Required only for `live` | Server-only bearer secret. Never log or return this value. |
| `SUPPORT_HERMES_TIMEOUT_MS` | Optional | Bounded HTTP timeout for live dispatch; defaults to a short safe value. |

Hermes uses `event_type` in the JSON body for routing. Do not rely on `X-Hermes-Event`; Hermes ignored that header in smoke verification.

The `ticket.created` payload is minimal and ID-first for PR 2: `event_type`, stable `delivery_id` shaped as `global-connect:{eventId}`, `ticket.id`, `ticket.internalUrl`, and source system/environment. It must not include raw support titles, descriptions, message bodies, reporter names, emails, phone numbers, church/member details, tokens, cookies, headers, raw Sentry data, diagnostics, signed URLs, R2 object keys, attachment data, GitHub sync fields, or secret values. Hermes can use the internal ticket URL now; callbacks or a future staff-reviewed safe-summary field can enrich later.

The legacy `support/hermes.escalation.requested` foundation event remains a dry-run escalation contract for future reviewed work. The audited inbound path `/api/support/external/inbound` is documented for the existing bridge.

Hermes inbound callbacks are now treated as explicit audit-safe actions. Expected callback actions are:

- `public_reply`: append sanitized public support message (`is_internal = false`).
- `internal_note`: append sanitized staff-only note (`is_internal = true`) visible only to staff.

Each callback is idempotent by `idempotencyKey`; duplicates return `duplicate: true` and must not write a second message row.

For PR 3, `/api/support/external/inbound` persists the callback audit row and message only; it intentionally does **not** dispatch `support/external.update.received` or trigger staff notifications directly. Downstream support staff actions are deferred to a future durable outbox/replay design that preserves retry safety.

### Resend

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | Yes for live email | Server-only key used by `lib/email/resend.ts`. |
| `RESEND_FROM_NAME` | Optional | Defaults to `GlobalConnect`. |
| `RESEND_FROM_EMAIL` | Optional | Defaults to `team@connect.yosoyglobal.org`; verify domain ownership before production sends. |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Used to build authenticated support ticket links; defaults to `https://connect.yosoyglobal.org`. |

Email bodies must stay notification-only: ticket number, title, status label, and authenticated `/ayuda/tickets/{id}` link. Do not include message bodies, evidence, attachment links, raw diagnostics, Sentry payloads, R2 object keys, or GitHub details.

### Sentry And Support Privacy

Before enabling support evidence in production, reviewers must confirm:

- `sendDefaultPii` remains disabled through shared privacy options.
- Client replay sampling remains `0` unless a separate explicit consent design is reviewed.
- Replay text is masked and media is blocked by default.
- Support evidence stores allowlisted diagnostics and Sentry event IDs only.
- Sentry requests, headers, bodies, user fields, URLs, and support contexts are scrubbed before send.

## PR5.3 Staging Smoke Tooling

Run PR5.3 provider smokes only against staging or a local app connected to staging-safe provider resources. The smoke script loads `.env.staging.local` by default, refuses to run unless `RLS_ENV=staging`, rejects obvious production hosts, and redacts secrets, ticket IDs, idempotency keys, recipients, and R2 object details in logs.

Command:

```bash
pnpm support:smoke:staging
```

Focused checks are available when a provider input is not ready:

```bash
node scripts/support-smoke-staging.mjs --only=inngest,r2
node scripts/support-smoke-staging.mjs --only=external
node scripts/support-smoke-staging.mjs --only=resend
```

Required environment keys, without values:

| Check | Required keys | Evidence produced |
|-------|---------------|-------------------|
| Global guard | `RLS_ENV=staging` | Script refuses non-staging execution before provider calls. |
| Protected Vercel preview routes | `VERCEL_AUTOMATION_BYPASS_SECRET` when `SUPPORT_SMOKE_BASE_URL` is behind Vercel Deployment Protection | The route smoke requests include `x-vercel-protection-bypass` so Vercel allows the request to reach app auth. Do not use this key for direct provider checks. |
| Support event webhook | `SUPPORT_SMOKE_BASE_URL`, `SUPPORT_INNGEST_WEBHOOK_SECRET` | `/api/inngest` rejects missing/invalid auth and accepts a signed ID-only support event with HTTP 202; this remains the compatibility custom webhook. |
| Official Inngest foundation | `SUPPORT_OFFICIAL_INNGEST_ENABLED`, `INNGEST_EVENT_KEY` | `/api/inngest/official` serves the official SDK function registry separately from the custom webhook. |
| External bridge | `SUPPORT_SMOKE_BASE_URL`, `SUPPORT_EXTERNAL_BRIDGE_TOKEN`, `SUPPORT_EXTERNAL_BRIDGE_AUTHOR_USUARIO_ID`, `SUPPORT_SMOKE_TICKET_ID` | `/api/support/external/inbound` rejects invalid auth, accepts sanitized staging updates for `public_reply` and `internal_note`, and treats each action's duplicate idempotency key as duplicate. |
| R2 direct provider | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Private support bucket accepts one smoke PUT, returns matching bytes on GET, and deletes the smoke object in cleanup. |
| Resend | `RESEND_API_KEY`, `SUPPORT_SMOKE_EMAIL_TO`, optional `RESEND_FROM_NAME`, `RESEND_FROM_EMAIL` | Resend accepts a staging-safe notification email with no evidence, attachments, diagnostics, secrets, object keys, or user PII. |

`SUPPORT_SMOKE_BASE_URL` must be a staging/preview/local origin for the running Next.js app. Do not use the production `connect.yosoyglobal.org` origin. `SUPPORT_SMOKE_TICKET_ID` must be a safe staging support ticket UUID because the external bridge persists a clearly labeled smoke update. `SUPPORT_SMOKE_EMAIL_TO` must be a reviewer-controlled staging recipient; do not send smoke email to users.

The R2 smoke intentionally exercises direct provider put/get/delete, not the authenticated attachment app routes. The app-level attachment intent/finalize/download route smoke still requires an authenticated staging user/session with access to the staging ticket; do that manually unless a reviewer provides a safe session mechanism for automation.

## Rollback Guidance

Use the least destructive rollback first. Rollback should protect users and preserve production records unless deletion has been explicitly reviewed.

| Problem | First action | Follow-up |
|---------|--------------|-----------|
| Bad UI rollout | Hide `/ayuda` navigation and staff links. | Keep routes gated while the fix is reviewed. |
| Attachment signing issue | Disable upload/finalize/download route exposure or revoke R2 signing credentials. | Keep R2 objects private; review stale pending upload cleanup before deleting objects. |
| Email noise or unsafe copy | Disable support notification worker/send path. | Keep audit events and tickets; resume only after template/payload review. |
| Inngest retry loop | Pause the support functions or filter support events. | Check idempotency keys before replaying jobs. |
| Sentry privacy concern | Disable support evidence collection or Sentry send for the affected runtime. | Preserve ticket records and investigate scrubber coverage before re-enabling. |
| Migration defect before production data | Revert the migration only after review confirms no production support data exists. | Prefer additive follow-up migrations when possible. |
| Migration defect after production data | Do not drop support tables or columns. | Hide feature entry points, export/archive affected records if needed, and ship an additive corrective migration. |

Production migration application remains an explicit reviewed operation. Do not run production Supabase DDL, DML, branch merges, resets, or destructive rollback commands as part of routine support operations.

## Retention Open Questions

Retention is not finalized. Until it is reviewed, operators must not implement destructive cleanup for uploaded support evidence or ticket history.

Open decisions:

- Final retention duration for support tickets, messages, evidence metadata, audit events, and attachments.
- Cleanup cadence for stale `pending_upload` attachments and rejected R2 objects.
- Whether retention differs by ticket status, campus, requester role, or legal hold.
- Export/archive process before deleting any support data.
- Operator approval path for retention jobs and emergency privacy deletion requests.

Temporary operating rule: cleanup may remove only clearly stale pending uploads after review of the exact object keys and database rows. Closed or resolved ticket records and uploaded evidence remain preserved until the retention decision is complete.

## Future GitHub Sync Boundary

The MVP must not create GitHub issues. A future sync can exist only after sanitized investigation confirms an engineering issue.

GitHub issues are downstream engineering artifacts only. They must never receive:

- Evidence blobs, screenshots, videos, signed URLs, or attachment metadata that reveals private object keys.
- Raw Sentry payloads, replay links, request bodies, headers, cookies, tokens, localStorage, diagnostics, or stack traces with user-sensitive data.
- R2 account IDs, access keys, secret keys, bucket object keys, or signed URLs.
- Internal staff messages, private audit notes, assignment details, capability lists, or support-only comments.
- User-sensitive details such as emails, phone numbers, church/member data, campus-specific private context, database IDs, or free-form descriptions that contain PII.

Allowed future payload shape:

- Sanitized problem summary.
- Reproduction steps rewritten without user-identifying details.
- General environment facts such as browser family, OS family, viewport class, route pattern, and app/build version.
- Internal support ticket link for authorized staff.
- Sentry event reference ID only when scrubbed and access-controlled.

## Verification Checklist

Operators and reviewers should confirm each item before enabling or reviewing the support operations slice:

- [ ] Production migrations were not applied automatically and have explicit review approval before any hosted apply.
- [ ] R2 bucket `global-connect-support` is private and credentials are server-only.
- [ ] Attachment upload, finalize, and download flows authorize before issuing signed URLs.
- [ ] Resend sender domain and `NEXT_PUBLIC_SITE_URL` produce authenticated support links for the target environment.
- [ ] `/api/inngest` still preserves current custom webhook behavior, while `/api/inngest/official` remains the isolated official SDK foundation.
- [ ] Inngest support events contain IDs only and preserve idempotency keys.
- [ ] Hermes ticket-created outbound remains `dry-run` or `disabled` unless a reviewed environment explicitly sets `SUPPORT_HERMES_DISPATCH_MODE=live` with server-only URL and secret values.
- [ ] Email templates exclude evidence, attachments, diagnostics, raw Sentry, R2 keys, GitHub data, and long user text.
- [ ] Sentry support privacy defaults remain scrubbed and replay is not captured by default.
- [ ] Rollback plan starts with hiding feature entry points and disabling side effects, not dropping production data.
- [ ] Retention is still tracked as an open question and no destructive retention job is enabled.
- [ ] Future GitHub sync remains out of MVP and limited to sanitized downstream engineering artifacts.
