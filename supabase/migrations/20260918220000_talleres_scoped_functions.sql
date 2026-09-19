-- T3 (odd/tasks/talleres-autoridad-arbol.md) — SECURITY DEFINER functions
-- gate on the object's own node.
--
-- WHY
--   Every one of these functions checked the unscoped "does this persona
--   hold director.write/admin.manage ANYWHERE" before acting — RLS does
--   not protect what a SECURITY DEFINER function does internally (it
--   bypasses RLS by design), so this was the only gate. A director
--   scoped to one branch (e.g. Próximo Paso/DPS) could open an edición,
--   generate sessions, emit a certificate or create/link a taller
--   anywhere else (e.g. Conexión), and resolve any withdrawal request,
--   regardless of which branch the target object belongs to.
--
-- WHAT
--   create_taller_abstract: after resolving the link target (p_equipo_id)
--     or the new-mode parent (p_parent_equipo_id) and confirming it
--     exists, adds a scoped check against that equipo/parent's id before
--     any of the other structural validations. The original coarse
--     (unscoped) pre-check stays, unchanged, as a cheap early filter.
--   open_edicion (11-arg, current): after resolving the taller, adds a
--     scoped check against v_taller.dream_team_equipo_id.
--   generate_taller_sesiones: after resolving the grupo, adds a scoped
--     check against talleres_equipo_de_grupo(p_grupo_id).
--   emit_taller_certificado: after resolving the inscripción, adds a
--     scoped check against talleres_equipo_de_inscripcion(p_inscripcion_id).
--   talleres_resolver_solicitud_retiro: its director.write/admin.manage
--     branches become scoped against the already-resolved v_equipo
--     (coordinator.write was already scoped there).
--   Drops the three dead scope helpers (puede_editar_taller_grupo,
--   puede_gestionar_participantes_taller_grupo, puede_ver_taller_grupo —
--   confirmed no callers in app code, migrations, or other functions;
--   only referenced by lib/supabase/database.types.ts type stubs and by
--   supabase/tests/casas... no — by __tests__/lib/platform/talleres/
--   schema-migration-dry-run.test.ts, which only inspects the historical
--   migration FILE's text and is unaffected by dropping the live
--   functions) and the legacy 9-arg/10-arg open_edicion overloads (the
--   app only ever calls the 11-arg one, with named params including
--   p_temporada_id).
--
-- SAFETY
--   Every function keeps its signature, return shape and every other
--   behavior byte-identical — only the authorization gate changes shape
--   (unscoped -> scoped) or moves (coarse-then-none -> coarse-then-scoped).
--   A NULL equipo (e.g. a legacy taller with no dream_team_equipo_id)
--   fails closed: only a global (NULL-scope) grant reaches it, matching
--   auth_has_talleres_capability_scoped's existing NULL-argument
--   contract from 20260918180000. Dropped functions/overloads have zero
--   callers (verified via grep before writing this migration).
--
-- ROLLBACK
--   Re-apply each CREATE OR REPLACE FUNCTION below with the pre-
--   migration body (unscoped checks); re-create the three dropped
--   scope helpers and the two legacy open_edicion overloads from
--   supabase/migrations/20260808204221_talleres_helper_auth_has_capability.sql
--   and 20260918020000_pr35_fix_open_edicion_rename.sql (historical).

