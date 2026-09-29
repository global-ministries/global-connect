-- T3 (odd/tasks/gdv-directores-alcance.md) — the dashboard, risk, casas and users
-- functions apply the single director general rule (gdv_dg_ve_grupo /
-- gdv_dg_grupos_visibles) and nobody else changes.
--
-- Functions covered (fn code in the observations):
--   obtener_datos_dashboard                        dsh_n dsh_m dsh_a dsh_r dsh_d
--   obtener_dashboard_riesgo                       rsk_n rsk_sin
--   obtener_miembros_en_riesgo                     mer
--   obtener_casas_visibles_ids                     cvi
--   casas_map_director_general_can_view_group      cvg
--   puede_crear_casa_anfitriona_para               pcc
--   listar_usuarios_con_permisos                   lup
--   get_personas_under_me                          gpm
--   obtener_kpis_grupos_para_usuario(uuid, uuid)   kpi
--
-- Most observations are a signature: one letter per fixture group, in name order
--   GA1 GA2 GB1 GB2 GB3 GB4 GC1   (T = yes, F = no)
-- where the question is about the group itself (cvg, dsh_r, rsk_sin, mer) or about
-- the group's own member (pcc, cvi, lup, gpm: each group has one primary member
-- with an account and a casa). The others are numbers or short strings:
--   dsh_n / rsk_n / kpi   groups counted (ALL = every group, for admin and pastor)
--   dsh_m                 distinct active members in the scoped groups
--   dsh_a                 weekly attendance average over the scoped groups
--   dsh_d                 members per segment in the segment distribution
-- 'skip' marks an observation that is not taken for that person (it would read
-- live data or a shape that does not apply).
--
-- Fixtures: segment SA (scope 'segmento' for the main director general) and SB
-- (scope 'directores', with only DB1 marked; DB2 unmarked; GB4 is linked to DX, a
-- director de etapa of another segment SC that the person also marked). GA1, GB1
-- and GB2 have an attendance event today with one present and one absent member,
-- so they show up in the attendance risk lists.
--   dg_a       director general, SA = segmento, SB = directores      -> T T T F F F F
--   dg_b       the same person after flipping both scopes            -> T F T T T T F
--   dg_empty   director general with no segment rows                 -> nothing
--   admin, pastor, dir_etapa, leader, member: expectations are the answers the
--   ORIGINAL functions gave for the same fixtures, captured before the change.
--
-- The test creates its own season (active today) so the expectations do not
-- depend on the environment.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing is kept; fixtures live
-- under the d3000000-... namespace. The last statement is a SELECT of the
-- failing cases (empty detail = all ok), because the MCP tool returns only the
-- last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tb_obs (who text, fn text, sig text) ON COMMIT DROP;
CREATE TEMP TABLE t_tb_map (nombre text, gid uuid, mid uuid, cid uuid) ON COMMIT DROP;

-- One letter per fixture group. p_tpl is a boolean expression using :uid
-- (usuarios.id of the person), :aid (auth id), :gid (group), :mid (the group's
-- primary member) and :cid (that member's casa).
CREATE OR REPLACE FUNCTION pg_temp.sig(p_tpl text, p_uid uuid, p_aid uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_g record;
  v_sig text := '';
  v_res boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_aid::text, true);
  FOR v_g IN SELECT * FROM t_tb_map ORDER BY nombre LOOP
    EXECUTE 'SELECT coalesce(' ||
      replace(replace(replace(replace(replace(p_tpl,
        ':uid', p_uid::text), ':aid', p_aid::text), ':gid', v_g.gid::text), ':mid', v_g.mid::text), ':cid', v_g.cid::text)
      || ', false)' INTO v_res;
    v_sig := v_sig || CASE WHEN v_res THEN 'T' ELSE 'F' END;
  END LOOP;
  RETURN v_sig;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

-- One letter per fixture group from an array of group ids (as text).
CREATE OR REPLACE FUNCTION pg_temp.letters(p_ids text[])
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(CASE WHEN m.gid::text = ANY (coalesce(p_ids, '{}')) THEN 'T' ELSE 'F' END, '' ORDER BY m.nombre), '')
  FROM t_tb_map m;
$$;

