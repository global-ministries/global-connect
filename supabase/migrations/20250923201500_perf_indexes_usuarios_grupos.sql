-- Optimización de búsquedas y subconsultas usadas por los RPC

-- Extensión para acelerar ILIKE con índices GIN/Trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices para búsquedas por nombre/apellido/email/cedula
CREATE INDEX IF NOT EXISTS idx_usuarios_nombre_trgm ON usuarios USING gin (lower(nombre) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_usuarios_apellido_trgm ON usuarios USING gin (lower(apellido) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_usuarios_email_trgm ON usuarios USING gin (lower(email) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_usuarios_cedula_trgm ON usuarios USING gin (lower(cedula) gin_trgm_ops);

-- Índices para filtros de grupos y roles
CREATE INDEX IF NOT EXISTS idx_grupo_miembros_usuario_activo ON grupo_miembros (usuario_id) WHERE fecha_salida IS NULL;
CREATE INDEX IF NOT EXISTS idx_grupo_miembros_grupo_rol_activo ON grupo_miembros (grupo_id, rol) WHERE fecha_salida IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario ON usuario_roles (usuario_id);
CREATE INDEX IF NOT EXISTS idx_roles_sistema_nombre_interno ON roles_sistema (nombre_interno);
CREATE INDEX IF NOT EXISTS idx_segmento_lideres_segmento_usuario_tipo ON segmento_lideres (segmento_id, usuario_id, tipo_lider);
