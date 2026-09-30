-- Directors see everybody in Usuarios, without gaining edit rights.
--
-- What was wrong in the live functions:
--   * The Usuarios list showed a director general only the members of the groups
--     in their scope and a director de etapa only the members of their groups,
--     so neither could find a person to plan a season or add somebody to a
--     group.
--   * The totals card (obtener_estadisticas_usuarios_con_permisos) used another
--     rule than the list (everybody for the director general, the whole segment
--     for the director de etapa), trusted p_auth_id without asking who was
--     calling and was executable by anon and PUBLIC.
--   * The profile (obtener_detalle_usuario) used the EDIT rule as its only gate,
--     so a director could open only the profiles they could edit, and the family
--     relations inside it (puede_ver_relacion_familiar) needed edit rights over
--     both people.
--   * obtener_reporte_asistencia_usuario referenced columns that do not exist in
--     its director de etapa branch (deg.usuario_id) and its family branch
--     (ru.usuario_id, ru.relacionado_id), so those branches raised an error
--     instead of answering.
--
-- What changes (every function keeps its signature, return type, language,
-- volatility, SECURITY DEFINER and search_path; existing grants stay unless
-- stated):
--   * listar_usuarios_con_permisos: director-general and director-etapa see
--     everybody (v_todo), with or without p_contexto_relacion. Everything else
--     (static SQL, caller identity, highest role, grants) is as hardened in
--     20260930100000.
--   * obtener_estadisticas_usuarios_con_permisos: same scope as the list (admin,
--     pastor, director-general and director-etapa count everybody; lider and
--     miembro keep their rule), same identity rule (p_auth_id must be
--     auth.uid(), unless service_role; any other call gets zeros), highest role,
--     static SQL (the search is matched literally, as in the list), and the
--     p_campus_id filter is kept. anon and PUBLIC lose execute; authenticated and
--     service_role keep it.
--   * puede_ver_usuario_ficha (new): who may SEE a profile. True for the person
--     themself and for admin, pastor, director-general and director-etapa; for
--     everybody else it is puede_editar_usuario. obtener_detalle_usuario uses it
--     as its gate, so seeing no longer needs edit rights. Editing, photos,
--     relations management and the edit page keep using puede_editar_usuario and
--     puede_gestionar_relacion_familiar, which do not change.
--   * puede_ver_relacion_familiar: a relation is visible to its own people, and to
--     whoever may see the profile of both people of the relation.
--   * obtener_reporte_asistencia_usuario: only the two broken branches are fixed.
--     A director de etapa reaches the members of the groups in
--     director_etapa_grupos of their own segmento_lideres rows; a family member
--     is found through relaciones_usuarios.usuario1_id / usuario2_id. Who may see
--     the report does not widen, and the identity handling is untouched.

-- 1. List ---------------------------------------------------------------------
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

  -- Who sees everybody: admin, pastor, director general and director de etapa
  -- always; lider when the caller asks for the relationship context.
  v_todo := v_rol IN ('admin', 'pastor', 'director-general', 'director-etapa')
         OR (coalesce(p_contexto_relacion, false) AND v_rol = 'lider');

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
  'Usuarios list scoped by the highest role of the caller: admin, pastor, director-general and director-etapa see everybody; lider and miembro see their own scope. The caller must be auth.uid() (or service_role). Static SQL; search text is matched literally. p_campus_id is accepted and unused.';

