-- T1 (odd/tasks/proximo-paso.md, S2) — Próximo Paso's plantilla has its
-- 4 clases, in order: Sígueme, Intimidad con Dios, Compañerismo,
-- Influencia (one per Sunday, cadencia_dias 7 — set by
-- 20261110150000_talleres_ancla_ediciones.sql).
--
-- WHY
--   talleres_instanciar_edicion copies the taller's ACTIVE plantilla
--   clases (ordered by numero) into every new edición's grupos, with their
--   tema. Próximo Paso's 4 named clases had no guaranteed home there
--   (20260926150000_talleres_plantillas_del_taller.sql created the table
--   but loaded no data).
--
-- WHAT
--   Idempotent data fix for the one taller with slug 'proximo-paso' (no
--   ids embedded). Inside one DO block:
--     1. park that taller's existing plantilla rows on numero + 1000000
--        (CHECK numero > 0 rules out negatives; UNIQUE (taller_id,
--        numero) must not collide while renumbering);
--     2. for each of the 4 clases, reuse an existing row whose tema
--        matches ignoring case, accents and surrounding spaces, or insert
--        it; it ends on numero = its position, activo, canonical tema;
--     3. any other row of that taller is kept, deactivated and renumbered
--        after them (5, 6, …) — nothing is deleted.
--   Running it again ends in the same rows and order.
--
-- SAFETY
--   Only rows of the Próximo Paso taller are touched; other tallers'
--   plantillas are not read or written. Ediciones already created keep
--   their own taller_sesiones (the plantilla is copied, not referenced).
--   No schema change, no function, no grant.
--
-- ROLLBACK
--   Data only: edit the plantilla from the taller page, or
--   UPDATE public.taller_plantilla_clases SET activo = false
--    WHERE taller_id = (SELECT id FROM public.talleres WHERE slug = 'proximo-paso');

DO $proximo_paso_clases$
DECLARE
  v_taller_id uuid;
  v_clases    text[] := ARRAY['Sígueme', 'Intimidad con Dios', 'Compañerismo', 'Influencia'];
  v_pos       integer;
  v_clase_id  uuid;
BEGIN
  SELECT id INTO v_taller_id FROM public.talleres WHERE slug = 'proximo-paso';
  IF v_taller_id IS NULL THEN
    RAISE NOTICE 'proximo-paso not found; plantilla left as is';
    RETURN;
  END IF;

  UPDATE public.taller_plantilla_clases
     SET numero = numero + 1000000
   WHERE taller_id = v_taller_id
     AND numero < 1000000;

  FOR v_pos IN 1..array_length(v_clases, 1) LOOP
    SELECT c.id INTO v_clase_id
      FROM public.taller_plantilla_clases c
     WHERE c.taller_id = v_taller_id
       AND c.numero >= 1000000
       AND translate(lower(btrim(c.tema)), 'áéíóúüñ', 'aeiouun')
         = translate(lower(v_clases[v_pos]), 'áéíóúüñ', 'aeiouun')
     ORDER BY c.activo DESC, c.numero
     LIMIT 1;

    IF v_clase_id IS NULL THEN
      INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema, activo) -- noqa: insert-into
      VALUES (v_taller_id, v_pos, v_clases[v_pos], true);
    ELSE
      UPDATE public.taller_plantilla_clases
         SET numero = v_pos,
             tema = v_clases[v_pos],
             activo = true
       WHERE id = v_clase_id;
    END IF;
  END LOOP;

  UPDATE public.taller_plantilla_clases c
     SET numero = array_length(v_clases, 1) + r.orden,
         activo = false
    FROM (
      SELECT id, row_number() OVER (ORDER BY numero) AS orden
        FROM public.taller_plantilla_clases
       WHERE taller_id = v_taller_id
         AND numero >= 1000000
    ) r
   WHERE c.id = r.id;
END;
$proximo_paso_clases$;
