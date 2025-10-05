CREATE OR REPLACE FUNCTION buscar_usuarios_para_gestion(
    p_termino_busqueda TEXT,
    p_exclude_user_id UUID
)
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    apellido TEXT,
    email TEXT,
    genero TEXT,
    cedula TEXT,
    foto_perfil_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role TEXT;
    v_auth_uid UUID;
BEGIN
    v_auth_uid := auth.uid();
    
    SELECT raw_user_meta_data->>'rol_interno' INTO v_user_role
    FROM auth.users
    WHERE auth.users.id = v_auth_uid;

    IF v_user_role IN ('admin', 'pastor', 'director-general', 'director-etapa', 'lider') THEN
        RETURN QUERY
        SELECT
            u.id,
            u.nombre,
            u.apellido,
            u.email,
            u.genero,
            u.cedula,
            u.foto_perfil_url
        FROM
            usuarios AS u
        WHERE
            u.id <> p_exclude_user_id
            AND (
                u.nombre ILIKE '%' || p_termino_busqueda || '%' OR
                u.apellido ILIKE '%' || p_termino_busqueda || '%' OR
                u.cedula ILIKE '%' || p_termino_busqueda || '%' OR
                u.email ILIKE '%' || p_termino_busqueda || '%'
            );
    ELSE
        -- **SECCIÓN DE DEPURACIÓN**
        -- Si el rol no es el correcto, devolvemos un resultado falso para depurar.
        RETURN QUERY
        SELECT
            '00000000-0000-0000-0000-000000000000'::UUID AS id,
            'Error de Rol' AS nombre,
            COALESCE(v_user_role, 'Rol no encontrado (NULL)') AS apellido,
            v_auth_uid::TEXT AS email,
            'debug' AS genero,
            'debug' AS cedula,
            NULL AS foto_perfil_url;
    END IF;
END;
$$;