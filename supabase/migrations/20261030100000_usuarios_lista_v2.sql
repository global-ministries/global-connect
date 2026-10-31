-- Usuarios list v2 and per-person attendance (T8-1 of
-- odd/tasks/sistema-diseno-v2.md, S13).
--
-- What:
--   1. public.usuarios_lista_filtrada (internal, not granted to anybody but
--      service_role): THE scope and filter rule of the Usuarios list, moved
--      verbatim from 20261029200000_usuarios_alcance_campus.sql (admin every
--      campus; pastor, director general, director de etapa, and lider with
--      p_contexto_relacion, the people of their own campuses; lider the
--      members of the groups they lead; miembro family, relations and self;
--      p_campus_id narrows, outside the caller's campuses nobody), plus:
--        * p_con_cuenta: true = has an auth account (usuarios.auth_id), false
--          = has none (an open invitation counts as none);
--        * p_nuevos_dias: registered in the last N days (fecha_registro);
--        * the search also matches the phone: a query made only of phone
--          characters (digits, spaces, + ( ) -) is compared by digits with the
--          stored number and its international form (0414… → 58414…), the
--          same rule as lib/platform/dream-team/servidores-vista.ts.
--   2. public.listar_usuarios_con_permisos_v2: the list with p_con_cuenta,
--      p_nuevos_dias and p_orden ('nombre' default, 'registro_desc',
--      'registro_asc'), and per row:
--        * cuenta: 'si' (auth_id set) | 'invitada' (no auth_id and an open
--          invitation, ficha_tiene_invitacion_abierta: an account invitation
--          'enviada' or an access invitation en_espera / enviada / activando
--          / bloqueada) | 'no';
--        * grupo_id, grupo_nombre: the current Grupo de Vida (a grupo_miembros
--          row without fecha_salida, the same test as p_en_grupo; active
--          groups first, then the oldest assignment);
--        * campus_nombre: the main campus (or the first by name);
--        * es_de_mi_grupo: the person is a current member of an active group
--          the caller leads (rol 'Líder', no fecha_salida). The screen uses it
--          for the leader's call / WhatsApp actions (S13 decision 6); it does
--          not change who is listed.
--   3. public.obtener_estadisticas_usuarios_con_permisos_v2: the totals of the
--      same scope and filters, plus nuevos_7d, sin_grupo, sin_cuenta,
--      sin_telefono and invitadas (the sin_cuenta people with an open
--      invitation) for the attention metrics.
--   4. listar_usuarios_con_permisos and obtener_estadisticas_usuarios_con_
--      permisos keep their signature, return type, grants and behavior; they
--      now read the v2 functions, so the campus rule lives in one place. The
--      only visible change is that a phone-only search also matches phones.
--   5. public.puede_ver_asistencia_persona (internal) and
--      public.obtener_asistencia_persona: the person's own attendance across
--      Grupos de Vida (asistencia), Estudiantes (estudiantes_asistencias:
--      Transit, Inside Out, The Living Room) and Talleres (taller_asistencias).
--      The gate is the one of obtener_reporte_asistencia_usuario (self; admin,
--      pastor, director general; a leader of a group of the person; the
--      director de etapa of a current group of the person; a direct relation),
--      with the campus rule of #619 on the broad roles: admin sees every
--      campus, pastor and director general only people who share one of their
--      campuses. So it never sees more than the existing report.
--
-- Why new _v2 names: the return types change (new columns), and the
-- existing suites pin the old signatures; an overload with the same name
-- would make PostgREST calls ambiguous.
--
-- Blast radius: five new functions, two replaced functions (same signature,
-- grants and owner). No table, policy or row changes.
--
-- Rollback: re-apply sections 1 and 2 of
-- 20261029200000_usuarios_alcance_campus.sql, then
--   DROP FUNCTION IF EXISTS public.obtener_asistencia_persona(uuid, uuid, date, date);
--   DROP FUNCTION IF EXISTS public.puede_ver_asistencia_persona(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.obtener_estadisticas_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, uuid, boolean, integer);
--   DROP FUNCTION IF EXISTS public.listar_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid, boolean, integer, text);
--   DROP FUNCTION IF EXISTS public.usuarios_lista_filtrada(uuid, text, text[], boolean, boolean, boolean, boolean, uuid, boolean, integer);

