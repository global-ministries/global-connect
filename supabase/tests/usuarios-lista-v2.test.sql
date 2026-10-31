-- Usuarios list v2 (20261030100000_usuarios_lista_v2.sql, T8-1 of
-- odd/tasks/sistema-diseno-v2.md, S13).
--
-- Covers:
--   1. cuenta per row: 'si' (auth_id), 'invitada' (open account invitation),
--      'no'; and the p_con_cuenta filter.
--   2. p_nuevos_dias: registered in the last N days.
--   3. p_orden: nombre (default), registro_desc, registro_asc.
--   4. The search matches phones by digits (local and +58 forms); a query with
--      letters never matches a phone.
--   5. Per row: current group, main campus, es_de_mi_grupo (only a current
--      member of an ACTIVE group the caller leads; never self).
--   6. Statistics v2 (nuevos_7d, sin_grupo, sin_cuenta, sin_telefono) follow
--      the list scope and filters; their total equals the list total_count.
--   7. The campus rule is the one of 20261029200000 (pastor sees campus A only;
--      p_campus_id narrows; outside the caller's campuses nobody).
--   8. v1 functions return their v1 columns and the same people as v2.
--   9. Identity and privileges.
--  10. Gaps from the #620 review (fixtures added after section 9, so the
--      cases above keep their data): miembro scope; director general and
--      director de etapa limited to their campus; lider with
--      p_contexto_relacion; a person with no usuario_campus is invisible to
--      the pastor; v1 with a foreign caller and with NULL p_auth_id;
--      es_de_mi_grupo with an eliminado group and with an ex-leader
--      (fecha_salida); phone search through v1.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e9a00000-... namespace and every fixture person has
-- nombre 'ZZ Lv'. The last statement is a SELECT of the failing cases (empty =
-- all ok), because the MCP tool returns only the last result-producing
-- statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_lv_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_lv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Identity simulation. The functions under test are SECURITY DEFINER, so the
-- session role stays postgres and only the JWT settings change.
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Lv' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.campus(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_tag
           WHEN 'A' THEN 'e9a00000-0000-4000-8000-0000000000ca'::uuid
           WHEN 'B' THEN 'e9a00000-0000-4000-8000-0000000000cb'::uuid
         END;
$$;

-- The fixture surnames a v2 list call returns, IN THE ORDER RETURNED.
CREATE OR REPLACE FUNCTION pg_temp.v2(
  p_auth uuid,
  p_busqueda text DEFAULT 'ZZ Lv',
  p_con_cuenta boolean DEFAULT NULL,
  p_nuevos_dias integer DEFAULT NULL,
  p_orden text DEFAULT 'nombre',
  p_campus uuid DEFAULT NULL
)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(r.apellido, ',' ORDER BY r.n), '')
    FROM (
      SELECT v.apellido, v.nombre, row_number() OVER () AS n
        FROM public.listar_usuarios_con_permisos_v2(
          p_auth, p_busqueda, '{}', NULL, NULL, NULL, 5000, 0, false, p_campus,
          p_con_cuenta, p_nuevos_dias, p_orden) v
    ) r
   WHERE r.nombre = 'ZZ Lv';
$$;

