-- C1 (odd/tasks/talleres-conyuge-invitacion.md) — a member enrolls with a
-- partner who is not in the system yet: the partner's ficha is created on
-- the spot and the partner receives a one-time access invitation.
--
-- Adds:
--   A. talleres.momento_envio_acceso ('al_aprobar' by default, or
--      'al_inscribirse'): when the invitation becomes ready to send.
--   B. invitaciones_acceso: one row per invitation, RLS on and no grants
--      for anon or authenticated. The token is stored only as a hash
--      (token_hash), is single use and is rotated on every send. At most
--      one open invitation (en_espera, enviada, activando) per ficha.
--   C. talleres_inscribirme gains the mode
--        {"modo":"ficha_nueva","cedula","nombre","apellido","email",
--         "fecha_nacimiento":"YYYY-MM-DD","genero":"Masculino"|"Femenino"}
--      Every other mode and outcome is byte-compatible with
--      20261003160000. Throttles: only a caller who already holds a role
--      (usuario_roles), 2 per 30 days per caller (acciones_limitadas,
--      accion pareja_ficha_nueva) and 30 per 24 hours across everyone;
--      any of them returns LIMITE_ALCANZADO. An existing cédula, an
--      existing email (usuarios or auth.users, case-insensitive) and a
--      person under 18 all return the same PAREJA_NO_CONFIRMADA. On
--      success the usuarios row (no role), the inscription
--      (pareja_origen = ficha_nueva) and the invitation (en_espera) are
--      written together. The invitation id is never returned.
--   D. Sender functions (service_role): invitacion_acceso_pendientes_de_envio,
--      invitacion_acceso_preparar_envio, invitacion_acceso_registrar_envio.
--   E. Trigger: an inscription that becomes no_aprobado or retirado
--      cancels its open invitations and drops their token. The ficha is
--      NOT deleted: taller_inscripciones.companero_id references it with
--      ON DELETE RESTRICT, so the ficha always has at least that reference
--      and a delete could never succeed. It stays without auth_id and
--      without a role.
--   F. Activation functions (service_role): invitacion_acceso_consultar,
--      invitacion_acceso_verificar (5 wrong cédulas block it),
--      invitacion_acceso_vincular (auth_id only when NULL, role miembro,
--      optional conyuge relation).
--   G. ficha_tiene_invitacion_abierta (service_role): the signup linker
--      must not link a ficha that has an unfinished invitation.
--
-- Verified against STAGING before writing this file (read-only queries):
--   * usuarios.estado_civil is NOT NULL without default (enum Soltero,
--     Casado, Divorciado, Viudo); genero is enum Masculino, Femenino, Otro.
--   * usuarios has partial UNIQUE indexes on cedula, email and auth_id;
--     usuario_roles is UNIQUE (usuario_id, rol_id); roles_sistema has
--     nombre_interno 'miembro'.
--   * auth.users has no triggers, so creating the auth user for the
--     invitee does not touch usuarios.
--   * taller_inscripciones.persona_principal_id and companero_id reference
--     usuarios ON DELETE RESTRICT.
--
-- Rollback (in this order):
--   DROP FUNCTION IF EXISTS public.ficha_tiene_invitacion_abierta(uuid),
--     public.invitacion_acceso_vincular(uuid, uuid, boolean),
--     public.invitacion_acceso_verificar(text, text),
--     public.invitacion_acceso_consultar(text),
--     public.invitacion_acceso_registrar_envio(uuid, boolean, text),
--     public.invitacion_acceso_preparar_envio(uuid, text, timestamptz),
--     public.invitacion_acceso_pendientes_de_envio();
--   DROP TRIGGER IF EXISTS trg_taller_inscripciones_cancela_invitaciones
--     ON public.taller_inscripciones;
--   DROP FUNCTION IF EXISTS public.talleres_inscripcion_cancela_invitaciones();
--   CREATE OR REPLACE FUNCTION public.talleres_inscribirme(uuid, jsonb) ...
--     (the body of 20261003160000);
--   DROP TABLE IF EXISTS public.invitaciones_acceso;
--   (only when no row uses it) ALTER TABLE public.taller_inscripciones
--     DROP CONSTRAINT taller_inscripciones_pareja_origen_check, ADD
--     CONSTRAINT ... CHECK (pareja_origen IS NULL OR pareja_origen IN
--     ('conyuge_registrado', 'cedula'));
--   ALTER TABLE public.talleres DROP COLUMN IF EXISTS momento_envio_acceso;

