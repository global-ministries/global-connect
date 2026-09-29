-- T1 (odd/tasks/usuarios-cedula-normalizada.md) — cedula normalization:
-- public.normalizar_cedula_ve(text), the BEFORE INSERT OR UPDATE OF cedula
-- trigger on usuarios, the log table usuarios_cedula_normalizacion and the
-- one-off correction that leaves collision groups untouched.
--
-- The list of pairs below is THE SAME as __tests__/lib/utils/cedula.test.ts
-- (lib/utils/cedula.ts is the TypeScript mirror). Keep both lists in sync.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- usuarios live under this file's own c2000000-... namespace.
--
-- The MCP connection is `postgres` (BYPASSRLS): the "not readable by
-- authenticated" assertion switches to SET LOCAL ROLE authenticated.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ced_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ced_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ced_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ced_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── table of cases (keep in sync with __tests__/lib/utils/cedula.test.ts) ──
CREATE TEMP TABLE t_ced_pairs (entrada text, esperado text) ON COMMIT DROP;
INSERT INTO t_ced_pairs VALUES
  ('22.328.215',   '22328215'),
  ('V-18423291',   '18423291'),
  ('v18423291',    '18423291'),
  ('V9220603',     '9220603'),
  (' 7.485477 ',   '7485477'),
  ('23.488.709 ',  '23488709'),
  ('E 81110494',   'E81110494'),
  ('E-23159262',   'E23159262'),
  ('e81110494',    'E81110494'),
  ('17640068',     '17640068'),
  (chr(8234) || '22328215' || chr(8236), '22328215'),
  -- untouched: returned exactly as given
  ('04245136686',  '04245136686'),
  ('1710514955',   '1710514955'),
  ('141292738',    '141292738'),
  ('0000000000',   '0000000000'),
  ('09876',        '09876'),
  ('12345',        '12345'),
  ('ABC123',       'ABC123'),
  ('',             ''),
  (NULL,           NULL);

-- Fixtures (as postgres). '888000NN' values do not exist on staging.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, cedula) VALUES
  ('c2000000-0000-4000-8000-000000000001', 'ZZ Ced', 'Insert', 'Otro', 'Soltero', 'V-88800001'),
  ('c2000000-0000-4000-8000-000000000002', 'ZZ Ced', 'Update', 'Otro', 'Soltero', '88800002'),
  ('c2000000-0000-4000-8000-000000000003', 'ZZ Ced', 'Untouched', 'Otro', 'Soltero', 'ZZ-CED-A');

-- ── function: exact pairs ───────────────────────────────────────────
SELECT pg_temp.fail('pair ' || coalesce(entrada, 'NULL') || ' -> expected ' || coalesce(esperado, 'NULL'),
                    'got ' || coalesce(public.normalizar_cedula_ve(entrada), 'NULL'))
FROM t_ced_pairs
WHERE public.normalizar_cedula_ve(entrada) IS DISTINCT FROM esperado;

-- ── function: idempotence ───────────────────────────────────────────
SELECT pg_temp.fail('idempotence ' || coalesce(entrada, 'NULL'), 'f(f(x)) != f(x)')
FROM t_ced_pairs
WHERE public.normalizar_cedula_ve(public.normalizar_cedula_ve(entrada))
      IS DISTINCT FROM public.normalizar_cedula_ve(entrada);

-- ── trigger ─────────────────────────────────────────────────────────
SELECT pg_temp.assert_rows('trigger: INSERT normalizes',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c2000000-0000-4000-8000-000000000001' AND cedula = '88800001'$$, 1);
SELECT pg_temp.assert_rows('trigger: INSERT leaves an unrecognized value as is',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c2000000-0000-4000-8000-000000000003' AND cedula = 'ZZ-CED-A'$$, 1);

UPDATE public.usuarios SET cedula = 'v-88.800.003' WHERE id = 'c2000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_rows('trigger: UPDATE OF cedula normalizes',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c2000000-0000-4000-8000-000000000002' AND cedula = '88800003'$$, 1);

UPDATE public.usuarios SET cedula = 'ZZ-CED-B' WHERE id = 'c2000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_rows('trigger: UPDATE OF cedula leaves an unrecognized value as is',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c2000000-0000-4000-8000-000000000003' AND cedula = 'ZZ-CED-B'$$, 1);

