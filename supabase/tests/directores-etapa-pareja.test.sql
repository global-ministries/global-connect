-- D1 (odd/tasks/main-directores-pareja.md) — a couple of directores de etapa directs the same groups.
--
-- Covers:
--   1. conyuge_director_etapa_id: spouse id for a couple (both directions of the
--      relation), NULL for a single director, NULL when the spouse directs ANOTHER
--      segment, NULL when the spouse is not a director, es_principal tie-break,
--      NULL/unknown arguments, privileges (service_role only).
--   2. crear_grupo_con_director: a couple director links both spouses, a single
--      director links one, the spouse can be the one named, a director de etapa
--      creator brings the spouse, a director of another segment is still refused.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e5000000-... namespace and every fixture person has
-- nombre 'ZZ Dp'. The last statement is a SELECT of the failing cases (empty =
-- all ok), because the MCP tool returns only the last result-producing statement.
-- The migration 20261001150000 must be applied first (prepend it for a dry run).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dp_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Dp' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.groups_named(p_name text)
RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.grupos WHERE nombre = p_name;
$$;

-- Director rows linked to the fixture group with this name: the segmento_lideres id tag.
CREATE OR REPLACE FUNCTION pg_temp.director_of(p_name text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(deg.director_etapa_id::text, 2), ',' ORDER BY deg.director_etapa_id), 'none')
    FROM public.grupos g
    JOIN public.director_etapa_grupos deg ON deg.grupo_id = g.id
   WHERE g.nombre = p_name;
$$;

