# Proposal: Issue 99 RPC Auth Identity Hardening

## Intent

Close the immediate spoofing risk in four user-facing Supabase `SECURITY DEFINER` RPCs from issue #99 / PR #100, and establish a professional audit foundation for related privileged RPCs. Authenticated callers must not be able to authorize work by supplying another user's `p_auth_id`.

## Scope

### In Scope
- Harden `registrar_asistencia`, `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`.
- Preserve current behavior while binding non-service callers to `auth.uid()` and tightening EXECUTE grants.
- Provide read-only safety preflight/postflight SQL for human-approved migration rollout.

### Out of Scope
- Applying migrations or mutating production data in this SDD phase.
- Broad hardening of all same-pattern RPCs; audit candidates, including `crear_grupo` if signature drift is risky, are follow-up work.
- Deleting users, profiles, groups, or data-bearing production records.

## Capabilities

### New Capabilities
- `rpc-auth-identity-hardening`: Supabase RPC contract requiring caller identity binding, safe grants, service-role-only bypass, and rollout verification for privileged user mutation/attendance RPCs.

### Modified Capabilities
- None; no existing OpenSpec specs are present.

## Approach

Use the targeted PR #100 migration: redefine the four exact RPC signatures, keep `SECURITY DEFINER`, set `search_path = public`, revoke `PUBLIC`/`anon`, grant `authenticated` and `service_role`, and reject non-service calls when `auth.uid()` is null or differs from `p_auth_id`. Preserve `eliminar_miembro_de_grupo` membership-link delete because it removes a relationship row, not a user/profile/domain record.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` | Modified | Target RPC definitions and grants. |
| `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` | New | Read-only rollout checks and broader audit discovery. |
| `.github/workflows/dependency-review.yml` | Modified | CI dependency review configuration for PR #100. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Live function signature drift | Med | Run safety preflight before human-approved migration. |
| `service_role` bypass misuse | Med | Keep credentials server-only; never expose to clients. |
| Broader RPC surface remains | Med | Track follow-up audit/change instead of unsafe PR expansion. |

## Rollback Plan

If rollout fails, stop before mutation, do not edit production data, and revert PR #100/migration definitions through a human-approved rollback migration based on the previous verified function definitions.

## Dependencies

- Explicit human approval before migration application.
- Read-only preflight before rollout and postflight verification after rollout.
- PR #100 checks must remain passing.

## Success Criteria

- [ ] Non-service callers cannot spoof `p_auth_id`; mismatches with `auth.uid()` are rejected.
- [ ] `anon`/`PUBLIC` cannot execute the four target RPCs.
- [ ] `service_role` remains available only for trusted server/admin scripts.
- [ ] No production data is deleted, edited, or contaminated beyond intended membership-link removal behavior.