-- 1. Scope and filters ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuarios_lista_filtrada(
  p_auth_id uuid,
  p_busqueda text,
  p_roles_filtro text[],
  p_con_email boolean,
  p_con_telefono boolean,
  p_en_grupo boolean,
  p_contexto_relacion boolean,
  p_campus_id uuid,
  p_con_cuenta boolean,
  p_nuevos_dias integer
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
  auth_id uuid
)
LANGUAGE plpgsql
STABLE
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
  v_digitos text := '';
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

  -- Only a query made of phone characters is matched against phones, so a
  -- name fragment with a digit never lights up unrelated numbers.
  IF v_busqueda ~ '^[0-9 +()-]+$' THEN
    v_digitos := regexp_replace(v_busqueda, '[^0-9]', '', 'g');
  END IF;

  RETURN QUERY
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
    u.auth_id
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
      OR (v_digitos <> '' AND u.telefono IS NOT NULL AND (
            strpos(regexp_replace(u.telefono, '[^0-9]', '', 'g'), v_digitos) > 0
            OR (regexp_replace(u.telefono, '[^0-9]', '', 'g') LIKE '0%'
                AND strpos('58' || substr(regexp_replace(u.telefono, '[^0-9]', '', 'g'), 2), v_digitos) > 0)
          ))
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
    AND (
      p_con_cuenta IS NULL
      OR p_con_cuenta = (u.auth_id IS NOT NULL)
    )
    AND (
      p_nuevos_dias IS NULL
      OR u.fecha_registro >= now() - make_interval(days => greatest(p_nuevos_dias, 0))
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.usuarios_lista_filtrada(uuid, text, text[], boolean, boolean, boolean, boolean, uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usuarios_lista_filtrada(uuid, text, text[], boolean, boolean, boolean, boolean, uuid, boolean, integer) TO service_role;

COMMENT ON FUNCTION public.usuarios_lista_filtrada(uuid, text, text[], boolean, boolean, boolean, boolean, uuid, boolean, integer) IS
  'Internal: the people the caller may list in Usuarios (one row per person and role), with the list filters applied. Scope: admin every campus; pastor, director-general and director-etapa (and lider with p_contexto_relacion) their own campuses; lider the members of their groups; miembro family, relations and self. Used by listar_usuarios_con_permisos_v2 and obtener_estadisticas_usuarios_con_permisos_v2. The caller must be auth.uid() (or service_role).';

-- 2. List v2 -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_usuarios_con_permisos_v2(
  p_auth_id uuid,
  p_busqueda text DEFAULT ''::text,
  p_roles_filtro text[] DEFAULT '{}'::text[],
  p_con_email boolean DEFAULT NULL::boolean,
  p_con_telefono boolean DEFAULT NULL::boolean,
  p_en_grupo boolean DEFAULT NULL::boolean,
  p_limite integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_contexto_relacion boolean DEFAULT false,
  p_campus_id uuid DEFAULT NULL::uuid,
  p_con_cuenta boolean DEFAULT NULL::boolean,
  p_nuevos_dias integer DEFAULT NULL::integer,
  p_orden text DEFAULT 'nombre'::text
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
  puede_ver boolean,
  cuenta text,
  grupo_id uuid,
  grupo_nombre text,
  campus_nombre text,
  es_de_mi_grupo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_orden text := CASE WHEN p_orden IN ('registro_desc', 'registro_asc') THEN p_orden ELSE 'nombre' END;
  v_yo uuid;
BEGIN
  -- usuarios_lista_filtrada checks the caller; v_yo only feeds es_de_mi_grupo.
  SELECT u.id INTO v_yo FROM public.usuarios u WHERE u.auth_id = p_auth_id;

  RETURN QUERY
  WITH filtrados AS (
    SELECT *
      FROM public.usuarios_lista_filtrada(
        p_auth_id, p_busqueda, p_roles_filtro, p_con_email, p_con_telefono,
        p_en_grupo, p_contexto_relacion, p_campus_id, p_con_cuenta, p_nuevos_dias)
  ),
  total AS (
    SELECT count(DISTINCT f.id) AS n FROM filtrados f
  ),
  pagina AS (
    SELECT f.*, t.n
      FROM filtrados f
     CROSS JOIN total t
     ORDER BY
       CASE WHEN v_orden = 'registro_desc' THEN f.fecha_registro END DESC NULLS LAST,
       CASE WHEN v_orden = 'registro_asc' THEN f.fecha_registro END ASC NULLS LAST,
       f.nombre, f.apellido, f.id, f.rol_nombre_interno
     LIMIT greatest(coalesce(p_limite, 20), 0)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    p.id,
    p.nombre,
    p.apellido,
    p.email,
    p.telefono,
    p.cedula,
    p.fecha_registro,
    p.rol_nombre_interno,
    p.rol_nombre_visible,
    p.foto_perfil_url,
    p.n::bigint AS total_count,
    true AS puede_ver,
    CASE
      WHEN p.auth_id IS NOT NULL THEN 'si'
      WHEN public.ficha_tiene_invitacion_abierta(p.id) THEN 'invitada'
      ELSE 'no'
    END AS cuenta,
    gr.id AS grupo_id,
    gr.nombre AS grupo_nombre,
    ca.nombre AS campus_nombre,
    (v_yo IS NOT NULL AND p.id <> v_yo AND EXISTS (
      SELECT 1
        FROM public.grupo_miembros gm
        JOIN public.grupo_miembros gl ON gl.grupo_id = gm.grupo_id
        JOIN public.grupos g ON g.id = gm.grupo_id
       WHERE gm.usuario_id = p.id
         AND gm.fecha_salida IS NULL
         AND gl.usuario_id = v_yo
         AND gl.rol = 'Líder'
         AND gl.fecha_salida IS NULL
         AND g.activo
         AND NOT g.eliminado
    )) AS es_de_mi_grupo
  FROM pagina p
  LEFT JOIN LATERAL (
    SELECT g.id, g.nombre
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
     WHERE gm.usuario_id = p.id
       AND gm.fecha_salida IS NULL
     ORDER BY (g.activo AND NOT g.eliminado) DESC, gm.fecha_asignacion, g.nombre, g.id
     LIMIT 1
  ) gr ON true
  LEFT JOIN LATERAL (
    SELECT c.nombre
      FROM public.usuario_campus uc
      JOIN public.campus c ON c.id = uc.campus_id
     WHERE uc.usuario_id = p.id
     ORDER BY uc.es_campus_principal DESC NULLS LAST, c.nombre, c.id
     LIMIT 1
  ) ca ON true
  ORDER BY
    CASE WHEN v_orden = 'registro_desc' THEN p.fecha_registro END DESC NULLS LAST,
    CASE WHEN v_orden = 'registro_asc' THEN p.fecha_registro END ASC NULLS LAST,
    p.nombre, p.apellido, p.id, p.rol_nombre_interno;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid, boolean, integer, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid, boolean, integer, text) IS
  'Usuarios list v2: the scope of usuarios_lista_filtrada (campus rule of 20261029200000), filters p_con_cuenta and p_nuevos_dias, phone search, p_orden nombre | registro_desc | registro_asc, and per row cuenta (si | invitada | no), current Grupo de Vida, main campus and es_de_mi_grupo (a current member of an active group the caller leads). The caller must be auth.uid() (or service_role).';

-- 3. Statistics v2 -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_estadisticas_usuarios_con_permisos_v2(
  p_auth_id uuid,
  p_busqueda text DEFAULT ''::text,
  p_roles_filtro text[] DEFAULT '{}'::text[],
  p_con_email boolean DEFAULT NULL::boolean,
  p_con_telefono boolean DEFAULT NULL::boolean,
  p_en_grupo boolean DEFAULT NULL::boolean,
  p_campus_id uuid DEFAULT NULL::uuid,
  p_con_cuenta boolean DEFAULT NULL::boolean,
  p_nuevos_dias integer DEFAULT NULL::integer
)
RETURNS TABLE(
  total_usuarios bigint,
  con_email bigint,
  con_telefono bigint,
  registrados_hoy bigint,
  nuevos_7d bigint,
  sin_grupo bigint,
  sin_cuenta bigint,
  sin_telefono bigint,
  invitadas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- Same scope and filters as the list (without the relationship context);
  -- a caller who is not the session person gets zeros. One count per person,
  -- whatever the number of roles.
  RETURN QUERY
  SELECT
    count(DISTINCT f.id)::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.email IS NOT NULL AND f.email <> '')::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.telefono IS NOT NULL AND f.telefono <> '')::bigint,
    count(DISTINCT f.id) FILTER (WHERE date(f.fecha_registro) = current_date)::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.fecha_registro >= now() - interval '7 days')::bigint,
    count(DISTINCT f.id) FILTER (WHERE NOT f.en_grupo)::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.auth_id IS NULL)::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.telefono IS NULL OR f.telefono = '')::bigint,
    count(DISTINCT f.id) FILTER (WHERE f.invitada)::bigint
  FROM (
    SELECT l.id, l.email, l.telefono, l.fecha_registro, l.auth_id,
           EXISTS (
             SELECT 1 FROM public.grupo_miembros gm
              WHERE gm.usuario_id = l.id AND gm.fecha_salida IS NULL
           ) AS en_grupo,
           (l.auth_id IS NULL AND public.ficha_tiene_invitacion_abierta(l.id)) AS invitada
      FROM public.usuarios_lista_filtrada(
        p_auth_id, p_busqueda, p_roles_filtro, p_con_email, p_con_telefono,
        p_en_grupo, false, p_campus_id, p_con_cuenta, p_nuevos_dias) l
  ) f;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, uuid, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, uuid, boolean, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos_v2(uuid, text, text[], boolean, boolean, boolean, uuid, boolean, integer) IS
  'Usuarios totals v2 with the scope and filters of listar_usuarios_con_permisos_v2: total, con_email, con_telefono, registrados_hoy, nuevos_7d (registered in the last 7 days), sin_grupo (no grupo_miembros row without fecha_salida), sin_cuenta (no auth_id), sin_telefono and invitadas (no auth_id and an open invitation). The caller must be auth.uid() (or service_role), otherwise zeros.';

