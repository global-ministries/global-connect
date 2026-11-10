-- T2b (odd/tasks/proximo-paso.md, S3 / L6.2) — "si hay cupos que quede
-- inscrito automaticamente": a taller can approve its inscripciones on the
-- spot when there is cupo. Próximo Paso turns it on.
--
-- A. talleres.inscripcion_automatica boolean NOT NULL DEFAULT false. Every
--    existing taller keeps today's flow (pendiente until a coordinator
--    approves); only Próximo Paso (slug 'proximo-paso') is set to true.
--
-- B. talleres_inscribirme(uuid, jsonb) is PATCHED IN PLACE, not recreated.
--    WHY (L13/L14): the talleres reserva-pública work recreates this
--    function from 20261004150000 in its own migration
--    (20261110120000_talleres_inscripcion_core). A full CREATE OR REPLACE
--    here would throw that version away; a full CREATE OR REPLACE there
--    already threw the approval away once (staging, 2026-11-10). So this
--    migration reads the LIVE definition (pg_get_functiondef), inserts one
--    block right before the final success RETURN, and re-executes it. It
--    works on top of either base (20261004150000 or 20261110120000): both
--    end in RETURN jsonb_build_object('ok', true, 'inscripcion_id',
--    v_inscripcion_id, 'estado', ..., 'pareja_origen', v_modo) and both
--    keep v_edicion (taller_ediciones row) and v_inscripcion_id.
--
--    Order: reserva-pública's 20261110120000 sorts before this file, so on
--    a fresh database it is applied first and this patch lands on top of
--    it. Where the live body already mentions inscripcion_automatica (for
--    example staging, patched by hand on 2026-11-10) the patch is skipped
--    with a NOTICE, so running it twice changes nothing. If the final
--    RETURN cannot be found the migration fails: it never ships without
--    the approval silently.
--
--    WHOEVER RECREATES talleres_inscribirme LATER must keep the block
--    below (or re-run this patch), or Próximo Paso inscripciones go back
--    to pendiente.
--
--    The block: after the INSERT, when the edición is individual
--    (tipo <> 'pareja') and its taller has inscripcion_automatica, the new
--    row is approved with
--      UPDATE taller_inscripciones SET estado = 'aprobado'
--       WHERE id = <new row> AND estado = 'pendiente'
--    which is exactly the write of a coordinator's approval
--    (lib/platform/talleres/inscripciones-actions.ts approveInscripcionAction).
--    The same triggers fire (couple_unit, updated_at, the cupo gate, which
--    lets a pendiente -> aprobado transition through because pendiente
--    already occupies the seat, and cancela_invitaciones, which only acts
--    on no_aprobado/retirado). Approval assigns no grupo today (grupos are
--    assigned by hand with talleres_asignar_inscripciones_a_grupo), so none
--    is assigned here either. The app-side access sender that runs after a
--    manual approval only mails partner fichas created with ficha_nueva,
--    which only exist on pareja ediciones, which this never approves.
--
--    Cupo: the cupo gate (talleres_inscripciones_cupo_gate, with
--    talleres_cupo_edicion_calculo) counts pendiente and aprobado alike and
--    already ran on the INSERT. A full edición still answers CUPO_LLENO
--    and nothing is written; no cupo defined (0) means unlimited. So "there
--    is cupo" is exactly "the INSERT passed the gate".
--
--    Pago: talleres has no payment configuration today, so there is no
--    "payment before approval" case to keep.
--
--    Pareja ediciones are unchanged on purpose: a couple's inscripción
--    involves a second person (a confirmed spouse, a cédula match or a ficha
--    created on the spot) that a coordinator reviews.
--
--    Return keys are unchanged; estado reads 'aprobado' when the row was
--    approved. The function COMMENT gets one sentence appended (only when
--    it does not mention inscripcion_automatica yet). Grants restated
--    exactly as they are: no PUBLIC, no anon; authenticated and
--    service_role.
--
-- ROLLBACK (in this order):
--   recreate public.talleres_inscribirme(uuid, jsonb) from its live
--     definition without the "Inscripción automática" block (same
--     replace, inverted), then REVOKE/GRANT as below;
--   then remove the column public.talleres.inscripcion_automatica.

-- ===========================================================================
-- A. Taller option
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS inscripcion_automatica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talleres.inscripcion_automatica IS
  'When true, talleres_inscribirme approves an individual inscripción on the spot when the edición has cupo (or none defined); when false (the default) it stays pendiente until a coordinator approves it. Pareja ediciones always stay pendiente.';

UPDATE public.talleres SET inscripcion_automatica = true WHERE slug = 'proximo-paso';

-- ===========================================================================
-- B. talleres_inscribirme: patch the live definition
-- ===========================================================================

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
