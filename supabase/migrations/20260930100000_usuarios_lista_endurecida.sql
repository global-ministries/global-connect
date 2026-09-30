-- Harden public.listar_usuarios_con_permisos (the Usuarios list).
--
-- What was wrong in the live function:
--   * It trusted the p_auth_id argument and never asked who was calling, and
--     anon could execute it, so anybody could read the list (name, email, phone,
--     cedula) as any person.
--   * The search text was concatenated into dynamic SQL, a
--     SQL injection sink.
--   * It picked ONE role per person with LIMIT 1 and no order, so a person who
--     is pastor and director general could get the narrower scope.
--   * The earlier hardening migration (20260618181650) never stayed live: a
--     later migration added p_campus_id with the old body.
--
-- What changes (signature and return type are unchanged, so the app needs no
-- change):
--   * Identity: p_auth_id must equal auth.uid(), unless the call comes from
--     service_role. Any other call returns no rows (no exception, callers keep
--     their current failure behavior).
--   * Highest role: admin > pastor > director-general > director-etapa > lider >
--     miembro decides the scope.
--   * Static SQL: one query, the role scope and every filter are conditions on
--     variables. The search is compared as a value with ILIKE ... ESCAPE, with
--     backslash, percent and underscore escaped so they match literally.
--   * Scopes are the same as before for every role; the director general scope
--     keeps using gdv_dg_grupos_visibles.
--   * Grants: anon and PUBLIC lose execute; authenticated and service_role keep
--     it.
--
-- p_campus_id is still accepted and still unused (kept for compatibility with
-- callers that send it).

