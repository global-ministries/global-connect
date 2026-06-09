# Supabase Staging Schema-Only Baseline

This runbook prepares the existing empty Supabase staging project `global data staging` with a schema-only baseline. It must not copy production data.

The empty staging project MUST NOT be blindly initialized from the current repository migrations. The migration history in this repository is not a complete bootstrap for a fresh project. Manual apply may only happen after a complete schema-only baseline plan exists and dry-run review confirms the exact operations that would run against staging.

This plan is schema-only. It defines what an operator must export, review, approve, apply to staging, and verify before continuing `support-ticket-system` tasks 1.2 and 1.3. It does not authorize copying production data or applying repository migrations directly to an empty hosted project.

## Safety Boundary

| Item | Value |
|------|-------|
| Staging project | `global data staging` |
| Staging project ref | `ebwtdjtajclzciwipevw` |
| Staging URL | `https://ebwtdjtajclzciwipevw.supabase.co` |
| Production data | Never copied, exported, imported, or queried for this workflow |
| Production SQL | No production DDL/DML/data queries; schema metadata export only after approval |
| Default package behavior | Non-mutating or blocked |

Do not use MCP `apply_migration` for this baseline. Do not run `supabase db reset --project-ref` against hosted staging.

## Baseline Scope

The baseline artifact must be a reviewed SQL file generated from production metadata only. It must reconstruct the current production schema shape in staging without carrying real records, auth users, storage objects, secrets, tokens, or production URLs.

### Generate From Production Schema Only

The operator must export these schema objects from production metadata:

- Extensions required by the application schema, including UUID, crypto, text search, or Supabase-managed extensions that appear in production and are required by public objects.
- Public schema tables, columns, defaults, generated columns, identity sequences, primary keys, unique constraints, check constraints, foreign keys, indexes, comments, and ownership-safe grants.
- Non-public application schemas that are required by repo migrations, such as private helper schemas. For `support-ticket-system`, the new migration creates `support_private`; the baseline must still include any existing private schemas already present in production.
- Views, materialized views, triggers, trigger functions, RPC functions, enum types, domains, composite types, and text search configuration used by application code.
- Row-level security enablement, RLS policies, role grants for `anon`, `authenticated`, and `service_role`, and explicit function grants.
- Storage bucket metadata and storage policies only when needed to recreate schema-level access behavior; do not export or copy storage object rows/files.
- Supabase migration history only if the operator intentionally uses it to mark the baseline boundary. Prefer a separately reviewed baseline migration marker rather than replaying incomplete historical migrations.

### Exclude From Baseline

The artifact must exclude all runtime data and secrets:

