-- Estudiantes C6a leader history per group
-- (20261101120000_estudiantes_lideres_historial.sql).
--
-- Covers:
--   c. estudiantes_grupo_lideres_fijar closes periods: changing the leader
--      keeps the old period with hasta and cerrado_por; the count it returns;
--      a repeated id opens nothing; closing works after the servicio was
--      paused; re-adding a former leader opens a second period.
--   v. Only current periods count: the replaced leader loses the group
--      (estudiantes_nivel_grupo, estudiantes_mis_grupos, estudiantes_acceso,
--      obtener_asistencia_persona) while the new one gets it; the live view
--      lists only current leaders.
--   h. estudiantes_grupo_lideres_historial: order (current first, then past
--      newest first) and fields; a leader reads their group's history; the
--      replaced leader, another leader, a director of another campus and a
--      person without role are refused; an inactive group only at level 3;
--      unknown group.
--   t. The table: one current period per group and servicio; a period only
--      closes (no reopening, no moving to another servicio); hasta >= desde.
--   l. Privileges: authenticated executes the history, anon not.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n): 1 DIRGRUPO (director de grupo in Transit ›
-- Chicas), 2 LIDER_A (leads G1 since 2026-01-01), 3 LIDER_B (led G1 in 2025,
-- leads nothing today), 4 ENTRENADORA (Chicas), 5 LIDER_C (leads G2 and the
-- inactive G3), 6 DIR_OTRO (dream_team.direct on Transit, campus 2), 7 NADIE
-- (campus 1, no role). 1–5 and 7 belong to campus 1.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit › 6 Grupos de Chicas.
-- Groups (campus 1): G1 1er año, G2 2do año, G3 3er año (inactive).
-- Past periods of G1: U3 2025-01-01 – 2025-06-01 (closed by U1), U5
-- 2025-07-01 – 2025-12-01 (nobody recorded).
-- Turno 1 Domingo 9 in campus 1, served by Transit. dom = last Sunday.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_lh_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_lh_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_lh_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a50000-0000-4000-%s-%s',
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
  SELECT (SELECT v FROM t_lh_ctx WHERE k = 'dom')::date;
$$;

-- The history of a group as 'apellido:current:closed by', in the RPC's order.
-- The caller's level on a group. estudiantes_nivel_grupo is service_role only;
-- a definer helper still reads the impersonated caller from the JWT claims.
CREATE OR REPLACE FUNCTION pg_temp.nivel(p_g int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.estudiantes_nivel_grupo(pg_temp.id('gr', p_g))::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.historial(p_g int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(h.apellido || ':' || (h.hasta IS NULL) || ':' || coalesce(h.cerrado_por_nombre, '-'), ','
                                     ORDER BY h.n), '')
            FROM public.estudiantes_grupo_lideres_historial(pg_temp.id('gr', p_g))
                 WITH ORDINALITY AS h(servicio_id, persona_id, nombre, apellido, rol, desde, hasta, cerrado_por_nombre, n));
END;
$$;

-- The caller's ZZ Lh groups as 'nombre:soy_lider'.
CREATE OR REPLACE FUNCTION pg_temp.mis_grupos() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(g.nombre || ':' || g.soy_lider, ',' ORDER BY g.nombre), '')
            FROM public.estudiantes_mis_grupos(true) g
           WHERE g.nombre LIKE 'ZZ Lh %');
END;
$$;

-- The leaders estudiantes_mis_grupos shows for a group: 'U2,U3'.
CREATE OR REPLACE FUNCTION pg_temp.lideres(p_g int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(l ->> 'apellido', ',' ORDER BY l ->> 'apellido'), '')
            FROM public.estudiantes_mis_grupos(true) g, jsonb_array_elements(g.lideres) l
           WHERE g.grupo_id = pg_temp.id('gr', p_g));
END;
$$;

-- 'grupos|lidera' of the caller.
CREATE OR REPLACE FUNCTION pg_temp.acceso() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v jsonb := public.estudiantes_acceso();
BEGIN
  RETURN (v ->> 'grupos') || '|' || (v ->> 'lidera');
END;
$$;

