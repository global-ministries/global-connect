-- T2 (odd/tasks/gdv-directores-alcance.md) — the group functions apply the single
-- director general rule (gdv_dg_ve_grupo) and nobody else changes.
--
-- Functions covered: puede_ver_grupo, puede_editar_grupo,
-- puede_ver_grupo_reporte_asistencia, es_director_general_de_grupo,
-- obtener_grupos_para_usuario and obtener_kpis_grupos_para_usuario(uuid).
--
-- Each case is a signature: one letter per fixture group, in name order
--   GA1 GA2 GB1 GB2 GB3 GB4 GC1   (T = the function says yes, F = no)
-- For the KPI function the signature is total_grupos (ALL = every group).
--
-- Fixtures: segment SA (scope 'segmento' for the main director general) and SB
-- (scope 'directores', with only DB1 marked; DB2 unmarked; GB4 is linked to DX,
-- a director de etapa of another segment SC that the person also marked).
--   dg_a       director general, SA = segmento, SB = directores      -> T T T F F F F
--   dg_b       the same person after flipping both scopes            -> T F T T T T F
--   dg_empty   director general with no segment rows                 -> nothing
--   dg_member  director general (SA only) and Miembro of GB2         -> SA only; the
--              function returns FALSE for a director general whose scope does not
--              match, before it ever reaches the member check (kept as it was)
--   admin, pastor, dir_etapa, leader, member: expectations are the answers the
--   ORIGINAL functions gave for the same fixtures, captured before the change.
--
-- The 2-argument overload of obtener_kpis_grupos_para_usuario makes a call with
-- one argument ambiguous, so the test renames it INSIDE the transaction to reach
-- the 1-argument function; the rename is rolled back with everything else.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing is kept; fixtures live
-- under the d2000000-... namespace. The last statement is a SELECT of the
-- failing cases (empty detail = all ok), because the MCP tool returns only the
-- last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rg_obs (who text, fn text, sig text) ON COMMIT DROP;

