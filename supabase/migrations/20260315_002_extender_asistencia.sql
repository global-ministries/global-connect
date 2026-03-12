-- Migración: Extender asistencia con tipo_presencia, visitantes, notas
-- Non-destructive: ADD COLUMN IF NOT EXISTS + migración de datos existentes
-- Preserva: columna `presente` y `motivo_inasistencia` existentes

ALTER TABLE asistencia
  ADD COLUMN IF NOT EXISTS tipo_presencia text DEFAULT 'presente'
    CHECK (tipo_presencia IN ('presente', 'ausente', 'tarde', 'justificado')),
  ADD COLUMN IF NOT EXISTS es_visitante boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS visitante_nombre text,
  ADD COLUMN IF NOT EXISTS nota text;

-- Migrar datos existentes: presente=false → tipo_presencia='ausente'
-- Los registros con presente=true ya tienen el default 'presente' correcto
UPDATE asistencia
  SET tipo_presencia = 'ausente'
  WHERE presente = false AND tipo_presencia = 'presente';

COMMENT ON COLUMN asistencia.tipo_presencia IS 'Tipo de presencia: presente, ausente, tarde, justificado';
COMMENT ON COLUMN asistencia.es_visitante IS 'Indica si el registro es de un visitante (no miembro)';
COMMENT ON COLUMN asistencia.visitante_nombre IS 'Nombre del visitante (solo si es_visitante = true)';
COMMENT ON COLUMN asistencia.nota IS 'Nota adicional sobre la asistencia del miembro';
