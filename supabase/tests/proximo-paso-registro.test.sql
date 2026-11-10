-- T2 (odd/tasks/proximo-paso.md, S3) — RED->GREEN for the public read of
-- the QR page /proximo-paso: proximo_paso_ediciones_abiertas() lets anon
-- see ONLY the open Próximo Paso ediciones, with ONLY public fields, and a
-- brand new account enrolls through the real talleres_inscribirme. Run
-- against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own c7b00000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, like every other talleres
-- fixture test. Próximo Paso itself is looked up by slug.
--
-- Fixtures:
--   director (c7b…31) — director.write + read on Próximo Paso's node and
--     on the fixture node of taller X.
--   taller X (c7b…10) — another cadencia taller (not Próximo Paso) with
--     one open edición: it must never be listed.
--   Próximo Paso: one plantilla grupo (capacidad 12, only in this
--     transaction) and 5 ediciones created by talleres_crear_edicion from
--     2031-06-01 (first Sundays Jun…Oct 2031), then: Jun abierto,
--     Jul cancelado, Aug left borrador, Sep abierto with its inscripción
--     already closed (cierre_inscripcion yesterday), Oct abierto.
--   nuevo (c7b…40/41) — a fresh account with the ficha vincularFichaConfirmada
--     creates (no roles, no grants).
--
-- Cases:
--   (a) anon calls the RPC: Jun and Oct are listed; Jul (cancelado), Aug
--       (borrador) and Sep (cierre pasado) are not; the open edición of
--       taller X is not; every listed row belongs to Próximo Paso.
--   (b) the result shape is exactly edicion_id, nombre, fecha_inicio,
--       fecha_fin, cupo_restante, clases (pg_get_function_result).
--   (c) Jun as anon: nombre 'Junio 2031', 2031-06-01 → 2031-06-22,
--       cupo_restante 12, clases Sígueme@2031-06-01 … Influencia@2031-06-22.
--   (d) anon cannot read taller_inscripciones nor usuarios (permission
--       denied or zero rows), nor execute talleres_inscribirme.
--   (e) the new account enrolls in Jun through talleres_inscribirme:
--       ok, estado aprobado (Próximo Paso has inscripcion_automatica on); then cupo_restante reads 11 for anon; a
--       second call answers YA_INSCRITO; Jul (cancelado) answers
--       EDICION_NOT_FOUND.
--   structural: SECURITY DEFINER, search_path pinned, EXECUTE for anon and
--     authenticated, none for PUBLIC.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pr_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pr_failures TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Zero rows or 42501: either way nothing is readable.
CREATE OR REPLACE FUNCTION pg_temp.assert_unreadable(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n > 0 THEN
    PERFORM pg_temp.fail(p_case, 'expected nothing readable, got ' || v_n || ' row(s)');
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected 0 rows or 42501, got ' || SQLSTATE || ' ' || SQLERRM);
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

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_pr_failures;
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

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true);
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

CREATE TEMP TABLE t_pr_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pr_fixture TO authenticated, anon;

