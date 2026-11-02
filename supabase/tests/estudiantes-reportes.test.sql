-- Estudiantes C6d2 attendance reports and connection funnel (S17–S20)
-- (20261102140000_estudiantes_reportes.sql).
--
-- Covers:
--   g. estudiantes_reporte_asistencia, groups: members, meetings (a meeting
--      row with no marks does not count), expected and unmarked dates
--      (Transit by the turno, The Living Room by its weekday and only since
--      the group was created; a meeting on another day counts as held),
--      member presentes / ausentes, promedio, %, first-visit visitors, the
--      previous period and delta, leaders, sub-áreas, summary; order by
--      sub-área, año, nombre.
--   p. estudiantes_reporte_asistencia, people: current members and a person
--      who changed group mid-range (their figures sum both groups, L48), a
--      visitor is not listed, streak, last presente (may come before the
--      range), sin_marcar, groups in the range; the sub-área filter lists
--      fewer people but keeps their whole history; the entrenadora sees only
--      her sub-área (the mover with only the meetings she sees, no current
--      group).
--   d. estudiantes_reporte_detalle: a group's meetings newest first with the
--      unmarked dates, its members with their figures; The Living Room rows;
--      a person's meetings across groups with presente / ausente /
--      sin_marcar / nadie_marco, memberships and figures; the entrenadora
--      sees only the meetings of her sub-área; refusals and bad parameters.
--   e. estudiantes_reporte_embudo: Transit, The Living Room and Inside Out
--      counts and lists (visitor and ficha in sin_grupo, graduates never,
--      a past The Living Room member, a retired servicio does not count),
--      the sub-área filter and the entrenadora (sexo rule for a ficha).
--   a. Authority: a leader (level 1), a The Living Room leader, a director
--      of another campus, a person without role and no session are refused;
--      the entrenadora cannot ask for another sub-área or ámbito; a pastor of
--      the campus is allowed.
--   v. Validation: rango_invalido (desde > hasta, 367 days, a NULL date; 366
--      days pass), ambito_invalido, subarea_invalida.
--   l. Privileges: authenticated executes the three RPCs, anon none, nobody
--      but service_role the helpers; all SECURITY DEFINER with an empty
--      search_path.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n, campus 1 unless said): 1 LIDER_1 (leads
-- G1), 2 LIDER_2 (leads G2), 3 DIR_OTRO (dream_team.direct on Experiencia,
-- campus 2), 4 NADIE (no role), 5 LIDER_TLR (leads G3), 6 ENTRENADORA
-- (Transit › Grupos de Chicas), 7 DIRECTORA (dream_team.direct on
-- Experiencia), 8 PASTOR (system pastor role).
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit › 6 Grupos de Chicas,
-- 7 Grupos de Chicos; 2 › 4 Inside Out › 8 Grupos de Chicas; 1 › 5 The Living
-- Room › 10 Grupos de Chicas; 1 › 20 Producción. Turno 1: Sunday, served by
-- Transit. Scale of campus 1: 1–3 Transit, 4–6 Inside Out.
-- Groups (campus 1): G1 "2do año · Chicas" (Transit › Chicas), G2 "2do año ·
-- Chicos" (Transit › Chicos), G3 "Zona Norte" (TLR, Thursdays, created
-- 2026-09-01).
-- People: 30 Ana, 31 Bea (serves in Producción) in G1; 32 Pat in G1 until
-- 2026-09-13, then G2; 33 Cami visitor of G1 since 2026-09-20; 34 Dan in G2
-- (retired servicio); 35 Jose ficha 1er año, no group (Masculino); 36 Ivo
-- graduate, visitor of G3; 37 Kim ficha 5to año, no group; 40 Eva (serves)
-- and 41 Fer in G3; 42 Gil TLR ficha, no group; 43 Hugo was in G3.
-- Range: 2026-08-02 – 2026-10-04 (64 days, 10 Sundays, w1..w10); previous
-- period 2026-05-30 – 2026-08-01. G1 met w1–w4, w6–w10 (w5 2026-08-30 has a
-- meeting row and no mark) and four Sundays of July; G2 met w1–w10; G3 met
-- 09-09 (Wednesday), 09-17, 09-24 and 10-01.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ra_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ra_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.exec(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5aa0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 'G1'..'G3' for a group id or name ('-' for NULL).
CREATE OR REPLACE FUNCTION pg_temp.gn(p_id text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((SELECT 'G' || n FROM generate_series(1, 3) n WHERE pg_temp.id('gr', n)::text = p_id),
                  CASE p_id WHEN 'ZZ Ra 2do año · Chicas' THEN 'G1' WHEN 'ZZ Ra 2do año · Chicos' THEN 'G2'
                            WHEN 'ZZ Ra Zona Norte' THEN 'G3' END,
                  '-');
$$;

-- The attendance report of ámbito eq p_ambito in campus 1 (sub-área eq p_sub when > 0).
CREATE OR REPLACE FUNCTION pg_temp.rep(p_ambito int, p_sub int DEFAULT 0, p_desde date DEFAULT '2026-08-02',
                                       p_hasta date DEFAULT '2026-10-04')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_reporte_asistencia(pg_temp.id('eq', p_ambito), pg_temp.id('ca', 1), p_desde, p_hasta,
                                               CASE WHEN p_sub > 0 THEN pg_temp.id('eq', p_sub) END);
$$;

-- Groups: 'G:miembros:reuniones:esperadas:sin_marcar:presentes:ausentes:promedio:%:visitantes:previas:%previo:delta'.
CREATE OR REPLACE FUNCTION pg_temp.grupos(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(pg_temp.gn(g ->> 'grupo_id') || ':' || (g ->> 'miembros') || ':' || (g ->> 'reuniones')
           || ':' || (g ->> 'reuniones_esperadas') || ':' || (g ->> 'sin_marcar') || ':' || (g ->> 'presentes')
           || ':' || (g ->> 'ausentes') || ':' || coalesce(g ->> 'promedio_presentes', '-')
           || ':' || coalesce(g ->> 'porcentaje', '-') || ':' || (g ->> 'visitantes')
           || ':' || (g ->> 'reuniones_previas') || ':' || coalesce(g ->> 'porcentaje_previo', '-')
           || ':' || coalesce(g ->> 'delta', '-'), ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'grupos') WITH ORDINALITY AS x(g, n);
$$;

-- People: 'nombre:grupo:reuniones:presentes:ausentes:sin_marcar:%:seguidas:ultima:grupos_en_rango'.
CREATE OR REPLACE FUNCTION pg_temp.personas(p jsonb, p_key text DEFAULT 'personas') RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(x ->> 'nombre', 'Zzra ', '') || ':' || pg_temp.gn(x ->> 'grupo_id')
           || ':' || (x ->> 'reuniones') || ':' || (x ->> 'presentes') || ':' || (x ->> 'ausentes')
           || ':' || (x ->> 'sin_marcar') || ':' || coalesce(x ->> 'porcentaje', '-')
           || ':' || (x ->> 'ausencias_seguidas') || ':' || coalesce(x ->> 'ultima_presente', '-')
           || ':' || coalesce((SELECT string_agg(pg_temp.gn(e), '+' ORDER BY k)
                                 FROM jsonb_array_elements_text(x -> 'grupos_en_rango') WITH ORDINALITY AS y(e, k)), ''),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> p_key) WITH ORDINALITY AS z(x, n);
$$;

-- Detail of group G p_g: rows 'fecha:presentes:ausentes:visitantes:%:sin_marcar'.
CREATE OR REPLACE FUNCTION pg_temp.det_grupo(p_g int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_reporte_detalle(p_desde => '2026-08-02', p_hasta => '2026-10-04',
                                            p_grupo_id => pg_temp.id('gr', p_g));
$$;
CREATE OR REPLACE FUNCTION pg_temp.filas_grupo(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((r ->> 'fecha') || ':' || (r ->> 'presentes') || ':' || (r ->> 'ausentes')
           || ':' || (r ->> 'visitantes') || ':' || coalesce(r ->> 'porcentaje', '-') || ':' || (r ->> 'sin_marcar'),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'reuniones') WITH ORDINALITY AS x(r, n);
$$;

-- Detail of person p_n (ámbito eq p_ambito when > 0): rows 'fecha:G:estado'.
CREATE OR REPLACE FUNCTION pg_temp.det_persona(p_n int, p_ambito int DEFAULT 0) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_reporte_detalle(p_desde => '2026-08-02', p_hasta => '2026-10-04',
                                            p_persona_id => pg_temp.id('us', p_n),
                                            p_ambito_id => CASE WHEN p_ambito > 0 THEN pg_temp.id('eq', p_ambito) END);
$$;
CREATE OR REPLACE FUNCTION pg_temp.filas_persona(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((r ->> 'fecha') || ':' || pg_temp.gn(r ->> 'grupo_id') || ':' || (r ->> 'estado'),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'reuniones') WITH ORDINALITY AS x(r, n);
$$;
-- A person's summary: 'reuniones:presentes:ausentes:sin_marcar:%:seguidas:ultima'.
CREATE OR REPLACE FUNCTION pg_temp.resumen_persona(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT (p #>> '{resumen,reuniones}') || ':' || (p #>> '{resumen,presentes}') || ':' || (p #>> '{resumen,ausentes}')
         || ':' || (p #>> '{resumen,sin_marcar}') || ':' || coalesce(p #>> '{resumen,porcentaje}', '-')
         || ':' || (p #>> '{resumen,ausencias_seguidas}') || ':' || coalesce(p #>> '{resumen,ultima_presente}', '-');
$$;

-- The funnel of ámbito eq p_ambito in campus 1 (sub-área eq p_sub when > 0).
CREATE OR REPLACE FUNCTION pg_temp.embudo(p_ambito int, p_sub int DEFAULT 0) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_reporte_embudo(pg_temp.id('eq', p_ambito), pg_temp.id('ca', 1),
                                           CASE WHEN p_sub > 0 THEN pg_temp.id('eq', p_sub) END);
$$;
-- 'sin_grupo|en_grupo|sirviendo' counts.
CREATE OR REPLACE FUNCTION pg_temp.conteos(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT (p #>> '{sin_grupo,cantidad}') || '|' || (p #>> '{en_grupo,cantidad}') || '|' || (p #>> '{sirviendo,cantidad}');
$$;
-- A step's people: sin_grupo 'nombre:tipo:G:año'; en_grupo / sirviendo 'nombre:G:servicio'.
CREATE OR REPLACE FUNCTION pg_temp.etapa(p jsonb, p_etapa text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(x ->> 'nombre', 'Zzra ', '') || ':'
           || CASE WHEN p_etapa = 'sin_grupo'
                   THEN (x ->> 'tipo') || ':' || pg_temp.gn(x ->> 'grupo') || ':' || coalesce(x ->> 'anio_etiqueta', '-')
                   ELSE pg_temp.gn(x ->> 'grupo_id') || ':' || coalesce(x ->> 'servicio', '-') END,
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p #> ARRAY[p_etapa, 'personas']) WITH ORDINALITY AS z(x, n);
$$;

-- Fixture marks: opens the meeting of the group on that date when missing.
CREATE OR REPLACE FUNCTION pg_temp.marca(p_g int, p_fecha date, p_n int, p_estado text, p_visitante boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_reunion uuid;
BEGIN
  SELECT r.id INTO v_reunion FROM public.estudiantes_reuniones r
   WHERE r.grupo_id = pg_temp.id('gr', p_g) AND r.fecha = p_fecha;
  IF v_reunion IS NULL THEN
    INSERT INTO public.estudiantes_reuniones (grupo_id, fecha, turno_id)
    VALUES (pg_temp.id('gr', p_g), p_fecha, CASE WHEN p_g < 3 THEN pg_temp.id('tu', 1) END)
    RETURNING id INTO v_reunion;
  END IF;
  INSERT INTO public.estudiantes_asistencias (reunion_id, persona_id, estado, era_visitante, marcado_at)
  VALUES (v_reunion, pg_temp.id('us', p_n), p_estado, p_visitante, p_fecha + time '10:00');
END;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ra-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ra', 'U' || n, 'ra-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'Zzra ' || nombre, 'Reporte', 'No especificado', genero::public.enum_genero
  FROM (VALUES (30, 'Ana', 'Femenino'), (31, 'Bea', 'Femenino'), (32, 'Pat', 'Femenino'), (33, 'Cami', 'Femenino'),
               (34, 'Dan', 'Masculino'), (35, 'Jose', 'Masculino'), (36, 'Ivo', 'Masculino'), (37, 'Kim', 'Femenino'),
               (40, 'Eva', 'Femenino'), (41, 'Fer', 'Masculino'), (42, 'Gil', 'Masculino'), (43, 'Hugo', 'Masculino'))
       AS v(n, nombre, genero);

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Ra Campus 1', 'ZZRA1'),
  (pg_temp.id('ca', 2), 'ZZ Ra Campus 2', 'ZZRA2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 3 THEN 2 ELSE 1 END), true
  FROM (SELECT generate_series(1, 8) AS n UNION ALL SELECT unnest(ARRAY[30, 31, 32, 33, 34, 35, 36, 37, 40, 41, 42, 43])) AS x
ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 8), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'pastor';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Ra Experiencia'), (2, 1, 'estudiantes', 'ZZ Ra Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Ra Transit'), (4, 2, 'estudiantes', 'ZZ Ra Inside Out'),
               (5, 1, 'the_living_room', 'ZZ Ra The Living Room'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (7, 3, 'estudiantes', 'Grupos de Chicos'),
               (8, 4, 'estudiantes', 'Grupos de Chicas'), (10, 5, 'the_living_room', 'Grupos de Chicas'),
               (20, 1, 'experiencia', 'ZZ Ra Producción')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 7), 'lider', 'lider', true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 10), 'lider', 'lider', true),
  (pg_temp.id('ro', 9), pg_temp.id('eq', 20), 'voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), estado::public.dream_team_estado,
       timestamptz '2020-01-01 12:00+00', CASE WHEN estado = 'retirado' THEN timestamptz '2026-06-01 12:00+00' END,
       'admin_asignacion'
  FROM (VALUES (1, 6, 1, 'activo'), (2, 7, 3, 'activo'), (5, 10, 5, 'activo'), (6, 6, 2, 'activo'),
               (31, 20, 9, 'activo'), (34, 20, 9, 'retirado'), (40, 20, 9, 'activo')) AS v(n, e, r, estado);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 3), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text),
  (pg_temp.id('us', 7), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Ra Domingo 9', 0, '09:00', 1, true);
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 3), pg_temp.id('tu', 1));

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', 1), n, etiqueta, pg_temp.id('eq', CASE WHEN n <= 3 THEN 3 ELSE 4 END)
  FROM (VALUES (1, '1er año'), (2, '2do año'), (3, '3er año'), (4, '4to año'), (5, '5to año'), (6, '6to año'))
       AS v(n, etiqueta);

INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, dia_semana, created_at)
SELECT pg_temp.id('gr', n), pg_temp.id('ca', 1), pg_temp.id('eq', e), nombre, anio, dia, creado
  FROM (VALUES (1, 6, 'ZZ Ra 2do año · Chicas', 2, NULL::smallint, timestamptz '2026-01-01 12:00-04'),
               (2, 7, 'ZZ Ra 2do año · Chicos', 2, NULL, timestamptz '2026-01-01 12:00-04'),
               (3, 10, 'ZZ Ra Zona Norte', NULL, 4, timestamptz '2026-09-01 12:00-04')) AS v(n, e, nombre, anio, dia, creado);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde)
SELECT pg_temp.id('gr', g), pg_temp.id('se', s), timestamptz '2026-01-01 12:00+00'
  FROM (VALUES (1, 1), (2, 2), (3, 5)) AS v(g, s);

INSERT INTO public.estudiantes_fichas (persona_id, campus_id, anio_actual, anio_final, egresado_at)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), a, f, e
  FROM (VALUES (30, 2, 6, NULL::timestamptz), (31, 2, 6, NULL), (32, 2, 6, NULL), (33, 2, 6, NULL), (34, 2, 6, NULL),
               (35, 1, 6, NULL), (36, 6, 6, timestamptz '2026-08-15 12:00-04'), (37, 5, 6, NULL),
               (40, NULL, NULL, NULL), (42, NULL, NULL, NULL)) AS v(n, a, f, e);
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde, activo, retirado_at)
SELECT pg_temp.id('gr', g), pg_temp.id('us', n), estado, desde::date, activo, retirado
  FROM (VALUES (1, 30, 'miembro', '2026-01-01', true, NULL::timestamptz),
               (1, 31, 'miembro', '2026-01-01', true, NULL),
               (1, 32, 'miembro', '2026-01-01', false, timestamptz '2026-09-13 15:00-04'),
               (1, 33, 'visitante', '2026-09-20', true, NULL),
               (2, 34, 'miembro', '2026-01-01', true, NULL),
               (2, 32, 'miembro', '2026-09-13', true, NULL),
               (3, 40, 'miembro', '2026-09-01', true, NULL),
               (3, 41, 'miembro', '2026-09-01', true, NULL),
               (3, 43, 'miembro', '2026-09-01', false, timestamptz '2026-09-05 12:00-04'),
               (3, 36, 'visitante', '2026-10-01', true, NULL)) AS v(g, n, estado, desde, activo, retirado);

-- G1: a meeting row on w5 with no mark.
INSERT INTO public.estudiantes_reuniones (grupo_id, fecha, turno_id)
VALUES (pg_temp.id('gr', 1), '2026-08-30', pg_temp.id('tu', 1));

SELECT pg_temp.marca(g, f::date, n, e, coalesce(v, false))
  FROM (VALUES
    -- G1, previous period: Ana always, Bea every other.
    (1, '2026-07-05', 30, 'presente', NULL::boolean), (1, '2026-07-12', 30, 'presente', NULL),
    (1, '2026-07-19', 30, 'presente', NULL), (1, '2026-07-26', 30, 'presente', NULL),
    (1, '2026-07-05', 31, 'presente', NULL), (1, '2026-07-12', 31, 'ausente', NULL),
    (1, '2026-07-19', 31, 'presente', NULL), (1, '2026-07-26', 31, 'ausente', NULL),
    -- G1 in the range. Ana: misses the last three.
    (1, '2026-08-02', 30, 'presente', NULL), (1, '2026-08-09', 30, 'presente', NULL),
    (1, '2026-08-16', 30, 'presente', NULL), (1, '2026-08-23', 30, 'presente', NULL),
    (1, '2026-09-06', 30, 'presente', NULL), (1, '2026-09-13', 30, 'presente', NULL),
    (1, '2026-09-20', 30, 'ausente', NULL), (1, '2026-09-27', 30, 'ausente', NULL),
    (1, '2026-10-04', 30, 'ausente', NULL),
    -- Bea: always.
    (1, '2026-08-02', 31, 'presente', NULL), (1, '2026-08-09', 31, 'presente', NULL),
    (1, '2026-08-16', 31, 'presente', NULL), (1, '2026-08-23', 31, 'presente', NULL),
    (1, '2026-09-06', 31, 'presente', NULL), (1, '2026-09-13', 31, 'presente', NULL),
    (1, '2026-09-20', 31, 'presente', NULL), (1, '2026-09-27', 31, 'presente', NULL),
    (1, '2026-10-04', 31, 'presente', NULL),
    -- Pat in G1 until the move.
    (1, '2026-08-02', 32, 'presente', NULL), (1, '2026-08-09', 32, 'presente', NULL),
    (1, '2026-08-16', 32, 'presente', NULL), (1, '2026-08-23', 32, 'ausente', NULL),
    (1, '2026-09-06', 32, 'presente', NULL),
    -- Cami, visitor.
    (1, '2026-09-20', 33, 'presente', true), (1, '2026-09-27', 33, 'presente', true),
    -- G2. Dan: misses w3.
    (2, '2026-08-02', 34, 'presente', NULL), (2, '2026-08-09', 34, 'presente', NULL),
    (2, '2026-08-16', 34, 'ausente', NULL), (2, '2026-08-23', 34, 'presente', NULL),
    (2, '2026-08-30', 34, 'presente', NULL), (2, '2026-09-06', 34, 'presente', NULL),
    (2, '2026-09-13', 34, 'presente', NULL), (2, '2026-09-20', 34, 'presente', NULL),
    (2, '2026-09-27', 34, 'presente', NULL), (2, '2026-10-04', 34, 'presente', NULL),
    -- Pat in G2: unmarked on w9.
    (2, '2026-09-13', 32, 'presente', NULL), (2, '2026-09-20', 32, 'presente', NULL),
    (2, '2026-10-04', 32, 'ausente', NULL),
    -- G3 (TLR): a Wednesday, then Thursdays.
    (3, '2026-09-09', 40, 'presente', NULL), (3, '2026-09-17', 40, 'presente', NULL),
    (3, '2026-09-24', 40, 'ausente', NULL), (3, '2026-10-01', 40, 'presente', NULL),
    (3, '2026-09-09', 41, 'ausente', NULL), (3, '2026-09-17', 41, 'ausente', NULL),
    (3, '2026-09-24', 41, 'ausente', NULL), (3, '2026-10-01', 41, 'ausente', NULL)
  ) AS v(g, f, n, e, v);

GRANT INSERT, SELECT ON t_ra_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.exec(text, text), pg_temp.id(text, int),
  pg_temp.as_persona(int), pg_temp.gn(text), pg_temp.rep(int, int, date, date), pg_temp.grupos(jsonb),
  pg_temp.personas(jsonb, text), pg_temp.det_grupo(int), pg_temp.filas_grupo(jsonb), pg_temp.det_persona(int, int),
  pg_temp.filas_persona(jsonb), pg_temp.resumen_persona(jsonb), pg_temp.embudo(int, int), pg_temp.conteos(jsonb),
  pg_temp.etapa(jsonb, text)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── g. groups ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('g: Transit groups by sub-área, with their figures and the previous period',
  $q$SELECT pg_temp.grupos(pg_temp.rep(3))$q$,
  'G1:2:9:10:1:19:4:2.1:82.6:2:4:75.0:7.6,G2:2:10:10:0:11:2:1.1:84.6:0:0:-:-');
SELECT pg_temp.assert_eq('g: the unmarked date, the leaders and the año of G1',
  $q$SELECT (g -> 'sin_marcar_fechas')::text || '|' || (g -> 'lideres')::text || '|' || (g ->> 'anio_etiqueta')
       || '|' || (g ->> 'subarea')
       FROM jsonb_array_elements(pg_temp.rep(3) -> 'grupos') g WHERE g ->> 'grupo_id' = pg_temp.id('gr', 1)::text$q$,
  '["2026-08-30"]|["ZZ Ra U1"]|2do año|Grupos de Chicas');
SELECT pg_temp.assert_eq('g: the summary, the periods and the sub-áreas',
  $q$SELECT (r #>> '{resumen,grupos}') || ':' || (r #>> '{resumen,reuniones}') || ':' || (r #>> '{resumen,presentes}')
       || ':' || (r #>> '{resumen,ausentes}') || ':' || (r #>> '{resumen,porcentaje}') || ':' || (r #>> '{resumen,visitantes}')
       || ':' || (r #>> '{resumen,sin_marcar}') || ':' || (r #>> '{resumen,personas}')
       || '|' || (r ->> 'previo_desde') || '..' || (r ->> 'previo_hasta')
       || '|' || (SELECT string_agg((s ->> 'label') || ':' || (s ->> 'grupos'), ',' ORDER BY k)
                    FROM jsonb_array_elements(r -> 'subareas') WITH ORDINALITY AS y(s, k))
       FROM pg_temp.rep(3) AS x(r)$q$,
  '2:19:30:6:83.3:2:1:4|2026-05-30..2026-08-01|Grupos de Chicas:1,Grupos de Chicos:1');
SELECT pg_temp.assert_eq('g: The Living Room counts its weekday since creation and a meeting on another day',
  $q$SELECT pg_temp.grupos(pg_temp.rep(5)) || '|' || (pg_temp.rep(5) #> '{grupos,0,sin_marcar_fechas}')::text$q$,
  'G3:2:4:5:2:3:5:0.8:37.5:0:0:-:-|["2026-09-03", "2026-09-10"]');

-- ── p. people ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('p: members and the mover (both groups summed); the visitor is not listed',
  $q$SELECT pg_temp.personas(pg_temp.rep(3))$q$,
  'Ana:G1:9:6:3:0:66.7:3:2026-09-13:G1,Bea:G1:9:9:0:0:100.0:0:2026-10-04:G1,'
  || 'Dan:G2:10:9:1:0:90.0:0:2026-10-04:G2,Pat:G2:9:6:2:1:75.0:1:2026-09-20:G1+G2');
SELECT pg_temp.assert_eq('p: the year and the date the member joined their current group',
  $q$SELECT string_agg(replace(x ->> 'nombre', 'Zzra ', '') || ':' || (x ->> 'anio_etiqueta') || ':' || (x ->> 'miembro_desde'),
                       ',' ORDER BY n)
       FROM jsonb_array_elements(pg_temp.rep(3) -> 'personas') WITH ORDINALITY AS z(x, n)$q$,
  'Ana:2do año:2026-01-01,Bea:2do año:2026-01-01,Dan:2do año:2026-01-01,Pat:2do año:2026-09-13');
SELECT pg_temp.assert_eq('p: the sub-área filter lists fewer people and keeps their whole history',
  $q$SELECT pg_temp.grupos(pg_temp.rep(3, 7)) || '|' || pg_temp.personas(pg_temp.rep(3, 7))$q$,
  'G2:2:10:10:0:11:2:1.1:84.6:0:0:-:-|Dan:G2:10:9:1:0:90.0:0:2026-10-04:G2,Pat:G2:9:6:2:1:75.0:1:2026-09-20:G1+G2');
SELECT pg_temp.assert_eq('p: The Living Room people, a streak with no presente',
  $q$SELECT pg_temp.personas(pg_temp.rep(5))$q$,
  'Eva:G3:4:3:1:0:75.0:0:2026-10-01:G3,Fer:G3:4:0:4:0:0.0:4:-:G3');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('p: the entrenadora sees her sub-área; the mover only with the meetings she sees',
  $q$SELECT pg_temp.grupos(pg_temp.rep(3)) || '|' || pg_temp.personas(pg_temp.rep(3))
       || '|' || (SELECT string_agg(s ->> 'label', ',') FROM jsonb_array_elements(pg_temp.rep(3) -> 'subareas') s)$q$,
  'G1:2:9:10:1:19:4:2.1:82.6:2:4:75.0:7.6|Ana:G1:9:6:3:0:66.7:3:2026-09-13:G1,Bea:G1:9:9:0:0:100.0:0:2026-10-04:G1,'
  || 'Pat:-:5:4:1:0:80.0:0:2026-09-06:G1|Grupos de Chicas');

-- ── d. detail ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('d: a group''s meetings newest first, with the unmarked date',
  $q$SELECT pg_temp.filas_grupo(pg_temp.det_grupo(1))$q$,
  '2026-10-04:1:1:0:50.0:false,2026-09-27:1:1:1:50.0:false,2026-09-20:1:1:1:50.0:false,'
  || '2026-09-13:2:0:0:100.0:false,2026-09-06:3:0:0:100.0:false,2026-08-30:0:0:0:-:true,'
  || '2026-08-23:2:1:0:66.7:false,2026-08-16:3:0:0:100.0:false,2026-08-09:3:0:0:100.0:false,'
  || '2026-08-02:3:0:0:100.0:false');
SELECT pg_temp.assert_eq('d: a group''s current members with their figures, its summary and header',
  $q$SELECT pg_temp.personas(d, 'integrantes') || '|' || (d #>> '{resumen,porcentaje}') || '|' || (d #>> '{grupo,nombre}')
       || '|' || (d #>> '{grupo,ambito}') || '|' || (d #> '{grupo,lideres}')::text
       FROM pg_temp.det_grupo(1) AS x(d)$q$,
  'Ana:-:9:6:3:0:66.7:3:2026-09-13:G1,Bea:-:9:9:0:0:100.0:0:2026-10-04:G1|82.6|ZZ Ra 2do año · Chicas|ZZ Ra Transit|["ZZ Ra U1"]');
SELECT pg_temp.assert_eq('d: The Living Room rows: a Wednesday meeting and the unmarked Thursdays',
  $q$SELECT pg_temp.filas_grupo(pg_temp.det_grupo(3))$q$,
  '2026-10-01:1:1:0:50.0:false,2026-09-24:0:2:0:0.0:false,2026-09-17:1:1:0:50.0:false,'
  || '2026-09-10:0:0:0:-:true,2026-09-09:1:1:0:50.0:false,2026-09-03:0:0:0:-:true');
SELECT pg_temp.assert_eq('d: the mover''s meetings across both groups, memberships and figures',
  $q$SELECT pg_temp.filas_persona(d) || '|' || pg_temp.resumen_persona(d)
       || '|' || (SELECT string_agg(pg_temp.gn(m ->> 'grupo_id') || ':' || (m ->> 'estado') || ':' || (m ->> 'activo'), ',' ORDER BY k)
                    FROM jsonb_array_elements(d -> 'membresias') WITH ORDINALITY AS y(m, k))
       || '|' || (d #>> '{persona,nombre}') || ':' || (d #>> '{persona,egresado}')
       FROM pg_temp.det_persona(32, 3) AS x(d)$q$,
  '2026-10-04:G2:ausente,2026-09-27:G2:sin_marcar,2026-09-20:G2:presente,2026-09-13:G2:presente,'
  || '2026-09-06:G1:presente,2026-08-30:G1:nadie_marco,2026-08-23:G1:ausente,2026-08-16:G1:presente,'
  || '2026-08-09:G1:presente,2026-08-02:G1:presente|9:6:2:1:75.0:1:2026-09-20|G1:miembro:false,G2:miembro:true'
  || '|Zzra Pat:false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('d: the entrenadora sees only the mover''s meetings in her sub-área',
  $q$SELECT pg_temp.filas_persona(d) || '|' || pg_temp.resumen_persona(d) FROM pg_temp.det_persona(32) AS x(d)$q$,
  '2026-09-06:G1:presente,2026-08-30:G1:nadie_marco,2026-08-23:G1:ausente,2026-08-16:G1:presente,'
  || '2026-08-09:G1:presente,2026-08-02:G1:presente|5:4:1:0:80.0:0:2026-09-06');
SELECT pg_temp.assert_raises('d: the entrenadora cannot open a group of another sub-área',
  $q$SELECT pg_temp.det_grupo(2)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: the entrenadora cannot open a person only in another sub-área',
  $q$SELECT pg_temp.det_persona(34)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: a leader cannot open their own group''s report',
  $q$SELECT pg_temp.det_grupo(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a leader cannot open a member''s report',
  $q$SELECT pg_temp.det_persona(30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('d: neither group nor person',
  $q$SELECT public.estudiantes_reporte_detalle('2026-08-02', '2026-10-04')$q$, '22023', 'parametros_invalidos');
SELECT pg_temp.assert_raises('d: both group and person',
  $q$SELECT public.estudiantes_reporte_detalle('2026-08-02', '2026-10-04', pg_temp.id('gr', 1), pg_temp.id('us', 30))$q$,
  '22023', 'parametros_invalidos');
SELECT pg_temp.assert_raises('d: unknown group',
  $q$SELECT public.estudiantes_reporte_detalle('2026-08-02', '2026-10-04', pg_temp.id('gr', 99))$q$, '22023', 'grupo_invalido');
SELECT pg_temp.assert_raises('d: unknown person',
  $q$SELECT public.estudiantes_reporte_detalle('2026-08-02', '2026-10-04', NULL, pg_temp.id('us', 99))$q$,
  '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: a range backwards',
  $q$SELECT public.estudiantes_reporte_detalle('2026-10-04', '2026-08-02', pg_temp.id('gr', 1))$q$, '22023', 'rango_invalido');

-- ── e. funnel ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('e: Transit counts and people of each step',
  $q$SELECT pg_temp.conteos(e) || '|' || pg_temp.etapa(e, 'sin_grupo') || '|' || pg_temp.etapa(e, 'en_grupo')
       || '|' || pg_temp.etapa(e, 'sirviendo') FROM pg_temp.embudo(3) AS x(e)$q$,
  '2|4|1|Cami:visitante:G1:2do año,Jose:ficha:-:1er año|Ana:G1:-,Bea:G1:ZZ Ra Producción,Dan:G2:-,Pat:G2:-'
  || '|Bea:G1:ZZ Ra Producción');
SELECT pg_temp.assert_eq('e: The Living Room: a ficha and a past member; the graduate visitor is left out',
  $q$SELECT pg_temp.conteos(e) || '|' || pg_temp.etapa(e, 'sin_grupo') || '|' || pg_temp.etapa(e, 'en_grupo')
       || '|' || pg_temp.etapa(e, 'sirviendo') FROM pg_temp.embudo(5) AS x(e)$q$,
  '2|2|1|Gil:ficha:-:-,Hugo:antes_en_grupo:G3:-|Eva:G3:ZZ Ra Producción,Fer:G3:-|Eva:G3:ZZ Ra Producción');
SELECT pg_temp.assert_eq('e: Inside Out counts a ficha of its years and never a graduate',
  $q$SELECT pg_temp.conteos(e) || '|' || pg_temp.etapa(e, 'sin_grupo') FROM pg_temp.embudo(4) AS x(e)$q$,
  '1|0|0|Kim:ficha:-:5to año');
SELECT pg_temp.assert_eq('e: the Chicos filter',
  $q$SELECT pg_temp.conteos(e) || '|' || pg_temp.etapa(e, 'sin_grupo') || '|' || pg_temp.etapa(e, 'en_grupo')
       FROM pg_temp.embudo(3, 7) AS x(e)$q$,
  '1|2|0|Jose:ficha:-:1er año|Dan:G2:-,Pat:G2:-');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('e: the entrenadora sees her sub-área (a boy''s ficha is not hers)',
  $q$SELECT pg_temp.conteos(e) || '|' || pg_temp.etapa(e, 'sin_grupo') || '|' || pg_temp.etapa(e, 'en_grupo')
       FROM pg_temp.embudo(3) AS x(e)$q$,
  '1|2|1|Cami:visitante:G1:2do año|Ana:G1:-,Bea:G1:ZZ Ra Producción');

-- ── a. authority ─────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('a: the entrenadora cannot ask for another sub-área',
  $q$SELECT pg_temp.rep(3, 7)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the entrenadora has no The Living Room report',
  $q$SELECT pg_temp.rep(5)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the entrenadora has no funnel of another sub-área',
  $q$SELECT pg_temp.embudo(3, 7)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: a leader (level 1) gets no report',
  $q$SELECT pg_temp.rep(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a leader (level 1) gets no funnel',
  $q$SELECT pg_temp.embudo(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('a: a The Living Room leader gets no report',
  $q$SELECT pg_temp.rep(5)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: a director of another campus gets no report',
  $q$SELECT pg_temp.rep(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a director of another campus gets no funnel',
  $q$SELECT pg_temp.embudo(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a director of another campus gets no detail',
  $q$SELECT pg_temp.det_grupo(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('a: a person without role gets no report',
  $q$SELECT pg_temp.rep(3)$q$, '42501', 'sin_autoridad');
SELECT set_config('request.jwt.claim.sub', 'e5aa0000-0000-4000-a001-0000000000ff', true);
SELECT pg_temp.assert_raises('a: no session',
  $q$SELECT pg_temp.rep(3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('a: a pastor of the campus sees the report and the funnel',
  $q$SELECT (pg_temp.rep(3) #>> '{resumen,grupos}') || '|' || pg_temp.conteos(pg_temp.embudo(3))$q$, '2|2|4|1');

-- ── v. validation ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('v: desde after hasta',
  $q$SELECT pg_temp.rep(3, 0, '2026-10-04', '2026-08-02')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('v: 367 days',
  $q$SELECT pg_temp.rep(3, 0, '2025-10-04', '2026-10-05')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('v: a NULL date',
  $q$SELECT pg_temp.rep(3, 0, NULL, '2026-10-05')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_eq('v: 366 days pass',
  $q$SELECT pg_temp.rep(3, 0, '2025-10-05', '2026-10-05') #>> '{resumen,grupos}'$q$, '2');
SELECT pg_temp.assert_raises('v: a sub-área is not an ámbito',
  $q$SELECT pg_temp.rep(6)$q$, '22023', 'ambito_invalido');
SELECT pg_temp.assert_raises('v: the funnel of a sub-área is not an ámbito',
  $q$SELECT pg_temp.embudo(6)$q$, '22023', 'ambito_invalido');
SELECT pg_temp.assert_raises('v: a sub-área of another ámbito',
  $q$SELECT pg_temp.rep(3, 10)$q$, '22023', 'subarea_invalida');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes the three RPCs, anon none',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_reporte\_%' AND p.proname NOT IN ('estudiantes_reporte_voluntarios', 'estudiantes_reporte_conexiones')$q$,
  'estudiantes_reporte_asistencia:true:false,estudiantes_reporte_detalle:true:false,estudiantes_reporte_embudo:true:false,'
  || 'estudiantes_reporte_fechas:false:false,estudiantes_reporte_grupo:false:false,'
  || 'estudiantes_reporte_personas:false:false,estudiantes_reporte_subareas:false:false');
SELECT pg_temp.assert_eq('l: all SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) FILTER (WHERE p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) || '|' || count(*)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_reporte\_%' AND p.proname NOT IN ('estudiantes_reporte_voluntarios', 'estudiantes_reporte_conexiones')$q$,
  '7|7');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_ra_failures);
END;
$$;
