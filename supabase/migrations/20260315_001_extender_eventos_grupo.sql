-- Migración: Extender eventos_grupo con campos avanzados de asistencia
-- Agrega: tipo, descripción pastoral, puntos de oración, visitantes, notas privadas, etc.
-- Non-destructive: solo ADD COLUMN IF NOT EXISTS

ALTER TABLE eventos_grupo
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'regular'
    CHECK (tipo IN ('regular', 'especial')),
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS puntos_oracion text,
  ADD COLUMN IF NOT EXISTS conteo_visitantes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas_privadas_lider text,
  ADD COLUMN IF NOT EXISTS registrado_en timestamptz,
  ADD COLUMN IF NOT EXISTS no_hubo_reunion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_no_reunion text;

-- Migrar datos existentes: marcar todos los eventos como "registrados" en su fecha
UPDATE eventos_grupo
  SET registrado_en = fecha::timestamptz
  WHERE registrado_en IS NULL;

COMMENT ON COLUMN eventos_grupo.tipo IS 'Tipo de evento: regular o especial';
COMMENT ON COLUMN eventos_grupo.descripcion IS 'Descripción de la reunión (resumen pastoral)';
COMMENT ON COLUMN eventos_grupo.puntos_oracion IS 'Puntos de oración compartidos durante la reunión';
COMMENT ON COLUMN eventos_grupo.conteo_visitantes IS 'Cantidad de visitantes no miembros que asistieron';
COMMENT ON COLUMN eventos_grupo.notas_privadas_lider IS 'Notas privadas del líder (no visibles para miembros)';
COMMENT ON COLUMN eventos_grupo.registrado_en IS 'Timestamp de cuándo se registró la asistencia';
COMMENT ON COLUMN eventos_grupo.no_hubo_reunion IS 'Indica si la reunión no se llevó a cabo';
COMMENT ON COLUMN eventos_grupo.motivo_no_reunion IS 'Motivo por el cual no hubo reunión';
