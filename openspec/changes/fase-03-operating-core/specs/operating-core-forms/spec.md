# Operating Core Forms Specification

## Purpose

Define a simple, reusable form definition and submission contract for Operating Core. Forms capture structured data with a closed set of field types, scoped view/submit/export permissions, and validated submissions. The form contract aligns with the Capture UX capture contract; forms do not introduce domain-specific production UI. Conditional workflows, approvals, e-signatures, and file uploads are out of scope for Fase 3.

## Requirements

### Requirement: Form definition lifecycle

The system SHALL persist each form definition in one of three lifecycle states: `draft`, `published`, `archived`. A form MUST NOT accept submissions while `draft` or `archived`. Transitions between states SHALL be auditable and authorized via the `operating_core.forms.manage` capability.

#### Scenario: Published form accepts submissions
- GIVEN a form in `published` state owned by an Experience
- WHEN a scoped operator opens the public link
- THEN the form renders and accepts submissions.

#### Scenario: Draft form rejects submissions
- GIVEN a form in `draft` state
- WHEN any submitter attempts to post answers
- THEN the system rejects the request with a not-yet-live / inaccessible response
- AND no submission row is persisted.

### Requirement: Closed field type union

Form field types MUST be exactly `text`, `email`, `phone`, `number`, `date`, `select`, `multiselect`, `checkbox`, `textarea`. Persisted definitions SHALL validate that every field has a label, a type from this closed set, and required configuration where applicable.

#### Scenario: Field types validated at publish time
- GIVEN a form draft that includes an unsupported field type
- WHEN the owner publishes the form
- THEN the system rejects the publish action with a domain error
- AND the unsupported field is flagged.

### Requirement: Scoped view, submit, and export permissions

Form definitions SHALL declare ownership scope. The view capability SHALL allow reading the form; the submit capability SHALL allow posting responses; the export capability SHALL allow reading submissions. Capabilities SHALL derive from the Operating Core flag plus the applicable scope.

#### Scenario: Submit without scope denied
- GIVEN a form owned by an Experience where the actor has no submit scope
- WHEN the actor posts a submission
- THEN the system rejects with a forbidden response
- AND no row is persisted.

#### Scenario: Export limited to authorized actor
- GIVEN a form whose submissions are tagged under a Dream Team scope
- WHEN a director without that scope queries exports
- THEN the response excludes those rows.

### Requirement: Validated submissions

Every submission SHALL pass server-side validation against the form schema. Invalid responses MUST be rejected without partial persistence, and a domain error SHALL be returned detailing the failing fields. No silent coercion SHALL occur.

#### Scenario: Required field missing rejected
- GIVEN a published form with a required `text` field
- WHEN a submitter posts an answer that omits that field
- THEN the API returns a validation error with the failing field name
- AND no submission row is persisted.

#### Scenario: Successful submission persisted
- GIVEN a published form with valid answers
- WHEN a submitter posts the answers
- THEN a single submission row is persisted with timestamp and submitter id.

### Requirement: Capture UX alignment for submission outcomes

Form submissions integrate with the Capture UX contract through the shared capture states (`idle`, `in_progress`, `awaiting_resolution`, `confirmed`, `overridden`, `rejected`). Forms MUST NOT introduce submission outcomes outside this closed state set.

#### Scenario: Submission aligns with capture states
- GIVEN a form submission enters the capture flow
- WHEN the outcome reaches the submitter
- THEN it is described using the shared capture state set
- AND no form-only state appears in the response.
