-- T8b (odd/tasks/talleres-reserva-publica.md, S17) — RED→GREEN for
-- 20261110220000_talleres_recuperar_clase.sql: recover a missed clase apart
-- and have it count as attended at the cierre.
-- Run against STAGING inside BEGIN…ROLLBACK after 20261110220000 — nothing
-- here is kept; fixture ids live under cf8b0000-..., emails end in
-- @example.test, phones are already normalized (staging normalizes them).
--
-- H = talleres_hoy(), captured once into zz_8b.h.
-- Nodes: CON cf8b…01 (root) > A …02, B …03. One taller per node (staging
--   enforces talleres_dream_team_equipo_id_uniq).
-- Talleres: T_a …10 (clases mínimas 3, recoveries allowed), T_b …11
--   (permite_recuperar_clases = false).
-- Ediciones: E_a …90 (T_a, grupos G1 …40 and G2 …41), E_b …91 (T_b, G3
--   …42), E_c …92 (T_a, already closed, G4 …43).
-- Sesiones: S11 …60 (G1 #1, H-14, cerrada), S12 …61 (G1 #2, H-7, cerrada),
--   S13 …62 (G1 #3, H-1, en_curso), S21 …63 (G2 #1, cerrada), S31 …64 (G3
--   #1, cerrada), S41 …65 (G4 #1, cerrada).
-- Persons (auth a<n>): DIR 21/a1 director.write+read at CON; COORD 22/a2
--   coordinator.write+read at A; COORD_B 23/a3 coordinator.write+read at B;
--   ADMIN 24/a4 admin.manage at CON only; L1 25/a5 líder of G1, G3, G4;
--   L2 26/a6 líder of G2; V1 27/a7 voluntario of G1; P1 28/a8 (G1, ausente
--   in S11); P2 29/a9 (G1, always presente); P3 2a/aa (G2); P4 2b/ab (G3);
--   P5 2c (G4, no account).
--
-- Covered (one block per rule): 1 grants, RLS and the switch default;
--   2 authority (líder of the grupo yes; líder of another grupo, voluntario,
--   the member, admin.manage alone, a coordinator of another node no);
--   3 only an ausente of this grupo in a cerrada sesión, dates, nota,
--   dada_por; 4 switch off refuses; 5 register; 6 unique; 7 the cierre
--   counts a recovered clase once, and not with the switch off; 8 who reads
--   the rows; 9 anular; 10 a closed edición refuses both.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_8b.h', public.talleres_hoy()::text, true);

CREATE TEMP TABLE t_8b_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_8b_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_8b (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_8b_failures, t_8b_cases, t_8b TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.h() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_8b.h')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_8b_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Expects SQLSTATE and, when given, the exact message.
CREATE OR REPLACE FUNCTION pg_temp.assert_error(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_8b_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_sqlstate OR (p_message IS NOT NULL AND SQLERRM IS DISTINCT FROM p_message) THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_8b_cases VALUES (p_case);
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
    IF v_n IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.run(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_8b_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one jsonb value), keeps it under p_key and, when p_expected
-- is given, compares it.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text, p_expected jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  INSERT INTO t_8b_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_8b (key, j) VALUES (p_key, v) ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
    IF p_expected IS NOT NULL AND v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected::text || ', got ' || coalesce(v::text, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_total int;
  v_msg text;
BEGIN
  SELECT count(*) INTO v_total FROM t_8b_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_8b_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s) of %:\n%', v_n, v_total, v_msg;
  END IF;
  RETURN 'all ' || v_total || ' cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- {inscripcion: [clases_presente, resultado]} of E_a from the cierre computation.
CREATE OR REPLACE FUNCTION pg_temp.cierre_e_a() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(r.inscripcion_id::text, jsonb_build_array(r.clases_presente, r.resultado))
    FROM public.talleres_cierre_resultados('cf8b0000-0000-4000-8000-000000000090') r;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf8b0000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ 8B Conexion', NULL, true),
  ('cf8b0000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ 8B A', 'cf8b0000-0000-4000-8000-000000000001', true),
  ('cf8b0000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ 8B B', 'cf8b0000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf8b0000-0000-4000-8000-000000000010', 'zz-8b-a', 'ZZ 8B A', 'cf8b0000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, -5),
  ('cf8b0000-0000-4000-8000-000000000011', 'zz-8b-b', 'ZZ 8B B', 'cf8b0000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, -5);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf8b0000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ 8B Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 2) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
)
SELECT ('cf8b0000-0000-4000-8000-00000000009' || x.n)::uuid, ('cf8b0000-0000-4000-8000-00000000008' || x.n)::uuid, x.taller::uuid,
       'individual', NULL, 'permanente_custom', 'en_curso', 'ZZ 8B E' || x.n, 3, 90, 'permanente_custom',
       pg_temp.h() - 14, pg_temp.h() - 20, pg_temp.h() + 30
  FROM (VALUES
    (0, 'cf8b0000-0000-4000-8000-000000000010'),
    (1, 'cf8b0000-0000-4000-8000-000000000011'),
    (2, 'cf8b0000-0000-4000-8000-000000000010')
  ) AS x(n, taller);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('cf8b0000-0000-4000-8000-0000000000c0', 'cf8b0000-0000-4000-8000-000000000090', 'cf8b0000-0000-4000-8000-000000000002', 'ZZ 8B Cohorte 0', (pg_temp.h() - 14)::timestamptz),
  ('cf8b0000-0000-4000-8000-0000000000c1', 'cf8b0000-0000-4000-8000-000000000091', 'cf8b0000-0000-4000-8000-000000000003', 'ZZ 8B Cohorte 1', (pg_temp.h() - 14)::timestamptz),
  ('cf8b0000-0000-4000-8000-0000000000c2', 'cf8b0000-0000-4000-8000-000000000092', 'cf8b0000-0000-4000-8000-000000000002', 'ZZ 8B Cohorte 2', (pg_temp.h() - 14)::timestamptz);

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf8b0000-0000-4000-8000-000000000040', 'cf8b0000-0000-4000-8000-0000000000c0', 'ZZ 8B G1', 10, 'activo'),
  ('cf8b0000-0000-4000-8000-000000000041', 'cf8b0000-0000-4000-8000-0000000000c0', 'ZZ 8B G2', 10, 'activo'),
  ('cf8b0000-0000-4000-8000-000000000042', 'cf8b0000-0000-4000-8000-0000000000c1', 'ZZ 8B G3', 10, 'activo'),
  ('cf8b0000-0000-4000-8000-000000000043', 'cf8b0000-0000-4000-8000-0000000000c2', 'ZZ 8B G4', 10, 'activo');

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000040', 1, pg_temp.h() - 14, 'programada'),
  ('cf8b0000-0000-4000-8000-000000000061', 'cf8b0000-0000-4000-8000-000000000040', 2, pg_temp.h() - 7, 'programada'),
  ('cf8b0000-0000-4000-8000-000000000062', 'cf8b0000-0000-4000-8000-000000000040', 3, pg_temp.h() - 1, 'programada'),
  ('cf8b0000-0000-4000-8000-000000000063', 'cf8b0000-0000-4000-8000-000000000041', 1, pg_temp.h() - 14, 'programada'),
  ('cf8b0000-0000-4000-8000-000000000064', 'cf8b0000-0000-4000-8000-000000000042', 1, pg_temp.h() - 14, 'programada'),
  ('cf8b0000-0000-4000-8000-000000000065', 'cf8b0000-0000-4000-8000-000000000043', 1, pg_temp.h() - 14, 'programada');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf8b0000-0000-4000-8000-0000000000' || a)::uuid, 'authenticated', 'authenticated', 'cf8b-' || a || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'aa', 'ab']) AS a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('cf8b0000-0000-4000-8000-000000000021', 'cf8b0000-0000-4000-8000-0000000000a1', 'Dora', 'ZZ8B Director', 'cf8b-a1@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-000000000022', 'cf8b0000-0000-4000-8000-0000000000a2', 'Carla', 'ZZ8B Coord', 'cf8b-a2@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-000000000023', 'cf8b0000-0000-4000-8000-0000000000a3', 'Otto', 'ZZ8B CoordB', 'cf8b-a3@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8b0000-0000-4000-8000-000000000024', 'cf8b0000-0000-4000-8000-0000000000a4', 'Ada', 'ZZ8B Admin', 'cf8b-a4@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-000000000025', 'cf8b0000-0000-4000-8000-0000000000a5', 'Yusmary', 'ZZ8B Lider', 'cf8b-a5@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-000000000026', 'cf8b0000-0000-4000-8000-0000000000a6', 'Leo', 'ZZ8B LiderDos', 'cf8b-a6@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8b0000-0000-4000-8000-000000000027', 'cf8b0000-0000-4000-8000-0000000000a7', 'Vera', 'ZZ8B Voluntaria', 'cf8b-a7@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-000000000028', 'cf8b0000-0000-4000-8000-0000000000a8', 'Pablo', 'ZZ8B Uno', 'cf8b-a8@example.test', '04141110001', 'Soltero', 'Masculino'),
  ('cf8b0000-0000-4000-8000-000000000029', 'cf8b0000-0000-4000-8000-0000000000a9', 'Pedro', 'ZZ8B Dos', 'cf8b-a9@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8b0000-0000-4000-8000-00000000002a', 'cf8b0000-0000-4000-8000-0000000000aa', 'Raul', 'ZZ8B Tres', 'cf8b-aa@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8b0000-0000-4000-8000-00000000002b', 'cf8b0000-0000-4000-8000-0000000000ab', 'Susi', 'ZZ8B Cuatro', 'cf8b-ab@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8b0000-0000-4000-8000-00000000002c', NULL, 'Quique', 'ZZ8B Cinco', NULL, NULL, 'Soltero', 'Masculino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('cf8b0000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000001'),
  ('cf8b0000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000001'),
  ('cf8b0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000002'),
  ('cf8b0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000002'),
  ('cf8b0000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000003'),
  ('cf8b0000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000003'),
  ('cf8b0000-0000-4000-8000-000000000024', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'taller', 'cf8b0000-0000-4000-8000-000000000001');

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('cf8b0000-0000-4000-8000-0000000000d0', 'cf8b0000-0000-4000-8000-000000000040', 'cf8b0000-0000-4000-8000-000000000025', 'lider', true),
  ('cf8b0000-0000-4000-8000-0000000000d1', 'cf8b0000-0000-4000-8000-000000000040', 'cf8b0000-0000-4000-8000-000000000027', 'voluntario', true),
  ('cf8b0000-0000-4000-8000-0000000000d2', 'cf8b0000-0000-4000-8000-000000000041', 'cf8b0000-0000-4000-8000-000000000026', 'lider', true),
  ('cf8b0000-0000-4000-8000-0000000000d3', 'cf8b0000-0000-4000-8000-000000000042', 'cf8b0000-0000-4000-8000-000000000025', 'lider', true),
  ('cf8b0000-0000-4000-8000-0000000000d4', 'cf8b0000-0000-4000-8000-000000000043', 'cf8b0000-0000-4000-8000-000000000025', 'lider', true);

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado, grupo_id) VALUES
  ('cf8b0000-0000-4000-8000-000000000050', 'cf8b0000-0000-4000-8000-000000000090', 'cf8b0000-0000-4000-8000-0000000000c0', 'cf8b0000-0000-4000-8000-000000000028', 'aprobado', NULL, 'cf8b0000-0000-4000-8000-000000000040'),
  ('cf8b0000-0000-4000-8000-000000000051', 'cf8b0000-0000-4000-8000-000000000090', 'cf8b0000-0000-4000-8000-0000000000c0', 'cf8b0000-0000-4000-8000-000000000029', 'aprobado', NULL, 'cf8b0000-0000-4000-8000-000000000040'),
  ('cf8b0000-0000-4000-8000-000000000052', 'cf8b0000-0000-4000-8000-000000000090', 'cf8b0000-0000-4000-8000-0000000000c0', 'cf8b0000-0000-4000-8000-00000000002a', 'aprobado', NULL, 'cf8b0000-0000-4000-8000-000000000041'),
  ('cf8b0000-0000-4000-8000-000000000053', 'cf8b0000-0000-4000-8000-000000000091', 'cf8b0000-0000-4000-8000-0000000000c1', 'cf8b0000-0000-4000-8000-00000000002b', 'aprobado', NULL, 'cf8b0000-0000-4000-8000-000000000042'),
  ('cf8b0000-0000-4000-8000-000000000054', 'cf8b0000-0000-4000-8000-000000000092', 'cf8b0000-0000-4000-8000-0000000000c2', 'cf8b0000-0000-4000-8000-00000000002c', 'aprobado', NULL, 'cf8b0000-0000-4000-8000-000000000043');

-- S11: P1 ausente, P2 presente. S12, S13: both presente. S21: P3 ausente.
-- S31: P4 ausente. S41: P5 ausente.
INSERT INTO public.taller_asistencias (sesion_id, inscripcion_id, persona_id, estado, motivo) VALUES
  ('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000050', 'cf8b0000-0000-4000-8000-000000000028', 'ausente', 'Viaje'),
  ('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000051', 'cf8b0000-0000-4000-8000-000000000029', 'presente', NULL),
  ('cf8b0000-0000-4000-8000-000000000061', 'cf8b0000-0000-4000-8000-000000000050', 'cf8b0000-0000-4000-8000-000000000028', 'presente', NULL),
  ('cf8b0000-0000-4000-8000-000000000061', 'cf8b0000-0000-4000-8000-000000000051', 'cf8b0000-0000-4000-8000-000000000029', 'presente', NULL),
  ('cf8b0000-0000-4000-8000-000000000062', 'cf8b0000-0000-4000-8000-000000000050', 'cf8b0000-0000-4000-8000-000000000028', 'presente', NULL),
  ('cf8b0000-0000-4000-8000-000000000062', 'cf8b0000-0000-4000-8000-000000000051', 'cf8b0000-0000-4000-8000-000000000029', 'presente', NULL),
  ('cf8b0000-0000-4000-8000-000000000063', 'cf8b0000-0000-4000-8000-000000000052', 'cf8b0000-0000-4000-8000-00000000002a', 'ausente', NULL),
  ('cf8b0000-0000-4000-8000-000000000064', 'cf8b0000-0000-4000-8000-000000000053', 'cf8b0000-0000-4000-8000-00000000002b', 'ausente', NULL),
  ('cf8b0000-0000-4000-8000-000000000065', 'cf8b0000-0000-4000-8000-000000000054', 'cf8b0000-0000-4000-8000-00000000002c', 'ausente', NULL);

UPDATE public.taller_sesiones SET estado = 'cerrada'
 WHERE id IN ('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000061',
              'cf8b0000-0000-4000-8000-000000000063', 'cf8b0000-0000-4000-8000-000000000064',
              'cf8b0000-0000-4000-8000-000000000065');
UPDATE public.taller_sesiones SET estado = 'en_curso', fecha_realizada = pg_temp.h() - 1
 WHERE id = 'cf8b0000-0000-4000-8000-000000000062';

SELECT pg_temp.run('0: T_a requires 3 clases; T_b does not allow recoveries; E_c is closed',
  $$UPDATE public.talleres SET clases_minimas_para_completar = 3 WHERE id = 'cf8b0000-0000-4000-8000-000000000010';
    UPDATE public.talleres SET permite_recuperar_clases = false WHERE id = 'cf8b0000-0000-4000-8000-000000000011';
    SELECT set_config('talleres.cierre_autorizado', '1', true);
    UPDATE public.taller_ediciones SET cerrada_en = now(), cerrada_por = 'cf8b0000-0000-4000-8000-000000000021'
     WHERE id = 'cf8b0000-0000-4000-8000-000000000092';
    SELECT set_config('talleres.cierre_autorizado', '', true);
    INSERT INTO public.taller_recuperaciones (id, sesion_id, persona_id, fecha, dada_por)
    VALUES ('cf8b0000-0000-4000-8000-000000000070', 'cf8b0000-0000-4000-8000-000000000065',
            'cf8b0000-0000-4000-8000-00000000002c', pg_temp.h() - 10, 'cf8b0000-0000-4000-8000-000000000025')$$);

-- ══ 1. Grants, RLS and the switch ══

SELECT pg_temp.assert_rows('1: the two RPCs are definers with search_path "", authenticated yes, anon no, no PUBLIC entry',
  $$SELECT 1 FROM unnest(ARRAY['public.talleres_registrar_recuperacion(uuid,uuid,date,uuid,text)',
                               'public.talleres_anular_recuperacion(uuid)']) AS f(sig)
      JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 2);
SELECT pg_temp.assert_rows('1: talleres_cierre_resultados is still not executable by authenticated or anon',
  $$SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.talleres_cierre_resultados(uuid)', 'execute')
     AND NOT has_function_privilege('anon', 'public.talleres_cierre_resultados(uuid)', 'execute')$$, 1);
SELECT pg_temp.assert_rows('1: taller_recuperaciones has RLS on; authenticated may only SELECT; anon nothing',
  $$SELECT 1 FROM pg_class c
     WHERE c.oid = 'public.taller_recuperaciones'::regclass AND c.relrowsecurity
       AND has_table_privilege('authenticated', c.oid, 'SELECT')
       AND NOT has_table_privilege('authenticated', c.oid, 'INSERT')
       AND NOT has_table_privilege('authenticated', c.oid, 'UPDATE')
       AND NOT has_table_privilege('authenticated', c.oid, 'DELETE')
       AND NOT has_table_privilege('anon', c.oid, 'SELECT')$$, 1);
SELECT pg_temp.assert_rows('1: permite_recuperar_clases is boolean NOT NULL DEFAULT true (a new taller allows recoveries)',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talleres' AND column_name = 'permite_recuperar_clases'
       AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'true'$$, 1);
SELECT pg_temp.assert_error('1: a nota over 300 characters is refused by the CHECK',
  $$UPDATE public.taller_recuperaciones SET nota = repeat('x', 301) WHERE id = 'cf8b0000-0000-4000-8000-000000000070'$$, '23514');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_error('1: the líder cannot insert a recovery directly (only through the RPC)',
  $$INSERT INTO public.taller_recuperaciones (sesion_id, persona_id, fecha, dada_por)
    VALUES ('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), 'cf8b0000-0000-4000-8000-000000000025')$$,
  '42501');
RESET ROLE;

SELECT pg_temp.capture('1: before any recovery, P1 attended 2 of 3 held clases and does not complete; P2 completes', 'antes',
  $$SELECT pg_temp.cierre_e_a()$$,
  '{"cf8b0000-0000-4000-8000-000000000050": [2, "no_completado"],
    "cf8b0000-0000-4000-8000-000000000051": [3, "completado"],
    "cf8b0000-0000-4000-8000-000000000052": [0, "abandono"]}');

-- ══ 2. Authority ══

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.assert_error('2: the líder of ANOTHER grupo cannot register',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  '42501', 'sin_permisos_para_este_grupo');

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a7');
SELECT pg_temp.assert_error('2: a voluntario of the grupo cannot register',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  '42501', 'sin_permisos_para_este_grupo');

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('2: the member cannot register their own recovery',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  '42501', 'sin_permisos_para_este_grupo');

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_error('2: admin.manage alone cannot register',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  '42501', 'sin_permisos_para_este_grupo');

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('2: a coordinator of another node cannot register',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  '42501', 'sin_permisos_para_este_grupo');

RESET ROLE;
SELECT pg_temp.assert_rows('2: nothing was stored by the refused callers',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 0);

-- ══ 3. Only an ausente of this grupo, in a cerrada sesión; dates, nota, dada_por ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a5');

SELECT pg_temp.assert_error('3: an unknown sesión',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-0000000000ff', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'SESION_NO_ENCONTRADA');
SELECT pg_temp.assert_error('3: a clase still en_curso cannot be recovered',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000062', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'CLASE_NO_CERRADA');
SELECT pg_temp.assert_error('3: a person marked presente cannot recover',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000029', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'PERSONA_NO_AUSENTE');
SELECT pg_temp.assert_error('3: a person of another grupo cannot recover this grupo''s clase',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-00000000002a', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'PERSONA_NO_AUSENTE');
SELECT pg_temp.assert_error('3: the fecha is required',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', NULL, NULL, NULL)$$,
  'P0001', 'FECHA_RECUPERACION_REQUERIDA');
SELECT pg_temp.assert_error('3: a future fecha is refused',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h() + 1, NULL, NULL)$$,
  'P0001', 'FECHA_RECUPERACION_FUTURA');
SELECT pg_temp.assert_error('3: a fecha before the clase is refused',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h() - 15, NULL, NULL)$$,
  'P0001', 'FECHA_RECUPERACION_ANTES_DE_LA_CLASE');
SELECT pg_temp.assert_error('3: a nota over 300 characters is refused',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, repeat('x', 301))$$,
  'P0001', 'NOTA_DEMASIADO_LARGA');
SELECT pg_temp.assert_error('3: dada_por must be a person of the system',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), 'cf8b0000-0000-4000-8000-0000000000fe', NULL)$$,
  'P0001', 'DADA_POR_INVALIDA');

-- ══ 4. The switch off refuses ══

SELECT pg_temp.assert_error('4: a taller with permite_recuperar_clases = false refuses (líder of G3)',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000064', 'cf8b0000-0000-4000-8000-00000000002b', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'RECUPERACION_NO_PERMITIDA');

RESET ROLE;
SELECT pg_temp.assert_rows('3/4: nothing was stored by the refused calls',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE id <> 'cf8b0000-0000-4000-8000-000000000070'$$, 0);

-- ══ 5. Register (líder of the grupo) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.capture('5: the líder of the grupo registers P1''s clase 1 today; dada_por defaults to the caller', 'registro',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, '  Con el grupo 2  ') - 'id'$$,
  jsonb_build_object('sesion_id', 'cf8b0000-0000-4000-8000-000000000060', 'persona_id', 'cf8b0000-0000-4000-8000-000000000028',
                     'fecha', pg_temp.h(), 'dada_por', 'cf8b0000-0000-4000-8000-000000000025'));
RESET ROLE;
SELECT pg_temp.assert_rows('5: one row with the trimmed nota, dada_por and created_by = the líder',
  $$SELECT 1 FROM public.taller_recuperaciones
     WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060' AND persona_id = 'cf8b0000-0000-4000-8000-000000000028'
       AND fecha = pg_temp.h() AND nota = 'Con el grupo 2'
       AND dada_por = 'cf8b0000-0000-4000-8000-000000000025' AND created_by = 'cf8b0000-0000-4000-8000-000000000025'$$, 1);
SELECT pg_temp.assert_rows('5: the attendance mark itself is untouched (still ausente with its motivo)',
  $$SELECT 1 FROM public.taller_asistencias
     WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060' AND inscripcion_id = 'cf8b0000-0000-4000-8000-000000000050'
       AND estado = 'ausente' AND motivo = 'Viaje'$$, 1);

-- ══ 6. Unique per (sesión, persona) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_error('6: a second recovery of the same clase is refused (coordinator)',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'RECUPERACION_YA_REGISTRADA');
RESET ROLE;
SELECT pg_temp.assert_rows('6: still one row',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 1);

-- ══ 7. The cierre counts the recovered clase as attended ══

SELECT pg_temp.capture('7: with the recovery P1 reaches 3 of 3 and completes', 'despues',
  $$SELECT pg_temp.cierre_e_a()$$,
  '{"cf8b0000-0000-4000-8000-000000000050": [3, "completado"],
    "cf8b0000-0000-4000-8000-000000000051": [3, "completado"],
    "cf8b0000-0000-4000-8000-000000000052": [0, "abandono"]}');
SELECT pg_temp.run('7: (fixture) a recovery row on a presente mark of P2',
  $$INSERT INTO public.taller_recuperaciones (id, sesion_id, persona_id, fecha, dada_por)
    VALUES ('cf8b0000-0000-4000-8000-000000000071', 'cf8b0000-0000-4000-8000-000000000061',
            'cf8b0000-0000-4000-8000-000000000029', pg_temp.h(), 'cf8b0000-0000-4000-8000-000000000025')$$);
SELECT pg_temp.capture('7: a clase presente AND recovered counts once (P2 stays at 3)', 'doble',
  $$SELECT pg_temp.cierre_e_a() -> 'cf8b0000-0000-4000-8000-000000000051'$$, '[3, "completado"]');
SELECT pg_temp.run('7: (fixture) remove it',
  $$DELETE FROM public.taller_recuperaciones WHERE id = 'cf8b0000-0000-4000-8000-000000000071'$$);
SELECT pg_temp.run('7: (fixture) the taller turns the switch off',
  $$UPDATE public.talleres SET permite_recuperar_clases = false WHERE id = 'cf8b0000-0000-4000-8000-000000000010'$$);
SELECT pg_temp.capture('7: with the switch off the recovery no longer counts', 'apagado',
  $$SELECT pg_temp.cierre_e_a() -> 'cf8b0000-0000-4000-8000-000000000050'$$, '[2, "no_completado"]');
SELECT pg_temp.run('7: (fixture) the switch back on',
  $$UPDATE public.talleres SET permite_recuperar_clases = true WHERE id = 'cf8b0000-0000-4000-8000-000000000010'$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('7: the director''s preview shows P1 at 3 of 3, completado', 'preview',
  $$SELECT (SELECT jsonb_build_array(f -> 'clases_presente', f -> 'clases_total', f -> 'resultado')
              FROM jsonb_array_elements(public.talleres_previsualizar_cierre('cf8b0000-0000-4000-8000-000000000090') -> 'filas') f
             WHERE f ->> 'inscripcion_id' = 'cf8b0000-0000-4000-8000-000000000050')$$,
  '[3, 3, "completado"]');

-- ══ 8. Who reads the rows ══

SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_rows('8: the líder of G1 reads G1''s recovery',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a7');
SELECT pg_temp.assert_rows('8: a voluntario of G1 reads it too (member of the grupo)',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_rows('8: the coordinator of the node reads it',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.assert_rows('8: the líder of another grupo does not',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_rows('8: a coordinator of another node does not',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 0);

-- ══ 9. Anular ══

RESET ROLE;
SELECT pg_temp.capture('9: (lookup) the recovery id', 'rec_id',
  $$SELECT to_jsonb(r.id) FROM public.taller_recuperaciones r WHERE r.sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.assert_error('9: the líder of another grupo cannot anular',
  $$SELECT public.talleres_anular_recuperacion((SELECT (j #>> '{}')::uuid FROM t_8b WHERE key = 'rec_id'))$$,
  '42501', 'sin_permisos_para_este_grupo');
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('9: the member cannot anular',
  $$SELECT public.talleres_anular_recuperacion((SELECT (j #>> '{}')::uuid FROM t_8b WHERE key = 'rec_id'))$$,
  '42501', 'sin_permisos_para_este_grupo');
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('9: the coordinator anula it', 'anular',
  $$SELECT public.talleres_anular_recuperacion((SELECT (j #>> '{}')::uuid FROM t_8b WHERE key = 'rec_id')) - 'id'$$,
  '{"anulada": true}');
SELECT pg_temp.assert_error('9: anular again: not found',
  $$SELECT public.talleres_anular_recuperacion((SELECT (j #>> '{}')::uuid FROM t_8b WHERE key = 'rec_id'))$$,
  'P0001', 'RECUPERACION_NO_ENCONTRADA');
RESET ROLE;
SELECT pg_temp.assert_rows('9: the row is gone',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.capture('9: after anular P1 is back at 2, no_completado', 'tras_anular',
  $$SELECT pg_temp.cierre_e_a() -> 'cf8b0000-0000-4000-8000-000000000050'$$, '[2, "no_completado"]');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('9: the director registers it again, given by another facilitador yesterday', 'otra_vez',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000060', 'cf8b0000-0000-4000-8000-000000000028',
                                                  pg_temp.h() - 1, 'cf8b0000-0000-4000-8000-000000000026', NULL) -> 'dada_por'$$,
  '"cf8b0000-0000-4000-8000-000000000026"');
RESET ROLE;
SELECT pg_temp.assert_rows('9: the new row has created_by = the director and no nota',
  $$SELECT 1 FROM public.taller_recuperaciones
     WHERE sesion_id = 'cf8b0000-0000-4000-8000-000000000060' AND created_by = 'cf8b0000-0000-4000-8000-000000000021'
       AND nota IS NULL AND fecha = pg_temp.h() - 1$$, 1);

-- ══ 10. A closed edición refuses both ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8b0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_error('10: no recovery once the edición is closed',
  $$SELECT public.talleres_registrar_recuperacion('cf8b0000-0000-4000-8000-000000000065', 'cf8b0000-0000-4000-8000-00000000002c', pg_temp.h(), NULL, NULL)$$,
  'P0001', 'EDICION_YA_CERRADA');
SELECT pg_temp.assert_error('10: no anular once the edición is closed',
  $$SELECT public.talleres_anular_recuperacion('cf8b0000-0000-4000-8000-000000000070')$$,
  'P0001', 'EDICION_YA_CERRADA');
RESET ROLE;
SELECT pg_temp.assert_rows('10: the closed edición''s recovery is still there',
  $$SELECT 1 FROM public.taller_recuperaciones WHERE id = 'cf8b0000-0000-4000-8000-000000000070'$$, 1);

SELECT pg_temp.report();

ROLLBACK;
