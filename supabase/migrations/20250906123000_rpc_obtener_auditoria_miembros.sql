SET search_path = public;

-- RPC para leer auditoría de miembros con filtros y paginación
-- Requiere estar autenticado. Admin ve todo; otros solo lo que pueden ver según puede_ver_grupo.
DROP FUNCTION IF EXISTS public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int);

CREATE OR REPLACE FUNCTION public.obtener_auditoria_miembros(
  p_auth_id uuid,
  p_grupo_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,            -- 'CREATE' | 'UPDATE' | 'DELETE'
  p_desde timestamptz DEFAULT NULL,
  p_hasta timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  happened_at timestamptz,
  action text,
  grupo_id uuid,
  usuario_id uuid,
  actor_auth_id uuid,
  actor_usuario_id uuid,
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
  -- Mapear auth -> usuario interno
  SELECT u.id INTO internal_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = '28000';
  END IF;

  -- ¿Es admin?
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno = 'admin'
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
  ),
  autorizada AS (
    SELECT b.*
    FROM base b
    WHERE is_admin OR public.puede_ver_grupo(internal_user_id, b.grupo_id) = true
  ),
  counted AS (
    SELECT b2.*, (SELECT count(*) FROM autorizada) AS total_count
    FROM autorizada b2
  )
  SELECT
    c.id,
    c.happened_at,
    c.action,
    c.grupo_id,
    c.usuario_id,
    c.actor_auth_id,
    c.actor_usuario_id,
    c.old_data,
    c.new_data,
    c.total_count
  FROM counted c
  ORDER BY c.happened_at DESC, c.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_auditoria_miembros(uuid, uuid, uuid, text, timestamptz, timestamptz, int, int) TO anon, authenticated;
