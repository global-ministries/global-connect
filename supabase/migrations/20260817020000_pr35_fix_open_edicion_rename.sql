-- ════════════════════════════════════════════════════════════════════
-- PR35 — Fix open_edicion RPC body after PR23.2b table rename.
--
-- PR23.2b renamed `talleres_crecimiento_metadata` → `taller_ediciones`
-- on prod (applied directly via ALTER TABLE … RENAME TO, not captured
-- in a migration file). The `open_edicion` RPC body was NOT updated
-- alongside that rename.
--
-- Result: every call to `open_edicion` (9-arg overload) fails with
--   "relation 'public.talleres_crecimiento_metadata' does not exist"
-- The admin flow "abrir edicion" (open-edicion-form.tsx) is blocked.
--
-- Diagnosis (verified via pg_proc on prod):
--   - 9-arg overload  (taller_id, nombre_edicion, link_type, …)
--       body: INSERT INTO public.talleres_crecimiento_metadata  ← BROKEN
--   - 10-arg overload (taller_id, tipo, nombre_edicion, …)
--       body: INSERT INTO public.taller_ediciones               ← already correct
--       (was fixed in the hotfix migration 20260813000003)
--
-- This migration fixes both overloads in place via
-- CREATE OR REPLACE FUNCTION. Only the body changes
-- (talleres_crecimiento_metadata → taller_ediciones); signatures
-- and the rest of the logic stay byte-identical.
--
-- The 10-arg is re-applied for safety (idempotent, locks in the
-- expected state) — at the time of writing it already references
-- taller_ediciones, but a no-op rewrite defends against future drift.
--
-- The 9-arg overload is the legacy signature (no p_tipo). It's kept
-- for back-compat with any caller still using it. The tipo column is
-- populated from v_taller.modalidad_default (same as the original
-- PR23.2a behavior — pre-PR23.2a.1, before the tipo parameter was
-- added).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) open_edicion 9-arg overload (legacy, no p_tipo)              ║
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

  -- 3. Validate inputs (preserved from PR23.2a / hotfix):
  -- NOTE: 9-arg overload has no p_tipo, so the tipo column is
  -- populated from v_taller.modalidad_default below (consistent
  -- with the original PR23.2a behavior, pre-PR23.2a.1).
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
  -- Preserve IS NOT NULL guard (regression-safety: when modalidad =
  -- permanente_custom, fecha_fin_periodo is logically NULL and the
  -- comparison is skipped — same behavior as the original PR23.2a).
  IF p_fecha_fin_periodo IS NOT NULL AND p_fecha_fin_periodo <= p_fecha_inicio_periodo THEN
    RAISE EXCEPTION 'FECHA_FIN_BEFORE_INICIO' USING ERRCODE = '22023';
  END IF;
  IF p_firmantes IS NULL OR jsonb_typeof(p_firmantes) <> 'array' THEN
    p_firmantes := '[]'::jsonb;
  END IF;

  -- 4. Create operating_core_events (kind='workshop')
  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop',
    'active',
    p_nombre_edicion,
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

  -- 5. Create taller_ediciones row (this is the "edicion")
  -- PR35: was `talleres_crecimiento_metadata` (pre-PR23.2b name).
  INSERT INTO public.taller_ediciones (
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
    firmantes,
    taller_id
  ) VALUES (
    v_event_id,
    v_taller.modalidad_default,
    p_link_type,
    p_modalidad_inscripcion,
    NULL,
    NULL,
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

    -- PR35: was `talleres_crecimiento_metadata` (pre-PR23.2b name).
    UPDATE public.taller_ediciones
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;
  END IF;

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

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) open_edicion 10-arg overload (with p_tipo)                   ║
-- ║    Idempotent recreate — body already references taller_ediciones║
-- ║    (was fixed in hotfix 20260813000003). Re-applying locks in    ║
-- ║    the expected state and defends against future drift.         ║
-- ╚══════════════════════════════════════════════════════════════════╝

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

  -- tipo validation
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
    'workshop',
    'active',
    p_nombre_edicion,
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
    firmantes,
    taller_id
  ) VALUES (
    v_event_id,
    p_tipo,
    p_link_type,
    p_modalidad_inscripcion,
    NULL,
    NULL,
    'borrador',
    p_nombre_edicion,
    p_sesiones_estimadas,
    p_duracion_estimada_minutos,
    p_modalidad_inscripcion,
    p_firmantes,
    p_taller_id
  )
  RETURNING id INTO v_edicion_id;

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

    UPDATE public.taller_ediciones
    SET periodo_general_id = v_periodo_id
    WHERE id = v_edicion_id;
  END IF;

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
  uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_edicion(
  uuid, text, text, text, int, int, text, timestamptz, timestamptz, jsonb
) TO authenticated;