-- An UPDATE of another column must not rewrite cedula. The trigger is
-- disabled to plant a non-canonical value, then re-enabled.
ALTER TABLE public.usuarios DISABLE TRIGGER usuarios_normalizar_cedula;
UPDATE public.usuarios SET cedula = 'V-88800004' WHERE id = 'c2000000-0000-4000-8000-000000000002';
ALTER TABLE public.usuarios ENABLE TRIGGER usuarios_normalizar_cedula;
UPDATE public.usuarios SET apellido = 'Update2' WHERE id = 'c2000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_rows('trigger: UPDATE of another column does not rewrite cedula',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c2000000-0000-4000-8000-000000000002' AND cedula = 'V-88800004'$$, 1);

-- A second profile whose cedula normalizes to an existing one is rejected.
SELECT pg_temp.assert_sqlstate('unique: a second profile with the same normalized cedula fails',
  $$INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, cedula)
    VALUES ('c2000000-0000-4000-8000-000000000004', 'ZZ Ced', 'Dup', 'Otro', 'Soltero', '88.800.001')$$, '23505');

SELECT pg_temp.assert_rows('structural: trigger fires only on INSERT or UPDATE OF cedula',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'usuarios_normalizar_cedula'
       AND NOT tgisinternal
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF cedula ON%'$$, 1);
SELECT pg_temp.assert_rows('structural: the phone trigger is still there',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'usuarios_normalizar_telefono'
       AND NOT tgisinternal$$, 1);

-- ── one-off correction ──────────────────────────────────────────────
-- No stored value outside a collision group is still normalizable...
SELECT pg_temp.assert_rows('correction: no non-colliding value is still normalizable',
  $$SELECT 1 FROM (
      SELECT id, cedula,
             count(*) OVER (PARTITION BY public.normalizar_cedula_ve(cedula)) AS en_grupo
      FROM public.usuarios WHERE cedula IS NOT NULL
    ) u
    WHERE id::text NOT LIKE 'c2000000-%' AND en_grupo = 1
      AND public.normalizar_cedula_ve(cedula) IS DISTINCT FROM cedula$$, 0);
-- ...and no member of a collision group was logged (so none was rewritten).
SELECT pg_temp.assert_rows('correction: collision group members were not logged',
  $$SELECT 1 FROM public.usuarios_cedula_normalizacion l
    WHERE (SELECT count(*) FROM public.usuarios u
           WHERE public.normalizar_cedula_ve(u.cedula)
                 = public.normalizar_cedula_ve((SELECT cedula FROM public.usuarios WHERE id = l.usuario_id))) > 1$$, 0);
-- The log only holds real rewrites.
SELECT pg_temp.assert_rows('correction: every log row is a real rewrite',
  $$SELECT 1 FROM public.usuarios_cedula_normalizacion WHERE antes IS NOT DISTINCT FROM despues$$, 0);

-- ── log table: RLS on, invisible to authenticated ───────────────────
SELECT pg_temp.assert_rows('structural: log table has RLS enabled',
  $$SELECT 1 FROM pg_class WHERE oid = 'public.usuarios_cedula_normalizacion'::regclass AND relrowsecurity$$, 1);
SELECT pg_temp.assert_rows('structural: log table has no policies',
  $$SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios_cedula_normalizacion'$$, 0);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_sqlstate('log table: authenticated cannot read',
  $$SELECT * FROM public.usuarios_cedula_normalizacion$$, '42501');
SELECT pg_temp.assert_sqlstate('log table: authenticated cannot insert',
  $$INSERT INTO public.usuarios_cedula_normalizacion (usuario_id, antes, despues) VALUES ('c2000000-0000-4000-8000-000000000001', 'a', 'b')$$, '42501');
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
