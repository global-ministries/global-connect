-- Permission gates on readers that every signed-in person could run over the
-- whole database, and fixes to two broken functions (security phase 3,
-- batch L3).
--
-- Phase 2 pinned p_auth_id to auth.uid() in these functions, so nobody can ask
-- as somebody else any more. But being yourself was enough: any signed-in
-- person read global totals, retention and growth over every group, and the
-- events and attendance of any group. This file adds the missing permission
-- check to each one. Unless the request role is service_role, a caller without
-- the permission gets the value the function already returns when there is
-- nothing to show, never an error, so the app renders an empty state:
--
--   resumen_dashboard_admin(p_campus_id)
--     Gate: the session person (auth.uid()) holds admin, pastor or
--     director-general, the roles app/(auth)/dashboard/page.tsx renders
--     DashboardAdmin for. Callers: components/dashboard/roles/DashboardAdmin.tsx
--     (campus refresh) and lib/dashboard/obtenerDatosDashboard.ts
--     (obtenerKpisCampus, only for admin and pastor). Neutral value: NULL.
--     It had no check at all; with no session it also returns NULL now.
--   obtener_reporte_retencion, obtener_reporte_crecimiento_neto
--     Gate: the person of p_auth_id (already pinned to the session) holds
--     admin, pastor or director-general. The server actions in
--     lib/actions/asistencia-avanzada.actions.ts that call them have no caller
--     in the app today, so there is no page gate to mirror; these are the
--     roles of the global dashboard. Neutral values: retention returns the
--     all-zero object it returns for a season without a previous one;
--     growth returns {"timeline": []}, what its COALESCE falls back to when no
--     month is listed. Both parse with the app's zod schemas.
--   listar_eventos_grupo, obtener_evento_grupo, obtener_asistencia_evento
--     Gate: public.puede_ver_grupo(<usuarios.id of p_auth_id>, <group>), the
--     rule of the grupos policies, bound to the session person since batch
--     L2. The two readers by event take the group from the event row. Callers:
--     app/(auth)/grupos-vida/[id]/asistencia/[eventoId]/page.tsx and
--     .../asistencia/editar/[eventoId]/page.tsx (the last two);
--     listar_eventos_grupo only in scripts/test-rpc-asistencia.ts. Neutral
--     value: no rows, what an unknown group or event returns.
--   sugerir_nombre_grupo(p_ubicacion, p_temporada_id, p_segmento_id)
--     Gate: public.puede_crear_grupo(auth.uid(), p_segmento_id), the check
--     crear_grupo_con_director runs when the group is created. Caller:
--     app/api/grupos/sugerir-nombre/route.ts with the session client, for
--     components/forms/GroupCreateForm.tsx; whoever may create the group gets
--     the same name as before. Neutral value: NULL. The check runs after the
--     parameter check, so invalid parameters still raise as before.
--
-- service_role skips every gate, as it skips the identity guard of phase 2, so
-- the service client keeps its answers. For the event readers that means it
-- still reads any group for any p_auth_id.
--
-- Every gate fails closed: it reads "IF NOT coalesce(<check>, false)", so a
-- NULL (a session with no usuarios row, a helper that returns NULL) denies.
-- Such a session gets the neutral value from the gated readers; the two
-- reports keep answering it with their own {"error": "Usuario no encontrado"}.
--
-- Fixes:
--   * obtener_kpis_grupos_para_usuario had two overloads, (p_auth_id) and
--     (p_auth_id, p_campus_id DEFAULT NULL). A call with only p_auth_id, which
--     app/api/grupos/kpis/route.ts sends when no campus is selected, matches
--     both and fails with 42725. The two bodies are the same text except the
--     campus filter "AND (p_campus_id IS NULL OR ...)", true when p_campus_id
--     is NULL, and the newline before the closing $function$. The
--     one-argument overload is dropped, so that call resolves to the other
--     with p_campus_id NULL and returns what the dropped one returned.
--   * asignar_director_etapa_a_ubicacion returns TABLE(id, director_etapa_id,
--     segmento_ubicacion_id). Those OUT columns are plpgsql variables, so
--     "WHERE id = ...", "ON CONFLICT (director_etapa_id)" and the DELETE's
--     "WHERE director_etapa_id = ..." were ambiguous (42702) and the function
--     never ran past its permission check. The SELECT and the DELETE now use
--     table aliases. An ON CONFLICT column list cannot be qualified, so it
--     names the unique constraint on director_etapa_id instead
--     (director_etapa_ubicaciones_director_unique, from
--     20251006214500_enforce_unique_director_ciudad.sql); the block before
--     the function fails the migration if that constraint is missing. No app
--     code calls the function.
--     Its permission check was broken too, hidden behind the 42702: "SELECT
--     TRUE INTO v_es_superior ... LIMIT 1" sets the variable to NULL when the
--     caller is not admin, pastor or director-general, and "IF NOT NULL" does
--     not raise, so any signed-in person reached the INSERT and the DELETE (the
--     suite showed a leader moving a director's ubicacion). The check now reads
--     coalesce(v_es_superior, false). Without it, fixing the 42702 alone would
--     have opened director_etapa_ubicaciones to every signed-in person.
--
-- What does not change: signatures, parameter names and defaults, return
-- types, LANGUAGE plpgsql, the definer flag, owner, volatility (the reports
-- STABLE, the rest VOLATILE), search_path, and the rest of every body, line for
-- line (the suite checks it; asignar_director_etapa_a_ubicacion rewrites only
-- the four lines named above). Grants are restated at the end, today's state:
-- no anon, no PUBLIC; authenticated and service_role execute.
--
-- Rollback: recreate the eight replaced functions and the dropped overload from
-- the backup taken before the apply (pg_get_functiondef). The one-argument kpis
-- overload was last defined in
-- 20261002100000_definer_identidad_lecturas_grupos.sql; restoring it brings the
-- 42725 back.

-- ---------------------------------------------------------------------------
-- resumen_dashboard_admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumen_dashboard_admin(p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  resultado json;
BEGIN
  -- Global totals are for admin, pastor and the general director, the roles
  -- that render DashboardAdmin; anybody else gets NULL. Only service_role
  -- skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT coalesce(EXISTS (
       SELECT 1
       FROM public.usuarios u
       JOIN public.usuario_roles ur ON ur.usuario_id = u.id
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE u.auth_id = auth.uid()
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ), false) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'total_usuarios', (
      SELECT count(*) FROM usuarios u
      WHERE (p_campus_id IS NULL OR u.id IN (
        SELECT uc.usuario_id FROM usuario_campus uc WHERE uc.campus_id = p_campus_id
      ))
    ),
    'total_grupos', (
      SELECT count(*) FROM grupos g
      WHERE (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    ),
    'total_asistencias', (SELECT count(*) FROM asistencia)
  ) INTO resultado;

  RETURN resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_reporte_retencion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_retencion(p_auth_id uuid, p_temporada_actual_id uuid, p_temporada_anterior_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
  v_anterior_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- The report reads the members of every group: admin, pastor and the
  -- general director only. Anybody else gets the answer for a season without
  -- a previous one (all zeros). Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT coalesce(EXISTS (
       SELECT 1
       FROM public.usuario_roles ur
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE ur.usuario_id = v_user_id
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ), false) THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  IF p_temporada_anterior_id IS NULL THEN
    SELECT t2.id INTO v_anterior_id
    FROM temporadas t1
    JOIN temporadas t2 ON t2.fecha_inicio < t1.fecha_inicio
    WHERE t1.id = p_temporada_actual_id
    ORDER BY t2.fecha_inicio DESC
    LIMIT 1;
  ELSE
    v_anterior_id := p_temporada_anterior_id;
  END IF;

  IF v_anterior_id IS NULL THEN
    RETURN jsonb_build_object(
      'miembros_que_continuaron', 0,
      'miembros_anteriores', 0,
      'miembros_nuevos', 0,
      'miembros_no_renovaron', 0,
      'pct_retencion', 0,
      'detalle_no_renovaron', '[]'::jsonb
    );
  END IF;

  WITH miembros_anterior AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = v_anterior_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  miembros_actual AS (
    SELECT DISTINCT gm.usuario_id
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE g.temporada_id = p_temporada_actual_id
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
  ),
  continuaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    INNER JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
  ),
  no_renovaron AS (
    SELECT ma.usuario_id
    FROM miembros_anterior ma
    LEFT JOIN miembros_actual mc ON ma.usuario_id = mc.usuario_id
    WHERE mc.usuario_id IS NULL
  ),
  nuevos AS (
    SELECT mc.usuario_id
    FROM miembros_actual mc
    LEFT JOIN miembros_anterior ma ON mc.usuario_id = ma.usuario_id
    WHERE ma.usuario_id IS NULL
  )
  SELECT jsonb_build_object(
    'miembros_que_continuaron', (SELECT COUNT(*) FROM continuaron),
    'miembros_anteriores', (SELECT COUNT(*) FROM miembros_anterior),
    'miembros_nuevos', (SELECT COUNT(*) FROM nuevos),
    'miembros_no_renovaron', (SELECT COUNT(*) FROM no_renovaron),
    'pct_retencion', CASE
      WHEN (SELECT COUNT(*) FROM miembros_anterior) > 0
      THEN ROUND((SELECT COUNT(*) FROM continuaron)::numeric / (SELECT COUNT(*) FROM miembros_anterior) * 100, 1)
      ELSE 0
    END,
    'detalle_no_renovaron', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'usuario_id', nr.usuario_id,
        'nombre', u.nombre || ' ' || u.apellido
      ))
      FROM no_renovaron nr
      JOIN usuarios u ON u.id = nr.usuario_id
      LIMIT 50),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_reporte_crecimiento_neto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_reporte_crecimiento_neto(p_auth_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_campus_id uuid DEFAULT NULL::uuid, p_meses integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_resultado jsonb;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  SELECT id INTO v_user_id FROM usuarios WHERE auth_id = p_auth_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuario no encontrado');
  END IF;

  -- The report reads the members of every group: admin, pastor and the
  -- general director only. Anybody else gets an empty timeline, what the
  -- COALESCE below returns when no month is listed. Only service_role skips
  -- the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT coalesce(EXISTS (
       SELECT 1
       FROM public.usuario_roles ur
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
       WHERE ur.usuario_id = v_user_id
         AND rs.nombre_interno IN ('admin', 'pastor', 'director-general')
     ), false) THEN
    RETURN jsonb_build_object('timeline', '[]'::jsonb);
  END IF;

  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now() - (p_meses || ' months')::interval),
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS mes
  ),
  ingresos AS (
    SELECT
      date_trunc('month', gm.creado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.creado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  ),
  egresos AS (
    SELECT
      date_trunc('month', gm.actualizado_en)::date AS mes,
      COUNT(*) AS total
    FROM grupo_miembros gm
    JOIN grupos g ON g.id = gm.grupo_id
    WHERE gm.estado = 'inactivo'
    AND gm.actualizado_en >= now() - (p_meses || ' months')::interval
    AND (p_grupo_id IS NULL OR gm.grupo_id = p_grupo_id)
    AND (p_campus_id IS NULL OR g.campus_id = p_campus_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'timeline', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'etiqueta', to_char(m.mes, 'Mon YYYY'),
        'ingresos', COALESCE(i.total, 0),
        'egresos', COALESCE(e.total, 0),
        'neto', COALESCE(i.total, 0) - COALESCE(e.total, 0)
      ) ORDER BY m.mes)
      FROM meses m
      LEFT JOIN ingresos i ON i.mes = m.mes
      LEFT JOIN egresos e ON e.mes = m.mes),
      '[]'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

