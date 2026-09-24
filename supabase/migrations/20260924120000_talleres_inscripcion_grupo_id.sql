-- T1 (odd/tasks/talleres-inscripcion-a-grupo.md) — the missing link:
-- inscripción → grupo.
--
-- WHY
--   Nothing today says "this person is in this grupo". `taller_inscripciones`
--   hangs off the cohorte (`cohorte_id NOT NULL`); `taller_grupos` also hangs
--   off the cohorte; `taller_grupo_asignaciones` is the grupo's TEAM (líder /
--   voluntario), not its participants. `taller_asistencias` points at
--   `sesion_id` + `inscripcion_id` + `persona_id`, and sesiones hang off a
--   grupo — so without this column, passing lista in a class has nobody to
--   list. Verified in production 2026-09-24 (docs/talleres-de-punta-a-
--   punta.md §10): 0 inscripciones, 0 grupos, 0 asignaciones, 0 sesiones,
--   0 asistencias — the model can change without migrating a single row.
--
-- WHAT
--   `taller_inscripciones.grupo_id uuid NULL REFERENCES taller_grupos(id)
--   ON DELETE SET NULL` — an inscripción is in one grupo or none; a pareja
--   (`companero_id`) is a single inscripción and moves as one row. An index
--   on `grupo_id` for the grupo-detail "su gente" query (T2/T4).
--
--   Coherence is guaranteed by the database, not the app: the grupo must
--   belong to the SAME cohorte as the inscripción. A `BEFORE INSERT OR
--   UPDATE OF grupo_id` trigger raises P0001 `GRUPO_DE_OTRA_COHORTE` when
--   the target grupo's `cohorte_id` differs from the row's `cohorte_id`.
--   The trigger function is SECURITY DEFINER (SET search_path = public) so
--   the guard holds regardless of the caller's RLS on `taller_grupos` — no
--   route (RPC, PostgREST, SQL by hand) can cross cohortes, ever.
--
--   Alternatives considered and rejected (see task Decisiones):
--     - Reusing `taller_grupo_asignaciones` — that table is the grupo's
--       team, a different concept; mixing participants into it would
--       confuse both.
--     - Fusing cohorte and grupo — structural, touches the ~40 paso-3
--       policies that resolve the org node via `talleres_equipo_de_cohorte`;
--       out of scope for this task, tracked separately.
--
-- SAFETY
--   Purely additive: one nullable column, one index, one new trigger
--   function + trigger. No existing row is touched (production has zero
--   rows in this table today). `grupo_id` is never cleared on retiro — it
--   is history (the person WAS in that grupo, and their past asistencia
--   still makes sense); the UI is responsible for showing retirados
--   separately and excluding them from ocupación.
--
-- ROLLBACK
--   DROP TRIGGER trg_taller_inscripciones_grupo_coherente ON public.taller_inscripciones;
--   DROP FUNCTION public.talleres_inscripcion_grupo_coherente();
--   DROP INDEX public.idx_taller_inscripciones_grupo_id;
--   ALTER TABLE public.taller_inscripciones DROP COLUMN grupo_id;

ALTER TABLE public.taller_inscripciones
  ADD COLUMN grupo_id uuid NULL REFERENCES public.taller_grupos(id) ON DELETE SET NULL;

CREATE INDEX idx_taller_inscripciones_grupo_id
  ON public.taller_inscripciones (grupo_id);

CREATE OR REPLACE FUNCTION public.talleres_inscripcion_grupo_coherente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grupo_cohorte_id uuid;
BEGIN
  IF NEW.grupo_id IS NOT NULL THEN
    SELECT cohorte_id INTO v_grupo_cohorte_id
    FROM public.taller_grupos
    WHERE id = NEW.grupo_id;

    IF v_grupo_cohorte_id IS DISTINCT FROM NEW.cohorte_id THEN
      RAISE EXCEPTION 'GRUPO_DE_OTRA_COHORTE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_taller_inscripciones_grupo_coherente
  BEFORE INSERT OR UPDATE OF grupo_id ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripcion_grupo_coherente();
