-- Usuarios: each person sees only their own campus; admin is the only global
-- role.
--
-- What was wrong in the live functions (20260930110000):
--   * listar_usuarios_con_permisos let admin, pastor, director general and
--     director de etapa (and a lider asking for the relationship context) list
--     every person of every campus, and it ignored p_campus_id, so the header
--     campus selector did not narrow the list.
--   * obtener_estadisticas_usuarios_con_permisos applied p_campus_id but used
--     the same "everybody" scope, so its totals did not match the list.
--   * puede_ver_usuario_ficha (the gate of obtener_detalle_usuario, and through
--     it of puede_ver_relacion_familiar) let those roles open the profile of
--     anybody in any campus.
--
-- The rule (user decision): every person sees only their campus; the pastor
-- sees everything inside their campus; the system admin is the only role that
-- sees every campus. A person's campuses are their usuario_campus rows.
--
-- What changes (signatures, return types, language, volatility, SECURITY
-- DEFINER, search_path, identity checks and grants are unchanged):
--   * listar_usuarios_con_permisos: admin lists everybody; pastor, director
--     general, director de etapa and a lider with p_contexto_relacion list the
--     people with a usuario_campus row in one of the caller's campuses. lider
--     (members of their groups) and miembro (family, relations, self) keep their
--     narrower scope. p_campus_id now narrows the list to that campus for every
--     role; a non-admin passing a campus outside their own gets nobody.
--   * obtener_estadisticas_usuarios_con_permisos: the same scope and campus
--     rule, so its total equals the list total_count for the same inputs.
--   * puede_ver_usuario_ficha: self and admin as before; pastor, director
--     general and director de etapa only for people who share one of their
--     campuses; everybody else still needs puede_editar_usuario.
--   * People with no usuario_campus row are visible only to admin (and to the
--     narrower lider/miembro scopes that already reach them).
--
--   * A pastor outside their campuses does not fall back to
--     puede_editar_usuario, whose pastor rule is still global.
--
-- Not changed here: puede_editar_usuario (pastor can still edit anybody),
-- puede_gestionar_relacion_familiar and obtener_reporte_asistencia_usuario
-- keep their own rules.
--
--   * Data (user decision): people with no usuario_campus row would vanish
--     from the pastors' and directors' list, so while the organization has a
--     single campus every such person gets it as their main campus (43 people
--     in production on 2026-10-29). With more than one campus nothing is
--     assigned. Only rows are added; nothing is updated or deleted.
--   * New people keep a campus (section 5): the Usuarios form, the group import
--     and the account link create usuarios rows without usuario_campus, so they
--     would vanish from every campus-scoped list. A deferred constraint trigger
--     on usuarios runs at commit, after the creating function had its chance to
--     write usuario_campus itself (the Niños and Dream Team flows do), and only
--     when the person still has no campus it adds the creator's main campus, or
--     the only campus when there is exactly one. Otherwise nothing is added.
--
-- Rollback: re-apply sections 1, 2 and 3 of
-- 20260930110000_usuarios_directores_ven_a_todos.sql, then
--   DROP TRIGGER IF EXISTS usuarios_campus_por_defecto ON public.usuarios;
--   DROP FUNCTION IF EXISTS public.usuarios_asignar_campus_por_defecto();
-- The added usuario_campus rows are correct data and stay.

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
  v_global boolean;
  v_campus uuid[];
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

  -- Who sees a whole campus: admin, pastor, director general and director de
  -- etapa always; lider when the caller asks for the relationship context.
  -- Only admin sees every campus; the others see the people of their own
  -- campuses (usuario_campus).
  v_todo := v_rol IN ('admin', 'pastor', 'director-general', 'director-etapa')
         OR (coalesce(p_contexto_relacion, false) AND v_rol = 'lider');
  v_global := v_rol = 'admin';
  SELECT coalesce(array_agg(uc.campus_id), '{}'::uuid[])
    INTO v_campus
    FROM public.usuario_campus uc
   WHERE uc.usuario_id = v_usuario_id;

  -- A campus filter outside the caller's own campuses returns nobody.
  IF p_campus_id IS NOT NULL AND NOT v_global AND NOT (p_campus_id = ANY (v_campus)) THEN
    RETURN;
  END IF;

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
        (v_todo AND (
          v_global
          OR EXISTS (
            SELECT 1
              FROM public.usuario_campus uc
             WHERE uc.usuario_id = u.id
               AND uc.campus_id = ANY (v_campus)
          )
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
      AND (
        p_campus_id IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.usuario_campus uc
           WHERE uc.usuario_id = u.id
             AND uc.campus_id = p_campus_id
        )
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
  'Usuarios list scoped by the highest role of the caller: admin sees every campus; pastor, director-general and director-etapa (and lider with p_contexto_relacion) see the people of their own campuses (usuario_campus); lider and miembro see their own scope. p_campus_id narrows to one campus; outside the caller''s campuses (non-admin) it returns nobody. The caller must be auth.uid() (or service_role). Static SQL; search text is matched literally.';

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
  v_global boolean;
  v_campus uuid[];
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

  -- Same scope as the list: these four roles count their whole campus, and
  -- only admin counts every campus.
  v_todo := v_rol IN ('admin', 'pastor', 'director-general', 'director-etapa');
  v_global := v_rol = 'admin';
  SELECT coalesce(array_agg(uc.campus_id), '{}'::uuid[])
    INTO v_campus
    FROM public.usuario_campus uc
   WHERE uc.usuario_id = v_usuario_id;

  -- A campus filter outside the caller's own campuses counts nobody.
  IF p_campus_id IS NOT NULL AND NOT v_global AND NOT (p_campus_id = ANY (v_campus)) THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

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
        (v_todo AND (
          v_global
          OR EXISTS (
            SELECT 1
              FROM public.usuario_campus uc
             WHERE uc.usuario_id = u.id
               AND uc.campus_id = ANY (v_campus)
          )
        ))
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
  'Usuarios totals with the same scope and campus rule as listar_usuarios_con_permisos (admin every campus; other roles their own campuses; p_campus_id narrows). The caller must be auth.uid() (or service_role), otherwise zeros. Static SQL; search text is matched literally.';

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

  -- admin sees every profile (seeing is not editing).
  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_actor_id
       AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- pastor, director general and director de etapa see the profiles of the
  -- people who share one of their campuses.
  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_actor_id
       AND rs.nombre_interno IN ('pastor', 'director-general', 'director-etapa')
  ) AND EXISTS (
    SELECT 1
      FROM public.usuario_campus actor_uc
      JOIN public.usuario_campus target_uc ON target_uc.campus_id = actor_uc.campus_id
     WHERE actor_uc.usuario_id = v_actor_id
       AND target_uc.usuario_id = p_target_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- A pastor's edit right is not scoped by campus (puede_editar_usuario), so a
  -- pastor never reaches the edit fallback for somebody outside their campuses.
  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_actor_id
       AND rs.nombre_interno = 'pastor'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Everybody else sees the profiles they may edit.
  RETURN public.puede_editar_usuario(p_auth_id, p_target_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.puede_ver_usuario_ficha(uuid, uuid) IS
  'Who may SEE a user profile: the person themself; admin (every campus); pastor, director-general and director-etapa for people who share one of their campuses (usuario_campus); everybody else needs puede_editar_usuario. Seeing does not grant editing. The caller must be auth.uid() (or service_role).';

-- 4. People without a campus --------------------------------------------------
-- noqa: insert-into (the linter points at the line before an INSERT)
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) -- noqa: insert-into
SELECT u.id, c.id, true
  FROM public.usuarios u
 CROSS JOIN (SELECT id FROM public.campus) c
 WHERE (SELECT count(*) FROM public.campus) = 1
   AND NOT EXISTS (
     SELECT 1 FROM public.usuario_campus uc WHERE uc.usuario_id = u.id
   );

-- 5. New people keep a campus -------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuarios_asignar_campus_por_defecto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_campus uuid;
BEGIN
  -- The creating function may have written the campus itself.
  IF EXISTS (SELECT 1 FROM public.usuario_campus uc WHERE uc.usuario_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  -- The main campus of the person who created this one.
  SELECT uc.campus_id
    INTO v_campus
    FROM public.usuario_campus uc
    JOIN public.usuarios creador ON creador.id = uc.usuario_id
   WHERE creador.auth_id = auth.uid()
     AND uc.es_campus_principal
   LIMIT 1;

  -- Otherwise the only campus, when there is exactly one.
  IF v_campus IS NULL AND (SELECT count(*) FROM public.campus) = 1 THEN
    SELECT c.id INTO v_campus FROM public.campus c;
  END IF;

  IF v_campus IS NOT NULL THEN
    -- noqa: insert-into (the linter points at the line before an INSERT)
    INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) -- noqa: insert-into
    VALUES (NEW.id, v_campus, true)
    ON CONFLICT ON CONSTRAINT usuario_campus_usuario_id_campus_id_key DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.usuarios_asignar_campus_por_defecto() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.usuarios_asignar_campus_por_defecto() IS
  'Deferred trigger on usuarios: at commit, a person with no usuario_campus row gets the creator''s main campus, or the only campus when there is exactly one.';

DROP TRIGGER IF EXISTS usuarios_campus_por_defecto ON public.usuarios;
CREATE CONSTRAINT TRIGGER usuarios_campus_por_defecto
  AFTER INSERT ON public.usuarios
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.usuarios_asignar_campus_por_defecto();
