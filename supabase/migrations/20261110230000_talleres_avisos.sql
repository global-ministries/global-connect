-- T7 (odd/tasks/talleres-reserva-publica.md, S6 S11 S13 S14 S15) — the
-- automatic notices of the talleres: one in-app row (avisos_persona) plus
-- one email in an outbox per person and event, written by the database at
-- the moment the event happens, and sent by the app (Resend).
--
-- L6 (user, verbatim): notices by "correo y notificacion dentro de la app";
-- "por ahora no whatsapp, quizas un boton pero para que envien el mensaje
-- manualmente" (no WhatsApp here: the app only builds wa.me links); full
-- edición: "aviso a todos".
--
-- Adds:
--   A. talleres.avisos_config jsonb NOT NULL DEFAULT '{}': {"<tipo>": false}
--      turns one automatic notice off for every edición of that taller; a
--      missing key is on. Próximo Paso (slug 'proximo-paso', DPS, S10) is
--      set to all off here: its notices belong to DPS.
--   B. avisos_persona.clave + unique (persona_id, clave): the idempotency
--      key of a notice; the same event never writes two rows.
--   C. taller_avisos_envios: the email outbox. One row per notice and
--      person (unique clave), estado pendiente | enviado | fallido |
--      sin_correo, with attempts and a lease, like uno_a_uno_recordatorios.
--   D. talleres_aviso_emitir: the one writer (taller switch → in-app row →
--      outbox row), and small text helpers.
--   E. Triggers: AFTER INSERT / UPDATE OF estado, grupo_id on
--      taller_inscripciones → inscripcion_recibida, inscripcion_aprobada,
--      inscripcion_rechazada (with the motivo), grupo_asignado, and the
--      «Avísame» (S13: a place frees in an abierta edición → everyone in
--      taller_avisame_lugar not yet notified, at once, notificado_en set);
--      AFTER INSERT on taller_certificados → certificado_listo.
--      A notice never blocks the write that caused it (errors become a
--      WARNING).
--   F. Service_role job functions (the daily route app/api/cron/talleres):
--      talleres_avisos_recordatorios_encolar (tomorrow's programada
--      sesiones, America/Caracas, aprobadas of the grupo, one per sesión and
--      persona), talleres_avisos_envios_reclamar / _resultado (the outbox),
--      talleres_avisos_limpiar (expired code bodies, rate-limit rows older
--      than 7 days).
--   G. Coordinator RPCs: talleres_avisos_panel (notices center, read) and
--      talleres_avisos_config_guardar (one switch).
--
-- Not here: the «Cambio de fecha» notice stays with talleres_suspender_edicion
-- (T8a, always on: the answers depend on it); template text editing.
--
-- Rollback (in this order):
--   DROP TRIGGER IF EXISTS trg_taller_certificados_avisos ON public.taller_certificados;
--   DROP TRIGGER IF EXISTS trg_taller_inscripciones_avisos ON public.taller_inscripciones;
--   DROP FUNCTION IF EXISTS public.talleres_avisos_config_guardar(uuid, text, boolean),
--     public.talleres_avisos_panel(uuid), public.talleres_avisos_limpiar(),
--     public.talleres_avisos_envios_resultado(uuid, boolean, text),
--     public.talleres_avisos_envios_reclamar(integer, integer),
--     public.talleres_avisos_recordatorios_encolar(timestamptz),
--     public.talleres_avisos_certificado_trg(), public.talleres_avisos_inscripcion_trg(),
--     public.talleres_avisame_notificar(uuid), public.talleres_aviso_inscripcion(uuid, text, text),
--     public.talleres_aviso_grupo_info(uuid), public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text),
--     public.talleres_aviso_activo(uuid, text), public.talleres_aviso_hora(time),
--     public.talleres_aviso_fecha(date);
--   DROP TABLE IF EXISTS public.taller_avisos_envios;
--   DROP INDEX IF EXISTS public.avisos_persona_clave_key;
--   ALTER TABLE public.avisos_persona DROP COLUMN IF EXISTS clave;
--   ALTER TABLE public.talleres DROP COLUMN IF EXISTS avisos_config;