-- Short tag of the spouse of a segmento_lideres id ('none' when NULL).
CREATE OR REPLACE FUNCTION pg_temp.spouse_tag(p_sl uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN coalesce(right(public.conyuge_director_etapa_id(p_sl)::text, 2), 'none');
END;
$$;

-- Calls crear_grupo_con_director as the current simulated identity.
CREATE OR REPLACE FUNCTION pg_temp.create_as(p_name text, p_segmento uuid, p_director uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.outcome(format(
    'SELECT (public.crear_grupo_con_director(%L, (SELECT id FROM public.temporadas WHERE activa LIMIT 1), %L, %L))::text',
    p_name, p_segmento, p_director));
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e5000000-0000-4000-8000-0000000000a1', 'ZZ Dp S1'),
  ('e5000000-0000-4000-8000-0000000000a2', 'ZZ Dp S2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e5000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzdp-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzdp-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzdp-de1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- 01 ADM admin, 02 LID lider, 03 DE1 + 04 DE2 couple (S1), 05 DE3 single (S1),
-- 06 DE6 (S1) married to 07 DE7 (S2 only), 08 DE8 (S1) married to 09 NSP (no
-- director row), 10 DE13 (S1) with two spouses: 11 DE14 (not principal) and
-- 12 DE15 (principal), both S1.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'ZZ Dp', 'ADM', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000101'),
  ('e5000000-0000-4000-8000-000000000002', 'ZZ Dp', 'LID', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000102'),
  ('e5000000-0000-4000-8000-000000000003', 'ZZ Dp', 'DE1', 'Otro', 'Casado',  'e5000000-0000-4000-8000-000000000103'),
  ('e5000000-0000-4000-8000-000000000004', 'ZZ Dp', 'DE2', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000005', 'ZZ Dp', 'DE3', 'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000006', 'ZZ Dp', 'DE6', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000007', 'ZZ Dp', 'DE7', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000008', 'ZZ Dp', 'DE8', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000009', 'ZZ Dp', 'NSP', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000010', 'ZZ Dp', 'D13', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000011', 'ZZ Dp', 'D14', 'Otro', 'Casado',  NULL),
  ('e5000000-0000-4000-8000-000000000012', 'ZZ Dp', 'D15', 'Otro', 'Casado',  NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e5000000-0000-4000-8000-000000000001', 'admin'),
    ('e5000000-0000-4000-8000-000000000002', 'lider'),
    ('e5000000-0000-4000-8000-000000000003', 'director-etapa')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

-- Ids end in b1 DE1, b2 DE2, b3 DE3, b4 DE6, b5 DE7 (S2), b6 DE8, b7 DE13, b8 DE14, b9 DE15.
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e5000000-0000-4000-8000-0000000000b1', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000003', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b2', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b3', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000005', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b4', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000006', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b5', 'e5000000-0000-4000-8000-0000000000a2', 'e5000000-0000-4000-8000-000000000007', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b6', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000008', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b7', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000010', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b8', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b9', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000012', 'director_etapa');

-- Couples. DE1/DE2 is stored as (DE1, DE2): looking it up from DE2 exercises the
-- reverse direction. DE13 has two spouses; the principal one (DE15) has the HIGHER
-- relation id, so the tie-break must pick es_principal over the lowest id.
INSERT INTO public.relaciones_usuarios (id, usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  ('e5000000-0000-4000-8000-0000000000c1', 'e5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000004', 'conyuge', true),
  ('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000007', 'conyuge', true),
  ('e5000000-0000-4000-8000-0000000000c3', 'e5000000-0000-4000-8000-000000000008', 'e5000000-0000-4000-8000-000000000009', 'conyuge', true),
  ('e5000000-0000-4000-8000-0000000000c4', 'e5000000-0000-4000-8000-000000000010', 'e5000000-0000-4000-8000-000000000011', 'conyuge', false),
  ('e5000000-0000-4000-8000-0000000000c5', 'e5000000-0000-4000-8000-000000000012', 'e5000000-0000-4000-8000-000000000010', 'conyuge', true);

-- Cases ----------------------------------------------------------------------

-- 1. conyuge_director_etapa_id.
SELECT pg_temp.assert_eq('helper: couple, first spouse finds the second',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b1')$q$, 'b2');
SELECT pg_temp.assert_eq('helper: couple, reverse direction finds the first',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b2')$q$, 'b1');
SELECT pg_temp.assert_eq('helper: single director has no spouse',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b3')$q$, 'none');
SELECT pg_temp.assert_eq('helper: spouse directing another segment is not a match',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b4')$q$, 'none');
SELECT pg_temp.assert_eq('helper: the other segment director does not match back either',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b5')$q$, 'none');
SELECT pg_temp.assert_eq('helper: spouse who is not a director is not a match',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b6')$q$, 'none');
SELECT pg_temp.assert_eq('helper: several spouses, es_principal wins over the lowest relation id',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000b7')$q$, 'b9');
SELECT pg_temp.assert_eq('helper: unknown id returns NULL',
  $q$SELECT pg_temp.spouse_tag('e5000000-0000-4000-8000-0000000000ee')$q$, 'none');
SELECT pg_temp.assert_eq('helper: NULL argument returns NULL',
  $q$SELECT pg_temp.spouse_tag(NULL)$q$, 'none');
SELECT pg_temp.assert_eq('helper: anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.conyuge_director_etapa_id(uuid)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('helper: authenticated cannot execute',
  $q$SELECT has_function_privilege('authenticated', 'public.conyuge_director_etapa_id(uuid)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('helper: service_role can execute',
  $q$SELECT has_function_privilege('service_role', 'public.conyuge_director_etapa_id(uuid)', 'EXECUTE')::text$q$, 'true');
SELECT pg_temp.assert_eq('helper: stable, security invoker, fixed search_path',
  $q$SELECT p.provolatile::text || p.prosecdef::text || coalesce(p.proconfig::text, '')
       FROM pg_proc p WHERE p.oid = 'public.conyuge_director_etapa_id(uuid)'::regprocedure$q$, 'sfalse{search_path=public}');

-- 2. crear_grupo_con_director.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('create: couple director creates the group',
  $q$SELECT (pg_temp.create_as('ZZ Dp c1', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b1') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('create: couple director links both spouses',
  $q$SELECT pg_temp.director_of('ZZ Dp c1')$q$, 'b1,b2');
SELECT pg_temp.assert_eq('create: naming the other spouse links both too',
  $q$SELECT (pg_temp.create_as('ZZ Dp c2', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b2') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('create: reverse direction links both spouses',
  $q$SELECT pg_temp.director_of('ZZ Dp c2')$q$, 'b1,b2');
SELECT pg_temp.assert_eq('create: single director creates the group',
  $q$SELECT (pg_temp.create_as('ZZ Dp c3', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b3') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('create: single director links one row',
  $q$SELECT pg_temp.director_of('ZZ Dp c3')$q$, 'b3');
SELECT pg_temp.assert_eq('create: spouse who directs another segment is not linked',
  $q$SELECT (pg_temp.create_as('ZZ Dp c4', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b4') ~ '^[0-9a-f-]{36}$')::text || pg_temp.director_of('ZZ Dp c4')$q$, 'trueb4');
SELECT pg_temp.assert_eq('create: spouse who is not a director is not linked',
  $q$SELECT (pg_temp.create_as('ZZ Dp c5', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b6') ~ '^[0-9a-f-]{36}$')::text || pg_temp.director_of('ZZ Dp c5')$q$, 'trueb6');
SELECT pg_temp.assert_eq('create: a director of another segment is still refused with 22023 and no group',
  $q$SELECT pg_temp.create_as('ZZ Dp c6', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b5') || pg_temp.groups_named('ZZ Dp c6')$q$, 'ERR:22023' || '0');

-- A director de etapa creator is always the director, and brings the spouse.
SELECT pg_temp.as_user(pg_temp.a('DE1'));
SELECT pg_temp.assert_eq('create: director de etapa of a couple creates the group',
  $q$SELECT (pg_temp.create_as('ZZ Dp c7', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b3') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('create: the creator is forced as director and the spouse comes along, whatever the argument says',
  $q$SELECT pg_temp.director_of('ZZ Dp c7')$q$, 'b1,b2');
SELECT pg_temp.assert_eq('create: director de etapa still cannot create in a segment they do not direct',
  $q$SELECT pg_temp.create_as('ZZ Dp c8', 'e5000000-0000-4000-8000-0000000000a2', 'e5000000-0000-4000-8000-0000000000b5') || pg_temp.groups_named('ZZ Dp c8')$q$, 'ERR:42501' || '0');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('create: lider is still refused',
  $q$SELECT pg_temp.create_as('ZZ Dp c9', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-0000000000b1') || pg_temp.groups_named('ZZ Dp c9')$q$, 'ERR:42501' || '0');

SELECT pg_temp.assert_eq('create: anon cannot execute, authenticated and service_role can',
  $q$SELECT has_function_privilege('anon', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE')::text
        || has_function_privilege('authenticated', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE')::text
        || has_function_privilege('service_role', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE')::text$q$, 'falsetruetrue');
SELECT pg_temp.assert_eq('create: security definer with a fixed search_path',
  $q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '')
       FROM pg_proc p WHERE p.oid = 'public.crear_grupo_con_director(text,uuid,uuid,uuid)'::regprocedure$q$, 'true{search_path=public}');

-- Real role: as `authenticated` (what PostgREST does), crear_grupo_con_director
-- still links the spouse although authenticated cannot execute the helper, and a
-- direct helper call is refused. Results travel in GUCs because pg_temp objects
-- are not usable under the switched role; the link count is read after RESET ROLE.
SELECT set_config('t.temporada', (SELECT id::text FROM public.temporadas WHERE activa LIMIT 1), true);
SELECT set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000103","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000103', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $r$
BEGIN
  PERFORM set_config('t.rl_role', current_user::text, true);
  PERFORM set_config('t.rl_gid', public.crear_grupo_con_director('ZZ Dp rol', current_setting('t.temporada')::uuid, 'e5000000-0000-4000-8000-0000000000a1'::uuid, 'e5000000-0000-4000-8000-0000000000b1'::uuid)::text, true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.rl_gid', 'ERR:' || SQLSTATE || ' ' || SQLERRM, true);
END $r$;
DO $r$
BEGIN
  PERFORM public.conyuge_director_etapa_id('e5000000-0000-4000-8000-0000000000b1'::uuid);
  PERFORM set_config('t.rl_helper', 'CALLED', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.rl_helper', 'ERR:' || SQLSTATE, true);
END $r$;
RESET ROLE;
SELECT pg_temp.assert_eq('role: the call really ran as authenticated',
  $q$SELECT current_setting('t.rl_role')$q$, 'authenticated');
SELECT pg_temp.assert_eq('role: authenticated creates the group through the RPC',
  $q$SELECT (current_setting('t.rl_gid') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('role: both spouses are linked although authenticated cannot execute the helper',
  $q$SELECT pg_temp.director_of('ZZ Dp rol')$q$, 'b1,b2');
SELECT pg_temp.assert_eq('role: a direct helper call as authenticated is refused with 42501',
  $q$SELECT current_setting('t.rl_helper')$q$, 'ERR:42501');

-- Result: the failing cases (empty = all ok).
SELECT case_name AS failing_cases FROM t_dp_failures ORDER BY case_name;

ROLLBACK;
