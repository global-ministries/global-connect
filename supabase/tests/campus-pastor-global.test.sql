-- Campus rule for the remaining global paths
-- (20261031100000_campus_pastor_global.sql; odd/tasks/campus-pastor.md, T1).
--
-- Covers, with two fixture campuses A and B and a person with no campus:
--   1. usuarios through RLS (role authenticated): admin sees every fixture;
--      pastor and director general of A see campus A only; director de etapa,
--      lider and miembro keep their narrower scope (PRESERVE). The UPDATE
--      policy follows puede_editar_usuario.
--   2. puede_ver_usuario: the campus decides for pastor and director general;
--      self, director de etapa and lider branches unchanged; identity.
--   3. puede_editar_usuario: admin edits anybody; pastor only their campus;
--      lider and director general unchanged; identity.
--   4. puede_gestionar_relacion_familiar: pastor only when both people are of
--      their campus; admin any.
--   5. obtener_reporte_asistencia_usuario: pastor and director general only
--      their campus; admin any; self, lider and relation unchanged.
--   6. obtener_conyugue: pastor and directors only when the person and the
--      spouse are of their campus; admin any; lider unchanged; service_role.
--   7. puede_ver_direccion / puede_editar_direccion and the direcciones
--      SELECT policy: pastor only through a person of their campus; admin any.
--   8. Privileges, definer flag and search_path of every changed function;
--      the photos policy keeps its name, command, roles and permissiveness.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e6000000-0000-4000-9000-... namespace and every
-- fixture person has nombre 'ZZ Cp'. The last statement is a SELECT of the
-- failing cases (empty = all ok), because the MCP tool returns only the last
-- result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cp_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Identity simulation for the definer functions: the session role stays
-- postgres and only the JWT settings change (both claim formats).
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true),
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
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'service_role', true);
$$;

