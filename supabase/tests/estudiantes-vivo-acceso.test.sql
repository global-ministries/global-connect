-- Estudiantes C4 menu facts and live view options
-- (20261101100000_estudiantes_vivo_acceso.sql).
--
-- Covers:
--   a. estudiantes_acceso: a leader (grupos, lidera), an entrenadora (grupos,
--      vivo), a director de grupo of The Living Room (grupos, gestiona, no
--      vivo: TLR has no live view), a pastor (everything of their campus), a
--      director of another campus (only that campus), a person without role
--      (nothing).
--   o. estudiantes_vivo_opciones: the entrenadora gets her ámbito's turno on
--      the last two Sundays; the pastor gets Transit (only its listed turno)
--      and Inside Out (every turno, no restriction); the other campus gets its
--      own turno; a leader gets nothing; p_dias bounds the window; an option
--      opens estudiantes_en_vivo.
--   l. Privileges: authenticated executes both, anon neither.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases).
--
-- Identities (usuario n = auth n): 1 LIDER (Transit › Chicas, leads G1),
-- 2 ENTRENADORA (Transit › Chicas), 3 DIRGRUPO_TLR (director de grupo in
-- TLR › Chicas), 4 NADIE, 5 PASTOR (campus 1), 6 DIR_OTRO (dream_team.direct
-- on Transit, campus 2). 1–5 belong to campus 1.
-- Groups: G1, G2 Transit › Chicas, G4 Inside Out › Chicas, G5 TLR › Chicas in
-- campus 1; G6 Transit › Chicas in campus 2.
-- Turnos: 1 Domingo 9 and 2 Domingo 11 in campus 1 (Transit lists only 1),
-- 3 Domingo 9 in campus 2. dom = last Sunday (today when today is Sunday).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ev_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ev_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ev_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a40000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.dom() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (SELECT v FROM t_ev_ctx WHERE k = 'dom')::date;
$$;

-- 'grupos|lidera|vivo|gestiona' of the caller.
CREATE OR REPLACE FUNCTION pg_temp.acceso() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v jsonb := public.estudiantes_acceso();
BEGIN
  RETURN (v ->> 'grupos') || '|' || (v ->> 'lidera') || '|' || (v ->> 'vivo') || '|' || (v ->> 'gestiona');
END;
$$;

-- The caller's ZZ Ev options: 'ámbito:campus:offset from dom:turno,…'.
CREATE OR REPLACE FUNCTION pg_temp.opciones() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(o.ambito || ':' || o.campus || ':' || (pg_temp.dom() - o.fecha) || ':' || o.turno, ','
                                     ORDER BY n), '')
            FROM public.estudiantes_vivo_opciones() WITH ORDINALITY AS o(ambito_id, ambito, campus_id, campus, fecha,
                   turno_id, turno, hora, n)
           WHERE o.ambito LIKE 'ZZ Ev %');
END;
$$;

