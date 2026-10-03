-- T1b (odd/tasks/seguridad-definer-fase1-anon.md, D6) - the eight views that
-- return rows without a session are closed to anon and PUBLIC, and nobody who
-- reads them with a session loses anything.
--
-- The views are plain views owned by postgres (no security_invoker), so they
-- bypass the RLS of their base tables and answered anon with real rows:
-- v_salud_miembros_grupo, v_grupos_supervisiones, v_lideres_con_pareja,
-- v_historial_miembro, v_mapa_grupos_vida, v_directores_etapa_segmento,
-- v_solicitudes_pendientes, v_casas_anfitrionas_disponibles.
--
-- Covers:
--   a. As anon (no claims), select count(*) on each of the eight raises 42501.
--      Checked twice: on the live catalog as found (goes RED until the
--      migration is applied) and again after the migration block ran inside this
--      transaction (guards the block itself). The counts anon got before are
--      printed in the info column.
--   b. anon holds no privilege of any kind on the eight (live and after the
--      block), and no ACL entry for PUBLIC remains.
--   c. The privileges of authenticated and service_role on the eight are the
--      same before and after the block.
--   d. The views are untouched: md5 of pg_get_viewdef, reloptions and owner are
--      the same before and after.
--   e. Logged-in behavior is unchanged: one real admin and one real director de
--      etapa get the same select count(*) on each view before and after.
--   f. The reads the application makes without a session still work, live and
--      after the block: configuracion_plataforma and the public certificate
--      lookup (same columns and filter as
--      app/api/public/verificar-certificado/[codigo]) on a fixture certificate.
--   g. Idempotency: a second run of the block leaves relacl of the eight as it
--      was.
--   h. The mechanics of the block on fixture views: a name that does not exist
--      is skipped, a name that is not a view raises, a relation outside the list
--      keeps its grants, and a view that authenticated and service_role reached
--      only through PUBLIC keeps working for them through explicit grants.
--
-- Run against STAGING inside BEGIN...ROLLBACK - nothing here is kept. The
-- certificate fixture has codigo_verificacion 'ZZVSA0000000001A' and the fixture
-- relations are public.zz_vsa_*. The MCP connection is `postgres` (BYPASSRLS),
-- so every logged-out or logged-in probe runs under SET LOCAL ROLE with the
-- claims set by pg_temp.probe(). The last statement is a SELECT (failing_cases =
-- 0 means all ok; detail lists the failing cases; info prints the snapshot),
-- because the MCP tool returns only the last result-producing statement.
--
-- Run it before the migration is applied to see (a) and (b) go RED, and again
-- after it is applied to see everything GREEN.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_vsa_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_vsa_info (k text, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_vsa_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Runs a query that returns one scalar under a role and returns its text form,
-- or 'ERR <sqlstate>' when it raises. p_sub NULL means no claims (a visitor).
CREATE OR REPLACE FUNCTION pg_temp.probe(p_role text, p_sub uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v_out;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN coalesce(v_out, 'NULL');
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claims', '', true);
      RETURN 'ERR ' || SQLSTATE;
  END;
END;
$$;

-- The views under test.
CREATE TEMP TABLE t_vsa_names (name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO t_vsa_names VALUES
  ('v_casas_anfitrionas_disponibles'), ('v_directores_etapa_segmento'), ('v_grupos_supervisiones'),
  ('v_historial_miembro'), ('v_lideres_con_pareja'), ('v_mapa_grupos_vida'),
  ('v_salud_miembros_grupo'), ('v_solicitudes_pendientes');

-- Who can do what, and what the views look like, per phase (s0 = as found, s1 =
-- after the first run of the block, s2 = after the second).
CREATE TEMP TABLE t_vsa_state (
  phase text, name text, anon_privs text, auth_privs text, svc_privs text,
  public_acl boolean, relacl text, reloptions text, owner text, def_md5 text
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.take_state(p_phase text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_vsa_state
  SELECT p_phase, n.name,
         (SELECT coalesce(string_agg(pr, ',' ORDER BY pr), '') FROM unnest(ARRAY['select','insert','update','delete','truncate','references','trigger']) pr
           WHERE has_table_privilege('anon', c.oid, pr)),
         (SELECT coalesce(string_agg(pr, ',' ORDER BY pr), '') FROM unnest(ARRAY['select','insert','update','delete','truncate','references','trigger']) pr
           WHERE has_table_privilege('authenticated', c.oid, pr)),
         (SELECT coalesce(string_agg(pr, ',' ORDER BY pr), '') FROM unnest(ARRAY['select','insert','update','delete','truncate','references','trigger']) pr
           WHERE has_table_privilege('service_role', c.oid, pr)),
         EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee = 0),
         coalesce(c.relacl::text, 'NULL'), coalesce(c.reloptions::text, 'NULL'), c.relowner::regrole::text,
         md5(pg_get_viewdef(c.oid))
    FROM t_vsa_names n
    JOIN pg_class c ON c.oid = to_regclass(format('public.%I', n.name));
$$;

CREATE OR REPLACE FUNCTION pg_temp.relacl_md5()
RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(n.name || coalesce(c.relacl::text, 'NULL'), '|' ORDER BY n.name))
    FROM t_vsa_names n JOIN pg_class c ON c.oid = to_regclass(format('public.%I', n.name));
$$;

-- Fixtures (as postgres). ----------------------------------------------------
-- One certificate for the public lookup. Its parents (inscripcion, taller,
-- persona) are not needed to read it, so the foreign keys are skipped for this
-- insert only.
SET LOCAL session_replication_role = replica;
INSERT INTO public.taller_certificados
  (inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot)
VALUES
  (gen_random_uuid(), 'ZZVSA0000000001A', gen_random_uuid(), gen_random_uuid(), 'ZZ vsa taller', 'ZZ vsa persona');
SET LOCAL session_replication_role = origin;

-- One real admin and one real director de etapa with an account.
CREATE TEMP TABLE t_vsa_ids (who text, auth_id uuid) ON COMMIT DROP;
INSERT INTO t_vsa_ids
SELECT 'admin', (SELECT u.auth_id
                   FROM public.usuarios u
                   JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                   JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                  WHERE rs.nombre_interno = 'admin' AND u.auth_id IS NOT NULL
                  ORDER BY u.id LIMIT 1)
UNION ALL
SELECT 'director_etapa', (SELECT u.auth_id
                            FROM public.usuarios u
                            JOIN public.usuario_roles ur ON ur.usuario_id = u.id
                            JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                           WHERE rs.nombre_interno = 'director-etapa' AND u.auth_id IS NOT NULL
                           ORDER BY u.id LIMIT 1);

-- Probes: what a visitor and two logged-in people get, per phase. ---------------
CREATE TEMP TABLE t_vsa_probe (phase text, name text, val text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.take_probes(p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
  w record;
BEGIN
  FOR r IN SELECT name FROM t_vsa_names ORDER BY name LOOP
    INSERT INTO t_vsa_probe VALUES
      (p_phase, 'anon count ' || r.name,
        pg_temp.probe('anon', NULL, format('SELECT count(*)::text FROM public.%I', r.name)));
    FOR w IN SELECT who, auth_id FROM t_vsa_ids WHERE auth_id IS NOT NULL ORDER BY who LOOP
      INSERT INTO t_vsa_probe VALUES
        (p_phase, w.who || ' count ' || r.name,
          pg_temp.probe('authenticated', w.auth_id, format('SELECT count(*)::text FROM public.%I', r.name)));
    END LOOP;
  END LOOP;

  INSERT INTO t_vsa_probe VALUES
    (p_phase, 'app read: select configuracion_plataforma',
      pg_temp.probe('anon', NULL, 'SELECT count(*)::text FROM public.configuracion_plataforma')),
    (p_phase, 'app read: certificate lookup',
      pg_temp.probe('anon', NULL, $q$SELECT count(*)::text FROM (
        SELECT id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot,
               nombre_participante_snapshot, fecha_completitud, firmantes_snapshot
          FROM public.taller_certificados
         WHERE codigo_verificacion = 'ZZVSA0000000001A') s$q$));
END;
$$;

-- The migration block as a function, so the suite can run it more than once.
-- Keep the text between the two markers identical to the body of the DO block
-- in supabase/migrations/20261001210000_vistas_sin_anon.sql.
CREATE OR REPLACE FUNCTION pg_temp.run_vistas_sin_anon()
RETURNS void LANGUAGE plpgsql AS $vistas_sin_anon$
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

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Phase s0: the live catalog as found. -----------------------------------------
SELECT pg_temp.take_state('s0');
SELECT pg_temp.take_probes('s0');
CREATE TEMP TABLE t_vsa_digest (k text, v text) ON COMMIT DROP;
INSERT INTO t_vsa_digest VALUES ('relacl_md5_s0', pg_temp.relacl_md5());

SELECT pg_temp.assert_eq('i: the eight views exist in this database',
  $q$SELECT count(*)::text FROM t_vsa_state WHERE phase = 's0'$q$, '8');
SELECT pg_temp.assert_eq('i: the block names the eight views',
  $q$SELECT count(*)::text FROM t_vsa_names n
      WHERE position('''' || n.name || '''' IN pg_get_functiondef('pg_temp.run_vistas_sin_anon()'::regprocedure)) > 0$q$, '8');

SELECT pg_temp.assert_eq('a: live catalog - every view answers anon with 42501 (offenders listed)',
  $q$SELECT coalesce(string_agg(replace(name, 'anon count ', ''), ', ' ORDER BY name), '')
       FROM t_vsa_probe WHERE phase = 's0' AND name LIKE 'anon count %' AND val <> 'ERR 42501'$q$, '');
SELECT pg_temp.assert_eq('b: live catalog - anon holds no privilege on any view (offenders listed)',
  $q$SELECT coalesce(string_agg(name, ', ' ORDER BY name), '') FROM t_vsa_state WHERE phase = 's0' AND anon_privs <> ''$q$, '');
SELECT pg_temp.assert_eq('b: live catalog - no view has a PUBLIC ACL entry',
  $q$SELECT count(*)::text FROM t_vsa_state WHERE phase = 's0' AND public_acl$q$, '0');

-- Phase s1: after the first run of the block. ----------------------------------
SELECT pg_temp.run_vistas_sin_anon();
SELECT pg_temp.take_state('s1');
SELECT pg_temp.take_probes('s1');
INSERT INTO t_vsa_digest VALUES ('relacl_md5_s1', pg_temp.relacl_md5());

SELECT pg_temp.assert_eq('a: after the block - every view answers anon with 42501 (offenders listed)',
  $q$SELECT coalesce(string_agg(replace(name, 'anon count ', ''), ', ' ORDER BY name), '')
       FROM t_vsa_probe WHERE phase = 's1' AND name LIKE 'anon count %' AND val <> 'ERR 42501'$q$, '');
SELECT pg_temp.assert_eq('b: after the block - anon holds no privilege on any view (offenders listed)',
  $q$SELECT coalesce(string_agg(name, ', ' ORDER BY name), '') FROM t_vsa_state WHERE phase = 's1' AND anon_privs <> ''$q$, '');
SELECT pg_temp.assert_eq('b: after the block - no view has a PUBLIC ACL entry',
  $q$SELECT count(*)::text FROM t_vsa_state WHERE phase = 's1' AND public_acl$q$, '0');

SELECT pg_temp.assert_eq('c: authenticated has the same privileges on every view before and after',
  $q$SELECT coalesce(string_agg(a.name, ', ' ORDER BY a.name), '') FROM t_vsa_state a
      JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.auth_privs IS DISTINCT FROM b.auth_privs$q$, '');
SELECT pg_temp.assert_eq('c: service_role has the same privileges on every view before and after',
  $q$SELECT coalesce(string_agg(a.name, ', ' ORDER BY a.name), '') FROM t_vsa_state a
      JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.svc_privs IS DISTINCT FROM b.svc_privs$q$, '');
SELECT pg_temp.assert_eq('c: the same eight views are measured before and after',
  $q$SELECT ((SELECT count(*) FROM t_vsa_state WHERE phase = 's0') = (SELECT count(*) FROM t_vsa_state WHERE phase = 's1'))::text$q$, 'true');
SELECT pg_temp.assert_eq('d: no view definition changed',
  $q$SELECT coalesce(string_agg(a.name, ', ' ORDER BY a.name), '') FROM t_vsa_state a
      JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.def_md5 IS DISTINCT FROM b.def_md5$q$, '');
SELECT pg_temp.assert_eq('d: no view changed its reloptions or its owner',
  $q$SELECT coalesce(string_agg(a.name, ', ' ORDER BY a.name), '') FROM t_vsa_state a
      JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND (a.reloptions IS DISTINCT FROM b.reloptions OR a.owner IS DISTINCT FROM b.owner)$q$, '');

-- Phase s2: a second run changes nothing. ---------------------------------------
SELECT pg_temp.run_vistas_sin_anon();
INSERT INTO t_vsa_digest VALUES ('relacl_md5_s2', pg_temp.relacl_md5());
SELECT pg_temp.assert_eq('g: running the block twice leaves every relacl unchanged',
  $q$SELECT ((SELECT v FROM t_vsa_digest WHERE k = 'relacl_md5_s1') = (SELECT v FROM t_vsa_digest WHERE k = 'relacl_md5_s2'))::text$q$, 'true');

-- Logged-in behavior. ---------------------------------------------------------------
SELECT pg_temp.assert_eq('e: staging has an admin with an account',
  $q$SELECT (auth_id IS NOT NULL)::text FROM t_vsa_ids WHERE who = 'admin'$q$, 'true');
SELECT pg_temp.assert_eq('e: staging has a director de etapa with an account',
  $q$SELECT (auth_id IS NOT NULL)::text FROM t_vsa_ids WHERE who = 'director_etapa'$q$, 'true');
SELECT pg_temp.assert_eq('e: every logged-in count is the same before and after (differences listed)',
  $q$SELECT coalesce(string_agg(a.name || ' ' || a.val || '->' || b.val, ', ' ORDER BY a.name), '')
       FROM t_vsa_probe a JOIN t_vsa_probe b ON b.name = a.name AND b.phase = 's1'
      WHERE a.phase = 's0' AND a.name NOT LIKE 'anon count %' AND a.name NOT LIKE 'app read:%'
        AND a.val IS DISTINCT FROM b.val$q$, '');
SELECT pg_temp.assert_eq('e: no logged-in count raises after the block (16 counts ran)',
  $q$SELECT (count(*) FILTER (WHERE val LIKE 'ERR%') = 0 AND count(*) = 16)::text
       FROM t_vsa_probe WHERE phase = 's1' AND (name LIKE 'admin count %' OR name LIKE 'director_etapa count %')$q$, 'true');
SELECT pg_temp.assert_eq('e: the logged-in counts are not vacuous (the admin reads rows from at least four views)',
  $q$SELECT (count(*) FILTER (WHERE val ~ '^[0-9]+$' AND val::int > 0) >= 4)::text
       FROM t_vsa_probe WHERE phase = 's1' AND name LIKE 'admin count %'$q$, 'true');

-- The reads the application makes without a session. ---------------------------------
SELECT pg_temp.assert_eq('f: select on configuracion_plataforma does not raise (live)',
  $q$SELECT (val NOT LIKE 'ERR%')::text FROM t_vsa_probe WHERE phase = 's0' AND name = 'app read: select configuracion_plataforma'$q$, 'true');
SELECT pg_temp.assert_eq('f: select on configuracion_plataforma returns the same rows before and after',
  $q$SELECT ((SELECT val FROM t_vsa_probe WHERE phase = 's0' AND name = 'app read: select configuracion_plataforma')
         = (SELECT val FROM t_vsa_probe WHERE phase = 's1' AND name = 'app read: select configuracion_plataforma'))::text$q$, 'true');
SELECT pg_temp.assert_eq('f: select on configuracion_plataforma does not raise (after)',
  $q$SELECT (val NOT LIKE 'ERR%')::text FROM t_vsa_probe WHERE phase = 's1' AND name = 'app read: select configuracion_plataforma'$q$, 'true');
SELECT pg_temp.assert_eq('f: the public certificate lookup returns the fixture row (live)',
  $q$SELECT val FROM t_vsa_probe WHERE phase = 's0' AND name = 'app read: certificate lookup'$q$, '1');
SELECT pg_temp.assert_eq('f: the public certificate lookup returns the fixture row (after)',
  $q$SELECT val FROM t_vsa_probe WHERE phase = 's1' AND name = 'app read: certificate lookup'$q$, '1');

-- The mechanics of the block, on fixture relations (rolled back). ------------------
CREATE VIEW public.zz_vsa_plain AS SELECT 1 AS x;
CREATE VIEW public.zz_vsa_partial AS SELECT 1 AS x;
CREATE VIEW public.zz_vsa_public_only AS SELECT 1 AS x;
CREATE VIEW public.zz_vsa_other AS SELECT 1 AS x;
CREATE TABLE public.zz_vsa_table (x integer);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zz_vsa_plain TO anon, authenticated, service_role;
-- authenticated reads, service_role has nothing, anon reads.
REVOKE ALL ON public.zz_vsa_partial FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.zz_vsa_partial TO anon, authenticated;
-- authenticated and service_role reach this one only through PUBLIC.
REVOKE ALL ON public.zz_vsa_public_only FROM anon, authenticated, service_role;
GRANT SELECT ON public.zz_vsa_public_only TO PUBLIC;
-- Not in the list: must keep its anon grant.
REVOKE ALL ON public.zz_vsa_other FROM PUBLIC, authenticated, service_role;
GRANT SELECT ON public.zz_vsa_other TO anon;
GRANT SELECT ON public.zz_vsa_table TO PUBLIC, anon;

SELECT pg_temp.assert_eq('h: fixtures start as designed',
  $q$SELECT (has_table_privilege('anon', 'public.zz_vsa_plain', 'select')
         AND has_table_privilege('anon', 'public.zz_vsa_partial', 'select')
         AND NOT has_table_privilege('service_role', 'public.zz_vsa_partial', 'select')
         AND has_table_privilege('authenticated', 'public.zz_vsa_public_only', 'select')
         AND NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
                          WHERE c.oid = 'public.zz_vsa_public_only'::regclass
                            AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid))
         AND has_table_privilege('anon', 'public.zz_vsa_other', 'select'))::text$q$, 'true');

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('pg_temp.run_vistas_sin_anon()'::regprocedure);
  v_def := replace(v_def, 'pg_temp.run_vistas_sin_anon()', 'pg_temp.run_vistas_sin_anon_fixtures()');
  v_def := regexp_replace(v_def, 'c_views constant text\[\] := ARRAY\[[^]]*\];',
    'c_views constant text[] := ARRAY[''zz_vsa_plain'', ''zz_vsa_partial'', ''zz_vsa_public_only'', ''zz_vsa_missing''];');
  EXECUTE v_def;
  PERFORM pg_temp.run_vistas_sin_anon_fixtures();
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('h: the block on fixture views runs (a missing name is skipped)', SQLSTATE || ' ' || SQLERRM);
END
$$;

SELECT pg_temp.assert_eq('h: a listed view loses every privilege of anon and PUBLIC',
  $q$SELECT (NOT has_table_privilege('anon', 'public.zz_vsa_plain', 'select, insert, update, delete, truncate, references, trigger')
         AND NOT has_table_privilege('anon', 'public.zz_vsa_partial', 'select, insert, update, delete, truncate, references, trigger')
         AND NOT has_table_privilege('anon', 'public.zz_vsa_public_only', 'select, insert, update, delete, truncate, references, trigger')
         AND NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
                          WHERE c.oid IN ('public.zz_vsa_plain'::regclass, 'public.zz_vsa_partial'::regclass, 'public.zz_vsa_public_only'::regclass)
                            AND a.grantee = 0))::text$q$, 'true');
SELECT pg_temp.assert_eq('h: authenticated and service_role keep all seven privileges on a fully granted view',
  $q$SELECT (has_table_privilege('authenticated', 'public.zz_vsa_plain', 'select')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'insert')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'update')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'delete')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'truncate')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'references')
         AND has_table_privilege('authenticated', 'public.zz_vsa_plain', 'trigger')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'select')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'insert')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'update')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'delete')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'truncate')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'references')
         AND has_table_privilege('service_role', 'public.zz_vsa_plain', 'trigger'))::text$q$, 'true');
