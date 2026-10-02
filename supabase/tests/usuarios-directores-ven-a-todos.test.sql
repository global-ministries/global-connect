-- T1 (odd/tasks/usuarios-directores-ven-a-todos.md) — directors see everybody.
--
-- Covers:
--   1. List (listar_usuarios_con_permisos): director general and director de
--      etapa see everybody; lider, miembro, admin and pastor keep the scope the
--      original function gave them; p_contexto_relacion is unchanged.
--   2. Statistics (obtener_estadisticas_usuarios_con_permisos): same scope as the
--      list, the caller must be auth.uid() (or service_role), no anon access,
--      p_campus_id still filters.
--   3. Profile (obtener_detalle_usuario): directors open anybody's profile, a
--      lider keeps the old rule, and edit rights (puede_editar_usuario) do not
--      widen.
--   4. puede_ver_usuario_ficha: truth table, identity binding, privileges.
--   5. Family relations inside a profile (puede_ver_relacion_familiar) follow
--      the view rule; puede_gestionar_relacion_familiar is unchanged.
--   6. obtener_reporte_asistencia_usuario: the director de etapa and family
--      branches are valid SQL and keep their intended reach; a departed member
--      is out of reach; identity is bound to the session; no anon access.
--   7. A person with several roles gets the scope of the highest one.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e3000000-... namespace and every fixture person has
-- nombre starting with 'ZZ Dv'. The last statement is a SELECT of the failing
-- cases (empty = all ok), because the MCP tool returns only the last
-- result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dv_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT id FROM public.usuarios WHERE nombre LIKE 'ZZ Dv%' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre LIKE 'ZZ Dv%' AND apellido = p_tag;
$$;

-- What a list call returns: the distinct fixture surnames, then how many
-- distinct non-fixture people came back ("tags|others").
CREATE OR REPLACE FUNCTION pg_temp.seen(p_auth uuid, p_ctx boolean DEFAULT false)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT r.apellido, ',' ORDER BY r.apellido) FILTER (WHERE r.nombre LIKE 'ZZ Dv%'), '')
         || '|' || count(DISTINCT r.id) FILTER (WHERE r.nombre NOT LIKE 'ZZ Dv%')
    FROM public.listar_usuarios_con_permisos(p_auth, '', '{}', NULL, NULL, NULL, 5000, 0, p_ctx) r;
$$;

CREATE OR REPLACE FUNCTION pg_temp.everybody()
RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.usuarios WHERE nombre LIKE 'ZZ Dv%')
         || '|' || (SELECT count(*) FROM public.usuarios WHERE nombre NOT LIKE 'ZZ Dv%');
$$;

