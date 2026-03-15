-- Migración: Agregar configuración de rol mínimo para eliminar miembros de grupo
-- Default: director-etapa (envía solicitud, no elimina directamente)
-- Opciones: director-etapa, director-general, pastor, admin

ALTER TABLE configuracion_grupos_vida
  ADD COLUMN IF NOT EXISTS rol_minimo_eliminar_miembro text NOT NULL DEFAULT 'director-etapa'
    CHECK (rol_minimo_eliminar_miembro IN ('director-etapa', 'director-general', 'pastor', 'admin'));

COMMENT ON COLUMN configuracion_grupos_vida.rol_minimo_eliminar_miembro
  IS 'Rol mínimo del sistema para eliminar miembros de un grupo. Roles inferiores al configurado envían solicitud en lugar de eliminar directamente.';
