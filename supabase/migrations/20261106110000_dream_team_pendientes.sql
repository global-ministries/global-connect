-- Dream Team: "Pendientes" of a director, read-only (T3 of
-- odd/tasks/dream-team-pendientes-director.md, S4, S5, S7).
--
-- Why: a director wants one place with everything still missing in their
-- team: áreas without servidores, incomplete fichas, accounts, stages, shifts
-- and cambio-de-área requests, each with its action. Today those numbers are
-- spread over Servidores and Mi equipo, and nothing lists the fichas.
--
-- Scope (S5): the active equipos the caller reads in Mi equipo, in one pass:
-- the subtrees of their active dream_team.org.manage, director.coordinate,
-- direct, coordinate or metrics.read grants (scope_id NULL = every equipo;
-- same inheritance as auth_has_dream_team_capability_in_tree), plus
-- dream_team_equipos_registrables() (admin, pastor, the Atención al
-- Voluntario coordinator: the read policies of 20261008110000). People are
-- those with a non-retired servicio there. Talleres, lead and serve
-- capabilities, which RLS also honors, do not open Mi equipo as a team
-- authority and are left out; Grupos de Vida leaders are not servicios.
--
-- What:
--   1. public.dream_team_pendientes_filas() (internal, not executable by
--      authenticated): every alert row of the caller's scope plus two marker
--      tipos the summary counts ('persona': one per person in scope; 'area':
--      one per área considered). Alert tipos (S4), same definitions as
--      Servidores / Mi equipo so the numbers match:
--        area_sin_servidores  an active leaf equipo (no active child: a node
--                             with active sub-áreas only groups them) outside
--                             Grupos de Vida with no servicio in 'activo';
--                             detalle {por_activar: n}.
--        sin_cedula, sin_telefono   NULL or blank.
--        fecha_nacimiento     detalle {motivo}: falta, futura (after
--                             current_date), marcador_1900 (the signup
--                             placeholder 1900-01-01), anterior_1910.
--        genero_estado_civil  'No especificado'; detalle {campos}. Today only
--                             estado civil has that value (enum_genero is
--                             Masculino, Femenino, Otro).
--        sin_cuenta           usuarios.auth_id NULL (Servidores' "Sin cuenta");
--                             invitable = invitacion_cuenta_puede_invitar and,
--                             only then, detalle {invitacion}: the latest
--                             invitation 'enviada' over 24 h = vencida,
--                             'enviada' = enviada, else sin_invitar
--                             (VENCE_INVITACION_MS, estadoCuentaDe).
--        invitacion_vencida   the vencida ones; desde = when it was sent.
--        por_activar          per servicio in postulado / en_orientacion;
--                             desde = entering that estado (history), else
--                             fecha_inicio.
--        sin_turno            per servicio without a dream_team_servicio_turnos
--                             row (coincideTurno SIN_TURNO).
--        solicitud_cambio_area  the pending requests the caller can resolve
--                             (dream_team_solicitudes_cambio_area().puede_resolver).
--      Person-level rows show the person's first equipo in scope by path.
--      No cédula, phone, email or birth date leaves: only that it is missing.
--   2. public.dream_team_pendientes(p_tipo text DEFAULT NULL): the alert rows
--      (one tipo, or all), with ficha_editable (dream_team_puede_editar_ficha)
--      on person-level rows, ordered as the screen reads them. Unknown tipo:
--      22023 tipo_desconocido.
--   3. public.dream_team_pendientes_resumen(): one row of counts (people, not
--      rows, except áreas and solicitudes), urgentes = áreas sin servidores +
--      solicitudes + invitaciones vencidas, personas_en_orden = people in
--      scope with no person-level alert, porcentaje = round(100 * en orden /
--      personas), NULL without people (S7).
--
-- Cost: one recursive pass over dream_team_equipos and one over the scope's
-- servicios. Per-person definer checks only where unavoidable:
-- invitacion_cuenta_puede_invitar for people without account (both RPCs) and
-- dream_team_puede_editar_ficha for people with a person-level alert (rows
-- only); dream_team_solicitudes_cambio_area() checks each pending request.
--
-- Blast radius: three new read-only functions. No table, policy or existing
-- function changes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dream_team_pendientes_resumen();
--   DROP FUNCTION IF EXISTS public.dream_team_pendientes(text);
--   DROP FUNCTION IF EXISTS public.dream_team_pendientes_filas();

CREATE OR REPLACE FUNCTION public.dream_team_pendientes_filas()
RETURNS TABLE (
  tipo             text,
  persona_id       uuid,
  persona_nombre   text,
  equipo_id        uuid,
  equipo_ruta      text,
  servicio_id      uuid,
  servicio_estado  text,
  servicio_version integer,
  tiene_cuenta     boolean,
  tiene_correo     boolean,
  invitable        boolean,
  desde            timestamptz,
  detalle          jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH RECURSIVE
  actor AS (
    SELECT u.id FROM public.usuarios u WHERE auth.uid() IS NOT NULL AND u.auth_id = auth.uid()
  ),
  grants AS MATERIALIZED (
    SELECT g.scope_id
      FROM public.dream_team_capability_grants g
     WHERE g.persona_id = (SELECT a.id FROM actor a)
       AND g.revoked_at IS NULL
       AND g.capability_key IN ('dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
                                'dream_team.coordinate', 'dream_team.metrics.read')
  ),
  -- Every equipo with its path from the root and whether a grant reaches it.
  arbol AS (
    SELECT e.id, e.label AS ruta,
           EXISTS (SELECT 1 FROM grants g WHERE g.scope_id IS NULL OR g.scope_id = e.id::text) AS alcanza,
           0 AS profundidad
      FROM public.dream_team_equipos e
     WHERE e.parent_equipo_id IS NULL
    UNION ALL
    SELECT h.id, a.ruta || ' › ' || h.label,
           a.alcanza OR EXISTS (SELECT 1 FROM grants g WHERE g.scope_id = h.id::text),
           a.profundidad + 1
      FROM public.dream_team_equipos h
      JOIN arbol a ON h.parent_equipo_id = a.id
     WHERE a.profundidad < 16
  ),
  equipos AS MATERIALIZED (
    SELECT e.id, a.ruta, e.experiencia,
           NOT EXISTS (SELECT 1 FROM public.dream_team_equipos c WHERE c.parent_equipo_id = e.id AND c.activo) AS hoja
      FROM arbol a
      JOIN public.dream_team_equipos e ON e.id = a.id
     WHERE e.activo
       AND (a.alcanza OR e.id IN (SELECT r.equipo_id FROM public.dream_team_equipos_registrables() r))
  ),
  servicios AS MATERIALIZED (
    SELECT s.id, s.persona_id, s.equipo_id, s.estado, s.version, s.fecha_inicio, q.ruta
      FROM public.dream_team_servicios s
      JOIN equipos q ON q.id = s.equipo_id
     WHERE s.estado <> 'retirado'
  ),
  personas AS MATERIALIZED (
    SELECT DISTINCT ON (s.persona_id)
           s.persona_id, s.equipo_id, s.ruta,
           concat_ws(' ', u.nombre, u.apellido) AS nombre,
           u.auth_id IS NOT NULL AS tiene_cuenta,
           nullif(btrim(coalesce(u.email, '')), '') IS NOT NULL AS tiene_correo,
           nullif(btrim(coalesce(u.cedula, '')), '') IS NULL AS sin_cedula,
           nullif(btrim(coalesce(u.telefono, '')), '') IS NULL AS sin_telefono,
           CASE WHEN u.fecha_nacimiento IS NULL THEN 'falta'
                WHEN u.fecha_nacimiento > current_date THEN 'futura'
                WHEN u.fecha_nacimiento = DATE '1900-01-01' THEN 'marcador_1900'
                WHEN u.fecha_nacimiento < DATE '1910-01-01' THEN 'anterior_1910'
           END AS fecha,
           array_remove(ARRAY[CASE WHEN u.genero::text = 'No especificado' THEN 'genero' END,
                              CASE WHEN u.estado_civil::text = 'No especificado' THEN 'estado_civil' END], NULL) AS no_especificado
      FROM servicios s
      JOIN public.usuarios u ON u.id = s.persona_id
     ORDER BY s.persona_id, s.ruta, s.id
  ),
  -- The invite check runs once per person without account, never for the rest.
  sin_cuenta AS MATERIALIZED (
    SELECT p.persona_id, public.invitacion_cuenta_puede_invitar(p.persona_id) AS invitable
      FROM personas p
     WHERE NOT p.tiene_cuenta
  ),
  cuentas AS MATERIALIZED (
    SELECT c.persona_id, c.invitable, i.created_at AS enviada_at,
           CASE WHEN NOT c.invitable THEN NULL
                WHEN i.estado = 'enviada' AND i.created_at < now() - interval '24 hours' THEN 'vencida'
                WHEN i.estado = 'enviada' THEN 'enviada'
                ELSE 'sin_invitar'
           END AS invitacion
      FROM sin_cuenta c
      LEFT JOIN LATERAL (SELECT ic.estado, ic.created_at
                           FROM public.invitaciones_cuenta ic
                          WHERE ic.usuario_id = c.persona_id
                          ORDER BY ic.created_at DESC, ic.id DESC
                          LIMIT 1) i ON c.invitable
  ),
  areas AS (
    SELECT q.id, q.ruta FROM equipos q WHERE q.hoja AND q.experiencia <> 'grupos_vida'
  )
  SELECT 'persona'::text, p.persona_id, NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::integer,
         NULL::boolean, NULL::boolean, NULL::boolean, NULL::timestamptz, NULL::jsonb
    FROM personas p
  UNION ALL
  SELECT 'area', NULL, NULL, a.id, a.ruta, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    FROM areas a
  UNION ALL
  SELECT 'area_sin_servidores', NULL, NULL, a.id, a.ruta, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         jsonb_build_object('por_activar', (SELECT count(*) FROM servicios s
                                             WHERE s.equipo_id = a.id AND s.estado IN ('postulado', 'en_orientacion')))
    FROM areas a
   WHERE NOT EXISTS (SELECT 1 FROM servicios s WHERE s.equipo_id = a.id AND s.estado = 'activo')
  UNION ALL
  SELECT 'sin_cedula', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, NULL, NULL, '{}'::jsonb
    FROM personas p WHERE p.sin_cedula
  UNION ALL
  SELECT 'fecha_nacimiento', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, NULL, NULL, jsonb_build_object('motivo', p.fecha)
    FROM personas p WHERE p.fecha IS NOT NULL
  UNION ALL
  SELECT 'sin_telefono', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, NULL, NULL, '{}'::jsonb
    FROM personas p WHERE p.sin_telefono
  UNION ALL
  SELECT 'genero_estado_civil', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, NULL, NULL, jsonb_build_object('campos', to_jsonb(p.no_especificado))
    FROM personas p WHERE cardinality(p.no_especificado) > 0
  UNION ALL
  SELECT 'sin_cuenta', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, c.invitable, NULL, jsonb_build_object('invitacion', c.invitacion)
    FROM personas p JOIN cuentas c ON c.persona_id = p.persona_id
  UNION ALL
  SELECT 'invitacion_vencida', p.persona_id, p.nombre, p.equipo_id, p.ruta, NULL, NULL, NULL,
         p.tiene_cuenta, p.tiene_correo, c.invitable, c.enviada_at, '{}'::jsonb
    FROM personas p JOIN cuentas c ON c.persona_id = p.persona_id
   WHERE c.invitacion = 'vencida'
  UNION ALL
  SELECT 'por_activar', s.persona_id, p.nombre, s.equipo_id, s.ruta, s.id, s.estado::text, s.version,
         NULL, NULL, NULL,
         coalesce((SELECT max(h.fecha) FROM public.dream_team_estados_historial h
                    WHERE h.servicio_id = s.id AND h.estado_nuevo = s.estado), s.fecha_inicio),
         '{}'::jsonb
    FROM servicios s JOIN personas p ON p.persona_id = s.persona_id
   WHERE s.estado IN ('postulado', 'en_orientacion')
  UNION ALL
  SELECT 'sin_turno', s.persona_id, p.nombre, s.equipo_id, s.ruta, s.id, s.estado::text, s.version,
         NULL, NULL, NULL, NULL, '{}'::jsonb
    FROM servicios s JOIN personas p ON p.persona_id = s.persona_id
   WHERE NOT EXISTS (SELECT 1 FROM public.dream_team_servicio_turnos st WHERE st.servicio_id = s.id)
  UNION ALL
  SELECT 'solicitud_cambio_area', r.persona_id, r.persona_nombre, r.equipo_origen_id, r.origen_ruta,
         r.servicio_id, s.estado::text, s.version, NULL, NULL, NULL, r.created_at,
         jsonb_build_object('solicitud_id', r.id, 'destino_ruta', r.destino_ruta, 'rol_destino', r.rol_destino,
                            'motivo', r.motivo, 'nota', r.nota, 'solicitante_nombre', r.solicitante_nombre)
    FROM public.dream_team_solicitudes_cambio_area() r
    JOIN public.dream_team_servicios s ON s.id = r.servicio_id
   WHERE r.puede_resolver;
$function$;

COMMENT ON FUNCTION public.dream_team_pendientes_filas() IS
  'Internal to dream_team_pendientes and dream_team_pendientes_resumen: every alert row of the caller''s '
  'Mi equipo scope plus the marker tipos persona and area the summary counts. Not executable by authenticated.';

REVOKE ALL ON FUNCTION public.dream_team_pendientes_filas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dream_team_pendientes_filas() TO service_role;

CREATE OR REPLACE FUNCTION public.dream_team_pendientes(p_tipo text DEFAULT NULL)
RETURNS TABLE (
  tipo             text,
  persona_id       uuid,
  persona_nombre   text,
  equipo_id        uuid,
  equipo_ruta      text,
  servicio_id      uuid,
  servicio_estado  text,
  servicio_version integer,
  tiene_cuenta     boolean,
  tiene_correo     boolean,
  ficha_editable   boolean,
  invitable        boolean,
  desde            timestamptz,
  detalle          jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_orden constant text[] := ARRAY['area_sin_servidores', 'solicitud_cambio_area', 'invitacion_vencida',
                                   'sin_cedula', 'fecha_nacimiento', 'sin_telefono', 'genero_estado_civil',
                                   'sin_cuenta', 'por_activar', 'sin_turno'];
BEGIN
  IF p_tipo IS NOT NULL AND NOT p_tipo = ANY (v_orden) THEN
    RAISE EXCEPTION 'tipo_desconocido' USING errcode = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH f AS MATERIALIZED (
    SELECT f.*
      FROM public.dream_team_pendientes_filas() f
     WHERE f.tipo = ANY (v_orden)
       AND (p_tipo IS NULL OR f.tipo = p_tipo)
  ),
  editables AS MATERIALIZED (
    SELECT x.persona_id, public.dream_team_puede_editar_ficha(x.persona_id) AS si
      FROM (SELECT DISTINCT f.persona_id
              FROM f
             WHERE f.tipo IN ('sin_cedula', 'fecha_nacimiento', 'sin_telefono', 'genero_estado_civil',
                              'sin_cuenta', 'invitacion_vencida')) x
  )
  SELECT f.tipo, f.persona_id, f.persona_nombre, f.equipo_id, f.equipo_ruta, f.servicio_id, f.servicio_estado,
         f.servicio_version, f.tiene_cuenta, f.tiene_correo, e.si, f.invitable, f.desde, f.detalle
    FROM f
    LEFT JOIN editables e
      ON e.persona_id = f.persona_id
     AND f.tipo IN ('sin_cedula', 'fecha_nacimiento', 'sin_telefono', 'genero_estado_civil',
                    'sin_cuenta', 'invitacion_vencida')
   ORDER BY array_position(v_orden, f.tipo), f.persona_nombre, f.equipo_ruta, f.servicio_id;
END;
$function$;

COMMENT ON FUNCTION public.dream_team_pendientes(text) IS
  'Pendientes of the caller''s Mi equipo scope (S4, S5 of odd/tasks/dream-team-pendientes-director.md): one '
  'row per alert (area_sin_servidores, solicitud_cambio_area, invitacion_vencida, sin_cedula, fecha_nacimiento, '
  'sin_telefono, genero_estado_civil, sin_cuenta, por_activar, sin_turno), or only p_tipo; 22023 '
  'tipo_desconocido otherwise. Never returns cédula, phone, email or birth date values.';

REVOKE ALL ON FUNCTION public.dream_team_pendientes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_pendientes(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dream_team_pendientes_resumen()
RETURNS TABLE (
  areas_sin_servidores  integer,
  areas_total           integer,
  sin_cedula            integer,
  fecha_nacimiento      integer,
  sin_telefono          integer,
  genero_estado_civil   integer,
  fichas_incompletas    integer,
  sin_cuenta            integer,
  invitaciones_vencidas integer,
  por_activar           integer,
  sin_turno             integer,
  solicitudes           integer,
  urgentes              integer,
  personas_total        integer,
  personas_en_orden     integer,
  porcentaje            integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH c AS (
    SELECT count(*) FILTER (WHERE f.tipo = 'area_sin_servidores')::integer AS areas_sin_servidores,
           count(*) FILTER (WHERE f.tipo = 'area')::integer AS areas_total,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'sin_cedula')::integer AS sin_cedula,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'fecha_nacimiento')::integer AS fecha_nacimiento,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'sin_telefono')::integer AS sin_telefono,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'genero_estado_civil')::integer AS genero_estado_civil,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo IN ('sin_cedula', 'fecha_nacimiento', 'sin_telefono',
                                                                  'genero_estado_civil'))::integer AS fichas_incompletas,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'sin_cuenta')::integer AS sin_cuenta,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'invitacion_vencida')::integer AS invitaciones_vencidas,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'por_activar')::integer AS por_activar,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo = 'sin_turno')::integer AS sin_turno,
           count(*) FILTER (WHERE f.tipo = 'solicitud_cambio_area')::integer AS solicitudes,
           count(*) FILTER (WHERE f.tipo = 'persona')::integer AS personas_total,
           count(DISTINCT f.persona_id) FILTER (WHERE f.tipo IN ('sin_cedula', 'fecha_nacimiento', 'sin_telefono',
                                                                  'genero_estado_civil', 'sin_cuenta', 'invitacion_vencida',
                                                                  'por_activar', 'sin_turno'))::integer AS con_pendientes
      FROM public.dream_team_pendientes_filas() f
  )
  SELECT c.areas_sin_servidores, c.areas_total, c.sin_cedula, c.fecha_nacimiento, c.sin_telefono,
         c.genero_estado_civil, c.fichas_incompletas, c.sin_cuenta, c.invitaciones_vencidas, c.por_activar,
         c.sin_turno, c.solicitudes,
         c.areas_sin_servidores + c.solicitudes + c.invitaciones_vencidas,
         c.personas_total,
         c.personas_total - c.con_pendientes,
         CASE WHEN c.personas_total > 0
              THEN round(100.0 * (c.personas_total - c.con_pendientes) / c.personas_total)::integer
         END
    FROM c;
$function$;

COMMENT ON FUNCTION public.dream_team_pendientes_resumen() IS
  'Counts of dream_team_pendientes for the caller (people, except áreas and solicitudes), urgentes = áreas '
  'sin servidores + solicitudes + invitaciones vencidas, personas en orden (no person-level alert) and their '
  'rounded porcentaje (NULL without people). S7 of odd/tasks/dream-team-pendientes-director.md.';

REVOKE ALL ON FUNCTION public.dream_team_pendientes_resumen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_pendientes_resumen() TO authenticated;
