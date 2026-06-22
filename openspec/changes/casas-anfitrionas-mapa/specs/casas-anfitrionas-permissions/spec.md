# Delta for Casas Anfitrionas Permissions

## ADDED Requirements

### Requirement: Shared Host Home and Hall Rules

The system MUST allow multi-group Casa Anfitriona assignment only when permitted by role, scope, and house policy. Iglesia Global halls SHALL be modeled as approved multi-group Casas and MUST remain subject to scoped authorization.

#### Scenario: Allowed multi-group assignment
- GIVEN an authorized admin or scoped director assigns multiple in-scope groups to an eligible shared Casa
- WHEN the assignment is saved
- THEN each group is linked without bypassing review or scope rules

#### Scenario: Unauthorized shared assignment denied
- GIVEN a user lacks scope or role permission for a shared Casa or hall
- WHEN they attempt assignment
- THEN the system denies the mutation

## MODIFIED Requirements

### Requirement: Granular Role Permissions

The system MUST authorize Casas actions independently: view, create self, create for another, assign to group, approve/reject, edit, deactivate/reactivate, and access member-location layers. Admin and pastor SHALL have all Casas actions. Director-general SHALL have all actions only within director-general scope. Director-etapa SHALL view, create, assign, edit, deactivate/reactivate, and member-location access only within assigned etapa scope and MUST NOT approve/reject unless product explicitly grants it later. Lider MAY create own or group-related pending requests and assign eligible in-scope Casas to their groups, and MUST NOT approve/reject, deactivate/reactivate, access member-location layers, or create arbitrary houses for others. Member/anfitrion MAY create own pending requests only.
(Previously: Permissions did not include group assignment or member-location layer access.)

#### Scenario: Authorized action succeeds
- GIVEN a user role, requested Casas action, and target are allowed by the role contract and scope
- WHEN the action is requested from UI, server action, or RPC
- THEN the system allows the action consistently

#### Scenario: Unauthorized action is denied
- GIVEN a director-etapa, lider, member, or anfitrion requests an action outside role or scope
- WHEN create-for-another, approve/reject, edit, member-location access, or deactivate/reactivate is attempted
- THEN the system denies the action without mutating the house or exposing locations

### Requirement: Scoped Visibility and Detail Revalidation

The system MUST validate scoped visibility before returning detail data, assignment candidates, member-location data, or applying mutations. Direct URL access, enriched admin reads, and submitted identifiers SHALL be revalidated against the same visibility rules used for listing.
(Previously: Scoped revalidation covered detail data and mutations, but not assignment candidates or member-location data.)

#### Scenario: Direct detail access is revalidated
- GIVEN a user opens a Casas detail URL for an out-of-scope house
- WHEN the detail page or server action resolves the house id
- THEN the system denies access before exposing sensitive detail data

#### Scenario: Scoped lower role targets are checked
- GIVEN a director-etapa or lower role submits a target user, group, co-host, house id, or member-location request
- WHEN the request is processed
- THEN every target MUST be within the actor's permitted scope
