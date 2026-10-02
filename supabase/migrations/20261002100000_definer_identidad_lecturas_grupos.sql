-- Identity guard for the group, event and attendance reads that take the
-- caller as an argument (security phase 2, batch 1).
--
-- What was wrong in the live functions:
--   * They are SECURITY DEFINER and take the caller's identity as p_auth_id, but
--     never compared it with the session. Any logged-in person who knew another
--     person's auth id could read what that person can read: the group list and
--     KPIs of an admin, the detail of any group the admin sees (members' email
--     and phone, private notes), the member audit trail, the leaders' notes,
--     and, for three functions that check nothing at all, any event of any group
--     (including the leader's private notes and the attendance sheet).
--
-- What changes (signature, argument names and defaults, return type, language,
-- volatility, SECURITY DEFINER and owner are unchanged, so the app needs no
-- change):
--   * Identity: p_auth_id must equal auth.uid(), unless the call comes from
--     service_role. This is the pattern of 20260930100000. The guard is the
--     first statement of each body; the rest of every body is the live text.
--   * search_path is pinned to public where the function had none. Every object
--     the bodies use is already schema-qualified (public.*, auth.*), so the pin
--     changes no resolution.
--   * Grants: anon and PUBLIC lose execute (they already hold nothing since the
--     anon lock-down); authenticated and service_role keep it. The grants are
--     restated at the end of the file.
--
-- Exit for another person's identity or no session (decision D3: the same shape
-- the function already uses for "no permission / unknown user"):
--   buscar_usuarios_para_grupo         RAISE 'permiso_denegado' (as today)
--   listar_eventos_grupo               RETURN (no rows); it has no denial today
--   obtener_evento_grupo               RETURN (no rows); it has no denial today
--   obtener_asistencia_evento          RETURN (no rows); it has no denial today
--   obtener_auditoria_miembros         RAISE 'Usuario no encontrado', SQLSTATE
--                                      28000 (as for an unknown user today)
--   obtener_detalle_grupo              RETURN NULL (as for no visibility today)
--   obtener_grupos_para_usuario        RETURN (no rows, as for an unknown user)
--   obtener_kpis_grupos_para_usuario   RAISE 'Usuario interno no encontrado'
--     (both overloads)                 (as for an unknown user today)
--   obtener_eventos_con_notas          RETURN '[]'::jsonb (as for no access)
--
-- Not touched: obtener_casas_revision_pendiente, obtener_grupos_sin_casa_anfitriona,
-- obtener_mapa_grupos_vida_host_homes and obtener_mapa_miembros already stop with
-- casas_map_auth_matches_actor(p_auth_id) as their first statement.
--
-- Blast radius: the app and the planner call these functions with the session
-- client and the person's own id (the guard lets that through). Scripts use the
-- service client, which stays exempt. Other functions that call these pass on
-- their own p_auth_id or auth.uid(). Only a caller that passes somebody else's
-- id changes, and that is the point.
--
-- Rollback: recreate the previous definitions. The latest migration that defined
-- each function is:
--   buscar_usuarios_para_grupo         20250906111510_grupo_detalle_y_miembros.sql
--   listar_eventos_grupo               20250909133000_fix_listar_eventos_ambiguity.sql
--   obtener_evento_grupo               20250909131500_asistencia_relax_perms.sql
--   obtener_asistencia_evento          20250909133500_fix_obtener_asistencia_evento_return.sql
--   obtener_auditoria_miembros         20250906131000_update_auditoria_add_names_and_filters.sql
--   obtener_detalle_grupo              20260314_004_fix_detalle_grupo_fecha_salida.sql
--   obtener_grupos_para_usuario        20260929150000_gdv_dg_regla_en_grupos.sql
--   obtener_kpis_grupos_para_usuario   20260929160000_gdv_dg_regla_en_tablero_y_casas.sql
--   obtener_eventos_con_notas          20260314_007_rpc_eventos_con_notas.sql
-- Some of those files were later overridden by a live edit, so production keeps
-- a backup table of the live definitions that the operator creates before
-- applying this file; restore from that table.

