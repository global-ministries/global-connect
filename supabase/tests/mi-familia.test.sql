-- Mi familia (20261101200000_mi_familia.sql; odd/tasks/sistema-diseno-v2.md,
-- S15, task T11a).
--
-- Covers, with two fixture campuses A and B and a person with no campus:
--   A. familia_buscar: at least 3 letters, masked keys only (no photo, phone,
--      email, cédula or age), the caller's main campus only, at most 8, the
--      homonimo flag, leaves out self, children, people without account,
--      relatives and open requests; daily limit; no session.
--   B. familia_verificar: match / no match by day + month and by the last 4
--      cédula digits, bad parameters, somebody else's token, the attempt
--      limit; familia_solicitar refuses a homonym without verification.
--   C. Requests with account: open-pair uniqueness, responder only by the
--      destino, cancelar only by the solicitante, accept writes the right
--      direction (padre, hijo, hermano), reject, one spouse, tipo tutor.
--   D. familia_quitar by either side, fichas stay; children go to Mis hijos.
--   E. familia_solicitar_sin_cuenta: under 13, unknown keys, bad data, dedupe
--      by cédula and by name + birth date with the same answer as a new
--      person, duplicates, daily limit.
--   F. familia_resolver / familia_pendientes_listar: only a person able to
--      edit both people; the ficha with creado_por and campus; the creator
--      edits it until it has an account.
--   G. Identity: no session, a session without ficha.
--   H. Privileges, definer flag and search_path; tables closed.
--   I. PRESERVE: the puede_editar_usuario cases of campus-pastor-global.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- rows live under this file's own e7000000-0000-4000-9000-... namespace and
-- every fixture person has nombre 'ZZ Mf'. Every RPC call sits inside an
-- assertion, so before the migration the suite still ends with the list of
-- failing cases. The last statement is a SELECT of the failing cases (empty =
-- all ok), because the MCP tool returns only the last result-producing
-- statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mf_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_mf_ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mf_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- 'ok' when p_sql runs, otherwise its SQLSTATE.
CREATE OR REPLACE FUNCTION pg_temp.outcome(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLSTATE;
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
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ Mf' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Mf' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.keep(p_k text, p_v uuid)
RETURNS text LANGUAGE sql AS $$
  INSERT INTO t_mf_ids(k, v) VALUES (p_k, p_v)
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v
  RETURNING CASE WHEN v IS NULL THEN 'missing' ELSE 'kept' END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_k text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT v FROM t_mf_ids WHERE k = p_k;
$$;

-- The link between two fixture people: '<usuario1>><usuario2>:<tipo>' or 'none'.
CREATE OR REPLACE FUNCTION pg_temp.rel(p_uno text, p_dos text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(u1.apellido || '>' || u2.apellido || ':' || ru.tipo_relacion, ',')
                     FROM public.relaciones_usuarios ru
                     JOIN public.usuarios u1 ON u1.id = ru.usuario1_id
                     JOIN public.usuarios u2 ON u2.id = ru.usuario2_id
                    WHERE LEAST(ru.usuario1_id, ru.usuario2_id) = LEAST(pg_temp.u(p_uno), pg_temp.u(p_dos))
                      AND GREATEST(ru.usuario1_id, ru.usuario2_id) = GREATEST(pg_temp.u(p_uno), pg_temp.u(p_dos))),
                  'none');
$$;

