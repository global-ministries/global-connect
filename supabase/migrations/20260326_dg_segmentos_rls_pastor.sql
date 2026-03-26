-- ============================================================================
-- Migración: Permitir que pastor gestione director_general_segmentos
-- Antes: solo superadmin (policy "dg_segmentos_admin")
-- Ahora: superadmin O pastor
-- ============================================================================

-- Eliminar policy anterior (solo superadmin)
DROP POLICY IF EXISTS "dg_segmentos_admin" ON public.director_general_segmentos;

-- Nueva policy: superadmin O pastor pueden gestionar (INSERT/UPDATE/DELETE/SELECT)
CREATE POLICY "dg_segmentos_admin_pastor" ON public.director_general_segmentos
  FOR ALL USING (
    public.es_superadmin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      JOIN public.usuario_roles ur ON ur.usuario_id = u.id
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE u.auth_id = (SELECT auth.uid())
        AND rs.nombre_interno = 'pastor'
    )
  );
