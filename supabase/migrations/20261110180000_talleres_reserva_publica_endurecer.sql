-- T5a follow-up (odd/tasks/talleres-reserva-publica.md, S3, S12, S13) —
-- hardening of 20261110140000 after its independent verification. Only
-- the functions below are recreated, each with the body of 20261110140000
-- plus the change named here, and the same grants and search_path:
--
--   1. talleres_reserva_crear: the in-app notice to a pendiente_cedula
--      partner names the principal only when the principal came by token
--      or ficha_nueva; for a por_verificar principal it is a neutral text
--      without a name (S12: nobody is named on an unproven claim).
--   2. talleres_reserva_crear: at most 20 unverified creations
--      (por_verificar or ficha_nueva, not token) per edición per day,
--      through reserva_publica_consumir('reserva_crear_edicion', ...,
--      clave = edición id) -> {"estado":"limite"} (S13: the cupo cannot be
--      exhausted from many ips).
--   3. talleres_reserva_avisos_retirar(persona, edición) replaces the
--      one-argument version: a code only retires the codigo_reserva
--      notices of its own edición. Its two callers,
--      talleres_reserva_codigo_envio and talleres_reserva_codigo_verificar,
--      are recreated on it and the old signature is dropped.
--   4. talleres_reserva_crear: with a principal token and a partner token,
--      both code rows are locked in id order before use (no deadlock
--      between two requests with the pair swapped). Same replies.
--   5. The por_verificar comment: it also accepts a person with an email
--      they cannot read (S3 fallback, L10).
--
-- Rollback: re-run the four function definitions of 20261110140000
-- (talleres_reserva_avisos_retirar(uuid), talleres_reserva_codigo_envio,
-- talleres_reserva_codigo_verificar, talleres_reserva_crear) and
-- DROP FUNCTION IF EXISTS public.talleres_reserva_avisos_retirar(uuid, uuid).

-- ===========================================================================
-- A. Code notices are scoped to their edición
-- ===========================================================================

-- Expires the person's live code notices for one edición and drops the
-- code text. The codes of other ediciones keep their notices.
CREATE OR REPLACE FUNCTION public.talleres_reserva_avisos_retirar(p_persona_id uuid, p_edicion_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.avisos_persona
     SET cuerpo = NULL, expira_at = now()
   WHERE persona_id = p_persona_id AND tipo = 'codigo_reserva'
     AND datos ->> 'edicion_id' = p_edicion_id::text
     AND (expira_at IS NULL OR expira_at > now());
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_avisos_retirar(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_avisos_retirar(uuid, uuid) TO service_role;

-- Same as 20261110140000 except that it retires only the code notices of
-- the code's own edición.
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

  PERFORM public.talleres_reserva_avisos_retirar(v_persona.id, v_codigo.edicion_id);
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

-- Same as 20261110140000 except that it retires only the code notices of
-- the code's own edición.
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
      PERFORM public.talleres_reserva_avisos_retirar(v.usuario_id, v.edicion_id);
      RETURN jsonb_build_object('estado', 'bloqueado');
    END IF;
    UPDATE public.taller_reserva_codigos SET intentos = intentos + 1 WHERE id = v.id;
    RETURN jsonb_build_object('estado', 'invalido', 'intentos_restantes', 5 - (v.intentos + 1));
  END IF;

  UPDATE public.taller_reserva_codigos
     SET usado_en = now(), token_hash = p_token_hash, token_expira_en = now() + interval '30 minutes'
   WHERE id = v.id;
  PERFORM public.talleres_reserva_avisos_retirar(v.usuario_id, v.edicion_id);

  RETURN jsonb_build_object('estado', 'ok', 'nombre',
    (SELECT split_part(btrim(u.nombre), ' ', 1) FROM public.usuarios u WHERE u.id = v.usuario_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_reserva_codigo_verificar(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_reserva_codigo_verificar(uuid, text, text, text) TO service_role;

-- No caller is left on the one-argument version.
DROP FUNCTION IF EXISTS public.talleres_reserva_avisos_retirar(uuid);

-- ===========================================================================
-- B. talleres_reserva_crear
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
-- subject per day, 300 per day, and 20 unverified creations (por_verificar
-- or ficha_nueva, not token) per edición per day.
-- The partner's in-app notice names the principal only when the principal
-- proved their identity (token) or is a new ficha; for a por_verificar
-- principal it carries no name.
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
  -- Unverified creations take places without proof: at most 20 per edición
  -- per day, so nobody fills an edición's cupo from many ips.
  IF v_token IS NULL AND NOT public.reserva_publica_consumir('reserva_crear_edicion', p_ip_hash, p_edicion_id::text,
       1000000, interval '1 day', 20, interval '1 day', NULL, NULL) THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;

  -- One subtransaction: any refusal below rolls back the fichas written
  -- in it; the consumed limit unit stays.
  BEGIN
    -- Two tokens: lock both code rows in id order first, so two requests
    -- with the same pair in swapped roles cannot deadlock.
    IF v_token IS NOT NULL AND v_token_pareja IS NOT NULL THEN
      PERFORM 1
         FROM public.taller_reserva_codigos c
        WHERE c.token_hash IN (v_token, v_token_pareja) AND c.edicion_id = p_edicion_id
        ORDER BY c.id
          FOR UPDATE;
    END IF;

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
      -- A person the code cannot reach (no email, or an email they cannot
      -- read) reserves unverified: por_verificar, the coordinator confirms.
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
             CASE WHEN v_cedula IS NOT NULL
               -- An unverified principal is not named: anyone may type a cédula.
               THEN left('Te inscribieron como pareja en ' || v_taller_nombre || '. Si no es correcto, avísale a la iglesia.', 1000)
               ELSE split_part(btrim(u.nombre), ' ', 1) || ' te inscribió como su pareja. Si no es correcto, avísale a la iglesia.'
             END,
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
