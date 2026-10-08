-- Niños: unify the pre-registration (N8/N9) and family links (N10) branches
-- (odd/tasks/ninos-checkin.md).
--
-- Overlap check: no function is replaced by both 20261008150000 and
-- 20261008151000/20261008152000, so applying every migration in order already
-- yields the union of behaviors:
--   - ninos_correos_visita (150000 only) reads parent links in both
--     directions, so a second parent linked through ninos_vincular_padre is
--     notified too;
--   - ninos_buscar_familias (final in 152000) returns tiene_ficha and padres
--     and applies the under-13 rule to children without a ficha;
--   - ninos_preregistro_resolver (150000 only) confirms through
--     ninos_registrar_familia (final in 144000), so an existing parent must be
--     chosen explicitly (padre.id) or padre_existente is raised.
--
-- What changes here:
--   1. ninos_preregistros_pendientes(): only the current week, from Monday
--      00:00 America/Caracas (date_trunc on ninos_hoy()), instead of the last
--      14 days. Same columns, authority and grants.
--
-- Rollback: re-run section 4 of 20261008150000_ninos_preregistro.sql.

CREATE OR REPLACE FUNCTION public.ninos_preregistros_pendientes()
RETURNS TABLE (id uuid, campus_id uuid, payload jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT r.id, r.campus_id, r.payload, r.created_at
    FROM public.ninos_preregistros r
   WHERE r.estado = 'pendiente'
     AND r.created_at >= (date_trunc('week', public.ninos_hoy()::timestamp) AT TIME ZONE 'America/Caracas')
     AND EXISTS (SELECT 1 FROM public.ninos_salones s
                  WHERE s.campus_id = r.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
   ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistros_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistros_pendientes() TO authenticated;
