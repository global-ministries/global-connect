-- noqa: insert-into
-- DPS planning: director sync only from today on (odd/tasks/dps-asistencia-pco.md,
-- S8 as amended by L40). Builds on 20261108204000_dps_directores_automaticos.sql.
--
-- Why: 204000 synced the automatic director convocados of every plan from
-- ninos_hoy() - 14 on. Reading a past Sunday after a director left the cargo
-- deleted their automatic row and, with it, their «avisó que no viene»; a
-- director appointed later was added to past Sundays as a false absence.
-- The user chose (L40): "Solo de hoy en adelante — Los domingos que ya
-- pasaron quedan como estaban; los directores nuevos o retirados solo cambian
-- hoy y los próximos."
--
-- What: dps_directores_sincronizar(plan) is re-created identical to 204000
-- except the window guard, now v_fecha < public.ninos_hoy(): only plans dated
-- today or later are synced; past plans keep their rows as they are. Still
-- SECURITY DEFINER, search_path '', closed to PUBLIC, anon and authenticated.
-- Nothing else changes.
--
-- Rollback: re-run the dps_directores_sincronizar block of
-- 20261108204000_dps_directores_automaticos.sql (guard ninos_hoy() - 14).

CREATE OR REPLACE FUNCTION public.dps_directores_sincronizar(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_fecha date;
  v_raiz uuid := public.dps_raiz();
BEGIN
  SELECT p.fecha INTO v_fecha FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND OR v_raiz IS NULL OR v_fecha < public.ninos_hoy() THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.dps_convocados c
        WHERE c.plan_id = p_plan_id AND c.automatico
          AND NOT EXISTS (SELECT 1 FROM public.dps_directores_deseados() d
                           WHERE d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id AND d.servicio_id = c.servicio_id)
       UNION ALL
       SELECT 1 FROM public.dps_directores_deseados() d
        WHERE NOT EXISTS (SELECT 1 FROM public.dps_convocados c
                           WHERE c.plan_id = p_plan_id AND c.puesto_id = d.puesto_id AND c.persona_id = d.persona_id)) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_plan_id::text));
  DELETE FROM public.dps_convocados c
   WHERE c.plan_id = p_plan_id AND c.automatico
     AND NOT EXISTS (SELECT 1 FROM public.dps_directores_deseados() d WHERE d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id);
  UPDATE public.dps_convocados c
     SET servicio_id = d.servicio_id
    FROM public.dps_directores_deseados() d
   WHERE c.plan_id = p_plan_id AND c.automatico
     AND d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id AND d.servicio_id <> c.servicio_id;
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, automatico) -- noqa: insert-into
  SELECT p_plan_id, d.puesto_id, d.servicio_id, d.persona_id, true
    FROM public.dps_directores_deseados() d
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_sincronizar(uuid) FROM PUBLIC, anon, authenticated;
