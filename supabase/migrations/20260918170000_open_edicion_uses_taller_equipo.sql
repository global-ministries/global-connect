-- ════════════════════════════════════════════════════════════════════
-- T4 — open_edicion uses the taller's equipo; it never mints one.
--
-- WHY: every open_edicion overload resolved its cohorte's equipo on
-- its own — the 11-arg one (the only one PostgREST ever resolves; see
-- 20260821000002_cimiento2_talleres_equipo_por_taller.sql, "the typed
-- app client always sends p_temporada_id") walked cohortes and, if
-- none existed yet, minted a fresh, parentless, role-less equipo; the
-- legacy 9-arg and 10-arg overloads — unreachable from the app, but
-- still live and EXECUTE-granted to authenticated — grabbed whatever
-- `dream_team_equipos` row happened to sort first. T3 made every new
-- taller's equipo a deliberate, up-front choice
-- (`talleres.dream_team_equipo_id`); this migration makes
-- `open_edicion` read that choice instead of inventing one, closing
-- the orphan-minting path for good (see
-- odd/tasks/talleres-equipo-en-organigrama.md, "Problema y porqué").
--
-- WHAT: CREATE OR REPLACE all 3 overloads, touching ONLY the
-- equipo-resolution step in each — everything else (validation order,
-- messages, INSERT columns, the rest of the control flow) is
-- unchanged from the current live bodies (read via `pg_get_functiondef`
-- against staging before writing this migration; the full diff is in
-- this change's final report, not repeated here).
--
--   - 11-arg (live path): replaces the "look up via cohortes, mint if
--     none" block with `v_equipo_id := v_taller.dream_team_equipo_id`
--     (v_taller was already fetched by the existing `SELECT * INTO
--     v_taller FROM public.talleres WHERE id = p_taller_id …` above —
--     no new query). RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %' with
--     ERRCODE 'P0002' (this schema's established "not found / not
--     eligible" category — see 20260918160000's header) when it's
--     null, instead of minting.
--   - 9-arg / 10-arg (dead paths — PostgREST can't reach them, but a
--     direct RPC call with the right capability still can): the same
--     `v_taller.dream_team_equipo_id` + null-check replaces their
--     inline `(SELECT id FROM public.dream_team_equipos ORDER BY id
--     LIMIT 1)` subquery. A new `v_equipo_id uuid` local is added to
--     each — unavoidable, since the old code never needed one (the
--     subquery was inline in the INSERT). Their pre-existing, separate
--     bug — the final cohortes INSERT uses `p_taller_id` where the
--     `talleres_crecimiento_cohortes.taller_id` FK requires a
--     `taller_ediciones.id` (it should be `v_edicion_id`, matching the
--     11-arg body) — is untouched: it predates this change, is out of
--     this migration's scope ("changing ONLY the equipo-resolution
--     block"), and confirmed unreachable from the app today.
--
-- SAFETY: additive/behavioral-only, no DDL. The 11-arg body can now
-- raise where it used to silently mint — by design (T4's whole point).
-- No caller in this repo passes an equipo/team field to open_edicion
-- (verified: neither open-edicion-form.tsx nor its actions.ts ever
-- did), so there is nothing to remove from the app for this migration
-- specifically; the action's error mapping gains one new friendly
-- message for TALLER_MISSING_EQUIPO.
--
-- ROLLBACK: re-run 20260821000002_cimiento2_talleres_equipo_por_taller
-- .sql's CREATE OR REPLACE for the 11-arg overload; the 9-arg/10-arg
-- overloads' pre-T4 bodies are archived in this migration's git
-- history (see the DOWN reference below) since no earlier migration
-- captured them standalone.
-- ════════════════════════════════════════════════════════════════════

-- ── 11-arg (live path) ──────────────────────────────────────────────
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

  -- T4 — the taller's equipo is chosen once, at creation time (T3);
  -- open_edicion only ever reads it, never mints or reassigns one.
  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
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

-- ── 9-arg (legacy, unreachable from the app) ────────────────────────
CREATE OR REPLACE FUNCTION public.open_edicion(
  p_taller_id uuid,
  p_nombre_edicion text,
  p_link_type text,
  p_sesiones_estimadas integer,
  p_duracion_estimada_minutos integer,
  p_modalidad_inscripcion text,
  p_fecha_inicio_periodo timestamp with time zone,
  p_fecha_fin_periodo timestamp with time zone,
  p_firmantes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_cap_ok boolean;
  v_taller public.talleres%ROWTYPE;
  v_edicion_id uuid;
  v_event_id uuid;
  v_periodo_id uuid;
  v_cohorte_id uuid;
  v_cohorte_started_at timestamptz;
  v_equipo_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write') OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_taller FROM public.talleres WHERE id = p_taller_id AND estado = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002'; END IF;
  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_sesiones_estimadas <= 0 THEN RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023'; END IF;
  IF p_duracion_estimada_minutos <= 0 THEN RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023'; END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion USING ERRCODE = '22023'; END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023'; END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023'; END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN p_firmantes := '[]'::jsonb; END IF;
  INSERT INTO public.operating_core_events (kind, estado, title, start_date, visibility_scope, metadata)
  VALUES ('workshop', 'active', p_nombre_edicion, to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'), 'talleres_crecimiento', jsonb_build_object('taller_tipo', v_taller.modalidad_default, 'taller_edicion', p_nombre_edicion, 'taller_link_type', p_link_type, 'modalidad_inscripcion', p_modalidad_inscripcion, 'taller_id', p_taller_id, 'created_via', 'admin_pr23_2a')) RETURNING id INTO v_event_id;
  INSERT INTO public.taller_ediciones (operating_core_event_id, tipo, link_type, modalidad_inscripcion, recurrence_rule, periodo_general_id, estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot, firmantes, taller_id)
  VALUES (v_event_id, v_taller.modalidad_default, p_link_type, p_modalidad_inscripcion, NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas, p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id) RETURNING id INTO v_edicion_id;
  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (taller_id, edicion_label, fecha_apertura_automatica, fecha_cierre_automatico) VALUES (v_edicion_id, p_nombre_edicion, p_fecha_inicio_periodo, p_fecha_fin_periodo) RETURNING id INTO v_periodo_id;
    UPDATE public.taller_ediciones SET periodo_general_id = v_periodo_id WHERE id = v_edicion_id;
    v_cohorte_started_at := p_fecha_inicio_periodo;
  ELSE
    v_cohorte_started_at := NULL;
  END IF;
  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.talleres_crecimiento_cohortes (taller_id, dream_team_equipo_id, edicion, started_at, ended_at) VALUES (p_taller_id, v_equipo_id, p_nombre_edicion, v_cohorte_started_at, NULL) RETURNING id INTO v_cohorte_id;
  RETURN jsonb_build_object('taller_id', p_taller_id, 'edicion_id', v_edicion_id, 'event_id', v_event_id, 'periodo_id', v_periodo_id, 'cohorte_id', v_cohorte_id, 'estado', 'borrador');
END;
$function$;

-- ── 10-arg (legacy, unreachable from the app) ───────────────────────
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
  p_firmantes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_cap_ok boolean;
  v_taller public.talleres%ROWTYPE;
  v_edicion_id uuid;
  v_event_id uuid;
  v_periodo_id uuid;
  v_cohorte_id uuid;
  v_cohorte_started_at timestamptz;
  v_equipo_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write') OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_taller FROM public.talleres WHERE id = p_taller_id AND estado = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002'; END IF;
  IF p_tipo NOT IN ('individual', 'pareja') THEN RAISE EXCEPTION 'INVALID_TIPO: %', p_tipo USING ERRCODE = '22023'; END IF;
  IF p_nombre_edicion IS NULL OR length(trim(p_nombre_edicion)) < 1 THEN RAISE EXCEPTION 'NOMBRE_EDICION_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_sesiones_estimadas <= 0 THEN RAISE EXCEPTION 'SESIONES_MUST_BE_POSITIVE' USING ERRCODE = '22023'; END IF;
  IF p_duracion_estimada_minutos <= 0 THEN RAISE EXCEPTION 'DURACION_MUST_BE_POSITIVE' USING ERRCODE = '22023'; END IF;
  IF p_modalidad_inscripcion NOT IN ('periodo_general', 'permanente_custom') THEN RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_inscripcion USING ERRCODE = '22023'; END IF;
  IF p_link_type IS NOT NULL AND p_link_type NOT IN ('matrimonio', 'novios') THEN RAISE EXCEPTION 'INVALID_LINK_TYPE: %', p_link_type USING ERRCODE = '22023'; END IF;
  IF p_tipo = 'individual' AND p_link_type IS NOT NULL THEN RAISE EXCEPTION 'LINK_TYPE_NOT_ALLOWED_FOR_INDIVIDUAL' USING ERRCODE = '22023'; END IF;
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023'; END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN p_firmantes := '[]'::jsonb; END IF;
  INSERT INTO public.operating_core_events (kind, estado, title, start_date, visibility_scope, metadata)
  VALUES ('workshop', 'active', p_nombre_edicion, to_char(p_fecha_inicio_periodo, 'YYYY-MM-DD'), 'talleres_crecimiento', jsonb_build_object('taller_tipo', p_tipo, 'taller_edicion', p_nombre_edicion, 'taller_link_type', p_link_type, 'modalidad_inscripcion', p_modalidad_inscripcion, 'taller_id', p_taller_id, 'created_via', 'admin_pr23_2a')) RETURNING id INTO v_event_id;
  INSERT INTO public.taller_ediciones (operating_core_event_id, tipo, link_type, modalidad_inscripcion, recurrence_rule, periodo_general_id, estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot, firmantes, taller_id)
  VALUES (v_event_id, p_tipo, p_link_type, p_modalidad_inscripcion, NULL, NULL, 'borrador', p_nombre_edicion, p_sesiones_estimadas, p_duracion_estimada_minutos, p_modalidad_inscripcion, p_firmantes, p_taller_id) RETURNING id INTO v_edicion_id;
  IF p_modalidad_inscripcion = 'periodo_general' THEN
    INSERT INTO public.taller_periodos_generales (taller_id, edicion_label, fecha_apertura_automatica, fecha_cierre_automatico) VALUES (v_edicion_id, p_nombre_edicion, p_fecha_inicio_periodo, p_fecha_fin_periodo) RETURNING id INTO v_periodo_id;
    UPDATE public.taller_ediciones SET periodo_general_id = v_periodo_id WHERE id = v_edicion_id;
    v_cohorte_started_at := p_fecha_inicio_periodo;
  ELSE
    v_cohorte_started_at := NULL;
  END IF;
  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.talleres_crecimiento_cohortes (taller_id, dream_team_equipo_id, edicion, started_at, ended_at) VALUES (p_taller_id, v_equipo_id, p_nombre_edicion, v_cohorte_started_at, NULL) RETURNING id INTO v_cohorte_id;
  RETURN jsonb_build_object('taller_id', p_taller_id, 'edicion_id', v_edicion_id, 'event_id', v_event_id, 'periodo_id', v_periodo_id, 'cohorte_id', v_cohorte_id, 'estado', 'borrador');
END;
$function$;
