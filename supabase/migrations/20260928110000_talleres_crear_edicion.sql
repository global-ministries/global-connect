-- T2 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — pulls the
-- instantiation core out of open_edicion into an internal building block
-- (talleres_instanciar_edicion), makes open_edicion a thin backward-compat
-- wrapper over it, and adds the one-question RPC the "Crear edición" screen
-- will call (talleres_crear_edicion): by temporada (fecha comes from the
-- temporada), or by cadencia (fecha is asked, optionally adelantando up to
-- 6 more ediciones spaced by the taller's own intervalo_ediciones_dias).
--
-- WHY
--   T1 moved tipo/vinculo/regimen/cierre_inscripcion_offset_dias onto the
--   taller and added fecha_inicio/fecha_fin/cierre_inscripcion to
--   taller_ediciones, but open_edicion still asked the CALLER for tipo,
--   link_type and modalidad_inscripcion and never touched the new date
--   columns at all — the "Crear edición" form still has to ask five
--   questions that the taller (or the temporada) already answers.
--
-- WHAT
--   1. talleres_instanciar_edicion(p_taller_id, p_fecha_inicio,
--      p_temporada_id, p_nombre, p_sesiones_fallback DEFAULT 1) — internal
--      only (no EXECUTE for authenticated/anon/PUBLIC). Body is today's
--      open_edicion body (verified byte-identical via pg_get_functiondef
--      before writing this) AFTER its authority check, with:
--        - tipo/link_type/modalidad_inscripcion(+_snapshot) copied from
--          talleres.tipo/vinculo/modalidad_default, never from a param —
--          the whole point of this refactor (decisions doc, "la edición
--          copia del taller").
--        - sesiones_snapshot: the taller's own active plantilla clase
--          count when it has one, else p_sesiones_fallback (DEFAULT 1) —
--          the exact pre-T2 A4-hardened rule, just renamed; kept only so
--          open_edicion's own p_sesiones_estimadas still means something
--          for a taller with no plantilla (criterion 8).
--        - fecha_inicio = p_fecha_inicio; fecha_fin = fecha_inicio +
--          (sesiones_snapshot - 1) * talleres.cadencia_dias;
--          cierre_inscripcion = fecha_inicio +
--          talleres.cierre_inscripcion_offset_dias.
--        - nombre_snapshot = COALESCE(p_nombre, temporada's own nombre
--          when p_temporada_id is given, "<Mes> <Año>" in Spanish
--          otherwise) — talleres_crear_edicion always passes p_nombre =>
--          NULL, so this is always derived there; open_edicion keeps
--          requiring a caller-supplied name (unchanged legacy behavior).
--          Month names are a literal Spanish array, not locale/lc_time,
--          so this is independent of the server's locale configuration.
--        - duracion_estimada_minutos_snapshot: talleres.duracion_minutos,
--          falling back to 60 — the exact convention
--          app/(auth)/talleres/[taller]/page.tsx already uses for the
--          open-edición form's own duración default
--          (`taller.duracion_minutos ?? 60`), reused here rather than
--          invented.
--        - the taller_periodos_generales INSERT (and the periodo_general_id
--          UPDATE) is DROPPED outright: that table is deprecated with 0
--          rows (docs/talleres-de-punta-a-punta.md, T1's own header), and
--          T1 already made the edición's own dates the source of truth
--          instead of a periodo row. periodo_general_id simply stays NULL
--          on every edición created from here on; the returned 'periodo_id'
--          key stays for shape compatibility but is now always NULL.
--        - firmantes is no longer a parameter at all (the new function has
--          none): the INSERT no longer lists that column, so
--          taller_ediciones.firmantes keeps its own '[]'::jsonb DEFAULT.
--        - the cohorte's started_at is now ALWAYS p_fecha_inicio (cast to
--          timestamptz), not only when modalidad_inscripcion happened to be
--          periodo_general — the edición's own fecha_inicio is now always
--          known, so there is no more "permanente_custom edicion with an
--          unanchored cohorte" case.
--        - the talleres_temporada_talleres upsert is unchanged EXCEPT it
--          now requires the temporada to actually exist first
--          (TEMPORADA_NOT_FOUND, P0002) — T3 will add the ownership check
--          (taller must hang off the temporada's own dirección tree) on
--          top of this existence check, not instead of it.
--        - grupos/facilitadores/reportes/clases instantiation loop: BYTE-
--          IDENTICAL to today's open_edicion (same talleres_es_servidor_
--          activo_del_taller gate, same generate_taller_sesiones call per
--          grupo).
--      Returns the same jsonb keys open_edicion returns today (taller_id,
--      edicion_id, event_id, periodo_id, cohorte_id, temporada_id, estado,
--      grupos_creados, facilitadores_omitidos, clases_por_grupo) PLUS
--      nombre, fecha_inicio, fecha_fin, cierre_inscripcion.
--   2. open_edicion(...) — SAME 11-arg signature, SAME authority check
--      (auth.uid(), general capability, taller lookup, scoped capability),
--      SAME param validations that still mean something (nombre required,
--      sesiones positive). Everything after that authority check is
--      replaced by one call to talleres_instanciar_edicion. p_tipo,
--      p_link_type, p_modalidad_inscripcion, p_duracion_estimada_minutos
--      and p_fecha_fin_periodo are still accepted (so every existing
--      caller keeps compiling/calling exactly as before) but are now
--      IGNORED — their own validations (INVALID_TIPO, INVALID_MODALIDAD,
--      INVALID_LINK_TYPE, LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL,
--      DURACION_MUST_BE_POSITIVE, FECHA_FIN_BEFORE_INICIO) are dropped
--      along with them — validating an input that can no longer affect
--      anything is dead code, not safety. p_firmantes is accepted and
--      silently unused for the same reason (talleres_instanciar_edicion
--      has no firmantes parameter at all).
--   3. talleres_crear_edicion(p_taller_id, p_fecha_inicio DEFAULT NULL,
--      p_temporada_id DEFAULT NULL, p_adelantar DEFAULT 0) — the new
--      one-question RPC, granted to authenticated. Authority: director.
--      write/admin.manage scoped to the taller's own node (same capability
--      pair open_edicion requires), 42501 sin_permisos_para_este_taller on
--      failure — the same message/errcode talleres_editar_grupo/
--      talleres_editar_clase/talleres_mover_plantilla_clase already use,
--      so every RPC this feature's own RLS-adjacent authority checks
--      raises reads the same way to a caller.
--        - talleres.regimen = 'temporada': p_temporada_id is required
--          (P0001 TEMPORADA_REQUERIDA), must exist (P0002
--          TEMPORADA_NOT_FOUND), and this taller must not already have a
--          non-cancelled edición in it (P0001 EDICION_YA_EXISTE, checked
--          via talleres_estado_efectivo so a stale stored 'cerrado'/
--          'abierto' still counts as "exists", only a genuinely cancelled
--          one does not). fecha_inicio = temporada.fecha_apertura; name =
--          the temporada's own nombre (talleres_instanciar_edicion derives
--          it, since p_nombre is always NULL here). Exactly ONE edición.
--        - talleres.regimen = 'cadencia': p_temporada_id must be NULL
--          (P0001 TEMPORADA_NO_PERMITIDA — a regimen this RPC never reads
--          a temporada for), p_fecha_inicio is required (P0001
--          FECHA_REQUERIDA), p_adelantar defaults to 0 and cannot be
--          negative (P0001 ADELANTAR_INVALIDO) or exceed 6 (P0001
--          ADELANTAR_MAXIMO_6); when p_adelantar > 0 the taller must have
--          intervalo_ediciones_dias set (P0001 SIN_INTERVALO). Creates
--          1 + p_adelantar ediciones, each fecha_inicio spaced by
--          intervalo_ediciones_dias from the previous one, one
--          talleres_instanciar_edicion call per edición. Two ediciones
--          that land in the same month get the SAME derived "<Mes> <Año>"
--          name from talleres_instanciar_edicion; talleres_crear_edicion
--          detects that collision (against names it itself already
--          produced earlier in this same call) and appends the day to the
--          later one ("Noviembre 2026 (29)"), then rewrites that one
--          edición's nombre_snapshot, its own operating_core_events.title/
--          metadata.taller_edicion and its cohorte's edicion label to
--          match, so nothing downstream is left holding the pre-collision
--          name.
--      Returns {ediciones: [{edicion_id, nombre, fecha_inicio, fecha_fin,
--      cierre_inscripcion, grupos_creados, clases_por_grupo,
--      facilitadores_omitidos}, ...]}.
--   4. Comments on all three functions.
--
-- SAFETY
--   No table, column, policy, or existing grant is dropped. talleres_
--   instanciar_edicion is a brand new function, REVOKEd from PUBLIC, anon
--   AND authenticated — only postgres/service_role (and, transitively, any
--   other SECURITY DEFINER function owned by postgres, since a SECURITY
--   DEFINER body's own nested calls are checked against ITS owner, exactly
--   the same mechanism already relied on for talleres_es_servidor_activo_
--   del_taller since the T7 hardening migration) can call it. open_edicion
--   keeps its exact signature and its exact authority check, so every
--   existing caller (app code, every SQL test that calls it) keeps
--   working unchanged. No DELETE/TRUNCATE/DROP TABLE. Grupos de Vida
--   (grupos, grupo_miembros, segmento_lideres, roles_sistema,
--   usuario_roles, temporadas) is not referenced anywhere in this file.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.talleres_crear_edicion(uuid, date, uuid, integer);
--   DROP FUNCTION IF EXISTS public.talleres_instanciar_edicion(uuid, date, uuid, text, integer);
--   Re-apply 20260927130000_talleres_configuracion_hardening.sql's own
--   CREATE OR REPLACE FUNCTION public.open_edicion(...) body (pre-T2).