CREATE OR REPLACE FUNCTION pg_temp.rel_id(p_uno text, p_dos text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT ru.id FROM public.relaciones_usuarios ru
   WHERE LEAST(ru.usuario1_id, ru.usuario2_id) = LEAST(pg_temp.u(p_uno), pg_temp.u(p_dos))
     AND GREATEST(ru.usuario1_id, ru.usuario2_id) = GREATEST(pg_temp.u(p_uno), pg_temp.u(p_dos));
$$;

-- The RPCs called as the tagged person (session role postgres).
CREATE OR REPLACE FUNCTION pg_temp.buscar(p_tag text, p_q text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_buscar(p_q);
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

-- The token a search of p_tag hands out for p_target (looked up as postgres,
-- because homonyms look the same on purpose). plpgsql, so the file loads
-- before the migration too.
CREATE OR REPLACE FUNCTION pg_temp.tok(p_tag text, p_q text, p_target text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb := pg_temp.buscar(p_tag, p_q);
  v_tok uuid;
BEGIN
  SELECT (r.value ->> 'token')::uuid INTO v_tok
    FROM jsonb_array_elements(v_res -> 'resultados') r
    JOIN public.familia_candidatos c ON c.token = (r.value ->> 'token')::uuid
   WHERE c.candidato_id = pg_temp.u(p_target);
  RETURN v_tok;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.verificar(p_tag text, p_tok uuid, p_dia int, p_mes int, p_ult4 text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_verificar(p_tok, p_dia, p_mes, p_ult4);
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.solicitar(p_tag text, p_tok uuid, p_tipo text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_solicitar(p_tok, p_tipo::public.enum_tipo_relacion);
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.sin_cuenta(p_tag text, p_datos jsonb, p_tipo text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_solicitar_sin_cuenta(p_datos, p_tipo::public.enum_tipo_relacion);
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mis(p_tag text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_mis_solicitudes();
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

-- p_accion: responder | rechazar | cancelar | quitar | aprobar | denegar.
CREATE OR REPLACE FUNCTION pg_temp.accion(p_tag text, p_accion text, p_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := CASE p_accion
         WHEN 'responder' THEN public.familia_responder(p_id, true)
         WHEN 'rechazar' THEN public.familia_responder(p_id, false)
         WHEN 'cancelar' THEN public.familia_cancelar(p_id)
         WHEN 'quitar' THEN public.familia_quitar(p_id)
         WHEN 'aprobar' THEN public.familia_resolver(p_id, true)
         WHEN 'denegar' THEN public.familia_resolver(p_id, false)
       END;
  PERFORM pg_temp.as_nobody();
  RETURN v ->> 'codigo';
END;
$$;

-- The ids of the requests p_tag may resolve, as text.
CREATE OR REPLACE FUNCTION pg_temp.pendientes(p_tag text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  v := public.familia_pendientes_listar();
  PERFORM pg_temp.as_nobody();
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.editar(p_tag text, p_target text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.puede_editar_usuario(pg_temp.a(p_tag), pg_temp.u(p_target))::text;
END;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e7000000-0000-4000-9000-0000000000ca', 'ZZ Mf Campus A', 'ZZMFA'),
  ('e7000000-0000-4000-9000-0000000000cb', 'ZZ Mf Campus B', 'ZZMFB');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e7000000-0000-4000-9000-0000000000a1', 'ZZ Mf S1');

-- People (n, tag = apellido, campus, role, account, birth date, cédula).
--   Campus A: Yo (the main actor), Hermano, Gil Ruiz / Gil Rios (homonyms on
--     screen: "ZZ Mf Gil R."), Pastora, Lidera (leads G1 with Yo and Mb),
--     Otro (married to Espo), Nino (8 years, child of Yo), Nina (8 years),
--     Sinc / Sinn / Espo (no account), Rel (related to Yo), Adm, De (director
--     de etapa of G1), Dg, Limite, Lote01..Lote10.
--   Campus B: Campusb, Pastorb, Mb (no account, member of G1).
--   No campus: Noc (no account).
CREATE TEMP TABLE t_mf_people (n int, tag text, campus text, rol text, cuenta boolean, nac date, cedula text) ON COMMIT DROP;
INSERT INTO t_mf_people VALUES
  (1, 'Yo', 'A', 'miembro', true, '1990-05-10', NULL),
  (2, 'Hermano', 'A', 'miembro', true, '1992-03-04', 'E990001002'),
  (3, 'Gil Ruiz', 'A', NULL, true, '1980-07-15', 'E990001003'),
  (4, 'Gil Rios', 'A', NULL, true, '1981-02-20', NULL),
  (5, 'Pastora', 'A', 'pastor', true, '1970-01-01', NULL),
  (6, 'Lidera', 'A', 'lider', true, '1975-01-01', NULL),
  (7, 'Otro', 'A', 'miembro', true, '1985-01-01', NULL),
  (8, 'Campusb', 'B', NULL, true, '1985-01-01', NULL),
  (9, 'Pastorb', 'B', 'pastor', true, '1970-01-01', NULL),
  (10, 'Nino', 'A', NULL, true, (current_date - interval '8 years')::date, NULL),
  (11, 'Sinc', 'A', NULL, false, '1960-01-01', 'E990001011'),
  (12, 'Sinn', 'A', NULL, false, '1955-06-06', NULL),
  (13, 'Espo', 'A', NULL, false, '1985-01-01', NULL),
  (14, 'Rel', 'A', NULL, true, '1985-01-01', NULL),
  (15, 'Adm', 'A', 'admin', true, '1970-01-01', NULL),
  (16, 'De', 'A', 'director-etapa', true, '1970-01-01', NULL),
  (17, 'Dg', 'A', 'director-general', true, '1970-01-01', NULL),
  (18, 'Noc', NULL, NULL, false, '1985-01-01', NULL),
  (19, 'Mb', 'B', NULL, false, '1985-01-01', NULL),
  (20, 'Limite', 'A', NULL, true, '1985-01-01', NULL),
  (21, 'Nina', 'A', NULL, true, (current_date - interval '8 years')::date, NULL);
INSERT INTO t_mf_people
SELECT 30 + g, 'Lote' || lpad(g::text, 2, '0'), 'A', NULL, true, '1960-01-01', NULL FROM generate_series(1, 10) g;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('e7000000-0000-4000-9000-0000000001' || lpad(p.n::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       'zzmf-auth-' || p.n || '@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM t_mf_people p
 WHERE p.cuenta
UNION ALL
-- fe: a session with no ficha; ff: the account the new ficha gets in F.
SELECT ('e7000000-0000-4000-9000-0000000001' || x)::uuid, 'authenticated', 'authenticated',
       'zzmf-auth-' || x || '@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM (VALUES ('fe'), ('ff')) v(x);

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id, fecha_nacimiento, cedula, telefono, email)
SELECT ('e7000000-0000-4000-9000-0000000000' || lpad(p.n::text, 2, '0'))::uuid, 'ZZ Mf', p.tag, 'Otro', 'Soltero',
       CASE WHEN p.cuenta THEN ('e7000000-0000-4000-9000-0000000001' || lpad(p.n::text, 2, '0'))::uuid END,
       p.nac, p.cedula,
       CASE WHEN p.tag = 'Hermano' THEN '04140000002' END,
       CASE WHEN p.tag = 'Hermano' THEN 'zzmf-hermano@example.test' END
  FROM t_mf_people p;

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.u(p.tag),
       CASE p.campus WHEN 'A' THEN 'e7000000-0000-4000-9000-0000000000ca'::uuid ELSE 'e7000000-0000-4000-9000-0000000000cb'::uuid END,
       true
  FROM t_mf_people p
 WHERE p.campus IS NOT NULL;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(p.tag), rs.id
  FROM t_mf_people p
  JOIN public.roles_sistema rs ON rs.nombre_interno = p.rol;

-- G1 (active) led by Lidera, with Yo and Mb (campus B); De is its director de etapa.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e7000000-0000-4000-9000-0000000000c1', 'ZZ Mf G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e7000000-0000-4000-9000-0000000000a1', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida) VALUES
  ('e7000000-0000-4000-9000-0000000000c1', pg_temp.u('Lidera'), 'Líder',   'activo', NULL),
  ('e7000000-0000-4000-9000-0000000000c1', pg_temp.u('Yo'),     'Miembro', 'activo', NULL),
  ('e7000000-0000-4000-9000-0000000000c1', pg_temp.u('Mb'),     'Miembro', 'activo', NULL);

INSERT INTO public.segmento_lideres (id, usuario_id, segmento_id, tipo_lider) VALUES
  ('e7000000-0000-4000-9000-0000000000b1', pg_temp.u('De'), 'e7000000-0000-4000-9000-0000000000a1', 'director_etapa');

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e7000000-0000-4000-9000-0000000000b1', 'e7000000-0000-4000-9000-0000000000c1');

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.u('Otro'), pg_temp.u('Espo'), 'conyuge', true),
  (pg_temp.u('Yo'),   pg_temp.u('Rel'),  'otro_familiar', false),
  (pg_temp.u('Nino'), pg_temp.u('Yo'),   'padre', true);

-- Cases ----------------------------------------------------------------------

-- A. familia_buscar.
SELECT pg_temp.assert_eq('buscar: fewer than 3 letters is BUSQUEDA_CORTA',
  $q$SELECT pg_temp.buscar('Yo', 'zz 12') ->> 'codigo'$q$, 'BUSQUEDA_CORTA');
SELECT pg_temp.assert_eq('buscar: 3 letters are enough',
  $q$SELECT (pg_temp.buscar('Yo', 'z z m') ->> 'ok')$q$, 'true');
SELECT pg_temp.assert_eq('buscar mask: a result holds only the masked keys',
  $q$SELECT string_agg(k, ',' ORDER BY k)
       FROM jsonb_object_keys(pg_temp.buscar('Yo', 'zz mf her') -> 'resultados' -> 0) k$q$,
  'campus,homonimo,inicial_segundo_apellido,nombres,primer_apellido,token');
SELECT pg_temp.assert_eq('buscar mask: values (no second surname -> null initial, campus name)',
  $q$SELECT concat_ws('|', r ->> 'nombres', r ->> 'primer_apellido', coalesce(r ->> 'inicial_segundo_apellido', 'null'),
                         r ->> 'campus', r ->> 'homonimo', ((r ->> 'token') <> pg_temp.u('Hermano')::text)::text)
       FROM (SELECT pg_temp.buscar('Yo', 'zz mf her') -> 'resultados' -> 0 AS r) x$q$,
  'ZZ Mf|Hermano|null|ZZ Mf Campus A|false|true');
SELECT pg_temp.assert_eq('buscar mask: no id, cédula, phone, email, birth date or photo in the answer',
  $q$SELECT (position(u.id::text IN t) + position('990001002' IN t) + position(u.telefono IN t)
             + position(u.email IN t) + position(u.fecha_nacimiento::text IN t) + position('foto' IN t))::text
       FROM public.usuarios u, (SELECT pg_temp.buscar('Yo', 'zz mf her')::text AS t) x
      WHERE u.id = pg_temp.u('Hermano')$q$, '0');
SELECT pg_temp.assert_eq('buscar homonimo: two people show "Gil R." and both are flagged',
  $q$SELECT string_agg(r ->> 'primer_apellido' || ' ' || (r ->> 'inicial_segundo_apellido') || ' ' || (r ->> 'homonimo'), ',')
       FROM jsonb_array_elements(pg_temp.buscar('Yo', 'zz mf gil') -> 'resultados') r$q$,
  'Gil R true,Gil R true');
SELECT pg_temp.assert_eq('buscar: at most 8 results',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf lote') -> 'resultados')::text$q$, '8');
SELECT pg_temp.assert_eq('buscar campus: a person of campus B is not found from campus A',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf campusb') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('buscar campus: the same person is found from campus B',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Pastorb', 'zz mf campusb') -> 'resultados')::text$q$, '1');
SELECT pg_temp.assert_eq('buscar: an existing relative is left out',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf rel') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('buscar: a child under 13 is left out',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf nina') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('buscar: a ficha without account is left out',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf sinc') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('buscar: the caller is left out',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf yo') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('buscar limit: 40 searches in a day are answered',
  $q$SELECT count(*)::text FROM generate_series(1, 40) g
      WHERE (pg_temp.buscar('Limite', 'zz mf her') ->> 'ok')::boolean$q$, '40');
SELECT pg_temp.assert_eq('buscar limit: the 41st is LIMITE_BUSQUEDAS',
  $q$SELECT pg_temp.buscar('Limite', 'zz mf her') ->> 'codigo'$q$, 'LIMITE_BUSQUEDAS');

-- B. familia_verificar and the homonym gate.
SELECT pg_temp.assert_eq('setup: Yo gets the token of Gil Ruiz',
  $q$SELECT pg_temp.keep('t_ruiz', pg_temp.tok('Yo', 'zz mf gil', 'Gil Ruiz'))$q$, 'kept');
SELECT pg_temp.assert_eq('setup: Yo gets the token of Gil Rios',
  $q$SELECT pg_temp.keep('t_rios', pg_temp.tok('Yo', 'zz mf gil', 'Gil Rios'))$q$, 'kept');
SELECT pg_temp.assert_eq('verificar: wrong day + month answers only {ok, coincide: false}',
  $q$SELECT pg_temp.verificar('Yo', pg_temp.id('t_ruiz'), 16, 7, NULL)::text$q$, '{"ok": true, "coincide": false}');
SELECT pg_temp.assert_eq('solicitar: a homonym without verification is VERIFICACION_REQUERIDA',
  $q$SELECT pg_temp.solicitar('Yo', pg_temp.id('t_ruiz'), 'hermano') ->> 'codigo'$q$, 'VERIFICACION_REQUERIDA');
SELECT pg_temp.assert_eq('solicitar: the other homonym, also unverified, is refused',
  $q$SELECT pg_temp.solicitar('Yo', pg_temp.id('t_rios'), 'hermano') ->> 'codigo'$q$, 'VERIFICACION_REQUERIDA');
SELECT pg_temp.assert_eq('verificar: right day + month matches',
  $q$SELECT pg_temp.verificar('Yo', pg_temp.id('t_ruiz'), 15, 7, NULL)::text$q$, '{"ok": true, "coincide": true}');
SELECT pg_temp.assert_eq('solicitar: the verified homonym is ENVIADA',
  $q$SELECT pg_temp.solicitar('Yo', pg_temp.id('t_ruiz'), 'hermano') ->> 'codigo'$q$, 'ENVIADA');
SELECT pg_temp.assert_eq('verificar: the last 4 cédula digits match',
  $q$SELECT pg_temp.verificar('Hermano', pg_temp.tok('Hermano', 'zz mf gil', 'Gil Ruiz'), NULL, NULL, '1003') ->> 'coincide'$q$, 'true');
SELECT pg_temp.assert_eq('verificar: other last 4 digits do not match',
  $q$SELECT pg_temp.verificar('Hermano', pg_temp.tok('Hermano', 'zz mf gil', 'Gil Ruiz'), NULL, NULL, '1004') ->> 'coincide'$q$, 'false');
SELECT pg_temp.assert_eq('verificar: a person with no cédula never matches by digits',
  $q$SELECT pg_temp.verificar('Hermano', pg_temp.tok('Hermano', 'zz mf gil', 'Gil Rios'), NULL, NULL, '0000') ->> 'coincide'$q$, 'false');
SELECT pg_temp.assert_eq('verificar: day without month is PARAMETROS_INVALIDOS',
  $q$SELECT pg_temp.verificar('Yo', pg_temp.id('t_rios'), 20, NULL, NULL) ->> 'codigo'$q$, 'PARAMETROS_INVALIDOS');
SELECT pg_temp.assert_eq('verificar identity: somebody else''s token is NO_ENCONTRADO',
  $q$SELECT pg_temp.verificar('Otro', pg_temp.id('t_rios'), 20, 2, NULL) ->> 'codigo'$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('solicitar identity: somebody else''s token is NO_ENCONTRADO',
  $q$SELECT pg_temp.solicitar('Otro', pg_temp.id('t_rios'), 'hermano') ->> 'codigo'$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('setup: Otro gets the token of Gil Ruiz',
  $q$SELECT pg_temp.keep('t_otro_ruiz', pg_temp.tok('Otro', 'zz mf gil', 'Gil Ruiz'))$q$, 'kept');
SELECT pg_temp.assert_eq('verificar limit: 5 attempts in a day are answered',
  $q$SELECT count(*)::text FROM generate_series(1, 5) g
      WHERE pg_temp.verificar('Otro', pg_temp.id('t_otro_ruiz'), 1, 1, NULL) ->> 'coincide' = 'false'$q$, '5');
SELECT pg_temp.assert_eq('verificar limit: the 6th, even with the right datum, is LIMITE_INTENTOS',
  $q$SELECT pg_temp.verificar('Otro', pg_temp.id('t_otro_ruiz'), 15, 7, NULL)::text$q$, '{"ok": false, "codigo": "LIMITE_INTENTOS"}');
SELECT pg_temp.assert_eq('verificar limit: the blocked homonym still cannot be requested',
  $q$SELECT pg_temp.solicitar('Otro', pg_temp.id('t_otro_ruiz'), 'hermano') ->> 'codigo'$q$, 'VERIFICACION_REQUERIDA');

-- C. Requests with account.
SELECT pg_temp.assert_eq('setup: Yo gets the token of Hermano',
  $q$SELECT pg_temp.keep('t_her', pg_temp.tok('Yo', 'zz mf her', 'Hermano'))$q$, 'kept');
SELECT pg_temp.assert_eq('solicitar: a tutor link is TIPO_INVALIDO',
  $q$SELECT pg_temp.solicitar('Yo', pg_temp.id('t_her'), 'tutor') ->> 'codigo'$q$, 'TIPO_INVALIDO');
SELECT pg_temp.assert_eq('solicitar: Yo asks Hermano (no homonym, no verification needed)',
  $q$SELECT pg_temp.keep('s_her', (pg_temp.solicitar('Yo', pg_temp.id('t_her'), 'hermano') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('solicitar: the same pair again is YA_SOLICITADO',
  $q$SELECT pg_temp.solicitar('Yo', pg_temp.id('t_her'), 'hermano') ->> 'codigo'$q$, 'YA_SOLICITADO');
SELECT pg_temp.assert_eq('buscar: a person with an open request is left out',
  $q$SELECT jsonb_array_length(pg_temp.buscar('Yo', 'zz mf her') -> 'resultados')::text$q$, '0');
SELECT pg_temp.assert_eq('open pair: the reverse open request violates the unique index',
  format($q$SELECT pg_temp.outcome(%L)$q$,
         format('INSERT INTO public.solicitudes_relacion_familiar (solicitante_id, destino_id, tipo_relacion) VALUES (%L, %L, ''hermano'')',
                pg_temp.u('Hermano'), pg_temp.u('Yo'))), '23505');
SELECT pg_temp.assert_eq('mis: Hermano receives "Yo says they are your hermano"',
  $q$SELECT string_agg(concat_ws('|', r ->> 'relacion', r ->> 'nombre', r ->> 'apellido', (r ->> 'id' = pg_temp.id('s_her')::text)::text), ',')
       FROM jsonb_array_elements(pg_temp.mis('Hermano') -> 'recibidas') r$q$, 'hermano|ZZ Mf|Yo|true');
SELECT pg_temp.assert_eq('mis: Yo sees the sent requests masked, waiting for the person',
  $q$SELECT string_agg(concat_ws('|', r ->> 'apellido', r ->> 'tipo_relacion', r ->> 'espera'), ',' ORDER BY r ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.mis('Yo') -> 'enviadas') r$q$, 'Gil R.|hermano|persona,Hermano|hermano|persona');
SELECT pg_temp.assert_eq('responder: a third person gets NO_ENCONTRADO',
  $q$SELECT pg_temp.accion('Otro', 'responder', pg_temp.id('s_her'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('responder: the solicitante cannot confirm their own request',
  $q$SELECT pg_temp.accion('Yo', 'responder', pg_temp.id('s_her'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('cancelar: the destino cannot cancel',
  $q$SELECT pg_temp.accion('Hermano', 'cancelar', pg_temp.id('s_her'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('responder: a missing request is NO_ENCONTRADO too',
  $q$SELECT pg_temp.accion('Hermano', 'responder', gen_random_uuid())$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('relation: nothing before the destino confirms',
  $q$SELECT pg_temp.rel('Yo', 'Hermano')$q$, 'none');
SELECT pg_temp.assert_eq('responder: Hermano confirms',
  $q$SELECT pg_temp.accion('Hermano', 'responder', pg_temp.id('s_her'))$q$, 'CONFIRMADA');
SELECT pg_temp.assert_eq('relation hermano: usuario2 (Hermano) is hermano of usuario1 (Yo)',
  $q$SELECT pg_temp.rel('Yo', 'Hermano')$q$, 'Yo>Hermano:hermano');
SELECT pg_temp.assert_eq('responder: a resolved request is YA_RESUELTO',
  $q$SELECT pg_temp.accion('Hermano', 'responder', pg_temp.id('s_her'))$q$, 'YA_RESUELTO');
SELECT pg_temp.assert_eq('mis: after confirming, Hermano sees Yo as hermano with account',
  $q$SELECT string_agg(concat_ws('|', r ->> 'relacion', r ->> 'apellido', r ->> 'cuenta', r ->> 'puedo_editar'), ',')
       FROM jsonb_array_elements(pg_temp.mis('Hermano') -> 'familiares') r$q$, 'hermano|Yo|true|false');

SELECT pg_temp.assert_eq('setup: Yo says Lote01 is their padre',
  $q$SELECT pg_temp.keep('s_l1', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf lote01', 'Lote01'), 'padre') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('responder: Lote01 confirms the padre link',
  $q$SELECT pg_temp.accion('Lote01', 'responder', pg_temp.id('s_l1'))$q$, 'CONFIRMADA');
SELECT pg_temp.assert_eq('relation padre: usuario2 (Lote01) is padre of usuario1 (Yo)',
  $q$SELECT pg_temp.rel('Yo', 'Lote01')$q$, 'Yo>Lote01:padre');
SELECT pg_temp.assert_eq('setup: Yo says Lote02 is their hijo',
  $q$SELECT pg_temp.keep('s_l2', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf lote02', 'Lote02'), 'hijo') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('responder: Lote02 confirms the hijo link',
  $q$SELECT pg_temp.accion('Lote02', 'responder', pg_temp.id('s_l2'))$q$, 'CONFIRMADA');
SELECT pg_temp.assert_eq('relation hijo: stored the Niños way, Yo (usuario2) is padre of Lote02 (usuario1)',
  $q$SELECT pg_temp.rel('Yo', 'Lote02')$q$, 'Lote02>Yo:padre');
SELECT pg_temp.assert_eq('mis: Yo sees Lote01 as padre and Lote02 as hijo',
  $q$SELECT string_agg(r ->> 'apellido' || ':' || (r ->> 'relacion'), ',' ORDER BY r ->> 'apellido')
       FROM jsonb_array_elements(pg_temp.mis('Yo') -> 'familiares') r
      WHERE r ->> 'apellido' IN ('Lote01', 'Lote02')$q$, 'Lote01:padre,Lote02:hijo');
SELECT pg_temp.assert_eq('mis: Lote01 sees Yo as hijo; Lote02 sees Yo as padre',
  $q$SELECT (SELECT r ->> 'relacion' FROM jsonb_array_elements(pg_temp.mis('Lote01') -> 'familiares') r)
            || ',' || (SELECT r ->> 'relacion' FROM jsonb_array_elements(pg_temp.mis('Lote02') -> 'familiares') r)$q$,
  'hijo,padre');
SELECT pg_temp.assert_eq('mis: the child of Mis hijos is flagged es_nino',
  $q$SELECT string_agg(concat_ws('|', r ->> 'relacion', r ->> 'es_nino'), ',')
       FROM jsonb_array_elements(pg_temp.mis('Yo') -> 'familiares') r WHERE r ->> 'apellido' = 'Nino'$q$, 'hijo|true');

SELECT pg_temp.assert_eq('setup: Yo says Lote04 is their tio',
  $q$SELECT pg_temp.keep('s_l4', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf lote04', 'Lote04'), 'tio') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('responder: Lote04 answers "No es mi familiar"',
  $q$SELECT pg_temp.accion('Lote04', 'rechazar', pg_temp.id('s_l4'))$q$, 'RECHAZADA');
SELECT pg_temp.assert_eq('relation: a rejected request leaves no link',
  $q$SELECT pg_temp.rel('Yo', 'Lote04')$q$, 'none');
SELECT pg_temp.assert_eq('setup: Yo says Lote03 is their abuelo',
  $q$SELECT pg_temp.keep('s_l3', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf lote03', 'Lote03'), 'abuelo') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('cancelar: the destino of another request cannot cancel it',
  $q$SELECT pg_temp.accion('Lote03', 'cancelar', pg_temp.id('s_l3'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('cancelar: the solicitante cancels',
  $q$SELECT pg_temp.accion('Yo', 'cancelar', pg_temp.id('s_l3'))$q$, 'CANCELADA');
SELECT pg_temp.assert_eq('cancelar: the destino can no longer confirm',
  $q$SELECT pg_temp.accion('Lote03', 'responder', pg_temp.id('s_l3'))$q$, 'YA_RESUELTO');
SELECT pg_temp.assert_eq('mis: a cancelled request leaves the recipient''s list',
  $q$SELECT jsonb_array_length(pg_temp.mis('Lote03') -> 'recibidas')::text$q$, '0');
SELECT pg_temp.assert_eq('setup: Yo says Otro is their conyuge',
  $q$SELECT pg_temp.keep('s_otro', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf otro', 'Otro'), 'conyuge') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('responder: Otro already has a spouse, YA_TIENE_CONYUGE',
  $q$SELECT pg_temp.accion('Otro', 'responder', pg_temp.id('s_otro'))$q$, 'YA_TIENE_CONYUGE');
SELECT pg_temp.assert_eq('relation: no second spouse link',
  $q$SELECT pg_temp.rel('Yo', 'Otro')$q$, 'none');

-- D. familia_quitar.
SELECT pg_temp.assert_eq('quitar: a third person gets NO_ENCONTRADO',
  $q$SELECT pg_temp.accion('Otro', 'quitar', pg_temp.rel_id('Yo', 'Hermano'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('quitar: the destino side removes the link',
  $q$SELECT pg_temp.accion('Hermano', 'quitar', pg_temp.rel_id('Yo', 'Hermano'))$q$, 'QUITADA');
SELECT pg_temp.assert_eq('quitar: the link is gone and both fichas stay',
  $q$SELECT pg_temp.rel('Yo', 'Hermano') || '|' || (SELECT count(*) FROM public.usuarios WHERE id IN (pg_temp.u('Yo'), pg_temp.u('Hermano')))$q$,
  'none|2');
SELECT pg_temp.assert_eq('quitar: the solicitante side removes a link too',
  $q$SELECT pg_temp.accion('Yo', 'quitar', pg_temp.rel_id('Yo', 'Lote01'))$q$, 'QUITADA');
SELECT pg_temp.assert_eq('quitar: a link with a child under 13 goes to Mis hijos',
  $q$SELECT pg_temp.accion('Yo', 'quitar', pg_temp.rel_id('Yo', 'Nino')) || '|' || pg_temp.rel('Yo', 'Nino')$q$,
  'USAR_MIS_HIJOS|Nino>Yo:padre');

-- E. familia_solicitar_sin_cuenta.
SELECT pg_temp.assert_eq('sin cuenta: under 13 is USAR_MIS_HIJOS',
  $q$SELECT pg_temp.sin_cuenta('Yo', jsonb_build_object('nombre', 'ZZ Mf', 'apellido', 'Peque',
          'fecha_nacimiento', (current_date - interval '5 years')::date), 'hijo') ->> 'codigo'$q$, 'USAR_MIS_HIJOS');
SELECT pg_temp.assert_eq('sin cuenta: a medical key is CAMPO_NO_PERMITIDO',
  $q$SELECT pg_temp.sin_cuenta('Yo', '{"nombre": "ZZ Mf", "apellido": "Med", "fecha_nacimiento": "1950-01-01", "alergias": "maní"}', 'padre') ->> 'codigo'$q$,
  'CAMPO_NO_PERMITIDO');
SELECT pg_temp.assert_eq('sin cuenta: no apellido is DATOS_INVALIDOS',
  $q$SELECT pg_temp.sin_cuenta('Yo', '{"nombre": "ZZ Mf", "fecha_nacimiento": "1950-01-01"}', 'padre') ->> 'codigo'$q$, 'DATOS_INVALIDOS');
SELECT pg_temp.assert_eq('sin cuenta: a future birth date is DATOS_INVALIDOS',
  $q$SELECT pg_temp.sin_cuenta('Yo', jsonb_build_object('nombre', 'ZZ Mf', 'apellido', 'Futuro',
          'fecha_nacimiento', current_date + 30), 'padre') ->> 'codigo'$q$, 'DATOS_INVALIDOS');
SELECT pg_temp.assert_eq('sin cuenta: a broken date is DATOS_INVALIDOS',
  $q$SELECT pg_temp.sin_cuenta('Yo', '{"nombre": "ZZ Mf", "apellido": "Roto", "fecha_nacimiento": "1950-13-45"}', 'padre') ->> 'codigo'$q$, 'DATOS_INVALIDOS');
SELECT pg_temp.assert_eq('sin cuenta: nothing was stored by the refused calls',
  $q$SELECT count(*)::text FROM public.solicitudes_relacion_familiar
      WHERE solicitante_id = pg_temp.u('Yo') AND datos_sin_cuenta IS NOT NULL$q$, '0');

SELECT pg_temp.assert_eq('setup: dedupe by cédula (typed with another format and another name)',
  $q$SELECT pg_temp.keep('s_ced', (pg_temp.sin_cuenta('Yo', '{"nombre": "Alguien", "apellido": "Distinto", "fecha_nacimiento": "2000-01-01", "cedula": "e-990.001.011"}', 'hermano') ->> 'id')::uuid)$q$,
  'kept');
SELECT pg_temp.assert_eq('setup: dedupe by name + birth date',
  $q$SELECT pg_temp.keep('s_nac', (pg_temp.sin_cuenta('Yo', '{"nombre": "zz  MF", "apellido": "Sinn", "fecha_nacimiento": "1955-06-06"}', 'tio') ->> 'id')::uuid)$q$,
  'kept');
SELECT pg_temp.assert_eq('setup: a new person',
  $q$SELECT pg_temp.keep('s_new', (pg_temp.sin_cuenta('Yo', '{"nombre": "ZZ Mf", "apellido": "Nuevo", "fecha_nacimiento": "1950-01-01", "genero": "Femenino", "telefono": "04140000099"}', 'abuelo') ->> 'id')::uuid)$q$,
  'kept');
SELECT pg_temp.assert_eq('sin cuenta no leak: a match and a new person get the same answer',
  $q$SELECT string_agg((pg_temp.sin_cuenta('Otro', d, 'otro_familiar') - 'id')::text, ',' ORDER BY n)
       FROM (VALUES (1, '{"nombre": "X", "apellido": "Y", "fecha_nacimiento": "1999-09-09", "cedula": "E990001002"}'::jsonb),
                    (2, '{"nombre": "ZZ Mf", "apellido": "Otro nuevo", "fecha_nacimiento": "1999-09-09"}'::jsonb)) v(n, d)$q$,
  '{"ok": true, "codigo": "ENVIADA"},{"ok": true, "codigo": "ENVIADA"}');
SELECT pg_temp.assert_eq('sin cuenta: the requests point at the matched fichas, the new one at nobody',
  $q$SELECT string_agg(coalesce(d.apellido, 'null'), ',' ORDER BY s.k)
       FROM t_mf_ids s
       JOIN public.solicitudes_relacion_familiar r ON r.id = s.v
       LEFT JOIN public.usuarios d ON d.id = r.destino_id
      WHERE s.k IN ('s_ced', 's_nac', 's_new')$q$, 'Sinc,Sinn,null');
SELECT pg_temp.assert_eq('sin cuenta: no medical or unknown data is stored',
  $q$SELECT string_agg(k, ',' ORDER BY k) FROM public.solicitudes_relacion_familiar r, jsonb_object_keys(r.datos_sin_cuenta) k
      WHERE r.id = pg_temp.id('s_new')$q$, 'apellido,clave,fecha_nacimiento,genero,nombre,telefono');
SELECT pg_temp.assert_eq('sin cuenta: the same new person again is YA_SOLICITADO',
  $q$SELECT pg_temp.sin_cuenta('Yo', '{"nombre": "ZZ Mf", "apellido": "Nuevo", "fecha_nacimiento": "1950-01-01"}', 'abuelo') ->> 'codigo'$q$,
  'YA_SOLICITADO');
SELECT pg_temp.assert_eq('mis no leak: the matched request shows what Yo typed and waits for the campus',
  $q$SELECT concat_ws('|', r ->> 'nombre', r ->> 'apellido', r ->> 'espera')
       FROM jsonb_array_elements(pg_temp.mis('Yo') -> 'enviadas') r WHERE r ->> 'id' = pg_temp.id('s_ced')::text$q$,
  'Alguien|Distinto|campus');
SELECT pg_temp.assert_eq('sin cuenta: an existing relative is YA_RELACIONADOS',
  $q$SELECT pg_temp.sin_cuenta('Otro', '{"nombre": "ZZ Mf", "apellido": "Espo", "fecha_nacimiento": "1985-01-01"}', 'hermano') ->> 'codigo'$q$,
  'YA_RELACIONADOS');
SELECT pg_temp.assert_eq('setup: Limite already sent 20 requests today',
  $q$WITH x AS (INSERT INTO public.solicitudes_relacion_familiar (solicitante_id, datos_sin_cuenta, tipo_relacion, estado, resuelto_en)
               SELECT pg_temp.u('Limite'), jsonb_build_object('clave', 'zz mf limite ' || g), 'otro_familiar', 'cancelada', now()
                 FROM generate_series(1, 20) g RETURNING 1)
     SELECT count(*)::text FROM x$q$, '20');
SELECT pg_temp.assert_eq('sin cuenta limit: the 21st request of the day is LIMITE_DIARIO',
  $q$SELECT pg_temp.sin_cuenta('Limite', '{"nombre": "ZZ Mf", "apellido": "Tope", "fecha_nacimiento": "1950-01-01"}', 'padre') ->> 'codigo'$q$,
  'LIMITE_DIARIO');

-- F. familia_resolver and familia_pendientes_listar.
SELECT pg_temp.assert_eq('pendientes: a member resolves nothing',
  $q$SELECT jsonb_array_length(pg_temp.pendientes('Otro') -> 'solicitudes')::text$q$, '0');
SELECT pg_temp.assert_eq('pendientes: the solicitante does not see their own request',
  $q$SELECT (pg_temp.pendientes('Yo') -> 'solicitudes') @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('s_new')))$q$, 'false');
SELECT pg_temp.assert_eq('pendientes: the pastor of campus B does not see it',
  $q$SELECT (pg_temp.pendientes('Pastorb') -> 'solicitudes') @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('s_new')))$q$, 'false');
SELECT pg_temp.assert_eq('pendientes: the lider of Yo sees the typed data and "crear ficha"',
  $q$SELECT concat_ws('|', r -> 'solicitante' ->> 'apellido', coalesce(r ->> 'destino', 'null'), r -> 'sin_cuenta' ->> 'apellido',
                         ((r -> 'sin_cuenta') ? 'clave')::text, r ->> 'crea_ficha', r ->> 'tipo_relacion')
       FROM jsonb_array_elements(pg_temp.pendientes('Lidera') -> 'solicitudes') r WHERE r ->> 'id' = pg_temp.id('s_new')::text$q$,
  'Yo|null|Nuevo|false|true|abuelo');
SELECT pg_temp.assert_eq('resolver: a member gets NO_ENCONTRADO',
  $q$SELECT pg_temp.accion('Otro', 'aprobar', pg_temp.id('s_new'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('resolver: the pastor of another campus gets NO_ENCONTRADO',
  $q$SELECT pg_temp.accion('Pastorb', 'aprobar', pg_temp.id('s_new'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('resolver: the solicitante cannot approve their own request',
  $q$SELECT pg_temp.accion('Yo', 'aprobar', pg_temp.id('s_new'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('resolver: nothing was created by the refused calls',
  $q$SELECT count(*)::text FROM public.usuarios WHERE nombre = 'ZZ Mf' AND apellido = 'Nuevo'$q$, '0');
SELECT pg_temp.assert_eq('resolver: the lider of Yo approves and the ficha is created',
  $q$SELECT pg_temp.accion('Lidera', 'aprobar', pg_temp.id('s_new'))$q$, 'APROBADA');
SELECT pg_temp.assert_eq('resolver: the ficha has creado_por, no account, the data and Yo''s main campus',
  $q$SELECT concat_ws('|', (u.creado_por = pg_temp.u('Yo'))::text, (u.auth_id IS NULL)::text, u.genero::text, u.fecha_nacimiento::date::text,
                         (SELECT string_agg(c.nombre || ':' || uc.es_campus_principal::text, ',') FROM public.usuario_campus uc
                            JOIN public.campus c ON c.id = uc.campus_id WHERE uc.usuario_id = u.id))
       FROM public.usuarios u WHERE u.nombre = 'ZZ Mf' AND u.apellido = 'Nuevo'$q$,
  'true|true|Femenino|1950-01-01|ZZ Mf Campus A:true');
SELECT pg_temp.assert_eq('resolver: the link is created after the ficha',
  $q$SELECT pg_temp.rel('Yo', 'Nuevo')$q$, 'Yo>Nuevo:abuelo');
SELECT pg_temp.assert_eq('resolver: a resolved request is YA_RESUELTO',
  $q$SELECT pg_temp.accion('Lidera', 'aprobar', pg_temp.id('s_new'))$q$, 'YA_RESUELTO');
SELECT pg_temp.assert_eq('creador: Yo edits the ficha they asked for',
  $q$SELECT pg_temp.editar('Yo', 'Nuevo')$q$, 'true');
SELECT pg_temp.assert_eq('creador: so the ficha path lets them open it (puede_ver_usuario_ficha)',
  $q$SELECT public.puede_ver_usuario_ficha(pg_temp.a('Yo'), pg_temp.u('Nuevo'))::text$q$, 'true');
SELECT pg_temp.assert_eq('creador: another member cannot',
  $q$SELECT pg_temp.editar('Otro', 'Nuevo')$q$, 'false');
SELECT pg_temp.assert_eq('mis: Yo sees the new relative without account and may edit it',
  $q$SELECT concat_ws('|', r ->> 'relacion', r ->> 'cuenta', r ->> 'puedo_editar')
       FROM jsonb_array_elements(pg_temp.mis('Yo') -> 'familiares') r WHERE r ->> 'apellido' = 'Nuevo'$q$, 'abuelo|false|true');
SELECT pg_temp.assert_eq('setup: the new ficha gets an account',
  $q$WITH x AS (UPDATE public.usuarios SET auth_id = 'e7000000-0000-4000-9000-0000000001ff'
                 WHERE nombre = 'ZZ Mf' AND apellido = 'Nuevo' RETURNING 1) SELECT count(*)::text FROM x$q$, '1');
SELECT pg_temp.assert_eq('creador: once the ficha has an account the creator no longer edits it',
  $q$SELECT pg_temp.editar('Yo', 'Nuevo')$q$, 'false');
SELECT pg_temp.assert_eq('resolver: the pastor of campus A rejects the name + birth match',
  $q$SELECT pg_temp.accion('Pastora', 'denegar', pg_temp.id('s_nac')) || '|' || pg_temp.rel('Yo', 'Sinn')$q$, 'RECHAZADA|none');
SELECT pg_temp.assert_eq('resolver: the pastor of campus A approves the cédula match without a new ficha',
  $q$SELECT pg_temp.accion('Pastora', 'aprobar', pg_temp.id('s_ced')) || '|' || pg_temp.rel('Yo', 'Sinc') || '|'
            || (SELECT count(*) FROM public.usuarios WHERE cedula = 'E990001011')$q$, 'APROBADA|Yo>Sinc:hermano|1');
SELECT pg_temp.assert_eq('setup: Yo asks Lote05 (with account)',
  $q$SELECT pg_temp.keep('s_l5', (pg_temp.solicitar('Yo', pg_temp.tok('Yo', 'zz mf lote05', 'Lote05'), 'hermano') ->> 'id')::uuid)$q$, 'kept');
SELECT pg_temp.assert_eq('resolver: the lider of Yo cannot approve, they cannot edit Lote05',
  $q$SELECT pg_temp.accion('Lidera', 'aprobar', pg_temp.id('s_l5'))$q$, 'NO_ENCONTRADO');
SELECT pg_temp.assert_eq('resolver: the pastor of campus A approves a link with account',
  $q$SELECT pg_temp.accion('Pastora', 'aprobar', pg_temp.id('s_l5')) || '|' || pg_temp.rel('Yo', 'Lote05')$q$, 'APROBADA|Yo>Lote05:hermano');

-- G. Identity.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('identity: with no session every RPC answers SIN_SESION',
  $q$SELECT concat_ws(',',
       public.familia_buscar('zz mf her') ->> 'codigo',
       public.familia_verificar(gen_random_uuid(), 1, 1, NULL) ->> 'codigo',
       public.familia_solicitar(gen_random_uuid(), 'hermano') ->> 'codigo',
       public.familia_solicitar_sin_cuenta('{}', 'hermano') ->> 'codigo',
       public.familia_mis_solicitudes() ->> 'codigo',
       public.familia_responder(gen_random_uuid(), true) ->> 'codigo',
       public.familia_cancelar(gen_random_uuid()) ->> 'codigo',
       public.familia_quitar(gen_random_uuid()) ->> 'codigo',
       public.familia_resolver(gen_random_uuid(), true) ->> 'codigo',
       public.familia_pendientes_listar() ->> 'codigo')$q$,
  'SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION,SIN_SESION');
SELECT pg_temp.as_user('e7000000-0000-4000-9000-0000000001fe');
SELECT pg_temp.assert_eq('identity: a session without ficha gets SIN_FICHA, NO_ENCONTRADO and an empty list',
  $q$SELECT concat_ws(',',
       public.familia_buscar('zz mf her') ->> 'codigo',
       public.familia_mis_solicitudes() ->> 'codigo',
       public.familia_resolver(pg_temp.id('s_l4'), true) ->> 'codigo',
       jsonb_array_length(public.familia_pendientes_listar() -> 'solicitudes')::text)$q$,
  'SIN_FICHA,SIN_FICHA,NO_ENCONTRADO,0');
SELECT pg_temp.as_nobody();

-- H. Privileges, definer flag, search_path; closed tables.
CREATE TEMP TABLE t_mf_fn (sig text, rpc boolean, definer boolean) ON COMMIT DROP;
INSERT INTO t_mf_fn VALUES
  ('public.familia_buscar(text)', true, true),
  ('public.familia_verificar(uuid,integer,integer,text)', true, true),
  ('public.familia_solicitar(uuid,public.enum_tipo_relacion)', true, true),
  ('public.familia_solicitar_sin_cuenta(jsonb,public.enum_tipo_relacion)', true, true),
  ('public.familia_mis_solicitudes()', true, true),
  ('public.familia_responder(uuid,boolean)', true, true),
  ('public.familia_cancelar(uuid)', true, true),
  ('public.familia_quitar(uuid)', true, true),
  ('public.familia_resolver(uuid,boolean)', true, true),
  ('public.familia_pendientes_listar()', true, true),
  ('public.familia_tipo_inverso(public.enum_tipo_relacion)', false, false),
  ('public.familia_etiqueta(text,text)', false, false),
  ('public.familia_puede_resolver(uuid)', false, true),
  ('public.familia_crear_relacion(uuid,uuid,public.enum_tipo_relacion)', false, true);
SELECT pg_temp.assert_eq('privileges: all 14 functions exist',
  $q$SELECT count(to_regprocedure(sig))::text FROM t_mf_fn$q$, '14');
SELECT pg_temp.assert_eq('privileges: anon executes none of them',
  $q$SELECT count(*)::text FROM t_mf_fn WHERE has_function_privilege('anon', to_regprocedure(sig), 'execute')$q$, '0');
SELECT pg_temp.assert_eq('privileges: authenticated executes the 10 RPCs and no internal helper',
  $q$SELECT string_agg(rpc::text || '=' || n, ',' ORDER BY rpc) FROM (
       SELECT rpc, count(*) FILTER (WHERE has_function_privilege('authenticated', to_regprocedure(sig), 'execute')) AS n
         FROM t_mf_fn WHERE to_regprocedure(sig) IS NOT NULL GROUP BY rpc) x$q$, 'false=0,true=10');
SELECT pg_temp.assert_eq('privileges: service_role executes all 14',
  $q$SELECT count(*)::text FROM t_mf_fn WHERE has_function_privilege('service_role', to_regprocedure(sig), 'execute')$q$, '14');
SELECT pg_temp.assert_eq('privileges: PUBLIC holds no execute on any of them',
  $q$SELECT count(*)::text FROM t_mf_fn f, pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = to_regprocedure(f.sig) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'$q$, '0');
SELECT pg_temp.assert_eq('definer: the 12 definer functions have search_path public',
  $q$SELECT count(*)::text FROM t_mf_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
      WHERE f.definer AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public']$q$, '12');
SELECT pg_temp.assert_eq('tables: RLS on, no policies, no rights for anon or authenticated',
  $q$SELECT count(*)::text
       FROM (VALUES ('public.solicitudes_relacion_familiar'), ('public.familia_intentos'), ('public.familia_candidatos')) v(t)
       JOIN pg_class c ON c.oid = to_regclass(v.t)
      WHERE c.relrowsecurity
        AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
        AND NOT has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        AND NOT has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')$q$, '3');
SELECT pg_temp.assert_eq('usuarios.creado_por: authenticated cannot update it',
  $q$SELECT has_column_privilege('authenticated', 'public.usuarios', 'creado_por', 'UPDATE')::text$q$, 'false');
SELECT pg_temp.assert_eq('puede_editar_usuario: keeps definer, search_path, result and grants (PRESERVE)',
  $q$SELECT concat_ws('|', p.prosecdef::text, (p.proconfig @> ARRAY['search_path=public'])::text, pg_get_function_result(p.oid),
                         has_function_privilege('anon', p.oid, 'execute')::text,
                         has_function_privilege('authenticated', p.oid, 'execute')::text,
                         has_function_privilege('service_role', p.oid, 'execute')::text)
       FROM pg_proc p WHERE p.oid = 'public.puede_editar_usuario(uuid,uuid)'::regprocedure$q$,
  'true|true|boolean|false|true|true');

-- I. puede_editar_usuario: the cases of campus-pastor-global (PRESERVE).
SELECT pg_temp.assert_eq('editar: pastor A, person of campus A (PRESERVE)', $q$SELECT pg_temp.editar('Pastora', 'Otro')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor A, person of campus B (PRESERVE)', $q$SELECT pg_temp.editar('Pastora', 'Campusb')$q$, 'false');
SELECT pg_temp.assert_eq('editar: pastor A, person with no campus (PRESERVE)', $q$SELECT pg_temp.editar('Pastora', 'Noc')$q$, 'false');
SELECT pg_temp.assert_eq('editar: pastor B, person of campus B (PRESERVE)', $q$SELECT pg_temp.editar('Pastorb', 'Campusb')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor B, person of campus A (PRESERVE)', $q$SELECT pg_temp.editar('Pastorb', 'Otro')$q$, 'false');
SELECT pg_temp.assert_eq('editar: pastor B, a group member of campus A is false (the director general branch no longer lets every pastor in)',
  $q$SELECT pg_temp.editar('Pastorb', 'Yo')$q$, 'false');
SELECT pg_temp.assert_eq('editar: admin, person of campus B (PRESERVE)', $q$SELECT pg_temp.editar('Adm', 'Campusb')$q$, 'true');
SELECT pg_temp.assert_eq('editar: admin, person with no campus (PRESERVE)', $q$SELECT pg_temp.editar('Adm', 'Noc')$q$, 'true');
SELECT pg_temp.assert_eq('editar: pastor, themself (PRESERVE)', $q$SELECT pg_temp.editar('Pastora', 'Pastora')$q$, 'true');
SELECT pg_temp.assert_eq('editar: lider, the member of campus B of their group (PRESERVE)', $q$SELECT pg_temp.editar('Lidera', 'Mb')$q$, 'true');
SELECT pg_temp.assert_eq('editar: director de etapa, the member of their group (PRESERVE)', $q$SELECT pg_temp.editar('De', 'Mb')$q$, 'true');
SELECT pg_temp.assert_eq('editar: director general with no group scope (PRESERVE)', $q$SELECT pg_temp.editar('Dg', 'Otro')$q$, 'false');
SELECT pg_temp.assert_eq('editar: miembro, another person (PRESERVE)', $q$SELECT pg_temp.editar('Otro', 'Hermano')$q$, 'false');
SELECT pg_temp.assert_eq('editar: a ficha without account and without creator stays closed to a member',
  $q$SELECT pg_temp.editar('Otro', 'Sinc') || '|' || pg_temp.editar('Yo', 'Sinn')$q$, 'false|false');
SELECT pg_temp.as_user(pg_temp.a('Pastora'));
SELECT pg_temp.assert_eq('editar identity: another person''s auth id is false (PRESERVE)',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('Adm'), pg_temp.u('Campusb'))::text$q$, 'false');
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('editar identity: no session is false (PRESERVE)',
  $q$SELECT public.puede_editar_usuario(pg_temp.a('Adm'), pg_temp.u('Campusb'))::text$q$, 'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_mf_failures;

ROLLBACK;
