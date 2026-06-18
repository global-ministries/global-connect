# Casas Anfitrionas Permissions Specification

## Purpose

Define the Casas Anfitrionas permission contract for granular, scoped, UI/server/RPC-consistent authorization and data-safe rollout.

## Requirements

### Requirement: Granular Role Permissions

The system MUST authorize Casas actions independently: view, create self, create for another, approve/reject, edit, and deactivate/reactivate. Admin and pastor SHALL have all Casas actions. Director-general SHALL have all actions only within director-general scope. Director-etapa SHALL view, create, edit, and deactivate/reactivate only within assigned etapa scope and MUST NOT approve/reject unless product explicitly grants it later. Lider MAY create own or group-related pending requests and MUST NOT approve/reject, deactivate/reactivate, or create arbitrary houses for others. Member/anfitrion MAY create own pending requests only.

#### Scenario: Authorized action succeeds
- GIVEN a user role, requested Casas action, and target are allowed by the role contract and scope
- WHEN the action is requested from UI, server action, or RPC
- THEN the system allows the action consistently

#### Scenario: Unauthorized action is denied
- GIVEN a director-etapa, lider, member, or anfitrion requests an action outside role or scope
- WHEN create-for-another, approve/reject, edit, or deactivate/reactivate is attempted
- THEN the system denies the action without mutating the house

### Requirement: Scoped Visibility and Detail Revalidation

The system MUST validate scoped visibility before returning detail data or applying mutations. Direct URL access, enriched admin reads, and submitted identifiers SHALL be revalidated against the same visibility rules used for listing.

#### Scenario: Direct detail access is revalidated
- GIVEN a user opens a Casas detail URL for an out-of-scope house
- WHEN the detail page or server action resolves the house id
- THEN the system denies access before exposing sensitive detail data

#### Scenario: Scoped lower role targets are checked
- GIVEN a director-etapa or lower role submits a target user, group, co-host, or house id
- WHEN the request is processed
- THEN every target MUST be within the actor's permitted scope

### Requirement: UI, Server, and RPC Consistency

The system MUST use database permission predicates as the source of truth. UI controls, Next.js route guards, server actions, and RPC/RLS-backed checks SHALL expose the same allow/deny decisions and error states.

#### Scenario: UI mirrors backend authorization
- GIVEN a user cannot perform a Casas action by predicate
- WHEN pages and forms render
- THEN the related controls are hidden or disabled
- AND direct server/RPC calls are still denied

#### Scenario: Consistent permission diagnostics
- GIVEN UI, server action, and RPC evaluate the same actor/action/target
- WHEN permission results are compared
- THEN each layer returns the same decision category

### Requirement: Approved House Sensitive Edits

The system MUST treat sensitive edits to approved houses as requiring renewed review by default. Sensitive edits include owner/co-host assignment, address/location, schedule, capacity, active service suitability, and other fields that affect group placement. Unless product explicitly opts out, saving a sensitive edit SHALL return the house to pending/review and clear approval status safely.

#### Scenario: Sensitive edit returns to review
- GIVEN an approved house is edited in a sensitive field
- WHEN the edit is saved by an authorized actor
- THEN the house returns to pending/review until approved again

#### Scenario: Non-sensitive edit preserves approval
- GIVEN an approved house receives only non-sensitive metadata changes
- WHEN the edit is saved
- THEN approval MAY remain unchanged if policy classifies the fields as non-sensitive

### Requirement: Non-Destructive Migration and Data Safety

The system MUST roll out permission changes through additive, backward-compatible migrations. This change MUST NOT delete, rewrite, auto-repair, or backfill production Casas data. Existing data issues SHALL be reported by read-only diagnostics and handled only by a separate approved repair plan.

#### Scenario: Migration preserves production data
- GIVEN production contains existing Casas rows with imperfect data
- WHEN this change is deployed
- THEN existing rows remain present and unrewritten

#### Scenario: Data repair is blocked
- GIVEN a migration or task attempts corrective deletion, rewrite, or backfill
- WHEN it belongs to this change
- THEN the change is rejected unless separate explicit approval exists
