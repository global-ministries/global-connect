-- Usuarios campus scope (20261029200000_usuarios_alcance_campus.sql) — every
-- person sees only their campus; admin is the only global role.
--
-- Covers:
--   1. List (listar_usuarios_con_permisos): admin sees every campus and the
--      people with no campus; pastor, director general and director de etapa
--      see only their campus; a lider with p_contexto_relacion sees their
--      campus (plus their own group scope); lider and miembro keep their
--      narrower scope, cross-campus people included.
--   2. p_campus_id narrows the list for every role; a non-admin passing a
--      campus outside their own gets nobody.
--   3. The list total_count equals the statistics total for the same inputs.
--   4. Statistics (obtener_estadisticas_usuarios_con_permisos): same scope and
--      campus rule.
--   5. puede_ver_usuario_ficha: the campus decides for pastor and directors.
--   6. Profile (obtener_detalle_usuario) follows the ficha rule.
--   7. Family relations (puede_ver_relacion_familiar) follow the ficha rule.
--   8. A pastor with no campus sees nobody.
--   9. Identity and privileges are unchanged.
--  10. A person with several roles gets the scope of the highest one.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e4000000-... namespace and every fixture person has
-- nombre starting with 'ZZ Ac'. The last statement is a SELECT of the failing
-- cases (empty = all ok), because the MCP tool returns only the last
-- result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ac_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ac_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a query and returns its first value, or 'ERR:<sqlstate>' when it raises.
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

-- Identity simulation. The functions under test are SECURITY DEFINER, so the
-- session role stays postgres and only the JWT settings change.
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

CREATE OR REPLACE FUNCTION pg_temp.as_service()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'service_role', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user_json(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_auth)::text, true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

-- Fixture lookups by surname tag.
CREATE OR REPLACE FUNCTION pg_temp.u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre LIKE 'ZZ Ac%' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre LIKE 'ZZ Ac%' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.campus(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_tag
           WHEN 'A' THEN 'e4000000-0000-4000-8000-0000000000ca'::uuid
           WHEN 'B' THEN 'e4000000-0000-4000-8000-0000000000cb'::uuid
         END;
$$;

-- What a list call returns: the distinct fixture surnames, then how many
-- distinct non-fixture people came back ("tags|others").
CREATE OR REPLACE FUNCTION pg_temp.seen(p_auth uuid, p_ctx boolean DEFAULT false, p_campus uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT r.apellido, ',' ORDER BY r.apellido) FILTER (WHERE r.nombre LIKE 'ZZ Ac%'), '')
         || '|' || count(DISTINCT r.id) FILTER (WHERE r.nombre NOT LIKE 'ZZ Ac%')
    FROM public.listar_usuarios_con_permisos(p_auth, '', '{}', NULL, NULL, NULL, 5000, 0, p_ctx, p_campus) r;
$$;

-- Only the fixture surnames of a list call (for admin, whose others vary).
CREATE OR REPLACE FUNCTION pg_temp.tags(p_auth uuid, p_ctx boolean DEFAULT false, p_campus uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT split_part(pg_temp.seen(p_auth, p_ctx, p_campus), '|', 1);
$$;

-- Expected "tags|0" for a set of tags, sorted the same way as pg_temp.seen.
CREATE OR REPLACE FUNCTION pg_temp.expect(VARIADIC p_tags text[])
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(t, ',' ORDER BY t) FROM unnest(p_tags) t), '') || '|0';
$$;

