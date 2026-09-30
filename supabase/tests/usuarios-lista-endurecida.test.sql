-- T1 (odd/tasks/usuarios-lista-endurecida.md) — listar_usuarios_con_permisos
-- hardening: static SQL, real caller identity, highest role, no anon access.
--
-- Covers:
--   1. The scope of every role equals what the original function returned for
--      the same fixtures: admin, pastor, director general (scope segmento, only
--      active groups, only members who have not left), director de etapa (no
--      activo filter), lider, miembro (family, relationships, self), and a
--      person with no role.
--   2. A person with pastor + director-general gets the pastor scope.
--   3. p_contexto_relacion = true gives everything to director general,
--      director de etapa and lider, but not to miembro.
--   4. Search: a quote-based payload matches nothing and raises no error; %, _
--      and \ are literal; nombre, apellido, email and cedula still match.
--   5. Identity: another person's auth id returns no rows; no session returns
--      no rows; a service_role call with no session works.
--   6. anon and PUBLIC cannot execute; authenticated and service_role can.
--   7. total_count is the filtered total, and p_limite / p_offset page.
--   8. The other filters (roles, email, group) keep their meaning.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e2000000-... namespace and every fixture person has
-- nombre starting with 'ZZ Ul'. The last statement is a SELECT of the failing
-- cases (empty = all ok), because the MCP tool returns only the last
-- result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ul_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ul_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Identity simulation. The function under test is SECURITY DEFINER, so the
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

-- Newer PostgREST versions publish only the JSON request.jwt.claims setting,
-- never the legacy per-claim ones.
CREATE OR REPLACE FUNCTION pg_temp.as_service_json()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

-- What a call returns: the distinct fixture surnames, then how many distinct
-- non-fixture people came back ("tags|others").
CREATE OR REPLACE FUNCTION pg_temp.seen(
  p_auth uuid,
  p_busqueda text DEFAULT '',
  p_roles text[] DEFAULT '{}',
  p_con_email boolean DEFAULT NULL,
  p_en_grupo boolean DEFAULT NULL,
  p_ctx boolean DEFAULT false
) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT r.apellido, ',' ORDER BY r.apellido) FILTER (WHERE r.nombre LIKE 'ZZ Ul%'), '')
         || '|' || count(DISTINCT r.id) FILTER (WHERE r.nombre NOT LIKE 'ZZ Ul%')
    FROM public.listar_usuarios_con_permisos(p_auth, p_busqueda, p_roles, p_con_email, NULL, p_en_grupo, 5000, 0, p_ctx) r;
$$;

-- Expected text for "everybody": every fixture surname plus every real person.
CREATE OR REPLACE FUNCTION pg_temp.everybody()
RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.usuarios WHERE nombre LIKE 'ZZ Ul%')
         || '|' || (SELECT count(*) FROM public.usuarios WHERE nombre NOT LIKE 'ZZ Ul%');
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('e2000000-0000-4000-8000-0000000000a1', 'ZZ Ul S1'),
  ('e2000000-0000-4000-8000-0000000000a2', 'ZZ Ul S2');

INSERT INTO public.familias (id, nombre) VALUES
  ('e2000000-0000-4000-8000-0000000000f1', 'ZZ Ul familia');

