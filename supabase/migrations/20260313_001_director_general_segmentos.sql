-- Migración 001: Tabla de asignación Director General → Segmentos
-- Un DG puede tener múltiples segmentos, incluso de diferentes campus
-- RLS habilitado con policies scoped

CREATE TABLE IF NOT EXISTS public.director_general_segmentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  segmento_id     uuid NOT NULL REFERENCES public.segmentos(id) ON DELETE CASCADE,
  campus_id       uuid REFERENCES public.campus(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, segmento_id)
);

CREATE INDEX IF NOT EXISTS idx_dg_segmentos_usuario ON public.director_general_segmentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_dg_segmentos_segmento ON public.director_general_segmentos(segmento_id);

ALTER TABLE public.director_general_segmentos ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer (para UI de listado)
CREATE POLICY "dg_segmentos_select" ON public.director_general_segmentos
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- Solo superadmin puede insertar/actualizar/eliminar
CREATE POLICY "dg_segmentos_admin" ON public.director_general_segmentos
  FOR ALL USING (public.es_superadmin((select auth.uid())));
