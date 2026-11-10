-- T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — minimum of
-- inscritos to open an edición; when the inscription closes below it, the
-- director suspends and moves the date (every approved inscrito confirms
-- «Mantener mi lugar» / «Ya no puedo» before the new cierre), or the
-- director / the taller's coordinador opens it anyway («Abrir igual»).
--
-- User decisions (Log L2, L6, verbatim): S9 "tenemos inscritos pero no
-- llegamos al minimo y se suspende para una nueva fecha"; S15 "quien no
-- responde no sigue inscrito, alli se deberia contactar manualmente o
-- llamar para confirmar"; S16 "si solo el director y el coordinador del
-- taller". Parent decision (T8a, approved artboards 13/14): only aprobadas
-- count toward the minimum and only aprobadas must confirm; pendientes get
-- an informative notice and keep waiting for approval.
--
-- WHAT
--   A. talleres.minimo_inscritos (NULL = no minimum).
--      taller_ediciones: suspendida_por/en, suspension_motivo,
--      suspension_mensaje, suspension_fecha_anterior, abierta_igual_por/en,
--      abierta_igual_motivo.
--      taller_inscripciones: confirmacion_estado (pendiente | confirmada |
--      no_puede), confirmacion_limite, confirmada_por/en,
--      confirmacion_canal (app | telefono), confirmacion_motivo.
--   B. talleres_reprogramar_edicion_mover(): the date move of
--      talleres_reprogramar_edicion (20260928150000) extracted unchanged
--      into an internal function; talleres_reprogramar_edicion is recreated
--      on it with the same checks, errors and result. The suspension reuses
--      the same move instead of a copy.
--   C. talleres_minimo_aprobados(edición) and talleres_edicion_bajo_minimo
--      (edición), internal. Unit: one taller_inscripciones row, exactly as
--      talleres_cupo_edicion_calculo counts (a couple is one row and one
--      unit, «parejas» in the cupo line), but only estado 'aprobado'.
--      Below minimum = minimo set, cierre_inscripcion <= talleres_hoy(),
--      not past fecha_fin, not cerrada_en, not borrador/cancelado, not
--      abierta igual, aprobadas < minimo. A suspension moves the cierre to
--      the future, so the edición leaves this state by itself and comes
--      back to it only if the new cierre passes still below the minimum.
--   D. RPCs for authenticated:
--        talleres_suspender_edicion(edición, nueva fecha, nuevo cierre,
--          motivo, mensaje)   director.write | admin.manage (same as
--          reprogramar). Moves the dates, asks every aprobada to confirm
--          before the new cierre, writes one avisos_persona row per
--          principal and companero, returns who has an email.
--        talleres_confirmar_cambio_fecha(inscripción, 'mantener' |
--          'no_puedo', motivo)   the principal or companero only, before
--          the limit. 'no_puedo' leaves the edición (estado 'retirado').
--        talleres_confirmar_por_telefono(inscripción)   coordinator.write |
--          director.write | admin.manage scoped to the edición's node.
--        talleres_abrir_igual(edición, motivo)   ONLY director.write or
--          coordinator.write scoped to the edición's node (S16).
--        talleres_minimo_panel(edición)   counters, the call list and what
--          the caller may do, for the edición page.
--        talleres_mis_cambios_de_fecha()   the caller's pending confirmations.
--   E. talleres_cerrar_confirmaciones_vencidas() (service_role): every
--      aprobada still 'pendiente' after its limit leaves the edición with
--      motivo 'Sin confirmar el cambio de fecha' (S15). Daily pg_cron job
--      where pg_cron is installed (a no-op elsewhere).
--
-- 'retirado' is written exactly as talleres_resolver_solicitud_retiro
-- (20260824000001) writes it: SET estado = 'retirado', version = version + 1
-- (updated_at by its trigger; the cupo gate and trg_taller_inscripciones_
-- cancela_invitaciones run as for any other withdrawal). The reason goes to
-- the new confirmacion_motivo column.
--
-- Blast radius: additive columns (all NULLable, no default rewrite), one
-- function replaced with the same signature and behaviour
-- (talleres_reprogramar_edicion), nine new functions, one pg_cron job.
-- No row changes when applied.
--
-- ROLLBACK (in this order):
--   select cron.unschedule('talleres_confirmaciones_vencidas');  -- where pg_cron exists
--   DROP FUNCTION IF EXISTS public.talleres_cerrar_confirmaciones_vencidas(),
--     public.talleres_mis_cambios_de_fecha(), public.talleres_minimo_panel(uuid),
--     public.talleres_abrir_igual(uuid, text), public.talleres_confirmar_por_telefono(uuid),
--     public.talleres_confirmar_cambio_fecha(uuid, text, text),
--     public.talleres_suspender_edicion(uuid, date, date, text, text),
--     public.talleres_edicion_bajo_minimo(uuid), public.talleres_minimo_aprobados(uuid),
--     public.talleres_fin_del_dia(date);
--   re-run part B of 20260928150000_talleres_reprogramar_edicion.sql, then
--   DROP FUNCTION IF EXISTS public.talleres_reprogramar_edicion_mover(public.taller_ediciones, date, date, text);
--   ALTER TABLE public.taller_inscripciones DROP COLUMN confirmacion_estado, DROP COLUMN confirmacion_limite,
--     DROP COLUMN confirmada_por, DROP COLUMN confirmada_en, DROP COLUMN confirmacion_canal,
--     DROP COLUMN confirmacion_motivo;
--   ALTER TABLE public.taller_ediciones DROP COLUMN suspendida_por, DROP COLUMN suspendida_en,
--     DROP COLUMN suspension_motivo, DROP COLUMN suspension_mensaje, DROP COLUMN suspension_fecha_anterior,
--     DROP COLUMN abierta_igual_por, DROP COLUMN abierta_igual_en, DROP COLUMN abierta_igual_motivo;
--   ALTER TABLE public.talleres DROP COLUMN minimo_inscritos;