-- ===========================================================================
-- A. talleres.avisos_config
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN avisos_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT talleres_avisos_config_check CHECK (jsonb_typeof(avisos_config) = 'object');

COMMENT ON COLUMN public.talleres.avisos_config IS
  'T7: {"<tipo>": false} turns that automatic notice off for every edición of the taller; a missing key is on. Written by talleres_avisos_config_guardar.';

-- Próximo Paso belongs to DPS (S10): its people get no talleres notices
-- unless DPS turns them on in the notices center.
UPDATE public.talleres
   SET avisos_config = jsonb_build_object(
         'inscripcion_recibida', false, 'inscripcion_aprobada', false, 'inscripcion_rechazada', false,
         'grupo_asignado', false, 'recordatorio_clase', false, 'certificado_listo', false,
         'lugar_disponible', false)
 WHERE slug = 'proximo-paso';

-- ===========================================================================
-- B. avisos_persona.clave
-- ===========================================================================

ALTER TABLE public.avisos_persona
  ADD COLUMN clave text NULL
    CONSTRAINT avisos_persona_clave_check CHECK (clave IS NULL OR length(clave) BETWEEN 1 AND 200);

CREATE UNIQUE INDEX avisos_persona_clave_key
  ON public.avisos_persona (persona_id, clave) WHERE clave IS NOT NULL;

COMMENT ON COLUMN public.avisos_persona.clave IS
  'T7: idempotency key of an automatic notice (e.g. inscripcion_aprobada:<inscripción>:<persona>). One row per person and key.';

-- ===========================================================================
-- C. taller_avisos_envios (email outbox)
-- ===========================================================================

