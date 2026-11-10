-- T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — RED→GREEN for
-- 20261110200000_talleres_minimo_suspension.sql: the minimum of inscritos,
-- the suspension with a new date, the member's answer, the phone
-- confirmation, the daily exit of whoever did not answer and «Abrir igual».
-- Run against STAGING inside BEGIN…ROLLBACK after 20261110200000 — nothing
-- here is kept; fixture ids live under cf8a0000-..., emails end in
-- @example.test, phones are already normalized (staging normalizes them).
-- Run 20260928150000's own suite (talleres-reprogramar-edicion.test.sql)
-- too: talleres_reprogramar_edicion is recreated on the shared move.
--
-- H = talleres_hoy(), captured once into zz_8a.h.
-- Nodes: CON cf8a…01 (root) > HOM …02, OTRO …03, PAR …04.
-- Talleres: T_hom …10 (individual, minimo 4), T_otro …11 (minimo NULL),
--   T_par …12 (pareja matrimonio, minimo 2). One taller per node (staging
--   enforces talleres_dream_team_equipo_id_uniq).
-- Ediciones (cohorte cf8a…c<n> for cf8a…9<n>):
--   E_bajo 90 (T_hom) start H+4, cierre H-1, 3 aprobadas + 1 pendiente,
--     clases 1..3 at H+4, H+11, H+18
--   E_null 91 (T_otro) cierre H-1, no inscritos
--   E_abierta 92 (T_hom) cierre H+5 (still open), no inscritos
--   E_par 93 (T_par) cierre H (today), one approved couple
--   E_abrir 94 (T_hom) cierre H-1, no inscritos
--   E_emp 95 (T_hom) cierre H-1, clase 1 already cerrada
--   E_canc 96 (T_hom) cancelado
--   E_ok 97 (T_hom) cierre H-1, 4 aprobadas (reaches the minimum)
--   E_venc 98 (T_otro) confirmations past their limit
-- Persons (auth a<n>): DIR 21/a1 director.write+read at CON; COORD 22/a2
--   coordinator.write+read at HOM; COORD_OTRO 23/a3 at OTRO; ADMIN 24/a4
--   admin.manage at CON only; LEAD 25/a5 lead.read at HOM; P1 26/a6;
--   P2 27 (no account, no phone); P3 28/a7; MEMBER 29/a8; PA 2a/a9 and
--   PB 2b/aa (the couple); P5 2c/ab.
--
-- Covered (one block per rule): 1 grants and the minimo CHECK; 2 below
--   minimum (counts only aprobadas, a couple is one unit, cierre today
--   counts, minimo NULL never below); 3 panel authority; 4 suspension
--   (authority, refusals, dates, confirmations, avisos rows, recipients);
--   5 the member's answer (own inscription only, mantener, no_puedo →
--   retirado); 6 phone confirmation (authority); 7 expiry (only pendiente
--   aprobadas past the limit); 8 abrir igual (S16 authority).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_8a.h', public.talleres_hoy()::text, true);

