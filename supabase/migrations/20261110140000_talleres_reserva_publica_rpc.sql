-- T5a (odd/tasks/talleres-reserva-publica.md) — the public reservation
-- functions (S3, S4, S5, S11, S12, S13) over the storage of
-- 20261110130000 and the writer of 20261110120000.
--
-- Every function here is service_role only (the Next.js API routes call
-- them with the service key after hashing the client IP with a server
-- salt). Inputs the server builds (hashes) raise 22023 datos_invalidos;
-- everything a visitor typed returns {"estado": ...}. Replies never carry
-- another person's data: a masked email, and a first name only after the
-- person proved their identity with a code.
--
--   talleres_publico_catalogo() / talleres_publico_taller(slug): talleres
--     with publico = true and estado active, with their ediciones whose
--     effective estado is abierto.
--   talleres_reserva_identificar: cédula → nuevo | sin_correo | codigo.
--   talleres_reserva_codigo_verificar / _reenviar: the one-time code.
--   talleres_reserva_crear: the inscription (always pendiente, origen
--     publico, S5).
--   talleres_avisame_lugar_agregar: "avísame si se libera un lugar".
-- Also: invitacion_acceso_pendientes_de_envio lists a taller_publico
-- invitation right away (sent at inscription, S4), whatever the taller's
-- momento_envio_acceso.
--
-- Pareja rules (S12): the partner is {token} (an existing person who
-- confirmed with their own code), {ficha_nueva} (a new ficha, email
-- optional, NO invitation) or {pendiente_cedula} (an existing adult who
-- could not confirm now: companero is set, por_verificar = true so the
-- coordinator confirms before approving, and the partner gets an in-app
-- notice). genero_requerido applies to the principal only.
--
-- Rollback: DROP FUNCTION IF EXISTS every function created below (reverse
-- order) and re-create invitacion_acceso_pendientes_de_envio() with the
-- body of 20261004150000.

-- ===========================================================================
-- A. Internal helpers
-- ===========================================================================

