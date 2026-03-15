-- Migración: Agregar columnas de configuración de asistencia avanzada
-- Agrega 11 columnas nuevas a configuracion_grupos_vida

ALTER TABLE configuracion_grupos_vida
  ADD COLUMN IF NOT EXISTS modo_cierre_asistencia text DEFAULT 'semanal'
    CHECK (modo_cierre_asistencia IN ('semanal', 'libre', 'ultimas_2_semanas', 'ultimo_mes')),
  ADD COLUMN IF NOT EXISTS dia_cierre_semanal integer DEFAULT 0,  -- 0=domingo
  ADD COLUMN IF NOT EXISTS hora_cierre text DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS visitantes_habilitados boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS puntos_oracion_compartidos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS umbral_atencion integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS umbral_riesgo integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS umbral_critico integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS correo_semanal_habilitado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_envio_correo integer DEFAULT 1,  -- 1=lunes
  ADD COLUMN IF NOT EXISTS hora_envio_correo text DEFAULT '08:00';

COMMENT ON COLUMN configuracion_grupos_vida.modo_cierre_asistencia IS 'Modo de cierre de ventana de edición de asistencia';
COMMENT ON COLUMN configuracion_grupos_vida.dia_cierre_semanal IS 'Día de cierre semanal (0=domingo, 6=sábado)';
COMMENT ON COLUMN configuracion_grupos_vida.hora_cierre IS 'Hora de cierre de la ventana (formato HH:MM)';
COMMENT ON COLUMN configuracion_grupos_vida.visitantes_habilitados IS 'Habilita el registro de visitantes en asistencia';
COMMENT ON COLUMN configuracion_grupos_vida.puntos_oracion_compartidos IS 'Los puntos de oración son visibles para los miembros';
COMMENT ON COLUMN configuracion_grupos_vida.umbral_atencion IS 'Semanas ausente para nivel de atención';
COMMENT ON COLUMN configuracion_grupos_vida.umbral_riesgo IS 'Semanas ausente para nivel de riesgo';
COMMENT ON COLUMN configuracion_grupos_vida.umbral_critico IS 'Semanas ausente para nivel crítico';
COMMENT ON COLUMN configuracion_grupos_vida.correo_semanal_habilitado IS 'Habilita el correo semanal de reportes';
COMMENT ON COLUMN configuracion_grupos_vida.dia_envio_correo IS 'Día de envío del correo semanal (0=domingo)';
COMMENT ON COLUMN configuracion_grupos_vida.hora_envio_correo IS 'Hora de envío del correo semanal (formato HH:MM)';
