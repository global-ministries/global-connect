-- T6 (odd/tasks/gdv-directores-alcance.md) — only admin and pastor write the
-- director general -> director de etapa marks in public.dg_directores_etapa.
--
-- Covers:
--   1. A director general cannot insert a mark (for themselves or for another
--      director general) and cannot delete one (own or another's): the insert is
--      refused by RLS, the delete touches nothing.
--   2. An admin and a pastor can insert and delete. The admin fixture has an
--      auth id different from its usuarios.id, like real accounts.
--   3. An authenticated person with any other role cannot write.
--   4. SELECT keeps working for any authenticated person.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own d4000000-... namespace. The last statement is a
-- SELECT of the failing cases (empty = all ok), because the MCP tool returns
-- only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_esc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_esc_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs p_sql as the authenticated person with auth id p_aid and returns the
-- number of rows it affected; -1 when it raised an exception (SQLSTATE in
-- t_esc_last_error).
CREATE TEMP TABLE t_esc_last_error (sqlstate text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.run_as(p_aid uuid, p_sql text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM t_esc_last_error;
  PERFORM set_config('request.jwt.claim.sub', p_aid::text, true);
  -- auth.role() reads this claim; the roles_sistema and usuario_roles policies need it
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN v_rows;
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO t_esc_last_error VALUES (SQLSTATE);
    RETURN -1;
END;
$$;

-- Expects run_as to have been refused with an RLS violation (42501).
CREATE OR REPLACE FUNCTION pg_temp.assert_refused(p_case text, p_aid uuid, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_rows integer := pg_temp.run_as(p_aid, p_sql);
  v_state text := (SELECT sqlstate FROM t_esc_last_error LIMIT 1);
BEGIN
  IF v_rows <> -1 OR v_state IS DISTINCT FROM '42501' THEN
    PERFORM pg_temp.fail(p_case, 'expected 42501, got rows ' || v_rows || ' state ' || coalesce(v_state, 'none'));
  END IF;
END;
$$;

-- Expects run_as to have affected exactly p_expected rows.
CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_aid uuid, p_sql text, p_expected integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_rows integer := pg_temp.run_as(p_aid, p_sql);
BEGIN
  IF v_rows IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' rows, got ' || v_rows
      || coalesce(' state ' || (SELECT sqlstate FROM t_esc_last_error LIMIT 1), ''));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mark_count(p_id uuid)
RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.dg_directores_etapa WHERE id = p_id;
$$;

-- Fixtures (as postgres) -------------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('d4000000-0000-4000-8000-0000000000a1', 'ZZ Esc SA');

INSERT INTO auth.users (id, email) VALUES
  ('d4000000-0000-4000-8000-000000000101', 'zz-esc-dg1@example.invalid'),
  ('d4000000-0000-4000-8000-000000000102', 'zz-esc-dg2@example.invalid'),
  ('d4000000-0000-4000-8000-000000000104', 'zz-esc-admin@example.invalid'),
  ('d4000000-0000-4000-8000-000000000105', 'zz-esc-pastor@example.invalid'),
  ('d4000000-0000-4000-8000-000000000106', 'zz-esc-leader@example.invalid');

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000101', 'ZZ Esc', 'DG uno',  'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000102', 'ZZ Esc', 'DG dos',  'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000104', 'ZZ Esc', 'Admin',   'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-000000000105', 'ZZ Esc', 'Pastor',  'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000106', 'ZZ Esc', 'Lider',   'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000011', NULL, 'ZZ Esc', 'Dir A', 'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000012', NULL, 'ZZ Esc', 'Dir B', 'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000013', NULL, 'ZZ Esc', 'Dir C', 'Otro', 'Soltero'),
  ('d4000000-0000-4000-8000-000000000014', NULL, 'ZZ Esc', 'Dir D', 'Otro', 'Soltero');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT r.u, rs.id
FROM (VALUES
  ('d4000000-0000-4000-8000-000000000001'::uuid, 'director-general'),
  ('d4000000-0000-4000-8000-000000000002'::uuid, 'director-general'),
  ('d4000000-0000-4000-8000-000000000004'::uuid, 'admin'),
  ('d4000000-0000-4000-8000-000000000005'::uuid, 'pastor'),
  ('d4000000-0000-4000-8000-000000000006'::uuid, 'lider')
) r(u, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = r.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('d4000000-0000-4000-8000-0000000000b1', 'd4000000-0000-4000-8000-0000000000a1', 'd4000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('d4000000-0000-4000-8000-0000000000b2', 'd4000000-0000-4000-8000-0000000000a1', 'd4000000-0000-4000-8000-000000000012', 'director_etapa'),
  ('d4000000-0000-4000-8000-0000000000b3', 'd4000000-0000-4000-8000-0000000000a1', 'd4000000-0000-4000-8000-000000000013', 'director_etapa'),
  ('d4000000-0000-4000-8000-0000000000b4', 'd4000000-0000-4000-8000-0000000000a1', 'd4000000-0000-4000-8000-000000000014', 'director_etapa');

-- Existing marks: M1 belongs to DG uno, M2 to DG dos, M3 and M4 are for the
-- admin and the pastor to delete.
INSERT INTO public.dg_directores_etapa (id, dg_usuario_id, segmento_lider_id) VALUES
  ('d4000000-0000-4000-8000-0000000000d1', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b1'),
  ('d4000000-0000-4000-8000-0000000000d2', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000b1'),
  ('d4000000-0000-4000-8000-0000000000d3', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b2'),
  ('d4000000-0000-4000-8000-0000000000d4', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000b2');

-- 1. Director general: refused ---------------------------------------------------
SELECT pg_temp.assert_refused('dg insert own', 'd4000000-0000-4000-8000-000000000101',
  $q$INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id)
     VALUES ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b3')$q$);
SELECT pg_temp.assert_refused('dg insert for another', 'd4000000-0000-4000-8000-000000000101',
  $q$INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id)
     VALUES ('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000b3')$q$);
SELECT pg_temp.assert_rows('dg delete own touches nothing', 'd4000000-0000-4000-8000-000000000101',
  $q$DELETE FROM public.dg_directores_etapa WHERE id = 'd4000000-0000-4000-8000-0000000000d1'$q$, 0);
SELECT pg_temp.assert_rows('dg delete another touches nothing', 'd4000000-0000-4000-8000-000000000101',
  $q$DELETE FROM public.dg_directores_etapa WHERE id = 'd4000000-0000-4000-8000-0000000000d2'$q$, 0);
SELECT pg_temp.assert_rows('dg update touches nothing', 'd4000000-0000-4000-8000-000000000101',
  $q$UPDATE public.dg_directores_etapa SET segmento_lider_id = 'd4000000-0000-4000-8000-0000000000b4'
     WHERE id = 'd4000000-0000-4000-8000-0000000000d2'$q$, 0);

-- 3. Another role: refused --------------------------------------------------------
SELECT pg_temp.assert_refused('leader insert', 'd4000000-0000-4000-8000-000000000106',
  $q$INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id)
     VALUES ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b3')$q$);
SELECT pg_temp.assert_rows('leader delete touches nothing', 'd4000000-0000-4000-8000-000000000106',
  $q$DELETE FROM public.dg_directores_etapa WHERE id = 'd4000000-0000-4000-8000-0000000000d1'$q$, 0);

INSERT INTO t_esc_failures
SELECT 'refused writes left the marks intact: a mark was deleted'
 WHERE NOT (pg_temp.mark_count('d4000000-0000-4000-8000-0000000000d1') = 1
        AND pg_temp.mark_count('d4000000-0000-4000-8000-0000000000d2') = 1);

-- 2. Admin and pastor: allowed ----------------------------------------------------
SELECT pg_temp.assert_rows('admin insert', 'd4000000-0000-4000-8000-000000000104',
  $q$INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id)
     VALUES ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b3')$q$, 1);
SELECT pg_temp.assert_rows('pastor insert', 'd4000000-0000-4000-8000-000000000105',
  $q$INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id)
     VALUES ('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000b3')$q$, 1);
SELECT pg_temp.assert_rows('admin delete', 'd4000000-0000-4000-8000-000000000104',
  $q$DELETE FROM public.dg_directores_etapa WHERE id = 'd4000000-0000-4000-8000-0000000000d3'$q$, 1);
SELECT pg_temp.assert_rows('pastor delete', 'd4000000-0000-4000-8000-000000000105',
  $q$DELETE FROM public.dg_directores_etapa WHERE id = 'd4000000-0000-4000-8000-0000000000d4'$q$, 1);

-- 4. SELECT still works for any authenticated person ------------------------------
SELECT pg_temp.assert_rows('dg select', 'd4000000-0000-4000-8000-000000000101',
  $q$SELECT 1 FROM public.dg_directores_etapa WHERE id IN ('d4000000-0000-4000-8000-0000000000d1', 'd4000000-0000-4000-8000-0000000000d2')$q$, 2);
SELECT pg_temp.assert_rows('leader select', 'd4000000-0000-4000-8000-000000000106',
  $q$SELECT 1 FROM public.dg_directores_etapa WHERE id IN ('d4000000-0000-4000-8000-0000000000d1', 'd4000000-0000-4000-8000-0000000000d2')$q$, 2);

SELECT count(*) AS failing_cases,
       coalesce(string_agg(case_name, E'\n' ORDER BY case_name), 'all cases ok') AS detail
  FROM t_esc_failures;

ROLLBACK;