-- 4. The v1 functions read v2 --------------------------------------------------
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
BEGIN
  RETURN QUERY
  SELECT v.id, v.nombre, v.apellido, v.email, v.telefono, v.cedula, v.fecha_registro,
         v.rol_nombre_interno, v.rol_nombre_visible, v.foto_perfil_url, v.total_count, v.puede_ver
    FROM public.listar_usuarios_con_permisos_v2(
      p_auth_id, p_busqueda, p_roles_filtro, p_con_email, p_con_telefono, p_en_grupo,
      p_limite, p_offset, p_contexto_relacion, p_campus_id, NULL, NULL, 'nombre') v
   ORDER BY v.nombre, v.apellido, v.id, v.rol_nombre_interno;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, integer, integer, boolean, uuid) IS
  'Usuarios list (v1 columns), read from listar_usuarios_con_permisos_v2: admin sees every campus; pastor, director-general and director-etapa (and lider with p_contexto_relacion) see the people of their own campuses (usuario_campus); lider and miembro see their own scope. p_campus_id narrows to one campus; outside the caller''s campuses (non-admin) it returns nobody. The caller must be auth.uid() (or service_role). Static SQL; search text is matched literally.';

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
BEGIN
  RETURN QUERY
  SELECT s.total_usuarios, s.con_email, s.con_telefono, s.registrados_hoy
    FROM public.obtener_estadisticas_usuarios_con_permisos_v2(
      p_auth_id, p_busqueda, p_roles_filtro, p_con_email, p_con_telefono, p_en_grupo,
      p_campus_id, NULL, NULL) s;
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.obtener_estadisticas_usuarios_con_permisos(uuid, text, text[], boolean, boolean, boolean, uuid) IS
  'Usuarios totals (v1 columns), read from obtener_estadisticas_usuarios_con_permisos_v2: the same scope and campus rule as listar_usuarios_con_permisos. The caller must be auth.uid() (or service_role), otherwise zeros. Static SQL; search text is matched literally.';

