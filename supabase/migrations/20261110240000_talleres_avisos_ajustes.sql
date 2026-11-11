-- T7 follow-up (odd/tasks/talleres-reserva-publica.md, S6; L24) — fixes of
-- 20261110230000_talleres_avisos.sql after its verification.
--
-- L24 (user, chosen option): "Dos campos: interno y para la persona". The
-- motivo of a rejection stays internal; only an optional message written
-- for the person travels in the «No aprobada» notice (email + app).
--
--   1. taller_inscripciones.mensaje_no_aprobado text NULL (<= 600): the
--      optional message for the person. motivo_no_aprobado is unchanged
--      (still required by trg_taller_inscripciones_couple_unit, internal).
--   2. talleres_aviso_inscripcion: the 'rechazada' notice reads
--      mensaje_no_aprobado from the row and omits the sentence when it is
--      NULL or blank. p_motivo is ignored (kept only so the signature and
--      its grants stay the same): no caller can put the motivo in a notice.
--      talleres_avisos_inscripcion_trg no longer passes the motivo.
--   3. One-off scrub: «No aprobada» notices already written with the
--      «Motivo: …» sentence (in-app rows and outbox rows, any estado) are
--      rewritten without it, so a pendiente email never sends the motivo.
--   4. talleres_avisos_envios_reclamar (same signature, result and grants):
--      a. pendiente rows whose datos.expira_at has passed are marked
--         fallido with error 'vencido' first, in the same call (even when
--         the daily cap is reached), so a late reminder is never sent;
--      b. recordatorio_clase rows are taken and returned first;
--      c. the daily cap counts the rows leased right now (pendiente,
--         intentos > 0, disponible_en > now()) besides today's enviados,
--         and the calls are serialized with a transaction advisory lock,
--         so two runs at once cannot go over the cap.
--
-- Rollback (in this order): re-run the CREATE OR REPLACE FUNCTION blocks of
--   talleres_aviso_inscripcion, talleres_avisos_inscripcion_trg and
--   talleres_avisos_envios_reclamar from 20261110230000 (the scrub of 3 is
--   not undone: the motivo is internal), then
--   ALTER TABLE public.taller_inscripciones DROP COLUMN IF EXISTS mensaje_no_aprobado;

-- ===========================================================================
-- 1. taller_inscripciones.mensaje_no_aprobado
-- ===========================================================================

ALTER TABLE public.taller_inscripciones
  ADD COLUMN mensaje_no_aprobado text NULL
    CONSTRAINT taller_inscripciones_mensaje_no_aprobado_check
    CHECK (mensaje_no_aprobado IS NULL OR length(mensaje_no_aprobado) <= 600);

COMMENT ON COLUMN public.taller_inscripciones.mensaje_no_aprobado IS
  'L24: optional message for the person when the inscription is not approved. It is sent to the principal and the companero in the «No aprobada» notice (email + app). motivo_no_aprobado stays internal and never appears in a notice.';

-- ===========================================================================
-- 2. Notices: the message, never the motivo
-- ===========================================================================