-- ===========================================================================
-- A. Taller configuration
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN momento_envio_acceso text NOT NULL DEFAULT 'al_aprobar'
    CONSTRAINT talleres_momento_envio_acceso_check
      CHECK (momento_envio_acceso IN ('al_aprobar', 'al_inscribirse'));

COMMENT ON COLUMN public.talleres.momento_envio_acceso IS
  'When the access invitation of a partner created with ficha_nueva becomes ready to send: al_aprobar (when the coordinator approves the inscription, the default) or al_inscribirse (right after enrolling).';

ALTER TABLE public.taller_inscripciones
  DROP CONSTRAINT taller_inscripciones_pareja_origen_check,
  ADD CONSTRAINT taller_inscripciones_pareja_origen_check
    CHECK (pareja_origen IS NULL OR pareja_origen IN ('conyuge_registrado', 'cedula', 'ficha_nueva'));

-- ===========================================================================
-- B. invitaciones_acceso
-- ===========================================================================

CREATE TABLE public.invitaciones_acceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  origen text NOT NULL CHECK (origen IN ('taller_pareja')),
  creado_por uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  edicion_id uuid NULL REFERENCES public.taller_ediciones(id) ON DELETE SET NULL,
  inscripcion_id uuid NULL REFERENCES public.taller_inscripciones(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'en_espera'
    CHECK (estado IN ('en_espera', 'enviada', 'activando', 'aceptada', 'cancelada', 'bloqueada')),
  token_hash text NULL UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  token_expira_en timestamptz NULL,
  envios integer NOT NULL DEFAULT 0 CHECK (envios >= 0),
  ultimo_envio_en timestamptz NULL,
  ultimo_error text NULL,
  intentos_activacion integer NOT NULL DEFAULT 0 CHECK (intentos_activacion >= 0),
  activando_en timestamptz NULL,
  auth_user_id uuid NULL,
  aceptada_en timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invitaciones_acceso_una_abierta_por_usuario
  ON public.invitaciones_acceso (usuario_id)
  WHERE estado IN ('en_espera', 'enviada', 'activando');

CREATE INDEX invitaciones_acceso_inscripcion_idx
  ON public.invitaciones_acceso (inscripcion_id);

COMMENT ON TABLE public.invitaciones_acceso IS
  'Access invitations for fichas created by someone else (talleres_inscribirme ficha_nueva). token_hash is the SHA-256 hex of a single-use token, rotated on every send. Read and written only through the invitacion_acceso_* functions (service_role); no grants for anon or authenticated.';

ALTER TABLE public.invitaciones_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invitaciones_acceso FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- C. talleres_inscribirme: the ficha_nueva mode
-- ===========================================================================

-- The one way a member enrolls.
--   p_pareja: NULL (individual edición) |
--     {"modo":"conyuge_registrado"} | {"modo":"cedula","cedula":"..."} |
--     {"modo":"ficha_nueva","cedula","nombre","apellido","email",
--      "fecha_nacimiento":"YYYY-MM-DD","genero":"Masculino"|"Femenino"},
--     plus optional "vinculo":"matrimonio"|"novios" (read only when the
--     effective vínculo, coalesce(taller_ediciones.link_type,
--     talleres.vinculo), is NULL) and "conyuge_descartado":true (cedula).
--   OK: {"ok":true,"inscripcion_id":uuid,"estado":"pendiente",
--        "pareja_origen":null|"conyuge_registrado"|"cedula"|"ficha_nueva"}
--   Returned: {"ok":false,"codigo": EDICION_NOT_FOUND | EDICION_NO_ABIERTA |
--     YA_INSCRITO | CUPO_LLENO | PAREJA_NO_CONFIRMADA | PAREJA_NO_DISPONIBLE |
--     LIMITE_ALCANZADO}
--   Raised: 42501 SIN_FICHA; 22023 COMPANERO_NO_APLICA, COMPANERO_REQUERIDO,
--     MODO_INVALIDO, VINCULO_REQUERIDO, MODO_NO_APLICA, CEDULA_INVALIDA,
--     NOMBRE_INVALIDO, EMAIL_INVALIDO, GENERO_INVALIDO,
--     FECHA_NACIMIENTO_INVALIDA.
CREATE OR REPLACE FUNCTION public.talleres_inscribirme(p_edicion_id uuid, p_pareja jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_cohorte_id uuid;
  v_vinculo_taller text;
  v_modo text;
  v_vinculo text;
  v_cedula text;
  v_pareja_id uuid;
  v_conyuge_id uuid;
  v_descartado boolean := false;
  v_inscripcion_id uuid;
  v_nombre text;
  v_apellido text;
  v_email text;
  v_genero text;
  v_fecha_texto text;
  v_fecha_nacimiento date;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'SIN_FICHA' USING ERRCODE = '42501';
  END IF;

  IF p_pareja IS NOT NULL AND jsonb_typeof(p_pareja) = 'null' THEN
    p_pareja := NULL;
  END IF;

  SELECT * INTO v_edicion FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF NOT FOUND OR public.talleres_estado_efectivo(v_edicion) IN ('borrador', 'cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NOT_FOUND');
  END IF;

  SELECT c.id INTO v_cohorte_id
    FROM public.talleres_crecimiento_cohortes c
   WHERE c.taller_id = p_edicion_id
   ORDER BY c.created_at
   LIMIT 1;
  IF v_cohorte_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NOT_FOUND');
  END IF;

  -- Input shape against the edición (client bugs: raised).
  IF v_edicion.tipo <> 'pareja' THEN
    IF p_pareja IS NOT NULL THEN
      RAISE EXCEPTION 'COMPANERO_NO_APLICA' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_pareja IS NULL THEN
      RAISE EXCEPTION 'COMPANERO_REQUERIDO' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_pareja) <> 'object'
       OR (p_pareja ->> 'modo') IS NULL
       OR (p_pareja ->> 'modo') NOT IN ('conyuge_registrado', 'cedula', 'ficha_nueva') THEN
      RAISE EXCEPTION 'MODO_INVALIDO' USING ERRCODE = '22023';
    END IF;
    v_modo := p_pareja ->> 'modo';

    -- Effective vínculo: the edición's own snapshot, else its taller's;
    -- the member's choice only when both are NULL.
    SELECT t.vinculo INTO v_vinculo_taller FROM public.talleres t WHERE t.id = v_edicion.taller_id;
    v_vinculo := COALESCE(
      v_edicion.link_type,
      v_vinculo_taller,
      CASE WHEN (p_pareja ->> 'vinculo') IN ('matrimonio', 'novios') THEN p_pareja ->> 'vinculo' END
    );
    IF v_vinculo IS NULL THEN
      RAISE EXCEPTION 'VINCULO_REQUERIDO' USING ERRCODE = '22023';
    END IF;

    IF v_modo = 'conyuge_registrado' AND v_vinculo <> 'matrimonio' THEN
      RAISE EXCEPTION 'MODO_NO_APLICA' USING ERRCODE = '22023';
    END IF;

    IF v_modo IN ('cedula', 'ficha_nueva') THEN
      v_cedula := public.talleres_cedula_pareja_normalizada(p_pareja ->> 'cedula');
    END IF;

    IF v_modo = 'ficha_nueva' THEN
      v_nombre := regexp_replace(btrim(coalesce(p_pareja ->> 'nombre', '')), '\s+', ' ', 'g');
      v_apellido := regexp_replace(btrim(coalesce(p_pareja ->> 'apellido', '')), '\s+', ' ', 'g');
      IF length(v_nombre) NOT BETWEEN 1 AND 80 OR length(v_apellido) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'NOMBRE_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_email := lower(btrim(coalesce(p_pareja ->> 'email', '')));
      IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'EMAIL_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_genero := p_pareja ->> 'genero';
      IF v_genero IS NULL OR v_genero NOT IN ('Masculino', 'Femenino') THEN
        RAISE EXCEPTION 'GENERO_INVALIDO' USING ERRCODE = '22023';
      END IF;

      v_fecha_texto := p_pareja ->> 'fecha_nacimiento';
      IF v_fecha_texto IS NULL OR v_fecha_texto !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_fecha_nacimiento := v_fecha_texto::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END;
      IF v_fecha_nacimiento <= DATE '1900-01-01' OR v_fecha_nacimiento > public.talleres_hoy() THEN
        RAISE EXCEPTION 'FECHA_NACIMIENTO_INVALIDA' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) <> 'abierto' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EDICION_NO_ABIERTA');
  END IF;

  -- Same key as the cupo gate and the one-appearance trigger: the checks
  -- below and the INSERT see one consistent edición.
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || p_edicion_id::text));

  IF public.talleres_persona_activa_en_edicion(p_edicion_id, v_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_INSCRITO');
  END IF;

  IF v_modo = 'conyuge_registrado' THEN
    v_pareja_id := public.talleres_conyuge_unico(v_actor_id);
    IF v_pareja_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
    IF public.talleres_persona_activa_en_edicion(p_edicion_id, v_pareja_id) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_DISPONIBLE');
    END IF;
  ELSIF v_modo = 'cedula' THEN
    IF NOT public.consumir_limite_accion(v_actor_id, 'pareja_cedula', 10, interval '24 hours') THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- Not found, the caller, a minor and someone already active all read
    -- the same: no oracle on who is enrolled.
    v_pareja_id := public.talleres_pareja_por_cedula(p_edicion_id, v_actor_id, v_cedula);
    IF v_pareja_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
    IF p_pareja -> 'conyuge_descartado' = 'true'::jsonb THEN
      v_conyuge_id := public.talleres_conyuge_unico(v_actor_id);
      v_descartado := v_conyuge_id IS NOT NULL AND v_conyuge_id <> v_pareja_id;
    END IF;
  ELSIF v_modo = 'ficha_nueva' THEN
    -- Only someone who already holds a role may create fichas.
    IF NOT EXISTS (SELECT 1 FROM public.usuario_roles ur WHERE ur.usuario_id = v_actor_id) THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- Global cap first (it records nothing), then the caller's own unit.
    PERFORM pg_advisory_xact_lock(hashtext('acciones_limitadas:pareja_ficha_nueva:global'));
    IF (SELECT count(*) FROM public.acciones_limitadas a
         WHERE a.accion = 'pareja_ficha_nueva'
           AND a.created_at > now() - interval '24 hours') >= 30 THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    IF NOT public.consumir_limite_accion(v_actor_id, 'pareja_ficha_nueva', 2, interval '30 days') THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'LIMITE_ALCANZADO');
    END IF;
    -- An existing cédula, an existing email and a minor all read the same.
    IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.cedula = v_cedula)
       OR EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email)
       OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email)
       OR v_fecha_nacimiento > (public.talleres_hoy() - interval '18 years')::date THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
    END IF;
  END IF;

  BEGIN
    IF v_modo = 'ficha_nueva' THEN
      INSERT INTO public.usuarios (
        cedula, nombre, apellido, email, fecha_nacimiento, genero, estado_civil
      ) VALUES (
        v_cedula, v_nombre, v_apellido, v_email, v_fecha_nacimiento,
        v_genero::public.enum_genero,
        (CASE WHEN v_vinculo = 'matrimonio' THEN 'Casado' ELSE 'Soltero' END)::public.enum_estado_civil
      )
      RETURNING id INTO v_pareja_id;
    END IF;

    INSERT INTO public.taller_inscripciones (
      taller_id, cohorte_id, persona_principal_id, companero_id, link_type,
      estado, sobre_cupo, pareja_origen, conyuge_registrado_descartado
    ) VALUES (
      p_edicion_id, v_cohorte_id, v_actor_id, v_pareja_id, v_vinculo,
      'pendiente', false, v_modo, v_descartado
    )
    RETURNING id INTO v_inscripcion_id;

    IF v_modo = 'ficha_nueva' THEN
      INSERT INTO public.invitaciones_acceso (
        usuario_id, origen, creado_por, edicion_id, inscripcion_id, estado
      ) VALUES (
        v_pareja_id, 'taller_pareja', v_actor_id, p_edicion_id, v_inscripcion_id, 'en_espera'
      );
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      -- talleres_inscripciones_cupo_gate. Returned, so a consumed
      -- throttle unit stays recorded.
      IF SQLERRM = 'CUPO_LLENO' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'CUPO_LLENO');
      END IF;
      RAISE;
    WHEN unique_violation THEN
      -- A concurrent ficha took the cédula or the email in between.
      IF v_modo = 'ficha_nueva' THEN
        RETURN jsonb_build_object('ok', false, 'codigo', 'PAREJA_NO_CONFIRMADA');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'inscripcion_id', v_inscripcion_id,
    'estado', 'pendiente',
    'pareja_origen', v_modo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribirme(uuid, jsonb) IS
  'Member self-enrollment (the only path since taller_inscripciones_insert lost its self branch). Individual edición: p_pareja NULL. Pareja edición: {modo: conyuge_registrado} (matrimonio only, the caller''s unique registered spouse), {modo: cedula, cedula} (same rules as talleres_buscar_pareja_por_cedula, same pareja_cedula throttle) or {modo: ficha_nueva, cedula, nombre, apellido, email, fecha_nacimiento, genero} (creates the partner''s ficha without a role plus an en_espera access invitation; callers with a role only, 2 per 30 days per caller, 30 per 24 h overall; existing cédula or email, or under 18, return PAREJA_NO_CONFIRMADA), plus vinculo when coalesce(taller_ediciones.link_type, talleres.vinculo) is NULL, and conyuge_descartado. Inserts a pendiente row with the edición''s first cohorte. Returns {ok:true, inscripcion_id, estado, pareja_origen} or {ok:false, codigo}; raises 42501 SIN_FICHA and 22023 input errors.';

