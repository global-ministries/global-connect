-- noqa: insert-into
-- DPS planning: the automatic service reminder by e-mail
-- (odd/tasks/dps-asistencia-pco.md, T16c; S14.3, S14.5, S14.6; L71, L73;
-- artboards design/dps-avisos-correo 03 and 07). Builds on
-- 20261114100000_dps_avisos_correo.sql (the outbox, the confirm links).
--
-- The user chose (L71) "Configurable, por defecto 2 días antes": the
-- director sets it in Configuración de DPS; it leaves at 10:00 Caracas to
-- whoever confirmed or did not answer (never to whoever said «No puedo»);
-- without an answer it carries the buttons; one e-mail per person and day.
--
-- What:
--   1. dps_config.recordatorio_activo (default true) and
--      dps_config.recordatorio_dias (1-7, default 2). The hour is fixed:
--      the daily cron (vercel.json, 14:00 UTC = 10:00 Caracas).
--   2. dps_avisos_correos.tipo also 'recordatorio': one row per person and
--      plan DATE (clave 'recordatorio:<persona>:<fecha>', so running the
--      job twice queues nothing new and two plans the same day are ONE
--      e-mail). datos = {bloques, avisos, dias}; each block is
--      dps_aviso_json + aviso_id, version (the confirm link of T16b for that
--      version), confirmar (still pendiente), orden (the plan's order of the
--      service, dps_orden_item_json) and equipo (who serves with you:
--      personas and confirmaron among the notified people not quitado and
--      not no_puede, and per direccion). responder_* = whoever sent the
--      person's latest notice of that day (Reply-To); vence = the date, so
--      the outbox never sends it late. Only people with an e-mail get a row.
--   3. Who gets it (dps_recordatorio_destinatarios(fecha), internal): the
--      notices of plans dated fecha that are not quitado, with estado
--      confirmo or pendiente (never no_puede), whose notified fecha is still
--      the plan's (a moved plan not sent again gets nothing).
--   4. For planners: dps_config_leer() (same signature) adds `recordatorio`
--      = dps_recordatorio_json(): {activo, dias, hora '10:00', puede_editar
--      (dps_es_configurador()), proximo: null when off, else {fecha (the
--      next plan date whose send day has not passed: today counts until
--      10:00 Caracas), sale (fecha - dias), personas (with e-mail),
--      con_botones (any pendiente), no_pueden, sin_correo}, ultimo: {fecha
--      (Caracas), enviados, total} of the last reminder day or null}.
--      For configurators: dps_recordatorio_guardar(activo, dias) -> the same
--      JSON. 'sin_autoridad' (42501) first, then 'valor_invalido' (activo
--      NULL) and 'dias_invalidos' (NULL or outside 1-7), both 22023.
--   5. Service_role only: dps_recordatorios_encolar() -> {activo, fecha,
--      dias, personas, encolados}: queues today's reminders (fecha =
--      ninos_hoy() + dias) unless off. The app sends them through the T16b
--      drain (same lease, daily cap, retries and idempotency key).
--   6. Internal (no EXECUTE for PUBLIC, anon or authenticated):
--      dps_recordatorio_destinatarios(date), dps_recordatorio_equipo(uuid),
--      dps_recordatorio_resumen(date), dps_recordatorio_json(),
--      dps_recordatorios_encolar_fecha(date, integer).
--
-- Suite: supabase/tests/dps-avisos-recordatorio.test.sql.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_recordatorios_encolar(), public.dps_recordatorios_encolar_fecha(date, integer),
--     public.dps_recordatorio_guardar(boolean, integer), public.dps_recordatorio_json(),
--     public.dps_recordatorio_resumen(date), public.dps_recordatorio_equipo(uuid),
--     public.dps_recordatorio_destinatarios(date);
--   re-run dps_config_leer from 20261108201000;
--   DELETE FROM public.dps_avisos_correos WHERE tipo = 'recordatorio'; then
--   re-add dps_avisos_correos_forma_check from 20261114100000;
--   ALTER TABLE public.dps_config DROP COLUMN IF EXISTS recordatorio_dias,
--     DROP COLUMN IF EXISTS recordatorio_activo;

-- ── 1. tables ────────────────────────────────────────────────────────

