-- T1 (odd/tasks/talleres-inscripcion-a-grupo.md) — assign/unassign
-- inscripciones to a grupo, in batch.
--
-- WHY
--   T1's migration 1 added `taller_inscripciones.grupo_id`, guarded by a
--   coherence trigger. Writing it still needs one authorized, batch-safe
--   entry point: the coordinator selects several aprobado inscripciones
--   from the Inscritos screen and assigns them to a grupo in one action
--   (T3), and the same action (with p_grupo_id = NULL) removes them.
--
-- WHAT
--   `talleres_asignar_inscripciones_a_grupo(p_inscripcion_ids uuid[],
--   p_grupo_id uuid) RETURNS jsonb`, SECURITY DEFINER (SET search_path =
--   public), VOLATILE.
--
--   Authority — same pattern as talleres_resolver_solicitud_retiro (paso
--   3): resolve the acting persona from auth.uid(), then gate on the org
--   node with auth_has_talleres_capability_scoped for coordinator.write /
--   director.write / admin.manage, and raise with ERRCODE 42501 on
--   failure, exactly like that function's 'sin_permisos_para_esta_
--   solicitud'. Assigning (p_grupo_id IS NOT NULL) gates on the TARGET
--   grupo's node (talleres_equipo_de_grupo(p_grupo_id)) — one call, one
--   grupo, one gate. Unassigning (p_grupo_id IS NULL) can touch
--   inscripciones scattered across several current grupos (or none), so
--   it gates on EACH inscripción's own current node individually: the
--   node of its current grupo when it has one, else
--   talleres_equipo_de_cohorte(cohorte_id) — mirroring how
--   talleres_equipo_de_solicitud already falls back to the cohorte's node
--   for a retiro request with no grupo_asignacion_id.
--
--   Rules: every id must exist or the whole batch fails with P0002
--   'inscripcion_no_encontrada' — this function is SECURITY DEFINER, so
--   the existence check itself does not rely on the caller's RLS
--   visibility; "visible" is enforced right after, per row, by the same
--   node-scoped capability gate used everywhere else in this function
--   (assign: the target grupo's node; unassign: each inscripción's
--   current node) — a caller with no authority anywhere in the tree gets
--   42501 before any row is touched. Assigning rejects any inscripción
--   whose estado is not 'aprobado' with P0001 'INSCRIPCION_NO_APROBADA' —
--   a pendiente/no_aprobado/retirado row is never placed in a grupo this
--   way. The coherence trigger from migration 1 enforces same-cohorte.
--   The UPDATE runs as one statement (no per-row loop) — either it, or the
--   whole call, fails.
--
--   Capacity is advisory, never a lock — same philosophy the user set for
--   edición cupo: "manually it should always be possible to open, add one
--   more". The function assigns even past capacidad and returns the
--   resulting ocupación/capacidad so the UI can show the excess (T3 paints
--   it as a visible warning, e.g. "13 / 12"). Declared assumption: this
--   task applies the user's edición-cupo rule to grupos too; a hard lock
--   at grupo level would be a separate, later decision.
--
--   Returns jsonb_build_object('asignadas', n, 'ocupacion', <count of
--   estado='aprobado' rows currently with this grupo_id>, 'capacidad',
--   <grupo.capacidad>). For unassign (p_grupo_id IS NULL), ocupacion and
--   capacidad are both NULL — there is no single grupo left to report on.
--
-- SAFETY
--   Purely additive: one new function, no table redefined, no existing
--   function touched. EXECUTE revoked from PUBLIC/anon, granted to
--   authenticated, postgres, service_role — same grant shape as every
--   other paso-3 SECURITY DEFINER RPC.
--
-- ROLLBACK
--   DROP FUNCTION public.talleres_asignar_inscripciones_a_grupo(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.talleres_asignar_inscripciones_a_grupo(
  p_inscripcion_ids uuid[],
  p_grupo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id   uuid;
  v_equipo     uuid;
  v_count      int;
  v_found      int;
  v_no_aprobadas int;
  v_updated    int;
  v_ocupacion  int;
  v_capacidad  int;
  v_rec        record;
BEGIN
  SELECT id INTO v_actor_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '42501';
  END IF;

  IF p_inscripcion_ids IS NULL OR array_length(p_inscripcion_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'sin_inscripciones' USING ERRCODE = '22023';
  END IF;

  v_count := array_length(p_inscripcion_ids, 1);

  SELECT count(*) INTO v_found
  FROM public.taller_inscripciones
  WHERE id = ANY (p_inscripcion_ids);

  IF v_found <> v_count THEN
    RAISE EXCEPTION 'inscripcion_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF p_grupo_id IS NOT NULL THEN
    -- Assigning: gate once, on the TARGET grupo's node.
    v_equipo := public.talleres_equipo_de_grupo(p_grupo_id);
    IF NOT (
          public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo)
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo)
       OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo)
    ) THEN
      RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_no_aprobadas
    FROM public.taller_inscripciones
    WHERE id = ANY (p_inscripcion_ids)
      AND estado <> 'aprobado';

    IF v_no_aprobadas > 0 THEN
      RAISE EXCEPTION 'INSCRIPCION_NO_APROBADA' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.taller_inscripciones
    SET grupo_id = p_grupo_id, version = version + 1
    WHERE id = ANY (p_inscripcion_ids);
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    SELECT capacidad INTO v_capacidad FROM public.taller_grupos WHERE id = p_grupo_id;
    SELECT count(*) INTO v_ocupacion
    FROM public.taller_inscripciones
    WHERE grupo_id = p_grupo_id AND estado = 'aprobado';

    RETURN jsonb_build_object(
      'asignadas', v_updated,
      'ocupacion', v_ocupacion,
      'capacidad', v_capacidad
    );
  ELSE
    -- Unassigning: each inscripción may sit under a different grupo (or
    -- none) today, so gate individually on each one's CURRENT node.
    FOR v_rec IN
      SELECT ti.id, ti.grupo_id, ti.cohorte_id
      FROM public.taller_inscripciones ti
      WHERE ti.id = ANY (p_inscripcion_ids)
    LOOP
      IF v_rec.grupo_id IS NOT NULL THEN
        v_equipo := public.talleres_equipo_de_grupo(v_rec.grupo_id);
      ELSE
        v_equipo := public.talleres_equipo_de_cohorte(v_rec.cohorte_id);
      END IF;

      IF NOT (
            public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo)
         OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo)
         OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo)
      ) THEN
        RAISE EXCEPTION 'sin_permisos_para_este_grupo' USING ERRCODE = '42501';
      END IF;
    END LOOP;

    UPDATE public.taller_inscripciones
    SET grupo_id = NULL, version = version + 1
    WHERE id = ANY (p_inscripcion_ids);
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN jsonb_build_object(
      'asignadas', v_updated,
      'ocupacion', NULL,
      'capacidad', NULL
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_asignar_inscripciones_a_grupo(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_asignar_inscripciones_a_grupo(uuid[], uuid) TO authenticated, postgres, service_role;