CREATE TABLE public.taller_avisos_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE CHECK (length(clave) BETWEEN 1 AND 200),
  tipo text NOT NULL CHECK (tipo ~ '^[a-z_]{1,40}$'),
  taller_id uuid NULL REFERENCES public.talleres(id) ON DELETE CASCADE,
  edicion_id uuid NULL REFERENCES public.taller_ediciones(id) ON DELETE CASCADE,
  persona_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  email text NULL CHECK (email IS NULL OR length(email) <= 254),
  nombre text NULL CHECK (nombre IS NULL OR length(nombre) <= 120),
  asunto text NOT NULL CHECK (length(asunto) BETWEEN 1 AND 200),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(datos) = 'object'),
  estado text NOT NULL DEFAULT 'pendiente'
    CONSTRAINT taller_avisos_envios_estado_check
    CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'sin_correo')),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  disponible_en timestamptz NOT NULL DEFAULT now(),
  enviado_en timestamptz NULL,
  error text NULL CHECK (error IS NULL OR length(error) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX taller_avisos_envios_pendientes_idx
  ON public.taller_avisos_envios (disponible_en) WHERE estado = 'pendiente';
CREATE INDEX taller_avisos_envios_taller_idx
  ON public.taller_avisos_envios (taller_id, created_at DESC);
CREATE INDEX taller_avisos_envios_persona_idx
  ON public.taller_avisos_envios (persona_id);
CREATE INDEX taller_avisos_envios_edicion_idx
  ON public.taller_avisos_envios (edicion_id);

COMMENT ON TABLE public.taller_avisos_envios IS
  'T7: email outbox of the talleres notices. One row per notice and person (clave = the avisos_persona clave). datos carries what the email shows (titulo, cuerpo, url, cta, taller, filas). estado sin_correo: nobody to email. Written by talleres_aviso_emitir, sent by the daily route through talleres_avisos_envios_reclamar/_resultado. Service_role only.';

ALTER TABLE public.taller_avisos_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taller_avisos_envios FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_avisos_envios TO service_role;

-- ===========================================================================
-- D. Writer and text helpers
-- ===========================================================================

-- 'jueves 5 de noviembre' (no locale dependency).
CREATE OR REPLACE FUNCTION public.talleres_aviso_fecha(p_dia date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_dia IS NULL THEN NULL ELSE
    (ARRAY['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow FROM p_dia)::int + 1]
    || ' ' || extract(day FROM p_dia)::int || ' de '
    || (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month FROM p_dia)::int]
  END;
$function$;

-- '7:00 p. m.'
CREATE OR REPLACE FUNCTION public.talleres_aviso_hora(p_hora time)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_hora IS NULL THEN NULL ELSE
    (((extract(hour FROM p_hora)::int + 11) % 12) + 1) || ':' || to_char(p_hora, 'MI')
    || CASE WHEN extract(hour FROM p_hora) < 12 THEN ' a. m.' ELSE ' p. m.' END
  END;
$function$;

-- The taller's switch for one notice: on unless avisos_config says false.
CREATE OR REPLACE FUNCTION public.talleres_aviso_activo(p_taller_id uuid, p_tipo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(
    (SELECT (t.avisos_config -> p_tipo) IS DISTINCT FROM 'false'::jsonb FROM public.talleres t WHERE t.id = p_taller_id),
    true);
$function$;

-- The one writer of an automatic notice. With the taller's switch on it
-- writes the in-app row (when p_persona_id is set) and the outbox row,
-- both keyed by p_clave, so a repeated event writes nothing. The email goes
-- to p_email, else to the persona's email; without one the outbox row is
-- sin_correo (the coordinator sees it and can write by hand). Returns
-- whether anything new was written.
CREATE OR REPLACE FUNCTION public.talleres_aviso_emitir(
  p_tipo text, p_clave text, p_persona_id uuid, p_taller_id uuid, p_edicion_id uuid,
  p_titulo text, p_cuerpo text, p_url text, p_asunto text, p_datos jsonb,
  p_cta text DEFAULT NULL, p_email text DEFAULT NULL, p_nombre text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_taller text;
  v_datos jsonb;
  v_nuevo boolean := false;
  v_filas integer;
BEGIN
  IF NOT public.talleres_aviso_activo(p_taller_id, p_tipo) THEN
    RETURN false;
  END IF;

  SELECT t.nombre INTO v_taller FROM public.talleres t WHERE t.id = p_taller_id;
  v_datos := coalesce(p_datos, '{}'::jsonb)
    || jsonb_build_object('taller_id', p_taller_id, 'edicion_id', p_edicion_id, 'taller', v_taller);

  IF p_persona_id IS NOT NULL THEN
    INSERT INTO public.avisos_persona (persona_id, tipo, titulo, cuerpo, url, datos, clave, expira_at)
    VALUES (p_persona_id, p_tipo, p_titulo, p_cuerpo, p_url, v_datos, p_clave,
            CASE WHEN v_datos ? 'expira_at' THEN (v_datos ->> 'expira_at')::timestamptz END)
    ON CONFLICT (persona_id, clave) WHERE clave IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    v_nuevo := v_filas > 0;

    SELECT coalesce(v_email, nullif(btrim(u.email), '')),
           coalesce(v_nombre, nullif(split_part(btrim(u.nombre), ' ', 1), ''))
      INTO v_email, v_nombre
      FROM public.usuarios u WHERE u.id = p_persona_id;
  END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_email := NULL;
  END IF;

  INSERT INTO public.taller_avisos_envios (clave, tipo, taller_id, edicion_id, persona_id, email, nombre, asunto, datos, estado)
  VALUES (p_clave, p_tipo, p_taller_id, p_edicion_id, p_persona_id, v_email, left(v_nombre, 120), left(p_asunto, 200),
          v_datos || jsonb_build_object('titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'cta', p_cta),
          CASE WHEN v_email IS NULL THEN 'sin_correo' ELSE 'pendiente' END)
  ON CONFLICT (clave) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN v_nuevo OR v_filas > 0;
END;
$function$;

COMMENT ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) IS
  'T7: writes one automatic notice (in-app row + email outbox row) keyed by p_clave when the taller''s switch for p_tipo is on. Idempotent. Internal (triggers and job functions).';

REVOKE ALL ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) TO service_role;

-- A grupo for the notices: {"grupo","facilitadores" ("Ana y Luis"),
-- "fecha","hora" (its next programada sesión), "lugar" (the edición's)}.
CREATE OR REPLACE FUNCTION public.talleres_aviso_grupo_info(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'grupo', g.nombre,
    'facilitadores', (
      SELECT CASE WHEN cardinality(n.a) = 0 THEN NULL
                  WHEN cardinality(n.a) = 1 THEN n.a[1]
                  ELSE array_to_string(n.a[1:cardinality(n.a) - 1], ', ') || ' y ' || n.a[cardinality(n.a)] END
        FROM (SELECT coalesce(array_agg(DISTINCT split_part(btrim(u.nombre), ' ', 1)
                                        ORDER BY split_part(btrim(u.nombre), ' ', 1)), '{}'::text[]) AS a
                FROM public.taller_grupo_asignaciones a
                JOIN public.usuarios u ON u.id = a.persona_id
               WHERE a.grupo_id = g.id AND a.activo AND a.rol = 'lider'
                 AND nullif(btrim(u.nombre), '') IS NOT NULL) n),
    'fecha', public.talleres_aviso_fecha(s.fecha_programada),
    'hora', public.talleres_aviso_hora(coalesce(
      s.meeting_time_override,
      CASE WHEN te.recurrence_rule ->> 'start_time' ~ '^\d{2}:\d{2}'
           THEN substring(te.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')::time END)),
    'lugar', te.lugar
  )
    FROM public.taller_grupos g
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones te ON te.id = c.taller_id
    LEFT JOIN LATERAL (
      SELECT s.fecha_programada, s.meeting_time_override
        FROM public.taller_sesiones s
       WHERE s.grupo_id = g.id AND s.estado = 'programada' AND s.fecha_programada >= public.talleres_hoy()
       ORDER BY s.fecha_programada, s.numero
       LIMIT 1
    ) s ON true
   WHERE g.id = p_grupo_id;
$function$;

REVOKE ALL ON FUNCTION public.talleres_aviso_grupo_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_grupo_info(uuid) TO service_role;

-- One inscription notice for its principal and its companero. p_evento:
-- recibida | aprobada | rechazada | grupo. The companero of a recibida
-- that is por_verificar already got the reservation's own notice.
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
    v_cuerpo := format('No pudimos aprobar tu inscripción en %s.', v_taller.nombre)
      || CASE WHEN nullif(btrim(coalesce(p_motivo, '')), '') IS NOT NULL
              THEN format(' Motivo: %s.', rtrim(left(btrim(p_motivo), 600), '.')) ELSE '' END
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

-- S13 «aviso a todos»: when the abierta edición has a free place, everyone
-- in taller_avisame_lugar not yet notified gets the notice at once (email
-- with the reservation link, in-app when the email is a known person) and
-- notificado_en is set. First come first served: nobody is reserved a
-- place. Returns how many were notified.
CREATE OR REPLACE FUNCTION public.talleres_avisame_notificar(p_edicion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
  v_cupo integer;
  v_disponibles integer;
  v_fila record;
  v_url text;
  v_cuerpo text;
  v_n integer := 0;
BEGIN
  SELECT * INTO v_te FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF v_te.id IS NULL OR public.talleres_estado_efectivo(v_te) <> 'abierto' THEN
    RETURN 0;
  END IF;
  SELECT c.cupo, c.disponibles INTO v_cupo, v_disponibles FROM public.talleres_cupo_edicion_calculo(p_edicion_id) c;
  IF coalesce(v_cupo, 0) = 0 OR coalesce(v_disponibles, 0) = 0 THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
  IF NOT public.talleres_aviso_activo(v_taller.id, 'lugar_disponible') THEN
    RETURN 0;
  END IF;

  v_url := '/talleres/reservar/' || v_taller.slug;
  v_cuerpo := format('Se liberó un lugar en %s', v_taller.nombre)
    || CASE WHEN v_te.fecha_inicio >= public.talleres_hoy() THEN format(' (empieza el %s)', public.talleres_aviso_fecha(v_te.fecha_inicio)) ELSE '' END
    || '. Avisamos a todas las personas que esperaban: quien reserve primero se queda con el lugar.';

  FOR v_fila IN
    UPDATE public.taller_avisame_lugar a
       SET notificado_en = now()
     WHERE a.edicion_id = p_edicion_id AND a.notificado_en IS NULL
    RETURNING a.id, a.nombre, a.email, a.usuario_id
  LOOP
    PERFORM public.talleres_aviso_emitir(
      'lugar_disponible', 'lugar_disponible:' || v_fila.id::text, v_fila.usuario_id, v_taller.id, v_te.id,
      'Se liberó un lugar', v_cuerpo, v_url, format('Se liberó un lugar en %s', v_taller.nombre),
      jsonb_build_object('filas', jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot))),
      'Reservar mi lugar', v_fila.email, split_part(btrim(v_fila.nombre), ' ', 1));
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisame_notificar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisame_notificar(uuid) TO service_role;

-- ===========================================================================
-- E. Triggers
-- ===========================================================================

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
          PERFORM public.talleres_aviso_inscripcion(NEW.id, 'rechazada', NEW.motivo_no_aprobado);
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

DROP TRIGGER IF EXISTS trg_taller_inscripciones_avisos ON public.taller_inscripciones;
CREATE TRIGGER trg_taller_inscripciones_avisos
  AFTER INSERT OR UPDATE OF estado, grupo_id ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_avisos_inscripcion_trg();

CREATE OR REPLACE FUNCTION public.talleres_avisos_certificado_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
BEGIN
  BEGIN
    IF NEW.revocado_at IS NULL THEN
      SELECT * INTO v_te FROM public.taller_ediciones te WHERE te.id = NEW.taller_id;
      SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
      IF v_taller.id IS NOT NULL THEN
        PERFORM public.talleres_aviso_emitir(
          'certificado_listo', 'certificado_listo:' || NEW.id::text, NEW.persona_id, v_taller.id, v_te.id,
          'Tu certificado está listo',
          format('Completaste %s. Descarga tu certificado o guárdalo en la app.', v_taller.nombre),
          '/talleres/mi-recorrido/certificados/' || NEW.id::text,
          format('Completaste %s: tu certificado está listo', v_taller.nombre),
          jsonb_build_object('certificado_id', NEW.id,
                             'filas', jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot))),
          'Ver mi certificado');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'talleres_avisos: % (%), certificado %', SQLERRM, SQLSTATE, NEW.id;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_certificado_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_taller_certificados_avisos ON public.taller_certificados;
CREATE TRIGGER trg_taller_certificados_avisos
  AFTER INSERT ON public.taller_certificados
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_avisos_certificado_trg();

-- ===========================================================================
-- F. Daily job (service_role)
-- ===========================================================================

-- «Mañana es tu clase»: every programada sesión whose date is the day after
-- p_ahora in America/Caracas, of a live grupo and edición, for each
-- aprobada inscription of that grupo (principal and companero). One notice
-- per (sesión, persona). The in-app row expires at the end of the class
-- day. Returns how many new notices were written.
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
  v_n integer := 0;
BEGIN
  FOR v_fila IN
    SELECT s.id AS sesion_id, s.numero, s.tema, s.fecha_programada, s.meeting_time_override,
           g.id AS grupo_id, te.id AS edicion_id, te.lugar, te.recurrence_rule, te.nombre_snapshot,
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
    v_cuerpo := 'Clase ' || v_fila.numero
      || CASE WHEN nullif(btrim(coalesce(v_fila.tema, '')), '') IS NOT NULL THEN ': ' || btrim(v_fila.tema) ELSE '' END
      || ' de ' || v_fila.taller || ' · ' || concat_ws(' · ', public.talleres_aviso_fecha(v_fila.fecha_programada), v_hora, v_fila.lugar) || '.'
      || CASE WHEN v_info ->> 'facilitadores' IS NOT NULL THEN ' Facilita ' || (v_info ->> 'facilitadores') || '.' ELSE '' END;
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
                     THEN jsonb_build_array(jsonb_build_array('Facilita', v_info ->> 'facilitadores')) ELSE '[]'::jsonb END),
         'Ver mi taller') THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) IS
  'T7: writes «Mañana es tu clase» (in-app + email outbox) for every programada sesión of tomorrow (America/Caracas) to the aprobadas of its grupo, once per sesión and persona. Returns the new notices. service_role (daily route).';

REVOKE ALL ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) TO service_role;

-- Leases up to p_limite due emails for 10 minutes (attempt + 1), keeping
-- the outbox within p_tope_diario sent emails per UTC day (Resend's quota
-- day). What does not fit waits for the next run.
CREATE OR REPLACE FUNCTION public.talleres_avisos_envios_reclamar(p_limite integer DEFAULT 50, p_tope_diario integer DEFAULT 40)
RETURNS TABLE (id uuid, clave text, tipo text, email text, nombre text, asunto text, datos jsonb, intentos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_enviados_hoy integer;
  v_limite integer;
BEGIN
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100 THEN
    RAISE EXCEPTION 'El límite debe estar entre 1 y 100.' USING ERRCODE = '22023';
  END IF;
  IF p_tope_diario IS NULL OR p_tope_diario < 0 OR p_tope_diario > 10000 THEN
    RAISE EXCEPTION 'El tope diario debe estar entre 0 y 10000.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_enviados_hoy
    FROM public.taller_avisos_envios e
   WHERE e.estado = 'enviado'
     AND (e.enviado_en AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date;

  v_limite := least(p_limite, greatest(p_tope_diario - v_enviados_hoy, 0));
  IF v_limite = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lote AS (
    SELECT e.id
      FROM public.taller_avisos_envios e
     WHERE e.estado = 'pendiente' AND e.disponible_en <= now()
     ORDER BY e.disponible_en, e.created_at, e.id
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
   ORDER BY t.created_at, t.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_envios_reclamar(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_envios_reclamar(integer, integer) TO service_role;

-- Records one send: enviado, or back to pendiente after 2^intentos minutes,
-- and fallido after the fifth attempt.
CREATE OR REPLACE FUNCTION public.talleres_avisos_envios_resultado(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_ok THEN
    UPDATE public.taller_avisos_envios e
       SET estado = 'enviado', enviado_en = now(), error = NULL
     WHERE e.id = p_id;
  ELSE
    UPDATE public.taller_avisos_envios e
       SET estado = CASE WHEN e.intentos >= 5 THEN 'fallido' ELSE 'pendiente' END,
           disponible_en = now() + make_interval(mins => power(2, least(e.intentos, 6))::integer),
           error = left(coalesce(p_error, 'Error desconocido'), 500)
     WHERE e.id = p_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese envío.' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_envios_resultado(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_envios_resultado(uuid, boolean, text) TO service_role;

-- Drops the code text of expired codigo_reserva notices (the row stays as
-- a trace) and the public rate-limit rows older than 7 days (the longest
-- window is one day). Returns {"codigos","limites"}.
CREATE OR REPLACE FUNCTION public.talleres_avisos_limpiar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_codigos integer;
  v_limites integer;
BEGIN
  UPDATE public.avisos_persona a
     SET cuerpo = NULL
   WHERE a.tipo = 'codigo_reserva' AND a.expira_at <= now() AND a.cuerpo IS NOT NULL;
  GET DIAGNOSTICS v_codigos = ROW_COUNT;

  DELETE FROM public.reserva_publica_limites l WHERE l.created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_limites = ROW_COUNT;

  RETURN jsonb_build_object('codigos', v_codigos, 'limites', v_limites);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_limpiar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_limpiar() TO service_role;

-- ===========================================================================
-- G. Notices center (coordinators)
-- ===========================================================================

-- {"config","puede_editar","mes":{"<tipo>":n},"resumen":{"enviados_mes",
--  "sin_entregar","sin_correo"},"historial":[last 50]} for readers of the
-- taller's node (director/coordinator read or write, admin.manage). A
-- phone is only returned for rows nobody could email (sin_correo or
-- fallido), for the manual «Abrir en WhatsApp» (S14).
CREATE OR REPLACE FUNCTION public.talleres_avisos_panel(p_taller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_taller public.talleres%ROWTYPE;
  v_mes timestamptz := (date_trunc('month', now() AT TIME ZONE 'America/Caracas')) AT TIME ZONE 'America/Caracas';
  v_editar boolean;
BEGIN
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = p_taller_id;
  IF v_taller.id IS NULL THEN
    RAISE EXCEPTION 'taller_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  v_editar := public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_taller.dream_team_equipo_id)
           OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_taller.dream_team_equipo_id)
           OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_taller.dream_team_equipo_id);
  IF NOT (v_editar
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_taller.dream_team_equipo_id)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_taller.dream_team_equipo_id)) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'config', v_taller.avisos_config,
    'puede_editar', v_editar,
    'mes', coalesce((
      SELECT jsonb_object_agg(x.tipo, x.n)
        FROM (SELECT e.tipo, count(*) AS n FROM public.taller_avisos_envios e
               WHERE e.taller_id = p_taller_id AND e.created_at >= v_mes GROUP BY e.tipo) x), '{}'::jsonb),
    'resumen', (
      SELECT jsonb_build_object(
        'enviados_mes', count(*) FILTER (WHERE e.created_at >= v_mes),
        'sin_entregar', count(*) FILTER (WHERE e.estado = 'fallido'),
        'sin_correo', count(*) FILTER (WHERE e.estado = 'sin_correo' AND e.created_at >= v_mes))
        FROM public.taller_avisos_envios e WHERE e.taller_id = p_taller_id),
    'historial', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'tipo', h.tipo, 'persona', h.persona, 'estado', h.estado, 'intentos', h.intentos,
               'error', h.error, 'creado_en', h.created_at, 'enviado_en', h.enviado_en, 'leido_en', h.leido_at,
               'en_app', h.en_app, 'telefono', h.telefono, 'texto', h.texto)
             ORDER BY h.created_at DESC, h.id)
        FROM (
          SELECT e.id, e.tipo, e.estado, e.intentos, e.error, e.created_at, e.enviado_en,
                 coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), e.nombre, 'Sin nombre') AS persona,
                 ap.leido_at, (ap.id IS NOT NULL) AS en_app,
                 CASE WHEN e.estado IN ('sin_correo', 'fallido') THEN nullif(btrim(u.telefono), '') END AS telefono,
                 concat_ws(E'\n', e.datos ->> 'titulo', e.datos ->> 'cuerpo') AS texto
            FROM public.taller_avisos_envios e
            LEFT JOIN public.usuarios u ON u.id = e.persona_id
            LEFT JOIN public.avisos_persona ap ON ap.persona_id = e.persona_id AND ap.clave = e.clave
           WHERE e.taller_id = p_taller_id
           ORDER BY e.created_at DESC, e.id
           LIMIT 50) h), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_panel(uuid) TO authenticated, service_role;

-- One switch of the taller's automatic notices (coordinator.write,
-- director.write or admin.manage of its node). Returns the new config.
CREATE OR REPLACE FUNCTION public.talleres_avisos_config_guardar(p_taller_id uuid, p_tipo text, p_activo boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_equipo uuid;
  v_config jsonb;
BEGIN
  IF p_tipo IS NULL OR p_activo IS NULL OR p_tipo NOT IN (
       'inscripcion_recibida', 'inscripcion_aprobada', 'inscripcion_rechazada', 'grupo_asignado',
       'recordatorio_clase', 'certificado_listo', 'lugar_disponible') THEN
    RAISE EXCEPTION 'aviso_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT t.dream_team_equipo_id INTO v_equipo FROM public.talleres t WHERE t.id = p_taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'taller_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_equipo)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo)) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  UPDATE public.talleres t
     SET avisos_config = CASE WHEN p_activo THEN t.avisos_config - p_tipo
                              ELSE t.avisos_config || jsonb_build_object(p_tipo, false) END
   WHERE t.id = p_taller_id
  RETURNING t.avisos_config INTO v_config;
  RETURN v_config;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_config_guardar(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_config_guardar(uuid, text, boolean) TO authenticated, service_role;