-- The caller's own Estudiantes groups in obtener_asistencia_persona: 'nombre:rol'.
CREATE OR REPLACE FUNCTION pg_temp.asistencia_propia(p_n int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(x ->> 'nombre' || ':' || (x ->> 'rol'), ',' ORDER BY x ->> 'nombre'), '')
            FROM jsonb_array_elements(public.obtener_asistencia_persona(pg_temp.id('us', p_n), pg_temp.id('au', p_n)) -> 'grupos') x
           WHERE x ->> 'tipo' = 'estudiantes');
END;
$$;

-- Periods of a servicio in a group as 'current|closed'.
CREATE OR REPLACE FUNCTION pg_temp.periodos(p_g int, p_se int) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT count(*) FILTER (WHERE gl.hasta IS NULL) || '|' || count(*) FILTER (WHERE gl.hasta IS NOT NULL)
            FROM public.estudiantes_grupo_lideres gl
           WHERE gl.grupo_id = pg_temp.id('gr', p_g) AND gl.servicio_id = pg_temp.id('se', p_se));
END;
$$;

INSERT INTO t_lh_ctx (k, v) VALUES
  ('dom', ((now() AT TIME ZONE 'America/Caracas')::date
           - extract(dow FROM (now() AT TIME ZONE 'America/Caracas')::date)::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'lh-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Lh', 'U' || n, 'lh-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 7) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Lh Campus 1', 'ZZLH1'),
  (pg_temp.id('ca', 2), 'ZZ Lh Campus 2', 'ZZLH2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 6 THEN 2 ELSE 1 END), true
  FROM generate_series(1, 7) AS n
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Lh Experiencia'), (2, 1, 'estudiantes', 'ZZ Lh Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Lh Transit'), (6, 3, 'estudiantes', 'Grupos de Chicas')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'director de grupo', 'coordinador', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 6), 'entrenador', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 6), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 1), (2, 2), (3, 2), (4, 4), (5, 2)) AS v(n, r);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Lh Domingo 9', 0, '09:00', 1, true);
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 3), pg_temp.id('tu', 1));

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', c), n, n || 'º', pg_temp.id('eq', 3)
  FROM generate_series(1, 3) AS n, generate_series(1, 2) AS c;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, activo) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Lh G1', 1, true),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Lh G2', 2, true),
  (pg_temp.id('gr', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Lh G3', 3, false);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde, hasta, cerrado_por) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('se', 3), timestamptz '2025-01-01 12:00+00', timestamptz '2025-06-01 12:00+00', pg_temp.id('us', 1)),
  (pg_temp.id('gr', 1), pg_temp.id('se', 5), timestamptz '2025-07-01 12:00+00', timestamptz '2025-12-01 12:00+00', NULL),
  (pg_temp.id('gr', 1), pg_temp.id('se', 2), timestamptz '2026-01-01 12:00+00', NULL, NULL),
  (pg_temp.id('gr', 2), pg_temp.id('se', 5), timestamptz '2026-01-01 12:00+00', NULL, NULL),
  (pg_temp.id('gr', 3), pg_temp.id('se', 5), timestamptz '2026-01-01 12:00+00', NULL, NULL);

GRANT INSERT, SELECT ON t_lh_failures, t_lh_ctx TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_persona(int), pg_temp.dom(),
  pg_temp.historial(int), pg_temp.mis_grupos(), pg_temp.lideres(int), pg_temp.acceso(),
  pg_temp.asistencia_propia(int), pg_temp.periodos(int, int), pg_temp.nivel(int)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── before the change ────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('v: before the change the leader sees and leads G1',
  $q$SELECT pg_temp.nivel(1) || '|' || pg_temp.mis_grupos() || '|' || pg_temp.acceso()$q$,
  '1|ZZ Lh G1:true|1|true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('v: a past period alone gives nothing',
  $q$SELECT pg_temp.nivel(1) || '|' || pg_temp.mis_grupos() || '|' || pg_temp.acceso()
            || '|' || pg_temp.asistencia_propia(3)$q$,
  '0||0|false|');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('h: another leader cannot read G1''s history',
  $q$SELECT pg_temp.historial(1)$q$, '42501', 'sin_autoridad');

-- ── c. changing the leader ───────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: replacing U2 with U3 returns how many lead',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 1), ARRAY[pg_temp.id('se', 3)])::text$q$, '1');
SELECT pg_temp.assert_eq('c: the old period stays, closed by the caller; U3 opens a second period',
  $q$SELECT pg_temp.periodos(1, 2) || ',' || pg_temp.periodos(1, 3)$q$, '0|1,1|1');
SELECT pg_temp.assert_eq('c: a repeated id opens nothing and still counts once',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 1), ARRAY[pg_temp.id('se', 3), pg_temp.id('se', 3), NULL])::text
            || '|' || pg_temp.periodos(1, 3)$q$, '1|1|1');
