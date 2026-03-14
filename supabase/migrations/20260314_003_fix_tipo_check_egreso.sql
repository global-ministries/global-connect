-- Actualizar CHECK constraint para incluir 'egreso' y 'traslado' 
-- (el RPC usa 'egreso' pero el constraint solo tenía 'retiro')
ALTER TABLE solicitudes_grupo DROP CONSTRAINT IF EXISTS solicitudes_grupo_tipo_check;
ALTER TABLE solicitudes_grupo ADD CONSTRAINT solicitudes_grupo_tipo_check 
  CHECK (tipo = ANY (ARRAY['ingreso', 'transferencia', 'retiro', 'cambio_rol', 'edicion_asistencia', 'activacion_grupo', 'egreso', 'traslado']));
