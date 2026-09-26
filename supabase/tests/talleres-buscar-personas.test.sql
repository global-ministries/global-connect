-- RED→GREEN for public.talleres_buscar_personas(p_q text, p_limit int).
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own ad000000-... namespace.
--
-- Covers:
--   1. A director holding ONLY the scoped dream_team.direct capability (no
--      talleres_crecimiento.* grant at all) finds a person independently by
--      nombre, by apellido and by email — each fixture field carries a
--      substring that appears in that field alone, so a match proves the
--      corresponding ILIKE branch and rules out a false-positive hit on a
--      neighboring field.
--   2. A usuarios member with zero dream_team_capability_grants gets 42501
--      sin_autoridad_para_buscar — the SAME message/code regardless of
--      whether the caller has no usuarios row or a usuarios row with no
--      grant (both are "no authority to search").
--   3. A 1-char query returns zero rows without needing a matching fixture
--      absence — it proves the length gate itself, not incidental luck.
--   4. p_limit is clamped to [1, 50]: a 55-row matching set returns exactly
--      50 when p_limit asks for far more, and exactly 1 when p_limit asks
--      for less than the floor (LEAST(GREATEST(p_limit,1),50)).
--   5. The row shape returned is exactly {id, nombre, apellido, email} —
--      no phone, no address, nothing else.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-inscripcion-a-grupo.test.sql). auth_id lookups
-- happen implicitly through fixture auth.users rows inserted BEFORE any
-- role switch — no real staging user is read for this test.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE tbp_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON tbp_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO tbp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs p_sql (a full SELECT statement, dynamic) and expects it to raise
-- exactly p_expected_sqlstate AND SQLERRM = p_expected_message.
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

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM tbp_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ad000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'ad-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'ad-fixture-member@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  -- Director: only dream_team.direct, scoped to an arbitrary (non-existent)
  -- equipo id — proves the gate ignores scope entirely ("any scope").
  ('ad000000-0000-4000-8000-000000000021', 'ad000000-0000-4000-8000-000000000020', 'AD', 'Director', 'ad-fixture-director@example.test', 'Soltero', 'Otro'),
  -- Member: a real usuarios row, zero capability grants.
  ('ad000000-0000-4000-8000-000000000023', 'ad000000-0000-4000-8000-000000000022', 'AD', 'Member', 'ad-fixture-member@example.test', 'Soltero', 'Otro'),
  -- Searchable target: nombre/apellido/email each carry a substring unique
  -- to that field alone, so a match proves the specific ILIKE branch.
  ('ad000000-0000-4000-8000-000000000030', NULL, 'ZzadNombreUno', 'ZzadApellidoUno', 'zzad-email-uno@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('ad000000-0000-4000-8000-000000000021', 'dream_team.direct', 'dream_team', 'equipo', 'ad000000-0000-4000-8000-000000000099');

-- 55 fixture usuarios sharing a common "zzadcap" token, to prove the
-- p_limit cap (needs strictly more than 50 matches to observe the clamp).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT
  ('ad000001-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  NULL,
  'ZzadCap' || i,
  'Cap',
  'zzad-cap-' || i || '@example.test',
  'Soltero',
  'Otro'
FROM generate_series(1, 55) AS i
ON CONFLICT (id) DO NOTHING;

-- ══ Criterion 5 (RED marker) — the function must exist at all ══
-- (No explicit assertion needed here: every case below fails outright with
-- 42883 "function does not exist" until the migration is applied, which is
-- exactly the RED this file is meant to prove first.)

-- ══ Criterion 1 — director (dream_team.direct only) finds the target by
-- nombre, apellido and email independently ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_rows('criterion 1: match by nombre',
  $$SELECT * FROM public.talleres_buscar_personas('zzadnombreuno', 20) WHERE id = 'ad000000-0000-4000-8000-000000000030'$$, 1);

SELECT pg_temp.assert_rows('criterion 1: match by apellido',
  $$SELECT * FROM public.talleres_buscar_personas('zzadapellidouno', 20) WHERE id = 'ad000000-0000-4000-8000-000000000030'$$, 1);

SELECT pg_temp.assert_rows('criterion 1: match by email',
  $$SELECT * FROM public.talleres_buscar_personas('zzad-email-uno', 20) WHERE id = 'ad000000-0000-4000-8000-000000000030'$$, 1);

RESET ROLE;

-- ══ Criterion 2 — a member with zero grants is denied, fail closed ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_sqlstate_msg('criterion 2: member with no grants is denied',
  $$SELECT public.talleres_buscar_personas('zzadnombreuno', 20)$$,
  '42501', 'sin_autoridad_para_buscar');

RESET ROLE;

-- ══ Criterion 3 — a 1-char query returns zero rows (length gate, not luck) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_rows('criterion 3: 1-char query returns zero rows',
  $$SELECT * FROM public.talleres_buscar_personas('z', 20)$$, 0);

-- ══ Criterion 4 — p_limit is clamped to [1, 50] ══

SELECT pg_temp.assert_rows('criterion 4: p_limit=999 against 55 matches is capped at 50',
  $$SELECT * FROM public.talleres_buscar_personas('zzadcap', 999)$$, 50);

SELECT pg_temp.assert_rows('criterion 4: p_limit=0 floors to 1',
  $$SELECT * FROM public.talleres_buscar_personas('zzadcap', 0)$$, 1);

-- ══ Criterion 5 — the row shape is exactly {id, nombre, apellido, email} ══
--
-- Read straight from pg_proc's OUT ('t') parameters rather than calling the
-- function and inspecting to_jsonb() of a function-scan row alias: the
-- latter is a known Postgres quirk (a bare whole-row reference to a
-- multi-OUT-parameter function-in-FROM can resolve to only its first
-- column under to_jsonb()), while pg_proc is the authoritative, direct
-- source of the function's actual declared return columns.

DO $$
DECLARE
  v_out_cols text[];
BEGIN
  SELECT array_agg(u.name ORDER BY u.name) INTO v_out_cols
  FROM pg_proc p,
       LATERAL unnest(p.proargnames, p.proargmodes) AS u(name, mode)
  WHERE p.proname = 'talleres_buscar_personas'
    AND p.pronamespace = 'public'::regnamespace
    AND u.mode = 't';

  IF v_out_cols IS DISTINCT FROM ARRAY['apellido', 'email', 'id', 'nombre'] THEN
    PERFORM pg_temp.fail('criterion 5: projection is exactly the four columns', 'got ' || coalesce(v_out_cols::text, 'NULL'));
  END IF;
END;
$$;

RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