- No `INSERT`, `COPY`, or data-bearing `SELECT` output for public application tables such as `usuarios`, `campus`, `grupos`, `grupo_miembros`, `asistencia`, reports, audit logs, or support tables.
- No rows from `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, MFA tables, or other auth/user state.
- No storage object data from `storage.objects` and no binary files from buckets.
- No production API keys, JWT secrets, service role keys, database passwords, OAuth credentials, webhook secrets, Sentry DSNs, R2 credentials, Resend keys, Inngest keys, or other environment values.
- No production URLs or callbacks unless they are non-secret static schema comments that have been intentionally reviewed and replaced for staging.
- No production-only ownership or role statements that would fail or over-privilege staging.
- No data repair/backfill statements from historical migrations unless they are converted into schema-safe defaults, constraints, or functions and explicitly approved.

## Why Repo Migrations Are Not Enough

The repository migration directory contains many deltas that assume base production tables already exist. Examples include early RPC-only migrations that reference `public.usuarios`, `public.grupos`, `public.segmentos`, and `public.grupo_miembros` before this repo defines a complete empty-database bootstrap for those tables.

Some migrations also contain seed/config statements, function bodies with runtime `INSERT`/`DELETE`, and storage policy changes. Those may be valid deltas on an existing database, but they are not a safe empty staging bootstrap by themselves. The baseline must create base tables and dependencies first, then the `support-ticket-system` delta can be applied after review.

## Quick Path

1. Export a production schema-only baseline review artifact in a controlled operator environment with `npm run baseline:staging:generate`.
2. Normalize the review artifact locally with `npm run baseline:staging:normalize` to remove Supabase-managed storage internals and isolate platform ACL/default privilege replay.
3. Review the normalized baseline SQL and isolated platform ACL review file with the checklist below, then obtain manual approval.
4. Apply the approved normalized baseline SQL to staging project ref `ebwtdjtajclzciwipevw` only.
5. Apply the reviewed support migration to staging after the baseline is verified.
6. Generate `lib/supabase/database.types.ts` from staging only.
7. Run RLS tests against staging with mutating tests explicitly enabled only when test fixtures are expected.

## Local Prerequisites

Local tooling is currently blocked because `pnpm`, `corepack`, and the Supabase CLI are unavailable in this environment. When tooling exists, verify commands before running them:

```bash
supabase --version
supabase db push --help
supabase gen types --help
```

## Staging Preflight Requirements

Before applying the normalized baseline, confirm staging has every extension dependency expected by the reviewed schema. The current normalized artifact references `extensions.uuid_generate_v4()`, so staging must already have `uuid-ossp` available in the `extensions` schema, or the operator must create and review a separate extension bootstrap step before baseline apply.

Do not add extension DDL to `tmp/staging-baseline/staging-schema-baseline.normalized.sql` by default. Extension creation is a platform/bootstrap concern and must be reviewed explicitly before any mutating staging operation.

## Non-Mutating Checks

Use these first:

```bash
npm run db:status:staging
```

Do not run repository migration dry-runs during empty-staging bootstrap. `supabase db push --dry-run`, `npm run db:push:staging:dry-run`, and the manual GitHub workflow `Staging Repo Delta Dry Run` are post-baseline-only repo delta review tools.

## Operator Command Sequence

Run these commands only in a controlled operator workstation or isolated CI job with explicit staging credentials. Replace placeholder values locally; never commit secrets or generated SQL that contains sensitive data. Environment variables can be visible to same-user processes, process inspection tools, shell history integrations, crash reporters, or system administration tooling; use a short-lived, isolated operator environment and clear the variables after use.

### 1. Prepare Local Artifacts

These commands are local file operations and should not mutate Supabase:

```bash
mkdir -p tmp/staging-baseline
export STAGING_PROJECT_REF=ebwtdjtajclzciwipevw
export STAGING_SUPABASE_URL=https://ebwtdjtajclzciwipevw.supabase.co
```

The repository includes a non-mutating generator for the baseline review artifact. It requires an explicit production source URL and refuses the known staging project ref, localhost, and placeholder/test-looking sources:

```bash
export PRODUCTION_DATABASE_URL='postgresql://<operator>:<password>@<production-db-host>:5432/postgres'

# Optional. Defaults to public,storage. Add required private application schemas only after review.
export BASELINE_SCHEMAS=public,storage,<required_private_schema>

npm run baseline:staging:generate
```

The generator writes `tmp/staging-baseline/staging-schema-baseline.review.sql` by default. It uses `pg_dump` with schema-only flags, includes privilege/grant statements for review, passes the database URL to the child process environment instead of the argument list, does not copy data, and does not apply anything to staging. If `pg_dump` is not available on `PATH`, it exits with install guidance.

### 2. Export Production Schema Metadata Only

MANUAL APPROVAL REQUIRED before connecting to production metadata.

This step is metadata-only. It must not run production DDL, production DML, or production data queries. The operator may export schema metadata after approval, but must not inspect or extract table rows, auth state, storage objects, or secrets.

Use the repository helper when possible:

```bash
npm run baseline:staging:generate
```

The helper runs the equivalent of a schema-only `pg_dump` command with an argument array, not a shell string. If an operator must run `pg_dump` manually, use a schema-only dump command appropriate for the operator's Supabase access model. The exact command depends on credentials and PostgreSQL client version, but the output must be schema-only and must not include data:

```bash
# Example shape only. Verify flags with the installed CLI/pg_dump version first.
PGDATABASE="$PRODUCTION_DATABASE_URL" pg_dump \
  --schema-only \
  --no-owner \
  --no-comments \
  --schema=public \
  --schema=storage \
  --schema=<required_private_schema> \
  --file tmp/staging-baseline/production-schema-only.sql
