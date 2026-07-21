# Operating Core Golden Path

## Staging-only migrations (MUST)

All `supabase/migrations/2026*_operating_core_*.sql` files are **staging-only**
future-apply bundles. They are NOT applied to any database in the program.

## Production rollout checklist (BEFORE applying to production)

- [ ] All migrations applied to `supabase_global_staging` for ≥7 GREEN days
- [ ] No DROP TABLE / DELETE FROM on `operating_core_participation_eventos` in any migration
- [ ] No multi-tenant columns (campus_id) introduced
- [ ] Capability keys added in `lib/platform/experiences.ts` are additive
- [ ] All OC slice PRs merged: S01-S23
- [ ] S22 byte-identity test for `buscar_usuarios_para_grupo` passes
- [ ] `pnpm test:ci` (full suite) green
- [ ] `pnpm build` passes
- [ ] `pnpm exec tsc --noEmit` clean

## Per-subphase flags

The following env vars control per-subphase rollout:

| Env var | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_OPERATING_CORE_ENABLED` | `off` | Master switch |
| `NEXT_PUBLIC_OPERATING_CORE_STAGE` | `off` | Rollout stage (off, admin-only, internal, public) |
| `NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH` | `off` | Kill switch (revert all) |
| `NEXT_PUBLIC_OPERATING_CORE_EVENTS` | `off` | Events subphase |
| `NEXT_PUBLIC_OPERATING_CORE_SERVICES` | `off` | Services subphase |
| `NEXT_PUBLIC_OPERATING_CORE_CAPACITY` | `off` | Capacity subphase |
| `NEXT_PUBLIC_OPERATING_CORE_FORMS` | `off` | Forms subphase |
| `NEXT_PUBLIC_OPERATING_CORE_RESOURCES` | `off` | Resources subphase |
| `NEXT_PUBLIC_OPERATING_CORE_PUBLIC_TOKENS` | `off` | Public tokens subphase |
| `NEXT_PUBLIC_OPERATING_CORE_NOTIFICATIONS` | `off` | Notifications subphase |
| `NEXT_PUBLIC_OPERATING_CORE_CAPTURE_UX` | `off` | Capture UX subphase |
| `NEXT_PUBLIC_OPERATING_CORE_DASHBOARDS` | `off` | Dashboards subphase |
| `NEXT_PUBLIC_OPERATING_CORE_RECURRENT` | `off` | Recurrent events subphase |

## Nightly CI grep

A nightly CI workflow (`.github/workflows/oc-nightly-migration-grep.yml`)
runs each day at 2 AM to reject any migration containing:

- `DROP TABLE operating_core_participation_eventos`
- `DELETE FROM operating_core_participation_eventos`

This protects the participation ledger from accidental data loss.

## Rollout stages

| Stage | Description |
|---|---|
| `off` | OC disabled globally |
| `admin-only` | Only users with `operating_core.admin` capability |
| `internal` | Internal users only |
| `public` | Full public access |

## Kill switch

If `NEXT_PUBLIC_OPERATING_CORE_KILL_SWITCH=on`, all OC routes return 404
regardless of other flag settings. This provides an instant revert path.
