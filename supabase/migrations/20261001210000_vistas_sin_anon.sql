-- Views without anonymous access (permissions only).
--
-- PROBLEM
-- Eight plain views of the public schema return rows to a visitor with no
-- session. They are owned by postgres and have no security_invoker option, so
-- they run with the rights of their owner and bypass the RLS of their base
-- tables, and anon (the role of a visitor) holds every table privilege on them,
-- granted by the default privileges of the schema. With the public API key
-- anyone can read, for example, the name, attendance and risk level of every
-- group member (v_salud_miembros_grupo), the partner and civil status of every
-- leader (v_lideres_con_pareja), and the street, neighborhood and coordinates of
-- the host houses (v_mapa_grupos_vida, v_casas_anfitrionas_disponibles). The
-- views are not updatable, so the write privileges of anon were inert; the
-- reads were not.
-- The application reads these views only on logged-in routes
-- (lib/actions/asistencia-avanzada.actions.ts,
-- lib/actions/solicitudes-grupo.actions.ts,
-- lib/actions/casas-anfitrionas.actions.ts and
-- app/api/segmentos/[segmentoId]/directores-etapa/ubicaciones/route.ts).
--
-- WHAT CHANGES
-- For each view of an explicit list (not a catalog walk), when it exists in
-- this database (a missing one is skipped with a NOTICE):
--   1. note what authenticated and service_role can do on it;
--   2. REVOKE ALL ON TABLE public.<view> FROM PUBLIC, anon;
--   3. give back to authenticated, or to service_role, a privilege it held only
--      through PUBLIC, if any (none on staging), so they keep exactly what they
--      had.
-- No view definition, owner or option (security_invoker) changes and no row is
-- touched. A listed name that is not a view or a materialized view raises. The
-- block ends with a check and raises (so the migration fails and nothing is
-- applied) when anon still holds any privilege on a listed view, or when
-- authenticated or service_role ended up with different privileges than before.
-- Running it twice changes nothing the second time.
--
-- BLAST RADIUS
-- A caller with no session now gets 42501 (permission denied for the view) from
-- these eight views; before, it got every row. People with a session read the
-- same rows as before: that these views show everything to any logged-in reader
-- (they ignore the RLS of their base tables) is a later phase. No other relation
-- is touched. supabase/tests/vistas-sin-anon.test.sql pins all of this, plus the
-- logged-out reads the application really makes (configuracion_plataforma and
-- the public certificate check), which do not change.
--
-- ROLLBACK
-- On staging, before this migration, anon, authenticated, service_role and
-- supabase_admin each held select, insert, update, delete, truncate, references
-- and trigger on every one of the eight views (relacl
-- {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,
-- service_role=arwdDxtm/postgres,supabase_admin=arwdDxtm/postgres}, no PUBLIC
-- entry), all from the schema default privileges. To give a visitor back the
-- read of a view:
--   grant select on public.<view> to anon;
-- and, for exactly the previous state:
--   grant select, insert, update, delete, truncate, references, trigger on public.<view> to anon;
-- Before applying in production, record the previous grants in a batch of its
-- own (never together with this migration):
--   select c.relname, c.relacl from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind in ('v', 'm') and c.relacl::text like '%anon=%';

DO $vistas_sin_anon$
-- >>> block start
DECLARE
  -- The views to close, by name (schema public). A name that does not exist in
  -- this database is skipped with a NOTICE; a name that is not a view or a
  -- materialized view raises.
  c_views constant text[] := ARRAY[
    'v_casas_anfitrionas_disponibles',
    'v_directores_etapa_segmento',
    'v_grupos_supervisiones',
    'v_historial_miembro',
    'v_lideres_con_pareja',
    'v_mapa_grupos_vida',
    'v_salud_miembros_grupo',
    'v_solicitudes_pendientes'
  ];
  c_privs constant text[] := ARRAY['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
  c_roles constant text[] := ARRAY['authenticated', 'service_role'];

  v_name    text;
  v_oid     oid;
  v_kind    "char";
  v_role    text;
  v_priv    text;
  v_now     jsonb;
  v_before  jsonb := '{}'::jsonb;
  v_closed  integer := 0;
  v_skipped integer := 0;
  v_bad     text;
BEGIN
  FOREACH v_name IN ARRAY c_views LOOP
    v_oid := to_regclass(format('public.%I', v_name))::oid;
    IF v_oid IS NULL THEN
      RAISE NOTICE 'vistas_sin_anon: public.% does not exist in this database, skipped', v_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT c.relkind INTO v_kind FROM pg_class c WHERE c.oid = v_oid;
    IF v_kind NOT IN ('v', 'm') THEN
      RAISE EXCEPTION 'vistas_sin_anon: public.% is not a view (relkind %)', v_name, v_kind;
    END IF;

    -- What authenticated and service_role can do BEFORE anything is revoked.
    FOREACH v_role IN ARRAY c_roles LOOP
      SELECT coalesce(jsonb_agg(p ORDER BY p), '[]'::jsonb) INTO v_now
        FROM unnest(c_privs) AS p
       WHERE has_table_privilege(v_role, v_oid, p);
      v_before := v_before || jsonb_build_object(v_name || '|' || v_role, v_now);
    END LOOP;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', v_name);

    -- Give back what a role reached only through PUBLIC.
    FOREACH v_role IN ARRAY c_roles LOOP
      FOREACH v_priv IN ARRAY c_privs LOOP
        IF (v_before -> (v_name || '|' || v_role)) ? v_priv
           AND NOT has_table_privilege(v_role, v_oid, v_priv) THEN
          EXECUTE format('GRANT %s ON TABLE public.%I TO %I', v_priv, v_name, v_role);
        END IF;
      END LOOP;
    END LOOP;

    v_closed := v_closed + 1;
  END LOOP;

  -- Postcondition 1: anon holds nothing on any listed view that exists.
  v_bad := NULL;
  FOREACH v_name IN ARRAY c_views LOOP
    v_oid := to_regclass(format('public.%I', v_name))::oid;
    CONTINUE WHEN v_oid IS NULL;
    IF has_table_privilege('anon', v_oid, array_to_string(c_privs, ', '))
       OR has_any_column_privilege('anon', v_oid, 'select, insert, update, references') THEN
      v_bad := concat_ws(', ', v_bad, v_name);
    END IF;
  END LOOP;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'vistas_sin_anon: anon still holds a privilege on: %', v_bad;
  END IF;

  -- Postcondition 2: authenticated and service_role keep exactly what they had.
  v_bad := NULL;
  FOREACH v_name IN ARRAY c_views LOOP
    v_oid := to_regclass(format('public.%I', v_name))::oid;
    CONTINUE WHEN v_oid IS NULL;
    FOREACH v_role IN ARRAY c_roles LOOP
      SELECT coalesce(jsonb_agg(p ORDER BY p), '[]'::jsonb) INTO v_now
        FROM unnest(c_privs) AS p
       WHERE has_table_privilege(v_role, v_oid, p);
      IF v_now IS DISTINCT FROM (v_before -> (v_name || '|' || v_role)) THEN
        v_bad := concat_ws(', ', v_bad, v_name || ' (' || v_role || ')');
      END IF;
    END LOOP;
  END LOOP;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'vistas_sin_anon: a role ended up with different privileges on: %', v_bad;
  END IF;

  RAISE NOTICE 'vistas_sin_anon: % views closed to anon, % not present in this database', v_closed, v_skipped;
END
-- <<< block end
$vistas_sin_anon$;
