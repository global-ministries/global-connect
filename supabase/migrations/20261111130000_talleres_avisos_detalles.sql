-- T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — the practical
-- details of the clases in the talleres notices.
--
-- L30 (user, via the Próximo Paso session): "hora, lugar y los demás
-- detalles prácticos de las clases («todo lo que una persona debe saber»)"
-- must travel in the notices (email and the in-app bell).
--
--   1. taller_ediciones.indicaciones text NULL (<= 500): what a participant
--      should know before coming (what to bring, where to enter, parking).
--      Written by the edición screen through the existing
--      taller_ediciones_update RLS (director.write | admin.manage).
--   2. talleres_aviso_detalles(edición) (internal): the first clase of an
--      edición that has not started yet (the first programada sesión from
--      today on, else fecha_inicio), its hour (that sesión's
--      meeting_time_override, else recurrence_rule.start_time), the lugar
--      and the indicaciones; and talleres_aviso_detalles_texto, the one
--      sentence the notices write from it («Empieza el jueves 5 de
--      noviembre a las 7:00 p. m. en Salón 2. Indicaciones: …»). A NULL
--      piece is left out.
--   3. talleres_aviso_inscripcion (same signature and grants; the body of
--      20261110240000 with minimal changes): «Recibimos tu solicitud» and
--      «Aprobamos tu inscripción» carry that sentence and the rows Empieza
--      (fecha · hora), Lugar and Indicaciones; «Tu grupo y quién lo
--      facilita» adds the indicaciones (it already had fecha, hora and
--      lugar). A started edición still gives no start date (as before),
--      but now names the lugar («Las clases son en …»).
--   4. talleres_avisos_recordatorios_encolar (same signature and grants;
--      the body of 20261110230000 plus the indicaciones): «Mañana es tu
--      clase» adds the Indicaciones row and sentence (the bell shows only
--      the body, so the sentence is what reaches the app).
--   The grupo and reminder bodies also stop writing a double period after
--   an hour without a lugar («7:00 p. m..» → «7:00 p. m.»).
--   5. talleres_primeras_clases(uuid[]) (authenticated): the first clase
--      date of the open ediciones a member sees in Explorar
--      («Empieza el …»). taller_sesiones is only readable by the team and
--      the grupo's members, so a definer returns just that date, and only
--      for ediciones abierto/en_curso (the rows every signed-in user can
--      already read through taller_ediciones_select).
--
-- Rollback (in this order): re-run the CREATE OR REPLACE FUNCTION blocks of
--   talleres_aviso_inscripcion from 20261110240000 and
--   talleres_avisos_recordatorios_encolar from 20261110230000, then
--   DROP FUNCTION IF EXISTS public.talleres_primeras_clases(uuid[]),
--     public.talleres_aviso_detalles_texto(jsonb), public.talleres_aviso_detalles(uuid);
--   ALTER TABLE public.taller_ediciones DROP COLUMN IF EXISTS indicaciones;

-- ===========================================================================
-- 1. taller_ediciones.indicaciones
-- ===========================================================================

ALTER TABLE public.taller_ediciones
  ADD COLUMN IF NOT EXISTS indicaciones text NULL
    CONSTRAINT taller_ediciones_indicaciones_check
    CHECK (indicaciones IS NULL OR length(indicaciones) <= 500);

COMMENT ON COLUMN public.taller_ediciones.indicaciones IS
  'T10: practical information for the participants (what to bring, where to enter, parking). Sent in the inscription, group and class reminder notices (email + app). NULL: none.';

-- ===========================================================================
-- 2. Details of the first clase
-- ===========================================================================

