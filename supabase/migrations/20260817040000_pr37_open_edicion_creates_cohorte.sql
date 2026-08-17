-- ═══════════════════════════════════════════════════════════════════
-- PR37 — open_edicion should create the first cohorte automatically
--
-- Before PR37: open_edicion created a taller_ediciones row but no
-- talleres_crecimiento_cohortes row. Inscription queries fail with
-- "No se encontró cohorte para este taller".
--
-- Fix: extend open_edicion to also INSERT into talleres_crecimiento_cohortes
-- with edicion = p_nombre_edicion. The 9-arg and 10-arg overloads both
-- need this fix (they share the body except for p_tipo).
--
-- dream_team_equipo_id uses the current production-compatible team when
-- available, otherwise NULL; admin can assign a team later via the
-- existing admin flow or a future PR.
-- started_at is set to the taller's modalidad period start (p_fecha_inicio_periodo)
-- when modalidad=periodo_general, otherwise NULL.
-- ended_at is left NULL (edición in progress).

-- ── 1. Fix the 9-arg overload ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_edicion(
  p_taller_id              uuid,
  p_nombre_edicion          text,
  p_link_type               text,
  p_sesiones_estimadas      int,
  p_duracion_estimada_minutos int,
  p_modalidad_inscripcion   text,
  p_fecha_inicio_periodo    timestamptz,
  p_fecha_fin_periodo       timestamptz,
  p_firmantes               jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       public.talleres%ROWTYPE;
  v_edicion_id   uuid;
  v_event_id     uuid;
  v_periodo_id   uuid;
  v_cohorte_id   uuid;
  v_cohorte_started_at timestamptz;
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

  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN
    RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones_estimadas <= 0 THEN
    RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_duracion_estimada_minutos <= 0 THEN
    RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion USING ERRCODE = '22023';
  END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN
    RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023';
  END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN
    RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023';
  END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN
    p_firmantes := '[]'::jsonb;
  END IF;

  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop', 'active', p_nombre_edicion,
    to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', v_taller.modalidad_default,
      'taller_edicion', p_nombre_edicion,
      'taller_link_type', p_link_type,
      'modalidad_inscripcion', p_modalidad_inscripcion,
      'taller_id', p_taller_id,
      'created_via', 'admin_pr23_2a'
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    recurrence_rule, periodo_general_id, estado, nombre_snapshot,
    sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, firmantes, taller_id
  ) VALUES (
    v_event_id, v_taller.modalidad_default, p_link_type, p_modalidad_inscripcion,
    NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas,
    p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id
  )
  RETURNING id INTO v_edicion_id;

  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (
      taller_id, edicion_label, fecha_apertura_automatica, fecha_cierre_automatico
    ) VALUES (
      v_edicion_id, p_nombre_edicion, p_fecha_inicio_periodo, p_fecha_fin_periodo
    )
    RETURNING id INTO v_periodo_id;

    UPDATE public.taller_ediciones
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;

    v_cohorte_started_at := p_fecha_inicio_periodo;
  ELSE
    v_cohorte_started_at := NULL;
  END IF;

  -- Create the first cohorte for this edicion (PR37 fix)
  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    p_taller_id,
    (SELECT id FROM public.dream_team_equipos ORDER BY id LIMIT 1),
    p_nombre_edicion, v_cohorte_started_at, NULL
  )
  RETURNING id INTO v_cohorte_id;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'cohorte_id', v_cohorte_id,
    'estado', 'borrador'
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.open_edicion(
  uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb
) TO authenticated;