-- True when one unit was consumed (and recorded); false, recording
-- nothing, when the ip (or the key, or everyone) already used its units in
-- the window. Callers RETURN the refusal so the recorded unit stays.
CREATE OR REPLACE FUNCTION public.reserva_publica_consumir(
  p_accion text, p_ip_hash text, p_clave text,
  p_max_ip integer, p_ventana_ip interval,
  p_max_clave integer, p_ventana_clave interval,
  p_max_global integer, p_ventana_global interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_clave text;
BEGIN
  IF p_clave IS NOT NULL THEN
    v_clave := encode(sha256(convert_to(p_clave, 'UTF8')), 'hex');
  END IF;

  -- Always ip, then key, then global: one lock order for every caller.
  PERFORM pg_advisory_xact_lock(hashtextextended('reserva_publica:' || p_accion || ':ip:' || p_ip_hash, 0));
  IF (SELECT count(*) FROM public.reserva_publica_limites l
       WHERE l.accion = p_accion AND l.ip_hash = p_ip_hash
         AND l.created_at > now() - p_ventana_ip) >= p_max_ip THEN
    RETURN false;
  END IF;
  IF v_clave IS NOT NULL AND p_max_clave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('reserva_publica:' || p_accion || ':clave:' || v_clave, 0));
    IF (SELECT count(*) FROM public.reserva_publica_limites l
         WHERE l.accion = p_accion AND l.clave = v_clave
           AND l.created_at > now() - p_ventana_clave) >= p_max_clave THEN
      RETURN false;
    END IF;
  END IF;
  IF p_max_global IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('reserva_publica:' || p_accion || ':global', 0));
    IF (SELECT count(*) FROM public.reserva_publica_limites l
         WHERE l.accion = p_accion AND l.created_at > now() - p_ventana_global) >= p_max_global THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.reserva_publica_limites (ip_hash, accion, clave) VALUES (p_ip_hash, p_accion, v_clave);
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserva_publica_consumir(text, text, text, integer, interval, integer, interval, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserva_publica_consumir(text, text, text, integer, interval, integer, interval, integer, interval) TO service_role;

-- The edición can be reserved publicly: its taller is publico and active,
-- it has a cohorte and its effective estado is abierto.
CREATE OR REPLACE FUNCTION public.talleres_reserva_edicion_publica(p_edicion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.taller_ediciones te
      JOIN public.talleres t ON t.id = te.taller_id
     WHERE te.id = p_edicion_id
       AND t.publico AND t.estado = 'active'
       AND public.talleres_estado_efectivo(te) = 'abierto'
       AND EXISTS (SELECT 1 FROM public.talleres_crecimiento_cohortes c WHERE c.taller_id = te.id)
  );
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_edicion_publica(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_edicion_publica(uuid) TO service_role;

-- "ana.ruiz@gmail.com" → "a***@g***.com".
CREATE OR REPLACE FUNCTION public.talleres_reserva_email_mascara(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_email IS NULL OR position('@' IN p_email) = 0 THEN NULL
    ELSE left(split_part(p_email, '@', 1), 1) || '***@' || left(split_part(p_email, '@', 2), 1) || '***'
         || coalesce(substring(split_part(p_email, '@', 2) FROM '\.[^.]+$'), '')
  END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_email_mascara(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_email_mascara(text) TO service_role;

-- A typed ficha, normalized: {"ok":true,"cedula","nombre","apellido",
-- "email"|null,"telefono"|null,"genero","fecha_nacimiento"} or
-- {"ok":false,"campo":<first invalid field>}. Same field rules as
-- talleres_inscribirme's ficha_nueva.
CREATE OR REPLACE FUNCTION public.talleres_reserva_ficha(p_ficha jsonb, p_contacto_requerido boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cedula text;
  v_nombre text;
  v_apellido text;
  v_email text;
  v_telefono text;
  v_fecha date;
BEGIN
  IF p_ficha IS NULL OR jsonb_typeof(p_ficha) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'ficha');
  END IF;
  BEGIN
    v_cedula := public.talleres_cedula_pareja_normalizada(p_ficha ->> 'cedula');
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'cedula');
  END;
  v_nombre := regexp_replace(btrim(coalesce(p_ficha ->> 'nombre', '')), '\s+', ' ', 'g');
  IF length(v_nombre) NOT BETWEEN 1 AND 80 THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'nombre');
  END IF;
  v_apellido := regexp_replace(btrim(coalesce(p_ficha ->> 'apellido', '')), '\s+', ' ', 'g');
  IF length(v_apellido) NOT BETWEEN 1 AND 80 THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'apellido');
  END IF;
  v_email := nullif(lower(btrim(coalesce(p_ficha ->> 'email', ''))), '');
  IF (v_email IS NULL AND p_contacto_requerido)
     OR length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'email');
  END IF;
  v_telefono := nullif(btrim(coalesce(p_ficha ->> 'telefono', '')), '');
  IF (v_telefono IS NULL AND p_contacto_requerido) OR v_telefono !~ '^\+?[0-9 ()-]{7,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'telefono');
  END IF;
  IF (p_ficha ->> 'genero') IS NULL OR (p_ficha ->> 'genero') NOT IN ('Masculino', 'Femenino') THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'genero');
  END IF;
  IF coalesce(p_ficha ->> 'fecha_nacimiento', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'fecha_nacimiento');
  END IF;
  BEGIN
    v_fecha := (p_ficha ->> 'fecha_nacimiento')::date;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'fecha_nacimiento');
  END;
  IF v_fecha <= DATE '1900-01-01' OR v_fecha > public.talleres_hoy() THEN
    RETURN jsonb_build_object('ok', false, 'campo', 'fecha_nacimiento');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'cedula', v_cedula, 'nombre', v_nombre, 'apellido', v_apellido,
    'email', v_email, 'telefono', v_telefono, 'genero', p_ficha ->> 'genero', 'fecha_nacimiento', v_fecha
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_ficha(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_ficha(jsonb, boolean) TO service_role;

-- Creates the ficha of a normalized talleres_reserva_ficha() value and
-- returns its id, or NULL when the cédula or the email already exists
-- (usuarios or auth.users, any case) or the person is under 18: the three
-- read the same.
CREATE OR REPLACE FUNCTION public.talleres_reserva_ficha_crear(p_ficha jsonb, p_estado_civil text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := p_ficha ->> 'email';
  v_fecha date := (p_ficha ->> 'fecha_nacimiento')::date;
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.cedula = p_ficha ->> 'cedula')
     OR (v_email IS NOT NULL AND (
           EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email)
           OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email)))
     OR v_fecha > (public.talleres_hoy() - interval '18 years')::date THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.usuarios (cedula, nombre, apellido, email, telefono, fecha_nacimiento, genero, estado_civil)
  VALUES (p_ficha ->> 'cedula', p_ficha ->> 'nombre', p_ficha ->> 'apellido', v_email, p_ficha ->> 'telefono', v_fecha,
          (p_ficha ->> 'genero')::public.enum_genero, p_estado_civil::public.enum_estado_civil)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_ficha_crear(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_ficha_crear(jsonb, text) TO service_role;

-- Under 18 by fecha_nacimiento; NULL and the 1900-01-01 placeholder are
-- unknown and pass (the talleres_pareja_por_cedula rule).
CREATE OR REPLACE FUNCTION public.talleres_reserva_es_menor(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
     WHERE u.id = p_persona_id
       AND u.fecha_nacimiento IS NOT NULL
       AND u.fecha_nacimiento <> DATE '1900-01-01'
       AND u.fecha_nacimiento > (public.talleres_hoy() - interval '18 years')::date
  );
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_es_menor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_es_menor(uuid) TO service_role;

-- Expires the person's live code notices and drops the code text.
CREATE OR REPLACE FUNCTION public.talleres_reserva_avisos_retirar(p_persona_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.avisos_persona
     SET cuerpo = NULL, expira_at = now()
   WHERE persona_id = p_persona_id AND tipo = 'codigo_reserva'
     AND (expira_at IS NULL OR expira_at > now());
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_avisos_retirar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_avisos_retirar(uuid) TO service_role;

-- What the sender needs for one code row: {"codigo_id","email_mascara",
-- "envio":{"email","nombre"}} plus, when p_aviso_texto is given and the
-- person has an account, a codigo_reserva notice that expires with the
-- code. "envio" is for the email only and never goes to the browser.
CREATE OR REPLACE FUNCTION public.talleres_reserva_codigo_envio(p_codigo_id uuid, p_aviso_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_codigo public.taller_reserva_codigos%ROWTYPE;
  v_persona public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_codigo FROM public.taller_reserva_codigos c WHERE c.id = p_codigo_id;
  SELECT * INTO v_persona FROM public.usuarios u WHERE u.id = v_codigo.usuario_id;

  PERFORM public.talleres_reserva_avisos_retirar(v_persona.id);
  IF p_aviso_texto IS NOT NULL AND v_persona.auth_id IS NOT NULL THEN
    INSERT INTO public.avisos_persona (persona_id, tipo, titulo, cuerpo, datos, expira_at)
    VALUES (v_persona.id, 'codigo_reserva', 'Tu código para reservar', p_aviso_texto,
            jsonb_build_object('codigo_id', v_codigo.id, 'edicion_id', v_codigo.edicion_id), v_codigo.expira_en);
  END IF;

  RETURN jsonb_build_object(
    'codigo_id', v_codigo.id,
    'email_mascara', public.talleres_reserva_email_mascara(lower(btrim(v_persona.email))),
    'envio', jsonb_build_object('email', btrim(v_persona.email), 'nombre', split_part(btrim(v_persona.nombre), ' ', 1))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_codigo_envio(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_codigo_envio(uuid, text) TO service_role;

-- ===========================================================================
-- B. Public catalog
-- ===========================================================================

-- One public taller with its abierto ediciones. Per edición: dates, lugar,
-- clases (sesiones_snapshot), hora (the first class time when the grupos
-- carry one, else recurrence_rule.start_time, else null), cupo (null: no
-- limit), lugares_libres, lleno and the first names of the active grupo
-- leaders. No other personal data.
CREATE OR REPLACE FUNCTION public.talleres_publico_taller_json(p_taller_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'slug', t.slug, 'nombre', t.nombre, 'descripcion', t.descripcion, 'tipo', t.tipo,
    'vinculo', t.vinculo, 'genero_requerido', t.genero_requerido, 'duracion_minutos', t.duracion_minutos,
    'ediciones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', te.id, 'fecha_inicio', te.fecha_inicio, 'fecha_fin', te.fecha_fin,
               'cierre_inscripcion', te.cierre_inscripcion, 'lugar', te.lugar, 'clases', te.sesiones_snapshot,
               'hora', coalesce(
                 (SELECT to_char(s.meeting_time_override, 'HH24:MI')
                    FROM public.taller_sesiones s
                    JOIN public.taller_grupos g ON g.id = s.grupo_id
                    JOIN public.talleres_crecimiento_cohortes co ON co.id = g.cohorte_id
                   WHERE co.taller_id = te.id AND g.estado <> 'cancelado' AND s.meeting_time_override IS NOT NULL
                   ORDER BY s.fecha_programada, s.numero LIMIT 1),
                 substring(te.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')),
               'cupo', nullif(c.cupo, 0),
               'lugares_libres', CASE WHEN c.cupo > 0 THEN c.disponibles END,
               'lleno', c.cupo > 0 AND c.disponibles = 0,
               'facilitadores', coalesce((
                 SELECT jsonb_agg(DISTINCT split_part(btrim(u.nombre), ' ', 1) ORDER BY split_part(btrim(u.nombre), ' ', 1))
                   FROM public.taller_grupo_asignaciones a
                   JOIN public.taller_grupos g ON g.id = a.grupo_id
                   JOIN public.talleres_crecimiento_cohortes co ON co.id = g.cohorte_id
                   JOIN public.usuarios u ON u.id = a.persona_id
                  WHERE co.taller_id = te.id AND a.activo AND a.rol = 'lider' AND g.estado <> 'cancelado'), '[]'::jsonb)
             ) ORDER BY te.fecha_inicio, te.id)
        FROM public.taller_ediciones te
        CROSS JOIN LATERAL public.talleres_cupo_edicion_calculo(te.id) c
       WHERE te.taller_id = t.id
         AND public.talleres_estado_efectivo(te) = 'abierto'
         AND EXISTS (SELECT 1 FROM public.talleres_crecimiento_cohortes co WHERE co.taller_id = te.id)
    ), '[]'::jsonb)
  )
    FROM public.talleres t
   WHERE t.id = p_taller_id AND t.publico AND t.estado = 'active';
$function$;

REVOKE ALL ON FUNCTION public.talleres_publico_taller_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_publico_taller_json(uuid) TO service_role;

-- Every public taller (by nombre), each with its abierto ediciones.
CREATE OR REPLACE FUNCTION public.talleres_publico_catalogo()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(public.talleres_publico_taller_json(t.id) ORDER BY t.nombre), '[]'::jsonb)
    FROM public.talleres t
   WHERE t.publico AND t.estado = 'active';
$function$;

REVOKE ALL ON FUNCTION public.talleres_publico_catalogo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_publico_catalogo() TO service_role;

-- One public taller by slug, or NULL.
CREATE OR REPLACE FUNCTION public.talleres_publico_taller(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.talleres_publico_taller_json(t.id)
    FROM public.talleres t
   WHERE t.slug = p_slug AND t.publico AND t.estado = 'active';
$function$;

REVOKE ALL ON FUNCTION public.talleres_publico_taller(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_publico_taller(text) TO service_role;

-- ===========================================================================
-- C. Identify, code, resend
-- ===========================================================================

-- {"estado":"cerrada"|"invalido","campo":"cedula"|"limite"|"nuevo"|
--  "sin_correo"} or {"estado":"codigo","codigo_id","email_mascara",
--  "envio":{"email","nombre"}}. The app generated the 6-digit code and
-- passes only its salted hash; p_aviso_texto (with the plain code) is
-- stored only in the person's in-app notice, which expires with the code.
-- A new code blocks the earlier live ones of the same person and edición.
-- Limits: 10 per ip per 10 min, 5 per cédula per hour, 600 per hour.
CREATE OR REPLACE FUNCTION public.talleres_reserva_identificar(
  p_edicion_id uuid, p_cedula text, p_ip_hash text, p_codigo_hash text, p_aviso_texto text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cedula text;
  v_persona public.usuarios%ROWTYPE;
  v_codigo_id uuid;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_codigo_hash IS NULL OR p_codigo_hash !~ '^[0-9a-f]{64}$'
     OR length(p_aviso_texto) > 500 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT public.talleres_reserva_edicion_publica(p_edicion_id) THEN
    RETURN jsonb_build_object('estado', 'cerrada');
  END IF;
  BEGIN
    v_cedula := public.talleres_cedula_pareja_normalizada(p_cedula);
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN jsonb_build_object('estado', 'invalido', 'campo', 'cedula');
  END;
  IF NOT public.reserva_publica_consumir('reserva_identificar', p_ip_hash, v_cedula,
       10, interval '10 minutes', 5, interval '1 hour', 600, interval '1 hour') THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  SELECT * INTO v_persona FROM public.usuarios u WHERE u.cedula = v_cedula;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'nuevo');
  END IF;
  IF nullif(btrim(v_persona.email), '') IS NULL THEN
    RETURN jsonb_build_object('estado', 'sin_correo');
  END IF;

  UPDATE public.taller_reserva_codigos
     SET bloqueado = true
   WHERE usuario_id = v_persona.id AND edicion_id = p_edicion_id
     AND usado_en IS NULL AND NOT bloqueado;

  INSERT INTO public.taller_reserva_codigos (usuario_id, edicion_id, codigo_hash, ip_hash)
  VALUES (v_persona.id, p_edicion_id, p_codigo_hash, p_ip_hash)
  RETURNING id INTO v_codigo_id;

  RETURN jsonb_build_object('estado', 'codigo')
         || public.talleres_reserva_codigo_envio(v_codigo_id, p_aviso_texto);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_identificar(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_identificar(uuid, text, text, text, text) TO service_role;

-- {"estado":"ok","nombre":<first name>} stores p_token_hash (30 minutes,
-- single use) and uses the code up; otherwise "invalido" (unknown, used,
-- or wrong: then also "intentos_restantes"), "vencido", "bloqueado" (the
-- 5th wrong attempt blocks) or "limite" (30 per ip per 10 min).
CREATE OR REPLACE FUNCTION public.talleres_reserva_codigo_verificar(
  p_codigo_id uuid, p_codigo_hash text, p_token_hash text, p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.taller_reserva_codigos%ROWTYPE;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_codigo_hash IS NULL OR p_codigo_hash !~ '^[0-9a-f]{64}$'
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT public.reserva_publica_consumir('reserva_codigo_verificar', p_ip_hash, NULL,
       30, interval '10 minutes', NULL, NULL, NULL, NULL) THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  SELECT * INTO v FROM public.taller_reserva_codigos c WHERE c.id = p_codigo_id FOR UPDATE;
  IF NOT FOUND OR v.usado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  IF v.bloqueado THEN
    RETURN jsonb_build_object('estado', 'bloqueado');
  END IF;
  IF v.expira_en <= now() THEN
    RETURN jsonb_build_object('estado', 'vencido');
  END IF;

  IF v.codigo_hash <> p_codigo_hash THEN
    IF v.intentos + 1 >= 5 THEN
      UPDATE public.taller_reserva_codigos SET intentos = intentos + 1, bloqueado = true WHERE id = v.id;
      PERFORM public.talleres_reserva_avisos_retirar(v.usuario_id);
      RETURN jsonb_build_object('estado', 'bloqueado');
    END IF;
    UPDATE public.taller_reserva_codigos SET intentos = intentos + 1 WHERE id = v.id;
    RETURN jsonb_build_object('estado', 'invalido', 'intentos_restantes', 5 - (v.intentos + 1));
  END IF;

  UPDATE public.taller_reserva_codigos
     SET usado_en = now(), token_hash = p_token_hash, token_expira_en = now() + interval '30 minutes'
   WHERE id = v.id;
  PERFORM public.talleres_reserva_avisos_retirar(v.usuario_id);

  RETURN jsonb_build_object('estado', 'ok', 'nombre',
    (SELECT split_part(btrim(u.nombre), ' ', 1) FROM public.usuarios u WHERE u.id = v.usuario_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_codigo_verificar(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_codigo_verificar(uuid, text, text, text) TO service_role;

-- Replaces the code of a live row: a new hash and 10 more minutes; the
-- wrong attempts already made still count. At most 3 resends, 60 s apart.
--   {"estado":"codigo","codigo_id","email_mascara","envio":{...}}
--   {"estado":"espera","segundos":n} | "invalido" | "bloqueado" | "limite"
CREATE OR REPLACE FUNCTION public.talleres_reserva_codigo_reenviar(
  p_codigo_id uuid, p_codigo_hash_nuevo text, p_ip_hash text, p_aviso_texto text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.taller_reserva_codigos%ROWTYPE;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_codigo_hash_nuevo IS NULL OR p_codigo_hash_nuevo !~ '^[0-9a-f]{64}$'
     OR length(p_aviso_texto) > 500 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT public.reserva_publica_consumir('reserva_codigo_reenviar', p_ip_hash, NULL,
       10, interval '1 hour', NULL, NULL, NULL, NULL) THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  SELECT * INTO v FROM public.taller_reserva_codigos c WHERE c.id = p_codigo_id FOR UPDATE;
  IF NOT FOUND OR v.usado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  IF v.bloqueado THEN
    RETURN jsonb_build_object('estado', 'bloqueado');
  END IF;
  IF v.reenvios >= 3 THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;
  IF v.ultimo_envio_en > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('estado', 'espera', 'segundos',
      ceil(extract(epoch FROM v.ultimo_envio_en + interval '60 seconds' - now()))::integer);
  END IF;

  UPDATE public.taller_reserva_codigos
     SET codigo_hash = p_codigo_hash_nuevo,
         expira_en = now() + interval '10 minutes',
         reenvios = reenvios + 1,
         ultimo_envio_en = now()
   WHERE id = v.id;

  RETURN jsonb_build_object('estado', 'codigo') || public.talleres_reserva_codigo_envio(v.id, p_aviso_texto);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_codigo_reenviar(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_codigo_reenviar(uuid, text, text, text) TO service_role;

-- ===========================================================================
-- D. talleres_reserva_crear
-- ===========================================================================

-- p_datos: exactly one of
--   {"token": <hash of a verified code's token>}       (S3, verified)
--   {"por_verificar": {"cedula"}}                      (exists; no email, or cannot read it)
--   {"ficha_nueva": {cedula, nombre, apellido, fecha_nacimiento,
--                    telefono, email, genero}}         (S4)
-- plus, only for a pareja edición, "pareja": exactly one of
--   {"token"} | {"ficha_nueva": {..., email and telefono optional}} |
--   {"pendiente_cedula"}, and "vinculo" when neither the edición nor the
--   taller sets it.
-- Replies: {"estado":"ok","inscripcion_id","invitacion_id"|null,
--   "por_verificar"} or {"estado": "invalido" (+ "campo" for a malformed
--   field; without campo for every neutral refusal: an existing cédula or
--   email, a minor, an unknown or used token, an existing person not
--   eligible) | "genero_no_aplica" | "cupo_lleno" | "ya_inscrito" (only
--   after a verified code) | "pareja_no_disponible" (only for a verified
--   partner) | "cerrada" | "limite"}.
-- An existing ficha is never updated. Limits: 5 per ip per hour, 3 per
-- subject per day, 300 per day.
CREATE OR REPLACE FUNCTION public.talleres_reserva_crear(p_edicion_id uuid, p_datos jsonb, p_ip_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_vinculo text;
  v_genero_req text;
  v_taller_nombre text;
  v_pareja_datos jsonb;
  v_token text;
  v_cedula text;
  v_ficha jsonb;
  v_token_pareja text;
  v_cedula_pareja text;
  v_ficha_pareja jsonb;
  v_estado_civil text;
  v_principal uuid;
  v_pareja uuid;
  v_codigo_id uuid;
  v_codigo_pareja_id uuid;
  v_nuevo boolean := false;
  v_por_verificar boolean := false;
  v_pareja_origen text;
  v_persona public.usuarios%ROWTYPE;
  v_core jsonb;
  v_inscripcion_id uuid;
  v_invitacion_id uuid;
  v_estado text;
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' OR octet_length(p_datos::text) > 8192
     OR (p_datos ? 'token')::int + (p_datos ? 'por_verificar')::int + (p_datos ? 'ficha_nueva')::int <> 1 THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;

  SELECT te.tipo, coalesce(te.link_type, t.vinculo), t.genero_requerido::text, t.nombre
    INTO v_tipo, v_vinculo, v_genero_req, v_taller_nombre
    FROM public.taller_ediciones te JOIN public.talleres t ON t.id = te.taller_id
   WHERE te.id = p_edicion_id AND public.talleres_reserva_edicion_publica(te.id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'cerrada');
  END IF;

  -- The principal's input.
  IF p_datos ? 'token' THEN
    v_token := p_datos ->> 'token';
    IF v_token IS NULL OR v_token !~ '^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('estado', 'invalido');
    END IF;
  ELSIF p_datos ? 'por_verificar' THEN
    BEGIN
      v_cedula := public.talleres_cedula_pareja_normalizada(p_datos -> 'por_verificar' ->> 'cedula');
    EXCEPTION WHEN invalid_parameter_value THEN
      RETURN jsonb_build_object('estado', 'invalido', 'campo', 'cedula');
    END;
  ELSE
    v_ficha := public.talleres_reserva_ficha(p_datos -> 'ficha_nueva', true);
    IF NOT (v_ficha ->> 'ok')::boolean THEN
      RETURN jsonb_build_object('estado', 'invalido', 'campo', v_ficha ->> 'campo');
    END IF;
    IF v_genero_req IS NOT NULL AND v_ficha ->> 'genero' <> v_genero_req THEN
      RETURN jsonb_build_object('estado', 'genero_no_aplica');
    END IF;
  END IF;

  -- The partner's input.
  v_pareja_datos := CASE WHEN jsonb_typeof(p_datos -> 'pareja') = 'null' THEN NULL ELSE p_datos -> 'pareja' END;
  IF v_tipo <> 'pareja' THEN
    IF v_pareja_datos IS NOT NULL THEN
      RETURN jsonb_build_object('estado', 'invalido', 'campo', 'pareja');
    END IF;
    v_vinculo := NULL;
  ELSE
    IF v_pareja_datos IS NULL OR jsonb_typeof(v_pareja_datos) <> 'object'
       OR (v_pareja_datos ? 'token')::int + (v_pareja_datos ? 'ficha_nueva')::int
          + (v_pareja_datos ? 'pendiente_cedula')::int <> 1 THEN
      RETURN jsonb_build_object('estado', 'invalido', 'campo', 'pareja');
    END IF;
    v_vinculo := coalesce(v_vinculo,
      CASE WHEN (p_datos ->> 'vinculo') IN ('matrimonio', 'novios') THEN p_datos ->> 'vinculo' END);
    IF v_vinculo IS NULL THEN
      RETURN jsonb_build_object('estado', 'invalido', 'campo', 'vinculo');
    END IF;
    IF v_pareja_datos ? 'token' THEN
      v_token_pareja := v_pareja_datos ->> 'token';
      IF v_token_pareja IS NULL OR v_token_pareja !~ '^[0-9a-f]{64}$' OR v_token_pareja = v_token THEN
        RETURN jsonb_build_object('estado', 'invalido', 'campo', 'pareja');
      END IF;
    ELSIF v_pareja_datos ? 'ficha_nueva' THEN
      v_ficha_pareja := public.talleres_reserva_ficha(v_pareja_datos -> 'ficha_nueva', false);
      IF NOT (v_ficha_pareja ->> 'ok')::boolean THEN
        RETURN jsonb_build_object('estado', 'invalido', 'campo', 'pareja.' || (v_ficha_pareja ->> 'campo'));
      END IF;
    ELSE
      BEGIN
        v_cedula_pareja := public.talleres_cedula_pareja_normalizada(v_pareja_datos ->> 'pendiente_cedula');
      EXCEPTION WHEN invalid_parameter_value THEN
        RETURN jsonb_build_object('estado', 'invalido', 'campo', 'pareja.cedula');
      END;
    END IF;
  END IF;
  v_estado_civil := CASE WHEN v_vinculo = 'matrimonio' THEN 'Casado' ELSE 'No especificado' END;

  IF NOT public.reserva_publica_consumir('reserva_crear', p_ip_hash, coalesce(v_token, v_cedula, v_ficha ->> 'cedula'),
       5, interval '1 hour', 3, interval '1 day', 300, interval '1 day') THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  -- One subtransaction: any refusal below rolls back the fichas written
  -- in it; the consumed limit unit stays.
  BEGIN
    IF v_token IS NOT NULL THEN
      SELECT c.id, c.usuario_id INTO v_codigo_id, v_principal
        FROM public.taller_reserva_codigos c
       WHERE c.token_hash = v_token AND c.edicion_id = p_edicion_id
         AND c.token_usado_en IS NULL AND c.token_expira_en > now()
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
    ELSIF v_cedula IS NOT NULL THEN
      -- Only a person the code cannot reach (no email) reserves unverified.
      SELECT * INTO v_persona FROM public.usuarios u WHERE u.cedula = v_cedula;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      v_principal := v_persona.id;
      v_por_verificar := true;
    ELSE
      v_principal := public.talleres_reserva_ficha_crear(v_ficha, v_estado_civil);
      IF v_principal IS NULL THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      v_nuevo := true;
    END IF;

    IF NOT v_nuevo THEN
      IF public.talleres_reserva_es_menor(v_principal) THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      -- Only a verified person learns that their stored género does not fit.
      IF v_genero_req IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.usuarios u WHERE u.id = v_principal AND u.genero::text = v_genero_req) THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001',
          DETAIL = CASE WHEN v_token IS NOT NULL THEN 'genero_no_aplica' ELSE 'invalido' END;
      END IF;
    END IF;

    IF v_token_pareja IS NOT NULL THEN
      SELECT c.id, c.usuario_id INTO v_codigo_pareja_id, v_pareja
        FROM public.taller_reserva_codigos c
       WHERE c.token_hash = v_token_pareja AND c.edicion_id = p_edicion_id
         AND c.token_usado_en IS NULL AND c.token_expira_en > now()
       FOR UPDATE;
      IF NOT FOUND OR v_pareja = v_principal OR public.talleres_reserva_es_menor(v_pareja) THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      v_pareja_origen := 'cedula';
    ELSIF v_ficha_pareja IS NOT NULL THEN
      -- A new partner gets a ficha and no invitation (S12).
      v_pareja := public.talleres_reserva_ficha_crear(v_ficha_pareja, v_estado_civil);
      IF v_pareja IS NULL THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      v_pareja_origen := 'ficha_nueva';
    ELSIF v_cedula_pareja IS NOT NULL THEN
      -- Not the principal, not a minor, not active: else the same refusal.
      v_pareja := public.talleres_pareja_por_cedula(p_edicion_id, v_principal, v_cedula_pareja);
      IF v_pareja IS NULL THEN
        RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = 'invalido';
      END IF;
      v_pareja_origen := 'cedula';
      v_por_verificar := true;
    END IF;

    v_core := public.talleres_inscripcion_crear_core(
      p_edicion_id, v_principal, v_pareja, v_vinculo, v_pareja_origen, false, 'publico', v_por_verificar
    );
    IF NOT (v_core ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'RESERVA_RECHAZADA' USING ERRCODE = 'P0001', DETAIL = CASE v_core ->> 'codigo'
        WHEN 'CUPO_LLENO' THEN 'cupo_lleno'
        WHEN 'YA_INSCRITO' THEN CASE WHEN v_token IS NOT NULL THEN 'ya_inscrito' ELSE 'invalido' END
        WHEN 'PAREJA_NO_DISPONIBLE' THEN CASE WHEN v_token_pareja IS NOT NULL THEN 'pareja_no_disponible' ELSE 'invalido' END
        WHEN 'EDICION_NO_ABIERTA' THEN 'cerrada'
        WHEN 'EDICION_NOT_FOUND' THEN 'cerrada'
        ELSE 'invalido' END;
    END IF;
    v_inscripcion_id := (v_core ->> 'inscripcion_id')::uuid;

    IF v_nuevo THEN
      INSERT INTO public.invitaciones_acceso (usuario_id, origen, creado_por, edicion_id, inscripcion_id, estado)
      VALUES (v_principal, 'taller_publico', NULL, p_edicion_id, v_inscripcion_id, 'en_espera')
      RETURNING id INTO v_invitacion_id;
    END IF;

    UPDATE public.taller_reserva_codigos SET token_usado_en = now()
     WHERE id IN (v_codigo_id, v_codigo_pareja_id);

    IF v_cedula_pareja IS NOT NULL THEN
      INSERT INTO public.avisos_persona (persona_id, tipo, titulo, cuerpo, datos)
      SELECT v_pareja, 'taller_pareja_por_confirmar', left('Te inscribieron en ' || v_taller_nombre, 160),
             split_part(btrim(u.nombre), ' ', 1) || ' te inscribió como su pareja. Si no es correcto, avísale a la iglesia.',
             jsonb_build_object('inscripcion_id', v_inscripcion_id)
        FROM public.usuarios u WHERE u.id = v_principal;
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'RESERVA_RECHAZADA' THEN
        GET STACKED DIAGNOSTICS v_estado = PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('estado', v_estado);
      END IF;
      RAISE;
    WHEN unique_violation THEN
      -- A concurrent ficha took the cédula or the email in between.
      RETURN jsonb_build_object('estado', 'invalido');
  END;

  RETURN jsonb_build_object(
    'estado', 'ok',
    'inscripcion_id', v_inscripcion_id,
    'invitacion_id', v_invitacion_id,
    'por_verificar', v_por_verificar
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_crear(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_crear(uuid, jsonb, text) TO service_role;

-- ===========================================================================
-- E. Avísame si se libera un lugar
-- ===========================================================================

-- Always {"estado":"ok"} for a valid request (a repeated email for the
-- same edición adds nothing), else "invalido" + campo, "cerrada" or
-- "limite" (10 per ip per hour, 1000 per day).
CREATE OR REPLACE FUNCTION public.talleres_avisame_lugar_agregar(
  p_edicion_id uuid, p_nombre text, p_email text, p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF length(v_nombre) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object('estado', 'invalido', 'campo', 'nombre');
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('estado', 'invalido', 'campo', 'email');
  END IF;
  IF NOT public.talleres_reserva_edicion_publica(p_edicion_id) THEN
    RETURN jsonb_build_object('estado', 'cerrada');
  END IF;
  IF NOT public.reserva_publica_consumir('reserva_avisame', p_ip_hash, NULL,
       10, interval '1 hour', NULL, NULL, 1000, interval '1 day') THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  INSERT INTO public.taller_avisame_lugar (edicion_id, nombre, email, usuario_id, ip_hash)
  VALUES (p_edicion_id, v_nombre, v_email,
          (SELECT u.id FROM public.usuarios u WHERE lower(u.email) = v_email LIMIT 1), p_ip_hash)
  ON CONFLICT (edicion_id, lower(email)) DO NOTHING;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisame_lugar_agregar(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisame_lugar_agregar(uuid, text, text, text) TO service_role;

-- ===========================================================================
-- F. A public invitation is ready at once
-- ===========================================================================

-- Same as 20261004150000 plus one branch: a taller_publico invitation is
-- listed while its inscription is pendiente or aprobado, whatever the
-- taller's momento_envio_acceso (S4: sent at inscription).
CREATE OR REPLACE FUNCTION public.invitacion_acceso_pendientes_de_envio()
RETURNS TABLE (invitacion_id uuid, inscripcion_id uuid, edicion_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ia.id, ia.inscripcion_id, ia.edicion_id
    FROM public.invitaciones_acceso ia
    JOIN public.usuarios u ON u.id = ia.usuario_id
    JOIN public.taller_inscripciones i ON i.id = ia.inscripcion_id
    JOIN public.taller_ediciones te ON te.id = i.taller_id
    JOIN public.talleres t ON t.id = te.taller_id
   WHERE ia.estado = 'en_espera'
     AND u.auth_id IS NULL
     AND (
       ((ia.origen = 'taller_publico' OR t.momento_envio_acceso = 'al_inscribirse') AND i.estado IN ('pendiente', 'aprobado'))
       OR (t.momento_envio_acceso = 'al_aprobar' AND i.estado = 'aprobado')
     )
   ORDER BY ia.created_at;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_pendientes_de_envio() IS
  'Sender: invitations ready for their first send (estado en_espera, ficha without auth_id, inscription pendiente/aprobado for taller_publico invitations and al_inscribirse talleres, aprobado for al_aprobar talleres).';

REVOKE ALL ON FUNCTION public.invitacion_acceso_pendientes_de_envio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_pendientes_de_envio() TO service_role;
