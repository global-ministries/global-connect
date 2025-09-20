-- Actualizar función obtener_detalle_usuario para incluir foto_perfil_url
-- Ejecutar este SQL completo en Supabase SQL Editor

CREATE OR REPLACE FUNCTION obtener_detalle_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', u.id,
    'nombre', u.nombre,
    'apellido', u.apellido,
    'email', u.email,
    'telefono', u.telefono,
    'cedula', u.cedula,
    'fecha_nacimiento', u.fecha_nacimiento,
    'estado_civil', u.estado_civil,
    'genero', u.genero,
    'direccion_id', u.direccion_id,
    'familia_id', u.familia_id,
    'ocupacion_id', u.ocupacion_id,
    'profesion_id', u.profesion_id,
    'fecha_registro', u.fecha_registro,
    'auth_id', u.auth_id,
    'foto_perfil_url', u.foto_perfil_url,  -- ← CAMPO AGREGADO

    -- Ocupación
    'ocupacion', (
      SELECT jsonb_build_object(
        'id', o.id,
        'nombre', o.nombre
      )
      FROM ocupaciones o
      WHERE o.id = u.ocupacion_id
    ),

    -- Profesión
    'profesion', (
      SELECT jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre
      )
      FROM profesiones p
      WHERE p.id = u.profesion_id
    ),

    -- Dirección completa y anidada
    'direccion', (
      SELECT jsonb_build_object(
        'id', d.id,
        'calle', d.calle,
        'barrio', d.barrio,
        'codigo_postal', d.codigo_postal,
        'referencia', d.referencia,
        'latitud', d.latitud,
        'longitud', d.longitud,
        'parroquia', (
          SELECT jsonb_build_object(
            'id', pa.id,
            'nombre', pa.nombre,
            'municipio', (
              SELECT jsonb_build_object(
                'id', mu.id,
                'nombre', mu.nombre,
                'estado', (
                  SELECT jsonb_build_object(
                    'id', es.id,
                    'nombre', es.nombre,
                    'pais', (
                      SELECT jsonb_build_object(
                        'id', pa2.id,
                        'nombre', pa2.nombre
                      )
                      FROM paises pa2
                      WHERE pa2.id = es.pais_id
                    )
                  )
                  FROM estados es
                  WHERE es.id = mu.estado_id
                )
              )
              FROM municipios mu
              WHERE mu.id = pa.municipio_id
            )
          )
          FROM parroquias pa
          WHERE pa.id = d.parroquia_id
        )
      )
      FROM direcciones d
      WHERE d.id = u.direccion_id
    ),

    -- Roles
    'roles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nombre_visible', rs.nombre_visible,
        'nombre_interno', rs.nombre_interno
      )), '[]'::jsonb)
      FROM usuario_roles ur
      JOIN roles_sistema rs ON ur.rol_id = rs.id
      WHERE ur.usuario_id = u.id
    ),

    -- Relaciones familiares
    'relaciones', (
      SELECT COALESCE(jsonb_agg(rel), '[]'::jsonb)
      FROM (
        -- Relaciones donde el usuario es usuario1_id
        SELECT
          ru.id,
          ru.tipo_relacion,
          ru.es_principal,
          jsonb_build_object(
            'id', uf.id,
            'nombre', uf.nombre,
            'apellido', uf.apellido,
            'email', uf.email,
            'telefono', uf.telefono,
            'genero', uf.genero,
            'foto_perfil_url', uf.foto_perfil_url  -- ← CAMPO AGREGADO TAMBIÉN EN FAMILIARES
          ) AS familiar
        FROM relaciones_usuarios ru
        JOIN usuarios uf ON uf.id = ru.usuario2_id
        WHERE ru.usuario1_id = p_user_id

        UNION

        -- Relaciones donde el usuario es usuario2_id (tipo_relacion inversa)
        SELECT
          ru.id,
          CASE
            WHEN ru.tipo_relacion = 'padre' THEN 'hijo'
            WHEN ru.tipo_relacion = 'hijo' THEN 'padre'
            WHEN ru.tipo_relacion = 'conyuge' THEN 'conyuge'
            ELSE ru.tipo_relacion
          END AS tipo_relacion,
          ru.es_principal,
          jsonb_build_object(
            'id', uf.id,
            'nombre', uf.nombre,
            'apellido', uf.apellido,
            'email', uf.email,
            'telefono', uf.telefono,
            'genero', uf.genero,
            'foto_perfil_url', uf.foto_perfil_url  -- ← CAMPO AGREGADO TAMBIÉN EN FAMILIARES
          ) AS familiar
        FROM relaciones_usuarios ru
        JOIN usuarios uf ON uf.id = ru.usuario1_id
        WHERE ru.usuario2_id = p_user_id
      ) rel
    )
  )
  INTO resultado
  FROM usuarios u
  WHERE u.id = p_user_id;

  RETURN resultado;
END;
$$;