SELECT pg_temp.assert_eq('c: two leaders count two',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 2), ARRAY[pg_temp.id('se', 5), pg_temp.id('se', 4)])::text$q$, '2');
SELECT pg_temp.assert_eq('c: removing one of them leaves one and closes the other',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 2), ARRAY[pg_temp.id('se', 5)])::text
            || '|' || pg_temp.periodos(2, 4) || '|' || pg_temp.periodos(2, 5)$q$, '1|0|1|1|0');

-- ── h. history ───────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('h: current first, then past periods newest first, with who closed them',
  $q$SELECT pg_temp.historial(1)$q$, 'U3:true:-,U2:false:ZZ Lh U1,U5:false:-,U3:false:ZZ Lh U1');
SELECT pg_temp.assert_eq('h: fields of the closed period of U2',
  $q$SELECT h.nombre || '|' || h.rol || '|' || (h.persona_id = pg_temp.id('us', 2)) || '|' || (h.servicio_id = pg_temp.id('se', 2))
            || '|' || (h.desde = timestamptz '2026-01-01 12:00+00') || '|' || (h.hasta = now())
       FROM public.estudiantes_grupo_lideres_historial(pg_temp.id('gr', 1)) h
      WHERE h.apellido = 'U2'$q$, 'ZZ Lh|lider|true|true|true|true');
SELECT pg_temp.assert_eq('h: the director de grupo reads an inactive group',
  $q$SELECT pg_temp.historial(3)$q$, 'U5:true:-');
