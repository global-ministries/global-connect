-- Remaining views, migration 20261004100000: v_salud_miembros_grupo,
-- v_solicitudes_pendientes and v_historial_miembro close to signed-in
-- sessions; v_mapa_grupos_vida stays open.
--
-- Covers, once before and once after the migration block, the count of each
-- of the four views as the admin, the general director, the director de etapa,
-- the leader and a plain member (own session, role authenticated) and as
-- service_role (the path the server actions now use):
--   a. The three closed views: a count before for every identity, 42501 after
--      for every authenticated identity; service_role returns the same count.
--   b. v_mapa_grupos_vida: same count before and after for everyone.
--   c. The actions' group scope: authenticated can execute puede_ver_grupo.
--
-- The migration is copied byte for byte between the two marker comments below.
-- Run against STAGING inside BEGIN...ROLLBACK. The last statement returns the
-- failing cases (kind 'failure', none expected), then the summary rows.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_vr_failures (case_name text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_vr_ident (label text, auth_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE t_vr_view (phase text, label text, view_name text, result text) ON COMMIT DROP;

INSERT INTO t_vr_ident VALUES
  ('admin',   '5df3b990-af3d-49b5-a061-025bc3598983'::uuid),
  ('dg',      '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid),
  ('de',      'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid),
  ('lider',   '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid),
  ('miembro', '372eac6c-b598-463e-ad9f-0be5c4ae7032'::uuid),
  ('service', NULL);

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_vr_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.probe(p_phase text, p_label text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_view text;
  v_n bigint;
  v_res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
          set_config('request.jwt.claim.role', CASE WHEN p_auth IS NULL THEN 'service_role' ELSE '' END, true),
          set_config('request.jwt.claims',
                     CASE WHEN p_auth IS NULL THEN '{"role":"service_role"}'
                          ELSE json_build_object('sub', p_auth, 'role', 'authenticated')::text END, true);
  IF p_auth IS NULL THEN SET LOCAL ROLE service_role; ELSE SET LOCAL ROLE authenticated; END IF;
  FOREACH v_view IN ARRAY ARRAY['v_salud_miembros_grupo', 'v_solicitudes_pendientes',
                                'v_historial_miembro', 'v_mapa_grupos_vida'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
      v_res := v_n::text;
    EXCEPTION WHEN insufficient_privilege THEN
      v_res := '42501';
    END;
    INSERT INTO t_vr_view VALUES (p_phase, p_label, v_view, v_res);
  END LOOP;
  RESET ROLE;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA pg_temp TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

SELECT pg_temp.probe('before', label, auth_id) FROM t_vr_ident;

-- migration begin
-- Closes three of the four views batch L6 left open (security phase 3, batch
-- L6b). Owner decisions of 2026-10-04:
--
--   v_salud_miembros_grupo, v_solicitudes_pendientes, v_historial_miembro
--     anon and authenticated lose every privilege. The views run as their
--     owner and do not read the session, so a grant was the only gate. The app
--     now reads them with the service client, after checking that the caller
--     is admin, pastor, director-general or director-etapa:
--     lib/actions/asistencia-avanzada.actions.ts (obtenerSaludMiembrosGrupo,
--     also scoped by puede_ver_grupo; obtenerMiembrosEnRiesgo, scoped to the
--     DG rule or the director de etapa's groups) and
--     lib/actions/solicitudes-grupo.actions.ts (listarSolicitudesPendientes,
--     obtenerHistorialMiembro). app/(auth)/grupos-vida/[id]/salud/page.tsx
--     shows "Sin permisos" to a leader.
--   v_mapa_grupos_vida stays readable by authenticated: every leader keeps
--     their people up to date so they appear on the map.
--
-- Consequence of 20261003190000 (obtener_conyugue), recorded here: the
-- leader-pair picker (components/grupos-vida/lider-pareja-selector.tsx) calls
-- obtener_conyugue with the session client, so a leader no longer gets the
-- spouse of somebody outside their own groups; directors (etapa and general),
-- pastor and admin are unchanged.

REVOKE ALL ON public.v_salud_miembros_grupo FROM anon, authenticated;
REVOKE ALL ON public.v_solicitudes_pendientes FROM anon, authenticated;
REVOKE ALL ON public.v_historial_miembro FROM anon, authenticated;
-- migration end

SELECT pg_temp.probe('after', label, auth_id) FROM t_vr_ident;

DO $$
DECLARE
  r record;
BEGIN
  IF (SELECT count(*) FROM t_vr_view) <> 48 THEN
    PERFORM pg_temp.fail('setup', 'probes: ' || (SELECT count(*) FROM t_vr_view));
  END IF;
  FOR r IN SELECT a.label, a.view_name, a.result, b.result AS before_result
             FROM t_vr_view a
             JOIN t_vr_view b ON b.phase = 'before' AND b.label = a.label AND b.view_name = a.view_name
            WHERE a.phase = 'after' LOOP
    IF r.view_name <> 'v_mapa_grupos_vida' AND r.label <> 'service' THEN
      IF NOT coalesce(r.result = '42501', false) THEN
        PERFORM pg_temp.fail('a.closed', r.label || '/' || r.view_name || ' got ' || r.result);
      END IF;
    ELSIF NOT coalesce(r.result = r.before_result AND r.result <> '42501', false) THEN
      PERFORM pg_temp.fail('b.unchanged', r.label || '/' || r.view_name || ' ' || r.before_result || ' -> ' || r.result);
    END IF;
  END LOOP;
  IF NOT coalesce(has_function_privilege('authenticated', 'public.puede_ver_grupo(uuid,uuid)', 'EXECUTE'), false) THEN
    PERFORM pg_temp.fail('c.scope', 'authenticated cannot execute puede_ver_grupo');
  END IF;
END;
$$;

SELECT kind, case_name, detail FROM (
  SELECT 1 o, 'failure' kind, case_name, detail FROM t_vr_failures
  UNION ALL
  SELECT 2, 'views', label, phase || ' ' || string_agg(view_name || '=' || result, ' ' ORDER BY view_name)
    FROM t_vr_view GROUP BY label, phase
) s ORDER BY o, case_name, detail;

ROLLBACK;
