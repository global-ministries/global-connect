-- Configuración de Supabase Storage para fotos de perfil
-- Fecha: 2025-01-20
-- Descripción: Crear bucket y políticas de seguridad para fotos de perfil

-- Crear bucket para fotos de perfil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880, -- 5MB en bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
);

-- Política para permitir a usuarios autenticados subir sus propias fotos
CREATE POLICY "usuarios_can_upload_own_profile_photo" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir a usuarios autenticados actualizar sus propias fotos
CREATE POLICY "usuarios_can_update_own_profile_photo" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir a usuarios autenticados eliminar sus propias fotos
CREATE POLICY "usuarios_can_delete_own_profile_photo" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir a todos ver las fotos de perfil (son públicas)
CREATE POLICY "profile_photos_are_publicly_viewable" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-photos');

-- Habilitar RLS en el bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Comentarios para documentación
COMMENT ON POLICY "usuarios_can_upload_own_profile_photo" ON storage.objects IS 
'Permite a usuarios autenticados subir fotos a su propia carpeta en profile-photos';

COMMENT ON POLICY "usuarios_can_update_own_profile_photo" ON storage.objects IS 
'Permite a usuarios autenticados actualizar sus propias fotos de perfil';

COMMENT ON POLICY "usuarios_can_delete_own_profile_photo" ON storage.objects IS 
'Permite a usuarios autenticados eliminar sus propias fotos de perfil';

COMMENT ON POLICY "profile_photos_are_publicly_viewable" ON storage.objects IS 
'Permite a cualquiera ver las fotos de perfil (son públicas por naturaleza)';

-- Función auxiliar para obtener el nombre de la carpeta desde el path
-- Esta función ya existe en Supabase, pero la documentamos aquí
-- storage.foldername(name) devuelve un array con los segmentos del path
-- Por ejemplo: 'user123/photo.jpg' -> ['user123', 'photo.jpg']
