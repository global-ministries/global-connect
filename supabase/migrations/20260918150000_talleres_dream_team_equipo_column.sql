-- ════════════════════════════════════════════════════════════════════
-- T2 — talleres.dream_team_equipo_id: the catalog remembers its equipo.
--
-- WHY: today a taller's equipo is deduced by walking its cohortes at
-- read time (see odd/tasks/talleres-equipo-en-organigrama.md, "Problema
-- y porqué"). A taller with zero cohortes (like "De Hombre a Hombre"
-- before its first edición) has no reliable owner, and open_edicion's
-- lazy-mint path (20260821000002) papers over that by creating a new,
-- parentless equipo on demand. T3 makes choosing the equipo mandatory
-- at taller-creation time; this migration adds the column that
-- remembers the choice and backfills the talleres that predate it.
--
-- WHAT:
--   1. talleres.dream_team_equipo_id: nullable uuid FK to
--      dream_team_equipos, ON DELETE RESTRICT (an equipo backing a
--      taller cannot be deleted out from under it).
--   2. One-time backfill, only where the column is still NULL:
--        a. the single distinct dream_team_equipo_id among the
--           taller's cohortes (talleres_crecimiento_cohortes, joined
--           through taller_ediciones.taller_id) — the same join
--           open_edicion already uses to resolve a taller's equipo
--           (20260821000002_cimiento2_talleres_equipo_por_taller.sql);
--        b. else the unique dream_team_equipos row with
--           experiencia = 'talleres_crecimiento' whose label equals
--           'Equipo ' || nombre case-insensitively AND is not already
--           linked to another taller;
--        c. else left NULL, with a RAISE NOTICE naming the taller —
--           T3 does not force a value onto a taller this migration
--           cannot confidently resolve.
--   3. A partial unique index so no dream_team_equipos row can back
--      two talleres at once.
--
-- SAFETY: additive only (no DROP, no DELETE, no data rewritten once
-- set). The column stays nullable — NOT NULL is explicitly out of
-- scope for this change (see "Alcance autorizado" in the task doc; a
-- future step tightens it once every taller has gone through T3's
-- create flow). The backfill only ever writes into rows that are
-- still NULL, so re-running this migration is a no-op the second
-- time.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.talleres_dream_team_equipo_id_uniq;
--   ALTER TABLE public.talleres DROP COLUMN IF EXISTS dream_team_equipo_id;
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS dream_team_equipo_id uuid
    REFERENCES public.dream_team_equipos(id) ON DELETE RESTRICT;

DO $backfill$
DECLARE
  v_taller      RECORD;
  v_equipo_id   uuid;
  v_match_count integer;
BEGIN
  FOR v_taller IN
    SELECT id, nombre FROM public.talleres
    WHERE dream_team_equipo_id IS NULL
    ORDER BY id
  LOOP
    v_equipo_id := NULL;

    -- (a) the single distinct equipo among this taller's cohortes.
    SELECT count(DISTINCT c.dream_team_equipo_id)
    INTO v_match_count
    FROM public.talleres_crecimiento_cohortes c
    JOIN public.taller_ediciones te ON te.id = c.taller_id
    WHERE te.taller_id = v_taller.id
      AND c.dream_team_equipo_id IS NOT NULL;

    IF v_match_count = 1 THEN
      SELECT DISTINCT c.dream_team_equipo_id
      INTO v_equipo_id
      FROM public.talleres_crecimiento_cohortes c
      JOIN public.taller_ediciones te ON te.id = c.taller_id
      WHERE te.taller_id = v_taller.id
        AND c.dream_team_equipo_id IS NOT NULL;
    END IF;

    -- (b) else the unique name-matched, not-yet-linked equipo.
    IF v_equipo_id IS NULL THEN
      SELECT count(*)
      INTO v_match_count
      FROM public.dream_team_equipos e
      WHERE e.experiencia = 'talleres_crecimiento'
        AND lower(e.label) = lower('Equipo ' || v_taller.nombre)
        AND NOT EXISTS (
          SELECT 1 FROM public.talleres t2 WHERE t2.dream_team_equipo_id = e.id
        );

      IF v_match_count = 1 THEN
        SELECT e.id
        INTO v_equipo_id
        FROM public.dream_team_equipos e
        WHERE e.experiencia = 'talleres_crecimiento'
          AND lower(e.label) = lower('Equipo ' || v_taller.nombre)
          AND NOT EXISTS (
            SELECT 1 FROM public.talleres t2 WHERE t2.dream_team_equipo_id = e.id
          );
      END IF;
    END IF;

    -- (c) else leave it NULL and say so.
    IF v_equipo_id IS NOT NULL THEN
      UPDATE public.talleres SET dream_team_equipo_id = v_equipo_id WHERE id = v_taller.id;
    ELSE
      RAISE NOTICE 'talleres.dream_team_equipo_id left NULL for taller % (%): no unique cohorte equipo or name-matched equipo found', v_taller.id, v_taller.nombre;
    END IF;
  END LOOP;
END;
$backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS talleres_dream_team_equipo_id_uniq
  ON public.talleres (dream_team_equipo_id)
  WHERE dream_team_equipo_id IS NOT NULL;