ALTER TABLE public.dps_config ADD COLUMN IF NOT EXISTS recordatorio_activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.dps_config ADD COLUMN IF NOT EXISTS recordatorio_dias integer NOT NULL DEFAULT 2;
ALTER TABLE public.dps_config DROP CONSTRAINT IF EXISTS dps_config_recordatorio_dias_check;
ALTER TABLE public.dps_config
  ADD CONSTRAINT dps_config_recordatorio_dias_check CHECK (recordatorio_dias BETWEEN 1 AND 7);
COMMENT ON COLUMN public.dps_config.recordatorio_activo IS
  'T16c (S14.3): the reminder e-mail before each plan date is sent.';
COMMENT ON COLUMN public.dps_config.recordatorio_dias IS
  'T16c (S14.3): how many days before the plan date the reminder leaves (1-7), at 10:00 Caracas.';

ALTER TABLE public.dps_avisos_correos DROP CONSTRAINT IF EXISTS dps_avisos_correos_forma_check;
ALTER TABLE public.dps_avisos_correos
  ADD CONSTRAINT dps_avisos_correos_forma_check
  CHECK (char_length(clave) BETWEEN 1 AND 200 AND tipo IN ('avisos', 'no_puede', 'recordatorio') AND jsonb_typeof(datos) = 'object'
         AND (email IS NULL OR char_length(email) <= 254) AND (nombre IS NULL OR char_length(nombre) <= 120)
         AND (responder_nombre IS NULL OR char_length(responder_nombre) <= 200)
         AND (responder_email IS NULL OR char_length(responder_email) <= 254)
         AND intentos >= 0 AND (error IS NULL OR char_length(error) <= 500));
CREATE INDEX IF NOT EXISTS dps_avisos_correos_recordatorio_idx
  ON public.dps_avisos_correos (created_at) WHERE tipo = 'recordatorio';

-- ── 2. internal helpers ──────────────────────────────────────────────