-- ---------------------------------------------------------------------------
-- listar_eventos_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_eventos_grupo(p_auth_id uuid, p_grupo_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, fecha date, hora text, tema text, notas text, total integer, presentes integer, porcentaje integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
begin
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only the events of a group the person may see, by the rule of the grupos
  -- policies (puede_ver_grupo, bound to the session person); anybody else gets
  -- no rows, as for an unknown group. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    IF NOT coalesce(public.puede_ver_grupo(v_usuario_id, p_grupo_id), false) THEN
      RETURN;
    END IF;
  END IF;

  return query
    with base as (
      select eg.id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas
        from public.eventos_grupo eg
       where eg.grupo_id = p_grupo_id
    ), agg as (
      select a.evento_grupo_id as id,
             count(*)::int as total,
             count(*) filter (where a.presente) :: int as presentes
        from public.asistencia a
       where a.evento_grupo_id in (select b.id from base b)
       group by a.evento_grupo_id
    )
    select b.id, b.fecha, b.hora, b.tema, b.notas,
           coalesce(ag.total,0) as total,
           coalesce(ag.presentes,0) as presentes,
           case when coalesce(ag.total,0) = 0 then 0 else round((ag.presentes::numeric / ag.total::numeric) * 100)::int end as porcentaje
      from base b
      left join agg ag on ag.id = b.id
      order by b.fecha desc, b.id desc
      limit coalesce(p_limit, 50) offset coalesce(p_offset, 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_evento_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_evento_grupo(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(id uuid, grupo_id uuid, fecha date, hora text, tema text, notas text, descripcion text, puntos_oracion text, notas_privadas_lider text, conteo_visitantes integer, no_hubo_reunion boolean, motivo_no_reunion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_grupo_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only an event of a group the person may see, by the rule of the grupos
  -- policies (puede_ver_grupo, bound to the session person); anybody else gets
  -- no rows, as for an unknown event. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    SELECT eg.grupo_id INTO v_grupo_id FROM public.eventos_grupo eg WHERE eg.id = p_evento_id;
    IF NOT coalesce(public.puede_ver_grupo(v_usuario_id, v_grupo_id), false) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT eg.id, eg.grupo_id, eg.fecha::date, eg.hora::text, eg.tema, eg.notas,
           eg.descripcion, eg.puntos_oracion, eg.notas_privadas_lider,
           COALESCE(eg.conteo_visitantes, 0) as conteo_visitantes,
           COALESCE(eg.no_hubo_reunion, false) as no_hubo_reunion,
           eg.motivo_no_reunion
      FROM public.eventos_grupo eg
     WHERE eg.id = p_evento_id
     LIMIT 1;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_asistencia_evento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_asistencia_evento(p_auth_id uuid, p_evento_id uuid)
 RETURNS TABLE(usuario_id uuid, presente boolean, motivo_inasistencia text, registrado_por_usuario_id uuid, fecha_registro timestamp with time zone, nombre text, apellido text, rol text, tipo_presencia text, nota text, tiempo_tardanza smallint, motivo_tardanza text, motivo_tardanza_otro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims, so both
  -- PostgREST generations are covered.
  v_request_role text := auth.role();
  v_usuario_id uuid;
  v_grupo_id uuid;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN;
  END IF;

  -- Only the attendance of an event of a group the person may see, by the rule
  -- of the grupos policies (puede_ver_grupo, bound to the session person);
  -- anybody else gets no rows, as for an unknown event. Only service_role
  -- skips the check.
  IF coalesce(v_request_role, '') <> 'service_role' THEN
    SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
    SELECT eg.grupo_id INTO v_grupo_id FROM public.eventos_grupo eg WHERE eg.id = p_evento_id;
    IF NOT coalesce(public.puede_ver_grupo(v_usuario_id, v_grupo_id), false) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT a.usuario_id, a.presente, a.motivo_inasistencia, a.registrado_por_usuario_id, a.fecha_registro,
           u.nombre, u.apellido,
           COALESCE((SELECT gm.rol::text FROM public.grupo_miembros gm WHERE gm.grupo_id = eg.grupo_id AND gm.usuario_id = u.id LIMIT 1), 'Miembro') as rol,
           COALESCE(a.tipo_presencia, CASE WHEN a.presente THEN 'presente' ELSE 'ausente' END) as tipo_presencia,
           a.nota,
           a.tiempo_tardanza,
           a.motivo_tardanza,
           a.motivo_tardanza_otro
      FROM public.asistencia a
      JOIN public.eventos_grupo eg ON eg.id = p_evento_id
      JOIN public.usuarios u ON u.id = a.usuario_id
     WHERE a.evento_grupo_id = p_evento_id
     ORDER BY u.nombre, u.apellido;
END;
$function$;

-- ---------------------------------------------------------------------------
-- sugerir_nombre_grupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sugerir_nombre_grupo(p_ubicacion text, p_temporada_id uuid, p_segmento_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
  v_segmento_nombre text;
  v_base text;
  v_ends_with_number boolean;
  v_max integer := 0;
  r record;
  v_nombre text;
  v_rem text;
BEGIN
  IF p_ubicacion IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  -- A name is suggested only to somebody who may create a group in this
  -- segment (puede_crear_grupo, the check crear_grupo_con_director runs);
  -- anybody else gets NULL. Only service_role skips the check.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND NOT coalesce(public.puede_crear_grupo(auth.uid(), p_segmento_id), false) THEN
    RETURN NULL;
  END IF;

  -- Obtener nombre de segmento
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = p_segmento_id;
  IF v_segmento_nombre IS NULL THEN
    RAISE EXCEPTION 'Segmento invalido';
  END IF;

  v_base := trim(p_ubicacion || ' ' || v_segmento_nombre);
  v_ends_with_number := right(trim(v_segmento_nombre), 1) ~ '^[0-9]$';

  FOR r IN
    SELECT g.nombre
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.segmento_id = p_segmento_id
      AND g.nombre ILIKE v_base || '%'
  LOOP
    v_nombre := trim(coalesce(r.nombre, ''));
    -- Si empieza con la base, tomamos el resto y detectamos sufijo numérico con o sin guion
    IF position(v_base in v_nombre) = 1 THEN
      v_rem := btrim(substring(v_nombre from char_length(v_base) + 1), ' ');
      IF v_rem ~ '^\-\s*\d+$' THEN
        v_rem := btrim(substring(v_rem from 2), ' '); -- quitar '-'
      END IF;
      IF v_rem ~ '^\d+$' THEN
        v_max := greatest(v_max, v_rem::int);
      END IF;
    END IF;
  END LOOP;

  v_max := v_max + 1;
  IF v_ends_with_number THEN
    RETURN v_base || ' - ' || v_max;
  ELSE
    RETURN v_base || ' ' || v_max;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- obtener_kpis_grupos_para_usuario: one overload
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.obtener_kpis_grupos_para_usuario(uuid);

-- ---------------------------------------------------------------------------
-- asignar_director_etapa_a_ubicacion
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.director_etapa_ubicaciones'::regclass
       AND c.conname = 'director_etapa_ubicaciones_director_unique'
       AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION 'director_etapa_ubicaciones_director_unique is missing; asignar_director_etapa_a_ubicacion needs it';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.asignar_director_etapa_a_ubicacion(p_auth_id uuid, p_director_etapa_id uuid, p_segmento_ubicacion_id uuid, p_accion text)
 RETURNS TABLE(id uuid, director_etapa_id uuid, segmento_ubicacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() uses the legacy per-claim request.jwt.claim.role when it is
  -- set and otherwise the role inside the JSON request.jwt.claims.
  v_request_role text := auth.role();
  v_user_id uuid;
  v_es_superior boolean := false;
  v_tipo text;
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF p_auth_id IS NULL OR p_director_etapa_id IS NULL OR p_segmento_ubicacion_id IS NULL OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = p_auth_id;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  SELECT TRUE INTO v_es_superior FROM public.usuario_roles ur JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = v_user_id AND rs.nombre_interno IN ('admin','pastor','director-general') LIMIT 1;
  -- SELECT INTO with no row sets v_es_superior to NULL, and IF NOT NULL does
  -- not raise: without coalesce anybody passed this check.
  IF NOT coalesce(v_es_superior, false) THEN RAISE EXCEPTION 'Permiso denegado'; END IF;
  -- The OUT columns id, director_etapa_id and segmento_ubicacion_id are
  -- variables here: every column below is qualified, and ON CONFLICT names the
  -- constraint because its column list cannot be qualified (42702 otherwise).
  SELECT sl.tipo_lider INTO v_tipo FROM public.segmento_lideres sl WHERE sl.id = p_director_etapa_id;
  IF v_tipo IS DISTINCT FROM 'director_etapa' THEN RAISE EXCEPTION 'No es director_etapa'; END IF;

  IF p_accion = 'agregar' THEN
    INSERT INTO public.director_etapa_ubicaciones(director_etapa_id, segmento_ubicacion_id)
    VALUES(p_director_etapa_id, p_segmento_ubicacion_id)
    ON CONFLICT ON CONSTRAINT director_etapa_ubicaciones_director_unique DO UPDATE SET segmento_ubicacion_id = EXCLUDED.segmento_ubicacion_id;
  ELSIF p_accion = 'quitar' THEN
    DELETE FROM public.director_etapa_ubicaciones deu WHERE deu.director_etapa_id = p_director_etapa_id;
  ELSE
    RAISE EXCEPTION 'Accion desconocida';
  END IF;

  RETURN QUERY
    SELECT deu.id, deu.director_etapa_id, deu.segmento_ubicacion_id
    FROM public.director_etapa_ubicaciones deu
    WHERE deu.director_etapa_id = p_director_etapa_id;
END;$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.resumen_dashboard_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_evento_grupo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resumen_dashboard_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_retencion(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_reporte_crecimiento_neto(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_eventos_grupo(uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_evento_grupo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_asistencia_evento(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_director_etapa_a_ubicacion(uuid, uuid, uuid, text) TO authenticated, service_role;