-- 5. Per-person attendance -----------------------------------------------------
-- The gate of obtener_reporte_asistencia_usuario (20260930110000, steps 2a–2e),
-- with the campus rule on the broad roles: admin any campus; pastor and
-- director general only for people who share one of their campuses.
CREATE OR REPLACE FUNCTION public.puede_ver_asistencia_persona(
  p_auth_id uuid,
  p_usuario_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_yo uuid;
BEGIN
  IF p_auth_id IS NULL OR p_usuario_id IS NULL THEN
    RETURN false;
  END IF;

  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_auth_id) THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_yo FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_yo IS NULL THEN
    RETURN false;
  END IF;

  -- 2a. The person themself.
  IF v_yo = p_usuario_id THEN
    RETURN true;
  END IF;

  -- 2b. admin (every campus); pastor and director general (their campuses).
  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_yo
       AND rs.nombre_interno = 'admin'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.usuario_roles ur
      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
     WHERE ur.usuario_id = v_yo
       AND rs.nombre_interno IN ('pastor', 'director-general')
  ) AND EXISTS (
    SELECT 1
      FROM public.usuario_campus mi_uc
      JOIN public.usuario_campus su_uc ON su_uc.campus_id = mi_uc.campus_id
     WHERE mi_uc.usuario_id = v_yo
       AND su_uc.usuario_id = p_usuario_id
  ) THEN
    RETURN true;
  END IF;

  -- 2c. A leader of a group the person belongs to.
  IF EXISTS (
    SELECT 1
      FROM public.grupo_miembros gm_lider
      JOIN public.grupo_miembros gm_miembro ON gm_miembro.grupo_id = gm_lider.grupo_id
     WHERE gm_lider.usuario_id = v_yo
       AND gm_lider.rol = 'Líder'
       AND gm_miembro.usuario_id = p_usuario_id
  ) THEN
    RETURN true;
  END IF;

  -- 2d. The director de etapa of a current group of the person.
  IF EXISTS (
    SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl
        ON sl.id = deg.director_etapa_id
       AND sl.usuario_id = v_yo
       AND sl.tipo_lider = 'director_etapa'
      JOIN public.grupo_miembros gm ON gm.grupo_id = deg.grupo_id
     WHERE gm.usuario_id = p_usuario_id
       AND gm.fecha_salida IS NULL
  ) THEN
    RETURN true;
  END IF;

  -- 2e. A direct relation.
  RETURN EXISTS (
    SELECT 1
      FROM public.relaciones_usuarios ru
     WHERE (ru.usuario1_id = v_yo AND ru.usuario2_id = p_usuario_id)
        OR (ru.usuario1_id = p_usuario_id AND ru.usuario2_id = v_yo)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_asistencia_persona(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_asistencia_persona(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.puede_ver_asistencia_persona(uuid, uuid) IS
  'Internal: who may see a person''s attendance. The gate of obtener_reporte_asistencia_usuario (self; admin; pastor and director-general; a leader of a group of the person; the director de etapa of a current group; a direct relation), with pastor and director-general limited to people who share one of their campuses. The caller must be auth.uid() (or service_role).';

-- One person's own attendance in a date range, per kind and group.
--   NULL when the caller may not see it (puede_ver_asistencia_persona).
--   Otherwise {desde, hasta, grupos: [{tipo, id, nombre, area, rol, actual,
--   desde, salio, completado, total_sesiones, marcas: [{fecha, presente,
--   era_visitante}]}]}. Defaults: hasta today (America/Caracas), desde twelve
--   months earlier.
--   tipo 'gdv': Grupos de Vida (asistencia / eventos_grupo; meetings flagged
--     no_hubo_reunion are left out). A group is listed when the person has a
--     mark in the range or a membership that overlaps it. rol is the one of the
--     latest membership ('Líder', 'Colíder', 'Miembro'; 'Visitante' when there
--     is none); actual = a membership without fecha_salida in an active group;
--     salio = the latest fecha_salida otherwise. area = the segmento.
--   tipo 'estudiantes': estudiantes_grupos (Transit, Inside Out, The Living
--     Room). Listed with a mark in the range, an active leader servicio, or a
--     membership that overlaps the range. rol 'Líder' (active leader servicio),
--     'Miembro' or 'Visitante' (membership estado); salio = retirado_at.
--     area = "<ámbito> · <sub-área>". era_visitante comes from the mark.
--   tipo 'talleres': taller_grupos with a presente / ausente mark in the range
--     (no_aplica and cancelled sesiones are left out; the date is
--     fecha_realizada, else fecha_programada). nombre = the taller, area = the
--     group, rol 'Participante', actual = group activo, completado = group
--     completado, total_sesiones = the group's sesiones that are not cancelled.
CREATE OR REPLACE FUNCTION public.obtener_asistencia_persona(
  p_usuario_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL::date,
  p_fecha_fin date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hasta date := coalesce(p_fecha_fin, (now() AT TIME ZONE 'America/Caracas')::date);
  v_desde date := coalesce(p_fecha_inicio, (coalesce(p_fecha_fin, (now() AT TIME ZONE 'America/Caracas')::date) - interval '12 months')::date);
  v_gdv jsonb;
  v_est jsonb;
  v_tal jsonb;
BEGIN
  IF NOT public.puede_ver_asistencia_persona(p_auth_id, p_usuario_id) THEN
    RETURN NULL;
  END IF;

  -- Grupos de Vida.
  WITH memb AS (
    SELECT gm.grupo_id, gm.rol::text AS rol, gm.fecha_asignacion::date AS desde, gm.fecha_salida::date AS salida
      FROM public.grupo_miembros gm
     WHERE gm.usuario_id = p_usuario_id
  ),
  marcas AS (
    SELECT eg.grupo_id, eg.id AS evento_id, eg.fecha, a.presente, coalesce(a.es_visitante, false) AS visitante
      FROM public.asistencia a
      JOIN public.eventos_grupo eg ON eg.id = a.evento_grupo_id
     WHERE a.usuario_id = p_usuario_id
       AND eg.fecha BETWEEN v_desde AND v_hasta
       AND eg.no_hubo_reunion IS NOT TRUE
  ),
  ids AS (
    SELECT m.grupo_id FROM marcas m
    UNION
    SELECT m.grupo_id FROM memb m
     WHERE m.desde <= v_hasta AND (m.salida IS NULL OR m.salida >= v_desde)
  ),
  filas AS (
    SELECT g.id, g.nombre, s.nombre AS area,
           coalesce(ult.rol, 'Visitante') AS rol,
           (act.desde IS NOT NULL AND g.activo AND NOT g.eliminado) AS actual,
           act.desde,
           sal.salida
      FROM ids
      JOIN public.grupos g ON g.id = ids.grupo_id
      LEFT JOIN public.segmentos s ON s.id = g.segmento_id
      LEFT JOIN LATERAL (
        SELECT m.rol FROM memb m WHERE m.grupo_id = g.id
         ORDER BY m.salida DESC NULLS FIRST, m.desde DESC LIMIT 1
      ) ult ON true
      LEFT JOIN LATERAL (
        SELECT min(m.desde) AS desde FROM memb m WHERE m.grupo_id = g.id AND m.salida IS NULL
      ) act ON true
      LEFT JOIN LATERAL (
        SELECT max(m.salida) AS salida FROM memb m WHERE m.grupo_id = g.id
      ) sal ON true
  )
  SELECT jsonb_agg(jsonb_build_object(
           'tipo', 'gdv', 'id', f.id, 'nombre', f.nombre, 'area', f.area, 'rol', f.rol,
           'actual', f.actual, 'desde', f.desde,
           'salio', CASE WHEN f.actual THEN NULL ELSE f.salida END,
           'completado', NULL, 'total_sesiones', NULL,
           'marcas', coalesce((
             SELECT jsonb_agg(jsonb_build_object('fecha', m.fecha, 'presente', m.presente, 'era_visitante', m.visitante)
                              ORDER BY m.fecha, m.evento_id)
               FROM marcas m WHERE m.grupo_id = f.id), '[]'::jsonb))
         ORDER BY f.actual DESC, f.nombre, f.id)
    INTO v_gdv
    FROM filas f;

  -- Estudiantes.
  WITH memb AS (
    SELECT m.grupo_id, m.estado, m.desde, m.activo, m.retirado_at::date AS salida
      FROM public.estudiantes_grupo_miembros m
     WHERE m.persona_id = p_usuario_id
  ),
  lidera AS (
    SELECT DISTINCT gl.grupo_id
      FROM public.estudiantes_grupo_lideres gl
      JOIN public.dream_team_servicios sv ON sv.id = gl.servicio_id
     WHERE sv.persona_id = p_usuario_id
       AND sv.estado = 'activo'
  ),
  marcas AS (
    SELECT r.grupo_id, r.id AS reunion_id, r.fecha, ea.estado = 'presente' AS presente, ea.era_visitante
      FROM public.estudiantes_asistencias ea
      JOIN public.estudiantes_reuniones r ON r.id = ea.reunion_id
     WHERE ea.persona_id = p_usuario_id
       AND r.fecha BETWEEN v_desde AND v_hasta
  ),
  ids AS (
    SELECT m.grupo_id FROM marcas m
    UNION
    SELECT l.grupo_id FROM lidera l
    UNION
    SELECT m.grupo_id FROM memb m
     WHERE m.desde <= v_hasta AND (m.activo OR m.salida IS NULL OR m.salida >= v_desde)
  ),
  filas AS (
    SELECT g.id, g.nombre, a.label || ' · ' || s.label AS area,
           CASE
             WHEN l.grupo_id IS NOT NULL THEN 'Líder'
             WHEN me.estado = 'miembro' THEN 'Miembro'
             ELSE 'Visitante'
           END AS rol,
           ((l.grupo_id IS NOT NULL OR coalesce(me.activo, false)) AND g.activo) AS actual,
           me.desde,
           CASE WHEN me.activo IS FALSE THEN me.salida END AS salida
      FROM ids
      JOIN public.estudiantes_grupos g ON g.id = ids.grupo_id
      JOIN public.dream_team_equipos a ON a.id = g.ambito_id
      JOIN public.dream_team_equipos s ON s.id = g.subarea_id
      LEFT JOIN lidera l ON l.grupo_id = g.id
      LEFT JOIN memb me ON me.grupo_id = g.id
  )
  SELECT jsonb_agg(jsonb_build_object(
           'tipo', 'estudiantes', 'id', f.id, 'nombre', f.nombre, 'area', f.area, 'rol', f.rol,
           'actual', f.actual, 'desde', f.desde,
           'salio', CASE WHEN f.actual THEN NULL ELSE f.salida END,
           'completado', NULL, 'total_sesiones', NULL,
           'marcas', coalesce((
             SELECT jsonb_agg(jsonb_build_object('fecha', m.fecha, 'presente', m.presente, 'era_visitante', m.era_visitante)
                              ORDER BY m.fecha, m.reunion_id)
               FROM marcas m WHERE m.grupo_id = f.id), '[]'::jsonb))
         ORDER BY f.actual DESC, f.area, f.nombre, f.id)
    INTO v_est
    FROM filas f;

  -- Talleres.
  WITH marcas AS (
    SELECT DISTINCT ON (s.id)
           s.grupo_id, s.id AS sesion_id, coalesce(s.fecha_realizada, s.fecha_programada) AS fecha,
           ta.estado = 'presente' AS presente
      FROM public.taller_asistencias ta
      JOIN public.taller_sesiones s ON s.id = ta.sesion_id
     WHERE ta.persona_id = p_usuario_id
       AND ta.estado IN ('presente', 'ausente')
       AND s.estado <> 'cancelada'
       AND coalesce(s.fecha_realizada, s.fecha_programada) BETWEEN v_desde AND v_hasta
     ORDER BY s.id, (ta.estado = 'presente') DESC
  ),
  filas AS (
    SELECT tg.id, coalesce(t.nombre, te.nombre_snapshot) AS nombre, tg.nombre AS area,
           tg.estado = 'activo' AS actual,
           tg.estado = 'completado' AS completado,
           (SELECT count(*) FROM public.taller_sesiones s2
             WHERE s2.grupo_id = tg.id AND s2.estado <> 'cancelada') AS total_sesiones
      FROM (SELECT DISTINCT m.grupo_id FROM marcas m) ids
      JOIN public.taller_grupos tg ON tg.id = ids.grupo_id
      JOIN public.talleres_crecimiento_cohortes co ON co.id = tg.cohorte_id
      JOIN public.taller_ediciones te ON te.id = co.taller_id
      LEFT JOIN public.talleres t ON t.id = te.taller_id
  )
  SELECT jsonb_agg(jsonb_build_object(
           'tipo', 'talleres', 'id', f.id, 'nombre', f.nombre, 'area', f.area, 'rol', 'Participante',
           'actual', f.actual, 'desde', NULL, 'salio', NULL,
           'completado', f.completado, 'total_sesiones', f.total_sesiones,
           'marcas', coalesce((
             SELECT jsonb_agg(jsonb_build_object('fecha', m.fecha, 'presente', m.presente, 'era_visitante', false)
                              ORDER BY m.fecha, m.sesion_id)
               FROM marcas m WHERE m.grupo_id = f.id), '[]'::jsonb))
         ORDER BY f.actual DESC, f.nombre, f.id)
    INTO v_tal
    FROM filas f;

  RETURN jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'grupos', coalesce(v_gdv, '[]'::jsonb) || coalesce(v_est, '[]'::jsonb) || coalesce(v_tal, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.obtener_asistencia_persona(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_persona(uuid, uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.obtener_asistencia_persona(uuid, uuid, date, date) IS
  'A person''s own attendance in a date range across Grupos de Vida, Estudiantes and Talleres, per group with its marks (fecha, presente, era_visitante). NULL when puede_ver_asistencia_persona denies it. The caller must be auth.uid() (or service_role).';
