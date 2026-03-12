-- E8: Campos para tipo "tarde" enriquecido
ALTER TABLE asistencia ADD COLUMN IF NOT EXISTS tiempo_tardanza smallint;
ALTER TABLE asistencia ADD COLUMN IF NOT EXISTS motivo_tardanza text;
ALTER TABLE asistencia ADD COLUMN IF NOT EXISTS motivo_tardanza_otro text;

COMMENT ON COLUMN asistencia.tiempo_tardanza IS 'Minutos de tardanza (5,10,15,20,30,45,60)';
COMMENT ON COLUMN asistencia.motivo_tardanza IS 'Motivo de tardanza: trafico, hijos, trabajo, sin_razon, otro';
COMMENT ON COLUMN asistencia.motivo_tardanza_otro IS 'Detalle del motivo cuando es otro';