-- 2. Statistics ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_estadisticas_usuarios_con_permisos(
  p_auth_id uuid,
  p_busqueda text DEFAULT ''::text,
  p_roles_filtro text[] DEFAULT '{}'::text[],
  p_con_email boolean DEFAULT NULL::boolean,
  p_con_telefono boolean DEFAULT NULL::boolean,
  p_en_grupo boolean DEFAULT NULL::boolean,
  p_campus_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  total_usuarios bigint,
  con_email bigint,
  con_telefono bigint,
  registrados_hoy bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_rol text;
  v_todo boolean;
  v_busqueda text := coalesce(p_busqueda, '');
  v_patron text;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else. Any other call gets zeros (no exception, callers keep their
  -- current behavior for an unknown person).
  IF p_auth_id IS NULL
     OR (coalesce(v_request_role, '') <> 'service_role'
         AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid())) THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  SELECT u.id
    INTO v_usuario_id
    FROM public.usuarios u
   WHERE u.auth_id = p_auth_id;

  IF v_usuario_id IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
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
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  -- Same scope as the list: these four roles count everybody.
  v_todo := v_rol IN ('admin', 'pastor', 'director-general', 'director-etapa');

  v_patron := '%'
    || replace(replace(replace(v_busqueda, '\', '\\'), '%', '\%'), '_', '\_')
    || '%';

  RETURN QUERY
  WITH permitidos AS (
    SELECT DISTINCT u.id, u.email, u.telefono, u.fecha_registro
    FROM public.usuarios u
    LEFT JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    LEFT JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE (
        v_todo
        OR (v_rol = 'lider' AND u.id IN (
              SELECT DISTINCT gm.usuario_id
                FROM public.grupo_miembros gm
                JOIN public.grupo_miembros gm_lider ON gm.grupo_id = gm_lider.grupo_id
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
      AND (
        p_campus_id IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.usuario_campus uc
           WHERE uc.usuario_id = u.id
             AND uc.campus_id = p_campus_id
        )
      )
  )
  SELECT
    count(*)::bigint,
    count(CASE WHEN p.email IS NOT NULL AND p.email <> '' THEN 1 END)::bigint,
    count(CASE WHEN p.telefono IS NOT NULL AND p.telefono <> '' THEN 1 END)::bigint,
    count(CASE WHEN date(p.fecha_registro) = current_date THEN 1 END)::bigint
  FROM permitidos p;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) IS
  'Usuarios totals with the same scope as listar_usuarios_con_permisos. The caller must be auth.uid() (or service_role), otherwise zeros. Static SQL; search text is matched literally.';

-- 3. Who may see a profile ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.puede_ver_usuario_ficha(
  p_auth_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_auth_id THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_actor_id
    FROM public.usuarios u
   WHERE u.auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- A person sees their own profile.
  IF v_actor_id = p_target_user_id THEN
    RETURN TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios t WHERE t.id = p_target_user_id) THEN
    RETURN FALSE;
  END IF;

  -- These roles see every profile (seeing is not editing).
  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_actor_id
       AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Everybody else sees the profiles they may edit.
  RETURN public.puede_editar_usuario(p_auth_id, p_target_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) IS
  'Who may SEE a user profile: the person themself, admin, pastor, director-general and director-etapa; everybody else needs puede_editar_usuario. Seeing does not grant editing. The caller must be auth.uid() (or service_role).';

-- 4. Profile ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_detalle_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_auth_id uuid := auth.uid();
  v_actor_id uuid;
  v_payload jsonb;
BEGIN
  IF v_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = v_actor_auth_id;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor user not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.puede_ver_usuario_ficha(v_actor_auth_id, p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to view this user' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'nombre', u.nombre,
    'apellido', u.apellido,
    'cedula', u.cedula,
    'email', u.email,
    'telefono', u.telefono,
    'fecha_nacimiento', u.fecha_nacimiento,
    'fecha_registro', u.fecha_registro,
    'estado_civil', u.estado_civil,
    'genero', u.genero,
    'foto_perfil_url', u.foto_perfil_url,
    'familia_id', u.familia_id,
    'direccion_id', u.direccion_id,
    'ocupacion_id', u.ocupacion_id,
    'profesion_id', u.profesion_id,
    'roles', COALESCE((
      SELECT jsonb_agg(rs.nombre_interno ORDER BY rs.nombre_interno)
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = u.id
    ), '[]'::jsonb),
    'ocupacion', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id', o.id, 'nombre', o.nombre) END,
    'profesion', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'nombre', p.nombre) END,
    'direccion', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', d.id,
      'calle', d.calle,
      'barrio', d.barrio,
      'codigo_postal', d.codigo_postal,
      'referencia', d.referencia,
      'latitud', d.latitud,
      'longitud', d.longitud,
      'parroquia', CASE WHEN par.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', par.id,
        'nombre', par.nombre,
        'municipio', CASE WHEN mun.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', mun.id,
          'nombre', mun.nombre,
          'estado', CASE WHEN est.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', est.id,
            'nombre', est.nombre,
            'pais', CASE WHEN pais.id IS NULL THEN NULL ELSE jsonb_build_object('id', pais.id, 'nombre', pais.nombre) END
          ) END
        ) END
      ) END
    ) END,
    'relaciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ru.id,
        'tipo_relacion', ru.tipo_relacion,
        'es_principal', ru.es_principal,
        'usuario1_id', ru.usuario1_id,
        'usuario2_id', ru.usuario2_id,
        'familiar', jsonb_build_object(
          'id', familiar.id,
          'nombre', familiar.nombre,
          'apellido', familiar.apellido,
          'email', familiar.email,
          'telefono', familiar.telefono,
          'genero', familiar.genero,
          'foto_perfil_url', familiar.foto_perfil_url
        )
      ) ORDER BY familiar.apellido, familiar.nombre)
      FROM public.relaciones_usuarios ru
      JOIN public.usuarios familiar
        ON familiar.id = CASE WHEN ru.usuario1_id = u.id THEN ru.usuario2_id ELSE ru.usuario1_id END
      WHERE (ru.usuario1_id = u.id OR ru.usuario2_id = u.id)
        AND public.puede_ver_relacion_familiar(v_actor_auth_id, ru.usuario1_id, ru.usuario2_id)
    ), '[]'::jsonb)
  )
  INTO v_payload
  FROM public.usuarios u
  LEFT JOIN public.ocupaciones o ON o.id = u.ocupacion_id
  LEFT JOIN public.profesiones p ON p.id = u.profesion_id
  LEFT JOIN public.direcciones d ON d.id = u.direccion_id
  LEFT JOIN public.parroquias par ON par.id = d.parroquia_id
  LEFT JOIN public.municipios mun ON mun.id = par.municipio_id
  LEFT JOIN public.estados est ON est.id = mun.estado_id
  LEFT JOIN public.paises pais ON pais.id = est.pais_id
  WHERE u.id = p_user_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = '02000';
  END IF;

  RETURN v_payload;
