-- DPS planning: the person search of the programming sheet
-- (odd/tasks/dps-asistencia-pco.md, T11c; S11, S7.3). The Productor, Host
-- and Comunicador cells link a persona of the system ({"persona_id"} through
-- dps_plan_campo, 20261108201000_dps_planificacion_rpcs.sql) or keep a
-- written name. talleres_buscar_personas, the search of Configuración, needs
-- a Dream Team or Talleres grant, so an admin/pastor or an added planner
-- without one could not search; this one follows the sheet's own rule.
--
--   dps_buscar_personas(texto, limite = 10)
--       Planners only (dps_exigir_planificador). People whose «nombre
--       apellido» contains every word of texto, ignoring case and the order
--       of the words ('%' and '_' are literal), ordered by nombre, apellido.
--       Fewer than 2 characters (or NULL) return nothing; more than 100 is
--       'busqueda_invalida'. limite is clamped to 1..20 (NULL = 10). Returns
--       id, nombre, apellido and iniciales only: no email, no teléfono.
--
-- Errors: 'sin_autoridad' (42501) without a session or authority;
-- 'busqueda_invalida' (22023).
--
-- Suite: supabase/tests/dps-planificacion-buscar.test.sql.
--
-- Rollback: DROP FUNCTION IF EXISTS public.dps_buscar_personas(text, integer);

CREATE OR REPLACE FUNCTION public.dps_buscar_personas(p_texto text, p_limite integer DEFAULT 10)
RETURNS TABLE (id uuid, nombre text, apellido text, iniciales text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_texto text := btrim(coalesce(p_texto, ''));
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 20);
  v_palabras text[];
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF char_length(v_texto) > 100 THEN
    RAISE EXCEPTION 'busqueda_invalida' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_texto) < 2 THEN
    RETURN;
  END IF;
  SELECT array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    INTO v_palabras
    FROM regexp_split_to_table(v_texto, '\s+') AS w
   WHERE w <> '';

  RETURN QUERY
  SELECT u.id, u.nombre::text, u.apellido::text, public.dps_iniciales(u.nombre, u.apellido)
    FROM public.usuarios u
   WHERE concat_ws(' ', u.nombre, u.apellido) ILIKE ALL (v_palabras)
   ORDER BY u.nombre, u.apellido, u.id
   LIMIT v_limite;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_buscar_personas(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_buscar_personas(text, integer) TO authenticated;