-- ===========================================================================
-- A. Columns
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN minimo_inscritos integer NULL
    CONSTRAINT talleres_minimo_inscritos_check CHECK (minimo_inscritos IS NULL OR minimo_inscritos >= 1);

COMMENT ON COLUMN public.talleres.minimo_inscritos IS
  'T8a — approved inscriptions (units: one row, a couple counts once) an edición needs at its cierre to start. NULL: no minimum, never below it.';

ALTER TABLE public.taller_ediciones
  ADD COLUMN suspendida_por uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN suspendida_en timestamptz NULL,
  ADD COLUMN suspension_motivo text NULL
    CONSTRAINT taller_ediciones_suspension_motivo_check CHECK (suspension_motivo IS NULL OR length(suspension_motivo) <= 300),
  ADD COLUMN suspension_mensaje text NULL
    CONSTRAINT taller_ediciones_suspension_mensaje_check CHECK (suspension_mensaje IS NULL OR length(suspension_mensaje) <= 600),
  ADD COLUMN suspension_fecha_anterior date NULL,
  ADD COLUMN abierta_igual_por uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN abierta_igual_en timestamptz NULL,
  ADD COLUMN abierta_igual_motivo text NULL
    CONSTRAINT taller_ediciones_abierta_igual_motivo_check CHECK (abierta_igual_motivo IS NULL OR length(abierta_igual_motivo) <= 300);

COMMENT ON COLUMN public.taller_ediciones.suspendida_en IS
  'T8a — last time talleres_suspender_edicion moved this edición for not reaching the minimum. NULL: never suspended.';
COMMENT ON COLUMN public.taller_ediciones.suspension_fecha_anterior IS
  'fecha_inicio before the last suspension (shown as «Antes» in the member notice).';
COMMENT ON COLUMN public.taller_ediciones.suspension_mensaje IS
  'Message for the inscritos written by whoever suspended; goes into the notice.';
COMMENT ON COLUMN public.taller_ediciones.abierta_igual_en IS
  'T8a — when the director or the taller coordinator decided to start below the minimum (talleres_abrir_igual). Once set the edición is never below minimum again.';

ALTER TABLE public.taller_inscripciones
  ADD COLUMN confirmacion_estado text NULL
    CONSTRAINT taller_inscripciones_confirmacion_estado_check
      CHECK (confirmacion_estado IS NULL OR confirmacion_estado IN ('pendiente', 'confirmada', 'no_puede')),
  ADD COLUMN confirmacion_limite date NULL,
  ADD COLUMN confirmada_por uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN confirmada_en timestamptz NULL,
  ADD COLUMN confirmacion_canal text NULL
    CONSTRAINT taller_inscripciones_confirmacion_canal_check
      CHECK (confirmacion_canal IS NULL OR confirmacion_canal IN ('app', 'telefono')),
  ADD COLUMN confirmacion_motivo text NULL
    CONSTRAINT taller_inscripciones_confirmacion_motivo_check
      CHECK (confirmacion_motivo IS NULL OR length(confirmacion_motivo) <= 300),
  ADD CONSTRAINT taller_inscripciones_confirmacion_limite_check
    CHECK (confirmacion_estado IS NULL OR confirmacion_limite IS NOT NULL);

COMMENT ON COLUMN public.taller_inscripciones.confirmacion_estado IS
  'T8a — answer to a date change after a suspension: pendiente (asked, no answer), confirmada (keeps the place, in the app or by phone), no_puede (left the edición). A pendiente row whose estado is retirado ran out of time (talleres_cerrar_confirmaciones_vencidas). NULL: never asked.';
COMMENT ON COLUMN public.taller_inscripciones.confirmacion_limite IS
  'Last day to answer: the new cierre_inscripcion. After it a pendiente leaves the edición.';
COMMENT ON COLUMN public.taller_inscripciones.confirmacion_canal IS
  'app: the principal or companero answered; telefono: a coordinator marked it after a call.';
COMMENT ON COLUMN public.taller_inscripciones.confirmacion_motivo IS
  'Why the inscription left after a date change: the member''s own words, or ''Sin confirmar el cambio de fecha''.';

CREATE INDEX taller_inscripciones_confirmacion_pendiente_idx
  ON public.taller_inscripciones (confirmacion_limite)
  WHERE confirmacion_estado = 'pendiente';

-- ===========================================================================
-- B. talleres_reprogramar_edicion_mover(): the move, shared
-- ===========================================================================