CREATE OR REPLACE FUNCTION public.buscar_usuarios_para_grupo(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  IF NOT public.puede_gestionar_miembros(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'permiso_denegado';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.nombre,
    u.apellido,
    u.email,
    u.telefono,
    EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = u.id
    ) AS ya_es_miembro
  FROM public.usuarios u
  WHERE (
    p_query IS NULL OR p_query = '' OR
    u.nombre ILIKE '%' || p_query || '%' OR
    u.apellido ILIKE '%' || p_query || '%' OR
    u.email ILIKE '%' || p_query || '%' OR
    u.telefono ILIKE '%' || p_query || '%'
  )
  ORDER BY u.nombre, u.apellido
  LIMIT COALESCE(p_limit, 10);
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_eventos_grupo(p_auth_id uuid, p_grupo_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha date, hora text, tema text, notas text, total integer, presentes integer, porcentaje integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
begin
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  return query
    with base as (
      select eg.id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas
        from public.eventos_grupo eg
       where eg.grupo_id = p_grupo_id
    ), agg as (
      select a.evento_grupo_id as id,
             count(*)::int as total,
             count(*) filter (where a.presente) :: int as presentes
        from public.asistencia a
       where a.evento_grupo_id in (select b.id from base b)
       group by a.evento_grupo_id
    )
    select b.id, b.fecha, b.hora, b.tema, b.notas,
           coalesce(ag.total,0) as total,
           coalesce(ag.presentes,0) as presentes,
           case when coalesce(ag.total,0) = 0 then 0 else round((ag.presentes::numeric / ag.total::numeric) * 100)::int end as porcentaje
      from base b
      left join agg ag on ag.id = b.id
      order by b.fecha desc, b.id desc
      limit coalesce(p_limit, 50) offset coalesce(p_offset, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_evento_grupo(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(id uuid, grupo_id uuid, fecha date, hora text, tema text, notas text, descripcion text, puntos_oracion text, notas_privadas_lider text, conteo_visitantes integer, no_hubo_reunion boolean, motivo_no_reunion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT eg.id, eg.grupo_id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas,
           eg.descripcion, eg.puntos_oracion, eg.notas_privadas_lider,
           COALESCE(eg.conteo_visitantes, 0) as conteo_visitantes,
           COALESCE(eg.no_hubo_reunion, false) as no_hubo_reunion,
           eg.motivo_no_reunion
      FROM public.eventos_grupo eg
     WHERE eg.id = p_evento_id
     LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_asistencia_evento(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(usuario_id uuid, presente boolean, motivo_inasistencia text, registrado_por_usuario_id uuid, fecha_registro timestamp with time zone, nombre text, apellido text, rol text, tipo_presencia text, nota text, tiempo_tardanza smallint, motivo_tardanza text, motivo_tardanza_otro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.usuario_id, a.presente, a.motivo_inasistencia, a.registrado_por_usuario_id, a.fecha_registro,
           u.nombre, u.apellido,
           COALESCE((SELECT gm.rol::text FROM public.grupo_miembros gm WHERE gm.grupo_id = eg.grupo_id AND gm.usuario_id = u.id LIMIT 1), 'Miembro') as rol,
           COALESCE(a.tipo_presencia, CASE WHEN a.presente THEN 'presente' ELSE 'ausente' END) as tipo_presencia,
           a.nota,
           a.tiempo_tardanza,
           a.motivo_tardanza,
           a.motivo_tardanza_otro
      FROM public.asistencia a
      JOIN public.eventos_grupo eg ON eg.id = p_evento_id
      JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.evento_grupo_id = p_evento_id
     ORDER BY u.nombre, u.apellido;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_auditoria_miembros(p_auth_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_actor_query text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, happened_at timestamp with time zone, action text, grupo_id uuid, usuario_id uuid, actor_auth_id uuid, actor_usuario_id uuid, actor_nombre text, usuario_nombre text, usuario_email text, old_data jsonb, new_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  internal_user_id uuid;
  is_admin boolean;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'admin'
  ) INTO is_admin;

  RETURN QUERY
  WITH base AS (
    SELECT a.*
    FROM public.audit_grupo_miembros a
    WHERE
      (p_grupo_id IS NULL OR a.grupo_id = p_grupo_id)
      AND (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_desde IS NULL OR a.happened_at >= p_desde)
      AND (p_hasta IS NULL OR a.happened_at <= p_hasta)
  ), no_miembros AS (
    SELECT b.* FROM base b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grupo_miembros gm
      WHERE gm.grupo_id = b.grupo_id AND gm.usuario_id = internal_user_id AND gm.rol = 'Miembro'
    )
  ), autorizada AS (
    SELECT b2.* FROM no_miembros b2
    WHERE is_admin OR public.puede_ver_grupo(internal_user_id, b2.grupo_id) = true
  ), joined AS (
    SELECT a.*, ua.nombre AS actor_nombre, ua.apellido AS actor_apellido,
           uu.nombre AS usuario_nombre, uu.apellido AS usuario_apellido, uu.email AS usuario_email
    FROM autorizada a
    LEFT JOIN public.usuarios ua ON ua.id = a.actor_usuario_id
    LEFT JOIN public.usuarios uu ON uu.id = a.usuario_id
    WHERE (
      p_actor_query IS NULL OR (
        ua.nombre ILIKE '%'||p_actor_query||'%' OR ua.apellido ILIKE '%'||p_actor_query||'%'
      )
    )
  ), counted AS (
    SELECT j.*, (SELECT count(*) FROM joined) AS total_count
    FROM joined j
  )
  SELECT c.id, c.happened_at, c.action, c.grupo_id, c.usuario_id, c.actor_auth_id, c.actor_usuario_id,
         trim(COALESCE(c.actor_nombre,'')||' '||COALESCE(c.actor_apellido,'')) AS actor_nombre,
         trim(COALESCE(c.usuario_nombre,'')||' '||COALESCE(c.usuario_apellido,'')) AS usuario_nombre,
         c.usuario_email,
         c.old_data, c.new_data, c.total_count
  FROM counted c
  ORDER BY c.happened_at DESC, c.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_detalle_grupo(p_auth_id uuid, p_grupo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  internal_user_id uuid;
  is_superior boolean := false;
  result jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- Mapear auth_id al id interno del usuario
  IF p_auth_id IS NOT NULL THEN
    SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    IF internal_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.usuario_roles ur
        JOIN public.roles_sistema rs ON ur.rol_id = rs.id
        WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
      ) INTO is_superior;
    END IF;
  END IF;

  -- Validación de visibilidad
  IF NOT (is_superior OR public.puede_ver_grupo(internal_user_id, p_grupo_id) = true) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', g.id,
    'nombre', g.nombre,
    'segmento_id', g.segmento_id,
    'temporada_id', g.temporada_id,
    'segmento_nombre', s.nombre,
    'temporada_nombre', t.nombre,
    'dia_reunion', g.dia_reunion,
    'hora_reunion', g.hora_reunion,
    'activo', g.activo,
    'notas_privadas', g.notas_privadas,
    'direccion', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', d.id,
      'calle', d.calle,
      'barrio', d.barrio,
      'codigo_postal', d.codigo_postal,
      'referencia', d.referencia,
      'latitud', d.latitud,
      'longitud', d.longitud,
      'parroquia', CASE WHEN pa.id IS NULL THEN NULL ELSE jsonb_build_object('id', pa.id, 'nombre', pa.nombre) END
    ) END,
    'miembros', COALESCE(miembros_data.lista, '[]'::jsonb),
    'puede_gestionar_miembros', public.puede_gestionar_miembros(p_auth_id, p_grupo_id),
    'rol_en_grupo', (
      SELECT gm.rol FROM public.grupo_miembros gm
      WHERE gm.grupo_id = g.id AND gm.usuario_id = internal_user_id
        AND gm.fecha_salida IS NULL
      LIMIT 1
    )
  )
  INTO result
  FROM public.grupos g
  LEFT JOIN public.segmentos s ON s.id = g.segmento_id
  LEFT JOIN public.temporadas t ON t.id = g.temporada_id
  LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
  LEFT JOIN public.parroquias pa ON pa.id = d.parroquia_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'nombre', u.nombre,
        'apellido', u.apellido,
        'email', u.email,
        'telefono', u.telefono,
        'rol', gm.rol,
        'foto_perfil_url', u.foto_perfil_url
      )
      ORDER BY 
        CASE WHEN gm.rol = 'Líder' THEN 1 
             WHEN gm.rol = 'Colíder' THEN 2 
             ELSE 3 END,
        COALESCE(
          LEAST(u.id, (
            SELECT CASE 
              WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
              ELSE ru.usuario1_id 
            END
            FROM public.relaciones_usuarios ru
            WHERE ru.tipo_relacion = 'conyuge'
              AND (ru.usuario1_id = u.id OR ru.usuario2_id = u.id)
              AND EXISTS (
                SELECT 1 FROM public.grupo_miembros gm2
                WHERE gm2.grupo_id = g.id
                  AND gm2.fecha_salida IS NULL
                  AND gm2.usuario_id = CASE 
                    WHEN ru.usuario1_id = u.id THEN ru.usuario2_id 
                    ELSE ru.usuario1_id 
                  END
              )
            LIMIT 1
          )),
          u.id
        ),
        CASE WHEN u.genero = 'Masculino' THEN 1 
             WHEN u.genero = 'Femenino' THEN 2 
             ELSE 3 END,
        u.nombre, 
        u.apellido
    ) AS lista
    FROM public.grupo_miembros gm
    JOIN public.usuarios u ON u.id = gm.usuario_id
    WHERE gm.grupo_id = g.id
      AND gm.fecha_salida IS NULL
  ) miembros_data ON TRUE
  WHERE g.id = p_grupo_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_grupos_para_usuario(p_auth_id uuid, p_segmento_id uuid DEFAULT NULL::uuid, p_temporada_id uuid DEFAULT NULL::uuid, p_activo boolean DEFAULT NULL::boolean, p_municipio_id uuid DEFAULT NULL::uuid, p_parroquia_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_eliminado boolean DEFAULT false, p_estado_temporal text DEFAULT NULL::text, p_solo_mios boolean DEFAULT false)
 RETURNS TABLE(id uuid, nombre text, activo boolean, eliminado boolean, segmento_nombre text, temporada_nombre text, fecha_creacion timestamp with time zone, municipio_id uuid, municipio_nombre text, parroquia_id uuid, parroquia_nombre text, lideres json, miembros_count integer, supervisado_por_mi boolean, soy_miembro boolean, soy_lider boolean, hay_mis_grupos boolean, estado_temporal text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  internal_user_id uuid;
  is_admin boolean;
  is_dg boolean;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  IF p_auth_id IS NULL THEN RETURN; END IF;
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno IN ('admin','pastor')
  ) INTO is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id AND rs.nombre_interno = 'director-general'
  ) INTO is_dg;

  RETURN QUERY WITH base AS (
    SELECT 
      g.id AS id,
      g.nombre AS nombre,
      g.activo AS activo,
      g.eliminado AS eliminado,
      s.nombre AS segmento_nombre,
      t.nombre AS temporada_nombre,
      g.fecha_creacion AS fecha_creacion,
      m.id AS municipio_id,
      m.nombre AS municipio_nombre,
      p.id AS parroquia_id,
      p.nombre AS parroquia_nombre,
      (
        SELECT json_agg(json_build_object(
          'id', u.id,
          'nombre_completo', trim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')),
          'rol', gm.rol
        ) ORDER BY gm.rol, u.apellido)
        FROM public.grupo_miembros gm
        JOIN public.usuarios u ON u.id = gm.usuario_id
        WHERE gm.grupo_id = g.id AND gm.rol IN ('Líder','Colíder')
      ) AS lideres,
      (SELECT count(*)::int FROM public.grupo_miembros gm2 WHERE gm2.grupo_id = g.id) AS miembros_count,
      (
        SELECT EXISTS(
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
          WHERE deg.grupo_id = g.id AND sl.usuario_id = internal_user_id AND sl.tipo_lider = 'director_etapa'
        )
      ) AS supervisado_por_mi,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm3 WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
        )
      ) AS soy_miembro,
      (
        SELECT EXISTS(
          SELECT 1 FROM public.grupo_miembros gm4
          WHERE gm4.grupo_id = g.id AND gm4.usuario_id = internal_user_id AND gm4.rol IN ('Líder','Colíder')
        )
      ) AS soy_lider,
      CASE
        WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
        WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
        ELSE 'pasado'
      END AS estado_temporal
    FROM public.grupos g
    LEFT JOIN public.segmentos s ON s.id = g.segmento_id
    LEFT JOIN public.temporadas t ON t.id = g.temporada_id
    LEFT JOIN public.direcciones d ON d.id = g.direccion_anfitrion_id
    LEFT JOIN public.parroquias p ON p.id = d.parroquia_id
    LEFT JOIN public.municipios m ON m.id = p.municipio_id
    WHERE
      (
        is_admin
        OR (is_dg AND g.id IN (
          SELECT public.gdv_dg_grupos_visibles(internal_user_id)
        ))
        OR public.puede_ver_grupo(internal_user_id, g.id)
      )
      AND (p_segmento_id IS NULL OR g.segmento_id = p_segmento_id)
      AND (p_temporada_id IS NULL OR g.temporada_id = p_temporada_id)
      AND (p_activo IS NULL OR g.activo = p_activo)
      AND (p_municipio_id IS NULL OR m.id = p_municipio_id)
      AND (p_parroquia_id IS NULL OR p.id = p_parroquia_id)
      AND (g.eliminado = COALESCE(p_eliminado, false))
      AND (NOT p_solo_mios OR EXISTS (
            SELECT 1 FROM public.grupo_miembros gm3
            WHERE gm3.grupo_id = g.id AND gm3.usuario_id = internal_user_id
          ))
      AND (
        p_estado_temporal IS NULL OR (
          CASE
            WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
            WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
            ELSE 'pasado'
          END
        ) = p_estado_temporal
      )
  ), stats AS (
    SELECT coalesce(bool_or(b.soy_miembro), false) AS hay_mis_grupos FROM base b
  ), counted AS (
    SELECT b.*, count(*) OVER() AS total_count FROM base b
  )
  SELECT
    c.id,
    c.nombre,
    c.activo,
    c.eliminado,
    c.segmento_nombre,
    c.temporada_nombre,
    c.fecha_creacion,
    c.municipio_id,
    c.municipio_nombre,
    c.parroquia_id,
    c.parroquia_nombre,
    c.lideres,
    c.miembros_count,
    c.supervisado_por_mi,
    c.soy_miembro,
    c.soy_lider,
    s.hay_mis_grupos,
    c.estado_temporal,
    c.total_count
  FROM counted c
  CROSS JOIN stats s
  ORDER BY c.fecha_creacion DESC NULLS LAST, c.nombre ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_kpis_grupos_para_usuario(p_auth_id uuid)
 RETURNS TABLE(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_es_superior boolean;
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;$function$;

CREATE OR REPLACE FUNCTION public.obtener_kpis_grupos_para_usuario(p_auth_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_grupos integer, total_con_lider integer, pct_con_lider numeric, total_aprobados integer, pct_aprobados numeric, promedio_miembros numeric, desviacion_miembros numeric, total_sin_director integer, pct_sin_director numeric, fecha_ultima_actualizacion timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_es_superior boolean;
  v_es_dg boolean;
  v_es_director_etapa boolean;
  v_es_lider boolean;
  v_usuario_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  IF p_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth requerido';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario interno no encontrado';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno IN ('admin','pastor')
  ) INTO v_es_superior;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-general'
  ) INTO v_es_dg;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema r ON r.id = ur.rol_id
    WHERE ur.usuario_id = v_usuario_id AND r.nombre_interno = 'director-etapa'
  ) INTO v_es_director_etapa;

  SELECT EXISTS(
    SELECT 1 FROM public.grupo_miembros gm WHERE gm.usuario_id = v_usuario_id AND gm.rol = 'Líder'
  ) INTO v_es_lider;

  RETURN QUERY
  WITH universo AS (
    SELECT * FROM public.v_grupos_supervisiones v
    WHERE (
      v_es_superior
      OR (v_es_dg AND v.grupo_id IN (
        SELECT public.gdv_dg_grupos_visibles(v_usuario_id)
      ))
      OR (v_es_director_etapa AND v.director_etapa_usuario_id = v_usuario_id)
      OR (v_es_lider AND v.grupo_id IN (
        SELECT gm2.grupo_id FROM public.grupo_miembros gm2 WHERE gm2.usuario_id = v_usuario_id AND gm2.rol = 'Líder'
      ))
    )
    -- NUEVO: filtro campus
    AND (p_campus_id IS NULL OR v.grupo_id IN (
      SELECT g.id FROM public.grupos g WHERE g.campus_id = p_campus_id
    ))
  ), agregados AS (
    SELECT
      COUNT(*)::int AS total,
      (COUNT(*) FILTER (WHERE lider_usuario_id IS NOT NULL))::int AS con_lider,
      (COUNT(*) FILTER (WHERE estado_aprobacion = 'aprobado'))::int AS aprobados,
      (COUNT(*) FILTER (WHERE director_etapa_usuario_id IS NULL))::int AS sin_director,
      AVG(total_miembros)::numeric AS prom_miembros,
      STDDEV_POP(total_miembros)::numeric AS std_miembros
    FROM universo
  )
  SELECT
    COALESCE(total,0) AS total_grupos,
    COALESCE(con_lider,0) AS total_con_lider,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(con_lider::numeric * 100 / total, 2) ELSE 0 END AS pct_con_lider,
    COALESCE(aprobados,0) AS total_aprobados,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(aprobados::numeric * 100 / total, 2) ELSE 0 END AS pct_aprobados,
    prom_miembros AS promedio_miembros,
    std_miembros AS desviacion_miembros,
    COALESCE(sin_director,0) AS total_sin_director,
    CASE WHEN COALESCE(total,0) > 0 THEN ROUND(sin_director::numeric * 100 / total, 2) ELSE 0 END AS pct_sin_director,
    NOW() AS fecha_ultima_actualizacion
  FROM agregados;
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_eventos_con_notas(p_auth_id uuid, p_limite integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_is_admin_pastor boolean := false;
  v_is_director boolean := false;
  v_result jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user_id
      AND rs.nombre_interno IN ('admin', 'pastor')
  ) INTO v_is_admin_pastor;

  IF NOT v_is_admin_pastor THEN
    SELECT EXISTS(
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_user_id
        AND rs.nombre_interno IN ('director-general', 'director-etapa')
    ) INTO v_is_director;

    IF NOT v_is_director THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY fecha DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'evento_id', eg.id,
      'grupo_id', g.id,
      'grupo_nombre', g.nombre,
      'fecha', eg.fecha,
      'hora', eg.hora,
      'tema', COALESCE(eg.tema, 'Sin tema'),
      'notas', eg.notas,
      'lider_nombre', COALESCE(
        (SELECT u.nombre || ' ' || u.apellido
         FROM public.grupo_miembros gm
         JOIN public.usuarios u ON u.id = gm.usuario_id
         WHERE gm.grupo_id = g.id AND gm.rol::text = 'Líder'
         LIMIT 1),
        'Sin líder'
      ),
      'presentes', (SELECT COUNT(*) FILTER (WHERE a.presente = true) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id),
      'total', (SELECT COUNT(*) FROM public.asistencia a WHERE a.evento_grupo_id = eg.id)
    ) AS row_data,
    eg.fecha
    FROM public.eventos_grupo eg
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE eg.notas IS NOT NULL
      AND TRIM(eg.notas) != ''
      AND eg.fecha >= CURRENT_DATE - INTERVAL '30 days'
      AND (
        v_is_admin_pastor
        OR public.puede_ver_grupo(v_user_id, g.id)
      )
    ORDER BY eg.fecha DESC
    LIMIT p_limite
  ) sub;

  RETURN v_result;
END;
$function$;

-- Execution rights: signed-in people and the service client only.
REVOKE ALL ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_evento_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, integer, integer, boolean, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_eventos_con_notas(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.buscar_usuarios_para_grupo(uuid, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_evento_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_detalle_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_grupos_para_usuario(uuid, uuid, uuid, boolean, uuid, uuid, integer, integer, boolean, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_grupos_para_usuario(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_eventos_con_notas(uuid, integer) TO authenticated, service_role;