-- What a statistics call returns: "total|con_email|con_telefono|registrados_hoy".
CREATE OR REPLACE FUNCTION pg_temp.stats(p_auth uuid, p_busqueda text DEFAULT '', p_campus uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT s.total_usuarios || '|' || s.con_email || '|' || s.con_telefono || '|' || s.registrados_hoy
    FROM public.obtener_estadisticas_usuarios_con_permisos(p_auth, p_busqueda, '{}', NULL, NULL, NULL, p_campus) s;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('e3000000-0000-4000-8000-0000000000a1', 'ZZ Dv S1');

INSERT INTO public.familias (id, nombre) VALUES
  ('e3000000-0000-4000-8000-0000000000f1', 'ZZ Dv familia');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e3000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzdv-auth-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzdv-auth-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzdv-auth-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzdv-auth-de@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzdv-auth-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'zzdv-auth-mem@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e3000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'zzdv-auth-rel@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- People. Surnames are the tags the assertions read.
--   ADM admin, PAS pastor, DG director general, DE director de etapa (directs
--   G1), LID lider of G1, MEM miembro (family with FAM, related to REL),
--   M1 member of G1, X member of G2 (not directed by DE, not led by LID),
--   OUT belongs to no group, REL (with an account) related to MEM, FAM same family as MEM.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, email, telefono, cedula, auth_id, familia_id) VALUES
  ('e3000000-0000-4000-8000-000000000001', 'ZZ Dv', 'ADM', 'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000101', NULL),
  ('e3000000-0000-4000-8000-000000000002', 'ZZ Dv', 'PAS', 'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000102', NULL),
  ('e3000000-0000-4000-8000-000000000003', 'ZZ Dv', 'DG',  'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000103', NULL),
  ('e3000000-0000-4000-8000-000000000004', 'ZZ Dv', 'DE',  'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000104', NULL),
  ('e3000000-0000-4000-8000-000000000005', 'ZZ Dv', 'LID', 'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000105', NULL),
  ('e3000000-0000-4000-8000-000000000006', 'ZZ Dv', 'MEM', 'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000106', 'e3000000-0000-4000-8000-0000000000f1'),
  ('e3000000-0000-4000-8000-000000000007', 'ZZ Dv', 'OUT', 'Otro', 'Soltero', NULL, '04140000000', NULL, NULL, NULL),
  ('e3000000-0000-4000-8000-000000000008', 'ZZ Dv', 'M1',  'Otro', 'Soltero', 'zzdv-m1@example.test', NULL, NULL, NULL, NULL),
  ('e3000000-0000-4000-8000-000000000009', 'ZZ Dv', 'X',   'Otro', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e3000000-0000-4000-8000-000000000010', 'ZZ Dv', 'REL', 'Otro', 'Soltero', NULL, NULL, NULL, 'e3000000-0000-4000-8000-000000000107', NULL),
  ('e3000000-0000-4000-8000-000000000011', 'ZZ Dv', 'FAM', 'Otro', 'Soltero', NULL, NULL, NULL, NULL, 'e3000000-0000-4000-8000-0000000000f1');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e3000000-0000-4000-8000-000000000001', 'admin'),
    ('e3000000-0000-4000-8000-000000000002', 'pastor'),
    ('e3000000-0000-4000-8000-000000000003', 'director-general'),
    ('e3000000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e3000000-0000-4000-8000-000000000005', 'lider'),
    ('e3000000-0000-4000-8000-000000000006', 'miembro')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e3000000-0000-4000-8000-0000000000c1', 'ZZ Dv G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e3000000-0000-4000-8000-0000000000a1', true),
  ('e3000000-0000-4000-8000-0000000000c2', 'ZZ Dv G2', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e3000000-0000-4000-8000-0000000000a1', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e3000000-0000-4000-8000-0000000000c1', 'e3000000-0000-4000-8000-000000000005', 'Líder',   'activo', NULL),
  ('e3000000-0000-4000-8000-0000000000c1', 'e3000000-0000-4000-8000-000000000008', 'Miembro', 'activo', NULL),
  ('e3000000-0000-4000-8000-0000000000c2', 'e3000000-0000-4000-8000-000000000009', 'Miembro', 'activo', NULL);

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('e3000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-0000000000a1', 'segmento');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e3000000-0000-4000-8000-0000000000b1', 'e3000000-0000-4000-8000-0000000000a1', 'e3000000-0000-4000-8000-000000000004', 'director_etapa');
INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e3000000-0000-4000-8000-0000000000b1', 'e3000000-0000-4000-8000-0000000000c1');

-- MEM is related to REL.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('e3000000-0000-4000-8000-000000000006', 'e3000000-0000-4000-8000-000000000010', 'otro_familiar');

-- One meeting of G1 that M1 attended.
INSERT INTO public.eventos_grupo (id, grupo_id, fecha) VALUES
  ('e3000000-0000-4000-8000-0000000000e1', 'e3000000-0000-4000-8000-0000000000c1', current_date - 7);
INSERT INTO public.asistencia (evento_grupo_id, usuario_id, presente) VALUES
  ('e3000000-0000-4000-8000-0000000000e1', 'e3000000-0000-4000-8000-000000000008', true);

-- Cases ----------------------------------------------------------------------

-- 1. List.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('list: admin sees everybody',
  $q$SELECT pg_temp.seen(pg_temp.a('ADM'))$q$, pg_temp.everybody());
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('list: pastor sees everybody',
  $q$SELECT pg_temp.seen(pg_temp.a('PAS'))$q$, pg_temp.everybody());
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('list: director general sees everybody, the outsider included',
  $q$SELECT pg_temp.seen(pg_temp.a('DG'))$q$, pg_temp.everybody());
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('list: director de etapa sees everybody, the outsider included',
  $q$SELECT pg_temp.seen(pg_temp.a('DE'))$q$, pg_temp.everybody());
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('list: lider keeps the members of the groups they lead',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'))$q$, 'LID,M1|0');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('list: miembro keeps family, relationships and self',
  $q$SELECT pg_temp.seen(pg_temp.a('MEM'))$q$, 'FAM,MEM,REL|0');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('list: contexto relacion, lider sees everybody',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'), true)$q$, pg_temp.everybody());
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('list: contexto relacion, miembro keeps the family scope',
  $q$SELECT pg_temp.seen(pg_temp.a('MEM'), true)$q$, 'FAM,MEM,REL|0');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('list: contexto relacion, director de etapa still sees everybody',
  $q$SELECT pg_temp.seen(pg_temp.a('DE'), true)$q$, pg_temp.everybody());

-- 2. Statistics. Searching 'ZZ Dv' isolates the fixtures:
--    11 people, one email (M1), one phone (OUT), all registered today.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('stats: admin counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Dv')$q$, '11|1|1|11');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('stats: pastor counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('PAS'), 'ZZ Dv')$q$, '11|1|1|11');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('stats: director general counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('DG'), 'ZZ Dv')$q$, '11|1|1|11');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('stats: director de etapa counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('DE'), 'ZZ Dv')$q$, '11|1|1|11');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('stats: lider keeps the members of the groups they lead',
  $q$SELECT pg_temp.stats(pg_temp.a('LID'), 'ZZ Dv')$q$, '2|1|0|2');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('stats: miembro keeps family, relationships and self',
  $q$SELECT pg_temp.stats(pg_temp.a('MEM'), 'ZZ Dv')$q$, '3|0|0|3');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('stats: director general total equals the admin total (no search)',
  $q$SELECT (pg_temp.stats(pg_temp.a('DG')) = pg_temp.stats(pg_temp.a('ADM')))::text$q$, 'true');