-- Body moved verbatim from talleres_reprogramar_edicion (20260928150000,
-- part B) from "IF p_fecha_inicio IS NULL" to the RETURN. Internal: no
-- authority check, callers check it first. Not granted to anyone.
CREATE OR REPLACE FUNCTION public.talleres_reprogramar_edicion_mover(
  p_edicion public.taller_ediciones,
  p_fecha_inicio date,
  p_cierre_inscripcion date,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_edicion                public.taller_ediciones%ROWTYPE := p_edicion;
  p_edicion_id             uuid := p_edicion.id;
  v_persona_id             uuid;
  v_delta                  integer;
  v_fecha_inicio_final     date;
  v_fecha_fin_final        date;
  v_cierre_final           date;
  v_clases_movidas         integer := 0;
  v_estado_final           text;
BEGIN
  IF p_fecha_inicio IS NULL THEN
    v_fecha_inicio_final := v_edicion.fecha_inicio;
    v_fecha_fin_final := v_edicion.fecha_fin;
    v_cierre_final := p_cierre_inscripcion;
  ELSE
    v_delta := p_fecha_inicio - v_edicion.fecha_inicio;

    IF EXISTS (
      SELECT 1
        FROM public.taller_sesiones s
        JOIN public.taller_grupos g ON g.id = s.grupo_id
        JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
       WHERE c.taller_id = p_edicion_id
         AND s.numero = 1
         AND s.estado = 'cerrada'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EMPEZO' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.taller_sesiones s
       SET fecha_programada = s.fecha_programada + v_delta
      FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
     WHERE s.grupo_id = g.id
       AND g.cohorte_id = c.id
       AND c.taller_id = p_edicion_id
       AND s.estado NOT IN ('cerrada', 'cancelada')
       AND s.fecha_programada >= v_edicion.fecha_inicio;

    GET DIAGNOSTICS v_clases_movidas = ROW_COUNT;

    v_fecha_inicio_final := p_fecha_inicio;
    v_fecha_fin_final := v_edicion.fecha_fin + v_delta;
    v_cierre_final := COALESCE(p_cierre_inscripcion, v_edicion.cierre_inscripcion + v_delta);

    UPDATE public.talleres_crecimiento_cohortes
       SET started_at = v_fecha_inicio_final::timestamptz
     WHERE taller_id = p_edicion_id;
  END IF;

  IF v_cierre_final > v_fecha_fin_final THEN
    RAISE EXCEPTION 'CIERRE_POSTERIOR_AL_FIN' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_persona_id FROM public.usuarios WHERE auth_id = auth.uid();

  UPDATE public.taller_ediciones
     SET fecha_inicio = v_fecha_inicio_final,
         fecha_fin = v_fecha_fin_final,
         cierre_inscripcion = v_cierre_final,
         reprogramada_por = v_persona_id,
         reprogramada_en = now(),
         reprogramacion_motivo = NULLIF(btrim(p_motivo), '')
   WHERE id = p_edicion_id;

  PERFORM public.talleres_refrescar_estados(v_edicion.taller_id);

  SELECT public.talleres_estado_efectivo(te) INTO v_estado_final
    FROM public.taller_ediciones te
   WHERE te.id = p_edicion_id;

  RETURN jsonb_build_object(
    'edicion_id', p_edicion_id,
    'fecha_inicio', v_fecha_inicio_final,
    'fecha_fin', v_fecha_fin_final,
    'cierre_inscripcion', v_cierre_final,
    'estado', v_estado_final,
    'clases_movidas', v_clases_movidas
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_reprogramar_edicion_mover(public.taller_ediciones, date, date, text) IS
  'T8a — the date move of talleres_reprogramar_edicion (extend the cierre only, or move fecha_inicio shifting every clase not cerrada/cancelada), shared with talleres_suspender_edicion. Internal: no authority check; callers check it first. Raises EDICION_YA_EMPEZO / CIERRE_POSTERIOR_AL_FIN.';

REVOKE ALL ON FUNCTION public.talleres_reprogramar_edicion_mover(public.taller_ediciones, date, date, text) FROM PUBLIC, anon, authenticated;

-- Same signature, checks, errors and result as 20260928150000; the move is
-- now the shared function above.
CREATE OR REPLACE FUNCTION public.talleres_reprogramar_edicion(
  p_edicion_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_cierre_inscripcion date DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edicion   public.taller_ediciones%ROWTYPE;
  v_equipo_id uuid;
BEGIN
  SELECT * INTO v_edicion
  FROM public.taller_ediciones
  WHERE id = p_edicion_id;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  IF NOT FOUND OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) IN ('cancelado', 'cerrado') THEN
    RAISE EXCEPTION 'EDICION_NO_REPROGRAMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF p_fecha_inicio IS NULL AND p_cierre_inscripcion IS NULL THEN
    RAISE EXCEPTION 'NADA_QUE_CAMBIAR' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.talleres_reprogramar_edicion_mover(v_edicion, p_fecha_inicio, p_cierre_inscripcion, p_motivo);
END;
$function$;

COMMENT ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) IS
  'T7b (talleres-temporadas-y-ediciones, paso 6) - extends an edicion''s cierre_inscripcion only (p_fecha_inicio NULL), or moves its fecha_inicio (shifting every taller_sesiones row not cerrada/cancelada by the same delta, recomputing fecha_fin/cierre_inscripcion). Refuses a cancelado/cerrado (effective) edicion, both params NULL, a cierre past fecha_fin, or moving a start whose primera clase is already cerrada. La temporada (temporada_id) never changes here. Authority mirrors talleres_crear_edicion (director.write|admin.manage scoped to the edicion''s own node). T8a: the move itself lives in talleres_reprogramar_edicion_mover.';

REVOKE ALL ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_reprogramar_edicion(uuid, date, date, text) TO authenticated, postgres, service_role;

-- ===========================================================================
-- C. Minimum helpers (internal)
-- ===========================================================================

-- Approved units of an edición: one taller_inscripciones row each (a couple
-- is one row), joined through the cohorte exactly as
-- talleres_cupo_edicion_calculo joins it.
CREATE OR REPLACE FUNCTION public.talleres_minimo_aprobados(p_edicion_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT count(*)::integer
    FROM public.taller_inscripciones i
    JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
   WHERE c.taller_id = p_edicion_id
     AND i.estado = 'aprobado';
$function$;

COMMENT ON FUNCTION public.talleres_minimo_aprobados(uuid) IS
  'T8a — approved inscriptions of an edición, in the cupo unit (one row; a couple counts once). Internal.';

REVOKE ALL ON FUNCTION public.talleres_minimo_aprobados(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.talleres_edicion_bajo_minimo(p_edicion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT t.minimo_inscritos IS NOT NULL
       AND e.cerrada_en IS NULL
       AND e.estado NOT IN ('borrador', 'cancelado')
       AND e.abierta_igual_en IS NULL
       AND e.cierre_inscripcion IS NOT NULL
       AND e.cierre_inscripcion <= public.talleres_hoy()
       AND (e.fecha_fin IS NULL OR public.talleres_hoy() <= e.fecha_fin)
       AND public.talleres_minimo_aprobados(e.id) < t.minimo_inscritos
      FROM public.taller_ediciones e
      JOIN public.talleres t ON t.id = e.taller_id
     WHERE e.id = p_edicion_id
  ), false);
$function$;

COMMENT ON FUNCTION public.talleres_edicion_bajo_minimo(uuid) IS
  'T8a — true when the taller has a minimum, the edición''s inscription already closed (cierre <= talleres_hoy()), it has not ended, is not closed/borrador/cancelado, nobody opened it anyway, and its approved units are below the minimum. Internal.';

REVOKE ALL ON FUNCTION public.talleres_edicion_bajo_minimo(uuid) FROM PUBLIC, anon, authenticated;

-- End of a day in the church's time zone (the same setting talleres_hoy()
-- reads): a notice about a deadline stays visible through that whole day.
CREATE OR REPLACE FUNCTION public.talleres_fin_del_dia(p_dia date)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT ((p_dia + 1)::timestamp AT TIME ZONE COALESCE(NULLIF(current_setting('app.zona_horaria', true), ''), 'America/Caracas'));
$function$;

REVOKE ALL ON FUNCTION public.talleres_fin_del_dia(date) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- D1. talleres_suspender_edicion()
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_suspender_edicion(
  p_edicion_id uuid,
  p_nueva_fecha_inicio date,
  p_nuevo_cierre date DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_mensaje text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_edicion     public.taller_ediciones%ROWTYPE;
  v_equipo_id   uuid;
  v_actor_id    uuid;
  v_hoy         date := public.talleres_hoy();
  v_cierre      date;
  v_motivo      text := NULLIF(btrim(p_motivo), '');
  v_mensaje     text := NULLIF(btrim(p_mensaje), '');
  v_movido      jsonb;
  v_taller      text;
  v_por_confirmar integer;
  v_informadas  integer;
  v_avisos      jsonb;
BEGIN
  SELECT * INTO v_edicion
    FROM public.taller_ediciones
   WHERE id = p_edicion_id
     FOR UPDATE;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  IF v_edicion.id IS NULL OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  -- A date-derived 'cerrado' (between the cierre and the first clase) is
  -- exactly where a suspension happens, so only a real close or a
  -- cancellation refuse here.
  IF v_edicion.estado = 'cancelado' OR v_edicion.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_NO_REPROGRAMABLE' USING ERRCODE = 'P0001';
  END IF;

  IF p_nueva_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'FECHA_INICIO_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.talleres_edicion_bajo_minimo(p_edicion_id) THEN
    RAISE EXCEPTION 'EDICION_NO_BAJO_MINIMO' USING ERRCODE = 'P0001';
  END IF;

  IF p_nueva_fecha_inicio <= v_hoy THEN
    RAISE EXCEPTION 'NUEVA_FECHA_NO_FUTURA' USING ERRCODE = 'P0001';
  END IF;

  v_cierre := COALESCE(p_nuevo_cierre, v_edicion.cierre_inscripcion + (p_nueva_fecha_inicio - v_edicion.fecha_inicio));
  -- Everyone needs at least one whole day to answer, and an edición whose
  -- new cierre is today would be below the minimum again at once.
  IF v_cierre <= v_hoy OR v_cierre > p_nueva_fecha_inicio THEN
    RAISE EXCEPTION 'CIERRE_FUERA_DE_RANGO' USING ERRCODE = 'P0001';
  END IF;

  IF (v_motivo IS NOT NULL AND length(v_motivo) > 300) OR (v_mensaje IS NOT NULL AND length(v_mensaje) > 600) THEN
    RAISE EXCEPTION 'TEXTO_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;

  v_movido := public.talleres_reprogramar_edicion_mover(v_edicion, p_nueva_fecha_inicio, v_cierre, v_motivo);

  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  UPDATE public.taller_ediciones
     SET suspendida_por = v_actor_id,
         suspendida_en = now(),
         suspension_motivo = v_motivo,
         suspension_mensaje = v_mensaje,
         suspension_fecha_anterior = v_edicion.fecha_inicio
   WHERE id = p_edicion_id;

  SELECT t.nombre INTO v_taller
    FROM public.talleres t
   WHERE t.id = v_edicion.taller_id;

  -- Every aprobada must confirm again before the new cierre, even if it
  -- answered an earlier suspension.
  UPDATE public.taller_inscripciones i
     SET confirmacion_estado = 'pendiente',
         confirmacion_limite = v_cierre,
         confirmada_por = NULL,
         confirmada_en = NULL,
         confirmacion_canal = NULL,
         confirmacion_motivo = NULL
    FROM public.talleres_crecimiento_cohortes c
   WHERE c.id = i.cohorte_id
     AND c.taller_id = p_edicion_id
     AND i.estado = 'aprobado';
  GET DIAGNOSTICS v_por_confirmar = ROW_COUNT;

  -- Older date-change notices of this edición are no longer true.
  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo IN ('taller_cambio_fecha', 'taller_cambio_fecha_info')
     AND datos ->> 'edicion_id' = p_edicion_id::text
     AND (expira_at IS NULL OR expira_at > now());

  WITH destinatarios AS (
    SELECT i.id AS inscripcion_id, i.estado, p.persona_id
      FROM public.taller_inscripciones i
      JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
      CROSS JOIN LATERAL (VALUES (i.persona_principal_id), (i.companero_id)) AS p(persona_id)
     WHERE c.taller_id = p_edicion_id
       AND i.estado IN ('aprobado', 'pendiente')
       AND p.persona_id IS NOT NULL
  ), insertados AS (
    INSERT INTO public.avisos_persona (persona_id, tipo, titulo, cuerpo, url, datos, expira_at)
    SELECT d.persona_id,
           CASE WHEN d.estado = 'aprobado' THEN 'taller_cambio_fecha' ELSE 'taller_cambio_fecha_info' END,
           'Tu taller cambió de fecha',
           left(
             concat_ws(' ',
               v_mensaje,
               format('%s ahora empieza el %s.', v_taller, to_char(p_nueva_fecha_inicio, 'DD/MM/YYYY')),
               CASE WHEN d.estado = 'aprobado'
                    THEN format('Confirma antes del %s para mantener tu lugar.', to_char(v_cierre, 'DD/MM/YYYY'))
                    ELSE 'Tu solicitud sigue esperando aprobación.' END),
             1000),
           '/talleres/mi-recorrido',
           jsonb_build_object(
             'inscripcion_id', d.inscripcion_id,
             'edicion_id', p_edicion_id,
             'fecha_inicio', p_nueva_fecha_inicio,
             'fecha_anterior', v_edicion.fecha_inicio,
             'limite', CASE WHEN d.estado = 'aprobado' THEN v_cierre END),
           public.talleres_fin_del_dia(CASE WHEN d.estado = 'aprobado' THEN v_cierre ELSE p_nueva_fecha_inicio END)
      FROM destinatarios d
    RETURNING persona_id, tipo
  )
  SELECT count(*) FILTER (WHERE x.tipo = 'taller_cambio_fecha_info'),
         COALESCE(jsonb_agg(jsonb_build_object(
           'persona_id', x.persona_id,
           'nombre', u.nombre,
           'email', u.email,
           'confirmar', x.tipo = 'taller_cambio_fecha'
         ) ORDER BY u.nombre) FILTER (WHERE u.email IS NOT NULL AND btrim(u.email) <> ''), '[]'::jsonb)
    INTO v_informadas, v_avisos
    FROM insertados x
    JOIN public.usuarios u ON u.id = x.persona_id;

  RETURN v_movido || jsonb_build_object(
    'taller_nombre', v_taller,
    'confirmacion_limite', v_cierre,
    'por_confirmar', v_por_confirmar,
    'avisos_informativos', v_informadas,
    'correos', v_avisos
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_suspender_edicion(uuid, date, date, text, text) IS
  'T8a (S9) — an edición below its minimum moves to a new start (the talleres_reprogramar_edicion move; p_nuevo_cierre NULL keeps the taller offset), every aprobada must confirm before the new cierre (confirmacion_estado pendiente), and each principal and companero gets a taller_cambio_fecha notice (pendientes: taller_cambio_fecha_info). Authority as talleres_reprogramar_edicion (42501). Refuses EDICION_NO_REPROGRAMABLE (cancelled or closed), FECHA_INICIO_REQUIRED, EDICION_NO_BAJO_MINIMO, NUEVA_FECHA_NO_FUTURA, CIERRE_FUERA_DE_RANGO (cierre not after today or after the new start), EDICION_YA_EMPEZO. Returns the move plus taller_nombre, por_confirmar and the recipients with email (correos) for the app to send.';

REVOKE ALL ON FUNCTION public.talleres_suspender_edicion(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_suspender_edicion(uuid, date, date, text, text) TO authenticated, service_role;

-- ===========================================================================
-- D2. talleres_confirmar_cambio_fecha() — the member answers
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_confirmar_cambio_fecha(
  p_inscripcion_id uuid,
  p_respuesta text,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_persona_id uuid;
  v_ins        public.taller_inscripciones%ROWTYPE;
  v_motivo     text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF p_respuesta IS NULL OR p_respuesta NOT IN ('mantener', 'no_puedo') THEN
    RAISE EXCEPTION 'RESPUESTA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_persona_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  SELECT * INTO v_ins
    FROM public.taller_inscripciones
   WHERE id = p_inscripcion_id
     FOR UPDATE;

  -- Not found and not yours collapse to the same refusal.
  IF v_persona_id IS NULL OR v_ins.id IS NULL
     OR v_persona_id NOT IN (v_ins.persona_principal_id, COALESCE(v_ins.companero_id, v_ins.persona_principal_id)) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_inscripcion' USING ERRCODE = '42501';
  END IF;

  IF v_ins.estado <> 'aprobado' OR v_ins.confirmacion_estado IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'CONFIRMACION_NO_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;

  IF v_ins.confirmacion_limite < public.talleres_hoy() THEN
    RAISE EXCEPTION 'CONFIRMACION_VENCIDA' USING ERRCODE = 'P0001';
  END IF;

  IF v_motivo IS NOT NULL AND length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'TEXTO_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;

  IF p_respuesta = 'mantener' THEN
    UPDATE public.taller_inscripciones
       SET confirmacion_estado = 'confirmada',
           confirmada_por = v_persona_id,
           confirmada_en = now(),
           confirmacion_canal = 'app'
     WHERE id = p_inscripcion_id;
  ELSE
    -- Leaves the edición the way talleres_resolver_solicitud_retiro does.
    UPDATE public.taller_inscripciones
       SET estado = 'retirado',
           version = version + 1,
           confirmacion_estado = 'no_puede',
           confirmada_por = v_persona_id,
           confirmada_en = now(),
           confirmacion_canal = 'app',
           confirmacion_motivo = COALESCE(v_motivo, 'Ya no puede con la nueva fecha')
     WHERE id = p_inscripcion_id;
  END IF;

  -- The question is answered for both members of the unit.
  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo = 'taller_cambio_fecha'
     AND datos ->> 'inscripcion_id' = p_inscripcion_id::text
     AND (expira_at IS NULL OR expira_at > now());

  RETURN jsonb_build_object(
    'inscripcion_id', p_inscripcion_id,
    'confirmacion_estado', CASE WHEN p_respuesta = 'mantener' THEN 'confirmada' ELSE 'no_puede' END,
    'estado', CASE WHEN p_respuesta = 'mantener' THEN 'aprobado' ELSE 'retirado' END
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) IS
  'T8a (S9, S15) — the principal or companero of an aprobada answers a date change before its limit: mantener -> confirmada; no_puedo -> no_puede and estado retirado (as talleres_resolver_solicitud_retiro writes it) with the motivo. Refuses 22023 RESPUESTA_INVALIDA, 42501 sin_permisos_para_esta_inscripcion (not found or not theirs), P0001 CONFIRMACION_NO_PENDIENTE, P0001 CONFIRMACION_VENCIDA.';

REVOKE ALL ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_confirmar_cambio_fecha(uuid, text, text) TO authenticated, service_role;

-- ===========================================================================
-- D3. talleres_confirmar_por_telefono() — after a call
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_confirmar_por_telefono(p_inscripcion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ins       public.taller_inscripciones%ROWTYPE;
  v_equipo_id uuid;
  v_actor_id  uuid;
BEGIN
  SELECT * INTO v_ins
    FROM public.taller_inscripciones
   WHERE id = p_inscripcion_id
     FOR UPDATE;

  v_equipo_id := public.talleres_equipo_de_edicion(v_ins.taller_id);

  IF v_ins.id IS NULL OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_inscripcion' USING ERRCODE = '42501';
  END IF;

  IF v_ins.estado <> 'aprobado' OR v_ins.confirmacion_estado IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'CONFIRMACION_NO_PENDIENTE' USING ERRCODE = 'P0001';
  END IF;

  IF v_ins.confirmacion_limite < public.talleres_hoy() THEN
    RAISE EXCEPTION 'CONFIRMACION_VENCIDA' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  UPDATE public.taller_inscripciones
     SET confirmacion_estado = 'confirmada',
         confirmada_por = v_actor_id,
         confirmada_en = now(),
         confirmacion_canal = 'telefono'
   WHERE id = p_inscripcion_id;

  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo = 'taller_cambio_fecha'
     AND datos ->> 'inscripcion_id' = p_inscripcion_id::text
     AND (expira_at IS NULL OR expira_at > now());

  RETURN jsonb_build_object('inscripcion_id', p_inscripcion_id, 'confirmacion_estado', 'confirmada');
END;
$function$;

COMMENT ON FUNCTION public.talleres_confirmar_por_telefono(uuid) IS
  'T8a (S15) — a coordinator (or director/admin) of the edición''s node marks a pending aprobada as confirmed after calling (confirmacion_canal telefono, confirmada_por the caller). Same refusals as talleres_confirmar_cambio_fecha.';

REVOKE ALL ON FUNCTION public.talleres_confirmar_por_telefono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_confirmar_por_telefono(uuid) TO authenticated, service_role;

-- ===========================================================================
-- D4. talleres_abrir_igual() — S16
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_abrir_igual(p_edicion_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_edicion   public.taller_ediciones%ROWTYPE;
  v_equipo_id uuid;
  v_actor_id  uuid;
  v_motivo    text := NULLIF(btrim(p_motivo), '');
BEGIN
  SELECT * INTO v_edicion
    FROM public.taller_ediciones
   WHERE id = p_edicion_id
     FOR UPDATE;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  -- S16: only the director (of Conexión, inherited down the tree) and the
  -- taller's coordinador. admin.manage alone does not qualify.
  IF v_edicion.id IS NULL OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_abrir_igual' USING ERRCODE = '42501';
  END IF;

  IF NOT public.talleres_edicion_bajo_minimo(p_edicion_id) THEN
    RAISE EXCEPTION 'EDICION_NO_BAJO_MINIMO' USING ERRCODE = 'P0001';
  END IF;

  IF v_motivo IS NOT NULL AND length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'TEXTO_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  UPDATE public.taller_ediciones
     SET abierta_igual_por = v_actor_id,
         abierta_igual_en = now(),
         abierta_igual_motivo = v_motivo
   WHERE id = p_edicion_id;

  RETURN jsonb_build_object(
    'edicion_id', p_edicion_id,
    'aprobados', public.talleres_minimo_aprobados(p_edicion_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_abrir_igual(uuid, text) IS
  'T8a (S16) — starts an edición below its minimum: records abierta_igual_por/en/motivo so it is never below minimum again. Only director.write or coordinator.write scoped to the edición''s node (42501 sin_permisos_para_abrir_igual otherwise, also for admin.manage alone). Refuses P0001 EDICION_NO_BAJO_MINIMO.';

REVOKE ALL ON FUNCTION public.talleres_abrir_igual(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_abrir_igual(uuid, text) TO authenticated, service_role;

-- ===========================================================================
-- D5. talleres_minimo_panel() — the edición page
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_minimo_panel(p_edicion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_edicion        public.taller_ediciones%ROWTYPE;
  v_equipo_id      uuid;
  v_minimo         integer;
  v_tipo           text;
  v_puede_suspender boolean;
  v_puede_abrir    boolean;
  v_puede_confirmar boolean;
  v_lista          jsonb := '[]'::jsonb;
  v_conteo         jsonb;
  v_clases         jsonb;
BEGIN
  SELECT * INTO v_edicion FROM public.taller_ediciones WHERE id = p_edicion_id;
  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);

  -- The staff branches of taller_ediciones_select.
  IF v_edicion.id IS NULL OR NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  SELECT t.minimo_inscritos, t.tipo INTO v_minimo, v_tipo
    FROM public.talleres t WHERE t.id = v_edicion.taller_id;

  v_puede_suspender := public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id);
  v_puede_abrir := public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id);
  v_puede_confirmar := v_puede_suspender
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo_id);

  SELECT jsonb_build_object(
           'confirmadas', count(*) FILTER (WHERE i.confirmacion_estado = 'confirmada' AND i.estado = 'aprobado'),
           'por_telefono', count(*) FILTER (WHERE i.confirmacion_estado = 'confirmada' AND i.estado = 'aprobado' AND i.confirmacion_canal = 'telefono'),
           'no_puede', count(*) FILTER (WHERE i.confirmacion_estado = 'no_puede'),
           'sin_responder', count(*) FILTER (WHERE i.confirmacion_estado = 'pendiente' AND i.estado = 'aprobado'),
           'salieron_sin_responder', count(*) FILTER (WHERE i.confirmacion_estado = 'pendiente' AND i.estado = 'retirado'),
           'aprobados', count(*) FILTER (WHERE i.estado = 'aprobado'),
           'pendientes', count(*) FILTER (WHERE i.estado = 'pendiente'),
           'limite', max(i.confirmacion_limite) FILTER (WHERE i.confirmacion_estado IS NOT NULL)
         )
    INTO v_conteo
    FROM public.taller_inscripciones i
    JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
   WHERE c.taller_id = p_edicion_id;

  IF v_puede_confirmar THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'inscripcion_id', i.id,
             'nombre', btrim(concat_ws(' ', up.nombre, up.apellido)),
             'telefono', up.telefono,
             'companero_nombre', CASE WHEN uc.id IS NULL THEN NULL ELSE btrim(concat_ws(' ', uc.nombre, uc.apellido)) END,
             'companero_telefono', uc.telefono,
             'limite', i.confirmacion_limite
           ) ORDER BY (up.telefono IS NULL AND uc.telefono IS NULL) DESC, up.nombre, up.apellido), '[]'::jsonb)
      INTO v_lista
      FROM public.taller_inscripciones i
      JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
      JOIN public.usuarios up ON up.id = i.persona_principal_id
      LEFT JOIN public.usuarios uc ON uc.id = i.companero_id
     WHERE c.taller_id = p_edicion_id
       AND i.estado = 'aprobado'
       AND i.confirmacion_estado = 'pendiente';
  END IF;

  -- The clases that a move would shift (same predicate as the move),
  -- one row per numero.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('numero', x.numero, 'fecha', x.fecha) ORDER BY x.numero), '[]'::jsonb)
    INTO v_clases
    FROM (
      SELECT s.numero, min(s.fecha_programada) AS fecha
        FROM public.taller_sesiones s
        JOIN public.taller_grupos g ON g.id = s.grupo_id
        JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
       WHERE c.taller_id = p_edicion_id
         AND s.estado NOT IN ('cerrada', 'cancelada')
         AND s.fecha_programada >= v_edicion.fecha_inicio
       GROUP BY s.numero
    ) x;

  RETURN jsonb_build_object(
    'minimo', v_minimo,
    'unidad', CASE WHEN v_tipo = 'pareja' THEN 'parejas' ELSE 'personas' END,
    'bajo_minimo', public.talleres_edicion_bajo_minimo(p_edicion_id),
    'fecha_inicio', v_edicion.fecha_inicio,
    'cierre_inscripcion', v_edicion.cierre_inscripcion,
    'conteo', v_conteo,
    'clases', v_clases,
    'suspension', CASE WHEN v_edicion.suspendida_en IS NULL THEN NULL ELSE jsonb_build_object(
      'en', v_edicion.suspendida_en,
      'motivo', v_edicion.suspension_motivo,
      'mensaje', v_edicion.suspension_mensaje,
      'fecha_anterior', v_edicion.suspension_fecha_anterior,
      'por', (SELECT btrim(concat_ws(' ', u.nombre, u.apellido)) FROM public.usuarios u WHERE u.id = v_edicion.suspendida_por)
    ) END,
    'abierta_igual', CASE WHEN v_edicion.abierta_igual_en IS NULL THEN NULL ELSE jsonb_build_object(
      'en', v_edicion.abierta_igual_en,
      'motivo', v_edicion.abierta_igual_motivo,
      'por', (SELECT btrim(concat_ws(' ', u.nombre, u.apellido)) FROM public.usuarios u WHERE u.id = v_edicion.abierta_igual_por)
    ) END,
    'puede_suspender', v_puede_suspender,
    'puede_abrir_igual', v_puede_abrir,
    'puede_confirmar', v_puede_confirmar,
    'sin_responder', v_lista
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_minimo_panel(uuid) IS
  'T8a — what the edición page shows about the minimum: minimo, unidad, bajo_minimo, counters (confirmadas, no_puede, sin_responder, salieron_sin_responder, aprobados, pendientes, limite), the clases a move would shift, the last suspension and «abrir igual», what the caller may do, and the call list (only for coordinator.write, director.write or admin.manage). Staff read authority of taller_ediciones_select, 42501 otherwise.';

REVOKE ALL ON FUNCTION public.talleres_minimo_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_minimo_panel(uuid) TO authenticated, service_role;

-- ===========================================================================
-- D6. talleres_mis_cambios_de_fecha() — the member's pending answers
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_mis_cambios_de_fecha()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'inscripcion_id', i.id,
           'taller_nombre', t.nombre,
           'edicion_nombre', e.nombre_snapshot,
           'fecha_inicio', e.fecha_inicio,
           'fecha_anterior', e.suspension_fecha_anterior,
           'lugar', e.lugar,
           'mensaje', e.suspension_mensaje,
           'limite', i.confirmacion_limite
         ) ORDER BY i.confirmacion_limite, t.nombre), '[]'::jsonb)
    FROM public.taller_inscripciones i
    JOIN public.taller_ediciones e ON e.id = i.taller_id
    JOIN public.talleres t ON t.id = e.taller_id
   WHERE (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid()) IN (i.persona_principal_id, i.companero_id)
     AND i.estado = 'aprobado'
     AND i.confirmacion_estado = 'pendiente'
     AND i.confirmacion_limite >= public.talleres_hoy();
$function$;

COMMENT ON FUNCTION public.talleres_mis_cambios_de_fecha() IS
  'T8a — the caller''s aprobadas (as principal or companero) that still have to answer a date change before their limit, with the taller, the new and previous start, lugar, the message and the limit.';

REVOKE ALL ON FUNCTION public.talleres_mis_cambios_de_fecha() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mis_cambios_de_fecha() TO authenticated, service_role;

-- ===========================================================================
-- E. talleres_cerrar_confirmaciones_vencidas() + daily job (S15)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_cerrar_confirmaciones_vencidas()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH salen AS (
    UPDATE public.taller_inscripciones
       SET estado = 'retirado',
           version = version + 1,
           confirmacion_motivo = 'Sin confirmar el cambio de fecha'
     WHERE confirmacion_estado = 'pendiente'
       AND estado = 'aprobado'
       AND confirmacion_limite < public.talleres_hoy()
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM salen;

  UPDATE public.avisos_persona
     SET expira_at = now()
   WHERE tipo = 'taller_cambio_fecha'
     AND datos ->> 'inscripcion_id' = ANY (v_ids::text[])
     AND (expira_at IS NULL OR expira_at > now());

  RETURN cardinality(v_ids);
END;
$function$;

COMMENT ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() IS
  'T8a (S15) — every aprobada still pendiente after its confirmacion_limite (talleres_hoy()) leaves the edición: estado retirado (as talleres_resolver_solicitud_retiro writes it), confirmacion_motivo ''Sin confirmar el cambio de fecha''; confirmacion_estado stays pendiente as the trace. Returns how many left. service_role only (pg_cron).';

REVOKE ALL ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_cerrar_confirmaciones_vencidas() TO service_role;

-- 04:15 UTC = 00:15 in Caracas, right after a limit day ends. A no-op where
-- pg_cron is not installed; re-running replaces the job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'talleres_confirmaciones_vencidas') THEN
      PERFORM cron.unschedule('talleres_confirmaciones_vencidas');
    END IF;
    PERFORM cron.schedule('talleres_confirmaciones_vencidas', '15 4 * * *',
                          $cmd$select public.talleres_cerrar_confirmaciones_vencidas()$cmd$);
  END IF;
END;
$$;