SELECT pg_temp.assert_eq('h: nobody gains what they lacked (service_role on the partial view, write on the read-only one)',
  $q$SELECT (NOT has_table_privilege('service_role', 'public.zz_vsa_partial', 'select')
         AND has_table_privilege('authenticated', 'public.zz_vsa_partial', 'select')
         AND NOT has_table_privilege('authenticated', 'public.zz_vsa_partial', 'insert, update, delete, truncate, references, trigger'))::text$q$, 'true');
SELECT pg_temp.assert_eq('h: a view reached only through PUBLIC keeps working for authenticated and service_role through explicit grants',
  $q$SELECT (has_table_privilege('authenticated', 'public.zz_vsa_public_only', 'select')
         AND has_table_privilege('service_role', 'public.zz_vsa_public_only', 'select')
         AND (SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a
               WHERE c.oid = 'public.zz_vsa_public_only'::regclass
                 AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid)) = 2)::text$q$, 'true');
SELECT pg_temp.assert_eq('h: a relation outside the list keeps its anon grant',
  $q$SELECT has_table_privilege('anon', 'public.zz_vsa_other', 'select')::text$q$, 'true');
SELECT pg_temp.assert_eq('h: the table fixture was not touched by the run that did not list it',
  $q$SELECT has_table_privilege('anon', 'public.zz_vsa_table', 'select')::text$q$, 'true');

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('pg_temp.run_vistas_sin_anon()'::regprocedure);
  v_def := replace(v_def, 'pg_temp.run_vistas_sin_anon()', 'pg_temp.run_vistas_sin_anon_table()');
  v_def := regexp_replace(v_def, 'c_views constant text\[\] := ARRAY\[[^]]*\];',
    'c_views constant text[] := ARRAY[''zz_vsa_table''];');
  EXECUTE v_def;
  BEGIN
    PERFORM pg_temp.run_vistas_sin_anon_table();
    PERFORM pg_temp.fail('h: a listed name that is a table raises', 'it ran without raising');
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- expected
  END;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('h: the table variant is built', SQLSTATE || ' ' || SQLERRM);
