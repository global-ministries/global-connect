# Casas Anfitrionas Map Operations Runbook

This runbook covers the PR8 production safety gate for the Casas Anfitrionas map rollout. No live production SQL, migration, deploy, or Supabase advisor command is executed by this PR.

## Quick Path

1. Review the PR8 diff and confirm migrations are additive.
2. Run the pre-apply dry-run inventory in staging using `supabase/tests/casas_map_production_safety.sql` with post-backfill assertions explicitly off.
3. Complete a staging smoke of queue → assign existing approved Casa → approve/reject review → map load.
4. Attach explicit approval before any production data apply, including a concrete release ticket or change id.
5. Re-run `supabase/tests/casas_map_production_safety.sql` with `casas_map.run_post_backfill_assertions = on` for post-backfill verification, then attach Supabase Security Advisor plus Supabase Performance Advisor evidence.
6. Monitor the first production window and be ready to revoke grants or ship an additive fix-forward if thresholds fail.

## PR8 Production Safety Gate

| Gate | Required evidence | Failure behavior |
|------|-------------------|------------------|
| dry-run inventory | `casas_map_backfill_approved_location_audit(..., p_dry_run => true)` output and rollout counts. | Do not apply; investigate unexpected eligible or missing counts. |
| staging smoke | Non-production proof that existing approved Casas remain map-ready and pending-only Casas stay hidden. | Keep production untouched and fix forward additively. |
| explicit approval | Maintainer/operator approval naming the reviewed migration, dry-run output, apply window, and approval reference. | Block production apply; non-dry-run helper calls require `p_approval_reference`. |
| post-backfill verification | Zero duplicate backfill events and zero approved active Casas with `direccion_id` missing an audit snapshot after the approved manual apply. | The safety SQL raises and fails; pause rollout and ship an additive correction before retrying. |
| Supabase Security Advisor | Screenshot/export or written evidence for new findings after migration. | Do not claim production readiness until severe findings are handled or accepted. |
| Supabase Performance Advisor | Screenshot/export or written evidence for new findings after migration. | Add indexes or document accepted findings before rollout. |

## Backfill Boundary

The PR8 helper is intentionally narrow:

- It only records `approved_location_backfill` audit snapshots for existing approved, active Casas with an approved `direccion_id`.
- It never creates Casas, links groups, invents historical host homes, copies manual group addresses, or approves pending rows.
- It defaults to dry-run and is granted only to `service_role`.
- Non-dry-run requires `p_approval_reference` with a real release ticket or change id; placeholder values fail.
- A valid admin/pastor actor auth id is required so the audit event has an accountable actor.

## Commands And Evidence

Local/static checks for reviewers:

```bash
pnpm test -- --runTestsByPath "__tests__/supabase/casas-map-location-review-migration.test.ts" --runInBand
pnpm lint:migrations
```

Non-production pre-apply SQL evidence has two supported execution paths. Use `\i` only in `psql`; the Supabase SQL Editor does not support it. Keep the JWT claim setup and the safety SQL in the same explicit transaction because `set_config(..., true)` is transaction-local.

### Local/staging CLI path (`psql`)

```sql
\i supabase/tests/casas_map_inventory.sql
\i supabase/tests/casas_map_rpc_contracts.sql

BEGIN;

-- Configure a staging service-role context and an approved admin/pastor auth id.
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true);
SELECT set_config('casas_map.run_post_backfill_assertions', 'off', false);

\i supabase/tests/casas_map_production_safety.sql

COMMIT;
```

### Supabase SQL Editor path

Use this order; do not use `\i` in the SQL Editor:

1. Paste and run `supabase/tests/casas_map_inventory.sql` as its own read-only script.
2. Paste and run `supabase/tests/casas_map_rpc_contracts.sql` as its own non-production staging script; it manages its own `BEGIN`/`ROLLBACK` fixture transaction.
3. Paste and run this safety setup plus `supabase/tests/casas_map_production_safety.sql` in one transaction:

```sql
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true);
SELECT set_config('casas_map.run_post_backfill_assertions', 'off', false);

-- Paste the contents of supabase/tests/casas_map_production_safety.sql here.

COMMIT;
```

The production-safety step is safe end-to-end: it runs only dry-run/read-only checks because post-backfill assertions default off. The RPC contract script is for non-production/staging only and rolls back its fixture transaction.

Approved manual apply shape, outside this PR and only after the gates above pass:

```sql
SELECT public.casas_map_backfill_approved_location_audit(
  '<approved-admin-auth-id>'::uuid,
  p_dry_run => false,
  p_approval_reference => '<release-ticket-or-change-id>'
);
```

