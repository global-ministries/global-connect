-- CIMIENTO 2 — One dream_team equipo per ABSTRACT taller.
--
-- WHAT
--   1. open_edicion (11-arg / PR46 overload — the ONLY one the app calls):
--      replace the cohorte's equipo resolution
--        (SELECT id FROM dream_team_equipos ORDER BY id LIMIT 1)   -- BUG
--      with resolve-or-mint scoped to the abstract taller. Every cohorte of a
--      given taller now shares that taller's own equipo instead of all cohortes
--      collapsing onto whichever equipo happened to sort first.
--   2. One-time data backfill: the "De Hombre a Hombre" cohorte was created by
--      the buggy path pointing at Matrimonio's equipo. Mint its own equipo and
--      repoint ONLY that cohorte.
--
-- SAFETY
--   * Additive / forward-only: CREATE OR REPLACE + guarded DO block. No DROP,
--     no DELETE, no destructive change. Zero user-data loss.
--   * Idempotent: re-running mints nothing new and repoints nothing (guards).
--   * The legacy 9-arg and 10-arg open_edicion overloads still carry the old
--     LIMIT-1 behavior. They are intentionally left untouched: the typed app
--     client always sends p_temporada_id, so PostgREST resolves the 11-arg
--     overload exclusively (see app/(auth)/admin/talleres/abstracto/[slug]/
--     actions.ts). Touching unreachable overloads would add prod surface with
--     no app benefit.

CREATE OR REPLACE FUNCTION public.open_edicion(
  p_taller_id uuid,
  p_tipo text,
  p_nombre_edicion text,
  p_link_type text,
  p_sesiones_estimadas integer,
  p_duracion_estimada_minutos integer,
  p_modalidad_inscripcion text,
  p_fecha_inicio_periodo timestamp with time zone,
  p_fecha_fin_periodo timestamp with time zone,
  p_firmantes jsonb,
  p_temporada_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_taller       public.talleres%ROWTYPE;
  v_edicion_id   uuid;
  v_event_id     uuid;
  v_periodo_id   uuid;
  v_cohorte_id   uuid;
  v_cohorte_started_at timestamptz;
  v_equipo_id    uuid;
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

  -- CIMIENTO 2 — resolve-or-mint the equipo for THIS abstract taller.
  -- Look up an equipo already used by any cohorte of this taller's ediciones;
  -- if none exists yet, mint a fresh equipo labeled after the taller. This
  -- replaces the previous `(SELECT id FROM dream_team_equipos ORDER BY id
  -- LIMIT 1)`, which forced every cohorte of every taller onto one equipo.
  SELECT c.dream_team_equipo_id
    INTO v_equipo_id
  FROM public.talleres_crecimiento_cohortes c
  JOIN public.taller_ediciones te ON te.id = c.taller_id
  WHERE te.taller_id = p_taller_id
    AND c.dream_team_equipo_id IS NOT NULL
  ORDER BY c.id
  LIMIT 1;

  IF v_equipo_id IS NULL THEN
    INSERT INTO public.dream_team_equipos (experiencia, label, activo)
    VALUES ('talleres_crecimiento', 'Equipo ' || v_taller.nombre, true)
    RETURNING id INTO v_equipo_id;
  END IF;

  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    v_edicion_id,
    v_equipo_id,
    p_nombre_edicion, v_cohorte_started_at, NULL
  )
  RETURNING id INTO v_cohorte_id;

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
$function$;

-- One-time backfill: give "De Hombre a Hombre" its own equipo and repoint ONLY
-- its cohorte (created by the old LIMIT-1 path onto Matrimonio's equipo). The
-- 4 "Matrimonio sobre la Roca" cohortes stay on 66ce6509 (label already correct).
-- Guarded on the exact mispointed state, so re-running is a no-op (no dup equipo).
DO $backfill$
DECLARE
  v_cohorte_dhah  constant uuid := '1107fd9d-6c15-4b20-8e28-5e0680989e36';
  v_shared_equipo constant uuid := '66ce6509-25de-44f6-a152-55ee0084e6cd';
  v_new_equipo    uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.talleres_crecimiento_cohortes
    WHERE id = v_cohorte_dhah
      AND dream_team_equipo_id = v_shared_equipo
  ) THEN
    INSERT INTO public.dream_team_equipos (experiencia, label, activo)
    VALUES ('talleres_crecimiento', 'Equipo De Hombre a Hombre', true)
    RETURNING id INTO v_new_equipo;

    UPDATE public.talleres_crecimiento_cohortes
    SET dream_team_equipo_id = v_new_equipo
    WHERE id = v_cohorte_dhah
      AND dream_team_equipo_id = v_shared_equipo;
  END IF;
END;
$backfill$;
