-- Niños coverage G1 (odd/tasks/ninos-cobertura.md): the pending
-- pre-registrations at the table use a rolling 7-day window.
--
-- Why: the current-week window (from Monday 00:00 America/Caracas, set in
-- 20261008153000_ninos_unificar.sql) hides a family that filled the form on
-- Saturday or Sunday as soon as the week turns, before anyone confirmed it.
--
-- What changes: ninos_preregistros_pendientes() lists the pending rows
-- created in the last 7 days (now() - 7 days). Same columns, authority
-- (ninos_puede_operar on an active room of the campus) and grants.
--
-- Rollback: re-run 20261008153000_ninos_unificar.sql.

CREATE OR REPLACE FUNCTION public.ninos_preregistros_pendientes()
RETURNS TABLE (id uuid, campus_id uuid, payload jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT r.id, r.campus_id, r.payload, r.created_at
    FROM public.ninos_preregistros r
   WHERE r.estado = 'pendiente'
     AND r.created_at > now() - interval '7 days'
     AND EXISTS (SELECT 1 FROM public.ninos_salones s
                  WHERE s.campus_id = r.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
   ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistros_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistros_pendientes() TO authenticated;
