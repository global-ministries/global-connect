-- Migración: Agregar tipo 'edicion_asistencia' al CHECK de solicitudes_grupo
-- Reutiliza la infraestructura de solicitudes de Fase 2

-- Primero, verificar y expandir el CHECK constraint para tipo_solicitud
DO $$
BEGIN
  -- Intentar agregar el nuevo valor al check existente
  -- Primero removemos el constraint y lo recreamos con el valor nuevo
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'solicitudes_grupo'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%tipo_solicitud%'
  ) THEN
    -- Obtener el nombre exacto del constraint
    EXECUTE (
      SELECT 'ALTER TABLE solicitudes_grupo DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'solicitudes_grupo'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%tipo_solicitud%'
      LIMIT 1
    );
  END IF;
END $$;

-- Recrear con el nuevo tipo incluido
ALTER TABLE solicitudes_grupo
  ADD CONSTRAINT solicitudes_grupo_tipo_solicitud_check
  CHECK (tipo_solicitud IN (
    'ingreso', 'transferencia', 'retiro', 'cambio_rol',
    'edicion_asistencia'
  ));

-- Agregar columna para metadata específica de edición de asistencia
ALTER TABLE solicitudes_grupo
  ADD COLUMN IF NOT EXISTS metadata_edicion jsonb;

COMMENT ON COLUMN solicitudes_grupo.metadata_edicion IS
  'Metadata para solicitudes de edición de asistencia: {fecha_evento, grupo_id, motivo}';
