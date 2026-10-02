-- T1 (odd/tasks/grupos-director-obligatorio.md) — a group is born with its director.
--
-- Covers:
--   1. puede_crear_grupo: admin and pastor unchanged, director de etapa unchanged
--      (own segment only), director general only in segments assigned in
--      director_general_segmentos, lider refused.
--   2. crear_grupo_con_director: creates the group and its director_etapa_grupos
--      row together; a director of another segment or a missing director aborts
--      everything (no group left behind); a director de etapa always becomes the
--      director of the group they create; a general director needs the segment
--      assigned; lider and anonymous callers are refused; anon has no EXECUTE.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e4000000-... namespace and every fixture person has
-- nombre 'ZZ Gd'. The last statement is a SELECT of the failing cases (empty =
-- all ok), because the MCP tool returns only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_gd_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_gd_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a statement and returns 'OK', or 'ERR:<sqlstate>' when it raises. The
-- EXCEPTION block rolls back only that statement, so the test goes on.
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

CREATE OR REPLACE FUNCTION pg_temp.as_nobody()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Gd' AND apellido = p_tag;
$$;

-- Number of fixture groups with this name.
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

-- Calls the RPC as the current simulated identity.
CREATE OR REPLACE FUNCTION pg_temp.create_as(p_name text, p_segmento uuid, p_director uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.outcome(format(
    'SELECT (public.crear_grupo_con_director(%L, (SELECT id FROM public.temporadas WHERE activa LIMIT 1), %L, %L))::text',
    p_name, p_segmento, p_director)) ;
$$;

-- puede_crear_grupo only answers for the session's own identity, so the helper
-- signs in as the person it asks about.
CREATE OR REPLACE FUNCTION pg_temp.can(p_tag text, p_segmento uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_crear_grupo(pg_temp.a(p_tag), p_segmento)::text;
END;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('e4000000-0000-4000-8000-0000000000a1', 'ZZ Gd S1'),
  ('e4000000-0000-4000-8000-0000000000a2', 'ZZ Gd S2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e4000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzgd-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzgd-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzgd-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzgd-dgx@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzgd-de1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'zzgd-de2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'zzgd-deo@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000108', 'authenticated', 'authenticated', 'zzgd-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- ADM admin, PAS pastor, DG general director with S1 assigned, DGX general
-- director WITHOUT any segment, DE1 and DE2 directores de etapa of S1, DEO
-- director de etapa of S2 only, LID lider.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e4000000-0000-4000-8000-000000000001', 'ZZ Gd', 'ADM', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000101'),
  ('e4000000-0000-4000-8000-000000000002', 'ZZ Gd', 'PAS', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000102'),
  ('e4000000-0000-4000-8000-000000000003', 'ZZ Gd', 'DG',  'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000103'),
  ('e4000000-0000-4000-8000-000000000004', 'ZZ Gd', 'DGX', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000104'),
  ('e4000000-0000-4000-8000-000000000005', 'ZZ Gd', 'DE1', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000105'),
  ('e4000000-0000-4000-8000-000000000006', 'ZZ Gd', 'DE2', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000106'),
  ('e4000000-0000-4000-8000-000000000007', 'ZZ Gd', 'DEO', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000107'),
  ('e4000000-0000-4000-8000-000000000008', 'ZZ Gd', 'LID', 'Otro', 'Soltero', 'e4000000-0000-4000-8000-000000000108');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e4000000-0000-4000-8000-000000000001', 'admin'),
    ('e4000000-0000-4000-8000-000000000002', 'pastor'),
    ('e4000000-0000-4000-8000-000000000003', 'director-general'),
    ('e4000000-0000-4000-8000-000000000004', 'director-general'),
    ('e4000000-0000-4000-8000-000000000005', 'director-etapa'),
    ('e4000000-0000-4000-8000-000000000006', 'director-etapa'),
    ('e4000000-0000-4000-8000-000000000007', 'director-etapa'),
    ('e4000000-0000-4000-8000-000000000008', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('e4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-0000000000a1', 'segmento');

-- Ids end in b1 (DE1 in S1), b2 (DE2 in S1), b3 (DEO in S2), b4 (a lider row, not a director).
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e4000000-0000-4000-8000-0000000000b1', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-000000000005', 'director_etapa'),
  ('e4000000-0000-4000-8000-0000000000b2', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-000000000006', 'director_etapa'),
  ('e4000000-0000-4000-8000-0000000000b3', 'e4000000-0000-4000-8000-0000000000a2', 'e4000000-0000-4000-8000-000000000007', 'director_etapa');

-- Cases ----------------------------------------------------------------------

-- 1. puede_crear_grupo (S1 = ...a1, S2 = ...a2).
SELECT pg_temp.assert_eq('can: admin creates in any segment',
  $q$SELECT pg_temp.can('ADM', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('ADM', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'truetrue');
SELECT pg_temp.assert_eq('can: pastor creates in any segment',
  $q$SELECT pg_temp.can('PAS', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('PAS', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'truetrue');
SELECT pg_temp.assert_eq('can: director de etapa creates only in the segment they direct',
  $q$SELECT pg_temp.can('DE1', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('DE1', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'truefalse');
SELECT pg_temp.assert_eq('can: director de etapa of the other segment',
  $q$SELECT pg_temp.can('DEO', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('DEO', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'falsetrue');
SELECT pg_temp.assert_eq('can: general director creates in the segment assigned, not in the other',
  $q$SELECT pg_temp.can('DG', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('DG', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'truefalse');
SELECT pg_temp.assert_eq('can: general director without assignments creates nowhere',
  $q$SELECT pg_temp.can('DGX', 'e4000000-0000-4000-8000-0000000000a1') || pg_temp.can('DGX', 'e4000000-0000-4000-8000-0000000000a2')$q$, 'falsefalse');
SELECT pg_temp.assert_eq('can: lider creates nowhere',
  $q$SELECT pg_temp.can('LID', 'e4000000-0000-4000-8000-0000000000a1')$q$, 'false');

-- 2. crear_grupo_con_director.
-- Admin with a director of the segment: group and link exist together.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('rpc: admin creates the group with its director',
  $q$SELECT (pg_temp.create_as('ZZ Gd c1', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b2') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('rpc: admin group exists once',
  $q$SELECT pg_temp.groups_named('ZZ Gd c1')$q$, '1');
SELECT pg_temp.assert_eq('rpc: admin group is linked to the chosen director',
  $q$SELECT pg_temp.director_of('ZZ Gd c1')$q$, 'b2');
SELECT pg_temp.assert_eq('rpc: admin group is active in the segment, like crear_grupo',
  $q$SELECT g.activo::text || g.segmento_id::text FROM public.grupos g WHERE g.nombre = 'ZZ Gd c1'$q$,
  'truee4000000-0000-4000-8000-0000000000a1');

-- Director of another segment: 22023 and no group.
SELECT pg_temp.assert_eq('rpc: a director of another segment is refused with 22023',
  $q$SELECT pg_temp.create_as('ZZ Gd c2', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b3')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('rpc: no group is left behind by a director of another segment',
  $q$SELECT pg_temp.groups_named('ZZ Gd c2')$q$, '0');

-- Nonexistent director: error and no group.
SELECT pg_temp.assert_eq('rpc: a nonexistent director is refused with 22023',
  $q$SELECT pg_temp.create_as('ZZ Gd c3', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000ee')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('rpc: no group is left behind by a nonexistent director',
  $q$SELECT pg_temp.groups_named('ZZ Gd c3')$q$, '0');
SELECT pg_temp.assert_eq('rpc: a null director is refused and leaves no group',
  $q$SELECT pg_temp.create_as('ZZ Gd c3n', 'e4000000-0000-4000-8000-0000000000a1', NULL) || pg_temp.groups_named('ZZ Gd c3n')$q$, 'ERR:22023' || '0');

-- Pastor works the same way.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('rpc: pastor creates the group with its director',
  $q$SELECT (pg_temp.create_as('ZZ Gd c4', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b1') ~ '^[0-9a-f-]{36}$')::text || pg_temp.director_of('ZZ Gd c4')$q$, 'trueb1');

-- Director de etapa becomes the director of the group, whatever the argument says.
SELECT pg_temp.as_user(pg_temp.a('DE1'));
SELECT pg_temp.assert_eq('rpc: director de etapa creates the group',
  $q$SELECT (pg_temp.create_as('ZZ Gd c5', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b2') ~ '^[0-9a-f-]{36}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('rpc: director de etapa is the director even when the argument names somebody else',
  $q$SELECT pg_temp.director_of('ZZ Gd c5')$q$, 'b1');
SELECT pg_temp.assert_eq('rpc: director de etapa with a null argument is the director',
  $q$SELECT (pg_temp.create_as('ZZ Gd c5n', 'e4000000-0000-4000-8000-0000000000a1', NULL) ~ '^[0-9a-f-]{36}$')::text || pg_temp.director_of('ZZ Gd c5n')$q$, 'trueb1');
SELECT pg_temp.assert_eq('rpc: director de etapa cannot create in a segment they do not direct',
  $q$SELECT pg_temp.create_as('ZZ Gd c6', 'e4000000-0000-4000-8000-0000000000a2', 'e4000000-0000-4000-8000-0000000000b3') || pg_temp.groups_named('ZZ Gd c6')$q$, 'ERR:42501' || '0');

-- Director de etapa with no segmento_lideres row for the segment: refused.
SELECT pg_temp.as_user(pg_temp.a('DEO'));
SELECT pg_temp.assert_eq('rpc: director de etapa without a row in that segment is refused',
  $q$SELECT pg_temp.create_as('ZZ Gd c7', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b1') || pg_temp.groups_named('ZZ Gd c7')$q$, 'ERR:42501' || '0');

-- General director.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('rpc: general director with the segment assigned creates the group',
  $q$SELECT (pg_temp.create_as('ZZ Gd c8', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b2') ~ '^[0-9a-f-]{36}$')::text || pg_temp.director_of('ZZ Gd c8')$q$, 'trueb2');
SELECT pg_temp.assert_eq('rpc: general director cannot create in a segment not assigned',
  $q$SELECT pg_temp.create_as('ZZ Gd c9', 'e4000000-0000-4000-8000-0000000000a2', 'e4000000-0000-4000-8000-0000000000b3') || pg_temp.groups_named('ZZ Gd c9')$q$, 'ERR:42501' || '0');
SELECT pg_temp.as_user(pg_temp.a('DGX'));
SELECT pg_temp.assert_eq('rpc: general director without assignments is refused with 42501 and no group',
  $q$SELECT pg_temp.create_as('ZZ Gd c10', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b1') || pg_temp.groups_named('ZZ Gd c10')$q$, 'ERR:42501' || '0');

-- Lider.
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('rpc: lider is refused and no group is created',
  $q$SELECT pg_temp.create_as('ZZ Gd c11', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b1') || pg_temp.groups_named('ZZ Gd c11')$q$, 'ERR:42501' || '0');

-- Without a session.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('rpc: no session is refused with 28000 and no group',
  $q$SELECT pg_temp.create_as('ZZ Gd c12', 'e4000000-0000-4000-8000-0000000000a1', 'e4000000-0000-4000-8000-0000000000b1') || pg_temp.groups_named('ZZ Gd c12')$q$, 'ERR:28000' || '0');

-- Privileges and metadata.
SELECT pg_temp.assert_eq('rpc: anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('rpc: authenticated and service_role can execute',
  $q$SELECT (has_function_privilege('authenticated', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE')
         AND has_function_privilege('service_role', 'public.crear_grupo_con_director(text,uuid,uuid,uuid)', 'EXECUTE'))::text$q$, 'true');
SELECT pg_temp.assert_eq('rpc: security definer with a fixed search_path',
  $q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '')
       FROM pg_proc p WHERE p.oid = 'public.crear_grupo_con_director(text,uuid,uuid,uuid)'::regprocedure$q$, 'true{search_path=public}');

-- Result: the failing cases (empty = all ok).
SELECT case_name AS failing_cases FROM t_gd_failures ORDER BY case_name;

ROLLBACK;
