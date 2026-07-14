# Operating Core Resources Specification

## Purpose

Define the Operating Core resource library: link, file, and video entries with category and tags, scoped visibility by roles or capabilities, and ownership records. Ownership changes create a new record and archive the prior one to preserve audit. LMS features, compliance tracking, SCORM packaging, and advanced analytics are out of scope.

## Requirements

### Requirement: Resource shape and categories

A resource SHALL carry `type` (`link` | `file` | `video`), `title`, `description`, `category`, optional `tags[]`, the owning scope, and creator and timestamp. Files and videos SHALL reference storage through the existing platform storage contract; the resource row itself SHALL NOT embed binary content.

#### Scenario: Link resource created
- GIVEN a director creates a resource of type `link`
- WHEN the create action submits
- THEN a row persists with `type = link`, the owning scope, and the creator timestamp.

#### Scenario: Unsupported type rejected
- GIVEN an attempt to create a resource of an unsupported type
- WHEN the validator runs
- THEN the system rejects the create action
- AND MUST NOT persist a row.

### Requirement: Visibility by roles or capabilities

Each resource SHALL declare a visibility scope. Reading the resource MUST require intersection of the requesting actor's scope and the resource's visibility scope. Server-side enforcement SHALL be authoritative.

#### Scenario: Out of scope reader denied
- GIVEN a resource with team-scoped visibility
- WHEN a director scoped to a different scope requests it
- THEN the system rejects with a forbidden response
- AND MUST NOT leak title or description.

### Requirement: Ownership change archives prior record

When a resource moves ownership, the system SHALL NOT mutate the prior record. Instead, a new resource row is created and the prior row is marked `archived` with an audit row linking both via a successor reference. Archive MUST preserve audit and SHALL be irreversible from the public API.

#### Scenario: Ownership change creates successor
- GIVEN resource `R1` owned by one scope
- WHEN an operator reassigns R1 to a different scope
- THEN a new row `R2` is created with a successor reference to R1
- AND `R1` is marked `archived`.

### Requirement: No LMS, compliance, or advanced analytics

Operating Core resources MUST NOT include LMS-oriented fields (course hierarchies, completion percent), SCORM packaging, compliance certifications, or predictive analytics. Storing files SHALL go through the existing platform storage contract; resource rows SHALL NOT bypass storage guards.

#### Scenario: Storage policy enforced
- GIVEN a resource of type `file` with a sensitive file URL
- WHEN an unauthorized actor requests it
- THEN the storage layer returns a forbidden response
- AND the resource row MUST NOT bypass storage guards.
