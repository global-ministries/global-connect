# Operating Core Visitor Resolution Specification

## Purpose

Define the Operating Core visitor-resolution contract: reuse the existing cédula-bearing identity column and the existing persona signal without inventing a parallel identity contract; resolve captured visitors to either an existing persona, an ambiguous candidate that requires authorized operator confirmation, or a minimum user/person with `autoMerge=false`. Record only non-PII outcome metadata in the participation ledger.

## Requirements

### Requirement: Exact cédula match reuses existing identity record

The system SHALL lookup the existing cédula-bearing identity record for an exact match after normalization. An exact match MUST reuse the existing person and the existing auth-account link if present, without inserting a new identity record. No new identity column, table, or parallel contract SHALL be introduced.

#### Scenario: Exact match reuses identity and auth link
- GIVEN an existing identity record carrying a matching cédula and an auth-account link
- WHEN the visitor-resolution adapter receives `{ cedula: "..." }`
- THEN the resolved persona is the existing record
- AND the auth-account link is preserved without a new row.

#### Scenario: Lookup failure does not create duplicate
- GIVEN a transient backend error during the lookup
- WHEN the adapter retries
- THEN a duplicate identity record MUST NOT be created
- AND the adapter returns a recoverable domain error.

### Requirement: Fallback consumes existing persona contract

The system MUST consume the existing persona decision contract without inventing a parallel score. When the contract returns a single candidate and does not require review, the adapter MUST reuse that candidate. Ambiguous results or any review-required result MUST require authorized operator confirmation before any persisted resolution.

#### Scenario: Single candidate auto-reused
- GIVEN the existing persona contract returns a single candidate with no review required
- WHEN the adapter runs without operator context
- THEN the resolved persona matches the only candidate.

#### Scenario: Ambiguous rejected without operator
- GIVEN the existing persona contract returns multiple candidates or marks review as required
- WHEN the adapter runs without operator context
- THEN the adapter MUST NOT persist any resolution
- AND MUST surface a domain error requiring operator confirmation.

### Requirement: Only no_match creates minimum persona with autoMerge=false

The system SHALL create a minimum persona only when the existing contract returns no match. Creation MUST set `autoMerge = false`. Account/auth linking, when applicable, MUST be performed through the existing identity account link relationship, not by inserting a new identity row.

#### Scenario: No match creates minimal
- GIVEN the existing persona contract returns no match for a provided signal set
- WHEN the adapter performs the capture
- THEN the minimum persona is persisted with `autoMerge = false`.

### Requirement: visitor_capture stores only non-PII metadata

The `visitor_capture` participation event SHALL persist match method, actor, capture source, and resolved persona only. The raw cédula, full name, or other sensitive identifiers MUST NOT appear in `metadata`, response payloads, or log lines. See `operating-core-participation-ledger` for the full kind schema.

#### Scenario: Non-PII metadata persisted
- GIVEN a resolved visitor capture
- WHEN `visitor_capture` is emitted
- THEN the stored record carries match method, actor, capture source, and resolved persona
- AND raw cédula or full name MUST NOT appear.

#### Scenario: Raw cédula rejected from payload
- GIVEN an API payload accidentally includes the raw cédula in metadata
- WHEN the persistence layer validates
- THEN the write is rejected with a domain error
- AND no ledger row is created.