CREATE TEMP TABLE t_pr_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pr_resultado TO authenticated, anon;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('c7b00000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ PR Equipo X', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (
  id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen,
  cierre_inscripcion_offset_dias, intervalo_ediciones_dias
) VALUES
  ('c7b00000-0000-4000-8000-000000000010', 'zz-pr-fixture-x', 'ZZ PR Fixture Taller X',
   'c7b00000-0000-4000-8000-000000000001', 'individual', NULL, 'cadencia', 0, 28);

INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad) VALUES
  ('c7b00000-0000-4000-8000-000000000010', 'ZZ PR Grupo X', 1, 10);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c7b00000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'pr-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c7b00000-0000-4000-8000-000000000040', 'authenticated', 'authenticated', 'pr-fixture-nuevo@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"nombre":"ZZ PR","apellido":"Nuevo","telefono":"04125550000"}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- The nuevo's ficha has the shape vincularFichaConfirmada inserts.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, fecha_nacimiento, estado_civil, genero) VALUES
  ('c7b00000-0000-4000-8000-000000000031', 'c7b00000-0000-4000-8000-000000000030', 'ZZ PR', 'Director', 'pr-fixture-director@example.test', '1980-01-01', 'Soltero', 'Otro'),
  ('c7b00000-0000-4000-8000-000000000041', 'c7b00000-0000-4000-8000-000000000040', 'ZZ PR', 'Nuevo', 'pr-fixture-nuevo@example.test', '1900-01-01', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO t_pr_fixture (key, id)
SELECT 'pp_taller', id FROM public.talleres WHERE slug = 'proximo-paso';
INSERT INTO t_pr_fixture (key, id)
SELECT 'pp_equipo', dream_team_equipo_id FROM public.talleres WHERE slug = 'proximo-paso';

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT 'c7b00000-0000-4000-8000-000000000031', k.capability_key, 'talleres_crecimiento', 'taller', e.equipo_id
FROM (
  SELECT 'c7b00000-0000-4000-8000-000000000001'::uuid AS equipo_id
  UNION ALL
  SELECT id FROM t_pr_fixture WHERE key = 'pp_equipo'
) e
CROSS JOIN (VALUES ('talleres_crecimiento.director.write'), ('talleres_crecimiento.director.read')) AS k(capability_key);

INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
SELECT id, 'ZZ PR Grupo Registro', 999, 12 FROM t_pr_fixture WHERE key = 'pp_taller';

-- Ediciones, created the real way by the director.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7b00000-0000-4000-8000-000000000030');

DO $crear$
DECLARE
  v_pp jsonb;
  v_x jsonb;
BEGIN
  v_pp := public.talleres_crear_edicion(
    (SELECT id FROM t_pr_fixture WHERE key = 'pp_taller'), DATE '2031-06-01', NULL, 4
  );
  INSERT INTO t_pr_fixture (key, id) VALUES
    ('pp_jun', (v_pp -> 'ediciones' -> 0 ->> 'edicion_id')::uuid),
    ('pp_jul', (v_pp -> 'ediciones' -> 1 ->> 'edicion_id')::uuid),
    ('pp_ago', (v_pp -> 'ediciones' -> 2 ->> 'edicion_id')::uuid),
    ('pp_sep', (v_pp -> 'ediciones' -> 3 ->> 'edicion_id')::uuid),
    ('pp_oct', (v_pp -> 'ediciones' -> 4 ->> 'edicion_id')::uuid);

  v_x := public.talleres_crear_edicion('c7b00000-0000-4000-8000-000000000010', DATE '2031-06-01', NULL, 0);
  INSERT INTO t_pr_fixture (key, id) VALUES ('x_jun', (v_x -> 'ediciones' -> 0 ->> 'edicion_id')::uuid);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: talleres_crear_edicion', SQLSTATE || ' ' || SQLERRM);
END;
$crear$;

RESET ROLE;

-- Estados set as postgres: a fixture, not the behavior under test.
UPDATE public.taller_ediciones SET estado = 'abierto'
 WHERE id IN (SELECT id FROM t_pr_fixture WHERE key IN ('pp_jun', 'pp_sep', 'pp_oct', 'x_jun'));
UPDATE public.taller_ediciones SET estado = 'cancelado'
 WHERE id = (SELECT id FROM t_pr_fixture WHERE key = 'pp_jul');
UPDATE public.taller_ediciones SET cierre_inscripcion = public.talleres_hoy() - 1
 WHERE id = (SELECT id FROM t_pr_fixture WHERE key = 'pp_sep');

SELECT pg_temp.assert_rows('fixture: 5 Próximo Paso ediciones and 1 of taller X',
  $$SELECT 1 FROM t_pr_fixture WHERE key LIKE 'pp\_%' ESCAPE '\' AND key NOT IN ('pp_taller', 'pp_equipo')
    UNION ALL SELECT 1 FROM t_pr_fixture WHERE key = 'x_jun'$$, 6);

-- ══ (b) shape (as postgres) ══

SELECT pg_temp.assert_rows('(b) only public fields are returned',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND pg_get_function_result(p.oid) = 'TABLE(edicion_id uuid, nombre text, fecha_inicio date, fecha_fin date, cupo_restante integer, clases jsonb)'$$, 1);

-- ══ (a), (c), (d) as anon ══

SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();

SELECT pg_temp.assert_rows('(a) anon sees the open Jun and Oct ediciones',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id IN (SELECT id FROM t_pr_fixture WHERE key IN ('pp_jun', 'pp_oct'))$$, 2);
SELECT pg_temp.assert_rows('(a) cancelado, borrador and cierre pasado are not listed',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id IN (SELECT id FROM t_pr_fixture WHERE key IN ('pp_jul', 'pp_ago', 'pp_sep'))$$, 0);
SELECT pg_temp.assert_rows('(a) the open edición of another taller is not listed',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pr_fixture WHERE key = 'x_jun')$$, 0);

