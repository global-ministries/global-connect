-- Migración 003: Extender tabla grupos con columnas para Grupos de Vida v2
-- Aditiva: solo ADD COLUMN IF NOT EXISTS. Zero DROP.

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS tipo_grupo_id uuid REFERENCES public.tipos_grupo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado_ciclo text NOT NULL DEFAULT 'activo'
    CHECK (estado_ciclo IN ('proximo','activo','archivado','cancelado')),
  ADD COLUMN IF NOT EXISTS casa_anfitriona_id uuid REFERENCES public.casas_anfitrionas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacidad_maxima integer,
  ADD COLUMN IF NOT EXISTS es_publico boolean NOT NULL DEFAULT false;

-- Indexes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_grupos_tipo ON public.grupos(tipo_grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupos_ciclo ON public.grupos(estado_ciclo);
CREATE INDEX IF NOT EXISTS idx_grupos_casa ON public.grupos(casa_anfitriona_id);

-- Data migration: asignar tipo_grupo_id a los grupos existentes
UPDATE public.grupos
SET tipo_grupo_id = (
  SELECT id FROM public.tipos_grupo WHERE slug = 'grupos-de-vida' LIMIT 1
)
WHERE tipo_grupo_id IS NULL AND eliminado = false;

-- Data migration: asignar estado_ciclo basado en temporada y estado activo
UPDATE public.grupos g
SET estado_ciclo = CASE
  WHEN t.activa = true AND g.activo = true THEN 'activo'
  WHEN g.activo = false OR t.activa = false THEN 'archivado'
  ELSE 'activo'
END
FROM public.temporadas t
WHERE t.id = g.temporada_id
  AND g.estado_ciclo = 'activo';