CREATE OR REPLACE FUNCTION public.listar_usuarios_con_permisos(
  p_auth_id uuid,
  p_busqueda text DEFAULT ''::text,
  p_roles_filtro text[] DEFAULT '{}'::text[],
  p_con_email boolean DEFAULT NULL::boolean,
  p_con_telefono boolean DEFAULT NULL::boolean,
  p_en_grupo boolean DEFAULT NULL::boolean,
  p_limite integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_contexto_relacion boolean DEFAULT false,
  p_campus_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  nombre text,
  apellido text,
  email text,
  telefono text,
  cedula text,
  fecha_registro timestamp with time zone,
  rol_nombre_interno text,
  rol_nombre_visible text,
  foto_perfil_url text,
  total_count bigint,
  puede_ver boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_rol text;
  v_todo boolean;
  v_busqueda text := coalesce(p_busqueda, '');
  v_patron text;
BEGIN
  IF p_auth_id IS NULL THEN
    RETURN;
  END IF;

  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  SELECT u.id
    INTO v_usuario_id
    FROM public.usuarios u
   WHERE u.auth_id = p_auth_id;

  IF v_usuario_id IS NULL THEN
    RETURN;
  END IF;

  SELECT rs.nombre_interno
    INTO v_rol
    FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
   WHERE ur.usuario_id = v_usuario_id
   ORDER BY CASE rs.nombre_interno
              WHEN 'admin' THEN 1
              WHEN 'pastor' THEN 2
              WHEN 'director-general' THEN 3
              WHEN 'director-etapa' THEN 4
              WHEN 'lider' THEN 5
              WHEN 'miembro' THEN 6
              ELSE 99
            END
   LIMIT 1;

  IF v_rol IS NULL THEN
    RETURN;
  END IF;

  -- Who sees everybody: admin and pastor always; director general, director de
  -- etapa and lider when the caller asks for the relationship context.
  v_todo := v_rol IN ('admin', 'pastor')
         OR (coalesce(p_contexto_relacion, false)
             AND v_rol IN ('director-general', 'director-etapa', 'lider'));

  v_patron := '%'
    || replace(replace(replace(v_busqueda, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  RETURN QUERY
  WITH filtrados AS (
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
      u.foto_perfil_url
    FROM public.usuarios u
    LEFT JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    LEFT JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE (
        v_todo
        OR (v_rol = 'director-general' AND u.id IN (
              SELECT gm.usuario_id
                FROM public.grupo_miembros gm
                JOIN public.grupos g ON g.id = gm.grupo_id
               WHERE g.id IN (SELECT public.gdv_dg_grupos_visibles(v_usuario_id))
                 AND g.activo = true
                 AND COALESCE(g.eliminado, false) = false
                 AND gm.fecha_salida IS NULL
            ))
        OR (v_rol = 'director-etapa' AND u.id IN (
              SELECT gm.usuario_id
                FROM public.director_etapa_grupos deg
                JOIN public.segmento_lideres sl
                  ON sl.id = deg.director_etapa_id
                 AND sl.usuario_id = v_usuario_id
                 AND sl.tipo_lider = 'director_etapa'
                JOIN public.grupo_miembros gm
                  ON gm.grupo_id = deg.grupo_id
                 AND gm.fecha_salida IS NULL
            ))
        OR (v_rol = 'lider' AND u.id IN (
              SELECT gm.usuario_id
                FROM public.grupo_miembros gm
                JOIN public.grupo_miembros gm_lider ON gm_lider.grupo_id = gm.grupo_id
               WHERE gm_lider.usuario_id = v_usuario_id
                 AND gm_lider.rol = 'Líder'
                 AND gm_lider.fecha_salida IS NULL
                 AND gm.fecha_salida IS NULL
            ))
        OR (v_rol = 'miembro' AND (
              u.familia_id = (SELECT me.familia_id FROM public.usuarios me WHERE me.id = v_usuario_id)
              OR u.id IN (
                SELECT CASE
                         WHEN ru.usuario1_id = v_usuario_id THEN ru.usuario2_id
                         ELSE ru.usuario1_id
                       END
                  FROM public.relaciones_usuarios ru
                 WHERE ru.usuario1_id = v_usuario_id OR ru.usuario2_id = v_usuario_id
              )
              OR u.id = v_usuario_id
            ))
      )
      AND (
        v_busqueda = ''
        OR u.nombre ILIKE v_patron ESCAPE '\'
        OR u.apellido ILIKE v_patron ESCAPE '\'
        OR u.email ILIKE v_patron ESCAPE '\'
        OR u.cedula ILIKE v_patron ESCAPE '\'
      )
      AND (
        coalesce(cardinality(p_roles_filtro), 0) = 0
        OR rs.nombre_interno = ANY (p_roles_filtro)
      )
      AND (
        p_con_email IS NULL
        OR (p_con_email AND u.email IS NOT NULL AND u.email <> '')
        OR (NOT p_con_email AND (u.email IS NULL OR u.email = ''))
      )
      AND (
        p_con_telefono IS NULL
        OR (p_con_telefono AND u.telefono IS NOT NULL AND u.telefono <> '')
        OR (NOT p_con_telefono AND (u.telefono IS NULL OR u.telefono = ''))
      )
      AND (
        p_en_grupo IS NULL
        OR (p_en_grupo = EXISTS (
              SELECT 1 FROM public.grupo_miembros gm2
               WHERE gm2.usuario_id = u.id AND gm2.fecha_salida IS NULL
            ))
      )
  ),
  total AS (
    SELECT count(DISTINCT f.id) AS n FROM filtrados f
  )
  SELECT
    f.id,
    f.nombre,
    f.apellido,
    f.email,
    f.telefono,
    f.cedula,
    f.fecha_registro,
    f.rol_nombre_interno,
    f.rol_nombre_visible,
    f.foto_perfil_url,
    t.n::bigint AS total_count,
    true AS puede_ver
  FROM filtrados f
  CROSS JOIN total t
  ORDER BY f.nombre, f.apellido, f.id, f.rol_nombre_interno
  LIMIT greatest(coalesce(p_limite, 20), 0)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) IS
  'Usuarios list scoped by the highest role of the caller. The caller must be auth.uid() (or service_role). Static SQL; search text is matched literally. p_campus_id is accepted and unused.';