SELECT pg_temp.assert_eq('stats: director de etapa total equals the admin total (no search)',
  $q$SELECT (pg_temp.stats(pg_temp.a('DE')) = pg_temp.stats(pg_temp.a('ADM')))::text$q$, 'true');
SELECT pg_temp.assert_eq('stats: the campus filter still applies (unknown campus counts nobody)',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Dv', 'e3000000-0000-4000-8000-0000000000ff')$q$, '0|0|0|0');
-- Identity.
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('stats: another person''s auth id counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Dv')$q$, '0|0|0|0');
SELECT pg_temp.assert_eq('stats: own auth id still works',
  $q$SELECT pg_temp.stats(pg_temp.a('LID'), 'ZZ Dv')$q$, '2|1|0|2');
SELECT pg_temp.as_user_json(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('stats: a person published only as JSON claims cannot pass another auth id',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Dv')$q$, '0|0|0|0');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('stats: no session counts nobody',
  $q$SELECT pg_temp.stats(pg_temp.a('ADM'), 'ZZ Dv')$q$, '0|0|0|0');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('stats: service_role with no session can pass p_auth_id',
  $q$SELECT pg_temp.stats(pg_temp.a('DE'), 'ZZ Dv')$q$, '11|1|1|11');
SELECT pg_temp.as_nobody();
-- Privileges.
SELECT pg_temp.assert_eq('stats: anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('stats: PUBLIC cannot execute',
  $q$SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('stats: authenticated can execute',
  $q$SELECT has_function_privilege('authenticated', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('stats: service_role can execute',
  $q$SELECT has_function_privilege('service_role', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')$q$, 'true');

-- 3. Profile.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('profile: admin opens the outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'OUT');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('profile: pastor opens the outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'OUT');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('profile: director general opens the outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'OUT');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('profile: director de etapa opens the outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'OUT');
SELECT pg_temp.assert_eq('profile: director de etapa opens a member of another group',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('X'))->>'apellido'$$)$q$, 'X');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('profile: lider cannot open the outsider (same error as before)',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('profile: lider opens a member of their group',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('M1'))->>'apellido'$$)$q$, 'M1');
SELECT pg_temp.assert_eq('profile: lider cannot open a member of another group',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('X'))->>'apellido'$$)$q$, 'ERR:42501');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('profile: miembro opens their own',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('MEM'))->>'apellido'$$)$q$, 'MEM');
SELECT pg_temp.assert_eq('profile: miembro cannot open the outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'ERR:42501');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('profile: no session is refused',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_detalle_usuario(pg_temp.u('OUT'))->>'apellido'$$)$q$, 'ERR:28000');
-- Edit rights do not widen. puede_editar_usuario only answers for the session's
-- own identity, so each case signs in as the actor first.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('edit: director general cannot edit the outsider',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('DG'), pg_temp.u('OUT'))$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('edit: director de etapa cannot edit the outsider',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('DE'), pg_temp.u('OUT'))$q$, 'false');
SELECT pg_temp.assert_eq('edit: director de etapa cannot edit a member of another group',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('DE'), pg_temp.u('X'))$q$, 'false');
SELECT pg_temp.assert_eq('edit: director de etapa still edits a member of their group',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('DE'), pg_temp.u('M1'))$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('edit: lider still edits a member of their group',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('LID'), pg_temp.u('M1'))$q$, 'true');

