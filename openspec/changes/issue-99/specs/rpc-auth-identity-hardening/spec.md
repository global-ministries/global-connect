# RPC Auth Identity Hardening Specification

## Purpose

Defines the security and rollout contract for `registrar_asistencia`, `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`.

## Requirements

### Requirement: Caller Identity Binding

The system MUST bind non-service RPC authorization to the active Supabase JWT identity. Non-service calls MUST be rejected when `auth.uid()` is null or when caller-supplied `p_auth_id` differs from `auth.uid()`. `service_role` MAY bypass this identity match only for trusted server/admin paths.

#### Scenario: Authenticated caller uses own auth id

- GIVEN an authenticated non-service caller
- WHEN the caller invokes a target RPC with `p_auth_id = auth.uid()`
- THEN the RPC proceeds to its existing domain authorization checks

#### Scenario: Authenticated caller spoofs another auth id

- GIVEN an authenticated non-service caller
- WHEN the caller invokes a target RPC with `p_auth_id` different from `auth.uid()`
- THEN the RPC rejects the request before privileged domain work occurs

#### Scenario: Service role trusted bypass

- GIVEN a trusted server/admin execution context using `service_role`
- WHEN it invokes a target RPC
- THEN the RPC MAY proceed without comparing `p_auth_id` to `auth.uid()`

### Requirement: RPC Execute Permissions

The system MUST revoke target RPC execution from `PUBLIC` and `anon`. The system SHALL grant execution only to `authenticated` and `service_role`.

#### Scenario: Anonymous execution is denied

- GIVEN an `anon` caller
- WHEN the caller attempts to execute any target RPC
- THEN database privileges deny execution

#### Scenario: Intended roles retain execution

- GIVEN an `authenticated` or `service_role` caller
- WHEN the caller executes a target RPC
- THEN database privileges allow invocation subject to identity and domain checks

### Requirement: Production Data Safety

The rollout MUST NOT delete, edit, backfill, truncate, or contaminate production users, profiles, groups, or data-bearing records. The migration SHALL only replace target function definitions and tighten grants. `eliminar_miembro_de_grupo` MAY delete an existing `grupo_miembros` relationship row as its existing remove-member behavior.

#### Scenario: Migration rollout avoids data mutation

- GIVEN production data is real
- WHEN issue-99 migration work is prepared or reviewed
- THEN no user/profile/group cleanup or ad-hoc data mutation is included

#### Scenario: Remove member deletes only relationship link

- GIVEN an authorized remove-member RPC call
- WHEN `eliminar_miembro_de_grupo` removes a member from a group
- THEN only the matching `grupo_miembros` relationship row is deleted

### Requirement: Read-only Safety Verification

Safety preflight and postflight checks MUST be read-only. They SHALL inspect target signatures, grants, function definitions, identity-check presence, rollback evidence, and same-pattern audit candidates. Migration application MUST require explicit human approval after preflight review.

#### Scenario: Preflight detects unsafe drift

- GIVEN live target function definitions or signatures differ from expectations
- WHEN read-only preflight is reviewed
- THEN migration application is blocked until humans reconcile the drift

#### Scenario: Postflight verifies hardened contract

- GIVEN the migration was explicitly approved and applied
- WHEN read-only postflight checks run
- THEN all target RPCs show no `anon` execution, intended role grants, and identity checks

### Requirement: Follow-up Audit Boundary

The system SHOULD surface broader `SECURITY DEFINER`/`p_auth_id` audit candidates as follow-up work. Issue-99 MUST NOT harden unrelated RPCs, including risky signature-drift candidates such as `crear_grupo`, without a separate approved change.

#### Scenario: Broader candidate is found

- GIVEN safety SQL discovers another same-pattern RPC
- WHEN issue-99 scope is evaluated
- THEN the candidate is recorded for follow-up and not changed in this rollout
