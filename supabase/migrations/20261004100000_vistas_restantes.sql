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
--     shows "Sin permisos" to a leader. A director de etapa is not yet
--     group-scoped in the two solicitudes readers (owner decision pending).
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
