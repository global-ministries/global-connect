# Support Ticket System Specification

## Requirements

### Requirement: Authenticated Ticket Submission

The system MUST provide `/ayuda` creation, history, detail, messages, and statuses `received`, `in_review`, `in_progress`, `resolved`, `closed`. Reporter creation MUST expose only `subject`, `description`, `category`, and `attachments`; technical diagnostics MUST be auto-captured by default using privacy-safe allowlists.

#### Scenario: Submit ticket
- GIVEN an authenticated user enters subject, description, category, and optional attachments
- WHEN they submit from `/ayuda`
- THEN a ticket is created with status `received`
- AND privacy-safe diagnostics are attached automatically by default

#### Scenario: Reject anonymous
- GIVEN an anonymous visitor
- WHEN they attempt to create or read a ticket
- THEN the request is denied

#### Scenario: Hide technical fields
- GIVEN an authenticated reporter opens the creation form
- WHEN the form renders
- THEN route, viewport, browser, OS, Sentry id, payload, cookie, and storage fields are not user-editable visible fields

### Requirement: Secure R2 Attachment Handling

The system MUST keep blobs in private R2, metadata in Supabase, issue signed URLs after authorization, and enforce screenshots PNG/JPG/WebP up to 10MB each, max 5; video MP4/WebM/MOV up to 100MB, max 1; total 150MB per ticket; no base64. Creation MUST support inline upload with progress, retry, and finalize states and MUST NOT expose public permanent bucket URLs.

#### Scenario: Accept attachment
- GIVEN an authenticated reporter owns the ticket creation session
- WHEN they upload allowed files inline
- THEN metadata is recorded, private upload is authorized, progress is shown, and finalized files attach to the ticket

#### Scenario: Reject attachment
- GIVEN files exceed limits or fail MIME sniffing
- WHEN intent or finalization is checked
- THEN files are rejected and no attachment is exposed

#### Scenario: Forbid direct access
- GIVEN a private R2 object key or signed URL
- WHEN any user bypasses authorization or views payloads
- THEN permanent public bucket URLs, object keys, and signed URLs are not exposed

#### Scenario: Retry failed upload
- GIVEN an inline attachment upload fails before finalization
- WHEN the reporter retries
- THEN the upload can continue or restart without duplicating finalized attachments

### Requirement: Support Capability Authorization

The system MUST authorize staff through existing global admin capabilities: `support.view`, `support.reply`, and `support.manage`. Capability checks MUST gate UI visibility, server actions, and RLS-backed access.

#### Scenario: Gated action
- GIVEN a global admin has the required support capability
- WHEN they view, reply, assign, or manage tickets
- THEN the action succeeds within that boundary

#### Scenario: Deny unauthorized
- GIVEN a user lacks the required capability
- WHEN they access another ticket, staff route, or staff action
- THEN UI, server authorization, and RLS deny access

### Requirement: Staff Console, Search, and Lifecycle

The system MUST provide a console with filters, Postgres FTS, ticket detail, replies, assignments, and validated status transitions. Staff MUST be able to view, reply, assign, and change status from UI only according to assigned capabilities.

#### Scenario: Search and filter queue
- GIVEN support staff can view tickets
- WHEN they search text or filter by status/category/campus/assignee
- THEN matching authorized tickets are returned

#### Scenario: Reply from UI
- GIVEN support staff has `support.reply`
- WHEN they submit a ticket reply from the staff UI
- THEN the reply is saved, visible in ticket history, and audited

#### Scenario: Validate status
- GIVEN support staff has `support.manage`
- WHEN they change ticket status or assignee from UI
- THEN only supported lifecycle values are saved and audited

### Requirement: Privacy-Safe Evidence Capture

The system MUST capture only privacy-safe allowlisted diagnostics such as route path, browser family, OS family, viewport, timestamp, user id, capabilities, build version, Sentry event reference, user steps, and attachment metadata. The system MUST NOT capture raw replays, raw payloads, cookies, localStorage, passwords, signed URLs, object keys, or sensitive content.

#### Scenario: Allow diagnostics
- GIVEN a user submits a ticket with default diagnostics enabled
- WHEN evidence is collected
- THEN only allowlisted diagnostics and Sentry references are stored