-- {"dia","fecha","hora","lugar","indicaciones"} of an edición. dia/fecha/
-- hora only while the edición has not started (fecha_inicio from today
-- on): the first programada sesión of a live grupo from today on, else
-- fecha_inicio; hora = that sesión's override, else the recurrence
-- start_time. lugar/indicaciones trimmed, NULL when blank.
CREATE OR REPLACE FUNCTION public.talleres_aviso_detalles(p_edicion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'dia', d.dia,
    'fecha', public.talleres_aviso_fecha(d.dia),
    'hora', public.talleres_aviso_hora(CASE WHEN d.dia IS NOT NULL THEN coalesce(
      s.meeting_time_override,
      CASE WHEN te.recurrence_rule ->> 'start_time' ~ '^\d{2}:\d{2}'
           THEN substring(te.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')::time END) END),
    'lugar', nullif(btrim(coalesce(te.lugar, '')), ''),
    'indicaciones', nullif(btrim(coalesce(te.indicaciones, '')), '')
  )
    FROM public.taller_ediciones te
    LEFT JOIN LATERAL (
      SELECT s.fecha_programada, s.meeting_time_override
        FROM public.talleres_crecimiento_cohortes c
        JOIN public.taller_grupos g ON g.cohorte_id = c.id AND g.estado <> 'cancelado'
        JOIN public.taller_sesiones s ON s.grupo_id = g.id
       WHERE c.taller_id = te.id AND s.estado = 'programada' AND s.fecha_programada >= public.talleres_hoy()
       ORDER BY s.fecha_programada, s.numero, s.id
       LIMIT 1
    ) s ON true
    CROSS JOIN LATERAL (
      SELECT CASE WHEN te.fecha_inicio >= public.talleres_hoy()
                  THEN coalesce(s.fecha_programada, te.fecha_inicio) END AS dia
    ) d
   WHERE te.id = p_edicion_id;
$function$;

REVOKE ALL ON FUNCTION public.talleres_aviso_detalles(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_detalles(uuid) TO service_role;

-- The sentence of those details: 'Empieza el <fecha>[ a las <hora>][ en
-- <lugar>].' (or 'Las clases son en <lugar>.' without a date) and
-- 'Indicaciones: <texto>.' Empty string when there is nothing to say.
CREATE OR REPLACE FUNCTION public.talleres_aviso_detalles_texto(p_detalles jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT concat_ws(' ',
    CASE
      WHEN p_detalles ->> 'fecha' IS NOT NULL THEN
        -- rtrim + '.': one final period even after «p. m.».
        rtrim('Empieza el ' || (p_detalles ->> 'fecha')
          || CASE WHEN p_detalles ->> 'hora' IS NOT NULL
                  THEN CASE WHEN p_detalles ->> 'hora' LIKE '1:%' THEN ' a la ' ELSE ' a las ' END || (p_detalles ->> 'hora')
                  ELSE '' END
          || CASE WHEN p_detalles ->> 'lugar' IS NOT NULL THEN ' en ' || (p_detalles ->> 'lugar') ELSE '' END, '.')
        || '.'
      WHEN p_detalles ->> 'lugar' IS NOT NULL THEN
        'Las clases son en ' || rtrim(p_detalles ->> 'lugar', '.') || '.'
    END,
    CASE WHEN p_detalles ->> 'indicaciones' IS NOT NULL THEN
      'Indicaciones: ' || i.texto || CASE WHEN i.texto ~ '[.!?…]$' THEN '' ELSE '.' END
    END)
    FROM (SELECT regexp_replace(btrim(coalesce(p_detalles ->> 'indicaciones', '')), '\s+', ' ', 'g') AS texto) i;
$function$;

REVOKE ALL ON FUNCTION public.talleres_aviso_detalles_texto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_detalles_texto(jsonb) TO service_role;

-- ===========================================================================
-- 3. Inscription notices with the details
-- ===========================================================================

-- One inscription notice for its principal and its companero. p_evento:
-- recibida | aprobada | rechazada | grupo. The companero of a recibida
-- that is por_verificar already got the reservation's own notice.
-- p_motivo is ignored since 20261110240000: a rejection shows
-- mensaje_no_aprobado (the message for the person), never the motivo.
-- T10: recibida and aprobada carry the first clase (fecha, hora), the
-- lugar and the indicaciones; grupo adds the indicaciones.
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
  v_det jsonb;
  v_det_texto text;
  v_det_filas jsonb := '[]'::jsonb;
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

  -- T10: the practical details (NULL pieces are left out).
  v_det := public.talleres_aviso_detalles(v_te.id);
  v_det_texto := nullif(public.talleres_aviso_detalles_texto(v_det), '');
  IF v_det ->> 'fecha' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Empieza', concat_ws(' · ', v_det ->> 'fecha', v_det ->> 'hora')));
  END IF;
  IF v_det ->> 'lugar' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Lugar', v_det ->> 'lugar'));
  END IF;
  IF v_det ->> 'indicaciones' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Indicaciones', v_det ->> 'indicaciones'));
  END IF;

  IF p_evento = 'recibida' THEN
    v_tipo := 'inscripcion_recibida';
    v_titulo := 'Recibimos tu solicitud';
    v_cuerpo := format('Recibimos tu inscripción en %s. La coordinación revisa cada inscripción y te avisa en unos días.', v_taller.nombre)
      || coalesce(' ' || v_det_texto, '');
    v_asunto := format('Recibimos tu solicitud para %s', v_taller.nombre);
    v_cta := 'Ver mi inscripción';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot), jsonb_build_array('Estado', 'Esperando aprobación'))
      || v_det_filas;
  ELSIF p_evento = 'aprobada' THEN
    v_tipo := 'inscripcion_aprobada';
    v_titulo := 'Aprobamos tu inscripción';
    v_cuerpo := format('Tienes tu lugar en %s.', v_taller.nombre)
      || coalesce(' ' || v_det_texto, '')
      || ' Pronto te avisamos tu grupo y quién lo facilita.';
    v_asunto := format('Aprobamos tu inscripción en %s', v_taller.nombre);
    v_cta := 'Ver mi taller';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot)) || v_det_filas;
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
              THEN ' Empieza el ' || rtrim(concat_ws(' · ', v_grupo ->> 'fecha', v_grupo ->> 'hora', v_grupo ->> 'lugar'), '.') || '.'
              ELSE '' END
      || coalesce(' ' || nullif(public.talleres_aviso_detalles_texto(
           jsonb_build_object('indicaciones', v_det ->> 'indicaciones')), ''), '');
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
    IF v_det ->> 'indicaciones' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Indicaciones', v_det ->> 'indicaciones'));
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

