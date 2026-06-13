# Hermes Response Policy (PR 4)

This policy defines how Global Connect processes Hermes callbacks in PR 4.

## Quick path

1. Classify callback action as either `public_reply` or `internal_note`.
2. Apply allowlist/denylist rules before writing any message.
3. Redact all non-public or sensitive details.
4. For `public_reply`, send only safe, actionable user guidance.
5. For `internal_note`, include concise impact + triage direction only.

## Decision policy

| Callback action | When to use |
|---|---|
| `public_reply` | Safe user guidance with low risk and no sensitive context |
| `internal_note` | Any case needing staff investigation, ambiguity, security context, diagnostics, or internal handling |

## Direct `public_reply` allowlist

- Password change and login/access reset flow guidance that does not require identity recovery.
- App navigation and feature-location questions for existing user-visible screens.
- Safe confirmation messages, such as “ticket created” or “support is reviewing”.
- General self-service checks with no sensitive account, diagnostics, attachment, or internal context.
- Non-technical status updates that do not promise delivery dates, root causes, or fixes.

## Direct `public_reply` denylist

If any item applies, Hermes must use `internal_note` instead of `public_reply`:

- Security incidents, account compromise, or billing-impacting reports
- Raw logs, stack traces, diagnostics, IDs, evidence, attachment contents, or object metadata
- Sensitive user or staff details (PII/credentials/contacts)
- Engineering commitments, release windows, or guaranteed fix timelines
- Requests for actions that require manual investigation or internal policy decisions
- Account recovery, identity verification, permission changes, or suspicious activity investigation
- Any request involving data mutation, church/member private context, or cross-functional escalation

## `internal_note` triggers

- Missing clear allowlist fit
- Request implies risk, escalation, or additional staff follow-up
- Any ambiguity in scope or potential sensitive data handling
- Repeated pattern reports that likely need trend analysis
- Non-trivial failures requiring reproducibility and triage
- `public_reply` would risk exposing PII, secrets, diagnostics, attachments, raw ticket data, or internal identifiers

## GitHub deferral

- PR 4 does not implement GitHub issue creation.
- Never create GitHub issues from Hermes callback handling in this PR.
- Use `internal_note` to record why escalation is needed and what was observed.
- Include sanitized references only: summary, impact type, reproduction signal, and next owner.

## Safety constraints

Outbound Hermes responses must not include:

- PII or credentials
- Secrets or secret-like values
- Diagnostics, stack traces, or raw Sentry payloads
- Attachments, attachment metadata, object keys, or signed URLs
- Raw ticket data and internal DB identifiers
- Promises about engineering timelines or fixes

## Example mapping

| User scenario | Action |
|---|---|
| "How do I change my password?" | `public_reply` |
| "Where is the support inbox?" | `public_reply` |
| "My app crashes and I attached logs" | `internal_note` |
| "Can you fix this and tell me by Friday?" | `internal_note` |
| "I see repeated unauthorized activity" | `internal_note` |

## Repository notes

- Keep this policy authoritative for review of inbound Hermes behavior.
- Runtime code changes remain in future PRs when integration requirements expand.