```

If the operator uses Supabase CLI instead of `pg_dump`, first run static help commands and confirm the selected command produces schema-only SQL without applying changes:

```bash
supabase --version
supabase db --help
supabase db dump --help
```

Do not use a data dump. Do not use `supabase db pull` as a blind substitute unless the generated migration is inspected as schema-only and all excluded data/secrets are absent.

### 3. Normalize For Staging

If the repository helper was used, it already creates the review copy:

```bash
tmp/staging-baseline/staging-schema-baseline.review.sql
```

If the operator used a manual export, create a reviewed staging baseline SQL file from the export:

```bash
cp tmp/staging-baseline/production-schema-only.sql tmp/staging-baseline/staging-schema-baseline.review.sql
```

Run the deterministic normalizer against the review copy:

```bash
npm run baseline:staging:normalize
```

The normalizer writes `tmp/staging-baseline/staging-schema-baseline.normalized.sql` and isolates removed platform ACL/default privilege statements in `tmp/staging-baseline/staging-schema-baseline.platform-acls.review.sql`. It removes `CREATE SCHEMA public;`, excludes Supabase-managed `storage` internals, and does not rewrite SQL inside function bodies.

Review only the normalized copy for apply. Remove or adjust any remaining production-specific ownership, comments, extensions, URLs, grants, or unsupported managed statements that should not be applied to staging. Keep base tables before dependent views, functions, policies, triggers, grants, and support deltas.

### 4. Static Review Before Apply

These local scans are non-mutating and should be run before human review:

```bash
rg -n "^(INSERT|COPY)\s+" tmp/staging-baseline/staging-schema-baseline.normalized.sql
rg -n "auth\.(identities|sessions|refresh_tokens|mfa_)" tmp/staging-baseline/staging-schema-baseline.normalized.sql
rg -n "CREATE SCHEMA storage|CREATE TABLE storage\.|storage\.objects|https://|SUPABASE|SERVICE_ROLE|JWT|SECRET|TOKEN|PASSWORD|DATABASE_URL" tmp/staging-baseline/staging-schema-baseline.normalized.sql
rg -n "^\\" tmp/staging-baseline/staging-schema-baseline.normalized.sql
rg -n "^\s*(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)\b" tmp/staging-baseline/staging-schema-baseline.normalized.sql
rg -n "CREATE TABLE|CREATE POLICY|ALTER TABLE .*ENABLE ROW LEVEL SECURITY|GRANT " tmp/staging-baseline/staging-schema-baseline.normalized.sql
```

Any positive finding in the first five scans must be reviewed and removed unless the reviewer explicitly documents why it is schema-only and safe. Top-level ACL statements belong in `tmp/staging-baseline/staging-schema-baseline.platform-acls.review.sql`, not the normalized baseline. `auth.uid()`, `auth.role()`, and foreign keys to `auth.users` may remain when they are part of the public application schema; auth internals and auth row data must not be included.

### 5. Apply Baseline To Staging

MANUAL APPROVAL REQUIRED. This is mutating and must target only `ebwtdjtajclzciwipevw`.

```bash
test "$STAGING_PROJECT_REF" = "ebwtdjtajclzciwipevw"
psql "$STAGING_DATABASE_URL" \
  --set ON_ERROR_STOP=1 \
  --file tmp/staging-baseline/staging-schema-baseline.normalized.sql
```

Do not use production database URLs for this step. Do not apply with MCP `apply_migration`. Do not run package scripts that are intentionally blocked.

### 6. Apply Support Migration To Staging

MANUAL APPROVAL REQUIRED. Run only after the baseline verification passes.

```bash
test "$STAGING_PROJECT_REF" = "ebwtdjtajclzciwipevw"
psql "$STAGING_DATABASE_URL" \
  --set ON_ERROR_STOP=1 \
  --file supabase/migrations/20260609130000_support_ticket_system.sql