-- Number of rows a list call returns.
CREATE OR REPLACE FUNCTION pg_temp.rows(p_auth uuid, p_campus uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text
    FROM public.listar_usuarios_con_permisos(p_auth, '', '{}', NULL, NULL, NULL, 5000, 0, false, p_campus) r;
$$;

-- total_count of a list call (0 when no row comes back).
CREATE OR REPLACE FUNCTION pg_temp.list_total(p_auth uuid, p_busqueda text DEFAULT '', p_campus uuid DEFAULT NULL)
RETURNS bigint LANGUAGE sql AS $$
  SELECT coalesce(max(r.total_count), 0)
    FROM public.listar_usuarios_con_permisos(p_auth, p_busqueda, '{}', NULL, NULL, NULL, 1, 0, false, p_campus) r;
$$;

-- What a statistics call returns: "total|con_email|con_telefono|registrados_hoy".
CREATE OR REPLACE FUNCTION pg_temp.stats(p_auth uuid, p_busqueda text DEFAULT '', p_campus uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT s.total_usuarios || '|' || s.con_email || '|' || s.con_telefono || '|' || s.registrados_hoy
    FROM public.obtener_estadisticas_usuarios_con_permisos(p_auth, p_busqueda, '{}', NULL, NULL, NULL, p_campus) s;
$$;

CREATE OR REPLACE FUNCTION pg_temp.stats_total(p_auth uuid, p_busqueda text DEFAULT '', p_campus uuid DEFAULT NULL)
RETURNS bigint LANGUAGE sql AS $$
  SELECT s.total_usuarios
    FROM public.obtener_estadisticas_usuarios_con_permisos(p_auth, p_busqueda, '{}', NULL, NULL, NULL, p_campus) s;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e4000000-0000-4000-8000-0000000000ca', 'ZZ Ac Campus A', 'ZZACA'),
  ('e4000000-0000-4000-8000-0000000000cb', 'ZZ Ac Campus B', 'ZZACB');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e4000000-0000-4000-8000-0000000000a1', 'ZZ Ac S1');

INSERT INTO public.familias (id, nombre) VALUES
  ('e4000000-0000-4000-8000-0000000000f1', 'ZZ Ac familia');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e4000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzac-auth-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzac-auth-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzac-auth-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzac-auth-de@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzac-auth-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'zzac-auth-mem@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e4000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'zzac-auth-pnc@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- People. Surnames are the tags the assertions read.
--   Campus A: ADM admin, PAS pastor, DG director general, DE director de etapa,
--     LID lider of G1, MEM miembro (family with FAM, related to REL), M1 member
--     of G1, FAM, PA1, PA2.
--   Campus B: MB member of G1, REL related to MEM, PB1.
--   No campus: NOC, and PNC (a pastor with no campus).
-- Emails: M1 (A), PB1 (B). Phones: PA1 (A), MB (B).
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, email, telefono, cedula, auth_id, familia_id) VALUES
  ('e4000000-0000-4000-8000-000000000001', 'ZZ Ac', 'ADM', 'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000101', NULL),
  ('e4000000-0000-4000-8000-000000000002', 'ZZ Ac', 'PAS', 'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000102', NULL),
  ('e4000000-0000-4000-8000-000000000003', 'ZZ Ac', 'DG',  'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000103', NULL),
  ('e4000000-0000-4000-8000-000000000004', 'ZZ Ac', 'DE',  'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000104', NULL),
  ('e4000000-0000-4000-8000-000000000005', 'ZZ Ac', 'LID', 'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000105', NULL),
  ('e4000000-0000-4000-8000-000000000006', 'ZZ Ac', 'MEM', 'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000106', 'e4000000-0000-4000-8000-0000000000f1'),
  ('e4000000-0000-4000-8000-000000000007', 'ZZ Ac', 'M1',  'Otro', 'Soltero', 'zzac-m1@example.test', NULL, NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000008', 'ZZ Ac', 'FAM', 'Otro', 'Soltero', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-0000000000f1'),
  ('e4000000-0000-4000-8000-000000000009', 'ZZ Ac', 'PA1', 'Otro', 'Soltero', NULL, '04140000001', NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000010', 'ZZ Ac', 'PA2', 'Otro', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000011', 'ZZ Ac', 'MB',  'Otro', 'Soltero', NULL, '04140000002', NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000012', 'ZZ Ac', 'REL', 'Otro', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000013', 'ZZ Ac', 'PB1', 'Otro', 'Soltero', 'zzac-pb1@example.test', NULL, NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000014', 'ZZ Ac', 'NOC', 'Otro', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e4000000-0000-4000-8000-000000000015', 'ZZ Ac', 'PNC', 'Otro', 'Soltero', NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000107', NULL);

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT v.usuario_id::uuid, v.campus_id::uuid, true
  FROM (VALUES
    ('e4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000005', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000006', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000007', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000008', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000009', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000010', 'e4000000-0000-4000-8000-0000000000ca'),
    ('e4000000-0000-4000-8000-000000000011', 'e4000000-0000-4000-8000-0000000000cb'),
    ('e4000000-0000-4000-8000-000000000012', 'e4000000-0000-4000-8000-0000000000cb'),
    ('e4000000-0000-4000-8000-000000000013', 'e4000000-0000-4000-8000-0000000000cb')
  ) v(usuario_id, campus_id);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e4000000-0000-4000-8000-000000000001', 'admin'),
    ('e4000000-0000-4000-8000-000000000002', 'pastor'),
    ('e4000000-0000-4000-8000-000000000003', 'director-general'),
    ('e4000000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e4000000-0000-4000-8000-000000000005', 'lider'),
    ('e4000000-0000-4000-8000-000000000006', 'miembro'),
    ('e4000000-0000-4000-8000-000000000015', 'pastor')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

-- G1 (campus-less group) led by LID, with M1 (A) and MB (B).
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e4000000-0000-4000-8000-0000000000c1', 'ZZ Ac G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e4000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e4000000-0000-4000-8000-0000000000c1', 'e4000000-0000-4000-8000-000000000005', 'Líder',   'activo', NULL),
  ('e4000000-0000-4000-8000-0000000000c1', 'e4000000-0000-4000-8000-000000000007', 'Miembro', 'activo', NULL),
  ('e4000000-0000-4000-8000-0000000000c1', 'e4000000-0000-4000-8000-000000000011', 'Miembro', 'activo', NULL);

-- MEM (A) is related to REL (B).
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('e4000000-0000-4000-8000-000000000006', 'e4000000-0000-4000-8000-000000000012', 'otro_familiar');

-- Expected campus A list for a campus-scoped caller.
CREATE OR REPLACE FUNCTION pg_temp.campus_a()
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.expect('ADM', 'PAS', 'DG', 'DE', 'LID', 'MEM', 'M1', 'FAM', 'PA1', 'PA2');
$$;

-- Cases ----------------------------------------------------------------------

-- 1. List.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('list: admin sees the fixtures of every campus and with no campus',
  $q$SELECT pg_temp.tags(pg_temp.a('ADM'))$q$,
  split_part(pg_temp.expect('ADM', 'PAS', 'DG', 'DE', 'LID', 'MEM', 'M1', 'FAM', 'PA1', 'PA2', 'MB', 'REL', 'PB1', 'NOC', 'PNC'), '|', 1));
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('list: pastor A sees only campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('PAS'))$q$, pg_temp.campus_a());
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('list: director general A sees only campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('DG'))$q$, pg_temp.campus_a());
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('list: director de etapa A sees only campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('DE'))$q$, pg_temp.campus_a());
-- The relationship context widens the lider to their campus; it keeps the
-- members of their own group (MB) and never reaches PB1, REL or NOC.
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('list: lider with contexto relacion sees campus A plus their group',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'), true)$q$,
  pg_temp.expect('ADM', 'PAS', 'DG', 'DE', 'LID', 'MEM', 'M1', 'FAM', 'PA1', 'PA2', 'MB'));
SELECT pg_temp.assert_eq('list: lider keeps their group, the member of another campus included',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'))$q$, pg_temp.expect('LID', 'M1', 'MB'));
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('list: miembro keeps family, relationships (other campus) and self',
  $q$SELECT pg_temp.seen(pg_temp.a('MEM'))$q$, pg_temp.expect('FAM', 'MEM', 'REL'));

-- 2. p_campus_id.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('list campus: admin with A sees only campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('ADM'), false, pg_temp.campus('A'))$q$, pg_temp.campus_a());
SELECT pg_temp.assert_eq('list campus: admin with B sees only campus B',
  $q$SELECT pg_temp.seen(pg_temp.a('ADM'), false, pg_temp.campus('B'))$q$, pg_temp.expect('MB', 'REL', 'PB1'));
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('list campus: pastor A with A sees campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('PAS'), false, pg_temp.campus('A'))$q$, pg_temp.campus_a());
SELECT pg_temp.assert_eq('list campus: pastor A with B gets no rows',
  $q$SELECT pg_temp.rows(pg_temp.a('PAS'), pg_temp.campus('B'))$q$, '0');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('list campus: lider with a campus outside their own gets no rows',
  $q$SELECT pg_temp.rows(pg_temp.a('LID'), pg_temp.campus('B'))$q$, '0');

SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('list campus: director general A with B gets no rows',
  $q$SELECT pg_temp.rows(pg_temp.a('DG'), pg_temp.campus('B'))$q$, '0');
SELECT pg_temp.assert_eq('stats campus: director general A with B counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('DG'), 'ZZ Ac', pg_temp.campus('B'))$q$, '0|0|0|0');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('list campus: miembro with A drops the relative of campus B',
  $q$SELECT pg_temp.seen(pg_temp.a('MEM'), false, pg_temp.campus('A'))$q$, pg_temp.expect('FAM', 'MEM'));
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('list campus: lider with A drops the group member of campus B',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'), false, pg_temp.campus('A'))$q$, pg_temp.expect('LID', 'M1'));

-- 3. The list total equals the statistics total.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('total: pastor list total equals stats total',
  $q$SELECT pg_temp.list_total(pg_temp.a('PAS')) || '=' || pg_temp.stats_total(pg_temp.a('PAS'))$q$, '10=10');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('total: admin list total equals stats total',
  $q$SELECT (pg_temp.list_total(pg_temp.a('ADM')) = pg_temp.stats_total(pg_temp.a('ADM')))::text$q$, 'true');
SELECT pg_temp.assert_eq('total: admin with campus A, list total equals stats total',
  $q$SELECT pg_temp.list_total(pg_temp.a('ADM'), '', pg_temp.campus('A')) || '=' || pg_temp.stats_total(pg_temp.a('ADM'), '', pg_temp.campus('A'))$q$, '10=10');

-- 4. Statistics. Searching 'ZZ Ac' isolates the fixtures. Campus A: 10 people,
--    one email (M1), one phone (PA1). Everybody: 15, two emails, two phones.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('stats: pastor A counts only campus A',
  $q$SELECT pg_temp.stats(pg_temp.a('PAS'), 'ZZ Ac')$q$, '10|1|1|10');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('stats: admin counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Ac')$q$, '15|2|2|15');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('stats: pastor A with campus B counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('PAS'), 'ZZ Ac', pg_temp.campus('B'))$q$, '0|0|0|0');

-- 5. puede_ver_usuario_ficha.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('ficha: pastor A, person of campus A',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('PAS'), pg_temp.u('PA1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: pastor A, person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('PAS'), pg_temp.u('PB1'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: pastor A, person with no campus',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('PAS'), pg_temp.u('NOC'))$$)$q$, 'false');
-- Since 20261031100000 the pastor's EDIT right follows the campus too.
SELECT pg_temp.assert_eq('edit: pastor A cannot edit a person of campus B (20261031100000)',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_editar_usuario(pg_temp.a('PAS'), pg_temp.u('PB1'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: pastor, themself',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('PAS'), pg_temp.u('PAS'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('ficha: director general A, person of campus A',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DG'), pg_temp.u('PA1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: director general A, person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DG'), pg_temp.u('PB1'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: director general A, person with no campus',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DG'), pg_temp.u('NOC'))$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('ficha: director de etapa A, person of campus A',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DE'), pg_temp.u('PA1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: director de etapa A, person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DE'), pg_temp.u('PB1'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: director de etapa A, person with no campus',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DE'), pg_temp.u('NOC'))$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('ficha: admin, person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('ADM'), pg_temp.u('PB1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: admin, person with no campus',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('ADM'), pg_temp.u('NOC'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('ficha: lider, member of their group (edit rule)',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), pg_temp.u('M1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: lider, person of campus B outside their group',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), pg_temp.u('PB1'))$$)$q$, 'false');

-- 6. Profile.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('profile: pastor A opens a person of campus A',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('PA1'))->>'apellido'$$)$q$, 'PA1');
SELECT pg_temp.assert_eq('profile: pastor A cannot open a person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('PB1'))->>'apellido'$$)$q$, 'ERR:42501');

-- 7. Family relations.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('family: pastor A cannot see a relation with a person of campus B',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('PAS'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('family: admin sees the relation across campuses',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('ADM'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'true');

-- 8. A pastor with no campus.
SELECT pg_temp.as_user(pg_temp.a('PNC'));
SELECT pg_temp.assert_eq('no campus: pastor with no campus lists nobody',
  $q$SELECT pg_temp.seen(pg_temp.a('PNC'))$q$, '|0');
SELECT pg_temp.assert_eq('no campus: pastor with no campus counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('PNC'))$q$, '0|0|0|0');

-- 9. Identity and privileges (PRESERVE).
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('identity: another person''s auth id returns no rows',
  $q$SELECT pg_temp.rows(pg_temp.a('ADM'))$q$, '0');
SELECT pg_temp.as_user_json(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('identity: JSON-only claims cannot pass another auth id',
  $q$SELECT pg_temp.rows(pg_temp.a('ADM'))$q$, '0');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('identity: no session returns no rows',
  $q$SELECT pg_temp.rows(pg_temp.a('ADM'))$q$, '0');
SELECT pg_temp.assert_eq('identity: no session counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Ac')$q$, '0|0|0|0');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('identity: service_role can act for pastor A (campus scope applies)',
  $q$SELECT pg_temp.seen(pg_temp.a('PAS'))$q$, pg_temp.campus_a());
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('privileges: anon cannot execute the list',
  $q$SELECT has_function_privilege('anon', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('privileges: anon cannot execute the statistics',
  $q$SELECT has_function_privilege('anon', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('privileges: anon cannot execute the ficha gate',
  $q$SELECT has_function_privilege('anon', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('privileges: authenticated can execute the three functions',
  $q$SELECT (has_function_privilege('authenticated', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')
         AND has_function_privilege('authenticated', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')
         AND has_function_privilege('authenticated', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('privileges: service_role can execute the three functions',
  $q$SELECT (has_function_privilege('service_role', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')
         AND has_function_privilege('service_role', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')
         AND has_function_privilege('service_role', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('privileges: PUBLIC cannot execute any of the three functions',
  $q$SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid IN ('public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)'::regprocedure,
                      'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)'::regprocedure,
                      'public.puede_ver_usuario_ficha(uuid,uuid)'::regprocedure)
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');

-- 10. Highest role wins. LID also becomes director de etapa: the director scope
-- (campus A, without the group member of campus B) applies.
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('LID'), id FROM public.roles_sistema WHERE nombre_interno = 'director-etapa';
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('highest role: director de etapa + lider lists campus A',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'))$q$, pg_temp.campus_a());
SELECT pg_temp.assert_eq('highest role: director de etapa + lider counts campus A',
  $q$SELECT pg_temp.stats(pg_temp.a('LID'), 'ZZ Ac')$q$, '10|1|1|10');

-- 11. A caller with two campuses sees both (still not the people with no campus).
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.u('PAS'), pg_temp.campus('B'), false);
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('two campuses: pastor of A and B sees both',
  $q$SELECT pg_temp.seen(pg_temp.a('PAS'))$q$,
  pg_temp.expect('ADM', 'PAS', 'DG', 'DE', 'LID', 'MEM', 'M1', 'FAM', 'PA1', 'PA2', 'MB', 'REL', 'PB1'));

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_ac_failures;

ROLLBACK;
