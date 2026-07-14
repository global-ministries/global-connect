# Operating Core Dashboards Specification

## Purpose

Define operational dashboards for Director, Líder, and Operador personas: counts, pending items, active alerts, and current event operations, filtered by scope and capabilities. Registration and attendance metrics SHALL be distinguished and derivable from a single ledger. Churn, predictive, cohort analytics, and operational KPI targets are deferred to Product/Ops; existing dashboards MUST NOT be redesigned in Fase 3.

## Requirements

### Requirement: Director, Líder, and Operador operational views

The system SHALL expose distinct dashboard views for Director, Líder, and Operador personas. Each view SHALL render operational data scoped to the actor's experience or team.

#### Scenario: Director sees aggregated counts
- GIVEN a director with `operating_core.events.read` full scope
- WHEN they open the dashboard
- THEN counts of upcoming events, pending registrations, and active alerts render.

#### Scenario: Operador sees current event operations
- GIVEN an operator scoped to a single campus
- WHEN they open the dashboard
- THEN only that campus's current and next event appear.

### Requirement: Registration and attendance metrics distinguished

The dashboard SHALL render registration metrics and attendance metrics as distinct categories derived from the single ledger. Registration metrics use `registration`, `cancellation`, and `attendance_update` kinds. Attendance metrics use `attendance` and `check_in`/`check_out` kinds. The dashboard MUST NOT conflate them.

#### Scenario: Registration count labelled
- GIVEN a campus with 18 confirmed registrations and 5 waitlisted
- WHEN the dashboard renders the registration count
- THEN the value is 23 and labelled as registrations.

#### Scenario: Attendance count labelled
- GIVEN 12 attendees marked `asistida`
- WHEN the dashboard renders attendance count
- THEN the value is 12 and labelled as attendance.

### Requirement: Operational current-period counts

The dashboard SHALL derive operational counts for the current operating period (default = today and the upcoming occurrence window). The current period is configurable per view but MUST be derivable from the ledger.

#### Scenario: Current-period default
- GIVEN a director opens the dashboard
- WHEN the current period is computed
- THEN it covers today plus the upcoming occurrence window
- AND counts reflect that window.

### Requirement: Scope and capability filtering are authoritative

The system SHALL filter all dashboard queries using the same auth context and capability guards as the underlying API routes. Direct URL or query manipulation MUST NOT bypass the guards.

#### Scenario: Out of scope request denied
- GIVEN a director requests dashboard data outside their scope
- WHEN the server evaluates filters
- THEN the response excludes out-of-scope counts and items
- AND MUST NOT expose them via direct query.

### Requirement: KPI targets and trend analytics deferred

The dashboard MUST NOT render specific operational KPI targets until Product/Ops defines them. Trend, churn, retention, predictive, and cohort analytics are out of scope.

#### Scenario: Counts only, no churn widget
- GIVEN the dashboard renders
- WHEN the response is sent to the client
- THEN it includes counts and pending items
- AND MUST NOT include churn, retention, or cohort analytics.

#### Scenario: KPI targets deferred
- GIVEN operational KPI target values are not yet approved
- WHEN the dashboard renders
- THEN no concrete KPI target values appear.

### Requirement: Existing dashboards not redesigned

The system MUST NOT alter the existing dashboard layouts from Fase 1 and Fase 2. Operating Core widgets SHALL be added as additive components in a clearly named section, leaving existing layouts untouched.

#### Scenario: Existing layout unchanged
- GIVEN the existing dashboard layout is rendered
- WHEN the Operating Core section is added
- THEN existing widgets remain visually and functionally unchanged.