-- The notices that get the reminder of one date (with or without e-mail).
CREATE OR REPLACE FUNCTION public.dps_recordatorio_destinatarios(p_fecha date)
RETURNS TABLE (persona_id uuid, email text, aviso_id uuid, plan_id uuid, estado text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT v.persona_id, public.dps_correo_valido(u.email), v.id, v.plan_id, v.estado
    FROM public.dps_avisos v
    JOIN public.dps_planes p ON p.id = v.plan_id
    JOIN public.usuarios u ON u.id = v.persona_id
   WHERE p.fecha = p_fecha AND v.fecha = p.fecha
     AND NOT v.quitado AND v.estado IN ('confirmo', 'pendiente');
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorio_destinatarios(date) FROM PUBLIC, anon, authenticated, service_role;

-- «Quiénes sirven contigo»: counts only, never a name.
CREATE OR REPLACE FUNCTION public.dps_recordatorio_equipo(p_plan_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH e AS (
    SELECT v.estado, coalesce(nullif(v.roles -> 0 ->> 'direccion', ''), nullif(v.roles -> 0 ->> 'equipo', ''), 'Otros') AS direccion
      FROM public.dps_avisos v
     WHERE v.plan_id = p_plan_id AND NOT v.quitado AND v.estado <> 'no_puede'
  )
  SELECT jsonb_build_object(
           'personas', (SELECT count(*) FROM e),
           'confirmaron', (SELECT count(*) FROM e WHERE e.estado = 'confirmo'),
           'direcciones', coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', d.direccion, 'personas', d.n) ORDER BY d.direccion)
                                      FROM (SELECT e.direccion, count(*) AS n FROM e GROUP BY e.direccion) d), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorio_equipo(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Who the reminder of one date reaches, per person (07: «N personas»).
CREATE OR REPLACE FUNCTION public.dps_recordatorio_resumen(p_fecha date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH d AS (
    SELECT x.persona_id, bool_or(x.email IS NOT NULL) AS con_correo, bool_or(x.estado = 'pendiente') AS pendiente
      FROM public.dps_recordatorio_destinatarios(p_fecha) x
     GROUP BY x.persona_id
  )
  SELECT jsonb_build_object(
           'personas', (SELECT count(*) FROM d WHERE d.con_correo),
           'con_botones', (SELECT count(*) FROM d WHERE d.con_correo AND d.pendiente),
           'sin_correo', (SELECT count(*) FROM d WHERE NOT d.con_correo),
           -- Said «No puedo» and get nothing else that day.
           'no_pueden', (SELECT count(DISTINCT v.persona_id)
                           FROM public.dps_avisos v
                           JOIN public.dps_planes p ON p.id = v.plan_id
                          WHERE p.fecha = p_fecha AND v.fecha = p.fecha AND NOT v.quitado AND v.estado = 'no_puede'
                            AND NOT EXISTS (SELECT 1 FROM d WHERE d.persona_id = v.persona_id)));
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorio_resumen(date) FROM PUBLIC, anon, authenticated, service_role;

-- What Configuración shows (07).
CREATE OR REPLACE FUNCTION public.dps_recordatorio_json()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_activo boolean;
  v_dias integer;
  v_desde date;
  v_fecha date;
  v_proximo jsonb;
  v_ultimo jsonb;
BEGIN
  SELECT c.recordatorio_activo, c.recordatorio_dias INTO v_activo, v_dias FROM public.dps_config c WHERE c.id;
  v_activo := coalesce(v_activo, true);
  v_dias := coalesce(v_dias, 2);
  IF v_activo THEN
    -- Today's send counts until the 10:00 run.
    v_desde := public.ninos_hoy() + v_dias
               + CASE WHEN (now() AT TIME ZONE 'America/Caracas')::time >= TIME '10:00' THEN 1 ELSE 0 END;
    SELECT min(p.fecha) INTO v_fecha FROM public.dps_planes p WHERE p.fecha >= v_desde;
    IF v_fecha IS NOT NULL THEN
      v_proximo := jsonb_build_object('fecha', v_fecha, 'sale', v_fecha - v_dias) || public.dps_recordatorio_resumen(v_fecha);
    END IF;
  END IF;
  SELECT jsonb_build_object('fecha', u.dia, 'enviados', u.enviados, 'total', u.total)
    INTO v_ultimo
    FROM (SELECT (c.created_at AT TIME ZONE 'America/Caracas')::date AS dia,
                 count(*) FILTER (WHERE c.estado = 'enviado') AS enviados, count(*) AS total
            FROM public.dps_avisos_correos c
           WHERE c.tipo = 'recordatorio'
           GROUP BY 1
           ORDER BY 1 DESC
           LIMIT 1) u;
  RETURN jsonb_build_object('activo', v_activo, 'dias', v_dias, 'hora', '10:00',
                            'puede_editar', public.dps_es_configurador(),
                            'proximo', v_proximo, 'ultimo', v_ultimo);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorio_json() FROM PUBLIC, anon, authenticated, service_role;

-- Queues the reminders of one plan date: one row per person with an e-mail
-- (all their notices of that day); an existing row for that person and date
-- is left alone. Returns {fecha, dias, personas, encolados}.
CREATE OR REPLACE FUNCTION public.dps_recordatorios_encolar_fecha(p_fecha date, p_dias integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF p_fecha IS NULL OR p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'dias_invalidos' USING ERRCODE = '22023';
  END IF;
  WITH d AS (
    SELECT x.* FROM public.dps_recordatorio_destinatarios(p_fecha) x WHERE x.email IS NOT NULL
  ), b AS (
    SELECT d.persona_id, d.email, v.enviado_por, v.enviado_at,
           public.dps_aviso_json(v.id)
             || jsonb_build_object(
                  'aviso_id', v.id, 'version', v.version, 'confirmar', v.estado = 'pendiente',
                  'orden', coalesce((SELECT jsonb_agg(public.dps_orden_item_json(o.id) ORDER BY o.posicion)
                                       FROM public.dps_orden_items o WHERE o.plan_id = v.plan_id), '[]'::jsonb),
                  'equipo', public.dps_recordatorio_equipo(v.plan_id)) AS bloque,
           (p.tipo = 'domingo') AS domingo, p.titulo, v.id
      FROM d
      JOIN public.dps_avisos v ON v.id = d.aviso_id
      JOIN public.dps_planes p ON p.id = v.plan_id
  ), personas AS (
    SELECT b.persona_id, min(b.email) AS email,
           jsonb_agg(b.bloque ORDER BY b.domingo DESC, b.titulo NULLS FIRST, b.id) AS bloques,
           count(*)::int AS avisos,
           (array_agg(b.enviado_por ORDER BY b.enviado_at DESC, b.id) FILTER (WHERE b.enviado_por IS NOT NULL))[1] AS remitente
      FROM b GROUP BY b.persona_id
  ), filas AS (
    INSERT INTO public.dps_avisos_correos AS c -- noqa: insert-into
      (clave, tipo, persona_id, email, nombre, responder_nombre, responder_email, datos, vence, estado)
    SELECT 'recordatorio:' || pe.persona_id || ':' || p_fecha, 'recordatorio', pe.persona_id, pe.email,
           left(nullif(split_part(btrim(u.nombre), ' ', 1), ''), 120),
           left(nullif(concat_ws(' ', btrim(r.nombre), btrim(r.apellido)), ''), 200), public.dps_correo_valido(r.email),
           jsonb_build_object('bloques', pe.bloques, 'avisos', pe.avisos, 'dias', p_dias), p_fecha, 'pendiente'
      FROM personas pe
      JOIN public.usuarios u ON u.id = pe.persona_id
      LEFT JOIN public.usuarios r ON r.id = pe.remitente
    ON CONFLICT ON CONSTRAINT dps_avisos_correos_clave_key DO NOTHING
    RETURNING c.id
  )
  SELECT jsonb_build_object('fecha', p_fecha, 'dias', p_dias,
                            'personas', (SELECT count(*) FROM personas), 'encolados', (SELECT count(*) FROM filas))
    INTO v_resultado;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorios_encolar_fecha(date, integer) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. planner and configurator ──────────────────────────────────────

-- As 20261108201000 plus `recordatorio` (T16c).
CREATE OR REPLACE FUNCTION public.dps_config_leer()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cfg public.dps_config%ROWTYPE;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT c.* INTO v_cfg FROM public.dps_config c WHERE c.id;
  RETURN jsonb_build_object(
    'horarios', coalesce(v_cfg.horarios, '["09:15", "11:15"]'::jsonb),
    'llegada', to_char(coalesce(v_cfg.llegada, '07:00'::time), 'HH24:MI'),
    'planificadores', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'persona_id', p.persona_id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
                          'agregado_at', p.created_at) ORDER BY u.nombre, u.apellido), '[]'::jsonb)
                         FROM public.dps_planificadores p JOIN public.usuarios u ON u.id = p.persona_id),
    'pasan_asistencia', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                            'equipo_id', d.equipo_id, 'equipo', d.label, 'ruta', d.ruta, 'profundidad', d.profundidad,
                            'habilitado', public.dps_asistencia_habilitada(d.equipo_id),
                            'explicito', pa.habilitado) ORDER BY d.ruta), '[]'::jsonb)
                           FROM public.dps_equipos() d
                           LEFT JOIN public.dps_pasan_asistencia pa ON pa.equipo_id = d.equipo_id),
    'recordatorio', public.dps_recordatorio_json());
