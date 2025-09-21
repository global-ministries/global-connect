SET search_path = public;

-- Habilitar RLS por si no está activo
ALTER TABLE IF EXISTS public.grupo_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;

-- Política: un usuario autenticado podrá ver filas de grupo_miembros
-- si es Líder del mismo grupo (misma grupo_id) con su usuario interno.
DROP POLICY IF EXISTS rls_select_miembros_por_lider ON public.grupo_miembros;
CREATE POLICY rls_select_miembros_por_lider
ON public.grupo_miembros
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.grupo_miembros gm2
      ON gm2.usuario_id = u.id
     AND gm2.grupo_id = grupo_miembros.grupo_id
     AND gm2.rol = 'Líder'::public.enum_rol_grupo
    WHERE u.auth_id = auth.uid()
  )
);

-- Política: permitir leer datos básicos de usuarios que son miembros
-- de los grupos donde el actual es Líder, para que el listado funcione.
DROP POLICY IF EXISTS rls_select_usuarios_visibles_a_lider ON public.usuarios;
CREATE POLICY rls_select_usuarios_visibles_a_lider
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios me
    JOIN public.grupo_miembros gm_lider
      ON gm_lider.usuario_id = me.id
     AND gm_lider.rol = 'Líder'::public.enum_rol_grupo
    JOIN public.grupo_miembros gm_miembro
      ON gm_miembro.grupo_id = gm_lider.grupo_id
     AND gm_miembro.usuario_id = usuarios.id
    WHERE me.auth_id = auth.uid()
  )
);

COMMENT ON POLICY rls_select_miembros_por_lider ON public.grupo_miembros IS
'Los líderes pueden ver los miembros de sus propios grupos';
COMMENT ON POLICY rls_select_usuarios_visibles_a_lider ON public.usuarios IS
'Los líderes pueden leer información de usuarios que pertenecen a sus grupos';
