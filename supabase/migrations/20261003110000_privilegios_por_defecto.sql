-- Dead executables and default privileges (security phase 3, batch 1).
--
-- PART 1. Four definer functions that any signed-in person could execute
-- although no signed-in caller needs them (inventory on staging, 2026-10-02):
--   eliminar_relacion_familiar(uuid)             deletes a family link and its
--       inverse by id without checking who asks; the app calls
--       eliminar_relacion_familiar_segura instead.
--   taller_emit_overdue_event(uuid, date)        inserts an overdue event for
--       any taller id; 20260811140000 granted it to service_role only, staging
--       drifted.
--   cohort_belongs_to_talleres_experience(uuid)  dead code: no caller in the
--       database (functions, policies, views) or in the app.
--   expirar_solicitudes_vencidas()               expires every overdue group
--       request of the whole database. The app called it with the session
--       client; lib/actions/solicitudes-grupo.actions.ts now calls it with the
--       service client, which keeps that global behaviour.
-- EXECUTE is revoked from PUBLIC, anon and authenticated and restated for
-- service_role. The owner (postgres) and supabase_admin keep theirs and no
-- function body changes. No other function, policy, view or trigger calls any of
-- the four, so nothing else changes. The statements are not guarded on purpose:
-- if a database lacks one of the functions, the whole file fails and nothing is
-- applied.
--
-- PART 2. Default privileges: what a NEW object gets when postgres creates it.
-- Postgres computes the ACL of a function, table or sequence that role R
-- creates in schema S as
--     the global default of R (its pg_default_acl row with no schema or, when
--     there is none, the built-in default: EXECUTE to PUBLIC on functions,
--     nothing on tables and sequences)
--   + the per-schema row of R for S, if there is one.
-- A per-schema row can only add: REVOKE ... IN SCHEMA takes back what an earlier
-- GRANT ... IN SCHEMA added, never the global default.
-- Found on staging for R = postgres and S = public: functions
-- {postgres,anon,authenticated,service_role}=X, tables anon=arwdDxtm, sequences
-- anon=rwU, and no global row, so the built-in EXECUTE to PUBLIC applied too.
-- Every new function was born executable by anon (through PUBLIC and through
-- its own entry), and every new table, view and sequence gave anon every
-- privilege (row level security still decides the rows).
-- This file:
--   * removes anon from the per-schema rows of postgres in public for functions,
--     tables and sequences (IN SCHEMA form: that is where anon comes from);
--   * revokes EXECUTE from PUBLIC in the GLOBAL default of postgres. The global
--     form is required: the built-in EXECUTE to PUBLIC is a global default and
--     cannot be cancelled per schema.
-- Resulting rule for what postgres creates in public from now on: functions are
-- executable by postgres, authenticated and service_role; tables, views and
-- sequences give their privileges to postgres, authenticated and service_role;
-- anon and PUBLIC get nothing. A future function or table that must work without
-- a session needs an explicit grant to anon in its migration, the way
-- configuracion_plataforma has one.
--
-- Side effect of the global form (on purpose): a function that postgres creates
-- later in a schema where postgres has no per-schema row (every schema except
-- public and storage: extensions, pg_temp, a future private schema...) is
-- executable only by postgres until somebody grants it. That covers
--   * extension functions that postgres installs, or that an extension update
--     run by postgres adds. On staging pgcrypto, uuid-ossp and
--     pg_stat_statements belong to postgres; pg_trgm (similarity and the rest,
--     installed in public), btree_gist and supabase_vault belong to
--     supabase_admin, whose defaults this file does not touch, so they are not
--     affected;
--   * the pg_temp helpers of the SQL suites in supabase/tests: a suite that calls
--     one of its own pg_temp functions after SET LOCAL ROLE anon or
--     authenticated must grant them first, for example with
--     GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
--     right after it defines them.
-- Existing objects keep their privileges: default privileges only apply to
-- objects created later, and CREATE OR REPLACE of an existing function keeps
-- its ACL.
--
-- Not changed: the default rows of supabase_admin (public, graphql,
-- graphql_public, extensions...) still give anon privileges on every object that
-- supabase_admin creates; postgres is not a member of supabase_admin and cannot
-- alter its default privileges. The rows of postgres for the storage schema are
-- left as they are (the app creates nothing there).
--
-- The migration linter (supabase/tests/lint-migrations.mjs) now fails any
-- migration from 20261003 on that creates or replaces a definer function without
-- a REVOKE ... FROM PUBLIC for it in the same file: what the defaults give
-- depends on who creates the function and where, and CREATE OR REPLACE keeps
-- whatever ACL the function already had.
--
-- The block at the end checks the result and raises, so nothing is applied, when
-- one of the four is still executable by PUBLIC, anon or authenticated, when
-- service_role lost it, or when a default of postgres for public, or its global
-- default for functions, still gives anon or PUBLIC anything.
--
-- Rollback: run each REVOKE ... FROM below as GRANT ... TO (for the four
-- functions, to authenticated) and each ALTER DEFAULT PRIVILEGES ... REVOKE ...
-- FROM as ALTER DEFAULT PRIVILEGES ... GRANT ... TO (anon or PUBLIC).

REVOKE EXECUTE ON FUNCTION public.eliminar_relacion_familiar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.taller_emit_overdue_event(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_solicitudes_vencidas() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.eliminar_relacion_familiar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.taller_emit_overdue_event(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.cohort_belongs_to_talleres_experience(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_solicitudes_vencidas() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DO $privilegios_por_defecto_check$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.eliminar_relacion_familiar(uuid)',
    'public.taller_emit_overdue_event(uuid, date)',
    'public.cohort_belongs_to_talleres_experience(uuid)',
    'public.expirar_solicitudes_vencidas()'
  ]::regprocedure[] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                   WHERE p.oid = v_fn AND a.grantee = 0::oid) THEN
      v_problems := v_problems || format('%s is still executable by PUBLIC, anon or authenticated', v_fn);
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_problems := v_problems || format('%s is not executable by service_role', v_fn);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE d.defaclrole = 'postgres'::regrole::oid
       AND (   (d.defaclnamespace = 'public'::regnamespace::oid AND d.defaclobjtype IN ('f', 'r', 'S'))
            OR (d.defaclnamespace = 0::oid AND d.defaclobjtype = 'f'))
       AND a.grantee IN (0::oid, 'anon'::regrole::oid)
  ) THEN
    v_problems := v_problems || 'a default privilege of postgres still gives anon or PUBLIC something'::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
     WHERE d.defaclrole = 'postgres'::regrole::oid AND d.defaclnamespace = 0::oid AND d.defaclobjtype = 'f'
  ) THEN
    v_problems := v_problems || 'postgres has no global default for functions, so the built-in EXECUTE to PUBLIC still applies'::text;
  END IF;

  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'privilegios_por_defecto: %', array_to_string(v_problems, '; ');
  END IF;
END
$privilegios_por_defecto_check$;
