-- Prevent concurrent duplicate Casas Anfitrionas assignments.
-- This migration adds DB-level protection for both owner and co-host assignments
-- without repairing, deleting, or rewriting existing production data.

CREATE INDEX IF NOT EXISTS idx_casas_co_anfitrion
ON public.casas_anfitrionas(co_anfitrion_id)
WHERE co_anfitrion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_casa_anfitriona_assignees()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_assignee_ids uuid[];
  v_assignee_id uuid;
  v_conflict_id uuid;
BEGIN
  IF NEW.usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.co_anfitrion_id IS NOT NULL AND NEW.co_anfitrion_id = NEW.usuario_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'El propietario y co-anfitrión deben ser usuarios distintos';
  END IF;

  SELECT array_agg(id ORDER BY id::text)
  INTO v_assignee_ids
  FROM (
    SELECT NEW.usuario_id AS id
    UNION
    SELECT NEW.co_anfitrion_id AS id WHERE NEW.co_anfitrion_id IS NOT NULL
  ) assignees;

  FOREACH v_assignee_id IN ARRAY v_assignee_ids LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('casas_anfitrionas_assignee:' || v_assignee_id::text, 0)
    );
  END LOOP;

  SELECT ca.id
  INTO v_conflict_id
  FROM public.casas_anfitrionas ca
  WHERE ca.id IS DISTINCT FROM NEW.id
    AND (
      ca.usuario_id = ANY(v_assignee_ids)
      OR ca.co_anfitrion_id = ANY(v_assignee_ids)
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'El propietario o co-anfitrión ya tiene una casa anfitriona asignada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_unique_casa_anfitriona_assignees ON public.casas_anfitrionas;

CREATE TRIGGER ensure_unique_casa_anfitriona_assignees
BEFORE INSERT OR UPDATE OF usuario_id, co_anfitrion_id
ON public.casas_anfitrionas
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_casa_anfitriona_assignees();