INSERT INTO t_ev_ctx (k, v) VALUES
  ('dom', ((now() AT TIME ZONE 'America/Caracas')::date
           - extract(dow FROM (now() AT TIME ZONE 'America/Caracas')::date)::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ev-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 6) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ev', 'U' || n, 'ev-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 6) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Ev Campus 1', 'ZZEV1'),
  (pg_temp.id('ca', 2), 'ZZ Ev Campus 2', 'ZZEV2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 6 THEN 2 ELSE 1 END), true
  FROM generate_series(1, 6) AS n
ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 5), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'pastor';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Ev Experiencia'), (2, 1, 'estudiantes', 'ZZ Ev Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Ev Transit'), (4, 2, 'estudiantes', 'ZZ Ev Inside Out'),
               (5, 2, 'the_living_room', 'ZZ Ev TLR'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (9, 4, 'estudiantes', 'Grupos de Chicas'),
               (10, 5, 'the_living_room', 'Grupos de Chicas')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 10), 'director de grupo', 'coordinador', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 1), pg_temp.id('us', 1), pg_temp.id('eq', 6), pg_temp.id('ro', 1), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion'),
  (pg_temp.id('se', 2), pg_temp.id('us', 2), pg_temp.id('eq', 6), pg_temp.id('ro', 2), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion'),
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 10), pg_temp.id('ro', 3), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Ev Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Ev Domingo 11', 0, '11:00', 2, true),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 2), 'ZZ Ev Campus 2 Domingo', 0, '09:00', 1, true);
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 3), pg_temp.id('tu', 1));

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', c), n, n || 'º', pg_temp.id('eq', CASE WHEN n <= 3 THEN 3 ELSE 4 END)
  FROM generate_series(1, 6) AS n, generate_series(1, 2) AS c;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ev G1', 1),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ev G2', 2),
  (pg_temp.id('gr', 4), pg_temp.id('ca', 1), pg_temp.id('eq', 9), 'ZZ Ev G4', 4),
  (pg_temp.id('gr', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ev G5', NULL),
  (pg_temp.id('gr', 6), pg_temp.id('ca', 2), pg_temp.id('eq', 6), 'ZZ Ev G6', 1);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES (pg_temp.id('gr', 1), pg_temp.id('se', 1));

GRANT INSERT, SELECT ON t_ev_failures, t_ev_ctx TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text), pg_temp.id(text, int),
  pg_temp.as_persona(int), pg_temp.dom(), pg_temp.acceso(), pg_temp.opciones()
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. menu facts ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: a leader sees and leads their group, no live view, no management',
  $q$SELECT pg_temp.acceso()$q$, '1|true|false|false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('a: an entrenadora sees the sub-área groups and the live view',
  $q$SELECT pg_temp.acceso()$q$, '2|false|true|false');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('a: a director de grupo of The Living Room manages, with no live view',
  $q$SELECT pg_temp.acceso()$q$, '1|false|false|true');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('a: a person without role gets nothing', $q$SELECT pg_temp.acceso()$q$, '0|false|false|false');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('a: a pastor gets everything of their campus', $q$SELECT pg_temp.acceso()$q$, '4|false|true|true');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('a: a director of another campus gets only that campus', $q$SELECT pg_temp.acceso()$q$, '1|false|true|true');

-- ── o. live view options ─────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('o: the entrenadora gets her ámbito''s turno on the last two Sundays',
  $q$SELECT pg_temp.opciones()$q$, 'ZZ Ev Transit:ZZ Ev Campus 1:0:ZZ Ev Domingo 9,ZZ Ev Transit:ZZ Ev Campus 1:7:ZZ Ev Domingo 9');
SELECT pg_temp.assert_eq('o: an option opens estudiantes_en_vivo',
  $q$SELECT jsonb_array_length(public.estudiantes_en_vivo(o.ambito_id, o.fecha, o.turno_id) -> 'grupos')::text
       FROM public.estudiantes_vivo_opciones() o WHERE o.ambito = 'ZZ Ev Transit' LIMIT 1$q$, '2');
SELECT pg_temp.assert_eq('o: p_dias bounds the window to today',
  $q$SELECT count(*)::text FROM public.estudiantes_vivo_opciones(1) o
      WHERE o.ambito LIKE 'ZZ Ev %' AND o.fecha < (now() AT TIME ZONE 'America/Caracas')::date$q$, '0');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('o: the pastor gets Inside Out (every turno) and Transit (its listed turno)',
  $q$SELECT pg_temp.opciones()$q$,
  'ZZ Ev Inside Out:ZZ Ev Campus 1:0:ZZ Ev Domingo 9,ZZ Ev Inside Out:ZZ Ev Campus 1:0:ZZ Ev Domingo 11,'
  || 'ZZ Ev Inside Out:ZZ Ev Campus 1:7:ZZ Ev Domingo 9,ZZ Ev Inside Out:ZZ Ev Campus 1:7:ZZ Ev Domingo 11,'
  || 'ZZ Ev Transit:ZZ Ev Campus 1:0:ZZ Ev Domingo 9,ZZ Ev Transit:ZZ Ev Campus 1:7:ZZ Ev Domingo 9');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('o: a director of another campus gets its own turno',
  $q$SELECT pg_temp.opciones()$q$,
  'ZZ Ev Transit:ZZ Ev Campus 2:0:ZZ Ev Campus 2 Domingo,ZZ Ev Transit:ZZ Ev Campus 2:7:ZZ Ev Campus 2 Domingo');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('o: a leader gets nothing', $q$SELECT pg_temp.opciones()$q$, '');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('o: a director de grupo of The Living Room gets nothing', $q$SELECT pg_temp.opciones()$q$, '');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes both, anon neither',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_acceso', 'estudiantes_vivo_opciones')$q$,
  'estudiantes_acceso:true:false,estudiantes_vivo_opciones:true:false');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_ev_failures);
END;
$$;
