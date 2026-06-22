# Life Group Host Home Map Specification

## Purpose

Define map eligibility, location source, filters, popups, and privacy messaging for Life Groups using Casas Anfitrionas as the official meeting location source.

## Requirements

### Requirement: Host Home Map Eligibility

The system MUST show a Life Group on the map only when the group is in an eligible current or planned scope, is linked to a Casa Anfitriona, and has an approved host-home location. Manual group addresses MUST NOT make a group map-eligible.

#### Scenario: Eligible group appears
- GIVEN an eligible group is linked to a Casa Anfitriona with an approved location
- WHEN the map loads for an authorized viewer
- THEN the group appears using the approved host-home location

#### Scenario: Missing or pending location is hidden
- GIVEN a group has no Casa Anfitriona or only a pending host-home location
- WHEN the map data is requested
- THEN the group is excluded from the map

### Requirement: Current and Planned Filters

The system MUST default to active/default Life Groups and MUST support planned/future filters without showing historical groups.

#### Scenario: Default active map
- GIVEN a viewer opens the map without filters
- WHEN map results load
- THEN only currently eligible active/default groups are shown

#### Scenario: Planned filter
- GIVEN a viewer selects a planned/future filter
- WHEN map results load
- THEN only eligible planned/future groups within viewer scope are shown

### Requirement: Popup Privacy Messaging

The system MUST label map locations as Casa Anfitriona locations and MUST NOT expose unapproved, sensitive, or member-derived address details in public group popups.

#### Scenario: Approved popup
- GIVEN a mapped group has approved public host-home details
- WHEN its marker popup opens
- THEN the popup shows only approved group and host-home display details

#### Scenario: Sensitive data withheld
- GIVEN a host home has pending or sensitive address data
- WHEN a popup renders
- THEN unapproved and sensitive details are hidden with neutral privacy messaging