-- One letter per fixture group for a boolean function. p_tpl uses :uid (usuarios.id),
-- :aid (auth id) and :gid; the simulated identity is set for functions reading auth.uid().
CREATE OR REPLACE FUNCTION pg_temp.sig(p_tpl text, p_uid uuid, p_aid uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_g record;
  v_sig text := '';
  v_res boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_aid::text, true);
  FOR v_g IN SELECT id FROM public.grupos WHERE nombre LIKE 'ZZ Rg %' ORDER BY nombre LOOP
    EXECUTE 'SELECT coalesce(' || replace(replace(replace(p_tpl, ':uid', p_uid::text), ':aid', p_aid::text), ':gid', v_g.id::text) || ', false)' INTO v_res;
    v_sig := v_sig || CASE WHEN v_res THEN 'T' ELSE 'F' END;
  END LOOP;
  RETURN v_sig;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.kpi_total(p_aid uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_aid::text, true);
  SELECT k.total_grupos INTO v_total FROM public.obtener_kpis_grupos_para_usuario(p_aid) k;
  IF v_total = (SELECT count(*) FROM public.v_grupos_supervisiones) THEN
    RETURN 'ALL';
  END IF;
  RETURN v_total::text;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.observe(p_who text, p_uid uuid, p_aid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_rg_obs(who, fn, sig) VALUES
    (p_who, 'rule', pg_temp.sig($q$public.gdv_dg_ve_grupo(':uid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'pvg',  pg_temp.sig($q$public.puede_ver_grupo(':uid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'peg',  pg_temp.sig($q$public.puede_editar_grupo(':aid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'pra',  pg_temp.sig($q$public.puede_ver_grupo_reporte_asistencia(':aid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'edg',  pg_temp.sig($q$public.es_director_general_de_grupo(':aid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'ogu',  pg_temp.sig($q$EXISTS (SELECT 1 FROM public.obtener_grupos_para_usuario(':aid', p_limit => 1000) o WHERE o.id = ':gid')$q$, p_uid, p_aid)),
    (p_who, 'kpi',  pg_temp.kpi_total(p_aid));
END;
$$;

-- Fixtures (as postgres) -------------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('d2000000-0000-4000-8000-0000000000a1', 'ZZ Rg SA'),
  ('d2000000-0000-4000-8000-0000000000a2', 'ZZ Rg SB'),
  ('d2000000-0000-4000-8000-0000000000a3', 'ZZ Rg SC');

INSERT INTO auth.users (id, email) VALUES
  ('d2000000-0000-4000-8000-000000000101', 'zz-rg-dg-a@example.invalid'),
  ('d2000000-0000-4000-8000-000000000102', 'zz-rg-dg-empty@example.invalid'),
  ('d2000000-0000-4000-8000-000000000103', 'zz-rg-dg-member@example.invalid'),
  ('d2000000-0000-4000-8000-000000000104', 'zz-rg-admin@example.invalid'),
  ('d2000000-0000-4000-8000-000000000105', 'zz-rg-pastor@example.invalid'),
  ('d2000000-0000-4000-8000-000000000106', 'zz-rg-leader@example.invalid'),
  ('d2000000-0000-4000-8000-000000000107', 'zz-rg-member@example.invalid'),
  ('d2000000-0000-4000-8000-000000000112', 'zz-rg-dir-etapa@example.invalid');

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000101', 'ZZ Rg', 'DG a',      'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000102', 'ZZ Rg', 'DG vacio',  'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000103', 'ZZ Rg', 'DG miembro', 'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000104', 'ZZ Rg', 'Admin',     'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000105', 'ZZ Rg', 'Pastor',    'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000106', 'ZZ Rg', 'Lider',     'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000107', 'ZZ Rg', 'Miembro',   'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000011', NULL, 'ZZ Rg', 'Dir DA',  'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000112', 'ZZ Rg', 'Dir DB1', 'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000013', NULL, 'ZZ Rg', 'Dir DB2', 'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000014', NULL, 'ZZ Rg', 'Dir DX',  'Otro', 'Soltero');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT r.u, rs.id
FROM (VALUES
  ('d2000000-0000-4000-8000-000000000001'::uuid, 'director-general'),
  ('d2000000-0000-4000-8000-000000000002'::uuid, 'director-general'),
  ('d2000000-0000-4000-8000-000000000003'::uuid, 'director-general'),
  ('d2000000-0000-4000-8000-000000000004'::uuid, 'admin'),
  ('d2000000-0000-4000-8000-000000000005'::uuid, 'pastor'),
  ('d2000000-0000-4000-8000-000000000012'::uuid, 'director-etapa')
) r(u, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = r.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('d2000000-0000-4000-8000-0000000000b1', 'd2000000-0000-4000-8000-0000000000a1', 'd2000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('d2000000-0000-4000-8000-0000000000b2', 'd2000000-0000-4000-8000-0000000000a2', 'd2000000-0000-4000-8000-000000000012', 'director_etapa'),
  ('d2000000-0000-4000-8000-0000000000b3', 'd2000000-0000-4000-8000-0000000000a2', 'd2000000-0000-4000-8000-000000000013', 'director_etapa'),
  ('d2000000-0000-4000-8000-0000000000b4', 'd2000000-0000-4000-8000-0000000000a3', 'd2000000-0000-4000-8000-000000000014', 'director_etapa');

-- The test's own season, active today, so the member branch of puede_ver_grupo is
-- not the future-group one and the expectations do not depend on the environment.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('d2000000-0000-4000-8000-0000000000e1', 'ZZ Rg Temporada', CURRENT_DATE - 30, CURRENT_DATE + 300, true, 'activa');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id)
SELECT g.id, g.nombre, 'd2000000-0000-4000-8000-0000000000e1'::uuid, g.segmento_id
FROM (VALUES
  ('d2000000-0000-4000-8000-0000000000c1'::uuid, 'ZZ Rg GA1', 'd2000000-0000-4000-8000-0000000000a1'::uuid),
  ('d2000000-0000-4000-8000-0000000000c2'::uuid, 'ZZ Rg GA2', 'd2000000-0000-4000-8000-0000000000a1'::uuid),
  ('d2000000-0000-4000-8000-0000000000c3'::uuid, 'ZZ Rg GB1', 'd2000000-0000-4000-8000-0000000000a2'::uuid),
  ('d2000000-0000-4000-8000-0000000000c4'::uuid, 'ZZ Rg GB2', 'd2000000-0000-4000-8000-0000000000a2'::uuid),
  ('d2000000-0000-4000-8000-0000000000c5'::uuid, 'ZZ Rg GB3', 'd2000000-0000-4000-8000-0000000000a2'::uuid),
  ('d2000000-0000-4000-8000-0000000000c6'::uuid, 'ZZ Rg GB4', 'd2000000-0000-4000-8000-0000000000a2'::uuid),
  ('d2000000-0000-4000-8000-0000000000c7'::uuid, 'ZZ Rg GC1', 'd2000000-0000-4000-8000-0000000000a3'::uuid)
) g(id, nombre, segmento_id);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('d2000000-0000-4000-8000-0000000000b1', 'd2000000-0000-4000-8000-0000000000c1'),
  ('d2000000-0000-4000-8000-0000000000b2', 'd2000000-0000-4000-8000-0000000000c3'),
  ('d2000000-0000-4000-8000-0000000000b3', 'd2000000-0000-4000-8000-0000000000c4'),
  ('d2000000-0000-4000-8000-0000000000b4', 'd2000000-0000-4000-8000-0000000000c6'),
  ('d2000000-0000-4000-8000-0000000000b4', 'd2000000-0000-4000-8000-0000000000c7');

-- The leader leads GA2 and GB2, the member belongs to GB2 and GC1, and dg_member
-- is a Miembro of GB2 (a segment that person does not hold as director general).
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol) VALUES
  ('d2000000-0000-4000-8000-0000000000c2', 'd2000000-0000-4000-8000-000000000006', 'Líder'),
  ('d2000000-0000-4000-8000-0000000000c4', 'd2000000-0000-4000-8000-000000000006', 'Líder'),
  ('d2000000-0000-4000-8000-0000000000c4', 'd2000000-0000-4000-8000-000000000007', 'Miembro'),
  ('d2000000-0000-4000-8000-0000000000c7', 'd2000000-0000-4000-8000-000000000007', 'Miembro'),
  ('d2000000-0000-4000-8000-0000000000c4', 'd2000000-0000-4000-8000-000000000003', 'Miembro');

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000a1', 'segmento'),
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000a2', 'directores'),
  ('d2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-0000000000a1', 'segmento');

INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000b1'),
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000b2'),
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000b4');

-- Observations -----------------------------------------------------------------
ALTER FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid) RENAME TO zz_obtener_kpis_grupos_dos_args;

SELECT pg_temp.observe('dg_a',      'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000101');
SELECT pg_temp.observe('dg_empty',  'd2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000102');
SELECT pg_temp.observe('dg_member', 'd2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000103');
SELECT pg_temp.observe('admin',     'd2000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000104');
SELECT pg_temp.observe('pastor',    'd2000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000105');
SELECT pg_temp.observe('leader',    'd2000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000106');
SELECT pg_temp.observe('member',    'd2000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000107');
SELECT pg_temp.observe('dir_etapa', 'd2000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000112');

-- Flip both scopes for the same person and observe again.
UPDATE public.director_general_segmentos SET alcance = 'directores'
 WHERE usuario_id = 'd2000000-0000-4000-8000-000000000001' AND segmento_id = 'd2000000-0000-4000-8000-0000000000a1';
UPDATE public.director_general_segmentos SET alcance = 'segmento'
 WHERE usuario_id = 'd2000000-0000-4000-8000-000000000001' AND segmento_id = 'd2000000-0000-4000-8000-0000000000a2';
SELECT pg_temp.observe('dg_b',      'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000101');

-- Expectations -----------------------------------------------------------------
CREATE TEMP TABLE t_rg_expected (who text, fn text, sig text) ON COMMIT DROP;
INSERT INTO t_rg_expected VALUES
  -- director general, scope segmento in SA and directores in SB
  ('dg_a', 'rule', 'TTTFFFF'), ('dg_a', 'pvg', 'TTTFFFF'), ('dg_a', 'peg', 'TTTFFFF'),
  ('dg_a', 'pra', 'TTTFFFF'), ('dg_a', 'edg', 'TTTFFFF'), ('dg_a', 'ogu', 'TTTFFFF'), ('dg_a', 'kpi', '3'),
  -- the same person with the scopes flipped
  ('dg_b', 'rule', 'TFTTTTF'), ('dg_b', 'pvg', 'TFTTTTF'), ('dg_b', 'peg', 'TFTTTTF'),
  ('dg_b', 'pra', 'TFTTTTF'), ('dg_b', 'edg', 'TFTTTTF'), ('dg_b', 'ogu', 'TFTTTTF'), ('dg_b', 'kpi', '5'),
  -- director general with no rows
  ('dg_empty', 'rule', 'FFFFFFF'), ('dg_empty', 'pvg', 'FFFFFFF'), ('dg_empty', 'peg', 'FFFFFFF'),
  ('dg_empty', 'pra', 'FFFFFFF'), ('dg_empty', 'edg', 'FFFFFFF'), ('dg_empty', 'ogu', 'FFFFFFF'), ('dg_empty', 'kpi', '0'),
  -- director general (SA, segmento) who is also a Miembro of GB2: FALSE for GB2 in
  -- puede_ver_grupo, as before (the director general branch never falls through)
  ('dg_member', 'rule', 'TTFFFFF'), ('dg_member', 'pvg', 'TTFFFFF'), ('dg_member', 'peg', 'TTFFFFF'),
  ('dg_member', 'pra', 'TTFFFFF'), ('dg_member', 'edg', 'TTFFFFF'), ('dg_member', 'ogu', 'TTFFFFF'), ('dg_member', 'kpi', '2'),
  -- answers of the ORIGINAL functions for the same fixtures (captured before the change)
  ('admin', 'pvg', 'TTTTTTT'), ('admin', 'peg', 'TTTTTTT'), ('admin', 'pra', 'TTTTTTT'),
  ('admin', 'edg', 'TTTTTTT'), ('admin', 'ogu', 'TTTTTTT'), ('admin', 'kpi', 'ALL'),
  ('pastor', 'pvg', 'TTTTTTT'), ('pastor', 'peg', 'TTTTTTT'), ('pastor', 'pra', 'TTTTTTT'),
  ('pastor', 'edg', 'TTTTTTT'), ('pastor', 'ogu', 'TTTTTTT'), ('pastor', 'kpi', 'ALL'),
  ('dir_etapa', 'pvg', 'FFTFFFF'), ('dir_etapa', 'peg', 'FFTFFFF'), ('dir_etapa', 'pra', 'FFTFFFF'),
  ('dir_etapa', 'edg', 'FFFFFFF'), ('dir_etapa', 'ogu', 'FFTFFFF'), ('dir_etapa', 'kpi', '1'),
  ('leader', 'pvg', 'FTFTFFF'), ('leader', 'peg', 'FTFTFFF'), ('leader', 'pra', 'FFFFFFF'),
  ('leader', 'edg', 'FFFFFFF'), ('leader', 'ogu', 'FTFTFFF'), ('leader', 'kpi', '2'),
  ('member', 'pvg', 'FFFTFFT'), ('member', 'peg', 'FFFFFFF'), ('member', 'pra', 'FFFFFFF'),
  ('member', 'edg', 'FFFFFFF'), ('member', 'ogu', 'FFFTFFT'), ('member', 'kpi', '0');

SELECT count(*) AS failing_cases,
       coalesce(string_agg(x.who || '.' || x.fn || ': expected ' || x.sig || ', got ' || coalesce(o.sig, 'MISSING'), E'\n' ORDER BY x.who, x.fn), 'all cases ok') AS detail
  FROM t_rg_expected x
  LEFT JOIN t_rg_obs o ON o.who = x.who AND o.fn = x.fn
 WHERE o.sig IS DISTINCT FROM x.sig;

ROLLBACK;
