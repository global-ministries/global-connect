-- T0 (odd/tasks/dream-team-servidores-rediseno.md) — phone normalization:
-- public.normalizar_telefono_ve(text), the BEFORE INSERT OR UPDATE OF telefono
-- trigger on usuarios, and the log table usuarios_telefono_normalizacion.
--
-- The list of pairs below is THE SAME as __tests__/lib/utils/telefono.test.ts
-- (lib/utils/telefono.ts is the TypeScript mirror). Keep both lists in sync.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- usuarios live under this file's own c0a00000-... namespace.
--
-- The MCP connection is `postgres` (BYPASSRLS): the "not readable by
-- authenticated" assertion switches to SET LOCAL ROLE authenticated.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tel_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_tel_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tel_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_tel_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── table of cases (keep in sync with __tests__/lib/utils/telefono.test.ts) ──
CREATE TEMP TABLE t_tel_pairs (entrada text, esperado text) ON COMMIT DROP;
INSERT INTO t_tel_pairs VALUES
  ('04245512712',        '04245512712'),
  ('0424-5616920',       '04245616920'),
  ('+584120574200',      '04120574200'),
  ('+58 412-5138681',    '04125138681'),
  ('+5804126724853',     '04126724853'),
  ('4121536111',         '04121536111'),
  ('0424-548-9514',      '04245489514'),
  ('04125041122 ',       '04125041122'),
  (' 0424-5396867',      '04245396867'),
  ('00584145663781',     '04145663781'),
  ('02515551234',        '02515551234'),
  ('+582515551234',      '02515551234'),
  (E'\u202A04140569935\u202C', '04140569935'),
  -- untouched: returned exactly as given
  ('+17867312193',       '+17867312193'),
  ('+00000000000',       '+00000000000'),
  ('123',                '123'),
  ('+58',                '+58'),
  ('0424831126',         '0424831126'),
  ('042455922826',       '042455922826'),
  ('',                   ''),
  (NULL,                 NULL);

-- Fixtures (as postgres).
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, telefono) VALUES
  ('c0a00000-0000-4000-8000-000000000001', 'ZZ Tel', 'Insert', 'Otro', 'Soltero', '0424-548-9514'),
  ('c0a00000-0000-4000-8000-000000000002', 'ZZ Tel', 'Update', 'Otro', 'Soltero', '04245512712'),
  ('c0a00000-0000-4000-8000-000000000003', 'ZZ Tel', 'Untouched', 'Otro', 'Soltero', '+17867312193');

-- ── function: exact pairs ───────────────────────────────────────────
SELECT pg_temp.fail('pair ' || coalesce(entrada, 'NULL') || ' -> expected ' || coalesce(esperado, 'NULL'),
                    'got ' || coalesce(public.normalizar_telefono_ve(entrada), 'NULL'))
FROM t_tel_pairs
WHERE public.normalizar_telefono_ve(entrada) IS DISTINCT FROM esperado;

-- ── function: idempotence ───────────────────────────────────────────
SELECT pg_temp.fail('idempotence ' || coalesce(entrada, 'NULL'), 'f(f(x)) != f(x)')
FROM t_tel_pairs
WHERE public.normalizar_telefono_ve(public.normalizar_telefono_ve(entrada))
      IS DISTINCT FROM public.normalizar_telefono_ve(entrada);

-- ── trigger ─────────────────────────────────────────────────────────
SELECT pg_temp.assert_rows('trigger: INSERT normalizes',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c0a00000-0000-4000-8000-000000000001' AND telefono = '04245489514'$$, 1);
SELECT pg_temp.assert_rows('trigger: INSERT leaves an unrecognized value as is',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c0a00000-0000-4000-8000-000000000003' AND telefono = '+17867312193'$$, 1);

UPDATE public.usuarios SET telefono = '+58 424-5825358' WHERE id = 'c0a00000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_rows('trigger: UPDATE OF telefono normalizes',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c0a00000-0000-4000-8000-000000000002' AND telefono = '04245825358'$$, 1);

UPDATE public.usuarios SET telefono = '123' WHERE id = 'c0a00000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_rows('trigger: UPDATE OF telefono leaves an untouched value as is',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c0a00000-0000-4000-8000-000000000003' AND telefono = '123'$$, 1);

-- An UPDATE of another column must not rewrite telefono. The trigger is
-- disabled to plant a non-canonical value, then re-enabled.
ALTER TABLE public.usuarios DISABLE TRIGGER usuarios_normalizar_telefono;
UPDATE public.usuarios SET telefono = '0424-1112233' WHERE id = 'c0a00000-0000-4000-8000-000000000002';
ALTER TABLE public.usuarios ENABLE TRIGGER usuarios_normalizar_telefono;
UPDATE public.usuarios SET apellido = 'Update2' WHERE id = 'c0a00000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_rows('trigger: UPDATE of another column does not rewrite telefono',
  $$SELECT 1 FROM public.usuarios WHERE id = 'c0a00000-0000-4000-8000-000000000002' AND telefono = '0424-1112233'$$, 1);

SELECT pg_temp.assert_rows('structural: trigger fires only on INSERT or UPDATE OF telefono',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.usuarios'::regclass AND tgname = 'usuarios_normalizar_telefono'
       AND NOT tgisinternal
       AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF telefono ON%'$$, 1);

-- ── one-off correction left nothing normalizable behind ─────────────
SELECT pg_temp.assert_rows('correction: no stored value is still normalizable',
  $$SELECT 1 FROM public.usuarios
     WHERE id::text NOT LIKE 'c0a00000-%'
       AND public.normalizar_telefono_ve(telefono) IS DISTINCT FROM telefono$$, 0);

-- ── log table: RLS on, invisible to authenticated ───────────────────
SELECT pg_temp.assert_rows('structural: log table has RLS enabled',
  $$SELECT 1 FROM pg_class WHERE oid = 'public.usuarios_telefono_normalizacion'::regclass AND relrowsecurity$$, 1);
SELECT pg_temp.assert_rows('structural: log table has no policies',
  $$SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios_telefono_normalizacion'$$, 0);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_sqlstate('log table: authenticated cannot read',
  $$SELECT * FROM public.usuarios_telefono_normalizacion$$, '42501');
SELECT pg_temp.assert_sqlstate('log table: authenticated cannot insert',
  $$INSERT INTO public.usuarios_telefono_normalizacion (usuario_id, antes, despues) VALUES ('c0a00000-0000-4000-8000-000000000001', 'a', 'b')$$, '42501');
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
