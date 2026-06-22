# Host Home Location Review Specification

## Purpose

Define approval, pending-change, and audit behavior for Casa Anfitriona locations used by Life Group maps.

## Requirements

### Requirement: Approved and Pending Locations

The system MUST keep the last approved host-home location usable while a new location or sensitive change is pending review. A pending-only location MUST NOT make a group map-visible.

#### Scenario: Last approved remains visible
- GIVEN a mapped host home has an approved location and a pending location change
- WHEN the Life Group map loads
- THEN the map uses the last approved location

#### Scenario: Pending-only stays hidden
- GIVEN a group is linked to a Casa Anfitriona with no approved location
- WHEN map data is requested
- THEN the group is excluded until approval

### Requirement: Location Review Decision

Authorized reviewers MUST be able to approve or reject pending Casa Anfitriona location changes within scope. Approved changes SHALL become the official map location; rejected changes SHALL leave the previous approved location unchanged.

#### Scenario: Approve location
- GIVEN an authorized reviewer approves a pending location
- WHEN approval is saved
- THEN the approved location becomes eligible for map use

#### Scenario: Reject location
- GIVEN an authorized reviewer rejects a pending location change
- WHEN rejection is saved
- THEN the pending location is not used and the last approved location remains unchanged

### Requirement: Audit History

The system MUST record an audit history for host-home assignment, sensitive edits, approval, rejection, and map-eligibility changes.

#### Scenario: Audited decision
- GIVEN a reviewer approves or rejects a pending host-home location
- WHEN the decision is committed
- THEN audit history records actor, action, target, timestamp, and outcome

#### Scenario: Audit survives later edits
- GIVEN a host home is edited after prior approvals
- WHEN audit history is viewed by an authorized user
- THEN prior decisions remain visible and unaltered