END;
$$;
REVOKE ALL ON FUNCTION public.dps_config_leer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_config_leer() TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_recordatorio_guardar(p_activo boolean, p_dias integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_configurador();
BEGIN
  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'dias_invalidos' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_config AS c (id, recordatorio_activo, recordatorio_dias, updated_by) -- noqa: insert-into
  VALUES (true, p_activo, p_dias, v_actor)
  ON CONFLICT (id) DO UPDATE
     SET recordatorio_activo = excluded.recordatorio_activo, recordatorio_dias = excluded.recordatorio_dias,
         updated_at = now(), updated_by = excluded.updated_by;
  -- A later statement: it reads the row as just written.
  RETURN public.dps_recordatorio_json();
END;
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorio_guardar(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_recordatorio_guardar(boolean, integer) TO authenticated;

-- ── 4. the daily job (service_role) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_recordatorios_encolar()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_activo boolean;
  v_dias integer;
BEGIN
  SELECT c.recordatorio_activo, c.recordatorio_dias INTO v_activo, v_dias FROM public.dps_config c WHERE c.id;
  v_activo := coalesce(v_activo, true);
  v_dias := coalesce(v_dias, 2);
  IF NOT v_activo THEN
    RETURN jsonb_build_object('activo', false, 'fecha', NULL, 'dias', v_dias, 'personas', 0, 'encolados', 0);
  END IF;
  RETURN jsonb_build_object('activo', true) || public.dps_recordatorios_encolar_fecha(public.ninos_hoy() + v_dias, v_dias);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_recordatorios_encolar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_recordatorios_encolar() TO service_role;