END;
$function$;

-- 5. Family relations inside a profile ----------------------------------------
CREATE OR REPLACE FUNCTION public.puede_ver_relacion_familiar(
  p_auth_id uuid,
  p_usuario1_id uuid,
  p_usuario2_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT u.id INTO v_actor_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF v_actor_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_usuario1_id = v_actor_id OR p_usuario2_id = v_actor_id THEN
    RETURN TRUE;
  END IF;

  -- Viewing the relation needs viewing both people (managing it still needs
  -- puede_gestionar_relacion_familiar, which is unchanged).
  RETURN public.puede_ver_usuario_ficha(p_auth_id, p_usuario1_id)
     AND public.puede_ver_usuario_ficha(p_auth_id, p_usuario2_id);
END;
$function$;

-- 6. Attendance report of one person ------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_asistencia_usuario(
  p_usuario_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL::date,
  p_fecha_fin date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_auth_user_id uuid;
  v_puede_ver boolean := false;
  v_es_admin boolean := false;
  v_result jsonb;
  v_kpis jsonb;
  v_series_temporales jsonb;
  v_historial_eventos jsonb;
BEGIN
  -- 1. Obtener el user_id interno desde auth_id del solicitante
  SELECT id INTO v_auth_user_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario solicitante no encontrado');
  END IF;

  -- 2. Validar permisos: el solicitante puede ver el reporte si:

  -- 2a. Es el mismo usuario
  IF v_auth_user_id = p_usuario_id THEN
    v_puede_ver := true;
  END IF;

  -- 2b. Es un rol superior (admin, pastor, director-general)
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = v_auth_user_id
        AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
    ) INTO v_es_admin;

    IF v_es_admin THEN
      v_puede_ver := true;
    END IF;
  END IF;

  -- 2c. Es líder de un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.grupo_miembros gm_lider
      JOIN public.grupo_miembros gm_miembro ON gm_miembro.grupo_id = gm_lider.grupo_id
      WHERE gm_lider.usuario_id = v_auth_user_id
        AND gm_lider.rol = 'Líder'
        AND gm_miembro.usuario_id = p_usuario_id
    ) INTO v_puede_ver;
  END IF;

  -- 2d. Es director de etapa asignado a un grupo al que p_usuario_id pertenece
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl
        ON sl.id = deg.director_etapa_id
       AND sl.usuario_id = v_auth_user_id
       AND sl.tipo_lider = 'director_etapa'
      JOIN public.grupo_miembros gm ON gm.grupo_id = deg.grupo_id
      WHERE gm.usuario_id = p_usuario_id
        AND gm.fecha_salida IS NULL
    ) INTO v_puede_ver;
  END IF;

  -- 2e. Es familiar directo
  IF NOT v_puede_ver THEN
    SELECT EXISTS (
      SELECT 1 FROM public.relaciones_usuarios ru
      WHERE (ru.usuario1_id = v_auth_user_id AND ru.usuario2_id = p_usuario_id)
         OR (ru.usuario1_id = p_usuario_id AND ru.usuario2_id = v_auth_user_id)
    ) INTO v_puede_ver;
  END IF;

  -- Si no tiene permisos, retornar error con debug info
  IF NOT v_puede_ver THEN
    RETURN jsonb_build_object(
      'error', 'Sin permisos para ver este reporte',
      'debug', jsonb_build_object(
        'v_auth_user_id', v_auth_user_id,
        'p_usuario_id', p_usuario_id,
        'v_es_admin', v_es_admin
      )
    );
  END IF;

  -- 3. Establecer fechas por defecto si no se proporcionan (últimos 12 meses)
  IF p_fecha_inicio IS NULL THEN
    p_fecha_inicio := CURRENT_DATE - INTERVAL '12 months';
  END IF;

  IF p_fecha_fin IS NULL THEN
    p_fecha_fin := CURRENT_DATE;
  END IF;

  -- 4. Calcular KPIs
  WITH eventos_usuario AS (
    SELECT
      a.id,
      a.presente,
      a.evento_grupo_id,
      eg.grupo_id,
      eg.fecha,
      g.nombre AS grupo_nombre
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  kpis_calc AS (
    SELECT
      -- Porcentaje de asistencia general
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia_general,
      -- Total de grupos activos (grupos donde ha tenido al menos un evento)
      COUNT(DISTINCT grupo_id) AS total_grupos_activos,
      -- Grupo más frecuente
      (
        SELECT jsonb_build_object(
          'id', grupo_id,
          'nombre', grupo_nombre
        )
        FROM eventos_usuario
        GROUP BY grupo_id, grupo_nombre
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS grupo_mas_frecuente,
      -- Última fecha de asistencia
      (
        SELECT MAX(fecha)
        FROM eventos_usuario
        WHERE presente = true
      ) AS ultima_asistencia_fecha
    FROM eventos_usuario
  )
  SELECT jsonb_build_object(
    'porcentaje_asistencia_general', porcentaje_asistencia_general,
    'total_grupos_activos', total_grupos_activos,
    'grupo_mas_frecuente', COALESCE(grupo_mas_frecuente, jsonb_build_object('id', null, 'nombre', 'N/D')),
    'ultima_asistencia_fecha', ultima_asistencia_fecha
  )
  INTO v_kpis
  FROM kpis_calc;

  -- 5. Calcular series temporales (agrupadas por mes)
  WITH eventos_con_mes AS (
    SELECT
      DATE_TRUNC('month', eg.fecha::timestamp)::date AS mes,
      a.presente
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
  ),
  series_mensuales AS (
    SELECT
      mes,
      COALESCE(
        ROUND(
          (COUNT(*) FILTER (WHERE presente = true)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100,
          1
        ),
        0
      ) AS porcentaje_asistencia
    FROM eventos_con_mes
    GROUP BY mes
    ORDER BY mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', mes,
      'porcentaje_asistencia', porcentaje_asistencia
    )
  )
  INTO v_series_temporales
  FROM series_mensuales;

  -- 6. Obtener historial de eventos
  WITH historial AS (
    SELECT
      eg.fecha,
      g.nombre AS grupo_nombre,
      g.id AS grupo_id,
      eg.tema,
      CASE WHEN a.presente THEN 'Presente' ELSE 'Ausente' END AS estado
    FROM public.asistencia a
    JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
    JOIN public.grupos g ON g.id = eg.grupo_id
    WHERE a.usuario_id = p_usuario_id
      AND eg.fecha >= p_fecha_inicio
      AND eg.fecha <= p_fecha_fin
    ORDER BY eg.fecha DESC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'grupo_nombre', grupo_nombre,
      'grupo_id', grupo_id,
      'tema', COALESCE(tema, 'Sin tema'),
      'estado', estado,
      'motivo_ausencia', null
    )
  )
  INTO v_historial_eventos
  FROM historial;

  -- 7. Construir el resultado final
  v_result := jsonb_build_object(
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'series_temporales', COALESCE(v_series_temporales, '[]'::jsonb),
    'historial_eventos', COALESCE(v_historial_eventos, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;
