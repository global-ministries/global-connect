-- RPC para obtener los roles del sistema del usuario
-- SECURITY DEFINER: evita problemas con RLS en consultas server-side
CREATE OR REPLACE FUNCTION public.obtener_roles_sistema_usuario(p_auth_id uuid)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(array_agg(rs.nombre_interno), ARRAY[]::text[])
  FROM usuario_roles ur
  JOIN roles_sistema rs ON ur.rol_id = rs.id
  JOIN usuarios u ON u.id = ur.usuario_id
  WHERE u.auth_id = p_auth_id;
$$;
