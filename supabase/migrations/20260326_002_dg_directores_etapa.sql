-- ============================================================================
-- Migración: Tabla dg_directores_etapa
-- Mapea Director General → Director de Etapa (via segmento_lideres)
-- Un DE puede estar asignado a múltiples DGs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dg_directores_etapa (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dg_usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  segmento_lider_id uuid NOT NULL REFERENCES public.segmento_lideres(id) ON DELETE CASCADE,
  creado_en timestamptz DEFAULT now() NOT NULL,
  UNIQUE(dg_usuario_id, segmento_lider_id)
);

CREATE INDEX IF NOT EXISTS idx_dg_de_dg_usuario ON public.dg_directores_etapa(dg_usuario_id);
CREATE INDEX IF NOT EXISTS idx_dg_de_segmento_lider ON public.dg_directores_etapa(segmento_lider_id);

ALTER TABLE public.dg_directores_etapa ENABLE ROW LEVEL SECURITY;

-- SELECT: autenticados pueden leer (DGs necesitan ver asignaciones de otros para transparencia)
CREATE POLICY "dg_de_select" ON public.dg_directores_etapa
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Gestión: admin, pastor, Y director-general (self-service entre DGs)
CREATE POLICY "dg_de_manage" ON public.dg_directores_etapa
  FOR ALL USING (
    public.es_superadmin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      JOIN public.usuario_roles ur ON ur.usuario_id = u.id
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE u.auth_id = (SELECT auth.uid())
        AND rs.nombre_interno IN ('pastor', 'director-general')
    )
  );
