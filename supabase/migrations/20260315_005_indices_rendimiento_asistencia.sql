-- Migración: Índices de rendimiento para asistencia avanzada y reportes
-- Optimiza queries frecuentes de la vista v_salud_miembros_grupo y reportes

CREATE INDEX IF NOT EXISTS idx_asistencia_evento_usuario
  ON asistencia(evento_grupo_id, usuario_id);

CREATE INDEX IF NOT EXISTS idx_asistencia_tipo_presencia
  ON asistencia(tipo_presencia);

CREATE INDEX IF NOT EXISTS idx_eventos_grupo_tipo
  ON eventos_grupo(tipo);

CREATE INDEX IF NOT EXISTS idx_eventos_grupo_fecha_desc
  ON eventos_grupo(fecha DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_grupo_no_reunion
  ON eventos_grupo(no_hubo_reunion) WHERE no_hubo_reunion = true;
