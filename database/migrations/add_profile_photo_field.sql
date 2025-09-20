-- Migración: Agregar campo de foto de perfil a tabla usuarios
-- Fecha: 2025-01-20
-- Descripción: Agrega campo foto_perfil_url para almacenar URLs de fotos de perfil desde Supabase Storage

-- Agregar columna foto_perfil_url a la tabla usuarios
ALTER TABLE usuarios 
ADD COLUMN foto_perfil_url TEXT;

-- Agregar comentario descriptivo
COMMENT ON COLUMN usuarios.foto_perfil_url IS 'URL de la foto de perfil del usuario almacenada en Supabase Storage';

-- Crear índice para mejorar consultas (opcional, si se necesita buscar por foto)
-- CREATE INDEX idx_usuarios_foto_perfil ON usuarios(foto_perfil_url) WHERE foto_perfil_url IS NOT NULL;

-- Política de seguridad RLS para fotos de perfil
-- Los usuarios pueden ver y actualizar su propia foto de perfil
-- Los administradores pueden ver todas las fotos

-- Política para SELECT (ver fotos)
CREATE POLICY "usuarios_can_view_profile_photos" ON usuarios
FOR SELECT USING (
  auth.uid()::text = auth_id OR
  EXISTS (
    SELECT 1 FROM usuario_roles ur
    JOIN roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = auth.uid()::text 
    AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
  )
);

-- Política para UPDATE (actualizar foto propia)
CREATE POLICY "usuarios_can_update_own_profile_photo" ON usuarios
FOR UPDATE USING (auth.uid()::text = auth_id)
WITH CHECK (auth.uid()::text = auth_id);
