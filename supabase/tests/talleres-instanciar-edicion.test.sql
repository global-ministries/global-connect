-- T2 (odd/tasks/talleres-configuracion-del-taller.md) — RED->GREEN for the
-- plantilla instantiation cycle: open_edicion creates grupos/facilitadores/
-- reportes/clases from the taller's plantilla (T1), generate_taller_
-- sesiones reads that same plantilla (with the pre-T2 fallback preserved
-- for a taller with none), and talleres_editar_grupo/talleres_editar_clase
-- edit the instantiated rows in place without touching the plantilla.
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own af000000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, the same real anchor T1's own
-- test already uses.
--
-- Identities:
--   director            (af…21) — director.write scoped to BOTH fixture
--                                 talleres' own nodes. Opens both
--                                 ediciones, edits the plantilla-driven
--                                 clase, closes a clase.
--   coordinador          (af…31) — coordinator.write scoped to the
--                                 plantilla taller's node. Edits a grupo
--                                 (gestionar_grupos capability-only path).
--   líder activo 1        (af…23) — dream_team_servicios estado='activo'
--                                 on the taller's own node. Sole
--                                 facilitador of plantilla Grupo A.
--   líder activo 2        (af…25) — same, active for the whole test.
--                                 Facilitador of plantilla Grupo B
--                                 alongside the persona below.
--   en pausa              (af…27) — active AT PLANTILLA-INSERT TIME (so
--                                 T1's trigger allows adding them), then
--                                 flipped to estado='en_pausa' BEFORE
--                                 open_edicion runs — the exact "lapsed
--                                 after being added to the plantilla"
--                                 case this task targets.
--   miembro sin capacidad (af…33) — an active servidor of the plantilla
--                                 taller's node with ZERO capability
--                                 grants: used for talleres_editar_grupo's
--                                 refusal case.
--
-- Two talleres:
--   af…10 — HAS a plantilla: 4 named clases (cadencia_dias=14, to prove
--           it — not the default 7), 2 plantilla grupos (Grupo A: 1
--           facilitador; Grupo B: 2, one of whom lapses).
--   af…15 — has NO plantilla at all, cadencia_dias=21 (deliberately not
--           7) — proves the fallback path is byte-for-byte: it must
--           still hardcode a 7-day cadence, not read cadencia_dias.
--
-- Covers this task's cycle (odd/tasks/talleres-configuracion-del-taller.md
-- T2 bullet + acceptance criteria 2, 3, 5, 8; 1/6 are T1's, 4/7/9 are
-- T3/T4/T7's) plus this file's own (a)-(j):
--   (a) open_edicion (director, taller WITH plantilla) creates exactly 2
--       taller_grupos in the new cohorte, nombre/capacidad from the
--       plantilla, estado 'activo'.
--   (b) exactly 1 taller_grupo_asignaciones under Grupo A (líder activo
--       1) and exactly 1 under Grupo B (líder activo 2) — the lapsed
--       persona is NOT assigned anywhere.
--   (c) facilitadores_omitidos in the RPC's own return has exactly 1
--       entry: the lapsed persona, their name, and 'Grupo B'.
--   (d) exactly 1 taller_reportes in 'borrador' per created grupo (2
--       total), and clases_por_grupo = 4 in the return.
--   (e) 4 taller_sesiones per grupo with the plantilla's temas and
--       fecha_programada spaced by cadencia_dias=14 from the cohorte's
--       own started_at anchor (2026-01-05: fixed via modalidad_
--       inscripcion='periodo_general' so the assertion needs no
--       CURRENT_DATE dependency).
--   (f) talleres_editar_clase (director) changes Grupo A clase 2's tema;
--       the plantilla row (numero=2) is untouched (criterion 5, part 1).
--   (g) editing the plantilla's clase 2 afterwards does NOT change the
--       already-instantiated (and already-edited) clase (criterion 5,
--       part 2).
--   (h) after talleres_cerrar_clase on Grupo A's clase 1,
--       talleres_editar_clase on it fails P0001 CLASE_CERRADA.
--   (i) talleres_editar_grupo (coordinador, capability-only) renames
--       Grupo B and changes its capacidad; the same call by the
--       no-capability miembro fails 42501 sin_permisos_para_este_taller
--       and leaves the row untouched.
--   (j) taller WITHOUT plantilla: open_edicion (p_sesiones_estimadas=>3)
--       returns grupos_creados=[], facilitadores_omitidos=[],
--       clases_por_grupo=0 (criterion 8) — then a manually-created grupo
--       (the "Crear grupo" exception) still gets 3 clases via
--       generate_taller_sesiones's fallback, tema NULL throughout, spaced
--       by THIS taller's own cadencia_dias=21 (A5 hardening, T7,
--       20260927130000_talleres_configuracion_hardening.sql — the
--       fallback used to hardcode 7 regardless of cadencia_dias; this case
--       used to assert exactly that hardcoded 7-day spacing, now inverted).
--   (a4) A4 hardening (T7) — the con_plantilla open_edicion call above is
--       deliberately given a WRONG p_sesiones_estimadas (9, taller af…10
--       has 4 active plantilla clases): sesiones_snapshot must be the live
--       active count (4), never the caller-supplied number.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as T1's
-- talleres-plantillas-del-taller.test.sql). auth_id lookups for fixtures
-- are resolved BEFORE the first role switch.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tie_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_tie_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tie_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_tie_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('af000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ TIE Equipo Con Plantilla', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('af000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ TIE Equipo Sin Plantilla', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, cadencia_dias) VALUES
  ('af000000-0000-4000-8000-000000000010', 'zz-tie-con-plantilla', 'ZZ TIE Fixture Con Plantilla', 'af000000-0000-4000-8000-000000000001', 14),
  ('af000000-0000-4000-8000-000000000015', 'zz-tie-sin-plantilla', 'ZZ TIE Fixture Sin Plantilla', 'af000000-0000-4000-8000-000000000002', 21);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('af000000-0000-4000-8000-000000000011', 'af000000-0000-4000-8000-000000000001', 'Líder',      true),
  ('af000000-0000-4000-8000-000000000012', 'af000000-0000-4000-8000-000000000001', 'Voluntario', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('af000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'tie-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('af000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'tie-fixture-lider1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('af000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'tie-fixture-lider2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('af000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'tie-fixture-pausa@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('af000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'tie-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('af000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'tie-fixture-sincapacidad@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('af000000-0000-4000-8000-000000000021', 'af000000-0000-4000-8000-000000000020', 'ZZ TIE', 'Director',      'tie-fixture-director@example.test', 'Soltero', 'Otro'),
  ('af000000-0000-4000-8000-000000000023', 'af000000-0000-4000-8000-000000000022', 'ZZ TIE', 'LiderActivo1',  'tie-fixture-lider1@example.test', 'Soltero', 'Otro'),
  ('af000000-0000-4000-8000-000000000025', 'af000000-0000-4000-8000-000000000024', 'ZZ TIE', 'LiderActivo2',  'tie-fixture-lider2@example.test', 'Soltero', 'Otro'),
  ('af000000-0000-4000-8000-000000000027', 'af000000-0000-4000-8000-000000000026', 'ZZ TIE', 'EnPausa',       'tie-fixture-pausa@example.test', 'Soltero', 'Otro'),
  ('af000000-0000-4000-8000-000000000031', 'af000000-0000-4000-8000-000000000030', 'ZZ TIE', 'Coordinador',   'tie-fixture-coordinador@example.test', 'Soltero', 'Otro'),
  ('af000000-0000-4000-8000-000000000033', 'af000000-0000-4000-8000-000000000032', 'ZZ TIE', 'SinCapacidad',  'tie-fixture-sincapacidad@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- All active at fixture time; the "en pausa" persona is flipped to
-- en_pausa AFTER being added to the plantilla, further down.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('af000000-0000-4000-8000-000000000050', 'af000000-0000-4000-8000-000000000023', 'af000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000011', 'activo'),
  ('af000000-0000-4000-8000-000000000051', 'af000000-0000-4000-8000-000000000025', 'af000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000011', 'activo'),
  ('af000000-0000-4000-8000-000000000052', 'af000000-0000-4000-8000-000000000027', 'af000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000012', 'activo'),
  ('af000000-0000-4000-8000-000000000053', 'af000000-0000-4000-8000-000000000033', 'af000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000012', 'activo');

-- director gets director.write on BOTH fixture talleres; coordinador
-- gets coordinator.write ONLY on the plantilla taller; the "sin
-- capacidad" persona gets ZERO capability grants (only a servicio row).
-- director also gets admin.manage on both nodes and coordinador also gets
-- coordinator.read: matches the FULL capability set a real 'director'/
-- 'coordinador' role member is auto-granted (talleres_role_capability_map,
-- verified read-only before writing this) — director: admin.manage +
-- director.read + director.write + metrics.read; coordinador:
-- coordinator.read + coordinator.write. Needed so these identities can
-- read back what they themselves create/edit under RLS (every SELECT
-- policy touched by this test carries an admin.manage branch, verified
-- via pg_policy before writing this) — a capability gap this test's
-- fixture must not have, not something this task changes.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('af000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write',    'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000001'),
  ('af000000-0000-4000-8000-000000000021', 'talleres_crecimiento.admin.manage',      'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000001'),
  ('af000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write',    'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000002'),
  ('af000000-0000-4000-8000-000000000021', 'talleres_crecimiento.admin.manage',      'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000002'),
  ('af000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000001'),
  ('af000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.read',  'talleres_crecimiento', 'taller', 'af000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t_tie_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_tie_fixture TO authenticated;

CREATE TEMP TABLE t_tie_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_tie_resultado TO authenticated;

-- ══ director builds the plantilla: 4 named clases, 2 grupos ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_no_error('(setup) clase 1',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('af000000-0000-4000-8000-000000000010', 1, 'Sigueme')$$);
SELECT pg_temp.assert_no_error('(setup) clase 2',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('af000000-0000-4000-8000-000000000010', 2, 'Intimidad con Dios')$$);
SELECT pg_temp.assert_no_error('(setup) clase 3',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('af000000-0000-4000-8000-000000000010', 3, 'Companerismo')$$);
SELECT pg_temp.assert_no_error('(setup) clase 4',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('af000000-0000-4000-8000-000000000010', 4, 'Influencia')$$);

DO $grupos$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
  INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
  VALUES ('af000000-0000-4000-8000-000000000010', 'Grupo A', 1, 12)
  RETURNING id INTO v_a;
  INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
  VALUES ('af000000-0000-4000-8000-000000000010', 'Grupo B', 2, 10)
  RETURNING id INTO v_b;
  INSERT INTO t_tie_fixture (key, id) VALUES
    ('plantilla_grupo_a', v_a),
    ('plantilla_grupo_b', v_b);
END;
$grupos$;

SELECT pg_temp.assert_no_error('(setup) Grupo A facilitador: lider activo 1',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_tie_fixture WHERE key = 'plantilla_grupo_a'),
      'af000000-0000-4000-8000-000000000023', 'lider')$$);
SELECT pg_temp.assert_no_error('(setup) Grupo B facilitador: lider activo 2',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_tie_fixture WHERE key = 'plantilla_grupo_b'),
      'af000000-0000-4000-8000-000000000025', 'lider')$$);
-- Still active right now: T1's trigger allows this insert.
SELECT pg_temp.assert_no_error('(setup) Grupo B facilitador: la persona que luego se pausa (aun activa)',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_tie_fixture WHERE key = 'plantilla_grupo_b'),
      'af000000-0000-4000-8000-000000000027', 'voluntario')$$);

-- ══ the lapse: this persona goes en_pausa AFTER being added to the plantilla ══

RESET ROLE;
UPDATE public.dream_team_servicios
   SET estado = 'en_pausa'
 WHERE id = 'af000000-0000-4000-8000-000000000052';

-- ══ (a)-(e) director opens the edición: plantilla -> real grupos/facilitadores/reportes/clases ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000020');

DO $abrir$
DECLARE
  v_resultado jsonb;
BEGIN
  -- A4 hardening (T7, 20260927130000_talleres_configuracion_hardening.sql):
  -- p_sesiones_estimadas => 9 is DELIBERATELY wrong for this taller (it has
  -- 4 active plantilla clases) — open_edicion must ignore it outright and
  -- snapshot the LIVE active count instead. See '(a4)' below.
  v_resultado := public.open_edicion(
    p_taller_id => 'af000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ TIE Con Plantilla Edicion', p_link_type => NULL,
    p_sesiones_estimadas => 9, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'periodo_general',
    p_fecha_inicio_periodo => '2026-01-05 00:00:00+00'::timestamptz,
    p_fecha_fin_periodo => '2026-06-01 00:00:00+00'::timestamptz,
    p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_tie_resultado (key, valor) VALUES ('con_plantilla', v_resultado);
  INSERT INTO t_tie_fixture (key, id) VALUES
    ('cohorte_con_plantilla', (v_resultado ->> 'cohorte_id')::uuid),
    ('edicion_con_plantilla', (v_resultado ->> 'edicion_id')::uuid),
    ('grupo_a', (v_resultado -> 'grupos_creados' -> 0 ->> 'grupo_id')::uuid),
    ('grupo_b', (v_resultado -> 'grupos_creados' -> 1 ->> 'grupo_id')::uuid);
END;
$abrir$;

-- (a4) A4 hardening — sesiones_snapshot is the LIVE active plantilla count
-- (4), NOT the caller-supplied p_sesiones_estimadas (9). Both grupos still
-- get exactly 4 clases each (proven again below in (e)), so the snapshot
-- and the actually-instantiated count can never disagree.
SELECT pg_temp.assert_rows('(a4) sesiones_snapshot is the live active plantilla count (4), not p_sesiones_estimadas (9)',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'edicion_con_plantilla')
       AND sesiones_snapshot = 4$$, 1);

-- (a) exactly 2 grupos, right nombre/capacidad/estado, in the new cohorte
SELECT pg_temp.assert_rows('(a) exactly 2 taller_grupos created',
  $$SELECT id FROM public.taller_grupos
     WHERE cohorte_id = (SELECT id FROM t_tie_fixture WHERE key = 'cohorte_con_plantilla')$$, 2);
SELECT pg_temp.assert_rows('(a) Grupo A: nombre/capacidad/estado from the plantilla',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND nombre = 'Grupo A' AND capacidad = 12 AND estado = 'activo'$$, 1);
SELECT pg_temp.assert_rows('(a) Grupo B: nombre/capacidad/estado from the plantilla',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND nombre = 'Grupo B' AND capacidad = 10 AND estado = 'activo'$$, 1);

-- (b) exactly 1 asignacion per grupo, the lapsed persona nowhere
SELECT pg_temp.assert_rows('(b) Grupo A has exactly 1 asignacion: lider activo 1',
  $$SELECT 1 FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND persona_id = 'af000000-0000-4000-8000-000000000023' AND rol = 'lider'$$, 1);
SELECT pg_temp.assert_rows('(b) Grupo A has no other asignacion',
  $$SELECT id FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')$$, 1);
SELECT pg_temp.assert_rows('(b) Grupo B has exactly 1 asignacion: lider activo 2',
  $$SELECT 1 FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND persona_id = 'af000000-0000-4000-8000-000000000025' AND rol = 'lider'$$, 1);
SELECT pg_temp.assert_rows('(b) Grupo B does NOT have the lapsed persona',
  $$SELECT id FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND persona_id = 'af000000-0000-4000-8000-000000000027'$$, 0);
SELECT pg_temp.assert_rows('(b) Grupo B has no other asignacion',
  $$SELECT id FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')$$, 1);

-- (c) facilitadores_omitidos: exactly 1 entry, the lapsed persona, with their name and grupo
SELECT pg_temp.assert_rows('(c) facilitadores_omitidos has exactly 1 entry',
  $$SELECT 1 FROM t_tie_resultado
     WHERE key = 'con_plantilla'
       AND jsonb_array_length(valor -> 'facilitadores_omitidos') = 1$$, 1);
SELECT pg_temp.assert_rows('(c) the omitted entry is the lapsed persona, named, in Grupo B',
  $$SELECT 1 FROM t_tie_resultado, jsonb_array_elements(valor -> 'facilitadores_omitidos') AS omitido
     WHERE key = 'con_plantilla'
       AND (omitido ->> 'persona_id') = 'af000000-0000-4000-8000-000000000027'
       AND (omitido ->> 'nombre') = 'ZZ TIE'
       AND (omitido ->> 'apellido') = 'EnPausa'
       AND (omitido ->> 'plantilla_grupo') = 'Grupo B'$$, 1);

-- (d) exactly 1 borrador taller_reportes per grupo; clases_por_grupo = 4
SELECT pg_temp.assert_rows('(d) Grupo A has a borrador reporte',
  $$SELECT 1 FROM public.taller_reportes
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a') AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(d) Grupo B has a borrador reporte',
  $$SELECT 1 FROM public.taller_reportes
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b') AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(d) clases_por_grupo is 4',
  $$SELECT 1 FROM t_tie_resultado WHERE key = 'con_plantilla' AND (valor ->> 'clases_por_grupo')::int = 4$$, 1);

-- (e) 4 clases per grupo, right temas, fecha_programada spaced by cadencia_dias=14
SELECT pg_temp.assert_rows('(e) Grupo A has exactly 4 clases',
  $$SELECT id FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')$$, 4);
SELECT pg_temp.assert_rows('(e) Grupo A clase 1: Sigueme, 2026-01-05',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND numero = 1 AND tema = 'Sigueme' AND fecha_programada = DATE '2026-01-05'$$, 1);
SELECT pg_temp.assert_rows('(e) Grupo A clase 2: Intimidad con Dios, 2026-01-19 (+14)',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND numero = 2 AND tema = 'Intimidad con Dios' AND fecha_programada = DATE '2026-01-19'$$, 1);
SELECT pg_temp.assert_rows('(e) Grupo A clase 3: Companerismo, 2026-02-02 (+28)',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND numero = 3 AND tema = 'Companerismo' AND fecha_programada = DATE '2026-02-02'$$, 1);
SELECT pg_temp.assert_rows('(e) Grupo A clase 4: Influencia, 2026-02-16 (+42)',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a')
       AND numero = 4 AND tema = 'Influencia' AND fecha_programada = DATE '2026-02-16'$$, 1);
SELECT pg_temp.assert_rows('(e) Grupo B has exactly 4 clases too (same cohorte anchor)',
  $$SELECT id FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')$$, 4);
SELECT pg_temp.assert_rows('(e) Grupo B clase 2: Intimidad con Dios, 2026-01-19',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND numero = 2 AND tema = 'Intimidad con Dios' AND fecha_programada = DATE '2026-01-19'$$, 1);

DO $capturar_clases$
DECLARE
  v_c1 uuid;
  v_c2 uuid;
BEGIN
  SELECT id INTO v_c1 FROM public.taller_sesiones
   WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a') AND numero = 1;
  SELECT id INTO v_c2 FROM public.taller_sesiones
   WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_a') AND numero = 2;
  INSERT INTO t_tie_fixture (key, id) VALUES ('clase_a1', v_c1), ('clase_a2', v_c2);
END;
$capturar_clases$;

-- ══ (f)-(g) editar en su lugar: la clase cambia, la plantilla no; y viceversa ══

SELECT pg_temp.assert_no_error('(f) director edits Grupo A clase 2 tema',
  $$SELECT public.talleres_editar_clase(
      (SELECT id FROM t_tie_fixture WHERE key = 'clase_a2'),
      'Intimidad Renovada', NULL)$$);
SELECT pg_temp.assert_rows('(f) the clase now has the new tema',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'clase_a2') AND tema = 'Intimidad Renovada'$$, 1);
SELECT pg_temp.assert_rows('(f) fecha_programada untouched (NULL arg = leave unchanged)',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'clase_a2') AND fecha_programada = DATE '2026-01-19'$$, 1);
SELECT pg_temp.assert_rows('(f) the plantilla row (numero=2) is untouched',
  $$SELECT 1 FROM public.taller_plantilla_clases
     WHERE taller_id = 'af000000-0000-4000-8000-000000000010' AND numero = 2 AND tema = 'Intimidad con Dios'$$, 1);

SELECT pg_temp.assert_no_error('(g) director edits the plantilla clase 2 afterwards',
  $$UPDATE public.taller_plantilla_clases SET tema = 'Tema Editado En La Plantilla'
     WHERE taller_id = 'af000000-0000-4000-8000-000000000010' AND numero = 2$$);
SELECT pg_temp.assert_rows('(g) the already-open edicion clase keeps ITS OWN edited tema',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'clase_a2') AND tema = 'Intimidad Renovada'$$, 1);

-- ══ (h) a closed clase refuses talleres_editar_clase ══

SELECT pg_temp.assert_no_error('(h) director closes Grupo A clase 1',
  $$SELECT public.talleres_cerrar_clase((SELECT id FROM t_tie_fixture WHERE key = 'clase_a1'))$$);
SELECT pg_temp.assert_sqlstate_msg('(h) editing a cerrada clase fails CLASE_CERRADA',
  $$SELECT public.talleres_editar_clase((SELECT id FROM t_tie_fixture WHERE key = 'clase_a1'), 'Otro tema', NULL)$$,
  'P0001', 'CLASE_CERRADA');

-- ══ (i) talleres_editar_grupo: coordinador (capability-only) succeeds; no-capacidad member fails ══

SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_no_error('(i) coordinador edits Grupo B',
  $$SELECT public.talleres_editar_grupo((SELECT id FROM t_tie_fixture WHERE key = 'grupo_b'), 'Grupo B Renombrado', 8)$$);
SELECT pg_temp.assert_rows('(i) Grupo B reflects the edit',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND nombre = 'Grupo B Renombrado' AND capacidad = 8$$, 1);

SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000032');
SELECT pg_temp.assert_sqlstate_msg('(i) the no-capability member is refused',
  $$SELECT public.talleres_editar_grupo((SELECT id FROM t_tie_fixture WHERE key = 'grupo_b'), 'Hackeado', 1)$$,
  '42501', 'sin_permisos_para_este_taller');

-- Checked as postgres: SinCapacidad has zero read capability of their own
-- (by fixture design, to prove the refusal), so this is a DB-state check,
-- not a re-test of SinCapacidad's own SELECT visibility.
RESET ROLE;
SELECT pg_temp.assert_rows('(i) Grupo B is unchanged by the refused attempt',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_b')
       AND nombre = 'Grupo B Renombrado' AND capacidad = 8$$, 1);

-- ══ (i2) FIX (post-parent-review): generate_taller_sesiones numbers the
-- instantiated clase by its POSITION among the ACTIVE plantilla rows,
-- never by the plantilla's own `numero` verbatim. Deactivate plantilla
-- clase 2 (numero=2), leaving active numero 1,3,4 — a fresh grupo must
-- still get exactly 3 contiguous clases numbered 1,2,3, with temas from
-- plantilla numero 1,3,4 and dates spaced by cadencia_dias FROM THE
-- POSITION (clase "2" = anchor+14, not anchor+28 which plantilla numero
-- 3 would give verbatim). Still running: RESET ROLE (postgres) ══

UPDATE public.taller_plantilla_clases
   SET activo = false
 WHERE taller_id = 'af000000-0000-4000-8000-000000000010' AND numero = 2;

DO $grupo_reordenado$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad)
  VALUES (gen_random_uuid(), (SELECT id FROM t_tie_fixture WHERE key = 'cohorte_con_plantilla'), 'ZZ TIE Grupo Reordenado', 'activo', 10)
  RETURNING id INTO v_id;
  INSERT INTO t_tie_fixture (key, id) VALUES ('grupo_reordenado', v_id);
END;
$grupo_reordenado$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000020');

DO $generar_reordenado$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.generate_taller_sesiones((SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado'));
  INSERT INTO t_tie_resultado (key, valor) VALUES ('generar_reordenado', v_resultado);
END;
$generar_reordenado$;

SELECT pg_temp.assert_rows('(i2) exactly 3 of 3 created (4 active minus the 1 just deactivated)',
  $$SELECT 1 FROM t_tie_resultado
     WHERE key = 'generar_reordenado'
       AND (valor ->> 'total')::int = 3 AND (valor ->> 'created')::int = 3$$, 1);
SELECT pg_temp.assert_rows('(i2) exactly 3 taller_sesiones rows',
  $$SELECT id FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado')$$, 3);
SELECT pg_temp.assert_rows('(i2) numero 1 = Sigueme (plantilla numero 1), position 1, anchor date',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado')
       AND numero = 1 AND tema = 'Sigueme' AND fecha_programada = DATE '2026-01-05'$$, 1);
SELECT pg_temp.assert_rows('(i2) numero 2 = Companerismo (plantilla numero 3), position 2, anchor+14',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado')
       AND numero = 2 AND tema = 'Companerismo' AND fecha_programada = DATE '2026-01-19'$$, 1);
SELECT pg_temp.assert_rows('(i2) numero 3 = Influencia (plantilla numero 4), position 3, anchor+28',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado')
       AND numero = 3 AND tema = 'Influencia' AND fecha_programada = DATE '2026-02-02'$$, 1);
SELECT pg_temp.assert_rows('(i2) no gap: nothing was inserted at position/numero 4',
  $$SELECT id FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_reordenado')
       AND numero = 4$$, 0);

RESET ROLE;

-- ══ (j) a taller WITHOUT plantilla: open_edicion creates no grupos; the
-- fallback (sesiones_snapshot, hardcoded weekly) still works for a
-- manually-created grupo (the "Crear grupo" exception) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000020');

DO $sin_plantilla$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'af000000-0000-4000-8000-000000000015',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ TIE Sin Plantilla Edicion', p_link_type => NULL,
    p_sesiones_estimadas => 3, p_duracion_estimada_minutos => 45, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_tie_resultado (key, valor) VALUES ('sin_plantilla', v_resultado);
  INSERT INTO t_tie_fixture (key, id) VALUES ('cohorte_sin_plantilla', (v_resultado ->> 'cohorte_id')::uuid);
END;
$sin_plantilla$;

SELECT pg_temp.assert_rows('(j) grupos_creados is empty for a taller without plantilla',
  $$SELECT 1 FROM t_tie_resultado WHERE key = 'sin_plantilla' AND valor -> 'grupos_creados' = '[]'::jsonb$$, 1);
SELECT pg_temp.assert_rows('(j) facilitadores_omitidos is empty too',
  $$SELECT 1 FROM t_tie_resultado WHERE key = 'sin_plantilla' AND valor -> 'facilitadores_omitidos' = '[]'::jsonb$$, 1);
SELECT pg_temp.assert_rows('(j) clases_por_grupo is 0 (no grupo instantiated)',
  $$SELECT 1 FROM t_tie_resultado WHERE key = 'sin_plantilla' AND (valor ->> 'clases_por_grupo')::int = 0$$, 1);
SELECT pg_temp.assert_rows('(j) no taller_grupos exist in this cohorte',
  $$SELECT id FROM public.taller_grupos
     WHERE cohorte_id = (SELECT id FROM t_tie_fixture WHERE key = 'cohorte_sin_plantilla')$$, 0);

-- Manual grupo creation is the "Crear grupo" exception (out of open_edicion's
-- reach) — inserted as postgres, same convention T1's own test uses for a
-- fixture grupo, since taller_grupos' own RLS/authoring path is not this
-- task's concern.
RESET ROLE;
DO $grupo_manual$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad)
  VALUES (gen_random_uuid(), (SELECT id FROM t_tie_fixture WHERE key = 'cohorte_sin_plantilla'), 'ZZ TIE Grupo Manual', 'activo', 10)
  RETURNING id INTO v_id;
  INSERT INTO t_tie_fixture (key, id) VALUES ('grupo_manual_sin_plantilla', v_id);
END;
$grupo_manual$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('af000000-0000-4000-8000-000000000020');

DO $generar$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.generate_taller_sesiones((SELECT id FROM t_tie_fixture WHERE key = 'grupo_manual_sin_plantilla'));
  INSERT INTO t_tie_resultado (key, valor) VALUES ('generar_sin_plantilla', v_resultado);
END;
$generar$;

SELECT pg_temp.assert_rows('(j) fallback created 3 of 3 (sesiones_snapshot, not the plantilla)',
  $$SELECT 1 FROM t_tie_resultado
     WHERE key = 'generar_sin_plantilla'
       AND (valor ->> 'total')::int = 3 AND (valor ->> 'created')::int = 3$$, 1);
SELECT pg_temp.assert_rows('(j) 3 clases created, all with NULL tema',
  $$SELECT id FROM public.taller_sesiones
     WHERE grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_manual_sin_plantilla')
       AND tema IS NULL$$, 3);
-- A5 hardening (T7, 20260927130000_talleres_configuracion_hardening.sql):
-- the fallback branch now reads THIS taller's own cadencia_dias (21, set by
-- this file's own fixture) instead of a hardcoded 7 — was asserted as
-- "hardcoded 7, NOT cadencia_dias=21" before this fix; now the opposite.
SELECT pg_temp.assert_rows('(j) spaced 21 days apart (this taller''s own cadencia_dias, no longer hardcoded 7)',
  $$SELECT 1 FROM public.taller_sesiones s1
     JOIN public.taller_sesiones s2
       ON s2.grupo_id = s1.grupo_id AND s2.numero = s1.numero + 1
     WHERE s1.grupo_id = (SELECT id FROM t_tie_fixture WHERE key = 'grupo_manual_sin_plantilla')
       AND s2.fecha_programada - s1.fecha_programada = 21$$, 2);

-- ══ structural asserts — no anon in proacl of the 2 new functions ══

SELECT pg_temp.assert_rows('structural: talleres_editar_grupo has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_editar_grupo'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_editar_clase has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_editar_clase'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
