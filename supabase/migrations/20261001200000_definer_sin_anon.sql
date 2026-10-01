-- noqa: grant-to-anon-on-definer
-- Definer functions without anonymous access (permissions only).
--
-- PROBLEM
-- Every definer function (prosecdef) of the public schema runs with the rights
-- of its owner, yet 93 of the 183 on staging (83 in production) can be executed
-- by anon, the role of a visitor with no session, and many of them trust an
-- identifier they receive as an argument. Two causes:
--   * the default privileges of the schema give EXECUTE to anon on every new
--     function, and
--   * many older migrations only ran REVOKE ... FROM PUBLIC, which does not
--     remove the explicit grant of anon.
-- The application never calls any of them without a session.
--
-- WHAT CHANGES
-- For every normal function (prokind = 'f', trigger functions included;
-- aggregates, procedures and window functions are not touched) of public with
-- prosecdef, except the allowlist at the top of the block:
--   1. note whether authenticated and service_role can execute it;
--   2. REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;
--   3. GRANT EXECUTE again to authenticated, and to service_role, only when
--      each of them could execute it before (a function that authenticated
--      reached only through PUBLIC keeps working).
-- Nobody gains or loses anything but anon and PUBLIC. No function definition,
-- attribute or owner changes and no row is touched. The whole catalog is walked
-- (not a list of signatures) because the databases hold different sets, and
-- every target is revoked, not only the ones anon can execute today, so the end
-- state is uniform. Running it twice changes nothing the second time.
-- The block ends with a check and raises (so the migration fails and nothing
-- is applied) when a target is still executable by anon or when authenticated
-- or service_role lost an execute it had.
--
-- BLAST RADIUS
-- A caller with no session now gets 42501 (permission denied for function) from
-- these functions and from every RLS policy that calls one of them on a table
-- anon can read: such a query used to return rows or an empty result and now
-- fails. On staging 16 of the 65 relations anon can select change from a result
-- to 42501: audit_grupo_miembros, casas_anfitrionas (5 rows were readable),
-- configuracion_grupos_vida, dg_directores_etapa, director_general_segmentos,
-- disponibilidad_liderazgo, grupo_miembros, historial_movimientos_grupo,
-- segmento_lideres (16 rows were readable), solicitudes_grupo,
-- taller_catalogo_etiquetas, taller_eventos, taller_grupo_asignaciones,
-- taller_reporte_correcciones, taller_solicitudes_retiro and usuarios. The
-- reads the application makes without a session call no definer function and do
-- not change: configuracion_plataforma (home page) and taller_certificados by
-- codigo_verificacion (public certificate check). Logged-in callers are not
-- affected. supabase/tests/definer-sin-anon.test.sql pins all of this.
--
-- ROLLBACK
-- Before applying in production the operator saves the previous grants, in a
-- batch of its own (never together with this migration):
--   create table public.definer_anon_respaldo_20261001 as
--     select p.oid::regprocedure::text as signature,
--            exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as had_public,
--            exists (select 1 from aclexplode(p.proacl) a where a.grantee = 'anon'::regrole::oid) as had_anon
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.prosecdef and p.prokind = 'f';
--   alter table public.definer_anon_respaldo_20261001 enable row level security;
--   revoke all on public.definer_anon_respaldo_20261001 from anon, authenticated;
-- To undo this migration, give back exactly what it took (run with the same
-- search_path the backup was taken with):
--   do $$
--   declare r record;
--   begin
--     for r in select signature, had_public, had_anon from public.definer_anon_respaldo_20261001 loop
--       if r.had_public then execute format('grant execute on function %s to public', r.signature); end if;
--       if r.had_anon then execute format('grant execute on function %s to anon', r.signature); end if;
--     end loop;
--   end $$;
-- A single function can be given back with
--   grant execute on function public.<name>(<argument types>) to anon;

DO $definer_sin_anon$
-- >>> block start
DECLARE
  -- Signatures (as regprocedure text, e.g. 'public.some_function(uuid)') of
  -- definer functions that must stay callable without a session. Empty today:
  -- the application calls no definer function as a visitor. An entry that
  -- matches no function raises, so a typo cannot go unnoticed.
  c_allowlist constant text[] := ARRAY[]::text[];

  v_allow       oid[];
  v_unmatched   text;
  v_targets     oid[];
  v_auth        oid[];
  v_service     oid[];
  v_anon_before integer;
  v_oid         oid;
  v_bad         text;
BEGIN
  SELECT array_agg(to_regprocedure(a)::oid) FILTER (WHERE to_regprocedure(a) IS NOT NULL),
         string_agg(a, ', ') FILTER (WHERE to_regprocedure(a) IS NULL)
    INTO v_allow, v_unmatched
    FROM unnest(c_allowlist) AS a;
  IF v_unmatched IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: allowlist entries match no function: %', v_unmatched;
  END IF;
  v_allow := coalesce(v_allow, '{}'::oid[]);

  -- What each role can execute BEFORE anything is revoked.
  SELECT coalesce(array_agg(p.oid), '{}'::oid[]),
         coalesce(array_agg(p.oid) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'execute')), '{}'::oid[]),
         coalesce(array_agg(p.oid) FILTER (WHERE has_function_privilege('service_role', p.oid, 'execute')), '{}'::oid[]),
         count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'execute'))
    INTO v_targets, v_auth, v_service, v_anon_before
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prokind = 'f'
     AND NOT (p.oid = ANY (v_allow));

  FOREACH v_oid IN ARRAY v_targets LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
    IF v_oid = ANY (v_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_oid::regprocedure);
    END IF;
    IF v_oid = ANY (v_service) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid::regprocedure);
    END IF;
  END LOOP;

  -- Postcondition 1: no target is executable by anon any more.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_proc p
   WHERE p.oid = ANY (v_targets)
     AND has_function_privilege('anon', p.oid, 'execute');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: still executable by anon: %', v_bad;
  END IF;

  -- Postcondition 2: authenticated and service_role keep what they had.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_proc p
   WHERE (p.oid = ANY (v_auth) AND NOT has_function_privilege('authenticated', p.oid, 'execute'))
      OR (p.oid = ANY (v_service) AND NOT has_function_privilege('service_role', p.oid, 'execute'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'definer_sin_anon: lost an execute it had: %', v_bad;
  END IF;

  RAISE NOTICE 'definer_sin_anon: % definer functions targeted, % were executable by anon before',
    cardinality(v_targets), v_anon_before;
END
-- <<< block end
$definer_sin_anon$;
