# Member Location Map Specification

## Purpose

Define the permission-gated member location layer for authorized admin/director map views.

## Requirements

### Requirement: Role-Scoped Member Layer

The system MUST expose exact member location pins only to admin and director roles within authorized active or planned scope. The member layer MUST be hidden from leaders, members, unauthenticated users, and out-of-scope viewers.

#### Scenario: Authorized director sees scoped pins
- GIVEN a director has member-location access for a scope
- WHEN the member layer is enabled
- THEN only exact member pins inside that scope are shown

#### Scenario: Unauthorized viewer denied
- GIVEN a leader, member, unauthenticated user, or out-of-scope director requests member pins
- WHEN the member layer is requested
- THEN the request is denied and no member locations are returned

### Requirement: Member Location Privacy Messaging

The system MUST clearly distinguish group host-home markers from sensitive member location pins and MUST warn authorized users that member locations are private operational data.

#### Scenario: Privacy warning shown
- GIVEN an authorized user enables the member layer
- WHEN member pins are displayed
- THEN the UI shows neutral privacy messaging about restricted operational use

#### Scenario: Public map excludes member data
- GIVEN any viewer opens the normal Life Group map
- WHEN host-home markers render
- THEN member addresses, member pins, and member-derived exact locations are absent
