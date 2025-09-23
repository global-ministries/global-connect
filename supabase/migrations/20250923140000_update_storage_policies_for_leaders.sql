-- Actualización de políticas de Storage para permitir a líderes gestionar fotos de perfil
-- Fecha: 2025-09-23
-- Descripción: Permitir a líderes subir/actualizar/eliminar fotos de perfil de otros usuarios

-- Función auxiliar para verificar si un usuario es líder
CREATE OR REPLACE FUNCTION public.es_lider_usuario(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id uuid;
    es_lider boolean := false;
BEGIN
    -- Obtener el ID del usuario autenticado
    SELECT u.id INTO current_user_id
    FROM public.usuarios u
    WHERE u.auth_id = auth.uid();
    
    -- Si no se encuentra el usuario, no es líder
    IF current_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Si es el mismo usuario, permitir (gestión propia)
    IF current_user_id = target_user_id THEN
        RETURN true;
    END IF;
    
    -- Verificar si el usuario actual es líder de algún grupo donde el usuario objetivo es miembro
    SELECT EXISTS(
        SELECT 1
        FROM public.grupos_miembros gm1
        INNER JOIN public.grupos_miembros gm2 ON gm1.grupo_id = gm2.grupo_id
        WHERE gm1.usuario_id = current_user_id
        AND gm1.rol IN ('Líder', 'Colíder')
        AND gm2.usuario_id = target_user_id
    ) INTO es_lider;
    
    RETURN es_lider;
END;
$$;

-- Eliminar políticas existentes para recrearlas
DROP POLICY IF EXISTS "usuarios_can_upload_own_profile_photo" ON storage.objects;
DROP POLICY IF EXISTS "usuarios_can_update_own_profile_photo" ON storage.objects;
DROP POLICY IF EXISTS "usuarios_can_delete_own_profile_photo" ON storage.objects;

-- Nueva política para subir fotos (propia o como líder)
CREATE POLICY "usuarios_can_upload_profile_photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-photos' AND
  public.es_lider_usuario((storage.foldername(name))[1]::uuid)
);

-- Nueva política para actualizar fotos (propia o como líder)
CREATE POLICY "usuarios_can_update_profile_photos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-photos' AND
  public.es_lider_usuario((storage.foldername(name))[1]::uuid)
);

-- Nueva política para eliminar fotos (propia o como líder)
CREATE POLICY "usuarios_can_delete_profile_photos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-photos' AND
  public.es_lider_usuario((storage.foldername(name))[1]::uuid)
);

-- Comentarios para documentación
COMMENT ON FUNCTION public.es_lider_usuario(uuid) IS 
'Verifica si el usuario autenticado puede gestionar fotos del usuario objetivo (propio o como líder)';

COMMENT ON POLICY "usuarios_can_upload_profile_photos" ON storage.objects IS 
'Permite a usuarios subir fotos propias o de miembros de sus grupos (si son líderes)';

COMMENT ON POLICY "usuarios_can_update_profile_photos" ON storage.objects IS 
'Permite a usuarios actualizar fotos propias o de miembros de sus grupos (si son líderes)';

COMMENT ON POLICY "usuarios_can_delete_profile_photos" ON storage.objects IS 
'Permite a usuarios eliminar fotos propias o de miembros de sus grupos (si son líderes)';
