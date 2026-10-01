-- director_etapa_grupos UNIQUE (director_etapa_id, grupo_id) and removal of the unsafe
-- asignar_director_etapa_a_grupo (odd/tasks/main-directores-pendientes.md, T1).
--
-- Covers:
--   1. The unique constraint exists, a duplicate pair raises 23505, a different pair
--      and the same director on another group are still allowed.
--   2. INSERT ... ON CONFLICT (director_etapa_id, grupo_id) DO NOTHING works.
--   3. asignar_director_etapa_a_grupo no longer exists.
--   4. crear_grupo_con_director with a couple still links both spouses, and running
--      the spouse insert path again (NOT EXISTS + ON CONFLICT DO NOTHING) does not fail.
--   5. planner_guardar_planificacion re-saving the same directors is a no-op: no
--      error and no duplicate links.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e6000000-... namespace and every fixture person has
-- nombre 'ZZ Du'. The last statement is a SELECT of the failing cases (empty =
-- all ok), because the MCP tool returns only the last result-producing statement.
-- The migration 20261001170000 must be applied first (prepend it for a dry run).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_du_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_du_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

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

-- Runs a statement and returns its text result, or 'ERR:<sqlstate>' when it
-- raises. The EXCEPTION block rolls back only that statement.
CREATE OR REPLACE FUNCTION pg_temp.outcome(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  RETURN coalesce(v_actual, 'NULL');
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Du' AND apellido = p_tag;
$$;

-- Links of the fixture group with this name: count and the segmento_lideres id tags.
CREATE OR REPLACE FUNCTION pg_temp.links_of(p_name text)
RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text || ':' || coalesce(string_agg(right(deg.director_etapa_id::text, 2), ',' ORDER BY deg.director_etapa_id), 'none')
    FROM public.grupos g
    JOIN public.director_etapa_grupos deg ON deg.grupo_id = g.id
   WHERE g.nombre = p_name;
$$;

CREATE OR REPLACE FUNCTION pg_temp.guardar(p_destino uuid, p_origen uuid, p_grupos text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.outcome(format(
    'SELECT (public.planner_guardar_planificacion(%L, %L, %L::jsonb, %L::uuid[]))::text',
    p_destino, p_origen, p_grupos, '{}'));
$$;

-- Fixtures ---------------------------------------------------------------------
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6000000-0000-4000-8000-0000000000c1', 'ZZ Du ORI', current_date - 400, current_date - 200, false, 'finalizada'),
  ('e6000000-0000-4000-8000-0000000000c2', 'ZZ Du DST', current_date + 200, current_date + 400, false, 'planificacion');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6000000-0000-4000-8000-0000000000a1', 'ZZ Du S1');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e6000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzdu-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- 01 ADM admin, 02 DE1 + 03 DE2 a couple of directores de etapa of S1.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e6000000-0000-4000-8000-000000000001', 'ZZ Du', 'ADM', 'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000101'),
  ('e6000000-0000-4000-8000-000000000002', 'ZZ Du', 'DE1', 'Otro', 'Casado',  NULL),
  ('e6000000-0000-4000-8000-000000000003', 'ZZ Du', 'DE2', 'Otro', 'Casado',  NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES ('e6000000-0000-4000-8000-000000000001', 'admin')) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6000000-0000-4000-8000-0000000000b1', 'e6000000-0000-4000-8000-0000000000a1', 'e6000000-0000-4000-8000-000000000002', 'director_etapa'),
  ('e6000000-0000-4000-8000-0000000000b2', 'e6000000-0000-4000-8000-0000000000a1', 'e6000000-0000-4000-8000-000000000003', 'director_etapa');

INSERT INTO public.relaciones_usuarios (id, usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  ('e6000000-0000-4000-8000-0000000000e1', 'e6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000003', 'conyuge', true);

-- Two plain groups in the destination season for the direct constraint cases.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_ciclo, estado_aprobacion) VALUES
  ('e6000000-0000-4000-8000-0000000000d1', 'ZZ Du g1', 'e6000000-0000-4000-8000-0000000000c2', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-0000000000d2', 'ZZ Du g2', 'e6000000-0000-4000-8000-0000000000c2', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente');

-- Cases ------------------------------------------------------------------------

-- 1. The constraint.
SELECT pg_temp.assert_eq('constraint: UNIQUE (director_etapa_id, grupo_id) exists',
  $q$SELECT count(*)::text FROM pg_constraint c
      WHERE c.conrelid = 'public.director_etapa_grupos'::regclass
        AND c.conname = 'director_etapa_grupos_director_grupo_key'
        AND c.contype = 'u'
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['director_etapa_id','grupo_id']$q$, '1');

INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id) VALUES
  ('e6000000-0000-4000-8000-0000000000d1', 'e6000000-0000-4000-8000-0000000000b1');

SELECT pg_temp.assert_eq('constraint: a duplicate pair raises 23505',
  $q$SELECT pg_temp.outcome($i$INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
       VALUES ('e6000000-0000-4000-8000-0000000000d1', 'e6000000-0000-4000-8000-0000000000b1') RETURNING 'dup'$i$)$q$, 'ERR:23505');
SELECT pg_temp.assert_eq('constraint: another director on the same group is allowed',
  $q$SELECT pg_temp.outcome($i$INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
       VALUES ('e6000000-0000-4000-8000-0000000000d1', 'e6000000-0000-4000-8000-0000000000b2') RETURNING 'ok'$i$)$q$, 'ok');