-- Fixture lookups by surname tag.
CREATE OR REPLACE FUNCTION pg_temp.u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ Cp' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Cp' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.dir(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_tag
           WHEN 'DA1' THEN 'e6000000-0000-4000-9000-0000000000d1'::uuid
           WHEN 'DB1' THEN 'e6000000-0000-4000-9000-0000000000d2'::uuid
           WHEN 'DN'  THEN 'e6000000-0000-4000-9000-0000000000d3'::uuid
         END;
$$;

-- Runs p_sql as the tagged person through RLS (role authenticated) and
-- returns its first value, or 'ERR:<sqlstate>'. p_sql must not call pg_temp.
CREATE OR REPLACE FUNCTION pg_temp.rls(p_tag text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_res text;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v_res;
    v_res := coalesce(v_res, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    v_res := 'ERR:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.as_nobody();
  RETURN v_res;
END;
$$;

-- The fixture surnames the tagged person reads from usuarios through RLS.
CREATE OR REPLACE FUNCTION pg_temp.visibles(p_tag text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.rls(p_tag,
    $s$SELECT coalesce(string_agg(apellido, ',' ORDER BY apellido), '') FROM public.usuarios WHERE nombre = 'ZZ Cp'$s$);
$$;

-- How many usuarios rows an UPDATE of telefono touches through RLS.
CREATE OR REPLACE FUNCTION pg_temp.edita(p_tag text, p_target text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.rls(p_tag, format(
    'WITH x AS (UPDATE public.usuarios SET telefono = telefono WHERE id = %L RETURNING 1) SELECT count(*) FROM x',
    pg_temp.u(p_target)));
$$;

-- How many direcciones rows the tagged person reads (0 or 1).
CREATE OR REPLACE FUNCTION pg_temp.ve_dir(p_tag text, p_dir text)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.rls(p_tag, format('SELECT count(*) FROM public.direcciones WHERE id = %L', pg_temp.dir(p_dir)));
$$;

-- A definer predicate called as the tagged person (session role postgres).
CREATE OR REPLACE FUNCTION pg_temp.ver(p_tag text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_ver_usuario(pg_temp.u(p_tag), pg_temp.u(p_target))::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.editar(p_tag text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_editar_usuario(pg_temp.a(p_tag), pg_temp.u(p_target))::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.relacion(p_tag text, p_uno text, p_dos text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_gestionar_relacion_familiar(pg_temp.a(p_tag), pg_temp.u(p_uno), pg_temp.u(p_dos))::text;
END;
$$;

-- 'ok' when the attendance report opens, 'error' when it is refused.
CREATE OR REPLACE FUNCTION pg_temp.reporte(p_tag text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN CASE WHEN public.obtener_reporte_asistencia_usuario(pg_temp.u(p_target), pg_temp.a(p_tag)) ? 'error'
              THEN 'error' ELSE 'ok' END;
END;
$$;

-- The spouse surname obtener_conyugue returns ('none' when no row).
CREATE OR REPLACE FUNCTION pg_temp.conyuge(p_tag text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  IF p_tag = 'service' THEN
    PERFORM pg_temp.as_service();
  ELSE
    PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  END IF;
  SELECT coalesce(string_agg(c.apellido, ','), 'none') INTO v FROM public.obtener_conyugue(pg_temp.u(p_target)) c;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ver_dir(p_tag text, p_dir text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_ver_direccion(pg_temp.dir(p_dir))::text || '/' || public.puede_editar_direccion(pg_temp.dir(p_dir))::text;
END;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e6000000-0000-4000-9000-0000000000ca', 'ZZ Cp Campus A', 'ZZCPA'),
  ('e6000000-0000-4000-9000-0000000000cb', 'ZZ Cp Campus B', 'ZZCPB');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6000000-0000-4000-9000-0000000000a1', 'ZZ Cp S1');

INSERT INTO public.direcciones (id, calle, barrio) VALUES
  ('e6000000-0000-4000-9000-0000000000d1', 'ZZ Cp calle A', 'ZZ Cp'),
  ('e6000000-0000-4000-9000-0000000000d2', 'ZZ Cp calle B', 'ZZ Cp'),
  ('e6000000-0000-4000-9000-0000000000d3', 'ZZ Cp calle N', 'ZZ Cp');

-- People (n, tag, campus, role, has an account). Surnames are the tags.
--   Campus A: ADM admin, PAS pastor, DG director general, DE director de etapa
--     (assigned to G1), LID lider of G1, MEM miembro, PA1 (married to SPA,
--     address DA1), SPA, PA2 (married to XB of campus B).
--   Campus B: PASB pastor, M1 member of G1 (married to SM1), SM1, PB1
--     (married to SPB, address DB1), SPB, XB.
--   No campus: NOC (address DN).
CREATE TEMP TABLE t_cp_people (n int, tag text, campus text, rol text, cuenta boolean) ON COMMIT DROP;
INSERT INTO t_cp_people VALUES
  (1, 'ADM', 'A', 'admin', true), (2, 'PAS', 'A', 'pastor', true),
  (3, 'DG', 'A', 'director-general', true), (4, 'DE', 'A', 'director-etapa', true),
  (5, 'LID', 'A', 'lider', true), (6, 'MEM', 'A', 'miembro', true),
  (7, 'PA1', 'A', NULL, false), (8, 'SPA', 'A', NULL, false), (9, 'PA2', 'A', NULL, false),
  (10, 'PASB', 'B', 'pastor', true), (11, 'M1', 'B', NULL, false), (12, 'SM1', 'B', NULL, false),
  (13, 'PB1', 'B', NULL, false), (14, 'SPB', 'B', NULL, false), (15, 'XB', 'B', NULL, false),
  (16, 'NOC', NULL, NULL, false);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('e6000000-0000-4000-9000-0000000001' || lpad(p.n::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       'zzcp-auth-' || p.n || '@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM t_cp_people p
 WHERE p.cuenta;

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id, direccion_id)
SELECT ('e6000000-0000-4000-9000-0000000000' || lpad(p.n::text, 2, '0'))::uuid, 'ZZ Cp', p.tag, 'Otro', 'Soltero',
       CASE WHEN p.cuenta THEN ('e6000000-0000-4000-9000-0000000001' || lpad(p.n::text, 2, '0'))::uuid END,
       CASE p.tag WHEN 'PA1' THEN pg_temp.dir('DA1') WHEN 'PB1' THEN pg_temp.dir('DB1') WHEN 'NOC' THEN pg_temp.dir('DN') END
  FROM t_cp_people p;

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.u(p.tag),
       CASE p.campus WHEN 'A' THEN 'e6000000-0000-4000-9000-0000000000ca'::uuid ELSE 'e6000000-0000-4000-9000-0000000000cb'::uuid END,
       true
  FROM t_cp_people p
 WHERE p.campus IS NOT NULL;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(p.tag), rs.id
  FROM t_cp_people p
  JOIN public.roles_sistema rs ON rs.nombre_interno = p.rol;

-- G1 (active) led by LID, with M1 (campus B); DE is its director de etapa.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e6000000-0000-4000-9000-0000000000c1', 'ZZ Cp G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e6000000-0000-4000-9000-0000000000a1', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e6000000-0000-4000-9000-0000000000c1', pg_temp.u('LID'), 'Líder',   'activo', NULL),
  ('e6000000-0000-4000-9000-0000000000c1', pg_temp.u('M1'),  'Miembro', 'activo', NULL);

INSERT INTO public.segmento_lideres (id, usuario_id, segmento_id, tipo_lider) VALUES
  ('e6000000-0000-4000-9000-0000000000b1', pg_temp.u('DE'), 'e6000000-0000-4000-9000-0000000000a1', 'director_etapa');

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e6000000-0000-4000-9000-0000000000b1', 'e6000000-0000-4000-9000-0000000000c1');

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.u('PA1'), pg_temp.u('SPA'), 'conyuge', true),
  (pg_temp.u('PA2'), pg_temp.u('XB'),  'conyuge', true),
  (pg_temp.u('M1'),  pg_temp.u('SM1'), 'conyuge', true),
  (pg_temp.u('PB1'), pg_temp.u('SPB'), 'conyuge', true),
  (pg_temp.u('MEM'), pg_temp.u('PA1'), 'otro_familiar', false);

-- Cases ----------------------------------------------------------------------

-- 1. usuarios through RLS.
SELECT pg_temp.assert_eq('rls: admin reads every fixture, the person with no campus included',
  $q$SELECT pg_temp.visibles('ADM')$q$, 'ADM,DE,DG,LID,M1,MEM,NOC,PA1,PA2,PAS,PASB,PB1,SM1,SPA,SPB,XB');
SELECT pg_temp.assert_eq('rls: pastor A reads campus A only',
  $q$SELECT pg_temp.visibles('PAS')$q$, 'ADM,DE,DG,LID,MEM,PA1,PA2,PAS,SPA');
SELECT pg_temp.assert_eq('rls: director general A reads campus A only',
  $q$SELECT pg_temp.visibles('DG')$q$, 'ADM,DE,DG,LID,MEM,PA1,PA2,PAS,SPA');
SELECT pg_temp.assert_eq('rls: pastor B reads campus B only',
  $q$SELECT pg_temp.visibles('PASB')$q$, 'M1,PASB,PB1,SM1,SPB,XB');
SELECT pg_temp.assert_eq('rls: director de etapa keeps self plus the members of their groups (PRESERVE)',
  $q$SELECT pg_temp.visibles('DE')$q$, 'DE,LID,M1');
SELECT pg_temp.assert_eq('rls: lider keeps self plus their group, the member of campus B included (PRESERVE)',
  $q$SELECT pg_temp.visibles('LID')$q$, 'LID,M1');
SELECT pg_temp.assert_eq('rls: miembro reads only self (PRESERVE)',
  $q$SELECT pg_temp.visibles('MEM')$q$, 'MEM');
SELECT pg_temp.assert_eq('rls update: pastor A edits a person of campus A',
  $q$SELECT pg_temp.edita('PAS', 'PA1')$q$, '1');
SELECT pg_temp.assert_eq('rls update: pastor A cannot edit a person of campus B',
  $q$SELECT pg_temp.edita('PAS', 'PB1')$q$, '0');
SELECT pg_temp.assert_eq('rls update: pastor A cannot edit a person with no campus',
  $q$SELECT pg_temp.edita('PAS', 'NOC')$q$, '0');
SELECT pg_temp.assert_eq('rls update: admin edits a person of campus B',
  $q$SELECT pg_temp.edita('ADM', 'PB1')$q$, '1');
SELECT pg_temp.assert_eq('rls update: lider edits the member of their group (PRESERVE)',
  $q$SELECT pg_temp.edita('LID', 'M1')$q$, '1');

-- 2. puede_ver_usuario.
SELECT pg_temp.assert_eq('ver: pastor A, person of campus A', $q$SELECT pg_temp.ver('PAS', 'PA1')$q$, 'true');
SELECT pg_temp.assert_eq('ver: pastor A, person of campus B', $q$SELECT pg_temp.ver('PAS', 'PB1')$q$, 'false');
SELECT pg_temp.assert_eq('ver: pastor A, person with no campus', $q$SELECT pg_temp.ver('PAS', 'NOC')$q$, 'false');
SELECT pg_temp.assert_eq('ver: director general A, person of campus A', $q$SELECT pg_temp.ver('DG', 'PA1')$q$, 'true');
SELECT pg_temp.assert_eq('ver: director general A, person of campus B', $q$SELECT pg_temp.ver('DG', 'PB1')$q$, 'false');
SELECT pg_temp.assert_eq('ver: admin, person with no campus', $q$SELECT pg_temp.ver('ADM', 'NOC')$q$, 'true');
SELECT pg_temp.assert_eq('ver: admin, person of campus B', $q$SELECT pg_temp.ver('ADM', 'PB1')$q$, 'true');
SELECT pg_temp.assert_eq('ver: lider, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.ver('LID', 'M1')$q$, 'true');
SELECT pg_temp.assert_eq('ver: director de etapa, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.ver('DE', 'M1')$q$, 'true');
SELECT pg_temp.assert_eq('ver: director de etapa, a person of campus A outside their groups (PRESERVE)', $q$SELECT pg_temp.ver('DE', 'PA1')$q$, 'false');
SELECT pg_temp.assert_eq('ver: miembro, another person (PRESERVE)', $q$SELECT pg_temp.ver('MEM', 'PA1')$q$, 'false');
SELECT pg_temp.assert_eq('ver: pastor, themself (PRESERVE)', $q$SELECT pg_temp.ver('PAS', 'PAS')$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('ver identity: asking as somebody else is false',
  $q$SELECT public.puede_ver_usuario(pg_temp.u('ADM'), pg_temp.u('PB1'))::text$q$, 'false');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('ver identity: no session is false',
  $q$SELECT public.puede_ver_usuario(pg_temp.u('ADM'), pg_temp.u('PA1'))::text$q$, 'false');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('ver identity: service_role asking as pastor A gets the campus rule',
  $q$SELECT public.puede_ver_usuario(pg_temp.u('PAS'), pg_temp.u('PA1'))::text || '/' || public.puede_ver_usuario(pg_temp.u('PAS'), pg_temp.u('PB1'))::text$q$,
  'true/false');

-- 3. puede_editar_usuario.
SELECT pg_temp.assert_eq('editar: pastor A, person of campus A', $q$SELECT pg_temp.editar('PAS', 'PA1')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor A, person of campus B', $q$SELECT pg_temp.editar('PAS', 'PB1')$q$, 'false');
SELECT pg_temp.assert_eq('editar: pastor A, person with no campus', $q$SELECT pg_temp.editar('PAS', 'NOC')$q$, 'false');
SELECT pg_temp.assert_eq('editar: pastor B, person of campus B', $q$SELECT pg_temp.editar('PASB', 'PB1')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor B, person of campus A', $q$SELECT pg_temp.editar('PASB', 'PA1')$q$, 'false');
SELECT pg_temp.assert_eq('editar: admin, person of campus B', $q$SELECT pg_temp.editar('ADM', 'PB1')$q$, 'true');
SELECT pg_temp.assert_eq('editar: admin, person with no campus', $q$SELECT pg_temp.editar('ADM', 'NOC')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor, themself (PRESERVE)', $q$SELECT pg_temp.editar('PAS', 'PAS')$q$, 'true');
SELECT pg_temp.assert_eq('editar: lider, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.editar('LID', 'M1')$q$, 'true');
SELECT pg_temp.assert_eq('editar: director de etapa, the member of their group (PRESERVE)', $q$SELECT pg_temp.editar('DE', 'M1')$q$, 'true');
SELECT pg_temp.assert_eq('editar: director general with no group scope, person of campus A (PRESERVE)', $q$SELECT pg_temp.editar('DG', 'PA1')$q$, 'false');
SELECT pg_temp.assert_eq('editar: miembro, another person (PRESERVE)', $q$SELECT pg_temp.editar('MEM', 'PA1')$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('editar identity: another person''s auth id is false',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('ADM'), pg_temp.u('PB1'))::text$q$, 'false');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('editar identity: no session is false',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('ADM'), pg_temp.u('PB1'))::text$q$, 'false');

-- 4. puede_gestionar_relacion_familiar.
SELECT pg_temp.assert_eq('relacion: pastor A, two people of campus A', $q$SELECT pg_temp.relacion('PAS', 'PA1', 'SPA')$q$, 'true');
SELECT pg_temp.assert_eq('relacion: pastor A, a person of A and one of B', $q$SELECT pg_temp.relacion('PAS', 'PA2', 'XB')$q$, 'false');
SELECT pg_temp.assert_eq('relacion: pastor A, two people of campus B', $q$SELECT pg_temp.relacion('PAS', 'PB1', 'SPB')$q$, 'false');
SELECT pg_temp.assert_eq('relacion: admin, campus B and no campus', $q$SELECT pg_temp.relacion('ADM', 'PB1', 'NOC')$q$, 'true');
SELECT pg_temp.assert_eq('relacion: lider, their member and a stranger (PRESERVE)', $q$SELECT pg_temp.relacion('LID', 'M1', 'PB1')$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('relacion identity: another person''s auth id is false',
  $q$SELECT public.puede_gestionar_relacion_familiar(pg_temp.a('ADM'), pg_temp.u('PB1'), pg_temp.u('SPB'))::text$q$, 'false');

-- 5. obtener_reporte_asistencia_usuario.
SELECT pg_temp.assert_eq('reporte: pastor A, person of campus A', $q$SELECT pg_temp.reporte('PAS', 'PA1')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: pastor A, person of campus B', $q$SELECT pg_temp.reporte('PAS', 'PB1')$q$, 'error');
SELECT pg_temp.assert_eq('reporte: pastor A, person with no campus', $q$SELECT pg_temp.reporte('PAS', 'NOC')$q$, 'error');
SELECT pg_temp.assert_eq('reporte: director general A, person of campus A', $q$SELECT pg_temp.reporte('DG', 'PA1')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: director general A, person of campus B', $q$SELECT pg_temp.reporte('DG', 'PB1')$q$, 'error');
SELECT pg_temp.assert_eq('reporte: admin, person with no campus', $q$SELECT pg_temp.reporte('ADM', 'NOC')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: lider, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.reporte('LID', 'M1')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: director de etapa, the member of their group (PRESERVE)', $q$SELECT pg_temp.reporte('DE', 'M1')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: miembro, a direct relation (PRESERVE)', $q$SELECT pg_temp.reporte('MEM', 'PA1')$q$, 'ok');
SELECT pg_temp.assert_eq('reporte: miembro, a stranger (PRESERVE)', $q$SELECT pg_temp.reporte('MEM', 'PB1')$q$, 'error');
SELECT pg_temp.assert_eq('reporte: self (PRESERVE)', $q$SELECT pg_temp.reporte('MEM', 'MEM')$q$, 'ok');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('reporte identity: another person''s auth id is refused',
  $q$SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('PA1'), pg_temp.a('ADM')) ->> 'error'$q$, 'Sin permisos para ver este reporte');

-- 6. obtener_conyugue.
SELECT pg_temp.assert_eq('conyuge: pastor A, couple of campus A', $q$SELECT pg_temp.conyuge('PAS', 'PA1')$q$, 'SPA');
SELECT pg_temp.assert_eq('conyuge: pastor A, couple of campus B', $q$SELECT pg_temp.conyuge('PAS', 'PB1')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: pastor A, person of A whose spouse is of B', $q$SELECT pg_temp.conyuge('PAS', 'PA2')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: director general A, couple of campus A', $q$SELECT pg_temp.conyuge('DG', 'PA1')$q$, 'SPA');
SELECT pg_temp.assert_eq('conyuge: director general A, couple of campus B', $q$SELECT pg_temp.conyuge('DG', 'PB1')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: director de etapa A, couple of campus A', $q$SELECT pg_temp.conyuge('DE', 'PA1')$q$, 'SPA');
SELECT pg_temp.assert_eq('conyuge: director de etapa A, couple of campus B', $q$SELECT pg_temp.conyuge('DE', 'PB1')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: admin, couple of campus B', $q$SELECT pg_temp.conyuge('ADM', 'PB1')$q$, 'SPB');
SELECT pg_temp.assert_eq('conyuge: admin, spouse across campuses', $q$SELECT pg_temp.conyuge('ADM', 'PA2')$q$, 'XB');
SELECT pg_temp.assert_eq('conyuge: lider, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.conyuge('LID', 'M1')$q$, 'SM1');
SELECT pg_temp.assert_eq('conyuge: lider, a person outside their groups (PRESERVE)', $q$SELECT pg_temp.conyuge('LID', 'PA1')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: miembro gets nothing (PRESERVE)', $q$SELECT pg_temp.conyuge('MEM', 'PA1')$q$, 'none');
SELECT pg_temp.assert_eq('conyuge: service_role gets the row (PRESERVE)', $q$SELECT pg_temp.conyuge('service', 'PB1')$q$, 'SPB');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('conyuge: no session gets nothing (PRESERVE)',
  $q$SELECT count(*)::text FROM public.obtener_conyugue(pg_temp.u('PA1'))$q$, '0');

-- 7. Addresses ("ver/editar" from the predicates; rows through RLS).
SELECT pg_temp.assert_eq('direccion: pastor A, address of a person of campus A', $q$SELECT pg_temp.ver_dir('PAS', 'DA1')$q$, 'true/true');
SELECT pg_temp.assert_eq('direccion: pastor A, address of a person of campus B', $q$SELECT pg_temp.ver_dir('PAS', 'DB1')$q$, 'false/false');
SELECT pg_temp.assert_eq('direccion: pastor A, address of a person with no campus', $q$SELECT pg_temp.ver_dir('PAS', 'DN')$q$, 'false/false');
SELECT pg_temp.assert_eq('direccion: director general A, address of campus A (sees, cannot edit)', $q$SELECT pg_temp.ver_dir('DG', 'DA1')$q$, 'true/false');
SELECT pg_temp.assert_eq('direccion: director general A, address of campus B', $q$SELECT pg_temp.ver_dir('DG', 'DB1')$q$, 'false/false');
SELECT pg_temp.assert_eq('direccion: admin, address of a person with no campus', $q$SELECT pg_temp.ver_dir('ADM', 'DN')$q$, 'true/true');
SELECT pg_temp.assert_eq('direccion: miembro, another person''s address (PRESERVE)', $q$SELECT pg_temp.ver_dir('MEM', 'DA1')$q$, 'false/false');
SELECT pg_temp.assert_eq('direccion rls: pastor A reads the address of campus A', $q$SELECT pg_temp.ve_dir('PAS', 'DA1')$q$, '1');
SELECT pg_temp.assert_eq('direccion rls: pastor A cannot read the address of campus B', $q$SELECT pg_temp.ve_dir('PAS', 'DB1')$q$, '0');
SELECT pg_temp.assert_eq('direccion rls: admin reads the address of campus B', $q$SELECT pg_temp.ve_dir('ADM', 'DB1')$q$, '1');

-- 8. Privileges, definer flag, search_path and the policy shape.
SELECT pg_temp.as_nobody();
CREATE TEMP TABLE t_cp_fn (sig regprocedure) ON COMMIT DROP;
INSERT INTO t_cp_fn VALUES
  ('public.puede_ver_usuario(uuid,uuid)'),
  ('public.puede_editar_usuario(uuid,uuid)'),
  ('public.puede_gestionar_relacion_familiar(uuid,uuid,uuid)'),
  ('public.obtener_reporte_asistencia_usuario(uuid,uuid,date,date)'),
  ('public.obtener_conyugue(uuid)'),
  ('public.puede_ver_direccion(uuid)'),
  ('public.puede_editar_direccion(uuid)');
SELECT pg_temp.assert_eq('privileges: anon executes none of the changed functions',
  $q$SELECT count(*)::text FROM t_cp_fn WHERE has_function_privilege('anon', sig, 'execute')$q$, '0');
SELECT pg_temp.assert_eq('privileges: authenticated executes all of them',
  $q$SELECT count(*)::text FROM t_cp_fn WHERE has_function_privilege('authenticated', sig, 'execute')$q$, '7');
SELECT pg_temp.assert_eq('privileges: service_role executes all of them',
  $q$SELECT count(*)::text FROM t_cp_fn WHERE has_function_privilege('service_role', sig, 'execute')$q$, '7');
SELECT pg_temp.assert_eq('privileges: PUBLIC holds no execute on any of them',
  $q$SELECT count(*)::text FROM t_cp_fn f, pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = f.sig AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('definer: all of them are SECURITY DEFINER with search_path public',
  $q$SELECT count(*)::text FROM t_cp_fn f JOIN pg_proc p ON p.oid = f.sig
      WHERE p.prosecdef AND p.proconfig @> ARRAY['search_path=public']$q$, '7');
SELECT pg_temp.assert_eq('signatures: return types unchanged',
  $q$SELECT string_agg(p.proname || '=' || pg_get_function_result(f.sig), '|' ORDER BY p.proname::text COLLATE "C")
       FROM t_cp_fn f JOIN pg_proc p ON p.oid = f.sig$q$,
  (SELECT string_agg(s || '=' || r, '|' ORDER BY s COLLATE "C") FROM (VALUES
     ('obtener_conyugue', 'TABLE(id uuid, nombre text, apellido text, foto_perfil_url text)'),
     ('obtener_reporte_asistencia_usuario', 'jsonb'),
     ('puede_editar_direccion', 'boolean'),
     ('puede_editar_usuario', 'boolean'),
     ('puede_gestionar_relacion_familiar', 'boolean'),
     ('puede_ver_direccion', 'boolean'),
     ('puede_ver_usuario', 'boolean')) v(s, r)));
SELECT pg_temp.assert_eq('policy: usuarios_can_view_profile_photos keeps SELECT, public, permissive',
  $q$SELECT cmd || '|' || array_to_string(roles, ',') || '|' || permissive
       FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios' AND policyname = 'usuarios_can_view_profile_photos'$q$,
  'SELECT|public|PERMISSIVE');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_cp_failures;

ROLLBACK;