```

Alternatively, an operator may use a reviewed Supabase CLI migration flow if it targets only staging and the pending operations are inspected with `supabase db push --dry-run` first.

### 7. Generate Types From Staging

MANUAL APPROVAL REQUIRED only because this reads hosted staging and writes a repo file. It must not target production:

```bash
npm run gen:types:staging
```

## Baseline SQL Review Checklist

Before any staging apply, reviewers must confirm every item:

- [ ] The SQL file was generated from production schema metadata only, not production data.
- [ ] No public application table data `INSERT` or `COPY` statements exist.
- [ ] No auth user, identity, session, refresh token, or MFA rows are present.
- [ ] No secrets, tokens, database passwords, service role keys, JWT secrets, webhook keys, R2 keys, Resend keys, Inngest keys, or Sentry credentials are present.
- [ ] No storage object rows or files are included.
- [ ] No production URLs, callback URLs, project refs, bucket object URLs, or hard-coded production tokens remain.
- [ ] Required schemas, extensions, enums, domains, functions, views, triggers, and indexes are present.
- [ ] Expected public tables are created before dependent views, functions, foreign keys, RLS policies, triggers, grants, and support-ticket deltas.
- [ ] RLS is enabled on every table exposed through Supabase Data API schemas, especially `public`.
- [ ] Policies for `anon`, `authenticated`, and `service_role` match production intent without over-granting staging.
- [ ] Grants are explicit and least-privilege; no broad `GRANT ALL` to `anon` or `authenticated` is introduced.
- [ ] Security-definer functions have controlled `search_path` values and are not placed in exposed schemas unless already required and reviewed.
- [ ] Storage bucket metadata and policies are schema-only; `storage.objects` data is absent.
- [ ] The support migration `20260609130000_support_ticket_system.sql` is not applied before baseline tables such as `public.usuarios`, `public.usuario_roles`, `public.roles_sistema`, and `public.campus` exist.

## Baseline Apply Step

Only after a complete schema-only baseline plan exists, the normalized SQL artifact is reviewed, and manual approval is recorded, an explicitly approved operator may apply the reviewed normalized schema-only SQL artifact to staging only.

```bash
test "$STAGING_PROJECT_REF" = "ebwtdjtajclzciwipevw"
psql "$STAGING_DATABASE_URL" \
  --set ON_ERROR_STOP=1 \
  --file tmp/staging-baseline/staging-schema-baseline.normalized.sql
```

This is the first mutating step. It must be run only against `ebwtdjtajclzciwipevw`, never against production. Keep the command manual; do not add an automatic GitHub workflow that applies the baseline on push.

Do not use `supabase db push` as the baseline apply path for an empty hosted staging database. Repository migrations are not a complete empty-staging bootstrap.

## Post-Baseline Repo Delta Review

After the baseline has been applied and verified, an operator may review repository migration deltas separately. This is not for empty-staging bootstrap.

```bash
npm run db:push:staging:dry-run

