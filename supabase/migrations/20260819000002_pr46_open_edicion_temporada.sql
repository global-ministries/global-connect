-- ═══════════════════════════════════════════════════════════════════
-- PR46 (restructure PR C) — open_edicion binds an edición to a Temporada.
--
-- Fase 5 GdV-parity restructure. Additive + forward-only. Adds ONE new
-- overload of public.open_edicion that carries a trailing p_temporada_id
-- so opening an edición can bind it to a global season (PR45's
-- talleres_temporadas) and record the taller under that season via the
-- junction talleres_temporada_talleres.
--
-- ⚠️ POSTGRES OVERLOAD SAFETY (LIVE PRODUCTION). The plan (§2) said
-- "extend open_edicion with a trailing p_temporada_id uuid DEFAULT NULL".
-- That is UNSAFE: a DEFAULT NULL overload is callable with 10 args and
-- would collide with the EXISTING 10-arg overload (PR37), raising
--   ERROR: function open_edicion(...) is not unique
-- which breaks the production "abrir edición" flow that works today.
--
-- DEVIATION FROM PLAN (deliberate): the new param is REQUIRED (NO
-- DEFAULT). An 11-arg-no-default function can only be resolved by an
-- 11-arg call, so it never overlaps the 9-arg or 10-arg overloads. The
-- single caller (openEdicion server action) always passes the 11th arg
-- (a uuid, or explicit NULL for "no season"). The 9-arg and 10-arg
-- overloads are left BYTE-UNTOUCHED (no DROP, no CREATE OR REPLACE).
--
-- Body = faithful copy of the PR37 10-arg (with-p_tipo) body, plus:
--   (a) temporada_id written on the taller_ediciones INSERT,
--   (b) junction row recorded when p_temporada_id IS NOT NULL
--       (ON CONFLICT DO NOTHING — idempotent, mirrors PR45 backfill),
--   (c) temporada_id echoed back in the RETURN jsonb.
--
-- Authored + tested (static SQL) on a scratch DB; applying to
-- production is the operator's deploy step.
-- ═══════════════════════════════════════════════════════════════════

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
  p_firmantes               jsonb,
  p_temporada_id            uuid
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
      'created_via', 'admin_pr46_temporada'
    )
  )
  RETURNING id INTO v_event_id;

  -- taller_ediciones now carries temporada_id (PR45 FK). NULL means the
  -- edición is not bound to any global season (backward-compatible with
  -- the 9-arg / 10-arg overloads, which never set it).
  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    recurrence_rule, periodo_general_id, estado, nombre_snapshot,
    sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, firmantes, taller_id, temporada_id
  ) VALUES (
    v_event_id, p_tipo, p_link_type, p_modalidad_inscripcion,
    NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas,
    p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id, p_temporada_id
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

  -- Create the first cohorte for this edicion.
  -- talleres_crecimiento_cohortes.taller_id is a FK to taller_ediciones(id)
  -- (the EDICIÓN PK) — NOT the abstract talleres.id. The read path
  -- (loadEdicionLocalDetalle), generate_taller_sesiones (PR47), and the PR37
  -- backfill all resolve/write the cohorte by the edición PK, so we key it by
  -- v_edicion_id. (The abstract taller is already recorded on
  -- taller_ediciones.taller_id above and in the junction below.)
  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    v_edicion_id,
    (SELECT id FROM public.dream_team_equipos ORDER BY id LIMIT 1),
    p_nombre_edicion, v_cohorte_started_at, NULL
  )
  RETURNING id INTO v_cohorte_id;

  -- Record the taller under the season (PR45 junction) — the "elijo qué
  -- talleres abren" surface. Idempotent: opening a second edición for the
  -- same (temporada, taller) does not duplicate the membership row.
  IF p_temporada_id IS NOT NULL THEN
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (p_temporada_id, p_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', v_periodo_id,
    'cohorte_id', v_cohorte_id,
    'temporada_id', p_temporada_id,
    'estado', 'borrador'
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.open_edicion(
  uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.open_edicion(
  uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb, uuid
) TO authenticated;