CREATE OR REPLACE FUNCTION public.create_taller_abstract(p_nombre text, p_descripcion text, p_modalidad_default text, p_slug text, p_equipo_id uuid, p_parent_equipo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id          uuid;
  v_cap_ok           boolean;
  v_taller           public.talleres%ROWTYPE;
  v_normalized       text;
  v_equipo           public.dream_team_equipos%ROWTYPE;
  v_parent           public.dream_team_equipos%ROWTYPE;
  v_target_equipo_id uuid;
  v_has_children      boolean;
  v_already_linked    boolean;
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

  IF p_nombre IS NULL OR length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_nombre)) > 200 THEN
    RAISE EXCEPTION 'NOMBRE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_descripcion IS NOT NULL AND length(p_descripcion) > 2000 THEN
    RAISE EXCEPTION 'DESCRIPCION_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_default NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_default USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    v_normalized := lower(regexp_replace(regexp_replace(trim(p_nombre), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
    v_normalized := trim(BOTH '-' FROM v_normalized);
    v_normalized := left(v_normalized, 80);
    IF length(v_normalized) < 2 THEN
      RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_normalized := trim(p_slug);
    IF v_normalized !~ '^[a-z0-9-]+$' OR length(v_normalized) < 2 OR length(v_normalized) > 80 THEN
      RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF (p_equipo_id IS NULL) = (p_parent_equipo_id IS NULL) THEN
    RAISE EXCEPTION 'MUST_CHOOSE_EXACTLY_ONE_MODE: se requiere exactamente uno de p_equipo_id (vincular) o p_parent_equipo_id (crear nuevo)'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_equipo_id IS NOT NULL THEN
    SELECT * INTO v_equipo FROM public.dream_team_equipos WHERE id = p_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EQUIPO_NOT_FOUND: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo.id)
            OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo.id)) THEN
      RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this equipo''s tree'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_equipo.activo THEN
      RAISE EXCEPTION 'EQUIPO_INACTIVE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.experiencia <> 'talleres_crecimiento' THEN
      RAISE EXCEPTION 'EQUIPO_WRONG_EXPERIENCE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.parent_equipo_id IS NULL THEN
      RAISE EXCEPTION 'EQUIPO_IS_ROOT: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.dream_team_equipos c WHERE c.parent_equipo_id = v_equipo.id
    ) INTO v_has_children;
    IF v_has_children THEN
      RAISE EXCEPTION 'EQUIPO_HAS_CHILDREN: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.talleres t
      WHERE t.dream_team_equipo_id = v_equipo.id AND t.slug <> v_normalized
    ) INTO v_already_linked;
    IF v_already_linked THEN
      RAISE EXCEPTION 'EQUIPO_ALREADY_LINKED: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    v_target_equipo_id := v_equipo.id;
  ELSE
    SELECT * INTO v_parent FROM public.dream_team_equipos WHERE id = p_parent_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_NOT_FOUND: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_parent.id)
            OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_parent.id)) THEN
      RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this equipo''s tree'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_parent.activo THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_INACTIVE: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.dream_team_equipos (experiencia, label, parent_equipo_id, activo)
    VALUES ('talleres_crecimiento', trim(p_nombre), v_parent.id, true)
    RETURNING id INTO v_target_equipo_id;
  END IF;

  INSERT INTO public.dream_team_roles (equipo_id, label)
  SELECT v_target_equipo_id, r.label
  FROM (VALUES ('director'), ('coordinador'), ('lider'), ('voluntario')) AS r(label)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_team_roles dr
    WHERE dr.equipo_id = v_target_equipo_id AND dr.label = r.label
  );

  INSERT INTO public.talleres (slug, nombre, descripcion, modalidad_default, estado, dream_team_equipo_id)
  VALUES (v_normalized, trim(p_nombre), NULLIF(trim(p_descripcion), ''), p_modalidad_default, 'active', v_target_equipo_id)
  ON CONFLICT (slug) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        dream_team_equipo_id = EXCLUDED.dream_team_equipo_id
  RETURNING * INTO v_taller;

  RETURN jsonb_build_object(
    'taller_id', v_taller.id,
    'slug', v_taller.slug,
    'nombre', v_taller.nombre,
    'modalidad_default', v_taller.modalidad_default,
    'estado', v_taller.estado
  );
END;
$function$;

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

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_taller.dream_team_equipo_id)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_taller.dream_team_equipo_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this taller''s tree'
      USING ERRCODE = '42501';
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

DROP FUNCTION IF EXISTS public.open_edicion(uuid, text, text, integer, integer, text, timestamp with time zone, timestamp with time zone, jsonb);
DROP FUNCTION IF EXISTS public.open_edicion(uuid, text, text, text, integer, integer, text, timestamp with time zone, timestamp with time zone, jsonb);