-- ===========================================================================
-- 4. «Mañana es tu clase» with the indicaciones
-- ===========================================================================

-- «Mañana es tu clase»: every programada sesión whose date is the day after
-- p_ahora in America/Caracas, of a live grupo and edición, for each
-- aprobada inscription of that grupo (principal and companero). One notice
-- per (sesión, persona). The in-app row expires at the end of the class
-- day. Returns how many new notices were written. T10: the edición's
-- indicaciones go in the body and in their own row.
CREATE OR REPLACE FUNCTION public.talleres_avisos_recordatorios_encolar(p_ahora timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_manana date := (p_ahora AT TIME ZONE 'America/Caracas')::date + 1;
  v_fila record;
  v_info jsonb;
  v_hora text;
  v_cuerpo text;
  v_indicaciones text;
  v_n integer := 0;
BEGIN
  FOR v_fila IN
    SELECT s.id AS sesion_id, s.numero, s.tema, s.fecha_programada, s.meeting_time_override,
           g.id AS grupo_id, te.id AS edicion_id, te.lugar, te.indicaciones, te.recurrence_rule, te.nombre_snapshot,
           t.id AS taller_id, t.nombre AS taller, p.persona_id
      FROM public.taller_sesiones s
      JOIN public.taller_grupos g ON g.id = s.grupo_id
      JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
      JOIN public.taller_ediciones te ON te.id = c.taller_id
      JOIN public.talleres t ON t.id = te.taller_id
      JOIN public.taller_inscripciones i ON i.grupo_id = g.id AND i.estado = 'aprobado'
      CROSS JOIN LATERAL (VALUES (i.persona_principal_id), (i.companero_id)) p(persona_id)
     WHERE s.estado = 'programada'
       AND s.fecha_programada = v_manana
       AND g.estado <> 'cancelado'
       AND te.estado <> 'cancelado'
       AND te.cerrada_en IS NULL
       AND p.persona_id IS NOT NULL
     ORDER BY s.id, p.persona_id
  LOOP
    v_info := public.talleres_aviso_grupo_info(v_fila.grupo_id);
    v_hora := public.talleres_aviso_hora(coalesce(
      v_fila.meeting_time_override,
      CASE WHEN v_fila.recurrence_rule ->> 'start_time' ~ '^\d{2}:\d{2}'
           THEN substring(v_fila.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')::time END));
    v_indicaciones := nullif(btrim(coalesce(v_fila.indicaciones, '')), '');
    v_cuerpo := 'Clase ' || v_fila.numero
      || CASE WHEN nullif(btrim(coalesce(v_fila.tema, '')), '') IS NOT NULL THEN ': ' || btrim(v_fila.tema) ELSE '' END
      || ' de ' || v_fila.taller || ' · ' || rtrim(concat_ws(' · ', public.talleres_aviso_fecha(v_fila.fecha_programada), v_hora, v_fila.lugar), '.') || '.'
      || CASE WHEN v_info ->> 'facilitadores' IS NOT NULL THEN ' Facilita ' || (v_info ->> 'facilitadores') || '.' ELSE '' END
      || coalesce(' ' || nullif(public.talleres_aviso_detalles_texto(jsonb_build_object('indicaciones', v_indicaciones)), ''), '');
    IF public.talleres_aviso_emitir(
         'recordatorio_clase', 'recordatorio_clase:' || v_fila.sesion_id::text || ':' || v_fila.persona_id::text,
         v_fila.persona_id, v_fila.taller_id, v_fila.edicion_id,
         'Mañana es tu clase', v_cuerpo, '/talleres/mi-recorrido', format('Mañana es tu clase de %s', v_fila.taller),
         jsonb_build_object(
           'sesion_id', v_fila.sesion_id,
           'expira_at', ((v_fila.fecha_programada + 1)::timestamp AT TIME ZONE 'America/Caracas'),
           'filas', jsonb_build_array(
             jsonb_build_array('Cuándo', concat_ws(' · ', public.talleres_aviso_fecha(v_fila.fecha_programada), v_hora)))
             || CASE WHEN v_fila.lugar IS NOT NULL THEN jsonb_build_array(jsonb_build_array('Dónde', v_fila.lugar)) ELSE '[]'::jsonb END
             || CASE WHEN v_info ->> 'facilitadores' IS NOT NULL
                     THEN jsonb_build_array(jsonb_build_array('Facilita', v_info ->> 'facilitadores')) ELSE '[]'::jsonb END
             || CASE WHEN v_indicaciones IS NOT NULL
                     THEN jsonb_build_array(jsonb_build_array('Indicaciones', v_indicaciones)) ELSE '[]'::jsonb END),
         'Ver mi taller') THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) IS
  'T7: writes «Mañana es tu clase» (in-app + email outbox) for every programada sesión of tomorrow (America/Caracas) to the aprobadas of its grupo, once per sesión and persona. Returns the new notices. service_role (daily route). T10: carries the edición''s indicaciones.';

REVOKE ALL ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) TO service_role;

-- ===========================================================================
-- 5. Explorar: first clase of the open ediciones
-- ===========================================================================

-- (edicion_id, fecha) for the given ediciones that are abierto or
-- en_curso: the first programada sesión of a live grupo from today on,
-- else fecha_inicio. At most 200 ids are read. Signed-in users only.
CREATE OR REPLACE FUNCTION public.talleres_primeras_clases(p_edicion_ids uuid[])
RETURNS TABLE (edicion_id uuid, fecha date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT te.id, coalesce(s.fecha_programada, te.fecha_inicio)
    FROM public.taller_ediciones te
    LEFT JOIN LATERAL (
      SELECT s.fecha_programada
        FROM public.talleres_crecimiento_cohortes c
        JOIN public.taller_grupos g ON g.cohorte_id = c.id AND g.estado <> 'cancelado'
        JOIN public.taller_sesiones s ON s.grupo_id = g.id
       WHERE c.taller_id = te.id AND s.estado = 'programada' AND s.fecha_programada >= public.talleres_hoy()
       ORDER BY s.fecha_programada, s.numero, s.id
       LIMIT 1
    ) s ON true
   WHERE auth.uid() IS NOT NULL
     AND te.id = ANY (coalesce(p_edicion_ids[1:200], '{}'::uuid[]))
     AND te.estado IN ('abierto', 'en_curso');
$function$;

COMMENT ON FUNCTION public.talleres_primeras_clases(uuid[]) IS
  'T10: first clase date (first programada sesión from today on, else fecha_inicio) of the abierto/en_curso ediciones among the ids (max 200), for Explorar. Signed-in users.';

REVOKE ALL ON FUNCTION public.talleres_primeras_clases(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_primeras_clases(uuid[]) TO authenticated, service_role;
