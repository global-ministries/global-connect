-- talleres-reserva-publica (odd/tasks/talleres-reserva-publica.md, L29):
-- 20261110121000_talleres_inscripcion_core recreates talleres_inscribirme from
-- its 20261004150000 contract. On a database where
-- 20261110170000_talleres_inscripcion_automatica already ran (production
-- applied it before the core), that recreation drops the inscripción
-- automática block of Próximo Paso. This re-runs the same idempotent patch:
-- it skips with a NOTICE when the live body already handles
-- inscripcion_automatica (fresh databases and staging), and inserts the block
-- before the final success RETURN otherwise. The block is copied verbatim
-- from 20261110170000 section B.
--
-- Rollback: none needed; re-running is a no-op.

DO $patch$
DECLARE
  v_def text;
  v_nuevo text;
  v_comentario text;
  -- The final success RETURN; the leading (.*) is greedy, so the match is
  -- the LAST occurrence in the body.
  v_patron constant text :=
    '^(.*)(RETURN jsonb_build_object\(\s*''ok'', true,\s*''inscripcion_id'', v_inscripcion_id,\s*''estado'', [^,]+,\s*''pareja_origen'', v_modo\s*\);)';
  v_bloque constant text := $blk$-- Inscripción automática (individual ediciones only; 20261110170000).
  -- The row above went through the cupo gate as 'pendiente', which already
  -- occupies a seat, so reaching this point means there was cupo (or none
  -- defined). It is approved with the very UPDATE a coordinator's approval
  -- runs, so the same triggers fire and nothing else is written.
  IF v_edicion.tipo <> 'pareja'
     AND (SELECT t.inscripcion_automatica FROM public.talleres t WHERE t.id = v_edicion.taller_id) THEN
    UPDATE public.taller_inscripciones SET estado = 'aprobado'
     WHERE id = v_inscripcion_id AND estado = 'pendiente';
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'inscripcion_id', v_inscripcion_id, 'estado', 'aprobado', 'pareja_origen', v_modo);
    END IF;
  END IF;

  $blk$;
BEGIN
  v_def := pg_get_functiondef('public.talleres_inscribirme(uuid,jsonb)'::regprocedure);

  IF position('inscripcion_automatica' IN v_def) > 0 THEN
    RAISE NOTICE 'talleres_inscribirme already handles inscripcion_automatica; patch skipped';
  ELSE
    IF position('v_edicion' IN v_def) = 0 OR v_def !~ v_patron THEN
      RAISE EXCEPTION 'talleres_inscribirme: final success RETURN (or v_edicion) not found; inscripción automática NOT applied. Re-check the live body and update this patch.';
    END IF;

    v_nuevo := regexp_replace(v_def, v_patron, '\1' || v_bloque || '\2');
    IF v_nuevo = v_def OR position('inscripcion_automatica' IN v_nuevo) = 0 THEN
      RAISE EXCEPTION 'talleres_inscribirme: inscripción automática block could not be inserted';
    END IF;

    EXECUTE v_nuevo;
  END IF;

  v_comentario := obj_description('public.talleres_inscribirme(uuid,jsonb)'::regprocedure, 'pg_proc');
  IF v_comentario IS NOT NULL AND position('inscripcion_automatica' IN v_comentario) = 0 THEN
    EXECUTE format(
      'COMMENT ON FUNCTION public.talleres_inscribirme(uuid, jsonb) IS %L',
      v_comentario || ' On an individual edición of a taller with inscripcion_automatica the new row is approved right away with the coordinator''s own UPDATE (there was cupo: the gate let it in) and estado reads aprobado.'
    );
  END IF;
END
$patch$;

REVOKE ALL ON FUNCTION public.talleres_inscribirme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribirme(uuid, jsonb) TO authenticated, service_role;
