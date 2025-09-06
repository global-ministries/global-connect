SET search_path = public;

-- Reemplaza la RPC para incluir nombres y filtros por actor (texto)
DROP FUNCTION IF EXISTS public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int);

CREATE OR REPLACE FUNCTION public.obtener_auditoria_miembros(
  p_auth_id uuid,
  p_grupo_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL,
  p_hasta timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_actor_query text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  happened_at timestamptz,
  action text,
  grupo_id uuid,
  usuario_id uuid,
  actor_auth_id uuid,
  actor_usuario_id uuid,
  actor_nombre text,
  usuario_nombre text,
  usuario_email text,
  old_data jsonb,
  new_data jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  internal_user_id uuid;
  is_admin boolean;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int, text) TO anon, authenticated;
