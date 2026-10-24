-- Scheduled freeze of past Niños volunteer rosters, and marking freezes only
-- for authorized callers (odd/tasks/ninos-asistencia-voluntarios.md, V7).
--
-- Rollback:
--   SELECT cron.unschedule('ninos_voluntarios_congelar');  -- where pg_cron exists
--   re-apply ninos_voluntarios_marcar from 20261012180000_ninos_voluntarios_roster_congelado.sql
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_congelar_pendientes();
--
-- What:
--   1. ninos_voluntarios_congelar_pendientes(): freezes, for every active
--      turno, each past date of its weekday in the last 14 days (never before
--      ninos_voluntarios_congelado_desde()) that has no snapshot yet, through
--      ninos_voluntarios_congelar (never overwrites). Returns how many dates
--      it froze. Internal: no EXECUTE for PUBLIC, anon or authenticated.
--   2. pg_cron job 'ninos_voluntarios_congelar' at minute 15 of every hour,
--      so a Sunday nobody opens is frozen right after it ends (Monday in
--      Caracas), before later reassignments. Guarded: a no-op where pg_cron
--      is not installed (staging), and re-running replaces the job. The lazy
--      freeze in planilla, marcar and the report stays as the fallback.
--   3. ninos_voluntarios_marcar freezes only after the caller's authority on
--      every servicio is checked, then re-reads `esperado` from the snapshot.
--      Signature, output and errors unchanged.
--
-- Runs with definer rights and search_path ''.

-- ── 1. scheduled freeze ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_congelar_pendientes()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hoy date := public.ninos_hoy();
  v_congeladas integer;
BEGIN
  SELECT count(*) FILTER (WHERE public.ninos_voluntarios_congelar(t.id, d::date))::int
    INTO v_congeladas
    FROM public.dream_team_turnos t
    CROSS JOIN generate_series(greatest(v_hoy - 14, public.ninos_voluntarios_congelado_desde()), v_hoy - 1,
                               interval '1 day') AS d
   WHERE t.activo
     AND extract(dow FROM d)::int = t.dia_semana
     AND NOT EXISTS (SELECT 1 FROM public.ninos_voluntarios_rosters c
                      WHERE c.turno_id = t.id AND c.fecha = d::date);
  RETURN v_congeladas;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_congelar_pendientes() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ninos_voluntarios_congelar') THEN
      PERFORM cron.unschedule('ninos_voluntarios_congelar');
    END IF;
    PERFORM cron.schedule('ninos_voluntarios_congelar', '15 * * * *',
                          $cmd$SELECT public.ninos_voluntarios_congelar_pendientes()$cmd$);
  END IF;
END;
$$;

-- ── 2. marking freezes after the authority check ─────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_marcar(
  p_turno_id uuid,
  p_fecha date,
  p_servicio_ids uuid[],
  p_estado text,
  p_solo_sin_marcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_turno public.dream_team_turnos%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_ids uuid[];
  v_servicios uuid[];
  v_equipos uuid[];
  v_esperados boolean[];
  v_cambiados integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('presente', 'justificado', 'ausente') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(p_servicio_ids) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) > 300 THEN
    RAISE EXCEPTION 'demasiados_servicios' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 14
     OR extract(dow FROM p_fecha)::int <> v_turno.dia_semana THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('estado', p_estado, 'servicios', 0, 'cambiados', 0);
  END IF;
  -- The roster rows of the ids, read once: every id must be in the roster of
  -- this turno, in an equipo the caller may mark.
  SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
         coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
    INTO v_servicios, v_equipos, v_esperados
    FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
   WHERE r.servicio_id = ANY (v_ids);
  IF cardinality(v_servicios) < cardinality(v_ids) THEN
    RAISE EXCEPTION 'servicio_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT DISTINCT e FROM unnest(v_equipos) AS e) d
              WHERE NOT public.ninos_puede_marcar_voluntarios(d.e)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- Only an authorized caller freezes a past date; the frozen roster then
  -- decides `esperado` (a snapshot is a subset of the live roster read above).
  IF public.ninos_voluntarios_congelar(p_turno_id, p_fecha) THEN
    SELECT coalesce(array_agg(r.servicio_id), ARRAY[]::uuid[]), coalesce(array_agg(r.equipo_id), ARRAY[]::uuid[]),
           coalesce(array_agg(r.esperado), ARRAY[]::boolean[])
      INTO v_servicios, v_equipos, v_esperados
      FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
     WHERE r.servicio_id = ANY (v_ids);
  END IF;

  IF p_estado IS NULL THEN
    DELETE FROM public.dream_team_asistencias a
     WHERE a.turno_id = p_turno_id AND a.fecha = p_fecha AND a.servicio_id = ANY (v_servicios);
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSIF p_solo_sin_marcar THEN
    INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_por) -- noqa: insert-into
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO NOTHING;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  ELSE
    -- Re-marking the same estado is a no-op: the first marker and time stay.
    INSERT INTO public.dream_team_asistencias AS a (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
    SELECT x.servicio_id, p_turno_id, p_fecha, p_estado, x.esperado, v_actor
      FROM unnest(v_servicios, v_esperados) AS x(servicio_id, esperado)
    ON CONFLICT (servicio_id, turno_id, fecha) DO UPDATE
       SET estado = excluded.estado, esperado = excluded.esperado,
           marcado_por = excluded.marcado_por, marcado_at = now()
     WHERE a.estado IS DISTINCT FROM excluded.estado OR a.esperado IS DISTINCT FROM excluded.esperado;
    GET DIAGNOSTICS v_cambiados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('estado', p_estado, 'servicios', cardinality(v_ids), 'cambiados', v_cambiados);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean) TO authenticated;
