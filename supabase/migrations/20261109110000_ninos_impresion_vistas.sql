-- Niños T3b (odd/tasks/ninos-checkin-pco.md, S10, S6): read the reprints of a
-- campus for «Reimpresiones de hoy» and «Historial» on /ninos/etiquetas.
--
-- S10 "Anfitriones y coordinación, con motivo": every reprint stores its
-- reason, note, who and when (20261109100000_ninos_impresion.sql); this
-- function shows them. Only reprints (motivo IS NOT NULL), never the labels
-- of the check-in itself.
--
-- What:
--   ninos_impresion_reimpresiones(p_campus_id, p_desde, p_hasta)
--     One row per reprinted label of the campus whose created_at falls, in
--     Caracas, between p_desde and p_hasta (inclusive, at most 31 days;
--     both NULL = today, one NULL = that single day), newest first, up to
--     500: id, created_at, quien (who reprinted), tipo (nino | representante),
--     nino (the child of a child label, from the label payload), ninos (the
--     first names of a receipt), codigo, motivo, nota, estacion_id, estacion
--     (its name), estado (pendiente | impresa | error), error.
--     Never a phone, cédula, allergy text nor custody: the payload carries
--     none of them and only these keys are read.
--   Authority: the same campus scope as the other impresion RPCs —
--   ninos_impresion_puede_operar (anfitriones and coordinación on a room of
--   the campus, admin/pastor) or ninos_impresion_puede_administrar
--   (ninos_puede_configurar on a room of the campus). Anyone else, another
--   campus or anon: sin_autoridad (42501). A bad range: datos_invalidos (22023).
--   An index on the reprints by station and time backs the range read.
--
-- Blast radius: one new function and one partial index; nothing is replaced.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_impresion_reimpresiones(uuid, date, date);
--   DROP INDEX IF EXISTS public.ninos_impresiones_reimpresiones_idx;

CREATE INDEX IF NOT EXISTS ninos_impresiones_reimpresiones_idx
  ON public.ninos_impresiones (estacion_id, created_at) WHERE motivo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ninos_impresion_reimpresiones(
  p_campus_id uuid, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL
)
RETURNS TABLE (id uuid, created_at timestamptz, quien text, tipo text, nino text, ninos jsonb, codigo text,
               motivo text, nota text, estacion_id uuid, estacion text, estado text, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Caracas')::date;
  v_desde date := coalesce(p_desde, p_hasta, v_hoy);
  v_hasta date := coalesce(p_hasta, p_desde, v_hoy);
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR p_campus_id IS NULL
     OR NOT (public.ninos_impresion_puede_operar(p_campus_id) OR public.ninos_impresion_puede_administrar(p_campus_id)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_desde > v_hasta OR v_hasta - v_desde > 30 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT i.id, i.created_at,
         nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''),
         i.tipo,
         CASE WHEN i.tipo = 'nino' THEN nullif(btrim(concat_ws(' ', i.payload ->> 'nombre', i.payload ->> 'apellido')), '') END,
         CASE WHEN i.tipo = 'representante' AND jsonb_typeof(i.payload -> 'ninos') = 'array' THEN i.payload -> 'ninos'
              ELSE '[]'::jsonb END,
         i.payload ->> 'codigo', i.motivo, i.nota, e.id, e.nombre, i.estado, i.error
    FROM public.ninos_impresiones i
    JOIN public.ninos_estaciones_impresion e ON e.id = i.estacion_id
    LEFT JOIN public.usuarios u ON u.id = i.created_by
   WHERE e.campus_id = p_campus_id
     AND i.motivo IS NOT NULL
     AND i.created_at >= (v_desde::timestamp AT TIME ZONE 'America/Caracas')
     AND i.created_at < ((v_hasta + 1)::timestamp AT TIME ZONE 'America/Caracas')
   ORDER BY i.created_at DESC, i.id
   LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_impresion_reimpresiones(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_impresion_reimpresiones(uuid, date, date) TO authenticated;
