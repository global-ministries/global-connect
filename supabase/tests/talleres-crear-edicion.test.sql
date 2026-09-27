-- T2 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN
-- for the "Crear edición" cycle: talleres_instanciar_edicion (internal),
-- open_edicion as a wrapper over it, and the new one-question
-- talleres_crear_edicion (by temporada / by cadencia with ediciones
-- adelantadas). Run against STAGING inside BEGIN…ROLLBACK — nothing here
-- is kept; every fixture id lives under this file's own b5000000-...
-- namespace. 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto
-- Plazo) is referenced read-only as a parent equipo, the same real anchor
-- every other talleres fixture test in this feature already uses.
--
-- Fixtures:
--   equipo_a/taller_a (b5…01/b5…10) — regimen=temporada, tipo=pareja,
--     vinculo=novios, cierre_inscripcion_offset_dias=-3, 4 plantilla
--     clases, 1 plantilla grupo with 1 active líder facilitador.
--   equipo_b/taller_b (b5…02/b5…11) — regimen=cadencia,
--     intervalo_ediciones_dias=28, 4 plantilla clases, no plantilla
--     grupos (so its ediciones create zero grupos — not this file's
--     concern; only names/dates are).
--   equipo_c/taller_c (b5…03/b5…12) — regimen=cadencia,
--     intervalo_ediciones_dias=NULL — bonus fixture (beyond the task's own
--     (a)-(i) list) used only to prove SIN_INTERVALO.
--   temporada (b5…40) — nombre '2027 - I', fecha_apertura 2027-02-01,
--     fecha_cierre 2027-06-01. T3 hasn't added dream_team_equipo_id/RLS to
--     talleres_temporadas yet, so this is inserted as postgres.
--   director (b5…31) — director.write + director.read scoped to ALL
--     THREE fixture talleres' own nodes.
--   líder activo (b5…33) — dream_team_servicios estado='activo' on
--     taller_a's node, the plantilla grupo's sole facilitador.
--   miembro sin capacidad (b5…35) — no capability grant at all.
--
-- Cases (task's own lettering, plus bonus (j)/(k)/(l) for guards this
-- migration adds that the task's own list doesn't separately enumerate):
--   (a) director talleres_crear_edicion(A, NULL, temporada) → one edición
--       named '2027 - I', tipo pareja, link_type novios, fecha_inicio
--       2027-02-01, fecha_fin 2027-02-22 (4 clases, cadencia_dias=7
--       default), cierre 2027-01-29, borrador, 1 grupo, 4 clases, junction
--       row.
--   (b) same call again → EDICION_YA_EXISTE.
--   (c) talleres_crear_edicion(A, '2027-03-01', NULL) → TEMPORADA_REQUERIDA.
--   (d) director talleres_crear_edicion(B, '2026-10-04', NULL, 2) → 3
--       ediciones on 2026-10-04/2026-11-01/2026-11-29, named 'Octubre
--       2026', 'Noviembre 2026', 'Noviembre 2026 (29)' (the third collides
--       with the second's derived name and gets the day appended,
--       rewritten on taller_ediciones/operating_core_events/
--       talleres_crecimiento_cohortes alike).
--   (e) talleres_crear_edicion(B, NULL, NULL) → FECHA_REQUERIDA.
--   (f) p_adelantar = 7 → ADELANTAR_MAXIMO_6.
--   (g) member → 42501 sin_permisos_para_este_taller.
--   (h) open_edicion legacy call with p_tipo='individual' on taller A →
--       the edición still gets tipo='pareja' from the taller (params
--       ignored) and dates set from p_fecha_inicio_periodo.
--   (i) direct talleres_instanciar_edicion call as authenticated → 42501
--       (no EXECUTE grant at all).
--   (j) bonus: taller C, p_adelantar=1, no intervalo_ediciones_dias →
--       SIN_INTERVALO.
--   (k) bonus: taller B (cadencia) with a temporada_id anyway →
--       TEMPORADA_NO_PERMITIDA.
--   (l) bonus: taller B, p_adelantar=-1 → ADELANTAR_INVALIDO.
-- Mutant (post-GREEN, restored after): comment out the EDICION_YA_EXISTE
-- EXISTS check in talleres_crear_edicion → (b) goes RED (no exception
-- raised); restore and confirm GREEN again.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ce_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ce_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ce_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ce_failures;
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
  ('b5000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CE Equipo A', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('b5000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CE Equipo B', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('b5000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ CE Equipo C', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (
  id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen,
  cierre_inscripcion_offset_dias, intervalo_ediciones_dias
) VALUES
  ('b5000000-0000-4000-8000-000000000010', 'zz-ce-fixture-a', 'ZZ CE Fixture Taller A',
   'b5000000-0000-4000-8000-000000000001', 'pareja', 'novios', 'temporada', -3, NULL),
  ('b5000000-0000-4000-8000-000000000011', 'zz-ce-fixture-b', 'ZZ CE Fixture Taller B',
   'b5000000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 0, 28),
  ('b5000000-0000-4000-8000-000000000012', 'zz-ce-fixture-c', 'ZZ CE Fixture Taller C',
   'b5000000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 0, NULL);

INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
  ('b5000000-0000-4000-8000-000000000010', 1, 'ZZ CE A Clase 1'),
  ('b5000000-0000-4000-8000-000000000010', 2, 'ZZ CE A Clase 2'),
  ('b5000000-0000-4000-8000-000000000010', 3, 'ZZ CE A Clase 3'),
  ('b5000000-0000-4000-8000-000000000010', 4, 'ZZ CE A Clase 4'),
  ('b5000000-0000-4000-8000-000000000011', 1, 'ZZ CE B Clase 1'),
  ('b5000000-0000-4000-8000-000000000011', 2, 'ZZ CE B Clase 2'),
  ('b5000000-0000-4000-8000-000000000011', 3, 'ZZ CE B Clase 3'),
  ('b5000000-0000-4000-8000-000000000011', 4, 'ZZ CE B Clase 4');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b5000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'ce-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b5000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'ce-fixture-lider@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b5000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'ce-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b5000000-0000-4000-8000-000000000031', 'b5000000-0000-4000-8000-000000000030', 'ZZ CE', 'Director', 'ce-fixture-director@example.test', 'Soltero', 'Otro'),
  ('b5000000-0000-4000-8000-000000000033', 'b5000000-0000-4000-8000-000000000032', 'ZZ CE', 'LiderActivo', 'ce-fixture-lider@example.test', 'Soltero', 'Otro'),
  ('b5000000-0000-4000-8000-000000000035', 'b5000000-0000-4000-8000-000000000034', 'ZZ CE', 'Miembro', 'ce-fixture-miembro@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- director: director.write + director.read on all three fixture talleres.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000002'),
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000002'),
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000003'),
  ('b5000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b5000000-0000-4000-8000-000000000003');

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('b5000000-0000-4000-8000-000000000050', 'b5000000-0000-4000-8000-000000000001', 'Líder', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('b5000000-0000-4000-8000-000000000051', 'b5000000-0000-4000-8000-000000000033', 'b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000050', 'activo');

INSERT INTO public.talleres_temporadas (id, nombre, slug, fecha_apertura, fecha_cierre, estado) VALUES
  ('b5000000-0000-4000-8000-000000000040', '2027 - I', 'zz-ce-2027-i', '2027-02-01 00:00:00+00', '2027-06-01 00:00:00+00', 'borrador');

CREATE TEMP TABLE t_ce_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ce_fixture TO authenticated;

CREATE TEMP TABLE t_ce_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ce_resultado TO authenticated;

DO $grupo_a$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
  VALUES ('b5000000-0000-4000-8000-000000000010', 'ZZ CE Grupo Unico', 1, 15)
  RETURNING id INTO v_id;
  INSERT INTO t_ce_fixture (key, id) VALUES ('plantilla_grupo_a', v_id);

  INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol)
  VALUES (v_id, 'b5000000-0000-4000-8000-000000000033', 'lider');
END;
$grupo_a$;

-- ══ (a) director: talleres_crear_edicion(A, NULL, temporada) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b5000000-0000-4000-8000-000000000030');

DO $a$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'b5000000-0000-4000-8000-000000000010', NULL, 'b5000000-0000-4000-8000-000000000040'
  );
  INSERT INTO t_ce_resultado (key, valor) VALUES ('a', v_resultado);
  INSERT INTO t_ce_fixture (key, id) VALUES
    ('edicion_a1', (v_resultado -> 'ediciones' -> 0 ->> 'edicion_id')::uuid);
END;
$a$;

SELECT pg_temp.assert_rows('(a) exactly 1 edicion in the result',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'a' AND jsonb_array_length(valor -> 'ediciones') = 1$$, 1);
SELECT pg_temp.assert_rows('(a) named after the temporada',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'a' AND (valor -> 'ediciones' -> 0 ->> 'nombre') = '2027 - I'$$, 1);
SELECT pg_temp.assert_rows('(a) fecha_inicio is the temporada fecha_apertura',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'a' AND (valor -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2027-02-01'$$, 1);
SELECT pg_temp.assert_rows('(a) fecha_fin is inicio + (4-1)*7',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'a' AND (valor -> 'ediciones' -> 0 ->> 'fecha_fin')::date = DATE '2027-02-22'$$, 1);
SELECT pg_temp.assert_rows('(a) cierre_inscripcion is inicio - 3',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'a' AND (valor -> 'ediciones' -> 0 ->> 'cierre_inscripcion')::date = DATE '2027-01-29'$$, 1);
SELECT pg_temp.assert_rows('(a) exactly 1 grupo, 4 clases per the returned shape',
  $$SELECT 1 FROM t_ce_resultado
     WHERE key = 'a'
       AND jsonb_array_length(valor -> 'ediciones' -> 0 -> 'grupos_creados') = 1
       AND (valor -> 'ediciones' -> 0 ->> 'clases_por_grupo')::int = 4$$, 1);
SELECT pg_temp.assert_rows('(a) the underlying taller_ediciones row: tipo/link_type/estado from the taller',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_a1')
       AND tipo = 'pareja' AND link_type = 'novios' AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(a) the temporada junction row exists',
  $$SELECT 1 FROM public.talleres_temporada_talleres
     WHERE temporada_id = 'b5000000-0000-4000-8000-000000000040'
       AND taller_id = 'b5000000-0000-4000-8000-000000000010'$$, 1);

-- ══ (b) same call again → EDICION_YA_EXISTE ══

SELECT pg_temp.assert_sqlstate_msg('(b) a second edicion of A in the same temporada is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000010', NULL, 'b5000000-0000-4000-8000-000000000040')$$,
  'P0001', 'EDICION_YA_EXISTE');

-- ══ (c) temporada taller with no temporada_id → TEMPORADA_REQUERIDA ══

SELECT pg_temp.assert_sqlstate_msg('(c) taller A with no temporada_id is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000010', DATE '2027-03-01', NULL)$$,
  'P0001', 'TEMPORADA_REQUERIDA');

-- ══ (d) director: talleres_crear_edicion(B, '2026-10-04', NULL, 2) ══

DO $d$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'b5000000-0000-4000-8000-000000000011', DATE '2026-10-04', NULL, 2
  );
  INSERT INTO t_ce_resultado (key, valor) VALUES ('d', v_resultado);
  INSERT INTO t_ce_fixture (key, id) VALUES
    ('edicion_b1', (v_resultado -> 'ediciones' -> 0 ->> 'edicion_id')::uuid),
    ('edicion_b2', (v_resultado -> 'ediciones' -> 1 ->> 'edicion_id')::uuid),
    ('edicion_b3', (v_resultado -> 'ediciones' -> 2 ->> 'edicion_id')::uuid);
END;
$d$;

SELECT pg_temp.assert_rows('(d) exactly 3 ediciones',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'd' AND jsonb_array_length(valor -> 'ediciones') = 3$$, 1);
SELECT pg_temp.assert_rows('(d) edicion 1: Octubre 2026, 2026-10-04',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'd'
       AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Octubre 2026'
       AND (valor -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2026-10-04'$$, 1);
SELECT pg_temp.assert_rows('(d) edicion 2: Noviembre 2026, 2026-11-01',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'd'
       AND (valor -> 'ediciones' -> 1 ->> 'nombre') = 'Noviembre 2026'
       AND (valor -> 'ediciones' -> 1 ->> 'fecha_inicio')::date = DATE '2026-11-01'$$, 1);
SELECT pg_temp.assert_rows('(d) edicion 3: Noviembre 2026 (29), 2026-11-29 — disambiguated collision',
  $$SELECT 1 FROM t_ce_resultado WHERE key = 'd'
       AND (valor -> 'ediciones' -> 2 ->> 'nombre') = 'Noviembre 2026 (29)'
       AND (valor -> 'ediciones' -> 2 ->> 'fecha_inicio')::date = DATE '2026-11-29'$$, 1);
SELECT pg_temp.assert_rows('(d) taller_ediciones.nombre_snapshot was rewritten for edicion 3',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_b3')
       AND nombre_snapshot = 'Noviembre 2026 (29)'$$, 1);
SELECT pg_temp.assert_rows('(d) the cohorte edicion label was rewritten for edicion 3',
  $$SELECT 1 FROM public.talleres_crecimiento_cohortes
     WHERE taller_id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_b3')
       AND edicion = 'Noviembre 2026 (29)'$$, 1);

-- operating_core_events has no direct SELECT grant for authenticated at
-- all (a plain table-level permission error, not an RLS 0-rows filter) —
-- checked as postgres, same "DB-state check" convention talleres-
-- configuracion-cross-taller.test.sql already uses.
RESET ROLE;
SELECT pg_temp.assert_rows('(d) operating_core_events.title/metadata were rewritten for edicion 3',
  $$SELECT 1 FROM public.taller_ediciones te
      JOIN public.operating_core_events ev ON ev.id = te.operating_core_event_id
     WHERE te.id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_b3')
       AND ev.title = 'Noviembre 2026 (29)'
       AND ev.metadata ->> 'taller_edicion' = 'Noviembre 2026 (29)'$$, 1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b5000000-0000-4000-8000-000000000030');

-- ══ (e) cadencia taller with no fecha_inicio → FECHA_REQUERIDA ══

SELECT pg_temp.assert_sqlstate_msg('(e) taller B with no fecha_inicio is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000011', NULL, NULL)$$,
  'P0001', 'FECHA_REQUERIDA');

-- ══ (f) p_adelantar = 7 → ADELANTAR_MAXIMO_6 ══

SELECT pg_temp.assert_sqlstate_msg('(f) p_adelantar = 7 exceeds the max of 6',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000011', DATE '2026-10-04', NULL, 7)$$,
  'P0001', 'ADELANTAR_MAXIMO_6');

-- ══ (j) bonus: taller C has no intervalo_ediciones_dias → SIN_INTERVALO ══

SELECT pg_temp.assert_sqlstate_msg('(j) p_adelantar > 0 with no intervalo_ediciones_dias is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000012', DATE '2026-01-05', NULL, 1)$$,
  'P0001', 'SIN_INTERVALO');

-- ══ (k) bonus: a temporada_id for a cadencia taller → TEMPORADA_NO_PERMITIDA ══

SELECT pg_temp.assert_sqlstate_msg('(k) temporada_id on a cadencia taller is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000011', DATE '2026-10-04', 'b5000000-0000-4000-8000-000000000040')$$,
  'P0001', 'TEMPORADA_NO_PERMITIDA');

-- ══ (l) bonus: a negative p_adelantar → ADELANTAR_INVALIDO ══

SELECT pg_temp.assert_sqlstate_msg('(l) a negative p_adelantar is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000011', DATE '2026-10-04', NULL, -1)$$,
  'P0001', 'ADELANTAR_INVALIDO');

-- ══ (h) open_edicion legacy call: p_tipo/p_link_type/p_modalidad ignored ══

DO $h$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'b5000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ CE Legacy Edicion', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'periodo_general',
    p_fecha_inicio_periodo => '2027-04-01 00:00:00+00'::timestamptz,
    p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_ce_resultado (key, valor) VALUES ('h', v_resultado);
  INSERT INTO t_ce_fixture (key, id) VALUES ('edicion_h', (v_resultado ->> 'edicion_id')::uuid);
END;
$h$;

SELECT pg_temp.assert_rows('(h) the edicion keeps the taller''s own tipo/link_type, not the ignored params',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_h')
       AND tipo = 'pareja' AND link_type = 'novios'$$, 1);
SELECT pg_temp.assert_rows('(h) dates are set from p_fecha_inicio_periodo',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_ce_fixture WHERE key = 'edicion_h')
       AND fecha_inicio = DATE '2027-04-01'
       AND fecha_fin = DATE '2027-04-22'
       AND cierre_inscripcion = DATE '2027-03-29'$$, 1);

-- ══ (g) member (no capability): refused before any regimen logic runs ══

SELECT pg_temp.as_persona('b5000000-0000-4000-8000-000000000034');
SELECT pg_temp.assert_sqlstate_msg('(g) a member with no capability grant is refused',
  $$SELECT public.talleres_crear_edicion('b5000000-0000-4000-8000-000000000010', NULL, 'b5000000-0000-4000-8000-000000000040')$$,
  '42501', 'sin_permisos_para_este_taller');

-- ══ (i) talleres_instanciar_edicion has no EXECUTE for authenticated ══

SELECT pg_temp.as_persona('b5000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate('(i) a direct call to talleres_instanciar_edicion is refused (permission denied)',
  $$SELECT public.talleres_instanciar_edicion('b5000000-0000-4000-8000-000000000011', DATE '2026-01-05', NULL, NULL)$$,
  '42501');

RESET ROLE;

-- ══ structural — proacl posture of the 3 functions ══

SELECT pg_temp.assert_rows('structural: talleres_instanciar_edicion has NO authenticated/anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_instanciar_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')
       AND NOT (p.proacl::text LIKE '%authenticated=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_crear_edicion has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_crear_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: open_edicion has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'open_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
