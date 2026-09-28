-- T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — reprogram an
-- already-instantiated edición: extend its inscription window only, or move
-- its first clase (shifting every not-yet-closed sesión by the same delta
-- and recomputing fecha_fin/cierre_inscripcion), with an audit trail of who
-- did it and why. Decided with the user on 2026-09-28: la temporada no
-- cambia — this never touches taller_ediciones.temporada_id.
--
-- Verified against STAGING before writing this file:
--   * information_schema.columns for taller_ediciones (fecha_inicio/
--     fecha_fin/cierre_inscripcion are `date`, temporada_id untouched by
--     this feature).
--   * pg_get_functiondef(talleres_editar_clase) — the exact CLASE_CERRADA
--     refusal shape (P0001) this file's own EDICION_YA_EMPEZO mirrors.
--   * pg_get_functiondef(talleres_crear_edicion) / talleres_equipo_de_edicion
--     — the exact director.write|admin.manage-scoped authority shape reused
--     here, and sin_permisos_para_esta_edicion (already mapped in
--     lib/platform/talleres/errores-api.ts, unused until now) as the 42501
--     message.
--   * pg_trigger for taller_sesiones — trg_taller_sesiones_validate_update
--     only blocks a fecha_programada change when a LATER sesión already
--     carries a meeting_time_override with applies_to='this_and_subsequent'
--     (20260811100000_talleres_tables_sesiones_asistencia.sql); it does not
--     re-check numero sequencing on UPDATE (only trg_taller_sesiones_
--     validate_insert does, on INSERT), so the bulk fecha_programada shift
--     below never trips it for a plain reprogramación with no overrides.
--   * pg_get_expr() of taller_ediciones_select (20260928100000, part E) —
--     copied verbatim into talleres_reprogramacion_persona's own predicate,
--     same "no raw usuarios embed" pattern as talleres_inscripciones_
--     sobre_cupo_personas (20260928130000, part F).
--
-- WHAT
--   1. taller_ediciones gains reprogramada_por/reprogramada_en/
--      reprogramacion_motivo (audit of the LAST reprogramación only, not a
--      history table — no requirement for more than "last change" exists).
--   2. talleres_reprogramar_edicion(p_edicion_id, p_fecha_inicio DEFAULT
--      NULL, p_cierre_inscripcion DEFAULT NULL, p_motivo DEFAULT NULL) —
--      SECURITY DEFINER, authority mirrors talleres_crear_edicion's own
--      (director.write|admin.manage scoped to talleres_equipo_de_edicion),
--      refuses a cancelado/cerrado (effective) edición, refuses when both
--      date params are NULL, and branches:
--        - extend only (p_fecha_inicio NULL): cierre_inscripcion :=
--          p_cierre_inscripcion, checked <= fecha_fin. Clases untouched.
--        - move start (p_fecha_inicio given): delta = p_fecha_inicio -
--          fecha_inicio. Refuses P0001 EDICION_YA_EMPEZO when the edición's
--          own primera clase (numero = 1, any grupo) is already 'cerrada'
--          — an edición that has already started its first clase cannot
--          have that clase's date silently rewritten out from under
--          whoever attended it. Otherwise shifts every taller_sesiones row
--          of this edición whose estado is NOT IN ('cerrada','cancelada')
--          AND whose fecha_programada >= the OLD fecha_inicio by that same
--          delta (a cancelada/cerrada sesión, or one somehow scheduled
--          before the edición's own start, is left exactly where it was);
--          fecha_fin and (unless p_cierre_inscripcion overrides it)
--          cierre_inscripcion move by the same delta, preserving the
--          taller's original offsets; the edición's cohorte (if any) gets
--          its started_at moved to match. clases_movidas is the shifted
--          row count (GET DIAGNOSTICS), always 0 on the extend-only path.
--      Either way, the (possibly overridden) cierre_inscripcion must stay
--      <= the (possibly shifted) fecha_fin (P0001 CIERRE_POSTERIOR_AL_FIN).
--      Always sets reprogramada_por (the caller's own usuarios.id, resolved
--      the same way talleres_inscribir_sobre_cupo resolves its own caller),
--      reprogramada_en = now(), reprogramacion_motivo = p_motivo (blank/
--      whitespace-only collapses to NULL, same NULLIF(btrim(...), '')
--      convention talleres_editar_grupo/talleres_editar_clase already use),
--      then calls talleres_refrescar_estados(taller_id) so the stored
--      estado is never stale after a date change, and returns
--      {edicion_id, fecha_inicio, fecha_fin, cierre_inscripcion, estado,
--      clases_movidas}.
--   3. talleres_reprogramacion_persona(p_edicion_id) — resolves the last
--      reprogramación's actor name + timestamp + motivo for the Ventana
--      audit line, re-applying taller_ediciones_select's own predicate
--      (fail-closed) instead of a raw usuarios embed — same reasoning as
--      talleres_inscripciones_sobre_cupo_personas.
--
-- SAFETY
--   Additive only: three new NULLable columns, two new functions. No table,
--   column, policy, trigger, or grant is dropped or altered. Both new
--   functions are REVOKEd from PUBLIC/anon and GRANTed to authenticated
--   only (plus postgres/service_role). taller_ediciones.temporada_id is
--   never written here (decided: la temporada no cambia). No DELETE/
--   TRUNCATE/DROP TABLE. Grupos de Vida (grupos, grupo_miembros,
--   segmento_lideres, roles_sistema, usuario_roles, temporadas) is not
--   referenced anywhere in this file.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.talleres_reprogramacion_persona(uuid);
--   DROP FUNCTION IF EXISTS public.talleres_reprogramar_edicion(uuid, date, date, text);
--   ALTER TABLE public.taller_ediciones
--     DROP COLUMN reprogramada_por, DROP COLUMN reprogramada_en, DROP COLUMN reprogramacion_motivo;

-- ===========================================================================
-- A. taller_ediciones: audit columns, additive
-- ===========================================================================

ALTER TABLE public.taller_ediciones
  ADD COLUMN reprogramada_por uuid NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  ADD COLUMN reprogramada_en timestamptz NULL,
  ADD COLUMN reprogramacion_motivo text NULL;

COMMENT ON COLUMN public.taller_ediciones.reprogramada_por IS
  'T7b (talleres-temporadas-y-ediciones, paso 6) - who last called talleres_reprogramar_edicion on this edicion (usuarios.id). NULL until the first reprogramacion; only the LAST one is kept, not a history.';
COMMENT ON COLUMN public.taller_ediciones.reprogramada_en IS
  'When the last talleres_reprogramar_edicion call landed (now() inside the RPC). NULL until the first reprogramacion.';
COMMENT ON COLUMN public.taller_ediciones.reprogramacion_motivo IS
  'Free-text reason given for the last reprogramacion (p_motivo, blank/whitespace collapses to NULL). NULL until the first reprogramacion, or when none was given.';

-- ===========================================================================
-- B. talleres_reprogramar_edicion(): extend the cierre, or move the inicio
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_reprogramar_edicion(
  p_edicion_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_cierre_inscripcion date DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edicion            public.taller_ediciones%ROWTYPE;
  v_equipo_id           uuid;
  v_persona_id           uuid;
  v_delta                 integer;
  v_fecha_inicio_final      date;
  v_fecha_fin_final          date;
  v_cierre_final               date;
  v_clases_movidas               integer := 0;
  v_estado_final                   text;
BEGIN
  -- Not found and no-permission both collapse to the same 42501 below (the
  -- edicion id is server-generated and never user-typed on the page this
  -- RPC serves — see the Ventana button — so there is no legitimate case
  -- for revealing "exists but you can't touch it" vs "doesn't exist" here).
  SELECT * INTO v_edicion
  FROM public.taller_ediciones
  WHERE id = p_edicion_id;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  IF NOT FOUND OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) IN ('cancelado', 'cerrado') THEN
    RAISE EXCEPTION 'EDICION_NO_REPROGRAMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_inicio IS NULL AND p_cierre_inscripcion IS NULL THEN
    RAISE EXCEPTION 'NADA_QUE_CAMBIAR' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_inicio IS NULL THEN
    -- Extend only: cierre_inscripcion moves, fecha_inicio/fecha_fin and
    -- every clase stay exactly where they are.
    v_fecha_inicio_final := v_edicion.fecha_inicio;
    v_fecha_fin_final := v_edicion.fecha_fin;
    v_cierre_final := p_cierre_inscripcion;
  ELSE
    -- Move start: every not-yet-closed clase shifts by the same delta.
    v_delta := p_fecha_inicio - v_edicion.fecha_inicio;

    IF EXISTS (
      SELECT 1
        FROM public.taller_sesiones s
        JOIN public.taller_grupos g ON g.id = s.grupo_id
        JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
       WHERE c.taller_id = p_edicion_id
         AND s.numero = 1
         AND s.estado = 'cerrada'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EMPEZO' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.taller_sesiones s
       SET fecha_programada = s.fecha_programada + v_delta
      FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
     WHERE s.grupo_id = g.id
       AND g.cohorte_id = c.id
       AND c.taller_id = p_edicion_id
       AND s.estado NOT IN ('cerrada', 'cancelada')
       AND s.fecha_programada >= v_edicion.fecha_inicio;

    GET DIAGNOSTICS v_clases_movidas = ROW_COUNT;

    v_fecha_inicio_final := p_fecha_inicio;
    v_fecha_fin_final := v_edicion.fecha_fin + v_delta;
    v_cierre_final := COALESCE(p_cierre_inscripcion, v_edicion.cierre_inscripcion + v_delta);

    -- The edicion's own cohorte (talleres_crecimiento_cohortes.taller_id is
    -- the EDICION id, not the abstract taller's — same naming quirk
    -- talleres_instanciar_edicion's own header documents) moves with it,
    -- when one exists (a legacy/no-cohorte edicion just skips this).
    UPDATE public.talleres_crecimiento_cohortes
       SET started_at = v_fecha_inicio_final::timestamptz
     WHERE taller_id = p_edicion_id;
  END IF;

  IF v_cierre_final > v_fecha_fin_final THEN
    RAISE EXCEPTION 'CIERRE_POSTERIOR_AL_FIN' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_persona_id FROM public.usuarios WHERE auth_id = auth.uid();

  UPDATE public.taller_ediciones
     SET fecha_inicio = v_fecha_inicio_final,
         fecha_fin = v_fecha_fin_final,
         cierre_inscripcion = v_cierre_final,
         reprogramada_por = v_persona_id,
         reprogramada_en = now(),
         reprogramacion_motivo = NULLIF(btrim(p_motivo), '')
   WHERE id = p_edicion_id;

  PERFORM public.talleres_refrescar_estados(v_edicion.taller_id);

  SELECT public.talleres_estado_efectivo(te) INTO v_estado_final
    FROM public.taller_ediciones te
   WHERE te.id = p_edicion_id;

  RETURN jsonb_build_object(
    'edicion_id', p_edicion_id,
    'fecha_inicio', v_fecha_inicio_final,
    'fecha_fin', v_fecha_fin_final,
    'cierre_inscripcion', v_cierre_final,
    'estado', v_estado_final,
    'clases_movidas', v_clases_movidas
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) IS
  'T7b (talleres-temporadas-y-ediciones, paso 6) - extends an edicion''s cierre_inscripcion only (p_fecha_inicio NULL), or moves its fecha_inicio (shifting every taller_sesiones row not cerrada/cancelada by the same delta, recomputing fecha_fin/cierre_inscripcion). Refuses a cancelado/cerrado (effective) edicion, both params NULL, a cierre past fecha_fin, or moving a start whose primera clase is already cerrada. La temporada (temporada_id) never changes here. Authority mirrors talleres_crear_edicion (director.write|admin.manage scoped to the edicion''s own node).';

REVOKE ALL ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) TO authenticated, postgres, service_role;

-- ===========================================================================
-- C. talleres_reprogramacion_persona(): the Ventana audit line's name,
--    without a raw usuarios embed
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_reprogramacion_persona(p_edicion_id uuid)
RETURNS TABLE (
  reprogramada_por_nombre text,
  reprogramada_por_apellido text,
  reprogramada_en timestamptz,
  reprogramacion_motivo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    u.nombre               AS reprogramada_por_nombre,
    u.apellido              AS reprogramada_por_apellido,
    te.reprogramada_en       AS reprogramada_en,
    te.reprogramacion_motivo  AS reprogramacion_motivo
  FROM public.taller_ediciones te
  LEFT JOIN public.usuarios u ON u.id = te.reprogramada_por
  WHERE te.id = p_edicion_id
    AND te.reprogramada_por IS NOT NULL
    -- Mirror of the live taller_ediciones_select (verbatim terms,
    -- fail-closed), same pattern as talleres_inscripciones_sobre_cupo_
    -- personas (20260928130000_talleres_cupo.sql, part F).
    AND (
      public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, public.talleres_equipo_de_edicion(te.id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, public.talleres_equipo_de_edicion(te.id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, public.talleres_equipo_de_edicion(te.id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, public.talleres_equipo_de_edicion(te.id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, public.talleres_equipo_de_edicion(te.id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, public.talleres_equipo_de_edicion(te.id))
      OR (
        (auth.uid() IS NOT NULL)
        AND (public.talleres_estado_efectivo(te) = ANY (ARRAY['abierto'::text, 'en_curso'::text]))
      )
    );
$function$;

COMMENT ON FUNCTION public.talleres_reprogramacion_persona(uuid) IS
  'T7b (talleres-temporadas-y-ediciones, paso 6) - resolves the last reprogramacion''s actor name/timestamp/motivo for the Ventana audit line, re-applying taller_ediciones_select (fail-closed) instead of a raw usuarios embed. Empty result when the edicion was never reprogramada or the caller cannot see it.';

REVOKE ALL ON FUNCTION public.talleres_reprogramacion_persona(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_reprogramacion_persona(uuid) TO authenticated, postgres, service_role;
