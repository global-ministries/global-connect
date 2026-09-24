-- CORRECTION (post-T4 independent review of odd/tasks/talleres-
-- inscripcion-a-grupo.md, items 3 and 5). Two defects in T1's migrations
-- (20260924120000, 20260924130000), both fixed here.
--
-- ITEM 3 — the coherence trigger only fired on `UPDATE OF grupo_id`. An
--   UPDATE that changes `cohorte_id` alone (grupo_id untouched) never
--   fires it, so a placed inscripción's cohorte_id could be moved to a
--   DIFFERENT cohorte than its own grupo without the guard ever running
--   — exactly the cross-cohorte crossing the trigger exists to prevent.
--   Fixed by widening the trigger's column list to `UPDATE OF grupo_id,
--   cohorte_id`. The function body itself already compares NEW.grupo_id's
--   cohorte against NEW.cohorte_id — no change needed there, only the
--   trigger definition. DROP + CREATE (not CREATE OR REPLACE — Postgres
--   has no CREATE OR REPLACE TRIGGER before 14; this project doesn't
--   assume it).
--
-- ITEM 5 — `talleres_asignar_inscripciones_a_grupo`'s existence check
--   compared `array_length(p_inscripcion_ids, 1)` (which counts
--   DUPLICATES) against `count(*) ... WHERE id = ANY(...)` (which counts
--   DISTINCT rows found). Passing the same id twice made the counts
--   diverge and the call fail P0002 'inscripcion_no_encontrada' even
--   though every id genuinely exists. Fixed by deduping the input array
--   ONCE at the top (`v_ids`) and using `v_ids` for every check and
--   write in the function body instead of the raw parameter.
--
-- SAFETY: both fixes are behavior corrections to existing objects, no
-- new column, no data touched (production has 0 rows in this table
-- today, same as T1).
--
-- ROLLBACK
--   DROP TRIGGER trg_taller_inscripciones_grupo_coherente ON public.taller_inscripciones;
--   CREATE TRIGGER trg_taller_inscripciones_grupo_coherente
--     BEFORE INSERT OR UPDATE OF grupo_id ON public.taller_inscripciones
--     FOR EACH ROW
--     EXECUTE FUNCTION public.talleres_inscripcion_grupo_coherente();
--   -- talleres_asignar_inscripciones_a_grupo: re-apply migration
--   -- 20260924130000's CREATE OR REPLACE body verbatim.

DROP TRIGGER trg_taller_inscripciones_grupo_coherente ON public.taller_inscripciones;

CREATE TRIGGER trg_taller_inscripciones_grupo_coherente
  BEFORE INSERT OR UPDATE OF grupo_id, cohorte_id ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripcion_grupo_coherente();

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
  v_ids        uuid[];
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

  -- Item 5: dedupe once. Every subsequent check/write uses v_ids, never
  -- the raw (possibly duplicated) p_inscripcion_ids.
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_inscripcion_ids) AS x;
  v_count := array_length(v_ids, 1);

  SELECT count(*) INTO v_found
  FROM public.taller_inscripciones
  WHERE id = ANY (v_ids);

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
    WHERE id = ANY (v_ids)
      AND estado <> 'aprobado';

    IF v_no_aprobadas > 0 THEN
      RAISE EXCEPTION 'INSCRIPCION_NO_APROBADA' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.taller_inscripciones
    SET grupo_id = p_grupo_id, version = version + 1
    WHERE id = ANY (v_ids);
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
      WHERE ti.id = ANY (v_ids)
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
    WHERE id = ANY (v_ids);
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