-- ── talleres_instanciar_edicion: internal instantiation core ────────────

CREATE OR REPLACE FUNCTION public.talleres_instanciar_edicion(
  p_taller_id uuid,
  p_fecha_inicio date,
  p_temporada_id uuid,
  p_nombre text,
  p_sesiones_fallback integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller                   public.talleres%ROWTYPE;
  v_temporada_nombre         text;
  v_edicion_id                uuid;
  v_event_id                  uuid;
  v_cohorte_id                 uuid;
  v_equipo_id                   uuid;
  v_pg                          RECORD;
  v_pf                          RECORD;
  v_nuevo_grupo_id               uuid;
  v_grupos_creados                jsonb := '[]'::jsonb;
  v_facilitadores_omitidos        jsonb := '[]'::jsonb;
  v_facilitadores_asignados       integer;
  v_clases_por_grupo               integer := 0;
  v_generar_resultado               jsonb;
  v_plantilla_clases_activas         integer;
  v_sesiones_snapshot                 integer;
  v_nombre                             text;
  v_fecha_fin                           date;
  v_cierre_inscripcion                  date;
  v_meses                                text[] := ARRAY[
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
BEGIN
  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'FECHA_INICIO_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;

  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;

  IF p_temporada_id IS NOT NULL THEN
    SELECT nombre INTO v_temporada_nombre
    FROM public.talleres_temporadas
    WHERE id = p_temporada_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT count(*) INTO v_plantilla_clases_activas
    FROM public.taller_plantilla_clases
   WHERE taller_id = p_taller_id AND activo = true;
  v_sesiones_snapshot := CASE WHEN v_plantilla_clases_activas > 0
                               THEN v_plantilla_clases_activas
                               ELSE COALESCE(p_sesiones_fallback, 1) END;

  v_fecha_fin := p_fecha_inicio + ((v_sesiones_snapshot - 1) * v_taller.cadencia_dias);
  v_cierre_inscripcion := p_fecha_inicio + v_taller.cierre_inscripcion_offset_dias;

  v_nombre := COALESCE(
    NULLIF(btrim(p_nombre), ''),
    v_temporada_nombre,
    v_meses[EXTRACT(MONTH FROM p_fecha_inicio)::integer] || ' ' || EXTRACT(YEAR FROM p_fecha_inicio)::text
  );

  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop', 'active', v_nombre,
    to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', v_taller.tipo,
      'taller_edicion', v_nombre,
      'taller_link_type', v_taller.vinculo,
      'modalidad_inscripcion', v_taller.modalidad_default,
      'taller_id', p_taller_id,
      'created_via', 'talleres_instanciar_edicion'
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, taller_id, temporada_id,
    fecha_inicio, fecha_fin, cierre_inscripcion
  ) VALUES (
    v_event_id, v_taller.tipo, v_taller.vinculo, v_taller.modalidad_default,
    'borrador', v_nombre, v_sesiones_snapshot, COALESCE(v_taller.duracion_minutos, 60),
    v_taller.modalidad_default, p_taller_id, p_temporada_id,
    p_fecha_inicio, v_fecha_fin, v_cierre_inscripcion
  )
  RETURNING id INTO v_edicion_id;

  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    v_edicion_id, v_equipo_id, v_nombre, p_fecha_inicio::timestamptz, NULL
  )
  RETURNING id INTO v_cohorte_id;

  IF p_temporada_id IS NOT NULL THEN
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (p_temporada_id, p_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;
  END IF;

  FOR v_pg IN
    SELECT id, nombre, capacidad
      FROM public.taller_plantilla_grupos
     WHERE taller_id = p_taller_id AND activo = true
     ORDER BY orden
  LOOP
    INSERT INTO public.taller_grupos (cohorte_id, nombre, capacidad, estado)
    VALUES (v_cohorte_id, v_pg.nombre, v_pg.capacidad, 'activo')
    RETURNING id INTO v_nuevo_grupo_id;

    v_facilitadores_asignados := 0;

    FOR v_pf IN
      SELECT pf.persona_id, pf.rol, u.nombre, u.apellido
        FROM public.taller_plantilla_facilitadores pf
        JOIN public.usuarios u ON u.id = pf.persona_id
       WHERE pf.plantilla_grupo_id = v_pg.id
       ORDER BY pf.created_at
    LOOP
      IF public.talleres_es_servidor_activo_del_taller(p_taller_id, v_pf.persona_id) THEN
        INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol)
        VALUES (v_nuevo_grupo_id, v_pf.persona_id, v_pf.rol);

        v_facilitadores_asignados := v_facilitadores_asignados + 1;
      ELSE
        v_facilitadores_omitidos := v_facilitadores_omitidos || jsonb_build_object(
          'persona_id', v_pf.persona_id,
          'nombre', v_pf.nombre,
          'apellido', v_pf.apellido,
          'plantilla_grupo', v_pg.nombre
        );
      END IF;
    END LOOP;

    INSERT INTO public.taller_reportes (grupo_id, estado, observaciones_generales)
    VALUES (v_nuevo_grupo_id, 'borrador', 'Reporte generado automáticamente al abrir la edición.');

    v_generar_resultado := public.generate_taller_sesiones(v_nuevo_grupo_id);
    v_clases_por_grupo := COALESCE((v_generar_resultado ->> 'total')::integer, 0);

    v_grupos_creados := v_grupos_creados || jsonb_build_object(
      'grupo_id', v_nuevo_grupo_id,
      'nombre', v_pg.nombre,
      'facilitadores_asignados', v_facilitadores_asignados
    );
  END LOOP;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', NULL,
    'cohorte_id', v_cohorte_id,
    'temporada_id', p_temporada_id,
    'estado', 'borrador',
    'grupos_creados', v_grupos_creados,
    'facilitadores_omitidos', v_facilitadores_omitidos,
    'clases_por_grupo', v_clases_por_grupo,
    'nombre', v_nombre,
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', v_fecha_fin,
    'cierre_inscripcion', v_cierre_inscripcion
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_instanciar_edicion(uuid, date, uuid, text, integer) IS
  'Internal instantiation core (T2, odd/tasks/talleres-temporadas-y-ediciones.md): creates one edicion with tipo/link_type/modalidad copied from the taller, dates derived from p_fecha_inicio, and the plantilla-driven grupos/facilitadores/reportes/clases cycle. No EXECUTE for anon/PUBLIC/authenticated — callable only from another SECURITY DEFINER function owned by postgres (open_edicion, talleres_crear_edicion, and T3''s temporada RPCs). Callers are responsible for their OWN authority check before calling this.';

