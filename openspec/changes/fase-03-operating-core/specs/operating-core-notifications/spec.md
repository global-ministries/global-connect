# Operating Core Notifications Specification

## Purpose

Define Operating Core notifications: shared outbox infrastructure, versioned Spanish code templates, retry with backoff and terminal failure handling, signed shared links with default 7-day TTL, and triggers tied to registration and attendance events. SMS and WhatsApp are out of scope. Sent-email retention is deferred to Legal/Product separately from participation retention.

## Requirements

### Requirement: Notification triggers

The system SHALL emit notifications for: registration confirmation, waitlist placement, waitlist promotion, cancellation to the responsible leader or capability holder, configurable reminder (default T-24h), and no-show record.

#### Scenario: Waitlist placement
- GIVEN a registration overflows capacity and waitlisting is enabled
- WHEN the row persists
- THEN a waitlist-placement notification is enqueued with the position.

#### Scenario: Cancellation and no-show route to leader
- GIVEN a cancellation or a `no_asistio` mark
- WHEN the participation event is emitted
- THEN a notification is enqueued for the responsible leader or capability holder.

#### Scenario: Reminder defaults to T-24h
- GIVEN an upcoming occurrence
- WHEN the start approaches within the configured window
- THEN a reminder notification is enqueued at the default 24-hour window unless overridden.

### Requirement: Shared outbox, no parallel delivery engine

Operating Core notifications SHALL be delivered through the shared outbox infrastructure. No parallel delivery engine SHALL exist.

#### Scenario: Single outbox enqueue
- GIVEN a registration transitions to `confirmada`
- WHEN the participation event is emitted
- THEN exactly one row is enqueued.

### Requirement: Versioned Spanish templates

Every Operating Core notification MUST reference a versioned template key in code (e.g., `registration_confirmed.v1`). Bodies SHALL default to Spanish. Removing an old version SHALL be deferred at least 90 days after the last emission.

#### Scenario: Template version pinned
- GIVEN `registration_confirmed.v1` is active
- WHEN the worker renders
- THEN the body comes from that version.

### Requirement: Read and sent state timestamps

The system MUST persist system notification read state with a `read_at` timestamp and email sent state with a `sent_at` timestamp.

#### Scenario: Read and sent recorded
- GIVEN a recipient opens a system notification and the email provider accepts delivery
- WHEN both states are persisted
- THEN `read_at` and `sent_at` reflect their respective events.

### Requirement: Retry with bounded backoff and terminal failed

The system SHALL retry failed notifications using bounded exponential backoff. After a documented attempt ceiling, the row SHALL transition to a terminal `failed` state observable by authorized operators.

#### Scenario: First failure reschedules
- GIVEN a queued notification with one prior failure
- WHEN the worker retries and the provider returns a transient error
- THEN `next_retry_at` is updated per the backoff schedule.

#### Scenario: Terminal failed flagged
- GIVEN a notification that has exhausted its retries
- WHEN the worker logs the terminal failure
- THEN the row state is `failed` and observable.

### Requirement: Signed shared links with default 7-day TTL

The system SHALL issue signed links for shared resources with a TTL default of 7 days, configurable per resource. Expired links MUST be rejected with an inaccessible / not-found response.

#### Scenario: Valid signed link grants access
- GIVEN a signed link with `expires_at = now + 7 days`
- WHEN an unauthenticated reader hits the shared endpoint
- THEN the resource payload is returned.

### Requirement: Sent-email retention deferred separately

Sent-email retention SHALL be deferred to a separate Legal/Product decision and SHALL NOT be conflated with participation retention.

#### Scenario: Sent-email not auto-purged
- GIVEN sent-email audit rows persist after delivery
- WHEN a future scheduled job runs
- THEN it MUST NOT delete sent-email rows under the participation retention rule.

### Requirement: No SMS or WhatsApp

Operating Core notifications MUST NOT include SMS or WhatsApp channels. Only system in-app and email channels SHALL be active.

#### Scenario: Channel limited
- GIVEN a queued notification
- WHEN the worker inspects available channels
- THEN the channel set is limited to in-app and email.