SELECT pg_temp.assert_eq('constraint: the same director on another group is allowed',
  $q$SELECT pg_temp.outcome($i$INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
       VALUES ('e6000000-0000-4000-8000-0000000000d2', 'e6000000-0000-4000-8000-0000000000b1') RETURNING 'ok'$i$)$q$, 'ok');

-- 2. ON CONFLICT on the pair.
SELECT pg_temp.assert_eq('on conflict: an existing pair is skipped without error',
  $q$SELECT pg_temp.outcome($i$WITH i AS (
         INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
         VALUES ('e6000000-0000-4000-8000-0000000000d1', 'e6000000-0000-4000-8000-0000000000b1')
         ON CONFLICT (director_etapa_id, grupo_id) DO NOTHING RETURNING 1)
       SELECT count(*)::text FROM i$i$)$q$, '0');
SELECT pg_temp.assert_eq('on conflict: no duplicate row was created',
  $q$SELECT count(*)::text FROM public.director_etapa_grupos
      WHERE grupo_id = 'e6000000-0000-4000-8000-0000000000d1' AND director_etapa_id = 'e6000000-0000-4000-8000-0000000000b1'$q$, '1');

-- 3. The unsafe RPC is gone.
SELECT pg_temp.assert_eq('rpc: asignar_director_etapa_a_grupo no longer exists',
  $q$SELECT coalesce(to_regprocedure('public.asignar_director_etapa_a_grupo(uuid,uuid,uuid,text)')::text, 'NULL')$q$, 'NULL');
SELECT pg_temp.assert_eq('rpc: no function with that name remains under any signature',
  $q$SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'asignar_director_etapa_a_grupo'$q$, '0');

-- 4. Couples through crear_grupo_con_director.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('couple: crear_grupo_con_director links both spouses',
  $q$SELECT (public.crear_grupo_con_director('ZZ Du pareja', (SELECT id FROM public.temporadas WHERE activa LIMIT 1),
       'e6000000-0000-4000-8000-0000000000a1', 'e6000000-0000-4000-8000-0000000000b1') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('couple: both spouses are linked once each',
  $q$SELECT pg_temp.links_of('ZZ Du pareja')$q$, '2:b1,b2');
SELECT pg_temp.assert_eq('couple: re-running the spouse insert path (NOT EXISTS + ON CONFLICT DO NOTHING) does not fail',
  $q$SELECT pg_temp.outcome($i$WITH i AS (
         INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
         SELECT g.id, 'e6000000-0000-4000-8000-0000000000b2'::uuid FROM public.grupos g
          WHERE g.nombre = 'ZZ Du pareja'
            AND NOT EXISTS (SELECT 1 FROM public.director_etapa_grupos x
                             WHERE x.grupo_id = g.id AND x.director_etapa_id = 'e6000000-0000-4000-8000-0000000000b2')
         ON CONFLICT DO NOTHING RETURNING 1)
       SELECT count(*)::text FROM i$i$)$q$, '0');
SELECT pg_temp.assert_eq('couple: still two links after the second pass',
  $q$SELECT pg_temp.links_of('ZZ Du pareja')$q$, '2:b1,b2');
SELECT pg_temp.assert_eq('couple: the path without the pre-check is also idempotent through ON CONFLICT',
  $q$SELECT pg_temp.outcome($i$WITH i AS (
         INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id)
         SELECT g.id, 'e6000000-0000-4000-8000-0000000000b2'::uuid FROM public.grupos g WHERE g.nombre = 'ZZ Du pareja'
         ON CONFLICT DO NOTHING RETURNING 1)
       SELECT count(*)::text FROM i$i$)$q$, '0');

-- 5. planner_guardar_planificacion re-saving the same directors.
SELECT pg_temp.assert_eq('planner: saving a new group with two directors inserts it',
  $q$SELECT (pg_temp.guardar('e6000000-0000-4000-8000-0000000000c2', 'e6000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"du1","director_etapa_ids":["e6000000-0000-4000-8000-000000000002","e6000000-0000-4000-8000-000000000003"],"nombre":"ZZ Du plan","segmento_id":"e6000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       ~ '"insertados": 1')::text$q$, 'true');
SELECT pg_temp.assert_eq('planner: two links after the first save',
  $q$SELECT pg_temp.links_of('ZZ Du plan')$q$, '2:b1,b2');
SELECT pg_temp.assert_eq('planner: re-saving the same directors does not raise and updates the group',
  $q$SELECT (pg_temp.guardar('e6000000-0000-4000-8000-0000000000c2', 'e6000000-0000-4000-8000-0000000000c1',
       (SELECT jsonb_build_array(jsonb_build_object('id', id, 'clave', 'du1', 'nombre', 'ZZ Du plan',
          'director_etapa_ids', jsonb_build_array('e6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000002'),
          'segmento_id', 'e6000000-0000-4000-8000-0000000000a1'))::text
          FROM public.grupos WHERE nombre = 'ZZ Du plan'))
       ~ '"actualizados": 1')::text$q$, 'true');
SELECT pg_temp.assert_eq('planner: still exactly two links, no duplicates',
  $q$SELECT pg_temp.links_of('ZZ Du plan')$q$, '2:b1,b2');

-- Result: the failing cases (empty = all ok).
SELECT case_name AS failing_cases FROM t_du_failures ORDER BY case_name;

ROLLBACK;