-- "<surname>:<value>" for one per-row column of a v2 list call, by surname.
CREATE OR REPLACE FUNCTION pg_temp.columna(p_auth uuid, p_columna text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE format(
    'SELECT string_agg(v.apellido || '':'' || coalesce((v.%I)::text, ''-''), '','' ORDER BY v.apellido)
       FROM public.listar_usuarios_con_permisos_v2($1, ''ZZ Lv'', ''{}'', NULL, NULL, NULL, 5000, 0) v
      WHERE v.nombre = ''ZZ Lv''', p_columna)
    INTO v USING p_auth;
  RETURN v;
END;
$$;

-- What a v2 statistics call returns:
-- "total|con_email|con_telefono|registrados_hoy|nuevos_7d|sin_grupo|sin_cuenta|sin_telefono|invitadas".
CREATE OR REPLACE FUNCTION pg_temp.stats2(
  p_auth uuid,
  p_busqueda text DEFAULT 'ZZ Lv',
  p_con_cuenta boolean DEFAULT NULL,
  p_nuevos_dias integer DEFAULT NULL,
  p_campus uuid DEFAULT NULL
)
RETURNS text LANGUAGE sql AS $$
  SELECT s.total_usuarios || '|' || s.con_email || '|' || s.con_telefono || '|' || s.registrados_hoy
         || '|' || s.nuevos_7d || '|' || s.sin_grupo || '|' || s.sin_cuenta || '|' || s.sin_telefono
         || '|' || s.invitadas
    FROM public.obtener_estadisticas_usuarios_con_permisos_v2(
      p_auth, p_busqueda, '{}', NULL, NULL, NULL, p_campus, p_con_cuenta, p_nuevos_dias) s;
$$;

CREATE OR REPLACE FUNCTION pg_temp.total2(p_auth uuid, p_nuevos_dias integer DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(max(v.total_count), 0)::text
    FROM public.listar_usuarios_con_permisos_v2(
      p_auth, 'ZZ Lv', '{}', NULL, NULL, NULL, 1, 0, false, NULL, NULL, p_nuevos_dias) v;
$$;

-- The fixture surnames of a v1 list call, sorted.
CREATE OR REPLACE FUNCTION pg_temp.v1(p_auth uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT v.apellido, ',' ORDER BY v.apellido), '')
    FROM public.listar_usuarios_con_permisos(p_auth, 'ZZ Lv', '{}', NULL, NULL, NULL, 5000, 0) v
   WHERE v.nombre = 'ZZ Lv';
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e9a00000-0000-4000-8000-0000000000ca', 'ZZ Lv Campus A', 'ZZLVA'),
  ('e9a00000-0000-4000-8000-0000000000cb', 'ZZ Lv Campus B', 'ZZLVB');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e9a00000-0000-4000-8000-0000000000a1', 'ZZ Lv S1');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e9a00000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzlv-auth-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzlv-auth-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzlv-auth-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'zzlv-auth-m3@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- People (surnames are the tags the assertions read).
--   Campus A: ADM admin, PAS pastor, LID lider of G1 (active) and G2
--     (inactive), M1 member of G1 with an open invitation, a phone and an
--     email, M2 (no group, no phone), M3 member of G2 with account and phone.
--   Campus B: MB member of G1.
-- Registered: MB now, M3 1 day ago, M1 2, M2 30, ADM 400, PAS 401, LID 402.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, email, telefono, auth_id, fecha_registro) VALUES
  ('e9a00000-0000-4000-8000-000000000001', 'ZZ Lv', 'ADM', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000101', now() - interval '400 days'),
  ('e9a00000-0000-4000-8000-000000000002', 'ZZ Lv', 'PAS', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000102', now() - interval '401 days'),
  ('e9a00000-0000-4000-8000-000000000003', 'ZZ Lv', 'LID', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000103', now() - interval '402 days'),
  ('e9a00000-0000-4000-8000-000000000004', 'ZZ Lv', 'M1',  'Otro', 'Soltero', 'zzlv-m1@example.test', '04145550101', NULL, now() - interval '2 days'),
  ('e9a00000-0000-4000-8000-000000000005', 'ZZ Lv', 'M2',  'Otro', 'Soltero', NULL, NULL, NULL, now() - interval '30 days'),
  ('e9a00000-0000-4000-8000-000000000006', 'ZZ Lv', 'M3',  'Otro', 'Soltero', NULL, '04245550202', 'e9a00000-0000-4000-8000-000000000106', now() - interval '1 day'),
  ('e9a00000-0000-4000-8000-000000000007', 'ZZ Lv', 'MB',  'Otro', 'Soltero', NULL, NULL, NULL, now());

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT v.usuario_id::uuid, v.campus_id::uuid, true
  FROM (VALUES
    ('e9a00000-0000-4000-8000-000000000001', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000002', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000003', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000004', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000005', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000006', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000007', 'e9a00000-0000-4000-8000-0000000000cb')
  ) v(usuario_id, campus_id);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e9a00000-0000-4000-8000-000000000001', 'admin'),
    ('e9a00000-0000-4000-8000-000000000002', 'pastor'),
    ('e9a00000-0000-4000-8000-000000000003', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e9a00000-0000-4000-8000-0000000000c1', 'ZZ Lv G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9a00000-0000-4000-8000-0000000000a1', true),
  ('e9a00000-0000-4000-8000-0000000000c2', 'ZZ Lv G2', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9a00000-0000-4000-8000-0000000000a1', false);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e9a00000-0000-4000-8000-0000000000c1', 'e9a00000-0000-4000-8000-000000000003', 'Líder',   'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c2', 'e9a00000-0000-4000-8000-000000000003', 'Líder',   'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c1', 'e9a00000-0000-4000-8000-000000000004', 'Miembro', 'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c2', 'e9a00000-0000-4000-8000-000000000006', 'Miembro', 'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c1', 'e9a00000-0000-4000-8000-000000000007', 'Miembro', 'activo', NULL);

-- M1 has an open account invitation.
INSERT INTO public.invitaciones_cuenta (usuario_id, email, invitado_por, estado) VALUES
  ('e9a00000-0000-4000-8000-000000000004', 'zzlv-m1@example.test', 'e9a00000-0000-4000-8000-000000000001', 'enviada');

-- Cases ----------------------------------------------------------------------

-- 1. cuenta.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('cuenta: si with account, invitada with an open invitation, no otherwise',
  $q$SELECT pg_temp.columna(pg_temp.a('ADM'), 'cuenta')$q$,
  'ADM:si,LID:si,M1:invitada,M2:no,M3:si,MB:no,PAS:si');
SELECT pg_temp.assert_eq('p_con_cuenta false: people without account (invited included)',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', false)$q$, 'M1,M2,MB');
SELECT pg_temp.assert_eq('p_con_cuenta true: people with account',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', true)$q$, 'ADM,LID,M3,PAS');

-- 2. p_nuevos_dias.
SELECT pg_temp.assert_eq('p_nuevos_dias 7: registered in the last 7 days',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, 7)$q$, 'M1,M3,MB');
SELECT pg_temp.assert_eq('p_nuevos_dias 60',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, 60)$q$, 'M1,M2,M3,MB');

-- 3. p_orden.
SELECT pg_temp.assert_eq('orden nombre (default)',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'))$q$, 'ADM,LID,M1,M2,M3,MB,PAS');
SELECT pg_temp.assert_eq('orden registro_desc: newest first',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, NULL, 'registro_desc')$q$, 'MB,M3,M1,M2,ADM,PAS,LID');
SELECT pg_temp.assert_eq('orden registro_asc: oldest first',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, NULL, 'registro_asc')$q$, 'LID,PAS,ADM,M2,M1,M3,MB');
SELECT pg_temp.assert_eq('orden unknown reads as nombre',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, NULL, 'x; drop')$q$, 'ADM,LID,M1,M2,M3,MB,PAS');
SELECT pg_temp.assert_eq('orden registro_desc pages: offset 2 limit 2',
  $q$SELECT string_agg(v.apellido, ',')
       FROM public.listar_usuarios_con_permisos_v2(pg_temp.a('ADM'), 'ZZ Lv', '{}', NULL, NULL, NULL, 2, 2,
                                                   false, NULL, NULL, NULL, 'registro_desc') v$q$, 'M1,M2');

-- 4. Phone search.
SELECT pg_temp.assert_eq('phone: local form with spaces',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), '0414 555 0101')$q$, 'M1');
SELECT pg_temp.assert_eq('phone: +58 form with dashes',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), '+58 414-555-0101')$q$, 'M1');
SELECT pg_temp.assert_eq('phone: a fragment matches every phone holding it',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), '555 0')$q$, 'M1,M3');
SELECT pg_temp.assert_eq('phone: a query with letters never matches a phone',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'M 5550101')$q$, '');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('phone: the pastor finds only their scope by phone',
  $q$SELECT pg_temp.v2(pg_temp.a('PAS'), '5550202')$q$, 'M3');
SELECT pg_temp.as_user(pg_temp.a('ADM'));

-- 5. Per-row group, campus and es_de_mi_grupo.
SELECT pg_temp.assert_eq('grupo_nombre: the current group, active groups first',
  $q$SELECT pg_temp.columna(pg_temp.a('ADM'), 'grupo_nombre')$q$,
  'ADM:-,LID:ZZ Lv G1,M1:ZZ Lv G1,M2:-,M3:ZZ Lv G2,MB:ZZ Lv G1,PAS:-');
SELECT pg_temp.assert_eq('campus_nombre: the main campus',
  $q$SELECT pg_temp.columna(pg_temp.a('ADM'), 'campus_nombre')$q$,
  'ADM:ZZ Lv Campus A,LID:ZZ Lv Campus A,M1:ZZ Lv Campus A,M2:ZZ Lv Campus A,M3:ZZ Lv Campus A,MB:ZZ Lv Campus B,PAS:ZZ Lv Campus A');
SELECT pg_temp.assert_eq('es_de_mi_grupo: admin leads nobody',
  $q$SELECT pg_temp.columna(pg_temp.a('ADM'), 'es_de_mi_grupo')$q$,
  'ADM:false,LID:false,M1:false,M2:false,M3:false,MB:false,PAS:false');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('lider: the list scope is unchanged (members of the groups they lead)',
  $q$SELECT pg_temp.v2(pg_temp.a('LID'))$q$, 'LID,M1,M3,MB');
SELECT pg_temp.assert_eq('es_de_mi_grupo: members of the active group, not the inactive one, never self',
  $q$SELECT pg_temp.columna(pg_temp.a('LID'), 'es_de_mi_grupo')$q$, 'LID:false,M1:true,M3:false,MB:true');
SELECT pg_temp.assert_eq('lider: telefono comes back for their group members',
  $q$SELECT pg_temp.columna(pg_temp.a('LID'), 'telefono')$q$, 'LID:-,M1:04145550101,M3:04245550202,MB:-');

-- 6. Statistics v2.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('stats v2 admin: total|email|tel|hoy|nuevos_7d|sin_grupo|sin_cuenta|sin_telefono|invitadas',
  $q$SELECT pg_temp.stats2(pg_temp.a('ADM'))$q$, '7|1|2|1|3|3|3|5|1');
SELECT pg_temp.assert_eq('stats v2 follow p_con_cuenta',
  $q$SELECT pg_temp.stats2(pg_temp.a('ADM'), 'ZZ Lv', false)$q$, '3|1|1|1|2|1|3|2|1');
SELECT pg_temp.assert_eq('stats v2 follow p_nuevos_dias',
  $q$SELECT pg_temp.stats2(pg_temp.a('ADM'), 'ZZ Lv', NULL, 7)$q$, '3|1|2|1|3|0|2|1|1');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('stats v2 pastor: campus A only',
  $q$SELECT pg_temp.stats2(pg_temp.a('PAS'))$q$, '6|1|2|0|2|3|2|4|1');
SELECT pg_temp.assert_eq('stats v2 total equals the list total_count (nuevos 7)',
  $q$SELECT (pg_temp.total2(pg_temp.a('PAS'), 7) = split_part(pg_temp.stats2(pg_temp.a('PAS'), 'ZZ Lv', NULL, 7), '|', 1))::text$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('stats v2 lider: their group scope',
  $q$SELECT pg_temp.stats2(pg_temp.a('LID'))$q$, '4|1|2|1|3|0|2|2|1');

-- 7. Campus rule.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('campus: pastor A sees campus A only',
  $q$SELECT pg_temp.v2(pg_temp.a('PAS'))$q$, 'ADM,LID,M1,M2,M3,PAS');
SELECT pg_temp.assert_eq('campus: pastor A asking for campus B gets nobody',
  $q$SELECT pg_temp.v2(pg_temp.a('PAS'), 'ZZ Lv', NULL, NULL, 'nombre', pg_temp.campus('B'))$q$, '');
SELECT pg_temp.assert_eq('campus: pastor A stats for campus B are zeros',
  $q$SELECT pg_temp.stats2(pg_temp.a('PAS'), 'ZZ Lv', NULL, NULL, pg_temp.campus('B'))$q$, '0|0|0|0|0|0|0|0|0');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('campus: admin narrowed to campus B',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'), 'ZZ Lv', NULL, NULL, 'nombre', pg_temp.campus('B'))$q$, 'MB');

-- 8. v1 keeps its columns and its people.
SELECT pg_temp.assert_eq('v1 list: same columns as before',
  $q$SELECT pg_get_function_result('public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)'::regprocedure)$q$,
  'TABLE(id uuid, nombre text, apellido text, email text, telefono text, cedula text, fecha_registro timestamp with time zone, rol_nombre_interno text, rol_nombre_visible text, foto_perfil_url text, total_count bigint, puede_ver boolean)');
SELECT pg_temp.assert_eq('v1 stats: same columns as before',
  $q$SELECT pg_get_function_result('public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)'::regprocedure)$q$,
  'TABLE(total_usuarios bigint, con_email bigint, con_telefono bigint, registrados_hoy bigint)');
SELECT pg_temp.assert_eq('v1 admin: same people as v2',
  $q$SELECT pg_temp.v1(pg_temp.a('ADM'))$q$, 'ADM,LID,M1,M2,M3,MB,PAS');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('v1 pastor: same people as v2',
  $q$SELECT pg_temp.v1(pg_temp.a('PAS'))$q$, 'ADM,LID,M1,M2,M3,PAS');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('v1 lider: same people as v2',
  $q$SELECT pg_temp.v1(pg_temp.a('LID'))$q$, 'LID,M1,M3,MB');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('v1 stats pastor: the first four v2 counts',
  $q$SELECT s.total_usuarios || '|' || s.con_email || '|' || s.con_telefono || '|' || s.registrados_hoy
       FROM public.obtener_estadisticas_usuarios_con_permisos(pg_temp.a('PAS'), 'ZZ Lv') s$q$, '6|1|2|0');

-- 9. Identity and privileges.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('identity: acting for somebody else lists nobody',
  $q$SELECT pg_temp.v2(pg_temp.a('ADM'))$q$, '');
SELECT pg_temp.assert_eq('identity: acting for somebody else counts zeros',
  $q$SELECT pg_temp.stats2(pg_temp.a('ADM'))$q$, '0|0|0|0|0|0|0|0|0');
SELECT pg_temp.assert_eq('privileges: anon cannot run the v2 functions',
  $q$SELECT (has_function_privilege('anon', 'public.listar_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid,boolean,integer,text)', 'execute')
          OR has_function_privilege('anon', 'public.obtener_estadisticas_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,uuid,boolean,integer)', 'execute'))::text$q$, 'false');
SELECT pg_temp.assert_eq('privileges: authenticated and service_role run the v2 functions',
  $q$SELECT (has_function_privilege('authenticated', 'public.listar_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid,boolean,integer,text)', 'execute')
         AND has_function_privilege('authenticated', 'public.obtener_estadisticas_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,uuid,boolean,integer)', 'execute')
         AND has_function_privilege('service_role', 'public.listar_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid,boolean,integer,text)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('privileges: the internal scope function is not callable by clients',
  $q$SELECT (has_function_privilege('authenticated', 'public.usuarios_lista_filtrada(uuid,text,text[],boolean,boolean,boolean,boolean,uuid,boolean,integer)', 'execute')
          OR has_function_privilege('anon', 'public.usuarios_lista_filtrada(uuid,text,text[],boolean,boolean,boolean,boolean,uuid,boolean,integer)', 'execute'))::text$q$, 'false');
SELECT pg_temp.assert_eq('privileges: v1 grants unchanged',
  $q$SELECT (NOT has_function_privilege('anon', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')
         AND has_function_privilege('authenticated', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')
         AND NOT has_function_privilege('anon', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute')
         AND has_function_privilege('authenticated', 'public.obtener_estadisticas_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,uuid)', 'execute'))::text$q$, 'true');
SELECT pg_temp.assert_eq('definer: v2 functions are SECURITY DEFINER with search_path public',
  $q$SELECT count(*)::text FROM pg_proc p
      WHERE p.oid IN ('public.listar_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid,boolean,integer,text)'::regprocedure,
                      'public.obtener_estadisticas_usuarios_con_permisos_v2(uuid,text,text[],boolean,boolean,boolean,uuid,boolean,integer)'::regprocedure,
                      'public.usuarios_lista_filtrada(uuid,text,text[],boolean,boolean,boolean,boolean,uuid,boolean,integer)'::regprocedure)
        AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public']$q$, '3');

-- 10. Gaps from the #620 review. -----------------------------------------------
-- New people (campus A unless noted): DGA director general, DEA director de
-- etapa, MEM miembro in family F with FAM, REL (campus B) related to MEM, NOC
-- with no campus, LX lider who left G1 (fecha_salida). G3 is an eliminado group
-- led by LID with M2.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e9a00000-0000-4000-8000-000000000108', 'authenticated', 'authenticated', 'zzlv-auth-dga@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000109', 'authenticated', 'authenticated', 'zzlv-auth-dea@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000110', 'authenticated', 'authenticated', 'zzlv-auth-mem@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e9a00000-0000-4000-8000-000000000114', 'authenticated', 'authenticated', 'zzlv-auth-lx@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.familias (id, nombre) VALUES
  ('e9a00000-0000-4000-8000-0000000000f1', 'ZZ Lv familia');

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, email, telefono, auth_id, familia_id) VALUES
  ('e9a00000-0000-4000-8000-000000000008', 'ZZ Lv', 'DGA', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000108', NULL),
  ('e9a00000-0000-4000-8000-000000000009', 'ZZ Lv', 'DEA', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000109', NULL),
  ('e9a00000-0000-4000-8000-000000000010', 'ZZ Lv', 'MEM', 'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000110', 'e9a00000-0000-4000-8000-0000000000f1'),
  ('e9a00000-0000-4000-8000-000000000011', 'ZZ Lv', 'FAM', 'Otro', 'Soltero', NULL, NULL, NULL, 'e9a00000-0000-4000-8000-0000000000f1'),
  ('e9a00000-0000-4000-8000-000000000012', 'ZZ Lv', 'REL', 'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e9a00000-0000-4000-8000-000000000013', 'ZZ Lv', 'NOC', 'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e9a00000-0000-4000-8000-000000000014', 'ZZ Lv', 'LX',  'Otro', 'Soltero', NULL, NULL, 'e9a00000-0000-4000-8000-000000000114', NULL);

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT v.usuario_id::uuid, v.campus_id::uuid, true
  FROM (VALUES
    ('e9a00000-0000-4000-8000-000000000008', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000009', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000010', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000011', 'e9a00000-0000-4000-8000-0000000000ca'),
    ('e9a00000-0000-4000-8000-000000000012', 'e9a00000-0000-4000-8000-0000000000cb'),
    ('e9a00000-0000-4000-8000-000000000014', 'e9a00000-0000-4000-8000-0000000000ca')
  ) v(usuario_id, campus_id);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e9a00000-0000-4000-8000-000000000008', 'director-general'),
    ('e9a00000-0000-4000-8000-000000000009', 'director-etapa'),
    ('e9a00000-0000-4000-8000-000000000010', 'miembro'),
    ('e9a00000-0000-4000-8000-000000000014', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('e9a00000-0000-4000-8000-000000000010', 'e9a00000-0000-4000-8000-000000000012', 'otro_familiar');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, eliminado) VALUES
  ('e9a00000-0000-4000-8000-0000000000c3', 'ZZ Lv G3', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9a00000-0000-4000-8000-0000000000a1', true, true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e9a00000-0000-4000-8000-0000000000c3', 'e9a00000-0000-4000-8000-000000000003', 'Líder',   'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c3', 'e9a00000-0000-4000-8000-000000000005', 'Miembro', 'activo', NULL),
  ('e9a00000-0000-4000-8000-0000000000c1', 'e9a00000-0000-4000-8000-000000000014', 'Líder',   'activo', now() - interval '10 days');

-- The fixture surnames of a v2 call with p_contexto_relacion, in order.
CREATE OR REPLACE FUNCTION pg_temp.v2_ctx(p_auth uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(v.apellido, ',' ORDER BY v.n), '')
    FROM (
      SELECT x.apellido, x.nombre, row_number() OVER () AS n
        FROM public.listar_usuarios_con_permisos_v2(p_auth, 'ZZ Lv', '{}', NULL, NULL, NULL, 5000, 0, true) x
    ) v
   WHERE v.nombre = 'ZZ Lv';
$$;

-- Campus A after the new fixtures (NOC and the campus B people excluded).
CREATE OR REPLACE FUNCTION pg_temp.campus_a()
RETURNS text LANGUAGE sql AS $$
  SELECT 'ADM,DEA,DGA,FAM,LID,LX,M1,M2,M3,MEM,PAS'::text;
$$;

SELECT pg_temp.as_user(pg_temp.a('MEM'));
SELECT pg_temp.assert_eq('gaps miembro: family, relations (other campus) and self',
  $q$SELECT pg_temp.v2(pg_temp.a('MEM'))$q$, 'FAM,MEM,REL');
SELECT pg_temp.as_user(pg_temp.a('DGA'));
SELECT pg_temp.assert_eq('gaps director general A: campus A only',
  $q$SELECT pg_temp.v2(pg_temp.a('DGA'))$q$, pg_temp.campus_a());
SELECT pg_temp.assert_eq('gaps director general A asking for campus B: nobody',
  $q$SELECT pg_temp.v2(pg_temp.a('DGA'), 'ZZ Lv', NULL, NULL, 'nombre', pg_temp.campus('B'))$q$, '');
SELECT pg_temp.as_user(pg_temp.a('DEA'));
SELECT pg_temp.assert_eq('gaps director de etapa A: campus A only',
  $q$SELECT pg_temp.v2(pg_temp.a('DEA'))$q$, pg_temp.campus_a());
SELECT pg_temp.assert_eq('gaps director de etapa A asking for campus B: nobody',
  $q$SELECT pg_temp.v2(pg_temp.a('DEA'), 'ZZ Lv', NULL, NULL, 'nombre', pg_temp.campus('B'))$q$, '');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('gaps lider with p_contexto_relacion: campus A plus their groups (MB of campus B)',
  $q$SELECT pg_temp.v2_ctx(pg_temp.a('LID'))$q$, 'ADM,DEA,DGA,FAM,LID,LX,M1,M2,M3,MB,MEM,PAS');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('gaps pastor: a person with no usuario_campus is not listed',
  $q$SELECT pg_temp.v2(pg_temp.a('PAS'))$q$, pg_temp.campus_a());
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('gaps admin: the person with no usuario_campus is listed',
  $q$SELECT (',' || pg_temp.v2(pg_temp.a('ADM')) || ',' LIKE '%,NOC,%')::text$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('gaps v1: acting for somebody else lists nobody',
  $q$SELECT pg_temp.v1(pg_temp.a('ADM'))$q$, '');
SELECT pg_temp.assert_eq('gaps v1: NULL p_auth_id lists nobody',
  $q$SELECT count(*)::text FROM public.listar_usuarios_con_permisos(NULL, 'ZZ Lv', '{}', NULL, NULL, NULL, 5000, 0)$q$, '0');
SELECT pg_temp.assert_eq('gaps v1 stats: NULL p_auth_id counts zeros',
  $q$SELECT s.total_usuarios || '|' || s.con_email || '|' || s.con_telefono || '|' || s.registrados_hoy
       FROM public.obtener_estadisticas_usuarios_con_permisos(NULL, 'ZZ Lv') s$q$, '0|0|0|0');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('gaps es_de_mi_grupo: a member of an eliminado group the caller leads is false',
  $q$SELECT pg_temp.columna(pg_temp.a('LID'), 'es_de_mi_grupo')$q$, 'LID:false,M1:true,M2:false,M3:false,MB:true');
SELECT pg_temp.as_user(pg_temp.a('LX'));
SELECT pg_temp.assert_eq('gaps ex-leader: lists nobody without the relationship context',
  $q$SELECT pg_temp.v2(pg_temp.a('LX'))$q$, '');
SELECT pg_temp.assert_eq('gaps ex-leader: es_de_mi_grupo false for a member of the group they left',
  $q$SELECT v.es_de_mi_grupo::text
       FROM public.listar_usuarios_con_permisos_v2(pg_temp.a('LX'), 'ZZ Lv', '{}', NULL, NULL, NULL, 5000, 0, true) v
      WHERE v.nombre = 'ZZ Lv' AND v.apellido = 'M1'$q$, 'false');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('gaps v1 phone search: local form with spaces',
  $q$SELECT coalesce(string_agg(DISTINCT v.apellido, ','), '')
       FROM public.listar_usuarios_con_permisos(pg_temp.a('ADM'), '0414 555 0101', '{}', NULL, NULL, NULL, 5000, 0) v
      WHERE v.nombre = 'ZZ Lv'$q$, 'M1');
SELECT pg_temp.assert_eq('gaps v1 phone search: +58 form',
  $q$SELECT coalesce(string_agg(DISTINCT v.apellido, ','), '')
       FROM public.listar_usuarios_con_permisos(pg_temp.a('ADM'), '+58 424 555 0202', '{}', NULL, NULL, NULL, 5000, 0) v
      WHERE v.nombre = 'ZZ Lv'$q$, 'M3');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_lv_failures;

ROLLBACK;
