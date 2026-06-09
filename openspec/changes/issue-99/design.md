# Design: Issue 99 RPC Auth Identity Hardening

## Technical Approach

Implement PR #100 as a targeted Supabase migration that replaces only four public `SECURITY DEFINER` RPC definitions and their grants: `registrar_asistencia`, `agregar_miembro_a_grupo`, `actualizar_rol_miembro`, and `eliminar_miembro_de_grupo`. The database remains the security boundary: non-service authenticated calls must prove `p_auth_id = auth.uid()`, while `service_role` is reserved for trusted server/admin execution. No production data is modified by this design phase.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Identity binding | Check `auth.uid() IS NOT NULL` and `p_auth_id IS DISTINCT FROM auth.uid()` for non-service calls. | Trust app callers to pass `user.id`; revoke `anon` only. | Direct RPC calls can bypass app code; revoking `anon` does not stop authenticated spoofing. |
| Role grants | Revoke `PUBLIC`/`anon`; grant `authenticated` and `service_role`. | Remove `service_role`; keep `anon` for legacy calls. | Normal users need authenticated access; `service_role` is a trusted bypass for server/admin scripts only. `anon` has no identity to bind. |
| Scope control | Harden four PR #100 RPCs only. | Include all same-pattern RPCs now, including `crear_grupo`. | Broader hardening increases blast radius. `crear_grupo` has signature drift evidence: generated types expose optional `p_campus_id`, while migration history and current app calls use a four-argument signature. |
| Delete behavior | Preserve `DELETE FROM public.grupo_miembros` in remove-member RPC. | Convert to soft-delete. | User clarified membership-link deletion is acceptable; it does not delete users, profiles, or data-bearing domain records. |

## Data Flow

```text
Next.js server route/action ── getUser() ──→ Supabase RPC(p_auth_id=user.id)
                                      │
                                      ▼
SECURITY DEFINER RPC ── role check ──→ if service_role: trusted bypass
        │                             └─ else require auth.uid() = p_auth_id
        ▼
Existing permission RPCs/tables ──→ attendance or group-membership mutation
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260608173000_harden_rpc_auth_identity.sql` | Modify | Replaces four RPC bodies, adds identity checks, sets `search_path`, and tightens grants. |
| `supabase/safety/20260608173000_harden_rpc_auth_identity_preflight.sql` | Create | Read-only preflight/postflight checks and follow-up audit discovery. |
| `.github/workflows/dependency-review.yml` | Modify | Keeps PR #100 CI dependency review passing with read-only permissions and vulnerability/license gates. |
| `openspec/changes/issue-99/design.md` | Create | Records this technical design. |

## Interfaces / Contracts

Target RPC signatures remain unchanged. New contract:

```sql
IF coalesce(v_request_role, '') <> 'service_role'
   AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
  -- reject call
END IF;
```

`service_role` credentials must never be exposed to browser/client code.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static SQL | Four functions contain identity checks and expected grants. | Review migration plus safety SQL. |
| Preflight | Live signatures/grants/definitions before rollout. | Human runs read-only preflight before applying migration. |
| Postflight | `anon=false`, `authenticated=true`, `service_role=true`, `checks_auth_uid=true`. | Human runs read-only postflight after approved migration. |
| Contract | Authenticated spoof rejection and valid same-user success. | Controlled non-production or carefully approved test accounts; current `scripts/test-rpc-asistencia.ts` only proves service-role flow. |

## Migration / Rollout

1. Run safety preflight read-only and save current definitions for rollback.
2. Confirm target signatures match exactly; stop if drift appears.
3. Apply migration only after explicit human approval.
4. Run postflight read-only checks.
5. Open follow-up audit for remaining public `SECURITY DEFINER` + `p_auth_id` RPCs.

Rollback: do not edit production data. Restore prior function definitions and grants through a reviewed rollback migration using the saved preflight definitions.

## Open Questions

- [ ] Follow-up: reconcile `crear_grupo` live/generated signature drift before hardening it.
- [ ] Follow-up: move privileged RPCs out of exposed `public` schema where feasible.