SELECT pg_temp.assert_raises('h: an unknown group',
  $q$SELECT pg_temp.historial(99)$q$, '22023', 'grupo_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('h: the new leader reads their group''s history',
  $q$SELECT pg_temp.historial(1)$q$, 'U3:true:-,U2:false:ZZ Lh U1,U5:false:-,U3:false:ZZ Lh U1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('h: the replaced leader cannot read it any more',
  $q$SELECT pg_temp.historial(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('h: the leader of an inactive group cannot read it (level 3 only)',
  $q$SELECT pg_temp.historial(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('h: an entrenadora cannot read an inactive group',
  $q$SELECT pg_temp.historial(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('h: an entrenadora reads an active group of the sub-área',
  $q$SELECT pg_temp.historial(2)$q$, 'U5:true:-,U4:false:ZZ Lh U1');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('h: a director of another campus cannot read it',
  $q$SELECT pg_temp.historial(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('h: a person without role cannot read it',
  $q$SELECT pg_temp.historial(1)$q$, '42501', 'sin_autoridad');

-- ── v. only current periods count ────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('v: the replaced leader no longer sees G1 (nivel, mis_grupos, acceso, own attendance)',
  $q$SELECT pg_temp.nivel(1) || '|' || pg_temp.mis_grupos() || '|' || pg_temp.acceso()
            || '|' || pg_temp.asistencia_propia(2)$q$,
  '0||0|false|');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('v: the new leader sees and leads G1',
  $q$SELECT pg_temp.nivel(1) || '|' || pg_temp.mis_grupos() || '|' || pg_temp.acceso()
            || '|' || pg_temp.asistencia_propia(3)$q$,
  '1|ZZ Lh G1:true|1|true|ZZ Lh G1:Líder');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('v: mis_grupos lists only the current leaders',
  $q$SELECT pg_temp.lideres(1) || ';' || pg_temp.lideres(2)$q$, 'U3;U5');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('v: the live view lists only the current leaders',
  $q$SELECT string_agg((g ->> 'nombre') || ':' || (g -> 'lideres')::text, ',' ORDER BY g ->> 'nombre')
       FROM jsonb_array_elements(public.estudiantes_en_vivo(pg_temp.id('eq', 3), pg_temp.dom(), pg_temp.id('tu', 1)) -> 'grupos') g$q$,
  'ZZ Lh G1:["ZZ Lh U3"],ZZ Lh G2:["ZZ Lh U5"]');

-- ── c. closing after a pause, re-adding ──────────────────────────────

RESET ROLE;
UPDATE public.dream_team_servicios SET estado = 'en_pausa' WHERE id = pg_temp.id('se', 5);
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: a period closes although its servicio was paused later',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 2), ARRAY[]::uuid[])::text || '|' || pg_temp.periodos(2, 5)$q$,
  '0|0|1');
SELECT pg_temp.assert_raises('c: a paused servicio cannot open a period',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 2), ARRAY[pg_temp.id('se', 5)])$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_eq('c: re-adding the former leader U2 opens a second period',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 1), ARRAY[pg_temp.id('se', 3), pg_temp.id('se', 2)])::text
            || '|' || pg_temp.periodos(1, 2) || '|' || pg_temp.periodos(1, 3)$q$, '2|1|1|1|1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: the returning leader sees G1 again',
  $q$SELECT pg_temp.nivel(1) || '|' || pg_temp.mis_grupos()$q$, '1|ZZ Lh G1:true');
SELECT pg_temp.assert_eq('c: the history shows both of their periods',
  $q$SELECT pg_temp.historial(1)$q$, 'U2:true:-,U3:true:-,U2:false:ZZ Lh U1,U5:false:-,U3:false:ZZ Lh U1');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('c: a leader cannot set the leaders',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 1), ARRAY[pg_temp.id('se', 3)])$q$, '42501', 'sin_autoridad');

RESET ROLE;

-- ── t. the table ─────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('t: one current period per group and servicio',
  $q$INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES (pg_temp.id('gr', 1), pg_temp.id('se', 2))$q$,
  '23505');
SELECT pg_temp.assert_raises('t: a closed period cannot reopen',
  $q$UPDATE public.estudiantes_grupo_lideres SET hasta = NULL
      WHERE grupo_id = pg_temp.id('gr', 1) AND servicio_id = pg_temp.id('se', 5)$q$, '22023', 'periodo_invalido');
SELECT pg_temp.assert_raises('t: a period cannot move to another servicio',
  $q$UPDATE public.estudiantes_grupo_lideres SET servicio_id = pg_temp.id('se', 4)
      WHERE grupo_id = pg_temp.id('gr', 1) AND servicio_id = pg_temp.id('se', 2) AND hasta IS NULL$q$, '22023', 'periodo_invalido');
SELECT pg_temp.assert_raises('t: hasta cannot precede desde',
  $q$UPDATE public.estudiantes_grupo_lideres SET hasta = timestamptz '2020-01-01 12:00+00'
      WHERE grupo_id = pg_temp.id('gr', 1) AND servicio_id = pg_temp.id('se', 2) AND hasta IS NULL$q$, '23514');
SELECT pg_temp.assert_raises('t: a new period still needs an eligible servicio',
  $q$INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES (pg_temp.id('gr', 1), pg_temp.id('se', 5))$q$,
  '22023', 'servicio_invalido');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes the history, anon not; neither reads the table',
  $q$SELECT has_function_privilege('authenticated', 'public.estudiantes_grupo_lideres_historial(uuid)', 'EXECUTE')
            || '|' || has_function_privilege('anon', 'public.estudiantes_grupo_lideres_historial(uuid)', 'EXECUTE')
            || '|' || has_table_privilege('authenticated', 'public.estudiantes_grupo_lideres', 'SELECT')
            || '|' || has_table_privilege('anon', 'public.estudiantes_grupo_lideres', 'SELECT')$q$,
  'true|false|false|false');
SELECT pg_temp.assert_eq('l: the history is SECURITY DEFINER with an empty search_path',
  $q$SELECT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'estudiantes_grupo_lideres_historial'$q$, 'true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_lh_failures);
END;
$$;