Post-apply verification, only after the approved manual apply returns successfully. Keep setup and safety execution inside one transaction for the transaction-local JWT claim setup.

CLI path (`psql`):

```sql
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true);
SELECT set_config('casas_map.run_post_backfill_assertions', 'on', false);

\i supabase/tests/casas_map_production_safety.sql

SELECT set_config('casas_map.run_post_backfill_assertions', 'off', false);

COMMIT;
```

Supabase SQL Editor path:

```sql
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true);
SELECT set_config('casas_map.run_post_backfill_assertions', 'on', false);

-- Paste the contents of supabase/tests/casas_map_production_safety.sql here.

SELECT set_config('casas_map.run_post_backfill_assertions', 'off', false);

COMMIT;
```

Supabase advisor evidence must come from the target project dashboard or approved automation. Attach both Security Advisor and Performance Advisor results to the release record; do not paste secrets or raw member/location data.

## Post-Release Monitoring

Owner: the release operator is primary for the first 2 hours after release; the application on-call/admin is secondary for the next 24 hours.

Monitor for the first 2 hours after release, then review again at 24 hours:

| Signal | Threshold | Check | If threshold fails |
|--------|-----------|-------|--------------------|
| Sentry / release health | More than 5 new unhandled Casas map/assignment/review errors in 15 minutes, or a session crash rate above 1%. | Filter by affected routes: `/grupos-vida/mapa`, `/grupos-vida/casas-anfitrionas/asignar`, `/grupos-vida/casas-anfitrionas/revision`. | Revoke affected RPC grants, preserve data, open an incident note with Sentry issue links, and ship an additive fix-forward. |
| Vercel route latency / Speed Insights | p95 above 2s for map or Casas queue routes for 15 minutes. | Vercel Analytics/Speed Insights route views. | Hide/revoke the affected path, capture slow query context, and add indexes or query fixes additively. |
| Supabase API/Postgres errors | RPC errors or PostgREST 5xx above 1% for 10 minutes. | Supabase API/Postgres logs filtered by the RPC names below. | Revoke execute grants for the failing RPC, keep audit data, and verify with the read-only safety checks before re-enabling. |
| Product smoke | Admin/pastor cannot load the map, pending queue, or review flow after release. | Manual smoke using an approved non-production-safe checklist account. | Stop rollout, revoke affected grants, and restore only after focused smoke passes. |

## Rollback / Fix-Forward

No feature flag currently exists for this slice. Prefer the least destructive recovery path: revoke execution for the affected RPCs or ship an additive fix-forward. Do not drop review/audit tables, delete audit events, or mutate real Casas without a separate reviewed recovery plan.

### Recovery Path A: Disable read-only map/queue exposure

Owner: release operator with DBA/Supabase admin approval.

```sql
-- Production emergency change window only. Replace with the approved project workflow.
REVOKE EXECUTE ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.obtener_casas_revision_pendiente(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.obtener_casas_revision_pendiente(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.obtener_mapa_miembros(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.obtener_mapa_miembros(uuid, text) FROM service_role;
```

Verification:

- Authenticated users and server-action service-role callers no longer receive Casas map/queue/member payloads.
- Existing `casa_anfitriona_location_reviews` and `casa_anfitriona_audit_events` rows remain intact.
- Sentry/Supabase errors stop breaching the thresholds above.

Re-enable only after the fix-forward is deployed and smoke passes:

```sql
GRANT EXECUTE ON FUNCTION public.obtener_mapa_grupos_vida_host_homes(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_sin_casa_anfitriona(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_casas_revision_pendiente(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_mapa_miembros(uuid, text) TO authenticated, service_role;
```

### Recovery Path B: Disable service-role mutations/backfill

Owner: release operator with application maintainer approval.

```sql
-- Use when assignment, review, or backfill behavior is suspected unsafe.
REVOKE EXECUTE ON FUNCTION public.asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.procesar_revision_ubicacion_casa(uuid, uuid, text, text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM service_role;
```

Verification:

- Assignment/review/backfill attempts fail closed.
- No new `group_assigned`, `location_review_*`, or `approved_location_backfill` audit events are written after revocation except through a separately approved recovery plan.
- Post-backfill safety SQL still reports/raises on duplicate or missing snapshots.

### Fix-forward checklist

- [ ] Incident note names the owner, start time, affected route/RPC, Sentry/Supabase evidence, and selected recovery path.
- [ ] Additive migration or app patch is reviewed; no destructive data change is bundled.
- [ ] Local Jest/static SQL checks pass.
- [ ] Staging smoke passes with the same JWT claim setup shown above.
- [ ] Grants are restored only for the fixed RPCs.
- [ ] First 2-hour monitoring window is restarted after re-enable.