REVOKE ALL ON FUNCTION public.talleres_inscribirme(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_inscribirme(uuid, jsonb) TO authenticated, service_role;

-- ===========================================================================
-- D. Sender functions (service_role)
-- ===========================================================================

-- Invitations ready for their first send: en_espera, the ficha still has
-- no auth_id, the inscription is active, and the taller's moment has come
-- (al_inscribirse: right away; al_aprobar: once the inscription is
-- aprobado).
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
       (t.momento_envio_acceso = 'al_inscribirse' AND i.estado IN ('pendiente', 'aprobado'))
       OR (t.momento_envio_acceso = 'al_aprobar' AND i.estado = 'aprobado')
     )
   ORDER BY ia.created_at;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_pendientes_de_envio() IS
  'Sender: invitations ready for their first send (estado en_espera, ficha without auth_id, inscription pendiente/aprobado for al_inscribirse talleres or aprobado for al_aprobar talleres).';

REVOKE ALL ON FUNCTION public.invitacion_acceso_pendientes_de_envio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_pendientes_de_envio() TO service_role;

-- Rotates the token (a fresh hash replaces any earlier one, which stops
-- working) and returns what the email needs.
--   {"ok":true,"email","nombre_invitado","nombre_invitante","taller_nombre"}
--   {"ok":false,"codigo": INVITACION_NO_DISPONIBLE | TOKEN_INVALIDO}
CREATE OR REPLACE FUNCTION public.invitacion_acceso_preparar_envio(
  p_invitacion_id uuid,
  p_token_hash text,
  p_expira_en timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitaciones_acceso%ROWTYPE;
  v_email text;
  v_invitado text;
  v_invitante text;
  v_taller text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expira_en IS NULL OR p_expira_en <= now() OR p_expira_en > now() + interval '8 days' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'TOKEN_INVALIDO');
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones_acceso ia WHERE ia.id = p_invitacion_id FOR UPDATE;
  IF NOT FOUND OR v_inv.estado NOT IN ('en_espera', 'enviada') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INVITACION_NO_DISPONIBLE');
  END IF;

  SELECT u.email, u.nombre INTO v_email, v_invitado
    FROM public.usuarios u
   WHERE u.id = v_inv.usuario_id AND u.auth_id IS NULL;
  IF v_email IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.taller_inscripciones i
        WHERE i.id = v_inv.inscripcion_id AND i.estado IN ('pendiente', 'aprobado')
     ) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INVITACION_NO_DISPONIBLE');
  END IF;

  SELECT btrim(u.nombre || ' ' || u.apellido) INTO v_invitante
    FROM public.usuarios u WHERE u.id = v_inv.creado_por;
  SELECT t.nombre INTO v_taller
    FROM public.taller_ediciones te JOIN public.talleres t ON t.id = te.taller_id
   WHERE te.id = v_inv.edicion_id;

  UPDATE public.invitaciones_acceso
     SET token_hash = p_token_hash,
         token_expira_en = p_expira_en,
         updated_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_email,
    'nombre_invitado', v_invitado,
    'nombre_invitante', v_invitante,
    'taller_nombre', v_taller
  );
