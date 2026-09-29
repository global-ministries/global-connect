-- T4 (odd/tasks/usuarios-cedula-normalizada.md) — the cedula and telefono
-- triggers normalize on UPDATE only when the value actually changes, so saving
-- another field of a profile whose stored cedula is not canonical (one half of
-- an existing duplicate pair) does not collide with the UNIQUE constraint.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- usuarios live under this file's own c3000000-... namespace.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_sc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_sc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_ok(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_sc_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- Fixtures (as postgres). The replica role skips the triggers so a
-- non-canonical value can be stored, exactly as the existing duplicate pairs
-- are. '99888777', '55444333' and '0414000...' fixtures do not exist on staging.
SET LOCAL session_replication_role = replica;
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, cedula, telefono) VALUES
  ('c3000000-0000-4000-8000-000000000001', 'ZZ Sc', 'NoCanon', 'Otro', 'Soltero', '99.888.777', '0414 555 0001'),
  ('c3000000-0000-4000-8000-000000000002', 'ZZ Sc', 'Canon',   'Otro', 'Soltero', '99888777',   '04145550002'),
  ('c3000000-0000-4000-8000-000000000003', 'ZZ Sc', 'Lone',    'Otro', 'Soltero', '55.444.333', NULL);
SET LOCAL session_replication_role = origin;

-- ── cedula ──────────────────────────────────────────────────────────
-- 1. Writing cedula with the same value (what updateUser does) succeeds and
--    leaves the stored spelling alone.
SELECT pg_temp.assert_ok('cedula 1: SET telefono, cedula = cedula on a non-canonical row succeeds',
  $$UPDATE public.usuarios SET telefono = '04145550009', cedula = cedula
    WHERE id = 'c3000000-0000-4000-8000-000000000001'$$);
SELECT pg_temp.assert_rows('cedula 1: the stored cedula is untouched',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000001' AND cedula = '99.888.777'$$, 1);

-- 2. Another column succeeds.
SELECT pg_temp.assert_ok('cedula 2: SET nombre on a non-canonical row succeeds',
  $$UPDATE public.usuarios SET nombre = 'ZZ Sc2' WHERE id = 'c3000000-0000-4000-8000-000000000001'$$);

-- 3. Really changing it to the canonical value of another profile still fails.
SELECT pg_temp.assert_sqlstate('cedula 3: changing to a value another profile holds fails',
  $$UPDATE public.usuarios SET cedula = '99888777' WHERE id = 'c3000000-0000-4000-8000-000000000001'$$, '23505');

-- 4. A changed value is normalized.
UPDATE public.usuarios SET cedula = 'V-55444333' WHERE id = 'c3000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_rows('cedula 4: a changed value is normalized',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000003' AND cedula = '55444333'$$, 1);

-- 5. INSERT still normalizes.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, cedula, telefono)
VALUES ('c3000000-0000-4000-8000-000000000004', 'ZZ Sc', 'Insert', 'Otro', 'Soltero', 'V-77.666.555', '414-555-0004');
SELECT pg_temp.assert_rows('cedula 5: INSERT normalizes the cedula',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000004' AND cedula = '77666555'$$, 1);

-- ── telefono ────────────────────────────────────────────────────────
-- 6a. Unchanged value is not rewritten (the row still holds its spelling).
SELECT pg_temp.assert_ok('telefono 6a: SET telefono = telefono succeeds',
  $$UPDATE public.usuarios SET telefono = telefono WHERE id = 'c3000000-0000-4000-8000-000000000002'$$);
SELECT pg_temp.assert_rows('telefono 6a: canonical phone stays',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000002' AND telefono = '04145550002'$$, 1);

-- A non-canonical stored phone written back with the same value is not rewritten.
SET LOCAL session_replication_role = replica;
UPDATE public.usuarios SET telefono = '0414 555 0003' WHERE id = 'c3000000-0000-4000-8000-000000000003';
SET LOCAL session_replication_role = origin;
UPDATE public.usuarios SET telefono = telefono, nombre = 'ZZ Sc3' WHERE id = 'c3000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_rows('telefono 6b: an unchanged non-canonical phone is not rewritten',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000003' AND telefono = '0414 555 0003'$$, 1);

-- 6c. A changed value is normalized.
UPDATE public.usuarios SET telefono = '+58 414 555 0005' WHERE id = 'c3000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_rows('telefono 6c: a changed phone is normalized',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000003' AND telefono = '04145550005'$$, 1);

-- 6d. INSERT normalizes the phone.
SELECT pg_temp.assert_rows('telefono 6d: INSERT normalizes the phone',
  $$SELECT 1 FROM public.usuarios
    WHERE id = 'c3000000-0000-4000-8000-000000000004' AND telefono = '04145550004'$$, 1);

-- Structural: same triggers as before, functions only changed.
SELECT pg_temp.assert_rows('structural: cedula trigger unchanged',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'usuarios_normalizar_cedula'
       AND NOT tgisinternal
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF cedula ON%'$$, 1);
SELECT pg_temp.assert_rows('structural: telefono trigger unchanged',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'usuarios_normalizar_telefono'
       AND NOT tgisinternal
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF telefono ON%'$$, 1);

SELECT pg_temp.report();

ROLLBACK;