-- Accounts for the people who call the function.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e2000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzul-auth-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzul-auth-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzul-auth-pdg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzul-auth-dg1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzul-auth-de1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'zzul-auth-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'zzul-auth-mem@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000108', 'authenticated', 'authenticated', 'zzul-auth-nor@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- People. Surnames are the tags the assertions read.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, email, cedula, auth_id, familia_id) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'ZZ Ul', 'ADM',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000101', NULL),
  ('e2000000-0000-4000-8000-000000000002', 'ZZ Ul', 'PAS',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000102', NULL),
  ('e2000000-0000-4000-8000-000000000003', 'ZZ Ul', 'PDG',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000103', NULL),
  ('e2000000-0000-4000-8000-000000000004', 'ZZ Ul', 'DG1',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000104', NULL),
  ('e2000000-0000-4000-8000-000000000005', 'ZZ Ul', 'DE1',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000105', NULL),
  ('e2000000-0000-4000-8000-000000000006', 'ZZ Ul', 'LID',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000106', NULL),
  ('e2000000-0000-4000-8000-000000000007', 'ZZ Ul', 'MEM',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000107', 'e2000000-0000-4000-8000-0000000000f1'),
  ('e2000000-0000-4000-8000-000000000008', 'ZZ Ul', 'NOR',  'Otro', 'Soltero', NULL, NULL, 'e2000000-0000-4000-8000-000000000108', NULL),
  ('e2000000-0000-4000-8000-000000000011', 'ZZ Ul', 'P1',   'Otro', 'Soltero', 'zzul-p1@example.test', 'V87650011', NULL, NULL),
  ('e2000000-0000-4000-8000-000000000012', 'ZZ Ul', 'P2',   'Otro', 'Soltero', 'zzul-p2@example.test', NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000013', 'ZZ Ul', 'P3',   'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000014', 'ZZ Ul', 'P4',   'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000015', 'ZZ Ul', 'LEFT', 'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000016', 'ZZ Ul', 'FAM',  'Otro', 'Soltero', NULL, NULL, NULL, 'e2000000-0000-4000-8000-0000000000f1'),
  ('e2000000-0000-4000-8000-000000000017', 'ZZ Ul', 'REL',  'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000018', 'ZZ Ul', 'OUT',  'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000021', 'ZZ Ul 50%',  'PCT',  'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000022', 'ZZ Ul 50x',  'PCTX', 'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000023', 'ZZ Ul a_b',  'USC',  'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000024', 'ZZ Ul aXb',  'USCX', 'Otro', 'Soltero', NULL, NULL, NULL, NULL),
  ('e2000000-0000-4000-8000-000000000025', 'ZZ Ul c\d',  'BSL',  'Otro', 'Soltero', NULL, NULL, NULL, NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e2000000-0000-4000-8000-000000000001', 'admin'),
    ('e2000000-0000-4000-8000-000000000002', 'pastor'),
    ('e2000000-0000-4000-8000-000000000003', 'pastor'),
    ('e2000000-0000-4000-8000-000000000003', 'director-general'),
    ('e2000000-0000-4000-8000-000000000004', 'director-general'),
    ('e2000000-0000-4000-8000-000000000005', 'director-etapa'),
    ('e2000000-0000-4000-8000-000000000006', 'lider'),
    ('e2000000-0000-4000-8000-000000000007', 'miembro')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

-- Groups: G1, G2, G4 active; G3 inactive. G1, G2, G3 in S1; G4 in S2.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e2000000-0000-4000-8000-0000000000c1', 'ZZ Ul G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e2000000-0000-4000-8000-0000000000a1', true),
  ('e2000000-0000-4000-8000-0000000000c2', 'ZZ Ul G2', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e2000000-0000-4000-8000-0000000000a1', true),
  ('e2000000-0000-4000-8000-0000000000c3', 'ZZ Ul G3', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e2000000-0000-4000-8000-0000000000a1', false),
  ('e2000000-0000-4000-8000-0000000000c4', 'ZZ Ul G4', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e2000000-0000-4000-8000-0000000000a2', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida) VALUES
  ('e2000000-0000-4000-8000-0000000000c1', 'e2000000-0000-4000-8000-000000000006', 'Líder', NULL),
  ('e2000000-0000-4000-8000-0000000000c1', 'e2000000-0000-4000-8000-000000000011', 'Miembro', NULL),
  ('e2000000-0000-4000-8000-0000000000c1', 'e2000000-0000-4000-8000-000000000015', 'Miembro', now()),
  ('e2000000-0000-4000-8000-0000000000c2', 'e2000000-0000-4000-8000-000000000012', 'Miembro', NULL),
  ('e2000000-0000-4000-8000-0000000000c3', 'e2000000-0000-4000-8000-000000000013', 'Miembro', NULL),
  ('e2000000-0000-4000-8000-0000000000c4', 'e2000000-0000-4000-8000-000000000014', 'Miembro', NULL);

-- DG1 and PDG hold segment S1 with the whole-segment scope.
INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-0000000000a1', 'segmento'),
  ('e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-0000000000a1', 'segmento');

-- DE1 directs G1 and the inactive G3.
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-0000000000a1', 'e2000000-0000-4000-8000-000000000005', 'director_etapa');
INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-0000000000c1'),
  ('e2000000-0000-4000-8000-0000000000b1', 'e2000000-0000-4000-8000-0000000000c3');

-- MEM is related to REL (and shares a family with FAM).
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('e2000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000017', 'otro_familiar');

-- Cases ----------------------------------------------------------------------

-- 1. Scope of every role (values recorded from the original function).
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000101');
SELECT pg_temp.assert_eq('admin sees everybody',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101')$q$, pg_temp.everybody());
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000102');
SELECT pg_temp.assert_eq('pastor sees everybody',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000102')$q$, pg_temp.everybody());
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000104');
SELECT pg_temp.assert_eq('director general: active groups of the segment, members still in',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104')$q$, 'LID,P1,P2|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000105');
SELECT pg_temp.assert_eq('director de etapa: own groups, inactive ones included',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000105')$q$, 'LID,P1,P3|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000106');
SELECT pg_temp.assert_eq('lider: members of the groups they lead',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106')$q$, 'LID,P1|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000107');
SELECT pg_temp.assert_eq('miembro: family, relationships and self',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000107')$q$, 'FAM,MEM,REL|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000108');
SELECT pg_temp.assert_eq('person with no role sees nothing',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000108')$q$, '|0');

-- 2. Highest role wins: pastor + director-general sees everybody.
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000103');
SELECT pg_temp.assert_eq('pastor + director-general gets the pastor scope',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000103')$q$, pg_temp.everybody());
-- One row per role is kept: the two-role person appears twice for an admin.
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000101');
SELECT pg_temp.assert_eq('a person with two roles keeps one row per role',
  $q$SELECT count(*) FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000101', 'ZZ Ul', '{}', NULL, NULL, NULL, 5000, 0, false) r WHERE r.apellido = 'PDG'$q$, '2');

-- 3. p_contexto_relacion.
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000104');
SELECT pg_temp.assert_eq('contexto: director general sees everybody',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104', '', '{}', NULL, NULL, true)$q$, pg_temp.everybody());
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000105');
SELECT pg_temp.assert_eq('contexto: director de etapa sees everybody',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000105', '', '{}', NULL, NULL, true)$q$, pg_temp.everybody());
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000106');
SELECT pg_temp.assert_eq('contexto: lider sees everybody',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106', '', '{}', NULL, NULL, true)$q$, pg_temp.everybody());
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000107');
SELECT pg_temp.assert_eq('contexto: miembro keeps the family scope',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000107', '', '{}', NULL, NULL, true)$q$, 'FAM,MEM,REL|0');

-- 4. Search.
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000106');
SELECT pg_temp.assert_eq('quote payload returns no rows and raises no error (lider)',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106', $p$' OR 1=1 --$p$)$q$, '|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000101');
SELECT pg_temp.assert_eq('quote payload returns no rows (admin)',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', $p$' OR 1=1 --$p$)$q$, '|0');
SELECT pg_temp.assert_eq('percent is a literal',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul 50%')$q$, 'PCT|0');
SELECT pg_temp.assert_eq('underscore is a literal',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul a_b')$q$, 'USC|0');
SELECT pg_temp.assert_eq('backslash is a literal',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul c\d')$q$, 'BSL|0');
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000104');
SELECT pg_temp.assert_eq('search by nombre, case-insensitive',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104', 'zz ul')$q$, 'LID,P1,P2|0');
SELECT pg_temp.assert_eq('search by apellido',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104', 'p2')$q$, 'P2|0');
SELECT pg_temp.assert_eq('search by email',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104', 'zzul-p1@')$q$, 'P1|0');
SELECT pg_temp.assert_eq('search by cedula',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104',
       (SELECT cedula FROM public.usuarios WHERE id = 'e2000000-0000-4000-8000-000000000011'))$q$, 'P1|0');
SELECT pg_temp.assert_eq('search stays inside the scope',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000104', 'P4')$q$, '|0');

-- 5. Identity.
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000106');
SELECT pg_temp.assert_eq('another person''s auth id returns no rows',
  $q$SELECT count(*) FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000101', '', '{}', NULL, NULL, NULL, 5000, 0, false)$q$, '0');
SELECT pg_temp.assert_eq('own auth id still works',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106')$q$, 'LID,P1|0');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('no session returns no rows',
  $q$SELECT count(*) FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000106', '', '{}', NULL, NULL, NULL, 5000, 0, false)$q$, '0');
SELECT pg_temp.assert_eq('no session, null auth id returns no rows',
  $q$SELECT count(*) FROM public.listar_usuarios_con_permisos(NULL, '', '{}', NULL, NULL, NULL, 5000, 0, false)$q$, '0');
SELECT pg_temp.as_service();
SELECT pg_temp.assert_eq('service_role with no session can pass p_auth_id',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106')$q$, 'LID,P1|0');
SELECT pg_temp.as_service_json();
SELECT pg_temp.assert_eq('service_role published only as JSON claims can pass p_auth_id',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000106')$q$, 'LID,P1|0');

-- 6. Privileges.
SELECT pg_temp.assert_eq('anon cannot execute',
  $q$SELECT has_function_privilege('anon', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('PUBLIC cannot execute',
  $q$SELECT count(*) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)'::regprocedure
        AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('authenticated can execute',
  $q$SELECT has_function_privilege('authenticated', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')$q$, 'true');
SELECT pg_temp.assert_eq('service_role can execute',
  $q$SELECT has_function_privilege('service_role', 'public.listar_usuarios_con_permisos(uuid,text,text[],boolean,boolean,boolean,integer,integer,boolean,uuid)', 'execute')$q$, 'true');

-- 7. total_count and paging (director general scope: LID, P1, P2).
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000104');
SELECT pg_temp.assert_eq('page 1: two rows, total is the filtered total',
  $q$SELECT string_agg(r.apellido, ',') || '|' || max(r.total_count)
       FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000104', '', '{}', NULL, NULL, NULL, 2, 0, false) r$q$, 'LID,P1|3');
SELECT pg_temp.assert_eq('page 2: the remaining row, same total',
  $q$SELECT string_agg(r.apellido, ',') || '|' || max(r.total_count)
       FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000104', '', '{}', NULL, NULL, NULL, 2, 2, false) r$q$, 'P2|3');
SELECT pg_temp.assert_eq('total reflects the search filter',
  $q$SELECT max(r.total_count)
       FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000104', 'p1', '{}', NULL, NULL, NULL, 1, 0, false) r$q$, '1');
SELECT pg_temp.assert_eq('offset past the end returns no rows',
  $q$SELECT count(*) FROM public.listar_usuarios_con_permisos('e2000000-0000-4000-8000-000000000104', '', '{}', NULL, NULL, NULL, 2, 50, false)$q$, '0');

-- 8. The other filters keep their meaning (admin caller).
SELECT pg_temp.as_user('e2000000-0000-4000-8000-000000000101');
SELECT pg_temp.assert_eq('roles filter',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', '', '{pastor}')$q$, 'PAS,PDG|' || (SELECT count(DISTINCT ur.usuario_id) FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id JOIN public.usuarios u ON u.id = ur.usuario_id WHERE rs.nombre_interno = 'pastor' AND u.nombre NOT LIKE 'ZZ Ul%'));
SELECT pg_temp.assert_eq('with email filter',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul', '{}', true)$q$, 'P1,P2|0');
SELECT pg_temp.assert_eq('without group filter',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul', '{}', NULL, false) LIKE 'ADM,%' AND pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul', '{}', NULL, false) NOT LIKE '%P1%'$q$, 'true');
SELECT pg_temp.assert_eq('in group filter',
  $q$SELECT pg_temp.seen('e2000000-0000-4000-8000-000000000101', 'ZZ Ul', '{}', NULL, true)$q$, 'LID,P1,P2,P3,P4|0');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_ul_failures;

ROLLBACK;