-- 4. puede_ver_usuario_ficha.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('ficha: admin, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('ADM'), pg_temp.u('OUT'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('ficha: pastor, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('PAS'), pg_temp.u('OUT'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('ficha: director general, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DG'), pg_temp.u('OUT'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('ficha: director de etapa, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DE'), pg_temp.u('OUT'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('ficha: lider, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), pg_temp.u('OUT'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: lider, member of their group',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), pg_temp.u('M1'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: lider, themself',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), pg_temp.u('LID'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: another person''s auth id under a session',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('ADM'), pg_temp.u('OUT'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: null actor',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(NULL, pg_temp.u('OUT'))$$)$q$, 'false');
SELECT pg_temp.assert_eq('ficha: null target',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('LID'), NULL)$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('ficha: miembro, themself',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('MEM'), pg_temp.u('MEM'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('ficha: miembro, outsider',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('MEM'), pg_temp.u('OUT'))$$)$q$, 'false');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('ficha: no session is false even for an admin id',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('ADM'), pg_temp.u('OUT'))$$)$q$, 'false');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('ficha: service_role can act for a director de etapa',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_usuario_ficha(pg_temp.a('DE'), pg_temp.u('OUT'))$$)$q$, 'true');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('ficha: anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('ficha: PUBLIC cannot execute',
  $q$SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.puede_ver_usuario_ficha(uuid,uuid)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('ficha: authenticated can execute',
  $q$SELECT has_function_privilege('authenticated', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('ficha: service_role can execute',
  $q$SELECT has_function_privilege('service_role', 'public.puede_ver_usuario_ficha(uuid,uuid)', 'execute')$q$, 'true');

-- 5. Family relations inside a profile.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('family: director de etapa sees the relation between two people they cannot edit',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('DE'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'true');
SELECT pg_temp.assert_eq('family: the relation shows inside the profile of MEM',
  $q$SELECT pg_temp.outcome($$SELECT jsonb_array_length(public.obtener_detalle_usuario(pg_temp.u('MEM'))->'relaciones')$$)$q$, '1');
SELECT pg_temp.assert_eq('family: director de etapa still cannot manage that relation',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_gestionar_relacion_familiar(pg_temp.a('DE'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('family: lider cannot see a relation of people they cannot view',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('LID'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('family: miembro sees their own relation',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('MEM'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('family: admin can still manage the relation',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_gestionar_relacion_familiar(pg_temp.a('ADM'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('family: another person''s auth id is still refused',
  $q$SELECT pg_temp.outcome($$SELECT public.puede_ver_relacion_familiar(pg_temp.a('ADM'), pg_temp.u('MEM'), pg_temp.u('REL'))$$)$q$, 'false');

-- 6. Attendance report. The function only trusts the session identity, so the
-- helper signs in as the actor before it passes the actor's own auth id (as the
-- app does).
CREATE OR REPLACE FUNCTION pg_temp.reporte(p_actor text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_actor));
  RETURN pg_temp.outcome(format(
    $f$SELECT CASE WHEN r ? 'error' THEN 'error:' || (r->>'error') ELSE 'ok' END
         FROM (SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u(%L), pg_temp.a(%L)) AS r) s$f$,
    p_target, p_actor));
END;
$$;

SELECT pg_temp.assert_eq('report: director de etapa gets a result for a member of their group',
  $q$SELECT pg_temp.reporte('DE', 'M1')$q$, 'ok');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('report: the member of their group shows the attendance',
  $q$SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('M1'), pg_temp.a('DE')) #>> '{kpis,porcentaje_asistencia_general}'$q$, '100.0');
SELECT pg_temp.assert_eq('report: director de etapa is refused for the outsider (not an SQL error)',
  $q$SELECT pg_temp.reporte('DE', 'OUT')$q$, 'error:Sin permisos para ver este reporte');
SELECT pg_temp.assert_eq('report: director de etapa is refused for a member of another group',
  $q$SELECT pg_temp.reporte('DE', 'X')$q$, 'error:Sin permisos para ver este reporte');
SELECT pg_temp.assert_eq('report: a family member gets a result for their relative',
  $q$SELECT pg_temp.reporte('MEM', 'REL')$q$, 'ok');
SELECT pg_temp.assert_eq('report: the relative gets a result the other way round',
  $q$SELECT pg_temp.reporte('REL', 'MEM')$q$, 'ok');
SELECT pg_temp.assert_eq('report: a family member is refused for a stranger',
  $q$SELECT pg_temp.reporte('MEM', 'OUT')$q$, 'error:Sin permisos para ver este reporte');
SELECT pg_temp.assert_eq('report: lider gets a result for a member of their group',
  $q$SELECT pg_temp.reporte('LID', 'M1')$q$, 'ok');
SELECT pg_temp.assert_eq('report: lider is refused for the outsider',
  $q$SELECT pg_temp.reporte('LID', 'OUT')$q$, 'error:Sin permisos para ver este reporte');
SELECT pg_temp.assert_eq('report: admin gets a result for the outsider',
  $q$SELECT pg_temp.reporte('ADM', 'OUT')$q$, 'ok');
SELECT pg_temp.assert_eq('report: director general gets a result for the outsider',
  $q$SELECT pg_temp.reporte('DG', 'OUT')$q$, 'ok');
SELECT pg_temp.assert_eq('report: a person gets their own report',
  $q$SELECT pg_temp.reporte('MEM', 'MEM')$q$, 'ok');

-- 6b. A person who left a directed group is out of the director's reach. X is a
-- member of G2 (not directed) and departed from G1 (directed by DE).
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e3000000-0000-4000-8000-0000000000c1', 'e3000000-0000-4000-8000-000000000009', 'Miembro', 'activo', current_date - 1);
SELECT pg_temp.assert_eq('report: director de etapa is refused for a member who left the directed group',
  $q$SELECT pg_temp.reporte('DE', 'X')$q$, 'error:Sin permisos para ver este reporte');
SELECT pg_temp.assert_eq('report: director de etapa still gets a result for a current member',
  $q$SELECT pg_temp.reporte('DE', 'M1')$q$, 'ok');

-- 6c. Identity of the attendance report.
SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('report identity: another person''s auth id under a session is refused',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('OUT'), pg_temp.a('ADM'))->>'error'$$)$q$, 'Sin permisos para ver este reporte');
SELECT pg_temp.as_user_json(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('report identity: JSON-only claims cannot pass another auth id',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('OUT'), pg_temp.a('ADM'))->>'error'$$)$q$, 'Sin permisos para ver este reporte');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('report identity: no session is refused',
  $q$SELECT pg_temp.outcome($$SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('OUT'), pg_temp.a('ADM'))->>'error'$$)$q$, 'Sin permisos para ver este reporte');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('report identity: service_role can act for a person',
  $q$SELECT pg_temp.outcome($$SELECT CASE WHEN r ? 'error' THEN 'error' ELSE 'ok' END FROM (SELECT public.obtener_reporte_asistencia_usuario(pg_temp.u('OUT'), pg_temp.a('ADM')) AS r) s$$)$q$, 'ok');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('report identity: anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.obtener_reporte_asistencia_usuario(uuid,uuid,date,date)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('report identity: PUBLIC cannot execute',
  $q$SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.obtener_reporte_asistencia_usuario(uuid,uuid,date,date)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('report identity: authenticated can execute',
  $q$SELECT has_function_privilege('authenticated', 'public.obtener_reporte_asistencia_usuario(uuid,uuid,date,date)', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('report identity: service_role can execute',
  $q$SELECT has_function_privilege('service_role', 'public.obtener_reporte_asistencia_usuario(uuid,uuid,date,date)', 'execute')$q$, 'true');

-- 7. Highest role wins. LID (lider of G1) also becomes director de etapa: the
-- director scope (everybody) applies to the list and to the statistics.
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('LID'), id FROM public.roles_sistema WHERE nombre_interno = 'director-etapa';
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('highest role: director de etapa + lider lists everybody',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'))$q$, pg_temp.everybody());
SELECT pg_temp.assert_eq('highest role: director de etapa + lider counts every fixture',
  $q$SELECT pg_temp.stats(pg_temp.a('LID'), 'ZZ Dv')$q$, '11|1|1|11');
-- The same person as lider + miembro (no director role) gets the lider scope,
-- not the miembro family scope.
DELETE FROM public.usuario_roles
 WHERE usuario_id = pg_temp.u('LID')
   AND rol_id = (SELECT id FROM public.roles_sistema WHERE nombre_interno = 'director-etapa');
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u('LID'), id FROM public.roles_sistema WHERE nombre_interno = 'miembro';
SELECT pg_temp.assert_eq('highest role: lider + miembro lists the lider scope',
  $q$SELECT pg_temp.seen(pg_temp.a('LID'))$q$, 'LID,M1|0');
SELECT pg_temp.assert_eq('highest role: lider + miembro counts the lider scope',
  $q$SELECT pg_temp.stats(pg_temp.a('LID'), 'ZZ Dv')$q$, '2|1|0|2');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_dv_failures;

ROLLBACK;
