-- T4 — open_edicion uses the taller's equipo; it never mints one.
--
-- Run against STAGING after applying
-- 20260918170000_open_edicion_uses_taller_equipo.sql.
--
-- Covers acceptance criterion 5: opening an edición for a taller with
-- a linked equipo uses it (dream_team_equipos count unchanged, the new
-- cohorte points at the taller's equipo); opening one for a taller
-- without an equipo fails with the documented errcode.
--
-- BEGIN…ROLLBACK — nothing here is kept.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_eq(p_case text, p_actual uuid, p_expected uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_int_eq(p_case text, p_actual bigint, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE TEMP TABLE t4_fixture (key text PRIMARY KEY, id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO t4_fixture (key, id) VALUES
  ('nodo_con_hijos_gcp', 'e524ea89-d3a7-45fc-be00-5a6e7452434e'), -- real, ambient — Grupos de Corto Plazo
  ('equipo_ok',          'a4000000-0000-4000-8000-000000000001'),
  ('taller_ok',          'a4000000-0000-4000-8000-000000000002'),
  ('taller_sin_equipo',  'a4000000-0000-4000-8000-000000000003'),
  ('actor_auth',         'a4000000-0000-4000-8000-000000000004'),
  ('actor_usuario',      'a4000000-0000-4000-8000-000000000005');

CREATE OR REPLACE FUNCTION pg_temp.fid(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM t4_fixture WHERE key = p_key;
$$;

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo)
VALUES (pg_temp.fid('equipo_ok'), 'talleres_crecimiento', 'Equipo T4 Fixture OK', pg_temp.fid('nodo_con_hijos_gcp'), true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id)
VALUES (pg_temp.fid('taller_ok'), 'zz-t4-fixture-ok', 'ZZ T4 Fixture OK', pg_temp.fid('equipo_ok'));

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id)
VALUES (pg_temp.fid('taller_sin_equipo'), 'zz-t4-fixture-sin-equipo', 'ZZ T4 Fixture Sin Equipo', NULL);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.fid('actor_auth'), 'authenticated', 'authenticated', 't4-fixture-actor@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.fid('actor_usuario'), pg_temp.fid('actor_auth'), 'T4 Fixture', 'Actor', 't4-fixture-actor@example.test', 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_usuario'), 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_auth')::text, true);

-- ── AC5, success half: opening for a taller WITH a linked equipo ───
DO $ok$
DECLARE
  v_equipos_antes bigint;
  v_equipos_despues bigint;
  v_resultado jsonb;
  v_cohorte_id uuid;
BEGIN
  SELECT count(*) INTO v_equipos_antes FROM public.dream_team_equipos;

  v_resultado := public.open_edicion(
    p_taller_id => pg_temp.fid('taller_ok'),
    p_tipo => 'individual',
    p_nombre_edicion => 'ZZ T4 Fixture Edición',
    p_link_type => NULL,
    p_sesiones_estimadas => 1,
    p_duracion_estimada_minutos => 60,
    p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(),
    p_fecha_fin_periodo => NULL,
    p_firmantes => '[]'::jsonb,
    p_temporada_id => NULL
  );
  v_cohorte_id := (v_resultado ->> 'cohorte_id')::uuid;

  SELECT count(*) INTO v_equipos_despues FROM public.dream_team_equipos;

  PERFORM pg_temp.assert_int_eq('AC5: dream_team_equipos count is unchanged', v_equipos_despues, v_equipos_antes);
  PERFORM pg_temp.assert_uuid_eq(
    'AC5: the new cohorte points at the taller''s own equipo',
    (SELECT dream_team_equipo_id FROM public.talleres_crecimiento_cohortes WHERE id = v_cohorte_id),
    pg_temp.fid('equipo_ok')
  );
END;
$ok$;

-- ── AC5, failure half: opening for a taller with NO equipo ─────────
DO $sin_equipo$
BEGIN
  PERFORM public.open_edicion(
    p_taller_id => pg_temp.fid('taller_sin_equipo'),
    p_tipo => 'individual',
    p_nombre_edicion => 'ZZ T4 Fixture Edición Sin Equipo',
    p_link_type => NULL,
    p_sesiones_estimadas => 1,
    p_duracion_estimada_minutos => 60,
    p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(),
    p_fecha_fin_periodo => NULL,
    p_firmantes => '[]'::jsonb,
    p_temporada_id => NULL
  );

  RAISE EXCEPTION 'assert failed: opening an edición for a taller with no equipo should have raised TALLER_MISSING_EQUIPO';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> 'P0002' THEN
      RAISE EXCEPTION 'assert failed: expected SQLSTATE P0002, got % (message %)', SQLSTATE, SQLERRM;
    END IF;
    IF SQLERRM NOT LIKE 'TALLER_MISSING_EQUIPO%' THEN
      RAISE EXCEPTION 'assert failed: expected message to start with TALLER_MISSING_EQUIPO, got %', SQLERRM;
    END IF;
END;
$sin_equipo$;

-- No orphan cohorte or equipo was created for the failed attempt.
SELECT pg_temp.assert_int_eq(
  'AC5: the failed attempt created no cohorte for the equipo-less taller',
  (SELECT count(*) FROM public.talleres_crecimiento_cohortes c
   JOIN public.taller_ediciones te ON te.id = c.taller_id
   WHERE te.taller_id = pg_temp.fid('taller_sin_equipo')),
  0
);

ROLLBACK;