#### Scenario: Block evidence
- GIVEN evidence contains tokens, cookies, passwords, localStorage, raw Sentry payloads, raw replay data, signed URLs, object keys, or sensitive payloads
- WHEN the ticket is processed
- THEN evidence is rejected or scrubbed before storage or notification

### Requirement: Notifications and Audit Events

The system MUST emit append-only audit events and MUST send safe, idempotent Inngest/Resend notifications to all support staff for new tickets without sensitive evidence.

#### Scenario: Send safe notification
- GIVEN a ticket is created
- WHEN the committed event dispatches through Inngest and Resend
- THEN each support staff recipient receives one safe notification linking to the authenticated ticket
- AND payloads exclude evidence, attachments, raw diagnostics, and unintended PII

#### Scenario: Record audit trail
- GIVEN a relevant action occurs
- WHEN it is committed
- THEN an immutable event records actor, action, target, timestamp

#### Scenario: Avoid duplicate notifications
- GIVEN the notification workflow is retried
- WHEN the same ticket event is processed again
- THEN idempotency prevents duplicate recipient notifications

### Requirement: GitHub Sync Deferred Boundary

The system MUST NOT create GitHub issues or perform direct GitHub built-in sync for support tickets. Any future engineering escalation MUST flow through the external escalation bridge with sanitized, staff-approved content.

#### Scenario: MVP does not sync to GitHub
- GIVEN a ticket is submitted, triaged, or escalated
- WHEN the support workflow completes
- THEN no built-in GitHub issue is created

#### Scenario: Future sync remains sanitized
- GIVEN a later external workflow prepares engineering escalation
- WHEN a payload is generated
- THEN only sanitized summary, steps, environment, references, and internal ticket link are allowed

### Requirement: Authenticated Support Layout and Navigation

The system MUST render `/ayuda/**` inside the normal authenticated desktop sidebar layout and mobile navigation. Support-capable staff MUST see an admin support entry only when they have an applicable support capability.

#### Scenario: Reporter uses normal layout
- GIVEN an authenticated reporter opens any `/ayuda/**` route
- WHEN the page renders on desktop or mobile
- THEN the normal authenticated layout and navigation are available

#### Scenario: Staff sees admin entry
- GIVEN an authenticated admin has `support.view`, `support.reply`, or `support.manage`
- WHEN navigation renders
- THEN a support admin entry is visible
- AND users without support capability do not see it

### Requirement: Admin Support Capability Management

The system MUST allow authorized admins to grant and revoke only `support.view`, `support.reply`, and `support.manage`; changes MUST be auditable, capability-bounded, and safe for production data.

#### Scenario: Grant allowed support capability
- GIVEN an authorized admin manages another admin or staff user
- WHEN they grant an allowed support capability
- THEN the capability is saved and an audit event records actor, target, capability, and action

#### Scenario: Reject unsupported capability
- GIVEN an authorized admin submits a capability outside the allowed support set
- WHEN the change is validated
- THEN the request is rejected and no capability is changed

### Requirement: External Escalation Bridge

The system MUST NOT provide direct built-in GitHub sync. It MAY expose a configurable outbound webhook, email, or event bridge and MUST authenticate, sanitize, audit, and de-duplicate inbound external updates.

#### Scenario: Send sanitized escalation
- GIVEN staff escalates a ticket to an external workflow
- WHEN the outbound bridge dispatches
- THEN only sanitized ticket references and intended recipient details are sent
- AND raw diagnostics, PII, attachments, signed URLs, and object keys are excluded

#### Scenario: Accept authenticated inbound update
- GIVEN an external actor sends an update with valid authentication and idempotency key
- WHEN the update is processed
- THEN the sanitized message is attached once and audited

### Requirement: Production Rollout and Release Gates

The system MUST remain visible only in a safe degraded state until DB, provider, env, smoke, RLS, privacy, rollback, and additive migration gates pass. Production migrations MUST be reviewed, additive, and non-destructive; production data MUST NOT be deleted.

#### Scenario: Block unsafe readiness claim
- GIVEN production DB or provider readiness is incomplete
- WHEN support readiness is evaluated
- THEN the app does not claim production readiness
- AND user-facing flows degrade safely without data loss

#### Scenario: Approve production readiness
- GIVEN additive migrations are reviewed, RLS and smoke tests pass, providers are configured, and rollback is documented
- WHEN release gates are checked
- THEN support may be marked production ready
