# Host Home Completeness Specification

## Purpose

Define non-blocking operational queues for missing Casa Anfitriona assignment and pending review work.

## Requirements

### Requirement: Missing Host Home Queue

The system MUST surface active groups without an assigned Casa Anfitriona as non-blocking dashboard work for authorized leaders, directors, and admins.

#### Scenario: Dashboard summary appears
- GIVEN an authorized user has in-scope active groups missing Casa Anfitriona
- WHEN the dashboard loads
- THEN a summary card shows the missing count and a link to the queue

#### Scenario: Operations remain unblocked
- GIVEN a group is missing Casa Anfitriona
- WHEN attendance, reports, or planning workflows run
- THEN those workflows remain usable while the dashboard warning stays visible

### Requirement: Assignment Completion Workflow

The system MUST allow authorized users to complete missing host-home assignment by selecting an eligible existing Casa Anfitriona or creating a pending Casa Anfitriona for review.

#### Scenario: Existing host home assigned
- GIVEN an authorized user selects an in-scope eligible Casa Anfitriona for a group
- WHEN the assignment is saved
- THEN the group is linked and becomes map-ready only if the location is approved

#### Scenario: New pending host home assigned
- GIVEN an authorized user creates a Casa Anfitriona during assignment
- WHEN the request is saved
- THEN the group is linked to the pending Casa and stays off-map until approval

### Requirement: Pending Review Queue

The system MUST show pending host-home review items to authorized reviewers within their scope.

#### Scenario: Reviewer sees pending work
- GIVEN pending host homes or location changes exist within reviewer scope
- WHEN the review queue loads
- THEN each pending item is visible with enough context to approve or reject

#### Scenario: Out-of-scope work hidden
- GIVEN pending items exist outside the viewer scope
- WHEN the queue loads
- THEN those items are not visible
