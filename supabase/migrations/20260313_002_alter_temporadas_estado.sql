-- Migración 002: Agregar columna 'estado' a temporadas
-- 3 valores: planificacion, activa, finalizada
-- Mantener la columna 'activa' (bool) por retrocompatibilidad

ALTER TABLE public.temporadas
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'planificacion'
    CHECK (estado IN ('planificacion', 'activa', 'finalizada'));

-- Data migration: derivar estado desde la columna 'activa' existente
-- Solo actualiza filas que aún no tienen el estado correcto
UPDATE public.temporadas
SET estado = CASE
  WHEN activa = true THEN 'activa'
  WHEN fecha_fin IS NOT NULL AND fecha_fin < CURRENT_DATE THEN 'finalizada'
  ELSE 'planificacion'
END
WHERE estado = 'planificacion';

CREATE INDEX IF NOT EXISTS idx_temporadas_estado ON public.temporadas(estado);