CREATE OR REPLACE FUNCTION public.generate_taller_sesiones(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_cap_ok    boolean;
  v_sesiones  integer;
  v_anchor    date;
  v_numero    integer;
  v_created   integer := 0;
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

  SELECT e.sesiones_snapshot,
         COALESCE(c.started_at::date, CURRENT_DATE)
    INTO v_sesiones, v_anchor
    FROM public.taller_grupos g
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
   WHERE g.id = p_grupo_id;

  IF v_sesiones IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo % has no resolvable edición/sesiones_snapshot', p_grupo_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(p_grupo_id))
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(p_grupo_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this grupo''s tree'
      USING ERRCODE = '42501';
  END IF;

  FOR v_numero IN 1..v_sesiones LOOP
    INSERT INTO public.taller_sesiones (
      grupo_id, numero, fecha_programada, estado
    ) VALUES (
      p_grupo_id, v_numero, v_anchor + ((v_numero - 1) * 7), 'programada'
    )
    ON CONFLICT (grupo_id, numero) DO NOTHING;

    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'grupo_id', p_grupo_id,
    'total', v_sesiones,
    'created', v_created
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_taller_certificado(p_inscripcion_id uuid, p_codigo_verificacion text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id            uuid;
  v_cap_ok             boolean;
  v_edicion_id         uuid;
  v_persona_id         uuid;
  v_unit_estado        text;
  v_taller_nombre      text;
  v_participante       text;
  v_firmantes_raw      jsonb;
  v_firmantes_snapshot jsonb;
  v_cert_id            uuid;
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

  IF p_codigo_verificacion IS NULL OR length(p_codigo_verificacion) <> 16 THEN
    RAISE EXCEPTION 'INVALID_CODIGO: expected a 16-char verification code'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.taller_id,
         i.persona_principal_id,
         i.unit_estado,
         t.nombre,
         btrim(concat_ws(' ', u.nombre, u.apellido)),
         e.firmantes
    INTO v_edicion_id,
         v_persona_id,
         v_unit_estado,
         v_taller_nombre,
         v_participante,
         v_firmantes_raw
    FROM public.taller_inscripciones i
    JOIN public.taller_ediciones e ON e.id = i.taller_id
    JOIN public.talleres t ON t.id = e.taller_id
    JOIN public.usuarios u ON u.id = i.persona_principal_id
   WHERE i.id = p_inscripcion_id;

  IF v_edicion_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: inscripción % has no resolvable edición/persona', p_inscripcion_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_inscripcion(p_inscripcion_id))
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_inscripcion(p_inscripcion_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this inscripción''s tree'
      USING ERRCODE = '42501';
  END IF;

  IF v_unit_estado IS DISTINCT FROM 'completado' THEN
    RAISE EXCEPTION 'INSCRIPCION_NOT_COMPLETED: unit_estado=%', v_unit_estado
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(sig ORDER BY ord), '[]'::jsonb)
    INTO v_firmantes_snapshot
    FROM (
      SELECT
        to_jsonb(
          CASE
            WHEN NULLIF(btrim(concat_ws(' ', su.nombre, su.apellido)), '') IS NOT NULL
                 AND COALESCE(f.rol_etiqueta, '') <> ''
              THEN btrim(concat_ws(' ', su.nombre, su.apellido)) || ' (' || f.rol_etiqueta || ')'
            WHEN NULLIF(btrim(concat_ws(' ', su.nombre, su.apellido)), '') IS NOT NULL
              THEN btrim(concat_ws(' ', su.nombre, su.apellido))
            ELSE COALESCE(NULLIF(f.rol_etiqueta, ''), 'Firmante')
          END
        ) AS sig,
        COALESCE(f.orden, 0) AS ord
      FROM jsonb_to_recordset(COALESCE(v_firmantes_raw, '[]'::jsonb))
             AS f(persona_id uuid, rol_etiqueta text, orden integer)
      LEFT JOIN public.usuarios su ON su.id = f.persona_id
    ) s;

  INSERT INTO public.taller_certificados (
    inscripcion_id,
    codigo_verificacion,
    taller_id,
    persona_id,
    nombre_taller_snapshot,
    nombre_participante_snapshot,
    firmantes_snapshot
  ) VALUES (
    p_inscripcion_id,
    p_codigo_verificacion,
    v_edicion_id,
    v_persona_id,
    v_taller_nombre,
    v_participante,
    v_firmantes_snapshot
  )
  ON CONFLICT (inscripcion_id) DO NOTHING
  RETURNING id INTO v_cert_id;

  IF v_cert_id IS NULL THEN
    SELECT c.id, c.codigo_verificacion
      INTO v_cert_id, p_codigo_verificacion
      FROM public.taller_certificados c
     WHERE c.inscripcion_id = p_inscripcion_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'certificado_id', v_cert_id,
      'codigo_verificacion', p_codigo_verificacion,
      'inscripcion_id', p_inscripcion_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'certificado_id', v_cert_id,
    'codigo_verificacion', p_codigo_verificacion,
    'inscripcion_id', p_inscripcion_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.talleres_resolver_solicitud_retiro(p_solicitud_id uuid, p_accion text, p_motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reviewer_id uuid;
  v_sol         public.taller_solicitudes_retiro;
  v_equipo      uuid;
BEGIN
  IF p_accion NOT IN ('aprobar','rechazar') THEN
    RAISE EXCEPTION 'accion_invalida' USING ERRCODE = '22023';
  END IF;

  -- Reviewer is ALWAYS the request's JWT subject — never a caller-supplied id.
  SELECT id INTO v_reviewer_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '42501';
  END IF;

  -- Only a pending solicitud is resolvable (guard ⇒ idempotent under retries).
  SELECT * INTO v_sol
  FROM public.taller_solicitudes_retiro
  WHERE id = p_solicitud_id AND estado = 'pendiente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_no_encontrada_o_procesada' USING ERRCODE = 'P0002';
  END IF;

  -- Team that owns the solicitud's target (inscripción → cohorte, or
  -- grupo_asignacion → grupo → cohorte). Gate: director/admin/coordinator
  -- all scoped in-tree to THIS equipo. Anything else is rejected.
  v_equipo := public.talleres_equipo_de_solicitud(v_sol.inscripcion_id, v_sol.grupo_asignacion_id);
  IF NOT (
        public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo)
     OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo)
     OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_solicitud' USING ERRCODE = '42501';
  END IF;

  IF p_accion = 'aprobar' THEN
    IF v_sol.tipo = 'participante_retiro' THEN
      IF v_sol.inscripcion_id IS NULL THEN
        RAISE EXCEPTION 'solicitud_participante_sin_inscripcion' USING ERRCODE = '22004';
      END IF;
      -- The unit (incl. matrimonio/novios — one row) moves to the terminal
      -- 'retirado' state. updated_at is bumped by the BEFORE UPDATE trigger.
      UPDATE public.taller_inscripciones
      SET estado = 'retirado', version = version + 1
      WHERE id = v_sol.inscripcion_id;

    ELSIF v_sol.tipo = 'equipo_retiro_definitivo' THEN
      IF v_sol.grupo_asignacion_id IS NULL THEN
        RAISE EXCEPTION 'solicitud_equipo_sin_asignacion' USING ERRCODE = '22004';
      END IF;
      UPDATE public.taller_grupo_asignaciones
      SET activo                  = false,
          ended_at                = now(),
          motivo_retiro           = COALESCE(NULLIF(btrim(p_motivo), ''), v_sol.motivo),
          approved_by_director_id = v_reviewer_id,
          version                 = version + 1
      WHERE id = v_sol.grupo_asignacion_id;

    ELSE
      RAISE EXCEPTION 'tipo_desconocido' USING ERRCODE = '22023';
    END IF;

    UPDATE public.taller_solicitudes_retiro
    SET estado = 'aprobada', version = version + 1
    WHERE id = p_solicitud_id;

  ELSE  -- 'rechazar' — close the request only, preserve history (no delete).
    UPDATE public.taller_solicitudes_retiro
    SET estado = 'rechazada', version = version + 1
    WHERE id = p_solicitud_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'accion',        p_accion,
    'solicitud_id',  p_solicitud_id,
    'tipo',          v_sol.tipo,
    'equipo',        v_equipo
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.puede_editar_taller_grupo(uuid);
DROP FUNCTION IF EXISTS public.puede_gestionar_participantes_taller_grupo(uuid);
DROP FUNCTION IF EXISTS public.puede_ver_taller_grupo(uuid);
