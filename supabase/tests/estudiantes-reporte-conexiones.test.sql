-- Estudiantes C7b the 4 connections of The Living Room (S21, L55)
-- (20261102170500_estudiantes_reporte_conexiones.sql).
--
-- Covers:
--   c. Con su líder: a connected person (1:1 with the current leader in the
--      range; an agendado, a cancelado and one after hasta are not
--      counted), a person whose only 1:1 was with another group's leader
--      (not counted), a 1:1 with the previous leader while they led
--      (counted) and after they left (not), per week, last (even before the
--      range), who led it, the current leaders, and desconectado at exactly
--      2 months (and one day inside); the boundary moves with hasta.
--   o. Con otros: the group figures of the attendance report; servicio
--      presentes / justificados / ausentes / esperadas (an unexpected
--      presente and a mark after hasta left out), a servicio without marks,
--      no servicio and a retired one.
--   i. Con la Iglesia: talleres completados as principal and as companero
--      of a couple, oldest first; no_completado left out. Con Jesús: not
--      recorded.
--   r. The resumen; the people are those of the attendance report (an
--      active visitor is not listed), by nombre.
--   p. p_persona_id: one person; persona_invalida; someone the caller does
--      not see (a visitor, another sub-área) → sin_autoridad.
--   a. Authority: the entrenadora sees her sub-área only and cannot ask for
--      another one; a leader (level 1), a director of another campus, a
--      person without role and no session are refused.
--   v. Validation: a Transit ámbito and a sub-área → ambito_invalido;
--      rango_invalido (desde > hasta, 367 days); subarea_invalida.
--   l. Privileges: authenticated executes it, anon not; SECURITY DEFINER
--      with an empty search_path.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n, campus 1 unless said): 1 LIDER_A (leads G1
-- since 2026-09-01), 2 LIDER_B (led G1 until 2026-09-01), 3 DIR_OTRO
-- (dream_team.direct on Experiencia, campus 2), 4 NADIE (no role), 5
-- LIDER_C (leads G2), 6 ENTRENADORA (TLR › Grupos de Chicas), 7 DIRECTORA
-- (dream_team.direct on Experiencia).
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit › 6 Grupos de Chicas;
-- 1 › 5 The Living Room › 10 Grupos de Chicas, 11 Grupos de Chicos;
-- 1 › 20 Producción › 21 Luces; 30 a talleres node.
-- Groups (campus 1, Thursdays): G1 "Zona Norte · Chicas" (10), G2 "Zona Sur
-- · Chicos" (11).
-- People: 30 Ana, 31 Bea, 32 Caro, 33 Dora, 34 Eli in G1; 35 Fer in G2; 36
-- Gala visitor of G1; 37 Pepe (Caro's partner in a taller, no group).
-- Range: 2026-08-09 – 2026-10-03 (56 days, 8 weeks); 2 months before hasta
-- = 2026-08-03 (a 1:1 must be after it).
-- 1:1 realizados: A→Ana 09-10, 09-20, 10-01 and 10-10 (after hasta), plus
-- an agendado 09-25 and a cancelado 09-27; C→Bea 09-15; B→Caro 08-20 and
-- 09-10; B→Dora 08-03; B→Eli 08-04; C→Fer 09-24.
-- Servicio (Luces): Ana marks 5 expected (3 presente, 1 justificado, 1
-- ausente), an unexpected presente and one after hasta; Eli active with no
-- marks; Bea retired.
-- Talleres: Ana Fundamentos (2025-06-30) and Bautismo (2026-03-15)
-- completado, Fundamentos 2026 no_completado; Pepe + Caro Bautismo
-- completado.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e5ab0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' WHEN 'ta' THEN 'a009'
                       WHEN 'oc' THEN 'a00a' WHEN 'ed' THEN 'a00b' WHEN 'co' THEN 'a00c'
                       WHEN 'ti' THEN 'a00d' WHEN 'uu' THEN 'a00e' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The connections of ámbito eq p_ambito in campus 1 (sub-área eq p_sub and person us p_persona when > 0).
CREATE OR REPLACE FUNCTION pg_temp.con(p_sub int DEFAULT 0, p_persona int DEFAULT 0, p_desde date DEFAULT '2026-08-09',
                                       p_hasta date DEFAULT '2026-10-03', p_ambito int DEFAULT 5)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.estudiantes_reporte_conexiones(pg_temp.id('eq', p_ambito), pg_temp.id('ca', 1), p_desde, p_hasta,
                                               CASE WHEN p_sub > 0 THEN pg_temp.id('eq', p_sub) END,
                                               CASE WHEN p_persona > 0 THEN pg_temp.id('us', p_persona) END);
$$;

-- Con su líder: 'nombre:realizados:por_semana:ultimo:ultimo_con:lideres:desconectado'.
CREATE OR REPLACE FUNCTION pg_temp.lider(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(x ->> 'nombre', 'Zzrc ', '') || ':' || (x #>> '{lider,realizados}')
           || ':' || (x #>> '{lider,por_semana}') || ':' || coalesce(x #>> '{lider,ultimo}', '-')
           || ':' || coalesce(x #>> '{lider,ultimo_con}', '-')
           || ':' || coalesce((SELECT string_agg(e, '+' ORDER BY k)
                                 FROM jsonb_array_elements_text(x #> '{lider,lideres}') WITH ORDINALITY AS y(e, k)), '')
           || ':' || (x #>> '{lider,desconectado}'),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'personas') WITH ORDINALITY AS z(x, n);
$$;

-- Con otros: 'nombre:reuniones:presentes:ausentes:sin_marcar:%:sirve:equipo/área/rol/esperadas/presentes/justificados/ausentes/%'.
CREATE OR REPLACE FUNCTION pg_temp.otros(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(x ->> 'nombre', 'Zzrc ', '') || ':' || (x #>> '{otros,grupo,reuniones}')
           || ':' || (x #>> '{otros,grupo,presentes}') || ':' || (x #>> '{otros,grupo,ausentes}')
           || ':' || (x #>> '{otros,grupo,sin_marcar}') || ':' || coalesce(x #>> '{otros,grupo,porcentaje}', '-')
           || ':' || (x #>> '{otros,sirve}')
           || ':' || coalesce((SELECT string_agg((s ->> 'equipo') || '/' || coalesce(s ->> 'area', '-') || '/' || (s ->> 'rol')
                                         || '/' || (s ->> 'esperadas') || '/' || (s ->> 'presentes')
                                         || '/' || (s ->> 'justificados') || '/' || (s ->> 'ausentes')
                                         || '/' || coalesce(s ->> 'porcentaje', '-'), '+' ORDER BY k)
                                 FROM jsonb_array_elements(x #> '{otros,servicios}') WITH ORDINALITY AS y(s, k)), ''),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'personas') WITH ORDINALITY AS z(x, n);
$$;

-- Con la Iglesia: 'nombre:talleres:taller@fecha@anio+...'.
CREATE OR REPLACE FUNCTION pg_temp.iglesia(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(x ->> 'nombre', 'Zzrc ', '') || ':' || (x #>> '{iglesia,talleres}')
           || ':' || coalesce((SELECT string_agg((t ->> 'taller') || '@' || (t ->> 'fecha') || '@' || (t ->> 'anio'), '+' ORDER BY k)
                                 FROM jsonb_array_elements(x #> '{iglesia,lista}') WITH ORDINALITY AS y(t, k)), ''),
           ',' ORDER BY n), '')
    FROM jsonb_array_elements(p -> 'personas') WITH ORDINALITY AS z(x, n);
$$;

-- The resumen: 'personas|desconectados|sin_servicio|con_talleres'.
CREATE OR REPLACE FUNCTION pg_temp.resumen(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT (p #>> '{resumen,personas}') || '|' || (p #>> '{resumen,desconectados}') || '|'
         || (p #>> '{resumen,sin_servicio}') || '|' || (p #>> '{resumen,con_talleres}');
$$;

-- Fixture marks: opens the meeting of the group on that date when missing.
CREATE OR REPLACE FUNCTION pg_temp.marca(p_g int, p_fecha date, p_n int, p_estado text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_reunion uuid;
BEGIN
  SELECT r.id INTO v_reunion FROM public.estudiantes_reuniones r
   WHERE r.grupo_id = pg_temp.id('gr', p_g) AND r.fecha = p_fecha;
  IF v_reunion IS NULL THEN
    INSERT INTO public.estudiantes_reuniones (grupo_id, fecha) VALUES (pg_temp.id('gr', p_g), p_fecha)
    RETURNING id INTO v_reunion;
  END IF;
  INSERT INTO public.estudiantes_asistencias (reunion_id, persona_id, estado, era_visitante, marcado_at)
  VALUES (v_reunion, pg_temp.id('us', p_n), p_estado, false, p_fecha + time '20:00');
END;
$$;

-- Fixture 1:1: leader us p_lider with dirigido us p_dirigido at 18:00 Caracas.
CREATE OR REPLACE FUNCTION pg_temp.uno(p_n int, p_lider int, p_dirigido int, p_fecha date, p_estado text DEFAULT 'realizado')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.uno_a_uno (id, estado, fecha_hora, resumen, creado_por, realizado_en, cancelado_en)
  VALUES (pg_temp.id('uu', p_n), p_estado, (p_fecha::text || ' 18:00-04')::timestamptz,
          CASE WHEN p_estado = 'realizado' THEN 'ZZ Rc resumen' END, pg_temp.id('us', p_lider),
          CASE WHEN p_estado = 'realizado' THEN (p_fecha::text || ' 20:00-04')::timestamptz END,
          CASE WHEN p_estado = 'cancelado' THEN (p_fecha::text || ' 08:00-04')::timestamptz END);
  INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado) VALUES
    (pg_temp.id('uu', p_n), pg_temp.id('us', p_lider), 'lider'),
    (pg_temp.id('uu', p_n), pg_temp.id('us', p_dirigido), 'dirigido');
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'rc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Rc', 'U' || n, 'rc-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'Zzrc ' || nombre, 'Conexion', estado_civil::public.enum_estado_civil, genero::public.enum_genero
  FROM (VALUES (30, 'Ana', 'Femenino', 'Soltero'), (31, 'Bea', 'Femenino', 'Soltero'), (32, 'Caro', 'Femenino', 'Casado'),
               (33, 'Dora', 'Femenino', 'Soltero'), (34, 'Eli', 'Femenino', 'Soltero'), (35, 'Fer', 'Masculino', 'Soltero'),
               (36, 'Gala', 'Femenino', 'Soltero'), (37, 'Pepe', 'Masculino', 'Casado'))
       AS v(n, nombre, genero, estado_civil);

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Rc Campus 1', 'ZZRC1'),
  (pg_temp.id('ca', 2), 'ZZ Rc Campus 2', 'ZZRC2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 3 THEN 2 ELSE 1 END), true
  FROM (SELECT generate_series(1, 7) AS n UNION ALL SELECT generate_series(30, 37)) AS x
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Rc Experiencia'), (2, 1, 'estudiantes', 'ZZ Rc Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Rc Transit'), (6, 3, 'estudiantes', 'Grupos de Chicas'),
               (5, 1, 'the_living_room', 'ZZ Rc The Living Room'),
               (10, 5, 'the_living_room', 'Grupos de Chicas'), (11, 5, 'the_living_room', 'Grupos de Chicos'),
               (20, 1, 'experiencia', 'ZZ Rc Producción'), (21, 20, 'experiencia', 'ZZ Rc Luces'),
               (30, 0, 'talleres_crecimiento', 'ZZ Rc Nodo Taller 1'),
               (31, 0, 'talleres_crecimiento', 'ZZ Rc Nodo Taller 2')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 10), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 10), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 11), 'lider', 'lider', true),
  (pg_temp.id('ro', 9), pg_temp.id('eq', 21), 'voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), estado::public.dream_team_estado,
       timestamptz '2020-01-01 12:00+00', CASE WHEN estado = 'retirado' THEN timestamptz '2026-06-01 12:00+00' END,
       'admin_asignacion'
  FROM (VALUES (1, 10, 1, 'activo'), (2, 10, 1, 'activo'), (5, 11, 3, 'activo'), (6, 10, 2, 'activo'),
               (30, 21, 9, 'activo'), (31, 21, 9, 'retirado'), (34, 21, 9, 'activo')) AS v(n, e, r, estado);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 3), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text),
  (pg_temp.id('us', 7), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Rc Domingo 9', 0, '09:00', 1, true);

INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, dia_semana, created_at)
SELECT pg_temp.id('gr', n), pg_temp.id('ca', 1), pg_temp.id('eq', e), nombre, NULL, 4::smallint,
       timestamptz '2026-01-01 12:00-04'
  FROM (VALUES (1, 10, 'ZZ Rc Zona Norte · Chicas'), (2, 11, 'ZZ Rc Zona Sur · Chicos')) AS v(n, e, nombre);
-- G1: LIDER_B until 2026-09-01, then LIDER_A; G2: LIDER_C.
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde, hasta) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('se', 2), timestamptz '2026-01-01 12:00+00', timestamptz '2026-09-01 12:00-04'),
  (pg_temp.id('gr', 1), pg_temp.id('se', 1), timestamptz '2026-09-01 12:00-04', NULL),
  (pg_temp.id('gr', 2), pg_temp.id('se', 5), timestamptz '2026-01-01 12:00+00', NULL);
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde, activo)
SELECT pg_temp.id('gr', g), pg_temp.id('us', n), estado, desde::date, true
  FROM (VALUES (1, 30, 'miembro', '2026-01-01'), (1, 31, 'miembro', '2026-01-01'), (1, 32, 'miembro', '2026-01-01'),
               (1, 33, 'miembro', '2026-01-01'), (1, 34, 'miembro', '2026-01-01'), (2, 35, 'miembro', '2026-01-01'),
               (1, 36, 'visitante', '2026-09-01')) AS v(g, n, estado, desde);

SELECT pg_temp.marca(g, f::date, n, e)
  FROM (VALUES (1, '2026-09-03', 30, 'presente'), (1, '2026-09-03', 31, 'ausente'),
               (1, '2026-09-10', 30, 'presente'), (1, '2026-09-10', 31, 'presente')) AS v(g, f, n, e);

SELECT pg_temp.uno(n, l, d, f::date, e)
  FROM (VALUES (1, 1, 30, '2026-09-10', 'realizado'), (2, 1, 30, '2026-09-20', 'realizado'),
               (3, 1, 30, '2026-10-01', 'realizado'), (4, 1, 30, '2026-10-10', 'realizado'),
               (5, 1, 30, '2026-09-25', 'agendado'), (6, 1, 30, '2026-09-27', 'cancelado'),
               (7, 5, 31, '2026-09-15', 'realizado'),
               (8, 2, 32, '2026-08-20', 'realizado'), (9, 2, 32, '2026-09-10', 'realizado'),
               (10, 2, 33, '2026-08-03', 'realizado'), (11, 2, 34, '2026-08-04', 'realizado'),
               (12, 5, 35, '2026-09-24', 'realizado')) AS v(n, l, d, f, e);

INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado)
SELECT pg_temp.id('se', 30), pg_temp.id('tu', 1), f::date, e, x
  FROM (VALUES ('2026-08-16', 'presente', true), ('2026-08-23', 'presente', true), ('2026-08-30', 'justificado', true),
               ('2026-09-06', 'ausente', true), ('2026-09-13', 'presente', true), ('2026-09-20', 'presente', false),
               ('2026-10-11', 'presente', true)) AS v(f, e, x);

-- Talleres (as the talleres suites build them).
INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias)
SELECT pg_temp.id('ta', n), slug, nombre, pg_temp.id('eq', 29 + n), 'pareja', NULL, 'cadencia', 7, 0
  FROM (VALUES (1, 'zz-rc-fundamentos', 'ZZ Rc Fundamentos'), (2, 'zz-rc-bautismo', 'ZZ Rc Bautismo')) AS v(n, slug, nombre);
INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT pg_temp.id('oc', n), 'workshop', 'active', 'ZZ Rc Evento ' || n, DATE '2025-05-01', 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(1, 3) AS n;
INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin, firmantes
)
SELECT pg_temp.id('ed', n), pg_temp.id('oc', n), pg_temp.id('ta', t), 'pareja', NULL, 'permanente_custom', 'en_curso',
       'ZZ Rc Edicion ' || n, 5, 60, 'permanente_custom', fi::date, fi::date, ff::date, '[]'::jsonb
  FROM (VALUES (1, 1, '2025-05-01', '2025-06-30'), (2, 2, '2026-02-01', '2026-03-15'),
               (3, 1, '2026-08-01', '2026-09-30')) AS v(n, t, fi, ff);
INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT pg_temp.id('co', n), pg_temp.id('ed', n), pg_temp.id('eq', 29 + t), 'ZZ Rc Cohorte ' || n,
       timestamptz '2025-05-01 12:00+00'
  FROM (VALUES (1, 1), (2, 2), (3, 1)) AS v(n, t);
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado, unit_estado)
SELECT pg_temp.id('ti', n), pg_temp.id('ed', e), pg_temp.id('co', e), pg_temp.id('us', p),
       CASE WHEN c > 0 THEN pg_temp.id('us', c) END, CASE WHEN c > 0 THEN 'matrimonio' END, 'aprobado', u
  FROM (VALUES (1, 1, 30, 0, 'completado'), (2, 2, 30, 0, 'completado'), (3, 3, 30, 0, 'no_completado'),
               (4, 2, 37, 32, 'completado')) AS v(n, e, p, c, u);

GRANT INSERT, SELECT ON t_rc_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_persona(int),
  pg_temp.con(int, int, date, date, int), pg_temp.lider(jsonb), pg_temp.otros(jsonb), pg_temp.iglesia(jsonb),
  pg_temp.resumen(jsonb)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── c. con su líder ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('c: 1:1 with the leader of their group that day, per week, last, who, leaders, desconectado',
  $q$SELECT pg_temp.lider(pg_temp.con())$q$,
  'Ana:3:0.4:2026-10-01:ZZ Rc U1:ZZ Rc U1:false,Bea:0:0.0:-:-:ZZ Rc U1:true,'
  || 'Caro:1:0.1:2026-08-20:ZZ Rc U2:ZZ Rc U1:false,Dora:0:0.0:2026-08-03:ZZ Rc U2:ZZ Rc U1:true,'
  || 'Eli:0:0.0:2026-08-04:ZZ Rc U2:ZZ Rc U1:false,Fer:1:0.1:2026-09-24:ZZ Rc U5:ZZ Rc U5:false');
SELECT pg_temp.assert_eq('c: the 2-month boundary moves with hasta (Eli''s 08-04 is exactly 2 months before 10-04)',
  $q$SELECT pg_temp.lider(pg_temp.con(0, 34, '2026-08-10', '2026-10-04'))
       || '|' || (pg_temp.con(0, 34, '2026-08-10', '2026-10-04') ->> 'desconectado_si_antes_de')$q$,
  'Eli:0:0.0:2026-08-04:ZZ Rc U2:ZZ Rc U1:true|2026-08-05');
SELECT pg_temp.assert_eq('c: the range header',
  $q$SELECT (r ->> 'semanas') || '|' || (r ->> 'desconectado_si_antes_de') || '|' || (r ->> 'desde') || '..' || (r ->> 'hasta')
       FROM pg_temp.con() AS x(r)$q$,
  '8.0|2026-08-04|2026-08-09..2026-10-03');

-- ── o. con otros ─────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('o: group figures and each active servicio (justificado apart, unexpected and later marks out)',
  $q$SELECT pg_temp.otros(pg_temp.con())$q$,
  'Ana:2:2:0:0:100.0:true:ZZ Rc Luces/ZZ Rc Producción/voluntario/5/3/1/1/60.0,Bea:2:1:1:0:50.0:false:,'
  || 'Caro:2:0:0:2:-:false:,Dora:2:0:0:2:-:false:,Eli:2:0:0:2:-:true:ZZ Rc Luces/ZZ Rc Producción/voluntario/0/0/0/0/-,'
  || 'Fer:0:0:0:0:-:false:');
SELECT pg_temp.assert_eq('o: the current group of each person',
  $q$SELECT string_agg(replace(x ->> 'nombre', 'Zzrc ', '') || ':' || (x ->> 'grupo'), ',' ORDER BY n)
       FROM jsonb_array_elements(pg_temp.con() -> 'personas') WITH ORDINALITY AS z(x, n)$q$,
  'Ana:ZZ Rc Zona Norte · Chicas,Bea:ZZ Rc Zona Norte · Chicas,Caro:ZZ Rc Zona Norte · Chicas,'
  || 'Dora:ZZ Rc Zona Norte · Chicas,Eli:ZZ Rc Zona Norte · Chicas,Fer:ZZ Rc Zona Sur · Chicos');

-- ── i. con la Iglesia and con Jesús ──────────────────────────────────

SELECT pg_temp.assert_eq('i: talleres completados as principal and as companero, oldest first; no_completado left out',
  $q$SELECT pg_temp.iglesia(pg_temp.con())$q$,
  'Ana:2:ZZ Rc Fundamentos@2025-06-30@2025+ZZ Rc Bautismo@2026-03-15@2026,Bea:0:,'
  || 'Caro:1:ZZ Rc Bautismo@2026-03-15@2026,Dora:0:,Eli:0:,Fer:0:');
SELECT pg_temp.assert_eq('i: con Jesús is not recorded for anyone',
  $q$SELECT count(*) FILTER (WHERE x -> 'jesus' = '{"registrado": false}'::jsonb) || '|' || count(*)
       FROM jsonb_array_elements(pg_temp.con() -> 'personas') x$q$,
  '6|6');

-- ── r. resumen and people ────────────────────────────────────────────

SELECT pg_temp.assert_eq('r: resumen (personas, desconectados, sin servicio, con talleres); the visitor is not listed',
  $q$SELECT pg_temp.resumen(pg_temp.con())$q$, '6|2|4|2');

-- ── p. one person ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('p: p_persona_id returns that person only',
  $q$SELECT pg_temp.lider(r) || '|' || pg_temp.iglesia(r) || '|' || pg_temp.resumen(r) FROM pg_temp.con(0, 32) AS x(r)$q$,
  'Caro:1:0.1:2026-08-20:ZZ Rc U2:ZZ Rc U1:false|Caro:1:ZZ Rc Bautismo@2026-03-15@2026|1|0|1|1');
SELECT pg_temp.assert_raises('p: an unknown person',
  $q$SELECT pg_temp.con(0, 99)$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('p: an active visitor is not among the people',
  $q$SELECT pg_temp.con(0, 36)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('p: someone outside the TLR groups',
  $q$SELECT pg_temp.con(0, 37)$q$, '42501', 'sin_autoridad');

-- ── a. authority ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('a: the entrenadora sees her sub-área only',
  $q$SELECT pg_temp.lider(r) || '|' || pg_temp.resumen(r) FROM pg_temp.con() AS x(r)$q$,
  'Ana:3:0.4:2026-10-01:ZZ Rc U1:ZZ Rc U1:false,Bea:0:0.0:-:-:ZZ Rc U1:true,'
  || 'Caro:1:0.1:2026-08-20:ZZ Rc U2:ZZ Rc U1:false,Dora:0:0.0:2026-08-03:ZZ Rc U2:ZZ Rc U1:true,'
  || 'Eli:0:0.0:2026-08-04:ZZ Rc U2:ZZ Rc U1:false|5|2|3|2');
SELECT pg_temp.assert_raises('a: the entrenadora cannot ask for another sub-área',
  $q$SELECT pg_temp.con(11)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the entrenadora cannot ask for a person of another sub-área',
  $q$SELECT pg_temp.con(0, 35)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: a leader (level 1) gets no connections',
  $q$SELECT pg_temp.con()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a leader (level 1) gets no connections of their own member',
  $q$SELECT pg_temp.con(0, 30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: a director of another campus',
  $q$SELECT pg_temp.con()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('a: a person without role',
  $q$SELECT pg_temp.con()$q$, '42501', 'sin_autoridad');
SELECT set_config('request.jwt.claim.sub', 'e5ab0000-0000-4000-a001-0000000000ff', true);
SELECT pg_temp.assert_raises('a: no session',
  $q$SELECT pg_temp.con()$q$, '42501', 'sin_autoridad');

-- ── v. validation ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('v: a Transit ámbito',
  $q$SELECT pg_temp.con(0, 0, '2026-08-09', '2026-10-03', 3)$q$, '22023', 'ambito_invalido');
SELECT pg_temp.assert_raises('v: a The Living Room sub-área is not an ámbito',
  $q$SELECT pg_temp.con(0, 0, '2026-08-09', '2026-10-03', 10)$q$, '22023', 'ambito_invalido');
SELECT pg_temp.assert_raises('v: a sub-área of another ámbito',
  $q$SELECT pg_temp.con(6)$q$, '22023', 'subarea_invalida');
SELECT pg_temp.assert_raises('v: desde after hasta',
  $q$SELECT pg_temp.con(0, 0, '2026-10-03', '2026-08-09')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('v: 367 days',
  $q$SELECT pg_temp.con(0, 0, '2025-10-03', '2026-10-04')$q$, '22023', 'rango_invalido');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes it, anon not; SECURITY DEFINER with an empty search_path',
  $q$SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ':' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'estudiantes_reporte_conexiones'$q$,
  'true:false:true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_rc_failures);
END;
$$;