-- One inscription notice for its principal and its companero. p_evento:
-- recibida | aprobada | rechazada | grupo. The companero of a recibida
-- that is por_verificar already got the reservation's own notice.
-- p_motivo is ignored since 20261110240000: a rejection shows
-- mensaje_no_aprobado (the message for the person), never the motivo.
CREATE OR REPLACE FUNCTION public.talleres_aviso_inscripcion(p_inscripcion_id uuid, p_evento text, p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.taller_inscripciones%ROWTYPE;
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
  v_tipo text;
  v_titulo text;
  v_cuerpo text;
  v_asunto text;
  v_cta text;
  v_url text := '/talleres/mi-recorrido';
  v_filas jsonb := '[]'::jsonb;
  v_grupo jsonb;
  v_sufijo text;
  v_mensaje text;
  v_persona uuid;
  v_emitidos integer := 0;
BEGIN
  SELECT * INTO v_i FROM public.taller_inscripciones i WHERE i.id = p_inscripcion_id;
  SELECT te.* INTO v_te
    FROM public.talleres_crecimiento_cohortes c
    JOIN public.taller_ediciones te ON te.id = c.taller_id
   WHERE c.id = v_i.cohorte_id;
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
  IF v_taller.id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_evento = 'recibida' THEN
    v_tipo := 'inscripcion_recibida';
    v_titulo := 'Recibimos tu solicitud';
    v_cuerpo := format('Recibimos tu inscripción en %s. La coordinación revisa cada inscripción y te avisa en unos días.', v_taller.nombre);
    v_asunto := format('Recibimos tu solicitud para %s', v_taller.nombre);
    v_cta := 'Ver mi inscripción';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot), jsonb_build_array('Estado', 'Esperando aprobación'));
  ELSIF p_evento = 'aprobada' THEN
    v_tipo := 'inscripcion_aprobada';
    v_titulo := 'Aprobamos tu inscripción';
    v_cuerpo := format('Tienes tu lugar en %s.', v_taller.nombre)
      || CASE WHEN v_te.fecha_inicio >= public.talleres_hoy() THEN format(' Empieza el %s.', public.talleres_aviso_fecha(v_te.fecha_inicio)) ELSE '' END
      || ' Pronto te avisamos tu grupo y quién lo facilita.';
    v_asunto := format('Aprobamos tu inscripción en %s', v_taller.nombre);
    v_cta := 'Ver mi taller';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot));
    IF v_te.fecha_inicio >= public.talleres_hoy() THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Empieza', public.talleres_aviso_fecha(v_te.fecha_inicio)));
    END IF;
  ELSIF p_evento = 'rechazada' THEN
    v_tipo := 'inscripcion_rechazada';
    v_titulo := 'Tu inscripción no fue aprobada';
    v_mensaje := nullif(btrim(coalesce(v_i.mensaje_no_aprobado, '')), '');
    IF v_mensaje IS NOT NULL AND v_mensaje !~ '[.!?…]$' THEN
      v_mensaje := v_mensaje || '.';
    END IF;
    v_cuerpo := format('No pudimos aprobar tu inscripción en %s.', v_taller.nombre)
      || CASE WHEN v_mensaje IS NOT NULL THEN ' ' || v_mensaje ELSE '' END
      || ' Si tienes dudas, habla con la coordinación del taller.';
    v_asunto := format('Tu inscripción en %s no fue aprobada', v_taller.nombre);
    v_cta := NULL;
    v_url := NULL;
    v_sufijo := v_i.id::text;
  ELSIF p_evento = 'grupo' THEN
    IF v_i.grupo_id IS NULL THEN
      RETURN 0;
    END IF;
    v_grupo := public.talleres_aviso_grupo_info(v_i.grupo_id);
    v_tipo := 'grupo_asignado';
    v_titulo := 'Tu grupo y quién lo facilita';
    v_cuerpo := format('Ya tienes grupo en %s: %s.', v_taller.nombre, v_grupo ->> 'grupo')
      || CASE WHEN v_grupo ->> 'facilitadores' IS NOT NULL THEN format(' Facilita %s.', v_grupo ->> 'facilitadores') ELSE '' END
      || CASE WHEN v_grupo ->> 'fecha' IS NOT NULL
              THEN ' Empieza el ' || concat_ws(' · ', v_grupo ->> 'fecha', v_grupo ->> 'hora', v_grupo ->> 'lugar') || '.'
              ELSE '' END;
    v_asunto := format('Tu grupo de %s: %s', v_taller.nombre, v_grupo ->> 'grupo');
    v_cta := 'Ver mi taller';
    v_sufijo := v_i.id::text || ':' || v_i.grupo_id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Grupo', v_grupo ->> 'grupo'));
    IF v_grupo ->> 'facilitadores' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Facilita', v_grupo ->> 'facilitadores'));
    END IF;
    IF v_grupo ->> 'fecha' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Empieza', concat_ws(' · ', v_grupo ->> 'fecha', v_grupo ->> 'hora')));
    END IF;
    IF v_grupo ->> 'lugar' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Lugar', v_grupo ->> 'lugar'));
    END IF;
  ELSE
    RAISE EXCEPTION 'evento_invalido' USING ERRCODE = '22023';
  END IF;

  FOREACH v_persona IN ARRAY ARRAY[v_i.persona_principal_id, v_i.companero_id] LOOP
    CONTINUE WHEN v_persona IS NULL;
    CONTINUE WHEN p_evento = 'recibida' AND v_persona = v_i.companero_id
                  AND coalesce((to_jsonb(v_i) ->> 'por_verificar')::boolean, false);
    IF public.talleres_aviso_emitir(
         v_tipo, v_tipo || ':' || v_sufijo || ':' || v_persona::text, v_persona, v_taller.id, v_te.id,
         v_titulo, v_cuerpo, v_url, v_asunto,
         jsonb_build_object('inscripcion_id', v_i.id, 'filas', v_filas), v_cta) THEN
      v_emitidos := v_emitidos + 1;
    END IF;
  END LOOP;

  RETURN v_emitidos;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_aviso_inscripcion(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_inscripcion(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.talleres_avisos_inscripcion_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_edicion uuid;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.estado = 'pendiente' THEN
        PERFORM public.talleres_aviso_inscripcion(NEW.id, 'recibida');
      ELSIF NEW.estado = 'aprobado' THEN
        PERFORM public.talleres_aviso_inscripcion(NEW.id, 'aprobada');
      END IF;
    ELSE
      IF NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF NEW.estado = 'aprobado' THEN
          PERFORM public.talleres_aviso_inscripcion(NEW.id, 'aprobada');
        ELSIF NEW.estado = 'no_aprobado' THEN
          -- The motivo is internal (L24): the notice reads mensaje_no_aprobado.
          PERFORM public.talleres_aviso_inscripcion(NEW.id, 'rechazada');
        END IF;
        -- A seat freed (S13).
        IF OLD.estado IN ('pendiente', 'aprobado') AND NEW.estado NOT IN ('pendiente', 'aprobado') THEN
          SELECT c.taller_id INTO v_edicion FROM public.talleres_crecimiento_cohortes c WHERE c.id = NEW.cohorte_id;
          IF v_edicion IS NOT NULL THEN
            PERFORM public.talleres_avisame_notificar(v_edicion);
          END IF;
        END IF;
      END IF;
      IF NEW.grupo_id IS NOT NULL AND NEW.grupo_id IS DISTINCT FROM OLD.grupo_id AND NEW.estado = 'aprobado' THEN
        PERFORM public.talleres_aviso_inscripcion(NEW.id, 'grupo');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- A notice never undoes the inscription change that caused it.
    RAISE WARNING 'talleres_avisos: % (%), inscripción %', SQLERRM, SQLSTATE, NEW.id;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_inscripcion_trg() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. Scrub: «No aprobada» notices written with the motivo
-- ===========================================================================

UPDATE public.avisos_persona a
   SET cuerpo = format('No pudimos aprobar tu inscripción en %s. Si tienes dudas, habla con la coordinación del taller.',
                       coalesce(a.datos ->> 'taller', 'tu taller'))
 WHERE a.tipo = 'inscripcion_rechazada' AND a.cuerpo LIKE '% Motivo: %';

UPDATE public.taller_avisos_envios e
   SET datos = jsonb_set(e.datos, '{cuerpo}', to_jsonb(
         format('No pudimos aprobar tu inscripción en %s. Si tienes dudas, habla con la coordinación del taller.',
                coalesce(e.datos ->> 'taller', 'tu taller'))))
 WHERE e.tipo = 'inscripcion_rechazada' AND e.datos ->> 'cuerpo' LIKE '% Motivo: %';

-- ===========================================================================
-- 4. Outbox lease: no late reminders, reminders first, exact daily cap
-- ===========================================================================

-- Marks the due rows whose datos.expira_at has passed as fallido
-- ('vencido'), then leases up to p_limite due emails for 10 minutes
-- (attempt + 1), recordatorio_clase first, keeping the outbox within
-- p_tope_diario per UTC day (Resend's quota day) counting today's enviados
-- and the rows leased right now. Calls are serialized (advisory lock until
-- the end of the transaction). What does not fit waits for the next run.
CREATE OR REPLACE FUNCTION public.talleres_avisos_envios_reclamar(p_limite integer DEFAULT 50, p_tope_diario integer DEFAULT 40)
RETURNS TABLE (id uuid, clave text, tipo text, email text, nombre text, asunto text, datos jsonb, intentos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_ocupados integer;
  v_limite integer;
BEGIN
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100 THEN
    RAISE EXCEPTION 'El límite debe estar entre 1 y 100.' USING ERRCODE = '22023';
  END IF;
  IF p_tope_diario IS NULL OR p_tope_diario < 0 OR p_tope_diario > 10000 THEN
    RAISE EXCEPTION 'El tope diario debe estar entre 0 y 10000.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.talleres_avisos_envios_reclamar'));

  -- A notice that expired (a class reminder after its class day) is not
  -- sent late.
  UPDATE public.taller_avisos_envios e
     SET estado = 'fallido', error = 'vencido'
   WHERE e.estado = 'pendiente'
     AND e.datos ? 'expira_at'
     AND (e.datos ->> 'expira_at')::timestamptz <= now();

  SELECT count(*) INTO v_ocupados
    FROM public.taller_avisos_envios e
   WHERE (e.estado = 'enviado'
          AND (e.enviado_en AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date)
      OR (e.estado = 'pendiente' AND e.intentos > 0 AND e.disponible_en > now());

  v_limite := least(p_limite, greatest(p_tope_diario - v_ocupados, 0));
  IF v_limite = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lote AS (
    SELECT e.id
      FROM public.taller_avisos_envios e
     WHERE e.estado = 'pendiente' AND e.disponible_en <= now()
     ORDER BY (e.tipo = 'recordatorio_clase') DESC, e.disponible_en, e.created_at, e.id
     LIMIT v_limite
     FOR UPDATE SKIP LOCKED
  ),
  tomados AS (
    UPDATE public.taller_avisos_envios e
       SET disponible_en = now() + interval '10 minutes',
           intentos = e.intentos + 1
      FROM lote l
     WHERE e.id = l.id
    RETURNING e.id, e.clave, e.tipo, e.email, e.nombre, e.asunto, e.datos, e.intentos, e.created_at
  )
  SELECT t.id, t.clave, t.tipo, t.email, t.nombre, t.asunto, t.datos, t.intentos
    FROM tomados t
   ORDER BY (t.tipo = 'recordatorio_clase') DESC, t.created_at, t.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_envios_reclamar(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_envios_reclamar(integer, integer) TO service_role;
