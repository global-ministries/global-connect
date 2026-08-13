-- ════════════════════════════════════════════════════════════════════
-- PR23.2a — Talleres M5.5: `open_edicion` RPC.
-- Adds an atomic RPC that opens a new edicion (occurrence) of an
-- existing abstract taller. Mirrors the PR21 create_taller_with_initial_state
-- pattern but operates on a taller abstract + creates one row in
-- talleres_crecimiento_metadata.
--
-- The PR23.2a scope does NOT rename the existing
-- `talleres_crecimiento_metadata` table — that happens in PR23.2b. The
-- new RPC writes to the existing table so all 14 API routes from
-- PR15-PR16 keep working.
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) open_edicion RPC                                             ║
-- ╚══════════════════════════════════════════════════════════════════╝

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
BEGIN
  -- 1. Auth + cap gate
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

  -- 2. Validate taller exists
  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validate inputs
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

  -- 4. Create operating_core_events for this edicion
  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop',
    'active',
    p_nombre_edicion,
    to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', v_taller.modalidad_default, -- placeholder; edicion has its own tipo below
      'taller_edicion', p_nombre_edicion,
      'taller_link_type', p_link_type,
      'modalidad_inscripcion', p_modalidad_inscripcion,
      'taller_id', p_taller_id,
      'created_via', 'admin_pr23_2a'
    )
  )
  RETURNING id INTO v_event_id;

  -- 5. Create talleres_crecimiento_metadata row (this is the "edicion")
  INSERT INTO public.talleres_crecimiento_metadata (
    operating_core_event_id,
    tipo,  -- reuses the column for the abstract taller type (individual|pareja)
    link_type,
    modalidad_inscripcion,
    recurrence_rule,
    periodo_general_id,
    estado,
    nombre_snapshot,
    sesiones_snapshot,
    duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot,
    firmantes,
    taller_id
  ) VALUES (
    v_event_id,
    v_taller.modalidad_default,  -- copied from the abstract taller's default
    p_link_type,
    p_modalidad_inscripcion,
    NULL,
    NULL,  -- backfilled below if modalidad=periodo_general
    'borrador',
    p_nombre_edicion,
    p_sesiones_estimadas,
    p_duracion_estimada_minutos,
    p_modalidad_inscripcion,
    p_firmantes,
    p_taller_id
  )
  RETURNING id INTO v_edicion_id;

  -- 6. Create taller_periodos_generales if modalidad=periodo_general
  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (
      taller_id, edicion_label,
      fecha_apertura_automatica, fecha_cierre_automatico
    ) VALUES (
      v_edicion_id,
      p_nombre_edicion,
      p_fecha_inicio_periodo,
      p_fecha_fin_periodo
    )
    RETURNING id INTO v_periodo_id;

    UPDATE public.talleres_crecimiento_metadata
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;
  END IF;

  -- NOTE: This PR23.2a RPC does NOT create the first cohorte or
  -- assign the equipo. PR23.2b adds the full "abrir edicion" flow
  -- with cohorte + equipo + asignaciones. For now, the edicion is
  -- created in 'borrador' estado with no cohorte — the admin can
  -- add a cohorte later via the existing /api/talleres/grupos POST
  -- or via a future PR.

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'estado', 'borrador'
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.open_edicion(
  uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_edicion(
  uuid, text, text, int, int, text, timestamptz, timestamptz, jsonb
) TO authenticated;