-- ── 2. Fix the 10-arg overload (with p_tipo) ──────────────────────
CREATE OR REPLACE FUNCTION public.open_edicion(
  p_taller_id              uuid,
  p_tipo                    text,
  p_nombre_edicion          text,
  p_link_type               text,
  p_sesiones_estimadas      int,
  p_duracion_estimada_minutos int,
  p_modalidad_inscripcion   text,
  p_fecha_inicio_periodo    timestamptz,
  p_fecha_fin_periodo       timestamptz,
  p_firmantes               jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       public.talleres%ROWTYPE;
  v_edicion_id   uuid;
  v_event_id     uuid;
  v_periodo_id   uuid;
  v_cohorte_id   uuid;
  v_cohorte_started_at timestamptz;
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

  IF p_tipo NOT IN ('individual', 'pareja') THEN
    RAISE EXCEPTION 'INVALID_TIPO: %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN
    RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones_estimadas <= 0 THEN
    RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_duracion_estimada_minutos <= 0 THEN
    RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion USING ERRCODE = '22023';
  END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN
    RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'individual' AND p_link_type IS NOT NULL THEN
    RAISE EXCEPTION 'LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN
    RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023';
  END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN
    p_firmantes := '[]'::jsonb;
  END IF;

  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop', 'active', p_nombre_edicion,
    to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', p_tipo,
      'taller_edicion', p_nombre_edicion,
      'taller_link_type', p_link_type,
      'modalidad_inscripcion', p_modalidad_inscripcion,
      'taller_id', p_taller_id,
      'created_via', 'admin_pr23_2a'
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    recurrence_rule, periodo_general_id, estado, nombre_snapshot,
    sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, firmantes, taller_id
  ) VALUES (
    v_event_id, p_tipo, p_link_type, p_modalidad_inscripcion,
    NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas,
    p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id
  )
  RETURNING id INTO v_edicion_id;

  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (
      taller_id, edicion_label, fecha_apertura_automatica, fecha_cierre_automatico
    ) VALUES (
      v_edicion_id, p_nombre_edicion, p_fecha_inicio_periodo, p_fecha_fin_periodo
    )
    RETURNING id INTO v_periodo_id;

    UPDATE public.taller_ediciones
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;

    v_cohorte_started_at := p_fecha_inicio_periodo;
  ELSE
    v_cohorte_started_at := NULL;
  END IF;

  -- Create the first cohorte for this edicion (PR37 fix)
  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    p_taller_id,
    (SELECT id FROM public.dream_team_equipos ORDER BY id LIMIT 1),
    p_nombre_edicion, v_cohorte_started_at, NULL
  )
  RETURNING id INTO v_cohorte_id;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'cohorte_id', v_cohorte_id,
    'estado', 'borrador'
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.open_edicion(
  uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb
) TO authenticated;

-- ── 3. Backfill cohortes for the 4 existing prod ediciones ─────────
-- Before PR37, the 4 existing taller_ediciones rows (Matrimonio)
-- were created without cohortes. Backfill so inscripciones work
-- immediately. We use the periodo's fecha_apertura_automatica as
-- the cohorte started_at, or NULL if no periodo.
DO $do$
DECLARE
  v_ed record;
  v_cohorte_id uuid;
BEGIN
  FOR v_ed IN
    SELECT id, nombre_snapshot, periodo_general_id
    FROM public.taller_ediciones
    WHERE NOT EXISTS (
      SELECT 1 FROM public.talleres_crecimiento_cohortes c
      WHERE c.taller_id = taller_ediciones.id
        AND c.edicion = taller_ediciones.nombre_snapshot
    )
  LOOP
    INSERT INTO public.talleres_crecimiento_cohortes (
      taller_id, dream_team_equipo_id, edicion, started_at, ended_at
    ) VALUES (
      v_ed.id,
      (SELECT id FROM public.dream_team_equipos ORDER BY id LIMIT 1),
      v_ed.nombre_snapshot,
      (SELECT fecha_apertura_automatica FROM public.taller_periodos_generales WHERE id = v_ed.periodo_general_id),
      NULL
    )
    RETURNING id INTO v_cohorte_id;
    RAISE NOTICE 'PR37 backfill: created cohorte % for edicion % (%)', v_cohorte_id, v_ed.nombre_snapshot, v_ed.id;
  END LOOP;
END
$do$;