SELECT pg_temp.assert_rows('(c) Jun: nombre, fechas, cupo 12 and the 4 named clases on Sundays',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pr_fixture WHERE key = 'pp_jun')
       AND e.nombre = 'Junio 2031'
       AND e.fecha_inicio = DATE '2031-06-01'
       AND e.fecha_fin = DATE '2031-06-22'
       AND e.cupo_restante = 12
       AND jsonb_array_length(e.clases) = 4
       AND (SELECT string_agg((c ->> 'tema') || '@' || (c ->> 'fecha'), ' | ' ORDER BY (c ->> 'numero')::int)
              FROM jsonb_array_elements(e.clases) c)
           = 'Sígueme@2031-06-01 | Intimidad con Dios@2031-06-08 | Compañerismo@2031-06-15 | Influencia@2031-06-22'$$, 1);

INSERT INTO t_pr_resultado (key, valor)
SELECT 'anon_ids', coalesce(jsonb_agg(e.edicion_id), '[]'::jsonb) FROM public.proximo_paso_ediciones_abiertas() e;

SELECT pg_temp.assert_unreadable('(d) anon cannot read taller_inscripciones',
  $$SELECT 1 FROM public.taller_inscripciones$$);
SELECT pg_temp.assert_unreadable('(d) anon cannot read usuarios',
  $$SELECT 1 FROM public.usuarios$$);
SELECT pg_temp.assert_sqlstate('(d) anon cannot execute talleres_inscribirme',
  $$SELECT public.talleres_inscribirme((SELECT id FROM t_pr_fixture WHERE key = 'pp_jun'), NULL)$$,
  '42501');

RESET ROLE;

SELECT pg_temp.assert_rows('(a) every listed row belongs to Próximo Paso',
  $$SELECT 1 FROM jsonb_array_elements_text((SELECT valor FROM t_pr_resultado WHERE key = 'anon_ids')) x(id)
      JOIN public.taller_ediciones te ON te.id = x.id::uuid
      JOIN public.talleres t ON t.id = te.taller_id
     WHERE t.slug <> 'proximo-paso'$$, 0);

-- ══ (e) the new account enrolls through the real RPC ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7b00000-0000-4000-8000-000000000040');

DO $e$
BEGIN
  INSERT INTO t_pr_resultado (key, valor) VALUES
    ('e1', public.talleres_inscribirme((SELECT id FROM t_pr_fixture WHERE key = 'pp_jun'), NULL));
  INSERT INTO t_pr_resultado (key, valor) VALUES
    ('e2', public.talleres_inscribirme((SELECT id FROM t_pr_fixture WHERE key = 'pp_jun'), NULL));
  INSERT INTO t_pr_resultado (key, valor) VALUES
    ('e3', public.talleres_inscribirme((SELECT id FROM t_pr_fixture WHERE key = 'pp_jul'), NULL));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(e) talleres_inscribirme as the new account', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$e$;

SELECT pg_temp.assert_rows('(e) the first enrollment is ok and aprobado',
  $$SELECT 1 FROM t_pr_resultado WHERE key = 'e1' AND (valor ->> 'ok')::boolean AND valor ->> 'estado' = 'aprobado'$$, 1);
SELECT pg_temp.assert_rows('(e) a second enrollment answers YA_INSCRITO',
  $$SELECT 1 FROM t_pr_resultado WHERE key = 'e2' AND valor ->> 'codigo' = 'YA_INSCRITO'$$, 1);
SELECT pg_temp.assert_rows('(e) a cancelled edición answers EDICION_NOT_FOUND',
  $$SELECT 1 FROM t_pr_resultado WHERE key = 'e3' AND valor ->> 'codigo' = 'EDICION_NOT_FOUND'$$, 1);

RESET ROLE;

SELECT pg_temp.assert_rows('(e) the inscripción belongs to the new ficha',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.taller_id = (SELECT id FROM t_pr_fixture WHERE key = 'pp_jun')
       AND i.persona_principal_id = 'c7b00000-0000-4000-8000-000000000041'
       AND i.estado = 'aprobado'$$, 1);

SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();
SELECT pg_temp.assert_rows('(e) anon now reads cupo_restante 11 for Jun',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pr_fixture WHERE key = 'pp_jun') AND e.cupo_restante = 11$$, 1);
RESET ROLE;

-- ══ structural ══

SELECT pg_temp.assert_rows('structural: SECURITY DEFINER with search_path pinned',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public']$$, 1);
SELECT pg_temp.assert_rows('structural: EXECUTE for anon and authenticated, none for PUBLIC',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)$$, 1);

SELECT pg_temp.report();

ROLLBACK;
