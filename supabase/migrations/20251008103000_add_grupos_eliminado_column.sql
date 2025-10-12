-- Añade columna de papelera para grupos
-- Campo boolean simple para velocidad de filtros. Alternativa timestamp (deleted_at) si se requiere cuándo.
-- Estrategia: mantener "activo" separado (un grupo podría estar inactivo pero no eliminado). "eliminado" implica ocultarlo por defecto.

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS eliminado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.grupos.eliminado IS 'Marcador de papelera. TRUE = enviado a papelera (soft delete reversible).';

-- Índice parcial para consultas frecuentes (solo no eliminados) si aún no se usa una condición en RPC.
CREATE INDEX IF NOT EXISTS idx_grupos_no_eliminados ON public.grupos(id) WHERE eliminado = false;