# Equivalent manual commands when not using the package script:
supabase link --project-ref ebwtdjtajclzciwipevw
supabase db push --dry-run
```

The dry-run must target only `ebwtdjtajclzciwipevw`. If any output references another project ref, stop.

The manual GitHub workflow `Staging Repo Delta Dry Run` performs the same post-baseline dry-run against staging and is safe to trigger only after the baseline exists because it does not apply migrations.

Use `supabase db push` only for reviewed repository migration deltas after the baseline boundary is clear, the dry-run output is inspected, and the operator has explicit approval for the staging-only delta apply.

## Staging Verification

After the baseline apply and before applying the support migration, verify staging only:

```bash
test "$STAGING_PROJECT_REF" = "ebwtdjtajclzciwipevw"
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select current_database();"
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select schemaname, tablename from pg_tables where schemaname = 'public' order by tablename;"
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;"
```

Expected result:

- Public base tables required by existing app types exist, including `usuarios`, `roles_sistema`, `usuario_roles`, `campus`, `grupos`, `grupo_miembros`, and related group/location/asistencia tables.
- Application functions and views compile without missing relation errors.
- RLS is enabled where production requires it and on exposed `public` tables.
- No production rows were copied. Counts for user/content tables should be zero unless a reviewed schema-only seed is explicitly required and contains no real data.
- Storage policies exist only as schema rules. Storage objects are empty.

After the support migration apply, verify staging support objects:

```bash
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select to_regclass('public.support_tickets') as support_tickets;"
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'support_%' order by tablename;"
psql "$STAGING_DATABASE_URL" --set ON_ERROR_STOP=1 --command "select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'support_private' order by p.proname;"
```

Expected support result:

- `public.support_user_capabilities`, `public.support_tickets`, `public.support_ticket_messages`, `public.support_ticket_attachments`, and `public.support_ticket_events` exist.
- RLS is enabled on all support tables.
- `support_private.current_usuario_id`, `support_private.has_capability`, `support_private.set_updated_at`, and `support_private.prevent_event_mutation` exist.
- Support event mutation prevention trigger exists and support event direct mutation remains blocked.

## Rollback And Recovery For Staging Only

If baseline apply fails, stop immediately. Do not attempt to repair production and do not copy production data.

Recovery options for staging, in order of preference:

1. If the failure happened before any object was created because `ON_ERROR_STOP` halted early, fix the reviewed baseline SQL locally and restart the staging apply.
2. If partial objects were created in staging, prefer deleting and recreating the empty staging project or using a Supabase branch/reset mechanism that targets only `ebwtdjtajclzciwipevw`, after explicit manual approval.
3. If the staging project must be preserved, prepare a staging-only rollback script that drops only objects created by the failed baseline in reverse dependency order. Review it with the same safety boundary before running it.
4. After recovery, rerun the baseline from the corrected schema-only artifact and repeat verification from scratch.

Never run `supabase db reset --project-ref` from package scripts. Never point rollback commands at production. Never import production data as a recovery shortcut.

## Support Ticket System Unblock Path

Minimum path for `support-ticket-system` tasks 1.2 and 1.3:

1. Apply the reviewed production schema-only baseline to staging.
2. Verify base staging schema objects and RLS without copied production data.
3. Apply `supabase/migrations/20260609130000_support_ticket_system.sql` to staging.
4. Verify support tables, private helper functions, RLS policies, grants, and triggers in staging.
5. Generate types from staging:

```bash
npm run gen:types:staging
```

6. Commit the resulting `lib/supabase/database.types.ts` change with the support capability code.
7. Run RLS tests against staging:

```bash
RLS_ENV=staging \
ALLOW_MUTATING_RLS_TESTS=true \
NEXT_PUBLIC_SUPABASE_URL=https://ebwtdjtajclzciwipevw.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key> \
SUPABASE_SERVICE_ROLE_KEY=<staging service role key> \
npm run test:rls
```

8. Mark OpenSpec task 1.2 complete only after `database.types.ts` is regenerated from staging and committed with the support capability module.
9. Mark OpenSpec task 1.3 complete only after RLS tests pass against staging.

Do not mark OpenSpec task 1.2 complete during baseline planning alone. Do not mark task 1.3 complete until RLS tests pass against staging.

## Data API and Security Checks

New Supabase projects may not expose new tables to the Data API automatically. After the support migration is applied to staging, verify Data API exposure for the support tables in the Supabase dashboard and keep RLS enabled on every exposed table.

If GraphQL is required later, verify the current `pg_graphql` state explicitly. Do not assume GraphQL is enabled or introspectable by default.

## Blocked Commands

These package scripts are intentionally blocked because they were ambiguous or destructive by default:

```bash
npm run gen:types
npm run db:push:staging
npm run db:reset:staging
npm run migrate:staging
```

`scripts/apply-migrations-staging.mjs` is also blocked because the previous implementation attempted to execute arbitrary SQL through `rpc("exec")` with a service role key.
