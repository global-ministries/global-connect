-- T3 correction (odd/tasks/talleres-configuracion-del-taller.md) —
-- RED→GREEN for talleres_mover_plantilla_clase(p_clase_id, p_direccion),
-- the atomic RPC that replaced the app-layer three-step client swap.
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept;
-- every fixture id lives under this file's own b0000000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, same anchor T1's fixture uses.
--
-- Identities:
--   director         (b0…21) — director.write scoped to the fixture
--                              taller's own node. The only identity
--                              authorized to move a clase.
--   sin capacidad    (b0…29) — no dream_team_servicios row, no
--                              capability grant, at all.
--
-- Cases:
--   (a) director moves clase 3 (numero=3) 'arriba' → swaps with clase 2
--       (numero=2): resulting numeros by original insertion id are
--       1,3,2,4 — {moved:true, numero:2} returned.
--   (b) director moves clase 1 (numero=1) 'arriba' → no lower neighbor
--       → {moved:false, numero:1}, no row is touched.
--   (c) the no-capability member attempts to move clase 2 → 42501
--       sin_permisos_para_este_taller, no row is touched.
--   (d) structural: talleres_mover_plantilla_clase has no anon in proacl.
--   (e) no leftover out-of-range numero (>= 1000000, the temp-swap
--       marker) survives on any of this fixture's clases.
--   (f) A3 hardening (T7) — the function body takes a per-taller
--       pg_advisory_xact_lock before reading a neighbour (structural).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mpc_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_mpc_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mpc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_mpc_failures;
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

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ MPC Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b0000000-0000-4000-8000-000000000010', 'zz-mpc-fixture', 'ZZ MPC Fixture Taller', 'b0000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b0000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'mpc-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b0000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'mpc-fixture-sincap@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000020', 'MPC', 'Director',   'mpc-fixture-director@example.test', 'Soltero', 'Otro'),
  ('b0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-000000000028', 'MPC', 'SinCapacidad', 'mpc-fixture-sincap@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- director gets director.write ONLY. The other identity gets ZERO
-- capability grants.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b0000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b0000000-0000-4000-8000-000000000001');

INSERT INTO public.taller_plantilla_clases (id, taller_id, numero, tema) VALUES
  ('b0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000010', 1, 'Clase Uno'),
  ('b0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000010', 2, 'Clase Dos'),
  ('b0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000010', 3, 'Clase Tres'),
  ('b0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000010', 4, 'Clase Cuatro');

-- ══ (c) the no-capability member cannot move a clase ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b0000000-0000-4000-8000-000000000028');

SELECT pg_temp.assert_sqlstate_msg('(c) no-capability member is refused',
  $$SELECT public.talleres_mover_plantilla_clase('b0000000-0000-4000-8000-000000000032', 'arriba')$$,
  '42501', 'sin_permisos_para_este_taller');
SELECT pg_temp.assert_rows('(c) clase 2 numero is untouched',
  $$SELECT 1 FROM public.taller_plantilla_clases
     WHERE id = 'b0000000-0000-4000-8000-000000000032' AND numero = 2$$, 1);

-- ══ (a) director moves clase 3 up: swaps with clase 2 ══

SELECT pg_temp.as_persona('b0000000-0000-4000-8000-000000000020');

DO $mv$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_mover_plantilla_clase('b0000000-0000-4000-8000-000000000033', 'arriba');
  IF (v_resultado ->> 'moved')::boolean IS DISTINCT FROM true THEN
    PERFORM pg_temp.fail('(a) moved is true', 'got ' || v_resultado::text);
  END IF;
  IF (v_resultado ->> 'numero')::int IS DISTINCT FROM 2 THEN
    PERFORM pg_temp.fail('(a) returned numero is 2', 'got ' || v_resultado::text);
  END IF;
END;
$mv$;

SELECT pg_temp.assert_rows('(a) clase 1 (id …31) numero is 1',
  $$SELECT 1 FROM public.taller_plantilla_clases WHERE id = 'b0000000-0000-4000-8000-000000000031' AND numero = 1$$, 1);
SELECT pg_temp.assert_rows('(a) clase 2 (id …32) numero is now 3',
  $$SELECT 1 FROM public.taller_plantilla_clases WHERE id = 'b0000000-0000-4000-8000-000000000032' AND numero = 3$$, 1);
SELECT pg_temp.assert_rows('(a) clase 3 (id …33) numero is now 2',
  $$SELECT 1 FROM public.taller_plantilla_clases WHERE id = 'b0000000-0000-4000-8000-000000000033' AND numero = 2$$, 1);
SELECT pg_temp.assert_rows('(a) clase 4 (id …34) numero is 4',
  $$SELECT 1 FROM public.taller_plantilla_clases WHERE id = 'b0000000-0000-4000-8000-000000000034' AND numero = 4$$, 1);

-- ══ (b) director moves clase 1 (now numero=1, still the lowest) up:
-- no-op ══

DO $noop$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_mover_plantilla_clase('b0000000-0000-4000-8000-000000000031', 'arriba');
  IF (v_resultado ->> 'moved')::boolean IS DISTINCT FROM false THEN
    PERFORM pg_temp.fail('(b) moved is false', 'got ' || v_resultado::text);
  END IF;
  IF (v_resultado ->> 'numero')::int IS DISTINCT FROM 1 THEN
    PERFORM pg_temp.fail('(b) returned numero is unchanged at 1', 'got ' || v_resultado::text);
  END IF;
END;
$noop$;

SELECT pg_temp.assert_rows('(b) no-op left every numero exactly as (a) set it',
  $$SELECT id FROM public.taller_plantilla_clases
     WHERE taller_id = 'b0000000-0000-4000-8000-000000000010'
       AND ((id = 'b0000000-0000-4000-8000-000000000031' AND numero = 1)
         OR (id = 'b0000000-0000-4000-8000-000000000032' AND numero = 3)
         OR (id = 'b0000000-0000-4000-8000-000000000033' AND numero = 2)
         OR (id = 'b0000000-0000-4000-8000-000000000034' AND numero = 4))$$, 4);

-- ══ (e) no leftover temp-swap numero (>= 1000000) survives ══

SELECT pg_temp.assert_rows('(e) 0 leftovers with an out-of-range numero',
  $$SELECT 1 FROM public.taller_plantilla_clases
     WHERE taller_id = 'b0000000-0000-4000-8000-000000000010' AND numero >= 1000000$$, 0);

-- ══ (d) structural — no anon in proacl ══

RESET ROLE;

SELECT pg_temp.assert_rows('(d) talleres_mover_plantilla_clase has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_mover_plantilla_clase'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);

-- ══ (f) A3 hardening (T7, 20260927130000_talleres_configuracion_hardening.sql)
-- — a transaction-scoped advisory lock, keyed per taller, serializes
-- concurrent reorders of the SAME taller's plantilla. Structural: the
-- function body itself calls pg_advisory_xact_lock. ══

SELECT pg_temp.assert_rows('(f) talleres_mover_plantilla_clase takes a per-taller advisory xact lock',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_mover_plantilla_clase'
       AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%'$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