CREATE TEMP TABLE t_8a_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_8a_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_8a (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_8a_failures, t_8a_cases, t_8a TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.h() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_8a.h')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_8a_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Expects SQLSTATE and, when given, the exact message.
CREATE OR REPLACE FUNCTION pg_temp.assert_error(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_8a_cases VALUES (p_case);
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
  INSERT INTO t_8a_cases VALUES (p_case);
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
  INSERT INTO t_8a_cases VALUES (p_case);
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
  INSERT INTO t_8a_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_8a (key, j) VALUES (p_key, v) ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
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
  SELECT count(*) INTO v_total FROM t_8a_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_8a_failures;
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf8a0000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ 8A Conexion', NULL, true),
  ('cf8a0000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ 8A Hombre', 'cf8a0000-0000-4000-8000-000000000001', true),
  ('cf8a0000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ 8A Otro', 'cf8a0000-0000-4000-8000-000000000001', true),
  ('cf8a0000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ 8A Parejas', 'cf8a0000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf8a0000-0000-4000-8000-000000000010', 'zz-8a-hombre', 'ZZ 8A Hombre', 'cf8a0000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, -5),
  ('cf8a0000-0000-4000-8000-000000000011', 'zz-8a-otro', 'ZZ 8A Otro', 'cf8a0000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, -5),
  ('cf8a0000-0000-4000-8000-000000000012', 'zz-8a-parejas', 'ZZ 8A Parejas', 'cf8a0000-0000-4000-8000-000000000004', 'pareja', 'matrimonio', 'cadencia', 7, 0);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf8a0000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ 8A Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 8) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
)
SELECT ('cf8a0000-0000-4000-8000-00000000009' || x.n)::uuid, ('cf8a0000-0000-4000-8000-00000000008' || x.n)::uuid, x.taller::uuid,
       x.tipo, x.link, 'permanente_custom', x.estado, 'ZZ 8A E' || x.n, 3, 90, 'permanente_custom',
       pg_temp.h() + x.inicio, pg_temp.h() + x.cierre, pg_temp.h() + 30
  FROM (VALUES
    (0, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'cerrado', 4, -1),
    (1, 'cf8a0000-0000-4000-8000-000000000011', 'individual', NULL, 'cerrado', 4, -1),
    (2, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'abierto', 8, 5),
    (3, 'cf8a0000-0000-4000-8000-000000000012', 'pareja', 'matrimonio', 'en_curso', 0, 0),
    (4, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'cerrado', 4, -1),
    (5, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'en_curso', -1, -1),
    (6, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'cancelado', 4, -1),
    (7, 'cf8a0000-0000-4000-8000-000000000010', 'individual', NULL, 'cerrado', 4, -1),
    (8, 'cf8a0000-0000-4000-8000-000000000011', 'individual', NULL, 'abierto', 9, 3)
  ) AS x(n, taller, tipo, link, estado, inicio, cierre);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('cf8a0000-0000-4000-8000-0000000000c' || n)::uuid, ('cf8a0000-0000-4000-8000-00000000009' || n)::uuid,
       'cf8a0000-0000-4000-8000-000000000002', 'ZZ 8A Cohorte ' || n, (pg_temp.h() + 4)::timestamptz
  FROM generate_series(0, 8) AS n;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf8a0000-0000-4000-8000-000000000040', 'cf8a0000-0000-4000-8000-0000000000c0', 'ZZ 8A Grupo Bajo', 10, 'activo'),
  ('cf8a0000-0000-4000-8000-000000000045', 'cf8a0000-0000-4000-8000-0000000000c5', 'ZZ 8A Grupo Empezo', 10, 'activo');

INSERT INTO public.taller_sesiones (grupo_id, numero, fecha_programada, estado) VALUES
  ('cf8a0000-0000-4000-8000-000000000040', 1, pg_temp.h() + 4, 'programada'),
  ('cf8a0000-0000-4000-8000-000000000040', 2, pg_temp.h() + 11, 'programada'),
  ('cf8a0000-0000-4000-8000-000000000040', 3, pg_temp.h() + 18, 'programada'),
  ('cf8a0000-0000-4000-8000-000000000045', 1, pg_temp.h() - 1, 'programada');
UPDATE public.taller_sesiones SET estado = 'cerrada'
 WHERE grupo_id = 'cf8a0000-0000-4000-8000-000000000045' AND numero = 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf8a0000-0000-4000-8000-0000000000' || a)::uuid, 'authenticated', 'authenticated', 'cf8a-' || a || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'aa', 'ab']) AS a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('cf8a0000-0000-4000-8000-000000000021', 'cf8a0000-0000-4000-8000-0000000000a1', 'Dora', 'ZZ8A Director', 'cf8a-a1@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8a0000-0000-4000-8000-000000000022', 'cf8a0000-0000-4000-8000-0000000000a2', 'Carlos', 'ZZ8A Coord', 'cf8a-a2@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000023', 'cf8a0000-0000-4000-8000-0000000000a3', 'Otto', 'ZZ8A CoordOtro', 'cf8a-a3@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000024', 'cf8a0000-0000-4000-8000-0000000000a4', 'Ada', 'ZZ8A Admin', 'cf8a-a4@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8a0000-0000-4000-8000-000000000025', 'cf8a0000-0000-4000-8000-0000000000a5', 'Leo', 'ZZ8A Lider', 'cf8a-a5@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000026', 'cf8a0000-0000-4000-8000-0000000000a6', 'Pablo', 'ZZ8A Uno', 'cf8a-a6@example.test', '04141110001', 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000027', NULL, 'Quique', 'ZZ8A Dos', NULL, NULL, 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000028', 'cf8a0000-0000-4000-8000-0000000000a7', 'Raul', 'ZZ8A Tres', 'cf8a-a7@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf8a0000-0000-4000-8000-000000000029', 'cf8a0000-0000-4000-8000-0000000000a8', 'Mimi', 'ZZ8A Miembro', 'cf8a-a8@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf8a0000-0000-4000-8000-00000000002a', 'cf8a0000-0000-4000-8000-0000000000a9', 'Ana', 'ZZ8A ParA', 'cf8a-a9@example.test', '04241110002', 'Casado', 'Femenino'),
  ('cf8a0000-0000-4000-8000-00000000002b', 'cf8a0000-0000-4000-8000-0000000000aa', 'Beto', 'ZZ8A ParB', 'cf8a-aa@example.test', NULL, 'Casado', 'Masculino'),
  ('cf8a0000-0000-4000-8000-00000000002c', 'cf8a0000-0000-4000-8000-0000000000ab', 'Susi', 'ZZ8A Cinco', 'cf8a-ab@example.test', NULL, 'Soltero', 'Femenino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('cf8a0000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000001'),
  ('cf8a0000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000001'),
  ('cf8a0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000002'),
  ('cf8a0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000002'),
  ('cf8a0000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000003'),
  ('cf8a0000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000003'),
  ('cf8a0000-0000-4000-8000-000000000024', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000001'),
  ('cf8a0000-0000-4000-8000-000000000025', 'talleres_crecimiento.lead.read', 'talleres_crecimiento', 'taller', 'cf8a0000-0000-4000-8000-000000000002');

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado) VALUES
  -- E_bajo: P1, P2, P5 aprobadas; P3 pendiente.
  ('cf8a0000-0000-4000-8000-000000000050', 'cf8a0000-0000-4000-8000-000000000090', 'cf8a0000-0000-4000-8000-0000000000c0', 'cf8a0000-0000-4000-8000-000000000026', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000051', 'cf8a0000-0000-4000-8000-000000000090', 'cf8a0000-0000-4000-8000-0000000000c0', 'cf8a0000-0000-4000-8000-000000000027', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000052', 'cf8a0000-0000-4000-8000-000000000090', 'cf8a0000-0000-4000-8000-0000000000c0', 'cf8a0000-0000-4000-8000-00000000002c', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000053', 'cf8a0000-0000-4000-8000-000000000090', 'cf8a0000-0000-4000-8000-0000000000c0', 'cf8a0000-0000-4000-8000-000000000028', NULL, NULL, 'pendiente'),
  -- E_par: one approved couple.
  ('cf8a0000-0000-4000-8000-000000000054', 'cf8a0000-0000-4000-8000-000000000093', 'cf8a0000-0000-4000-8000-0000000000c3', 'cf8a0000-0000-4000-8000-00000000002a', 'cf8a0000-0000-4000-8000-00000000002b', 'matrimonio', 'aprobado'),
  -- E_ok: four aprobadas.
  ('cf8a0000-0000-4000-8000-000000000055', 'cf8a0000-0000-4000-8000-000000000097', 'cf8a0000-0000-4000-8000-0000000000c7', 'cf8a0000-0000-4000-8000-000000000026', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000056', 'cf8a0000-0000-4000-8000-000000000097', 'cf8a0000-0000-4000-8000-0000000000c7', 'cf8a0000-0000-4000-8000-000000000027', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000057', 'cf8a0000-0000-4000-8000-000000000097', 'cf8a0000-0000-4000-8000-0000000000c7', 'cf8a0000-0000-4000-8000-000000000029', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000058', 'cf8a0000-0000-4000-8000-000000000097', 'cf8a0000-0000-4000-8000-0000000000c7', 'cf8a0000-0000-4000-8000-00000000002c', NULL, NULL, 'aprobado'),
  -- E_venc: confirmations set up in section 7.
  ('cf8a0000-0000-4000-8000-000000000060', 'cf8a0000-0000-4000-8000-000000000098', 'cf8a0000-0000-4000-8000-0000000000c8', 'cf8a0000-0000-4000-8000-000000000026', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000061', 'cf8a0000-0000-4000-8000-000000000098', 'cf8a0000-0000-4000-8000-0000000000c8', 'cf8a0000-0000-4000-8000-000000000027', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000062', 'cf8a0000-0000-4000-8000-000000000098', 'cf8a0000-0000-4000-8000-0000000000c8', 'cf8a0000-0000-4000-8000-000000000029', NULL, NULL, 'aprobado'),
  ('cf8a0000-0000-4000-8000-000000000063', 'cf8a0000-0000-4000-8000-000000000098', 'cf8a0000-0000-4000-8000-0000000000c8', 'cf8a0000-0000-4000-8000-00000000002c', NULL, NULL, 'pendiente');

SELECT pg_temp.run('0: set the minimums (T_hom 4, T_par 2, T_otro none)',
  $$UPDATE public.talleres SET minimo_inscritos = 4 WHERE id = 'cf8a0000-0000-4000-8000-000000000010';
    UPDATE public.talleres SET minimo_inscritos = 2 WHERE id = 'cf8a0000-0000-4000-8000-000000000012'$$);

-- ══ 1. Grants and the minimo CHECK ══

CREATE TEMP TABLE t_8a_fn (sig text, cliente boolean) ON COMMIT DROP;
INSERT INTO t_8a_fn VALUES
  ('public.talleres_suspender_edicion(uuid,date,date,text,text)', true),
  ('public.talleres_confirmar_cambio_fecha(uuid,text,text)', true),
  ('public.talleres_confirmar_por_telefono(uuid)', true),
  ('public.talleres_abrir_igual(uuid,text)', true),
  ('public.talleres_minimo_panel(uuid)', true),
  ('public.talleres_mis_cambios_de_fecha()', true),
  ('public.talleres_cerrar_confirmaciones_vencidas()', false),
  ('public.talleres_reprogramar_edicion_mover(public.taller_ediciones,date,date,text)', false),
  ('public.talleres_minimo_aprobados(uuid)', false),
  ('public.talleres_edicion_bajo_minimo(uuid)', false);
GRANT SELECT ON t_8a_fn TO authenticated, anon;

SELECT pg_temp.assert_rows('1: the six RPCs are definers with search_path "", authenticated yes, anon no, no PUBLIC entry',
  $$SELECT 1 FROM t_8a_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE f.cliente AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 6);
SELECT pg_temp.assert_rows('1: the job and the internal helpers are not executable by authenticated or anon',
  $$SELECT 1 FROM t_8a_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE NOT f.cliente
       AND NOT has_function_privilege('authenticated', p.oid, 'execute')
       AND NOT has_function_privilege('anon', p.oid, 'execute')$$, 4);
SELECT pg_temp.assert_rows('1: service_role runs the daily job',
  $$SELECT 1 WHERE has_function_privilege('service_role', 'public.talleres_cerrar_confirmaciones_vencidas()', 'execute')$$, 1);
SELECT pg_temp.assert_rows('1: talleres_reprogramar_edicion keeps its grants',
  $$SELECT 1 WHERE has_function_privilege('authenticated', 'public.talleres_reprogramar_edicion(uuid,date,date,text)', 'execute')
     AND NOT has_function_privilege('anon', 'public.talleres_reprogramar_edicion(uuid,date,date,text)', 'execute')$$, 1);
SELECT pg_temp.assert_error('1: minimo_inscritos 0 is refused by the CHECK',
  $$UPDATE public.talleres SET minimo_inscritos = 0 WHERE id = 'cf8a0000-0000-4000-8000-000000000011'$$, '23514');
SELECT pg_temp.assert_error('1: a confirmacion without limit is refused by the CHECK',
  $$UPDATE public.taller_inscripciones SET confirmacion_estado = 'pendiente' WHERE id = 'cf8a0000-0000-4000-8000-000000000060'$$, '23514');
SELECT pg_temp.assert_error('1: an unknown confirmacion_estado is refused',
  $$UPDATE public.taller_inscripciones SET confirmacion_estado = 'quizas', confirmacion_limite = CURRENT_DATE WHERE id = 'cf8a0000-0000-4000-8000-000000000060'$$, '23514');

-- ══ 2. Below the minimum ══

SELECT pg_temp.capture('2: approved units (pendientes do not count; a couple is one unit)', 'aprobados',
  $$SELECT jsonb_build_array(public.talleres_minimo_aprobados('cf8a0000-0000-4000-8000-000000000090'),
                             public.talleres_minimo_aprobados('cf8a0000-0000-4000-8000-000000000093'),
                             public.talleres_minimo_aprobados('cf8a0000-0000-4000-8000-000000000097'))$$,
  '[3, 1, 4]');
SELECT pg_temp.capture('2: below: E_bajo (3 of 4), E_par (cierre today, 1 of 2), E_abrir; not: E_null (no minimum), E_abierta (open), E_canc, E_ok (4 of 4)', 'bajo',
  $$SELECT jsonb_build_object(
      'bajo', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000090'),
      'par', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000093'),
      'abrir', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000094'),
      'null', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000091'),
      'abierta', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000092'),
      'canc', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000096'),
      'ok', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000097'),
      'nadie', public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-0000000000ff'))$$,
  '{"bajo":true,"par":true,"abrir":true,"null":false,"abierta":false,"canc":false,"ok":false,"nadie":false}');

-- ══ 3. Panel ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('3: the director reads E_bajo: minimum, counts, clases and every permission', 'panel_dir',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') - 'conteo' - 'clases' - 'fecha_inicio' - 'cierre_inscripcion'$$,
  '{"minimo":4,"unidad":"personas","bajo_minimo":true,"suspension":null,"abierta_igual":null,"puede_suspender":true,"puede_abrir_igual":true,"puede_confirmar":true,"sin_responder":[]}');
SELECT pg_temp.capture('3: conteo of E_bajo before any suspension', 'panel_conteo',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') -> 'conteo'$$,
  '{"confirmadas":0,"por_telefono":0,"no_puede":0,"sin_responder":0,"salieron_sin_responder":0,"aprobados":3,"pendientes":1,"limite":null}');
SELECT pg_temp.assert_rows('3: the clases a move would shift, one per numero',
  $$SELECT 1 FROM jsonb_array_elements(public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') -> 'clases') c
     WHERE (c ->> 'fecha')::date IN (pg_temp.h() + 4, pg_temp.h() + 11, pg_temp.h() + 18)$$, 3);
SELECT pg_temp.capture('3: a couple taller counts parejas', 'panel_par',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000093') -> 'unidad'$$, '"parejas"');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('3: the taller coordinator may open anyway and confirm, not suspend', 'panel_coord',
  $$SELECT jsonb_build_array(p -> 'puede_suspender', p -> 'puede_abrir_igual', p -> 'puede_confirmar')
      FROM public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') p$$, '[false, true, true]');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.capture('3: admin.manage alone may suspend and confirm, not open anyway', 'panel_admin',
  $$SELECT jsonb_build_array(p -> 'puede_suspender', p -> 'puede_abrir_igual', p -> 'puede_confirmar')
      FROM public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') p$$, '[true, false, true]');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.capture('3: a leader reads the counters but may do nothing', 'panel_lead',
  $$SELECT jsonb_build_array(p -> 'puede_suspender', p -> 'puede_abrir_igual', p -> 'puede_confirmar', p -> 'minimo')
      FROM public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') p$$, '[false, false, false, 4]');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('3: a plain member cannot read the panel',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090')$$, '42501', 'sin_permisos_para_esta_edicion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('3: the coordinator of another taller cannot read the panel',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090')$$, '42501', 'sin_permisos_para_esta_edicion');
RESET ROLE;

-- ══ 4. Suspension ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('4: a plain member cannot suspend',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  '42501', 'sin_permisos_para_esta_edicion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_error('4: the taller coordinator cannot suspend (director or admin only)',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  '42501', 'sin_permisos_para_esta_edicion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('4: the coordinator of another taller cannot suspend',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  '42501', 'sin_permisos_para_esta_edicion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_error('4: a cancelled edición is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000096', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  'P0001', 'EDICION_NO_REPROGRAMABLE');
SELECT pg_temp.assert_error('4: an edición that reached the minimum is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000097', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.assert_error('4: an edición still open is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000092', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.assert_error('4: a taller without minimum is never suspended',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000091', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.assert_error('4: an edición whose first clase was held is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000095', pg_temp.h() + 40, pg_temp.h() + 10)$$,
  'P0001', 'EDICION_YA_EMPEZO');
SELECT pg_temp.assert_error('4: no new date is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', NULL, pg_temp.h() + 10)$$,
  'P0001', 'FECHA_INICIO_REQUIRED');
SELECT pg_temp.assert_error('4: a new date today is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h(), NULL)$$,
  'P0001', 'NUEVA_FECHA_NO_FUTURA');
SELECT pg_temp.assert_error('4: a new cierre today is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h())$$,
  'P0001', 'CIERRE_FUERA_DE_RANGO');
SELECT pg_temp.assert_error('4: a new cierre after the new start is refused',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h() + 41)$$,
  'P0001', 'CIERRE_FUERA_DE_RANGO');
RESET ROLE;

SELECT pg_temp.assert_rows('4: refused calls changed nothing (dates, confirmations, notices)',
  $$SELECT 1 FROM public.taller_ediciones e
     WHERE e.id = 'cf8a0000-0000-4000-8000-000000000090' AND e.fecha_inicio = pg_temp.h() + 4
       AND e.cierre_inscripcion = pg_temp.h() - 1 AND e.suspendida_en IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.taller_inscripciones i WHERE i.taller_id = e.id AND i.confirmacion_estado IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.avisos_persona a WHERE a.datos ->> 'edicion_id' = e.id::text)$$, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('4: the director (of Conexión, inherited) suspends E_bajo to H+40, cierre H+10', 'susp',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 40, pg_temp.h() + 10,
     ' No se alcanzó el mínimo de inscritos ', 'Queremos el grupo completo.')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('4: the reply carries the move, 3 to confirm, 1 informed',
  $$SELECT 1 FROM t_8a WHERE key = 'susp'
     AND (j ->> 'fecha_inicio')::date = pg_temp.h() + 40 AND (j ->> 'cierre_inscripcion')::date = pg_temp.h() + 10
     AND (j ->> 'fecha_fin')::date = pg_temp.h() + 66 AND (j ->> 'clases_movidas')::int = 3
     AND j ->> 'estado' = 'abierto' AND (j ->> 'confirmacion_limite')::date = pg_temp.h() + 10
     AND (j ->> 'por_confirmar')::int = 3 AND (j ->> 'avisos_informativos')::int = 1
     AND j ->> 'taller_nombre' = 'ZZ 8A Hombre'$$, 1);
SELECT pg_temp.capture('4: recipients with email (P2 has none), and who must confirm', 'correos',
  $$SELECT jsonb_agg(jsonb_build_array(c ->> 'email', c -> 'confirmar') ORDER BY c ->> 'email')
      FROM t_8a, jsonb_array_elements(j -> 'correos') c WHERE key = 'susp'$$,
  '[["cf8a-a6@example.test", true], ["cf8a-a7@example.test", false], ["cf8a-ab@example.test", true]]');
SELECT pg_temp.assert_rows('4: the edición moved and keeps who, when, why and the previous start',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'cf8a0000-0000-4000-8000-000000000090' AND fecha_inicio = pg_temp.h() + 40
       AND cierre_inscripcion = pg_temp.h() + 10 AND estado = 'abierto'
       AND suspendida_por = 'cf8a0000-0000-4000-8000-000000000021' AND suspendida_en IS NOT NULL
       AND suspension_motivo = 'No se alcanzó el mínimo de inscritos' AND suspension_mensaje = 'Queremos el grupo completo.'
       AND suspension_fecha_anterior = pg_temp.h() + 4
       AND reprogramada_por = 'cf8a0000-0000-4000-8000-000000000021'
       AND reprogramacion_motivo = 'No se alcanzó el mínimo de inscritos'$$, 1);
SELECT pg_temp.assert_rows('4: the three clases moved by the same 36 days',
  $$SELECT 1 FROM public.taller_sesiones WHERE grupo_id = 'cf8a0000-0000-4000-8000-000000000040'
     AND fecha_programada IN (pg_temp.h() + 40, pg_temp.h() + 47, pg_temp.h() + 54)$$, 3);
SELECT pg_temp.assert_rows('4: the three aprobadas must confirm before H+10; the pendiente is not asked',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'cf8a0000-0000-4000-8000-000000000090'
       AND ((estado = 'aprobado' AND confirmacion_estado = 'pendiente' AND confirmacion_limite = pg_temp.h() + 10 AND confirmada_por IS NULL)
         OR (estado = 'pendiente' AND confirmacion_estado IS NULL))$$, 4);
SELECT pg_temp.assert_rows('4: one taller_cambio_fecha notice per aprobada, to the member page, until the end of the limit day',
  $$SELECT 1 FROM public.avisos_persona
     WHERE tipo = 'taller_cambio_fecha' AND url = '/talleres/mi-recorrido' AND titulo = 'Tu taller cambió de fecha'
       AND persona_id IN ('cf8a0000-0000-4000-8000-000000000026', 'cf8a0000-0000-4000-8000-000000000027', 'cf8a0000-0000-4000-8000-00000000002c')
       AND datos ->> 'edicion_id' = 'cf8a0000-0000-4000-8000-000000000090'
       AND (datos ->> 'limite')::date = pg_temp.h() + 10 AND (datos ->> 'fecha_anterior')::date = pg_temp.h() + 4
       AND cuerpo LIKE 'Queremos el grupo completo. ZZ 8A Hombre ahora empieza el %. Confirma antes del % para mantener tu lugar.'
       AND expira_at > (pg_temp.h() + 10)::timestamp AND expira_at <= (pg_temp.h() + 12)::timestamp$$, 3);
SELECT pg_temp.assert_rows('4: the pendiente gets an informative notice only',
  $$SELECT 1 FROM public.avisos_persona
     WHERE tipo = 'taller_cambio_fecha_info' AND persona_id = 'cf8a0000-0000-4000-8000-000000000028'
       AND cuerpo LIKE '%Tu solicitud sigue esperando aprobación.' AND datos -> 'limite' = 'null'::jsonb$$, 1);
SELECT pg_temp.assert_rows('4: no notice for anyone outside the edición',
  $$SELECT 1 FROM public.avisos_persona WHERE datos ->> 'edicion_id' = 'cf8a0000-0000-4000-8000-000000000090'$$, 4);
SELECT pg_temp.assert_rows('4: the suspended edición is no longer below the minimum',
  $$SELECT 1 WHERE NOT public.talleres_edicion_bajo_minimo('cf8a0000-0000-4000-8000-000000000090')$$, 1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_error('4: a second suspension is refused (the new cierre is ahead)',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000090', pg_temp.h() + 50, pg_temp.h() + 20)$$,
  'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.capture('4: the panel shows the suspension and 3 without answer', 'panel_susp',
  $$SELECT jsonb_build_object('motivo', p -> 'suspension' -> 'motivo', 'por', p -> 'suspension' -> 'por',
            'sin_responder', p -> 'conteo' -> 'sin_responder', 'lista', jsonb_array_length(p -> 'sin_responder'), 'bajo', p -> 'bajo_minimo')
      FROM public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') p$$,
  '{"motivo":"No se alcanzó el mínimo de inscritos","por":"Dora ZZ8A Director","sin_responder":3,"lista":3,"bajo":false}');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.capture('4: admin.manage suspends the couple edición (cierre today) with the taller offset', 'susp_par',
  $$SELECT public.talleres_suspender_edicion('cf8a0000-0000-4000-8000-000000000093', pg_temp.h() + 14) - 'correos'$$);
RESET ROLE;
SELECT pg_temp.assert_rows('4: couple: one unit to confirm, cierre = new start (offset 0), notices to both',
  $$SELECT 1 FROM t_8a WHERE key = 'susp_par' AND (j ->> 'por_confirmar')::int = 1
     AND (j ->> 'cierre_inscripcion')::date = pg_temp.h() + 14
     AND (SELECT count(*) FROM public.avisos_persona a WHERE a.tipo = 'taller_cambio_fecha'
           AND a.datos ->> 'inscripcion_id' = 'cf8a0000-0000-4000-8000-000000000054'
           AND a.persona_id IN ('cf8a0000-0000-4000-8000-00000000002a', 'cf8a0000-0000-4000-8000-00000000002b')) = 2$$, 1);

-- ══ 5. The member answers ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.capture('5: P1 sees the pending change with the previous and new start', 'mis',
  $$SELECT jsonb_agg(jsonb_build_object('id', c -> 'inscripcion_id', 'taller', c -> 'taller_nombre', 'mensaje', c -> 'mensaje',
            'ok', (c ->> 'fecha_inicio')::date = pg_temp.h() + 40 AND (c ->> 'fecha_anterior')::date = pg_temp.h() + 4
                  AND (c ->> 'limite')::date = pg_temp.h() + 10))
      FROM jsonb_array_elements(public.talleres_mis_cambios_de_fecha()) c$$,
  '[{"id":"cf8a0000-0000-4000-8000-000000000050","taller":"ZZ 8A Hombre","mensaje":"Queremos el grupo completo.","ok":true}]');
SELECT pg_temp.assert_rows('5: P1 reads the notice in the app',
  $$SELECT 1 FROM public.mis_avisos() WHERE tipo = 'taller_cambio_fecha'$$, 1);
SELECT pg_temp.assert_error('5: an unknown answer is refused',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000050', 'tal_vez')$$, '22023', 'RESPUESTA_INVALIDA');
SELECT pg_temp.assert_error('5: P1 cannot answer for P2',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000051', 'mantener')$$,
  '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('5: a plain member cannot answer for P1',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000050', 'no_puedo')$$,
  '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.assert_rows('5: a plain member has no pending change',
  $$SELECT 1 FROM jsonb_array_elements(public.talleres_mis_cambios_de_fecha())$$, 0);
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_error('5: the coordinator cannot answer in the member''s name',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000050', 'mantener')$$,
  '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a7');
SELECT pg_temp.assert_error('5: the pendiente P3 has nothing to confirm',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000053', 'mantener')$$,
  'P0001', 'CONFIRMACION_NO_PENDIENTE');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.capture('5: P1 keeps the place', 'p1',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000050', 'mantener')$$,
  '{"inscripcion_id":"cf8a0000-0000-4000-8000-000000000050","confirmacion_estado":"confirmada","estado":"aprobado"}');
SELECT pg_temp.assert_rows('5: P1''s notice and pending change are gone',
  $$SELECT 1 FROM public.mis_avisos() WHERE tipo = 'taller_cambio_fecha'
    UNION ALL SELECT 1 FROM jsonb_array_elements(public.talleres_mis_cambios_de_fecha())$$, 0);
SELECT pg_temp.assert_error('5: P1 cannot answer twice',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000050', 'no_puedo')$$,
  'P0001', 'CONFIRMACION_NO_PENDIENTE');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000ab');
SELECT pg_temp.capture('5: P5 can no longer come', 'p5',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000052', 'no_puedo', ' Viajo ese mes ')$$,
  '{"inscripcion_id":"cf8a0000-0000-4000-8000-000000000052","confirmacion_estado":"no_puede","estado":"retirado"}');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000aa');
SELECT pg_temp.capture('5: the companero answers for the couple', 'pb',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000054', 'mantener') -> 'confirmacion_estado'$$, '"confirmada"');
RESET ROLE;
SELECT pg_temp.assert_rows('5: rows: P1 confirmada in the app; P5 retirado (version+1) with its reason',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (id = 'cf8a0000-0000-4000-8000-000000000050' AND estado = 'aprobado' AND confirmacion_estado = 'confirmada'
            AND confirmacion_canal = 'app' AND confirmada_por = 'cf8a0000-0000-4000-8000-000000000026' AND confirmada_en IS NOT NULL
            AND version = 1)
        OR (id = 'cf8a0000-0000-4000-8000-000000000052' AND estado = 'retirado' AND version = 2
            AND confirmacion_estado = 'no_puede' AND confirmacion_motivo = 'Viajo ese mes'
            AND confirmada_por = 'cf8a0000-0000-4000-8000-00000000002c')$$, 2);
SELECT pg_temp.assert_rows('5: the couple: confirmed by the companero, and the principal''s notice is gone too',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.id = 'cf8a0000-0000-4000-8000-000000000054' AND i.confirmacion_estado = 'confirmada'
       AND i.confirmada_por = 'cf8a0000-0000-4000-8000-00000000002b'
       AND NOT EXISTS (SELECT 1 FROM public.avisos_persona a WHERE a.datos ->> 'inscripcion_id' = i.id::text AND a.expira_at > now())$$, 1);

-- ══ 6. Confirmed by phone ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('6: the call list holds only P2, without phone', 'lista',
  $$SELECT jsonb_agg(jsonb_build_object('id', x -> 'inscripcion_id', 'nombre', x -> 'nombre', 'telefono', x -> 'telefono'))
      FROM jsonb_array_elements(public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') -> 'sin_responder') x$$,
  '[{"id":"cf8a0000-0000-4000-8000-000000000051","nombre":"Quique ZZ8A Dos","telefono":null}]');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_rows('6: the leader gets no call list',
  $$SELECT 1 FROM jsonb_array_elements(public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') -> 'sin_responder')$$, 0);
SELECT pg_temp.assert_error('6: a leader cannot confirm by phone',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000051')$$, '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('6: a plain member cannot confirm by phone',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000051')$$, '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('6: the coordinator of another taller cannot confirm by phone',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000051')$$, '42501', 'sin_permisos_para_esta_inscripcion');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('6: the taller coordinator marks P2 after calling', 'tel',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000051')$$,
  '{"inscripcion_id":"cf8a0000-0000-4000-8000-000000000051","confirmacion_estado":"confirmada"}');
SELECT pg_temp.assert_error('6: twice is refused',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000051')$$, 'P0001', 'CONFIRMACION_NO_PENDIENTE');
SELECT pg_temp.capture('6: counters after the answers', 'conteo_fin',
  $$SELECT (public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000090') -> 'conteo') - 'limite'$$,
  '{"confirmadas":2,"por_telefono":1,"no_puede":1,"sin_responder":0,"salieron_sin_responder":0,"aprobados":2,"pendientes":1}');
RESET ROLE;
SELECT pg_temp.assert_rows('6: P2 confirmada by phone, by the coordinator; its notice is gone',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.id = 'cf8a0000-0000-4000-8000-000000000051' AND i.estado = 'aprobado' AND i.confirmacion_estado = 'confirmada'
       AND i.confirmacion_canal = 'telefono' AND i.confirmada_por = 'cf8a0000-0000-4000-8000-000000000022'
       AND NOT EXISTS (SELECT 1 FROM public.avisos_persona a WHERE a.datos ->> 'inscripcion_id' = i.id::text AND a.expira_at > now())$$, 1);

-- ══ 7. Whoever did not answer leaves after the limit (S15) ══

SELECT pg_temp.run('7: E_venc: P1 pendiente until H-1, P2 pendiente until H, MEMBER confirmada until H-1, P5 a pendiente request asked until H-1',
  $$UPDATE public.taller_inscripciones SET confirmacion_estado = 'pendiente', confirmacion_limite = pg_temp.h() - 1
     WHERE id IN ('cf8a0000-0000-4000-8000-000000000060', 'cf8a0000-0000-4000-8000-000000000063');
    UPDATE public.taller_inscripciones SET confirmacion_estado = 'pendiente', confirmacion_limite = pg_temp.h()
     WHERE id = 'cf8a0000-0000-4000-8000-000000000061';
    UPDATE public.taller_inscripciones SET confirmacion_estado = 'confirmada', confirmacion_limite = pg_temp.h() - 1
     WHERE id = 'cf8a0000-0000-4000-8000-000000000062';
    INSERT INTO public.avisos_persona (persona_id, tipo, titulo, url, datos)
    VALUES ('cf8a0000-0000-4000-8000-000000000026', 'taller_cambio_fecha', 'Tu taller cambió de fecha', '/talleres/mi-recorrido',
            '{"inscripcion_id":"cf8a0000-0000-4000-8000-000000000060"}')$$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.assert_error('7: P1 cannot answer after the limit',
  $$SELECT public.talleres_confirmar_cambio_fecha('cf8a0000-0000-4000-8000-000000000060', 'mantener')$$, 'P0001', 'CONFIRMACION_VENCIDA');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('7: nor can the coordinator by phone',
  $$SELECT public.talleres_confirmar_por_telefono('cf8a0000-0000-4000-8000-000000000060')$$, 'P0001', 'CONFIRMACION_VENCIDA');
SELECT pg_temp.assert_error('7: authenticated cannot run the daily job',
  $$SELECT public.talleres_cerrar_confirmaciones_vencidas()$$, '42501');
RESET ROLE;
SELECT pg_temp.capture('7: the job retires one inscription', 'job1',
  $$SELECT to_jsonb(public.talleres_cerrar_confirmaciones_vencidas())$$, '1');
SELECT pg_temp.assert_rows('7: P1 left with the reason; its notice is gone',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.id = 'cf8a0000-0000-4000-8000-000000000060' AND i.estado = 'retirado' AND i.version = 2
       AND i.confirmacion_estado = 'pendiente' AND i.confirmacion_motivo = 'Sin confirmar el cambio de fecha'
       AND NOT EXISTS (SELECT 1 FROM public.avisos_persona a WHERE a.datos ->> 'inscripcion_id' = i.id::text
                        AND (a.expira_at IS NULL OR a.expira_at > now()))$$, 1);
SELECT pg_temp.assert_rows('7: the limit today, a confirmada and a pendiente request stay as they were',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (id = 'cf8a0000-0000-4000-8000-000000000061' AND estado = 'aprobado' AND confirmacion_motivo IS NULL)
        OR (id = 'cf8a0000-0000-4000-8000-000000000062' AND estado = 'aprobado' AND confirmacion_motivo IS NULL)
        OR (id = 'cf8a0000-0000-4000-8000-000000000063' AND estado = 'pendiente' AND confirmacion_motivo IS NULL)$$, 3);
SELECT pg_temp.capture('7: a second run retires nobody', 'job2',
  $$SELECT to_jsonb(public.talleres_cerrar_confirmaciones_vencidas())$$, '0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('7: the panel counts who left without answering', 'venc_panel',
  $$SELECT public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000098') -> 'conteo' -> 'salieron_sin_responder'$$, '1');
RESET ROLE;

-- ══ 8. Abrir igual (S16) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a8');
SELECT pg_temp.assert_error('8: a plain member cannot open anyway',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094')$$, '42501', 'sin_permisos_para_abrir_igual');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_error('8: a leader cannot open anyway',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094')$$, '42501', 'sin_permisos_para_abrir_igual');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('8: the coordinator of another taller cannot open anyway',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094')$$, '42501', 'sin_permisos_para_abrir_igual');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_error('8: admin.manage alone cannot open anyway',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094')$$, '42501', 'sin_permisos_para_abrir_igual');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_error('8: an edición that reached the minimum is refused',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000097')$$, 'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.capture('8: the taller coordinator opens E_abrir anyway', 'abrir',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094', ' Arrancamos con los que hay ')$$,
  '{"edicion_id":"cf8a0000-0000-4000-8000-000000000094","aprobados":0}');
SELECT pg_temp.assert_error('8: twice is refused',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000094')$$, 'P0001', 'EDICION_NO_BAJO_MINIMO');
SELECT pg_temp.capture('8: the panel records who opened it and the banner condition is gone', 'abrir_panel',
  $$SELECT jsonb_build_object('bajo', p -> 'bajo_minimo', 'por', p -> 'abierta_igual' -> 'por', 'motivo', p -> 'abierta_igual' -> 'motivo')
      FROM public.talleres_minimo_panel('cf8a0000-0000-4000-8000-000000000094') p$$,
  '{"bajo":false,"por":"Carlos ZZ8A Coord","motivo":"Arrancamos con los que hay"}');
SELECT pg_temp.as_persona('cf8a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('8: the director of Conexión opens E_emp anyway (inherited down the tree)', 'abrir_dir',
  $$SELECT public.talleres_abrir_igual('cf8a0000-0000-4000-8000-000000000095') -> 'edicion_id'$$, '"cf8a0000-0000-4000-8000-000000000095"');
RESET ROLE;
SELECT pg_temp.assert_rows('8: rows hold who and when; nothing else changed',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE (id = 'cf8a0000-0000-4000-8000-000000000094' AND abierta_igual_por = 'cf8a0000-0000-4000-8000-000000000022'
            AND abierta_igual_en IS NOT NULL AND abierta_igual_motivo = 'Arrancamos con los que hay'
            AND fecha_inicio = pg_temp.h() + 4 AND cierre_inscripcion = pg_temp.h() - 1)
        OR (id = 'cf8a0000-0000-4000-8000-000000000095' AND abierta_igual_por = 'cf8a0000-0000-4000-8000-000000000021'
            AND abierta_igual_motivo IS NULL)$$, 2);

SELECT pg_temp.report();

ROLLBACK;
