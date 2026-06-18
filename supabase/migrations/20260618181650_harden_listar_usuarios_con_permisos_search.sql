-- Harden listar_usuarios_con_permisos search by removing dynamic SQL interpolation.
-- Search input is treated as literal text, including quotes and LIKE metacharacters.

CREATE OR REPLACE FUNCTION public.listar_usuarios_con_permisos(
  p_auth_id uuid,
  p_busqueda text DEFAULT '',
  p_roles_filtro text[] DEFAULT '{}',
  p_con_email boolean DEFAULT NULL,
  p_con_telefono boolean DEFAULT NULL,
  p_en_grupo boolean DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_contexto_relacion boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  cedula text,
  fecha_registro timestamptz,
  rol_nombre_interno text,
  rol_nombre_visible text,
  foto_perfil_url text,
  total_count bigint,
  puede_ver boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  usuario_rol text;
  usuario_interno_id uuid;
  v_busqueda_like text;
  v_limite integer := greatest(coalesce(p_limite, 20), 0);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
BEGIN
  SELECT u.id, rs.nombre_interno
  INTO usuario_interno_id, usuario_rol
  FROM public.usuarios u
  JOIN public.usuario_roles ur ON u.id = ur.usuario_id
  JOIN public.roles_sistema rs ON ur.rol_id = rs.id
  WHERE u.auth_id = p_auth_id
  LIMIT 1;

  IF usuario_interno_id IS NULL THEN
    RETURN;
  END IF;

  v_busqueda_like := replace(
    replace(
      replace(trim(coalesce(p_busqueda, '')), E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  );

  RETURN QUERY
  WITH usuarios_visibles AS MATERIALIZED (
    SELECT DISTINCT
      u.id,
      u.nombre,
      u.apellido,
      u.email,
      u.telefono,
      u.cedula,
      u.fecha_registro,
      rs.nombre_interno AS rol_nombre_interno,
      rs.nombre_visible AS rol_nombre_visible,
      u.foto_perfil_url,
      true AS puede_ver
    FROM public.usuarios u
    LEFT JOIN public.usuario_roles ur ON u.id = ur.usuario_id
    LEFT JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE (
      usuario_rol IN ('admin', 'pastor', 'director-general')
      OR (usuario_rol = 'director-etapa' AND p_contexto_relacion IS TRUE)
      OR (
        usuario_rol = 'director-etapa'
        AND p_contexto_relacion IS NOT TRUE
        AND EXISTS (
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.segmento_lideres sl
            ON deg.director_etapa_id = sl.id
            AND sl.usuario_id = usuario_interno_id
            AND sl.tipo_lider = 'director_etapa'
          JOIN public.grupo_miembros gm
            ON gm.grupo_id = deg.grupo_id
            AND gm.fecha_salida IS NULL
          WHERE gm.usuario_id = u.id
        )
      )
      OR (usuario_rol = 'lider' AND p_contexto_relacion IS TRUE)
      OR (
        usuario_rol = 'lider'
        AND p_contexto_relacion IS NOT TRUE
        AND EXISTS (
          SELECT 1
          FROM public.grupo_miembros gm
          JOIN public.grupo_miembros gm_lider
            ON gm.grupo_id = gm_lider.grupo_id
          WHERE gm.usuario_id = u.id
            AND gm.fecha_salida IS NULL
            AND gm_lider.usuario_id = usuario_interno_id
            AND gm_lider.rol = 'Líder'
            AND gm_lider.fecha_salida IS NULL
        )
      )
      OR (
        usuario_rol = 'miembro'
        AND (
          u.familia_id = (SELECT u2.familia_id FROM public.usuarios u2 WHERE u2.id = usuario_interno_id)
          OR u.id IN (
            SELECT CASE
              WHEN ru.usuario1_id = usuario_interno_id THEN ru.usuario2_id
              ELSE ru.usuario1_id
            END
            FROM public.relaciones_usuarios ru
            WHERE ru.usuario1_id = usuario_interno_id OR ru.usuario2_id = usuario_interno_id
          )
          OR u.id = usuario_interno_id
        )
      )
    )
      AND (
        v_busqueda_like = ''
        OR u.nombre ILIKE '%' || v_busqueda_like || '%' ESCAPE E'\\'
        OR u.apellido ILIKE '%' || v_busqueda_like || '%' ESCAPE E'\\'
        OR u.email ILIKE '%' || v_busqueda_like || '%' ESCAPE E'\\'
        OR u.cedula ILIKE '%' || v_busqueda_like || '%' ESCAPE E'\\'
      )
      AND (
        p_roles_filtro IS NULL
        OR cardinality(p_roles_filtro) = 0
        OR rs.nombre_interno = ANY(p_roles_filtro)
      )
      AND (
        p_con_email IS NULL
        OR (p_con_email IS TRUE AND nullif(u.email, '') IS NOT NULL)
        OR (p_con_email IS FALSE AND nullif(u.email, '') IS NULL)
      )
      AND (
        p_con_telefono IS NULL
        OR (p_con_telefono IS TRUE AND nullif(u.telefono, '') IS NOT NULL)
        OR (p_con_telefono IS FALSE AND nullif(u.telefono, '') IS NULL)
      )
      AND (
        p_en_grupo IS NULL
        OR (
          p_en_grupo IS TRUE
          AND EXISTS (
            SELECT 1
            FROM public.grupo_miembros gm2
            JOIN public.grupos g2 ON g2.id = gm2.grupo_id
            WHERE gm2.usuario_id = u.id
              AND gm2.fecha_salida IS NULL
              AND g2.activo = true
              AND g2.eliminado = false
          )
        )
        OR (
          p_en_grupo IS FALSE
          AND NOT EXISTS (
            SELECT 1
            FROM public.grupo_miembros gm2
            JOIN public.grupos g2 ON g2.id = gm2.grupo_id
            WHERE gm2.usuario_id = u.id
              AND gm2.fecha_salida IS NULL
              AND g2.activo = true
              AND g2.eliminado = false
          )
        )
      )
  ), total AS (
    SELECT count(DISTINCT uv.id)::bigint AS total_count
    FROM usuarios_visibles uv
  )
  SELECT
    uv.id,
    uv.nombre,
    uv.apellido,
    uv.email,
    uv.telefono,
    uv.cedula,
    uv.fecha_registro,
    uv.rol_nombre_interno,
    uv.rol_nombre_visible,
    uv.foto_perfil_url,
    total.total_count,
    uv.puede_ver
  FROM usuarios_visibles uv
  CROSS JOIN total
  ORDER BY uv.nombre, uv.apellido
  LIMIT v_limite OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean) TO authenticated, service_role;