END
$$;
SELECT pg_temp.assert_eq('h: a table in the list keeps its anon grant (the run raised before touching it)',
  $q$SELECT has_table_privilege('anon', 'public.zz_vsa_table', 'select')::text$q$, 'true');

-- Snapshot printed with the result. ----------------------------------------------------
INSERT INTO t_vsa_info
SELECT a.name, a.val || ' -> ' || b.val
  FROM t_vsa_probe a JOIN t_vsa_probe b ON b.name = a.name AND b.phase = 's1'
 WHERE a.phase = 's0' AND a.name LIKE 'anon count %';
INSERT INTO t_vsa_info
SELECT 'logged-in ' || a.name, a.val || ' -> ' || b.val
  FROM t_vsa_probe a JOIN t_vsa_probe b ON b.name = a.name AND b.phase = 's1'
 WHERE a.phase = 's0' AND (a.name LIKE 'admin count %' OR a.name LIKE 'director_etapa count %');
INSERT INTO t_vsa_info
SELECT 'app ' || a.name, a.val || ' -> ' || b.val
  FROM t_vsa_probe a JOIN t_vsa_probe b ON b.name = a.name AND b.phase = 's1'
 WHERE a.phase = 's0' AND a.name LIKE 'app read:%';
INSERT INTO t_vsa_info
SELECT 'privs ' || a.name, format('anon [%s] -> [%s]; authenticated [%s] -> [%s]; service_role [%s] -> [%s]',
         a.anon_privs, b.anon_privs, a.auth_privs, b.auth_privs, a.svc_privs, b.svc_privs)
  FROM t_vsa_state a JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
 WHERE a.phase = 's0';
INSERT INTO t_vsa_info
SELECT 'relacl ' || a.name, a.relacl || ' -> ' || b.relacl
  FROM t_vsa_state a JOIN t_vsa_state b ON b.name = a.name AND b.phase = 's1'
 WHERE a.phase = 's0';
INSERT INTO t_vsa_info
SELECT 'digest ' || k, v FROM t_vsa_digest;

SELECT (SELECT count(*) FROM t_vsa_failures) AS failing_cases,
       coalesce((SELECT string_agg(case_name, E'\n') FROM t_vsa_failures), 'all cases ok') AS detail,
       (SELECT string_agg(k || ': ' || v, E'\n' ORDER BY k) FROM t_vsa_info WHERE k NOT LIKE 'relacl %') AS info;

ROLLBACK;
