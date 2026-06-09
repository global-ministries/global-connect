# Delta for Support Ticket System

## ADDED Requirements

### Requirement: Authenticated Ticket Submission

The system MUST provide `/ayuda` creation, history, detail, messages, and statuses `received`, `in_review`, `in_progress`, `resolved`, `closed`.

#### Scenario: Submit ticket
- GIVEN an authenticated user with required ticket fields
- WHEN they submit a report from `/ayuda`
- THEN a ticket is created with status `received`
- AND the reporter can view it

#### Scenario: Reject anonymous
- GIVEN an anonymous visitor
- WHEN they attempt to create or read a ticket
- THEN the request is denied

### Requirement: Secure R2 Attachment Handling

The system MUST keep blobs in private R2, metadata in Supabase, issue signed URLs after authorization, and enforce screenshots PNG/JPG/WebP up to 10MB each, max 5; video MP4/WebM/MOV up to 100MB, max 1; total 150MB per ticket; no base64.

#### Scenario: Accept attachment
- GIVEN an authenticated reporter owns the ticket
- WHEN they request upload for allowed files
- THEN metadata is recorded and signed upload URLs are issued

#### Scenario: Reject attachment
- GIVEN files exceed limits or fail MIME sniffing
- WHEN intent or finalization is checked
- THEN files are rejected and no attachment is exposed

#### Scenario: Forbid direct access
- GIVEN a private R2 object key
- WHEN any user bypasses authorization
- THEN access is forbidden

### Requirement: Support Capability Authorization

The system MUST authorize staff through existing global admin capabilities: `support.view`, `support.reply`, and `support.manage`.

#### Scenario: Gated action
- GIVEN a global admin has the required support capability
- WHEN they view, reply, assign, or manage tickets
- THEN the action succeeds within that boundary

#### Scenario: Deny unauthorized
- GIVEN a user lacks the required capability
- WHEN they access another ticket or staff action
- THEN RLS/server authorization denies access

### Requirement: Staff Console, Search, and Lifecycle

The system MUST provide a console with filters, Postgres FTS, ticket detail, replies, assignments, and validated status transitions.

#### Scenario: Search and filter queue
- GIVEN support staff can view tickets
- WHEN they search text or filter by status/category/campus/assignee
- THEN matching authorized tickets are returned

#### Scenario: Validate status
- GIVEN support staff has `support.manage`
- WHEN they change ticket status
- THEN only supported lifecycle statuses are saved and audited

### Requirement: Privacy-Safe Evidence Capture

The system MUST capture only route, browser, OS, viewport, timestamp, user id, capabilities, build version, Sentry id, user steps, and attachments.

#### Scenario: Allow diagnostics
- GIVEN a user consents to diagnostics
- WHEN they submit a ticket
- THEN only allowlisted evidence and Sentry references are stored

#### Scenario: Block evidence
- GIVEN evidence contains tokens, cookies, passwords, localStorage, raw Sentry payloads, or automatic replay/video without consent
- WHEN the ticket is processed
- THEN evidence is rejected or scrubbed

### Requirement: Notifications and Audit Events

The system MUST emit append-only audit events and SHOULD send idempotent Inngest/Resend emails without sensitive evidence.

#### Scenario: Send safe notification
- GIVEN a ticket is created, replied to, or updated
- WHEN async notification runs
- THEN the recipient receives one safe email linking to the authenticated ticket

#### Scenario: Record audit trail
- GIVEN a relevant action occurs
- WHEN it is committed
- THEN an immutable event records actor, action, target, timestamp

### Requirement: GitHub Sync Deferred Boundary

The system MUST NOT create GitHub issues in the MVP. Future sync MUST require sanitized AI investigation and MUST NOT include PII, raw attachments, raw Sentry payloads, emails, phones, church/member data, or database IDs.

#### Scenario: MVP does not sync to GitHub
- GIVEN a ticket is submitted or triaged
- WHEN the MVP workflow completes
- THEN no GitHub issue is created

#### Scenario: Future sync remains sanitized
- GIVEN a later phase prepares GitHub issue creation
- WHEN a payload is generated
- THEN only sanitized summary, steps, environment, references, and internal ticket link are allowed
