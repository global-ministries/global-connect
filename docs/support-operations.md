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
| Inngest | Events carry IDs only; workers must fetch data after authorization and must be idempotent. |
| Resend | Emails contain safe authenticated links only; no evidence, attachments, or raw diagnostics. |
| Sentry | Support stores Sentry references only; raw payloads, replay media, cookies, headers, and diagnostics are scrubbed. |
| GitHub | No MVP sync. Future GitHub issues are downstream engineering artifacts only. |

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

### Inngest

| Setting | Required | Notes |
|---------|----------|-------|
| Event names | Yes | `support/ticket.created`, `support/ticket.message.created`, `support/ticket.status.changed`, `support/attachment.finalized`. |
| Payload shape | Yes | IDs only: `eventId`, `ticketId`, optional `actorUserId`, and relevant message or attachment IDs. |
| Idempotency | Yes | Email keys use `email:{eventId}:{recipient}`. Preserve this shape in any worker integration. |
| Provider credentials | Future wiring | The current support module defines event contracts and email dispatch helpers; provider-specific live Inngest client wiring must be reviewed before enabling. |

Workers must fetch ticket data server-side, avoid long user text in events, and never include evidence, attachment URLs, R2 keys, raw Sentry payloads, diagnostics, cookies, tokens, emails beyond the intended recipient, phone numbers, church/member details, or database internals in queued payloads.

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
- [ ] Inngest support events contain IDs only and preserve idempotency keys.
- [ ] Email templates exclude evidence, attachments, diagnostics, raw Sentry, R2 keys, GitHub data, and long user text.
- [ ] Sentry support privacy defaults remain scrubbed and replay is not captured by default.
- [ ] Rollback plan starts with hiding feature entry points and disabling side effects, not dropping production data.
- [ ] Retention is still tracked as an open question and no destructive retention job is enabled.
- [ ] Future GitHub sync remains out of MVP and limited to sanitized downstream engineering artifacts.
