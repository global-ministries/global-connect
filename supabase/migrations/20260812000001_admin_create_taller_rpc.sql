-- ════════════════════════════════════════════════════════════════════
-- Fase 5.5 / PR21 — Admin RPC: create_taller_with_initial_state
--
-- Atomic creation of a taller + its first operating_core_event +
-- taller_periodos_generales + talleres_crecimiento_cohortes +
-- (optional) dream_team_equipos. Returns the new ids as JSON.
--
-- SECURITY DEFINER + restricted EXECUTE grant: only the
-- 'talleres_crecimiento.director.write' or 'talleres_crecimiento.admin.manage'
-- capability can call. The function bypasses RLS for the duration of
-- the call (only on the affected rows, not globally). This is the
-- established pattern (F3 PR cohorts, F4 grants).
--
-- Atomicity: 6 DB writes wrapped in a single transaction. Either all
-- 6 succeed or none do (Postgres auto-rollback on exception). The
-- caller never sees a half-created taller.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_taller_with_initial_state(
  p_nombre                          text,
  p_edicion                         text,
  p_tipo                            text,
  p_link_type                       text,
  p_sesiones_estimadas              int,
  p_duracion_estimada_minutos       int,
  p_modalidad_inscripcion           text,
  p_fecha_inicio_periodo            timestamptz,
  p_fecha_fin_periodo               timestamptz,
  p_firmantes                       jsonb,
  p_cohorte_edicion_label           text,
  p_cohorte_started_at              timestamptz,
  p_cohorte_ended_at                timestamptz,
  p_equipo_id                       uuid,
  p_equipo_label                    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id        uuid;
  v_taller_id       uuid;
  v_periodo_id      uuid;
  v_cohorte_id      uuid;
  v_equipo_id       uuid;
  v_user_id         uuid;
  v_cap_ok          boolean;
  v_inserted_event  jsonb;
BEGIN
  -- ─── 1. Authorization gate (defense-in-depth + capability check) ───
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

  -- ─── 2. Validate input enums (DB-level guards for invalid state) ───
  IF p_tipo NOT IN ('individual', 'pareja') THEN
    RAISE EXCEPTION 'INVALID_TIPO: %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion
      USING ERRCODE = '22023';
  END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN
    RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023';
  END IF;
  IF p_link_type IS NOT NULL AND p_tipo = 'individual' THEN
    RAISE EXCEPTION 'LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones_estimadas <= 0 THEN
    RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_duracion_estimada_minutos <= 0 THEN
    RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_inicio_periodo IS NOT NULL
     AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN
    RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023';
  END IF;
  IF p_firmantes IS NULL THEN
    p_firmantes := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_firmantes) <> 'array' THEN
    RAISE EXCEPTION 'FIRMANTES_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  -- ─── 3. Resolve equipo (existing or new) ───────────────────────────
  IF p_equipo_id IS NOT NULL THEN
    SELECT id INTO v_equipo_id
    FROM public.dream_team_equipos
    WHERE id = p_equipo_id
      AND experiencia = 'talleres_crecimiento'
      AND activo = true;
    IF v_equipo_id IS NULL THEN
      RAISE EXCEPTION 'EQUIPO_NOT_FOUND_OR_INACTIVE: %', p_equipo_id
        USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_equipo_label IS NOT NULL AND length(trim(p_equipo_label)) > 0 THEN
    INSERT INTO public.dream_team_equipos (experiencia, label, activo)
    VALUES ('talleres_crecimiento', trim(p_equipo_label), true)
    RETURNING id INTO v_equipo_id;
  ELSE
    RAISE EXCEPTION 'MUST_PROVIDE_EQUIPO_ID_OR_LABEL' USING ERRCODE = '22023';
  END IF;

  -- ─── 4. Create operating_core_events (kind='workshop') ─────────────
  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop',
    'active',
    p_nombre,
    to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', p_tipo,
      'taller_edicion', p_edicion,
      'taller_link_type', p_link_type,
      'modalidad_inscripcion', p_modalidad_inscripcion,
      'created_via', 'admin_pr21'
    )
  )
  RETURNING id INTO v_event_id;

  -- ─── 5. Create talleres_crecimiento_metadata (snapshot inmutability) ─
  INSERT INTO public.talleres_crecimiento_metadata (
    operating_core_event_id,
    tipo,
    link_type,
    modalidad_inscripcion,
    recurrence_rule,
    periodo_general_id,
    estado,
    nombre_snapshot,
    sesiones_snapshot,
    duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot,
    firmantes
  ) VALUES (
    v_event_id,
    p_tipo,
    p_link_type,
    p_modalidad_inscripcion,
    NULL,
    NULL,  -- set after periodo insert (chicken-and-egg: periodo needs taller_id)
    'borrador',  -- admin can open later via the state machine
    p_nombre,
    p_sesiones_estimadas,
    p_duracion_estimada_minutos,
    p_modalidad_inscripcion,
    p_firmantes
  )
  RETURNING id INTO v_taller_id;

  -- ─── 6. Create taller_periodos_generales (if modalidad=periodo_general) ─
  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (
      taller_id, edicion_label,
      fecha_apertura_automatica, fecha_cierre_automatico
    ) VALUES (
      v_taller_id,
      p_edicion,
      p_fecha_inicio_periodo,
      p_fecha_fin_periodo
    )
    RETURNING id INTO v_periodo_id;

    -- Backfill the periodo FK on the metadata row.
    UPDATE public.talleres_crecimiento_metadata
    SET periodo_general_id = v_periodo_id
    WHERE id = v_taller_id;
  END IF;

  -- ─── 7. Create talleres_crecimiento_cohortes ────────────────────────
  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion,
    started_at, ended_at
  ) VALUES (
    v_taller_id,
    v_equipo_id,
    p_cohorte_edicion_label,
    p_cohorte_started_at,
    p_cohorte_ended_at
  )
  RETURNING id INTO v_cohorte_id;

  -- ─── 8. Return ids as JSON ─────────────────────────────────────────
  RETURN jsonb_build_object(
    'taller_id', v_taller_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'cohorte_id', v_cohorte_id,
    'equipo_id', v_equipo_id
  );
END;
$$;

-- ─── Restricted EXECUTE grant ──────────────────────────────────────────
-- Only authenticated users with the right capability can call this
-- function. The function itself re-checks the capability, but the
-- REVOKE is defense-in-depth (caller must be a logged-in user).
REVOKE ALL ON FUNCTION public.create_taller_with_initial_state(
  text, text, text, text, int, int, text, timestamptz, timestamptz,
  jsonb, text, timestamptz, timestamptz, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_taller_with_initial_state(
  text, text, text, text, int, int, text, timestamptz, timestamptz,
  jsonb, text, timestamptz, timestamptz, uuid, text
) TO authenticated;