REVOKE ALL ON FUNCTION public.talleres_instanciar_edicion(uuid, date, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_instanciar_edicion(uuid, date, uuid, text, integer) TO postgres, service_role;

-- ── open_edicion: same signature, becomes a thin wrapper ─────────────────

CREATE OR REPLACE FUNCTION public.open_edicion(p_taller_id uuid, p_tipo text, p_nombre_edicion text, p_link_type text, p_sesiones_estimadas integer, p_duracion_estimada_minutos integer, p_modalidad_inscripcion text, p_fecha_inicio_periodo timestamp with time zone, p_fecha_fin_periodo timestamp with time zone, p_firmantes jsonb, p_temporada_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       public.talleres%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_taller.dream_team_equipo_id)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_taller.dream_team_equipo_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this taller''s tree'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN
    RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones_estimadas <= 0 THEN
    RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;

  -- T2 (odd/tasks/talleres-temporadas-y-ediciones.md): p_tipo, p_link_type,
  -- p_modalidad_inscripcion, p_duracion_estimada_minutos, p_fecha_fin_periodo
  -- and p_firmantes are ACCEPTED for backward compatibility with every
  -- existing caller/test but are now IGNORED outright, including their own
  -- former validations (INVALID_TIPO, INVALID_MODALIDAD, INVALID_LINK_TYPE,
  -- LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL, DURACION_MUST_BE_POSITIVE,
  -- FECHA_FIN_BEFORE_INICIO) — the edicion always copies tipo/link_type/
  -- modalidad_inscripcion from the taller's own configuration
  -- (talleres.tipo/vinculo/modalidad_default) and duracion_estimada_
  -- minutos_snapshot from talleres.duracion_minutos (fallback 60), never
  -- from these params, so validating them would be validating dead input.
  -- p_sesiones_estimadas is NOT ignored: it still flows through as
  -- talleres_instanciar_edicion's p_sesiones_fallback, used only when the
  -- taller has no active plantilla (criterion 8, unchanged).
  RETURN public.talleres_instanciar_edicion(
    p_taller_id,
    p_fecha_inicio_periodo::date,
    p_temporada_id,
    p_nombre_edicion,
    p_sesiones_estimadas
  );
END;
$function$;

COMMENT ON FUNCTION public.open_edicion(uuid, text, text, text, integer, integer, text, timestamptz, timestamptz, jsonb, uuid) IS
  'Legacy 11-arg entry point (kept for every existing caller/test), now a thin wrapper over talleres_instanciar_edicion (T2, odd/tasks/talleres-temporadas-y-ediciones.md). p_tipo/p_link_type/p_modalidad_inscripcion/p_duracion_estimada_minutos/p_fecha_fin_periodo/p_firmantes are accepted but ignored; the edicion always copies tipo/link_type/modalidad from the taller. p_sesiones_estimadas still flows through as the no-plantilla fallback sesiones count.';

-- ── talleres_crear_edicion: the one-question "Crear edición" RPC ─────────

CREATE OR REPLACE FUNCTION public.talleres_crear_edicion(
  p_taller_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_adelantar integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller          public.talleres%ROWTYPE;
  v_equipo_id       uuid;
  v_temporada       public.talleres_temporadas%ROWTYPE;
  v_resultado       jsonb;
  v_ediciones       jsonb := '[]'::jsonb;
  v_nombres_usados  text[] := ARRAY[]::text[];
  v_nombre_final    text;
  v_fecha_i         date;
  v_i               integer;
BEGIN
  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  v_equipo_id := v_taller.dream_team_equipo_id;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  IF v_taller.regimen = 'temporada' THEN
    IF p_temporada_id IS NULL THEN
      RAISE EXCEPTION 'TEMPORADA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_temporada
    FROM public.talleres_temporadas
    WHERE id = p_temporada_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.taller_ediciones te
       WHERE te.taller_id = p_taller_id
         AND te.temporada_id = p_temporada_id
         AND public.talleres_estado_efectivo(te) <> 'cancelado'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
    END IF;

    v_resultado := public.talleres_instanciar_edicion(
      p_taller_id, v_temporada.fecha_apertura::date, p_temporada_id, NULL
    );

    v_ediciones := v_ediciones || jsonb_build_object(
      'edicion_id', v_resultado ->> 'edicion_id',
      'nombre', v_resultado ->> 'nombre',
      'fecha_inicio', v_resultado ->> 'fecha_inicio',
      'fecha_fin', v_resultado ->> 'fecha_fin',
      'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
      'grupos_creados', v_resultado -> 'grupos_creados',
      'clases_por_grupo', v_resultado -> 'clases_por_grupo',
      'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
    );

  ELSE -- regimen = 'cadencia'
    IF p_temporada_id IS NOT NULL THEN
      RAISE EXCEPTION 'TEMPORADA_NO_PERMITIDA' USING ERRCODE = 'P0001';
    END IF;
    IF p_fecha_inicio IS NULL THEN
      RAISE EXCEPTION 'FECHA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar < 0 THEN
      RAISE EXCEPTION 'ADELANTAR_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 6 THEN
      RAISE EXCEPTION 'ADELANTAR_MAXIMO_6' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 0 AND v_taller.intervalo_ediciones_dias IS NULL THEN
      RAISE EXCEPTION 'SIN_INTERVALO' USING ERRCODE = 'P0001';
    END IF;

    FOR v_i IN 0..p_adelantar LOOP
      v_fecha_i := p_fecha_inicio + (v_i * COALESCE(v_taller.intervalo_ediciones_dias, 0));

      v_resultado := public.talleres_instanciar_edicion(
        p_taller_id, v_fecha_i, NULL, NULL
      );

      v_nombre_final := v_resultado ->> 'nombre';
      -- Two ediciones landing in the same month derive the SAME "<Mes>
      -- <Año>" name from talleres_instanciar_edicion (it has no sibling
      -- visibility of its own) — detect that collision here, against names
      -- THIS call already produced, and disambiguate the later one by
      -- appending its day. Rewrite every place that name was already
      -- written so nothing downstream is left holding the stale one.
      IF v_nombre_final = ANY (v_nombres_usados) THEN
        v_nombre_final := v_nombre_final || ' (' || to_char(v_fecha_i, 'DD') || ')';

        UPDATE public.taller_ediciones
           SET nombre_snapshot = v_nombre_final
         WHERE id = (v_resultado ->> 'edicion_id')::uuid;

        UPDATE public.operating_core_events
           SET title = v_nombre_final,
               metadata = jsonb_set(metadata, '{taller_edicion}', to_jsonb(v_nombre_final))
         WHERE id = (v_resultado ->> 'event_id')::uuid;

        UPDATE public.talleres_crecimiento_cohortes
           SET edicion = v_nombre_final
         WHERE id = (v_resultado ->> 'cohorte_id')::uuid;
      END IF;
      v_nombres_usados := v_nombres_usados || v_nombre_final;

      v_ediciones := v_ediciones || jsonb_build_object(
        'edicion_id', v_resultado ->> 'edicion_id',
        'nombre', v_nombre_final,
        'fecha_inicio', v_resultado ->> 'fecha_inicio',
        'fecha_fin', v_resultado ->> 'fecha_fin',
        'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
        'grupos_creados', v_resultado -> 'grupos_creados',
        'clases_por_grupo', v_resultado -> 'clases_por_grupo',
        'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ediciones', v_ediciones);
END;
$function$;

COMMENT ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) IS
  'The one-question "Crear edición" RPC (T2, odd/tasks/talleres-temporadas-y-ediciones.md). By temporada: only p_temporada_id, refuses a second non-cancelled edición of this taller in it. By cadencia: only p_fecha_inicio, with an optional p_adelantar (max 6) that creates 1+p_adelantar ediciones spaced by talleres.intervalo_ediciones_dias, disambiguating same-month names by appending the day. Everything else (tipo, link_type, modalidad, nombre, fechas) is derived via talleres_instanciar_edicion.';

REVOKE ALL ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) TO authenticated, postgres, service_role;