CREATE OR REPLACE FUNCTION pg_temp.observe(p_who text, p_kind text, p_uid uuid, p_aid uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_dash jsonb;
  v_rsk jsonb;
  v_n text;
  v_kpi int;
  v_all_active bigint := (SELECT count(*) FROM public.grupos WHERE activo AND NOT coalesce(eliminado, false));
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_aid::text, true);

  INSERT INTO t_tb_obs(who, fn, sig) VALUES
    (p_who, 'cvg', pg_temp.sig($q$public.casas_map_director_general_can_view_group(':uid', ':gid')$q$, p_uid, p_aid)),
    (p_who, 'pcc', pg_temp.sig($q$public.puede_crear_casa_anfitriona_para(':aid', ':mid')$q$, p_uid, p_aid)),
    (p_who, 'cvi', pg_temp.sig($q$(':cid'::uuid = ANY (public.obtener_casas_visibles_ids(':aid')))$q$, p_uid, p_aid)),
    (p_who, 'lup', pg_temp.sig($q$EXISTS (SELECT 1 FROM public.listar_usuarios_con_permisos(':aid', p_limite => 100000) l WHERE l.id = ':mid')$q$, p_uid, p_aid)),
    (p_who, 'gpm', pg_temp.sig($q$EXISTS (SELECT 1 FROM public.get_personas_under_me(':aid') p WHERE p.persona_id = ':mid')$q$, p_uid, p_aid));

  -- Members at risk: admin and pastor read live data (500-row limit), so skipped.
  IF p_kind = 'super' THEN
    INSERT INTO t_tb_obs VALUES (p_who, 'mer', 'skip');
  ELSE
    INSERT INTO t_tb_obs VALUES (p_who, 'mer',
      pg_temp.sig($q$EXISTS (SELECT 1 FROM jsonb_array_elements(public.obtener_miembros_en_riesgo(':aid')) e WHERE e->>'grupo_id' = ':gid')$q$, p_uid, p_aid));
  END IF;

  -- Dashboard.
  BEGIN
    v_dash := public.obtener_datos_dashboard(p_aid);
  EXCEPTION WHEN OTHERS THEN
    v_dash := jsonb_build_object('error', 'ERR ' || SQLSTATE || ' ' || SQLERRM);
  END;
  v_n := coalesce(v_dash->'widgets'->'kpis_globales'->'grupos_activos'->>'valor',
                  v_dash->'widgets'->'kpis_alcance'->'grupos_activos'->>'valor',
                  v_dash->>'error', 'none');
  IF p_kind = 'super' AND v_n = v_all_active::text THEN v_n := 'ALL'; END IF;
  INSERT INTO t_tb_obs VALUES (p_who, 'dsh_n', v_n);

  IF p_kind = 'dg' THEN
    INSERT INTO t_tb_obs VALUES
      (p_who, 'dsh_m', coalesce(v_dash->'widgets'->'kpis_globales'->'total_miembros'->>'valor', 'none')),
      (p_who, 'dsh_a', coalesce(v_dash->'widgets'->'kpis_globales'->'asistencia_semanal'->>'valor', 'none')),
      (p_who, 'dsh_r', pg_temp.letters(ARRAY(SELECT e->>'id' FROM jsonb_array_elements(v_dash->'widgets'->'grupos_en_riesgo') e))),
      (p_who, 'dsh_d', coalesce((SELECT string_agg(replace(e->>'nombre', 'ZZ Tb ', '') || '=' || (e->>'total_miembros'), ',' ORDER BY e->>'nombre')
                                   FROM jsonb_array_elements(v_dash->'widgets'->'distribucion_segmentos') e
                                  WHERE e->>'nombre' LIKE 'ZZ Tb S%'), ''));
  ELSE
    INSERT INTO t_tb_obs VALUES (p_who, 'dsh_m', 'skip'), (p_who, 'dsh_a', 'skip'), (p_who, 'dsh_r', 'skip'), (p_who, 'dsh_d', 'skip');
  END IF;

  -- Risk dashboard.
  BEGIN
    v_rsk := public.obtener_dashboard_riesgo(p_aid, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_rsk := jsonb_build_object('error', 'ERR ' || SQLSTATE || ' ' || SQLERRM);
  END;
  v_n := coalesce(v_rsk->>'total_grupos', v_rsk->>'error', 'none');
  IF p_kind = 'super' AND v_n = (SELECT count(*) FROM public.grupos WHERE activo)::text THEN v_n := 'ALL'; END IF;
  INSERT INTO t_tb_obs VALUES (p_who, 'rsk_n', v_n);
  IF p_kind IN ('dg', 'de') THEN
    INSERT INTO t_tb_obs VALUES (p_who, 'rsk_sin',
      pg_temp.letters(ARRAY(SELECT e->>'grupo_id' FROM jsonb_array_elements(v_rsk->'grupos_sin_reunion_detalle') e)));
  ELSE
    INSERT INTO t_tb_obs VALUES (p_who, 'rsk_sin', 'skip');
  END IF;

  -- KPIs (campus overload).
  BEGIN
    SELECT k.total_grupos INTO v_kpi FROM public.obtener_kpis_grupos_para_usuario(p_aid, NULL) k;
    IF v_kpi = (SELECT count(*) FROM public.v_grupos_supervisiones) THEN
      v_n := 'ALL';
    ELSE
      v_n := v_kpi::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_n := 'ERR ' || SQLSTATE || ' ' || SQLERRM;
  END;
  INSERT INTO t_tb_obs VALUES (p_who, 'kpi', v_n);
END;
$$;

-- Fixtures (as postgres) -------------------------------------------------------
INSERT INTO public.segmentos (id, nombre) VALUES
  ('d3000000-0000-4000-8000-0000000000a1', 'ZZ Tb SA'),
  ('d3000000-0000-4000-8000-0000000000a2', 'ZZ Tb SB'),
  ('d3000000-0000-4000-8000-0000000000a3', 'ZZ Tb SC');

-- People with an account: the six personas and the seven primary members.
INSERT INTO auth.users (id, email) VALUES
  ('d3000000-0000-4000-8000-000000000101', 'zz-tb-dg-a@example.invalid'),
  ('d3000000-0000-4000-8000-000000000102', 'zz-tb-dg-empty@example.invalid'),
  ('d3000000-0000-4000-8000-000000000104', 'zz-tb-admin@example.invalid'),
  ('d3000000-0000-4000-8000-000000000105', 'zz-tb-pastor@example.invalid'),
  ('d3000000-0000-4000-8000-000000000106', 'zz-tb-leader@example.invalid'),
  ('d3000000-0000-4000-8000-000000000107', 'zz-tb-member@example.invalid'),
  ('d3000000-0000-4000-8000-000000000112', 'zz-tb-dir-etapa@example.invalid'),
  ('d3000000-0000-4000-8000-000000000121', 'zz-tb-m-ga1@example.invalid'),
  ('d3000000-0000-4000-8000-000000000122', 'zz-tb-m-ga2@example.invalid'),
  ('d3000000-0000-4000-8000-000000000123', 'zz-tb-m-gb1@example.invalid'),
  ('d3000000-0000-4000-8000-000000000124', 'zz-tb-m-gb2@example.invalid'),
  ('d3000000-0000-4000-8000-000000000125', 'zz-tb-m-gb3@example.invalid'),
  ('d3000000-0000-4000-8000-000000000126', 'zz-tb-m-gb4@example.invalid'),
  ('d3000000-0000-4000-8000-000000000127', 'zz-tb-m-gc1@example.invalid');

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000101', 'ZZ Tb', 'DG a',     'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000102', 'ZZ Tb', 'DG vacio', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000104', 'ZZ Tb', 'Admin',    'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000105', 'ZZ Tb', 'Pastor',   'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000006', 'd3000000-0000-4000-8000-000000000106', 'ZZ Tb', 'Lider',    'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000007', 'd3000000-0000-4000-8000-000000000107', 'ZZ Tb', 'Miembro',  'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000011', NULL, 'ZZ Tb', 'Dir DA',  'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000112', 'ZZ Tb', 'Dir DB1', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000013', NULL, 'ZZ Tb', 'Dir DB2', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000014', NULL, 'ZZ Tb', 'Dir DX',  'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000121', 'ZZ Tb', 'M GA1', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-000000000122', 'ZZ Tb', 'M GA2', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-000000000123', 'ZZ Tb', 'M GB1', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000024', 'd3000000-0000-4000-8000-000000000124', 'ZZ Tb', 'M GB2', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000025', 'd3000000-0000-4000-8000-000000000125', 'ZZ Tb', 'M GB3', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000026', 'd3000000-0000-4000-8000-000000000126', 'ZZ Tb', 'M GB4', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000027', 'd3000000-0000-4000-8000-000000000127', 'ZZ Tb', 'M GC1', 'Otro', 'Soltero'),
  -- absent members of GA1, GB1 and GB2 (no account)
  ('d3000000-0000-4000-8000-000000000031', NULL, 'ZZ Tb', 'M GA1 ausente', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000032', NULL, 'ZZ Tb', 'M GB1 ausente', 'Otro', 'Soltero'),
  ('d3000000-0000-4000-8000-000000000033', NULL, 'ZZ Tb', 'M GB2 ausente', 'Otro', 'Soltero');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT r.u, rs.id
FROM (VALUES
  ('d3000000-0000-4000-8000-000000000001'::uuid, 'director-general'),
  ('d3000000-0000-4000-8000-000000000002'::uuid, 'director-general'),
  ('d3000000-0000-4000-8000-000000000004'::uuid, 'admin'),
  ('d3000000-0000-4000-8000-000000000005'::uuid, 'pastor'),
  ('d3000000-0000-4000-8000-000000000006'::uuid, 'lider'),
  ('d3000000-0000-4000-8000-000000000012'::uuid, 'director-etapa')
) r(u, rol)
JOIN public.roles_sistema rs ON rs.nombre_interno = r.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('d3000000-0000-4000-8000-0000000000b1', 'd3000000-0000-4000-8000-0000000000a1', 'd3000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('d3000000-0000-4000-8000-0000000000b2', 'd3000000-0000-4000-8000-0000000000a2', 'd3000000-0000-4000-8000-000000000012', 'director_etapa'),
  ('d3000000-0000-4000-8000-0000000000b3', 'd3000000-0000-4000-8000-0000000000a2', 'd3000000-0000-4000-8000-000000000013', 'director_etapa'),
  ('d3000000-0000-4000-8000-0000000000b4', 'd3000000-0000-4000-8000-0000000000a3', 'd3000000-0000-4000-8000-000000000014', 'director_etapa');

-- The test's own season, active today.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('d3000000-0000-4000-8000-0000000000e1', 'ZZ Tb Temporada', CURRENT_DATE - 30, CURRENT_DATE + 300, true, 'activa');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id)
SELECT g.id, g.nombre, 'd3000000-0000-4000-8000-0000000000e1'::uuid, g.segmento_id
FROM (VALUES
  ('d3000000-0000-4000-8000-0000000000c1'::uuid, 'ZZ Tb GA1', 'd3000000-0000-4000-8000-0000000000a1'::uuid),
  ('d3000000-0000-4000-8000-0000000000c2'::uuid, 'ZZ Tb GA2', 'd3000000-0000-4000-8000-0000000000a1'::uuid),
  ('d3000000-0000-4000-8000-0000000000c3'::uuid, 'ZZ Tb GB1', 'd3000000-0000-4000-8000-0000000000a2'::uuid),
  ('d3000000-0000-4000-8000-0000000000c4'::uuid, 'ZZ Tb GB2', 'd3000000-0000-4000-8000-0000000000a2'::uuid),
  ('d3000000-0000-4000-8000-0000000000c5'::uuid, 'ZZ Tb GB3', 'd3000000-0000-4000-8000-0000000000a2'::uuid),
  ('d3000000-0000-4000-8000-0000000000c6'::uuid, 'ZZ Tb GB4', 'd3000000-0000-4000-8000-0000000000a2'::uuid),
  ('d3000000-0000-4000-8000-0000000000c7'::uuid, 'ZZ Tb GC1', 'd3000000-0000-4000-8000-0000000000a3'::uuid)
) g(id, nombre, segmento_id);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('d3000000-0000-4000-8000-0000000000b1', 'd3000000-0000-4000-8000-0000000000c1'),
  ('d3000000-0000-4000-8000-0000000000b2', 'd3000000-0000-4000-8000-0000000000c3'),
  ('d3000000-0000-4000-8000-0000000000b3', 'd3000000-0000-4000-8000-0000000000c4'),
  ('d3000000-0000-4000-8000-0000000000b4', 'd3000000-0000-4000-8000-0000000000c6'),
  ('d3000000-0000-4000-8000-0000000000b4', 'd3000000-0000-4000-8000-0000000000c7');

-- Primary member of each group, plus the absent members, the leader (GA2, GB2) and
-- the member persona (GB2, GC1).
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol) VALUES
  ('d3000000-0000-4000-8000-0000000000c1', 'd3000000-0000-4000-8000-000000000021', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c2', 'd3000000-0000-4000-8000-000000000022', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c3', 'd3000000-0000-4000-8000-000000000023', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c4', 'd3000000-0000-4000-8000-000000000024', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c5', 'd3000000-0000-4000-8000-000000000025', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c6', 'd3000000-0000-4000-8000-000000000026', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c7', 'd3000000-0000-4000-8000-000000000027', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c1', 'd3000000-0000-4000-8000-000000000031', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c3', 'd3000000-0000-4000-8000-000000000032', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c4', 'd3000000-0000-4000-8000-000000000033', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c2', 'd3000000-0000-4000-8000-000000000006', 'Líder'),
  ('d3000000-0000-4000-8000-0000000000c4', 'd3000000-0000-4000-8000-000000000006', 'Líder'),
  ('d3000000-0000-4000-8000-0000000000c4', 'd3000000-0000-4000-8000-000000000007', 'Miembro'),
  ('d3000000-0000-4000-8000-0000000000c7', 'd3000000-0000-4000-8000-000000000007', 'Miembro');

-- A casa for each primary member.
INSERT INTO public.casas_anfitrionas (id, usuario_id, nombre_lugar, activa, aprobada) VALUES
  ('d3000000-0000-4000-8000-0000000000f1', 'd3000000-0000-4000-8000-000000000021', 'ZZ Tb casa GA1', true, true),
  ('d3000000-0000-4000-8000-0000000000f2', 'd3000000-0000-4000-8000-000000000022', 'ZZ Tb casa GA2', true, true),
  ('d3000000-0000-4000-8000-0000000000f3', 'd3000000-0000-4000-8000-000000000023', 'ZZ Tb casa GB1', true, true),
  ('d3000000-0000-4000-8000-0000000000f4', 'd3000000-0000-4000-8000-000000000024', 'ZZ Tb casa GB2', true, true),
  ('d3000000-0000-4000-8000-0000000000f5', 'd3000000-0000-4000-8000-000000000025', 'ZZ Tb casa GB3', true, true),
  ('d3000000-0000-4000-8000-0000000000f6', 'd3000000-0000-4000-8000-000000000026', 'ZZ Tb casa GB4', true, true),
  ('d3000000-0000-4000-8000-0000000000f7', 'd3000000-0000-4000-8000-000000000027', 'ZZ Tb casa GC1', true, true);

INSERT INTO t_tb_map (nombre, gid, mid, cid) VALUES
  ('ZZ Tb GA1', 'd3000000-0000-4000-8000-0000000000c1', 'd3000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-0000000000f1'),
  ('ZZ Tb GA2', 'd3000000-0000-4000-8000-0000000000c2', 'd3000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-0000000000f2'),
  ('ZZ Tb GB1', 'd3000000-0000-4000-8000-0000000000c3', 'd3000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-0000000000f3'),
  ('ZZ Tb GB2', 'd3000000-0000-4000-8000-0000000000c4', 'd3000000-0000-4000-8000-000000000024', 'd3000000-0000-4000-8000-0000000000f4'),
  ('ZZ Tb GB3', 'd3000000-0000-4000-8000-0000000000c5', 'd3000000-0000-4000-8000-000000000025', 'd3000000-0000-4000-8000-0000000000f5'),
  ('ZZ Tb GB4', 'd3000000-0000-4000-8000-0000000000c6', 'd3000000-0000-4000-8000-000000000026', 'd3000000-0000-4000-8000-0000000000f6'),
  ('ZZ Tb GC1', 'd3000000-0000-4000-8000-0000000000c7', 'd3000000-0000-4000-8000-000000000027', 'd3000000-0000-4000-8000-0000000000f7');

-- An attendance event today in GA1, GB1 and GB2: one present and one absent member.
INSERT INTO public.eventos_grupo (id, grupo_id, fecha) VALUES
  ('d3000000-0000-4000-8000-0000000000d1', 'd3000000-0000-4000-8000-0000000000c1', CURRENT_DATE),
  ('d3000000-0000-4000-8000-0000000000d2', 'd3000000-0000-4000-8000-0000000000c3', CURRENT_DATE),
  ('d3000000-0000-4000-8000-0000000000d3', 'd3000000-0000-4000-8000-0000000000c4', CURRENT_DATE);

INSERT INTO public.asistencia (evento_grupo_id, usuario_id, presente, tipo_presencia) VALUES
  ('d3000000-0000-4000-8000-0000000000d1', 'd3000000-0000-4000-8000-000000000021', true,  'presente'),
  ('d3000000-0000-4000-8000-0000000000d1', 'd3000000-0000-4000-8000-000000000031', false, 'ausente'),
  ('d3000000-0000-4000-8000-0000000000d2', 'd3000000-0000-4000-8000-000000000023', true,  'presente'),
  ('d3000000-0000-4000-8000-0000000000d2', 'd3000000-0000-4000-8000-000000000032', false, 'ausente'),
  ('d3000000-0000-4000-8000-0000000000d3', 'd3000000-0000-4000-8000-000000000024', true,  'presente'),
  ('d3000000-0000-4000-8000-0000000000d3', 'd3000000-0000-4000-8000-000000000033', false, 'ausente');

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-0000000000a1', 'segmento'),
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-0000000000a2', 'directores');

INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-0000000000b1'),
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-0000000000b2'),
  ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-0000000000b4');

-- Observations -----------------------------------------------------------------
SELECT pg_temp.observe('dg_a',      'dg',    'd3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000101');
SELECT pg_temp.observe('dg_empty',  'dg',    'd3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000102');
SELECT pg_temp.observe('admin',     'super', 'd3000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000104');
SELECT pg_temp.observe('pastor',    'super', 'd3000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000105');
SELECT pg_temp.observe('dir_etapa', 'de',    'd3000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000112');
SELECT pg_temp.observe('leader',    'other', 'd3000000-0000-4000-8000-000000000006', 'd3000000-0000-4000-8000-000000000106');
SELECT pg_temp.observe('member',    'other', 'd3000000-0000-4000-8000-000000000007', 'd3000000-0000-4000-8000-000000000107');

-- Flip both scopes for the same person and observe again.
UPDATE public.director_general_segmentos SET alcance = 'directores'
 WHERE usuario_id = 'd3000000-0000-4000-8000-000000000001' AND segmento_id = 'd3000000-0000-4000-8000-0000000000a1';
UPDATE public.director_general_segmentos SET alcance = 'segmento'
 WHERE usuario_id = 'd3000000-0000-4000-8000-000000000001' AND segmento_id = 'd3000000-0000-4000-8000-0000000000a2';
SELECT pg_temp.observe('dg_b',      'dg',    'd3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000101');

-- Expectations -----------------------------------------------------------------
CREATE TEMP TABLE t_tb_expected (who text, fn text, sig text) ON COMMIT DROP;
INSERT INTO t_tb_expected VALUES
  -- director general, scope segmento in SA and directores in SB: GA1 GA2 GB1
  ('dg_a', 'cvg', 'TTTFFFF'), ('dg_a', 'pcc', 'TTTFFFF'), ('dg_a', 'cvi', 'TTTFFFF'),
  ('dg_a', 'lup', 'TTTFFFF'), ('dg_a', 'gpm', 'TTTFFFF'), ('dg_a', 'mer', 'TTTFFFF'),
  ('dg_a', 'dsh_n', '3'), ('dg_a', 'dsh_m', '6'), ('dg_a', 'dsh_a', '33.3'),
  ('dg_a', 'dsh_r', 'TFTFFFF'), ('dg_a', 'dsh_d', 'SA=4,SB=2'),
  ('dg_a', 'rsk_n', '3'), ('dg_a', 'rsk_sin', 'FTFFFFF'), ('dg_a', 'kpi', '3'),
  -- the same person with the scopes flipped: GA1 GB1 GB2 GB3 GB4
  ('dg_b', 'cvg', 'TFTTTTF'), ('dg_b', 'pcc', 'TFTTTTF'), ('dg_b', 'cvi', 'TFTTTTF'),
  ('dg_b', 'lup', 'TFTTTTF'), ('dg_b', 'gpm', 'TFTTTTF'), ('dg_b', 'mer', 'TFTTTTF'),
  ('dg_b', 'dsh_n', '5'), ('dg_b', 'dsh_m', '10'), ('dg_b', 'dsh_a', '30.0'),
  ('dg_b', 'dsh_r', 'TFTTFFF'), ('dg_b', 'dsh_d', 'SA=2,SB=8'),
  ('dg_b', 'rsk_n', '5'), ('dg_b', 'rsk_sin', 'FFFFTTF'), ('dg_b', 'kpi', '5'),
  -- director general with no rows
  ('dg_empty', 'cvg', 'FFFFFFF'), ('dg_empty', 'pcc', 'FFFFFFF'), ('dg_empty', 'cvi', 'FFFFFFF'),
  ('dg_empty', 'lup', 'FFFFFFF'), ('dg_empty', 'gpm', 'FFFFFFF'), ('dg_empty', 'mer', 'FFFFFFF'),
  ('dg_empty', 'dsh_n', '0'), ('dg_empty', 'dsh_m', '0'), ('dg_empty', 'dsh_a', '0'),
  ('dg_empty', 'dsh_r', 'FFFFFFF'), ('dg_empty', 'dsh_d', ''),
  ('dg_empty', 'rsk_n', '0'), ('dg_empty', 'rsk_sin', 'FFFFFFF'), ('dg_empty', 'kpi', '0'),
  -- answers of the ORIGINAL functions for the same fixtures (captured before the change)
  ('admin', 'cvg', 'FFFFFFF'), ('admin', 'cvi', 'TTTTTTT'), ('admin', 'pcc', 'TTTTTTT'), ('admin', 'lup', 'TTTTTTT'),
  ('admin', 'gpm', 'TTTTTTT'), ('admin', 'dsh_n', 'ALL'), ('admin', 'rsk_n', 'ALL'), ('admin', 'kpi', 'ALL'),
  ('pastor', 'cvg', 'FFFFFFF'), ('pastor', 'cvi', 'TTTTTTT'), ('pastor', 'pcc', 'TTTTTTT'), ('pastor', 'lup', 'TTTTTTT'),
  ('pastor', 'gpm', 'TTTTTTT'), ('pastor', 'dsh_n', 'ALL'), ('pastor', 'rsk_n', 'ALL'), ('pastor', 'kpi', 'ALL'),
  ('dir_etapa', 'cvg', 'FFFFFFF'), ('dir_etapa', 'cvi', 'FFTTTTF'), ('dir_etapa', 'pcc', 'FFTFFFF'), ('dir_etapa', 'lup', 'FFTFFFF'),
  -- get_personas_under_me compares director_etapa_grupos.director_etapa_id (a segmento_lideres.id)
  -- with a usuarios.id, so a director de etapa gets nobody: kept as it was (not part of this change)
  ('dir_etapa', 'gpm', 'FFFFFFF'), ('dir_etapa', 'mer', 'FFTFFFF'), ('dir_etapa', 'dsh_n', '1'),
  ('dir_etapa', 'rsk_n', '1'), ('dir_etapa', 'rsk_sin', 'FFFFFFF'), ('dir_etapa', 'kpi', '1'),
  ('leader', 'cvg', 'FFFFFFF'), ('leader', 'cvi', 'FTFTFFF'), ('leader', 'pcc', 'FTFTFFF'), ('leader', 'lup', 'FTFTFFF'),
  ('leader', 'gpm', 'FTFTFFF'), ('leader', 'mer', 'ERR P0001 Sin permisos para acceder a este recurso'),
  ('leader', 'dsh_n', 'none'), ('leader', 'rsk_n', 'Sin permisos'), ('leader', 'kpi', '2'),
  ('member', 'cvg', 'FFFFFFF'), ('member', 'cvi', 'FFFFFFF'), ('member', 'pcc', 'FFFFFFF'), ('member', 'lup', 'FFFFFFF'),
  ('member', 'gpm', 'FFFFFFF'), ('member', 'mer', 'ERR P0001 Sin permisos para acceder a este recurso'),
  ('member', 'dsh_n', 'none'), ('member', 'rsk_n', 'Sin permisos'), ('member', 'kpi', '0');

SELECT count(*) AS failing_cases,
       coalesce(string_agg(x.who || '.' || x.fn || ': expected ' || x.sig || ', got ' || coalesce(o.sig, 'MISSING'), E'\n' ORDER BY x.who, x.fn), 'all cases ok') AS detail
  FROM t_tb_expected x
  LEFT JOIN t_tb_obs o ON o.who = x.who AND o.fn = x.fn
 WHERE o.sig IS DISTINCT FROM x.sig;

ROLLBACK;