END;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_preparar_envio(uuid, text, timestamptz) IS
  'Sender: stores a new token hash (64 lowercase hex, SHA-256) expiring at p_expira_en (future, at most 8 days) on an en_espera or enviada invitation whose ficha has no auth_id and whose inscription is active. Returns {ok:true, email, nombre_invitado, nombre_invitante, taller_nombre} or {ok:false, codigo: INVITACION_NO_DISPONIBLE | TOKEN_INVALIDO}.';

REVOKE ALL ON FUNCTION public.invitacion_acceso_preparar_envio(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_preparar_envio(uuid, text, timestamptz) TO service_role;

-- Records the outcome of one send. A success moves en_espera to enviada.
CREATE OR REPLACE FUNCTION public.invitacion_acceso_registrar_envio(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_ok IS TRUE THEN
    UPDATE public.invitaciones_acceso
       SET estado = 'enviada',
           envios = envios + 1,
           ultimo_envio_en = now(),
           ultimo_error = NULL,
           updated_at = now()
     WHERE id = p_id AND estado IN ('en_espera', 'enviada');
  ELSE
    UPDATE public.invitaciones_acceso
       SET ultimo_error = left(coalesce(p_error, 'error'), 500),
           updated_at = now()
     WHERE id = p_id AND estado IN ('en_espera', 'enviada');
  END IF;

  RETURN jsonb_build_object('ok', FOUND);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_registrar_envio(uuid, boolean, text) IS
  'Sender: on p_ok, estado becomes enviada, envios + 1, ultimo_envio_en = now() and ultimo_error is cleared; otherwise only ultimo_error (first 500 chars) is stored. Only en_espera or enviada rows change. Returns {ok: whether a row changed}.';

REVOKE ALL ON FUNCTION public.invitacion_acceso_registrar_envio(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_registrar_envio(uuid, boolean, text) TO service_role;

-- ===========================================================================
-- E. A rejected or withdrawn inscription cancels its invitations
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_inscripcion_cancela_invitaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IN ('no_aprobado', 'retirado') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE public.invitaciones_acceso
       SET estado = 'cancelada',
           token_hash = NULL,
           token_expira_en = NULL,
           updated_at = now()
     WHERE inscripcion_id = NEW.id
       AND estado IN ('en_espera', 'enviada', 'activando');
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscripcion_cancela_invitaciones() IS
  'AFTER UPDATE OF estado on taller_inscripciones: when the row becomes no_aprobado or retirado, its open invitations (en_espera, enviada, activando) become cancelada and lose their token. The ficha is kept (companero_id references it ON DELETE RESTRICT).';

REVOKE ALL ON FUNCTION public.talleres_inscripcion_cancela_invitaciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_inscripcion_cancela_invitaciones() TO service_role;

DROP TRIGGER IF EXISTS trg_taller_inscripciones_cancela_invitaciones ON public.taller_inscripciones;
CREATE TRIGGER trg_taller_inscripciones_cancela_invitaciones
  AFTER UPDATE OF estado ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripcion_cancela_invitaciones();

-- ===========================================================================
-- F. Activation functions (service_role)
-- ===========================================================================

-- {"valida":true,"taller_nombre","nombre_invitado"} for an unexpired
-- token of an enviada or activando invitation; {"valida":false} otherwise.
CREATE OR REPLACE FUNCTION public.invitacion_acceso_consultar(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller text;
  v_invitado text;
BEGIN
  SELECT t.nombre, u.nombre INTO v_taller, v_invitado
    FROM public.invitaciones_acceso ia
    JOIN public.usuarios u ON u.id = ia.usuario_id
    LEFT JOIN public.taller_ediciones te ON te.id = ia.edicion_id
    LEFT JOIN public.talleres t ON t.id = te.taller_id
   WHERE p_token_hash IS NOT NULL
     AND ia.token_hash = p_token_hash
     AND ia.estado IN ('enviada', 'activando')
     AND ia.token_expira_en > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valida', false);
  END IF;
  RETURN jsonb_build_object('valida', true, 'taller_nombre', v_taller, 'nombre_invitado', v_invitado);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_consultar(text) IS
  'Activation: {valida:true, taller_nombre, nombre_invitado} when the token hash belongs to an enviada or activando invitation that has not expired; {valida:false} otherwise.';

REVOKE ALL ON FUNCTION public.invitacion_acceso_consultar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_consultar(text) TO service_role;

-- The invitee proves who they are with their cédula.
--   {"ok":true,"invitacion_id","email"}            (estado -> activando)
--   {"ok":false,"codigo":"INVITACION_INVALIDA"}     (unknown, expired, closed)
--   {"ok":false,"codigo":"CEDULA_NO_COINCIDE","intentos_restantes":n}
--   {"ok":false,"codigo":"BLOQUEADA"}               (5th failure: bloqueada)
CREATE OR REPLACE FUNCTION public.invitacion_acceso_verificar(p_token_hash text, p_cedula text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitaciones_acceso%ROWTYPE;
  v_cedula_ficha text;
  v_email text;
  v_cedula text;
BEGIN
  SELECT * INTO v_inv
    FROM public.invitaciones_acceso ia
   WHERE p_token_hash IS NOT NULL AND ia.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND OR v_inv.estado NOT IN ('enviada', 'activando') OR v_inv.token_expira_en <= now() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INVITACION_INVALIDA');
  END IF;

  SELECT u.cedula, u.email INTO v_cedula_ficha, v_email
    FROM public.usuarios u WHERE u.id = v_inv.usuario_id;

  BEGIN
    v_cedula := public.talleres_cedula_pareja_normalizada(p_cedula);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_cedula := NULL;
  END;

  IF v_cedula IS NULL OR v_cedula_ficha IS NULL OR v_cedula <> v_cedula_ficha THEN
    IF v_inv.intentos_activacion + 1 >= 5 THEN
      UPDATE public.invitaciones_acceso
         SET intentos_activacion = intentos_activacion + 1,
             estado = 'bloqueada',
             token_hash = NULL,
             token_expira_en = NULL,
             updated_at = now()
       WHERE id = v_inv.id;
      RETURN jsonb_build_object('ok', false, 'codigo', 'BLOQUEADA');
    END IF;
    UPDATE public.invitaciones_acceso
       SET intentos_activacion = intentos_activacion + 1,
           updated_at = now()
     WHERE id = v_inv.id;
    RETURN jsonb_build_object(
      'ok', false,
      'codigo', 'CEDULA_NO_COINCIDE',
      'intentos_restantes', 5 - (v_inv.intentos_activacion + 1)
    );
  END IF;

  UPDATE public.invitaciones_acceso
     SET estado = 'activando',
         activando_en = now(),
         updated_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'invitacion_id', v_inv.id, 'email', v_email);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_verificar(text, text) IS
  'Activation: compares the normalized cédula with the invitee''s ficha. Match: estado activando, returns {ok:true, invitacion_id, email}. Mismatch: intentos_activacion + 1 and {ok:false, codigo:CEDULA_NO_COINCIDE, intentos_restantes}; the 5th failure sets bloqueada, drops the token and returns BLOQUEADA. Unknown, expired or closed token: INVITACION_INVALIDA.';

REVOKE ALL ON FUNCTION public.invitacion_acceso_verificar(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_verificar(text, text) TO service_role;

-- Links the freshly created auth user to the ficha.
--   {"ok":true,"conyuge_registrado":bool}
--   {"ok":false,"codigo": INVITACION_INVALIDA | AUTH_NO_COINCIDE |
--                         FICHA_YA_VINCULADA}
CREATE OR REPLACE FUNCTION public.invitacion_acceso_vincular(
  p_id uuid,
  p_auth_user_id uuid,
  p_confirma_conyuge boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitaciones_acceso%ROWTYPE;
  v_email text;
  v_insc public.taller_inscripciones%ROWTYPE;
  v_conyuge boolean := false;
BEGIN
  SELECT * INTO v_inv FROM public.invitaciones_acceso ia WHERE ia.id = p_id FOR UPDATE;
  IF NOT FOUND OR v_inv.estado <> 'activando' OR v_inv.token_expira_en <= now() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INVITACION_INVALIDA');
  END IF;

  SELECT u.email INTO v_email FROM public.usuarios u WHERE u.id = v_inv.usuario_id;
  IF p_auth_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_auth_user_id AND lower(au.email) = lower(v_email))
     OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = p_auth_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'AUTH_NO_COINCIDE');
  END IF;

  UPDATE public.usuarios SET auth_id = p_auth_user_id
   WHERE id = v_inv.usuario_id AND auth_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FICHA_YA_VINCULADA');
  END IF;

  INSERT INTO public.usuario_roles (usuario_id, rol_id)
  SELECT v_inv.usuario_id, r.id FROM public.roles_sistema r WHERE r.nombre_interno = 'miembro'
  ON CONFLICT (usuario_id, rol_id) DO NOTHING;

  UPDATE public.invitaciones_acceso
     SET estado = 'aceptada',
         token_hash = NULL,
         token_expira_en = NULL,
         auth_user_id = p_auth_user_id,
         aceptada_en = now(),
         updated_at = now()
   WHERE id = v_inv.id;

  IF p_confirma_conyuge IS TRUE THEN
    SELECT * INTO v_insc FROM public.taller_inscripciones i WHERE i.id = v_inv.inscripcion_id;
    IF FOUND
       AND v_insc.link_type = 'matrimonio'
       AND v_insc.companero_id = v_inv.usuario_id
       AND NOT EXISTS (
         SELECT 1 FROM public.relaciones_usuarios r
          WHERE r.tipo_relacion = 'conyuge'
            AND (r.usuario1_id IN (v_insc.persona_principal_id, v_inv.usuario_id)
                 OR r.usuario2_id IN (v_insc.persona_principal_id, v_inv.usuario_id))
       ) THEN
      INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
      VALUES (v_insc.persona_principal_id, v_inv.usuario_id, 'conyuge');
      v_conyuge := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'conyuge_registrado', v_conyuge);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_acceso_vincular(uuid, uuid, boolean) IS
  'Activation: for an activando, unexpired invitation, sets usuarios.auth_id (only when NULL) to an auth user whose email matches the ficha and who is not linked elsewhere, grants miembro, marks the invitation aceptada and drops its token. With p_confirma_conyuge and a matrimonio inscription where neither person has a conyuge relation, records one. Returns {ok:true, conyuge_registrado} or {ok:false, codigo: INVITACION_INVALIDA | AUTH_NO_COINCIDE | FICHA_YA_VINCULADA}.';

REVOKE ALL ON FUNCTION public.invitacion_acceso_vincular(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_acceso_vincular(uuid, uuid, boolean) TO service_role;

-- ===========================================================================
-- G. Signup protection
-- ===========================================================================

-- True while an invitation for the ficha is unfinished (en_espera, enviada,
-- activando) or was blocked: the ordinary signup linker must not take it.
CREATE OR REPLACE FUNCTION public.ficha_tiene_invitacion_abierta(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.invitaciones_acceso ia
     WHERE ia.usuario_id = p_usuario_id
       AND ia.estado IN ('en_espera', 'enviada', 'activando', 'bloqueada')
  );
$function$;

COMMENT ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) IS
  'Signup linker guard: true when the ficha has an invitation in en_espera, enviada, activando or bloqueada; such a ficha is linked only through invitacion_acceso_vincular.';

REVOKE ALL ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) TO service_role;
