-- Account invitations by email (T12 of odd/tasks/ninos-voluntarios-waumba.md).
--
-- A ficha (usuarios row with auth_id NULL) can be invited: an authorized user
-- gives the email, the app creates the auth account through
-- auth.admin.generateLink and sends its own email, and when the person opens
-- the link the new account is bound to EXACTLY that ficha (no guessing by
-- email or cedula, no approval step).
--
-- What:
--   1. public.invitaciones_cuenta: one row per invitation. estado enviada |
--      aceptada | cancelada | expirada; at most one 'enviada' per ficha
--      (partial unique index). RLS on, no policy, no privilege for anon or
--      authenticated: every read and write goes through the functions below.
--   2. public.invitacion_cuenta_puede_invitar(p_usuario_id): admin or pastor
--      (anyone), or whoever dream_team_puede_editar_ficha allows (the
--      Atencion al Voluntario coordinator over the person's area).
--   3. public.invitacion_cuenta_crear(p_usuario_id, p_email, p_reemplazar_email):
--      validates and records a new invitation, cancelling the open one.
--      Errors (RAISE '<code>'): 42501 sin_autoridad; P0002 ficha_no_encontrada;
--      22023 ya_tiene_cuenta, email_invalido, email_distinto (the ficha holds
--      another email and p_reemplazar_email is false); 23505 email_en_uso (the
--      email belongs to another ficha or to an auth account that is not this
--      ficha's earlier invitation). A ficha without email gets the new one
--      (lowercase); a different one is replaced only with p_reemplazar_email.
--      Returns {id, email, nombre, auth_user_id_previo}: the auth account the
--      previous open invitation created, which the app reuses (same email) or
--      deletes when it was never confirmed (different email).
--   4. public.invitacion_cuenta_registrar_envio(p_id, p_auth_user_id): stores
--      the auth account generateLink created (service_role).
--   5. public.invitacion_cuenta_vincular(p_auth_user_id, p_email): binds the
--      account to the invitation's ficha only when the invitation is
--      'enviada', its auth_user_id is this account, the email matches and the
--      ficha still has auth_id NULL; marks it aceptada. Returns
--      'vinculada' | 'sin_invitacion' | 'rechazada' (service_role).
--   6. public.invitacion_cuenta_estado(p_usuario_id): the latest invitation
--      (estado, email, created_at) for whoever may invite; NULL otherwise.
--   7. public.ficha_tiene_invitacion_abierta also counts an 'enviada' account
--      invitation, so the email/cedula heuristic never takes that ficha.
--
-- Blast radius: one new table, five new functions, one replaced function
-- (same signature, grants and owner). No change to usuarios policies.
--
-- Rollback:
--   (restore ficha_tiene_invitacion_abierta from 20261004150000)
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_estado(uuid);
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_vincular(uuid, text);
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_registrar_envio(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_crear(uuid, text, boolean);
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_puede_invitar(uuid);
--   DROP TABLE IF EXISTS public.invitaciones_cuenta;

CREATE TABLE IF NOT EXISTS public.invitaciones_cuenta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  email         text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  invitado_por  uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  estado        text NOT NULL DEFAULT 'enviada'
                CHECK (estado IN ('enviada', 'aceptada', 'cancelada', 'expirada')),
  auth_user_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  aceptada_at   timestamptz
);

COMMENT ON TABLE public.invitaciones_cuenta IS
  'Account invitations by email: binds a new auth account to exactly one ficha. Private on purpose: '
  'RLS on with no policy; read and written only through the invitacion_cuenta_* definer functions.';

CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_cuenta_una_abierta
  ON public.invitaciones_cuenta (usuario_id) WHERE estado = 'enviada';
CREATE INDEX IF NOT EXISTS invitaciones_cuenta_auth_user
  ON public.invitaciones_cuenta (auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.invitaciones_cuenta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invitaciones_cuenta FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_puede_invitar(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (public.es_admin_o_pastor(auth.uid())
          OR public.dream_team_puede_editar_ficha(p_usuario_id));
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) IS
  'Whether the actor (auth.uid()) may invite the person to create an account: admin, pastor, or '
  'whoever dream_team_puede_editar_ficha allows.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_puede_invitar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_crear(
  p_usuario_id uuid,
  p_email text,
  p_reemplazar_email boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ficha   public.usuarios%ROWTYPE;
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_previo  uuid;
  v_actor   uuid;
  v_id      uuid;
BEGIN
  IF NOT public.invitacion_cuenta_puede_invitar(p_usuario_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  SELECT u.* INTO v_ficha FROM public.usuarios u WHERE u.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ficha_no_encontrada' USING errcode = 'P0002';
  END IF;
  IF v_ficha.auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'ya_tiene_cuenta' USING errcode = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'email_invalido' USING errcode = '22023';
  END IF;
  IF nullif(btrim(coalesce(v_ficha.email, '')), '') IS NOT NULL
     AND lower(btrim(v_ficha.email)) <> v_email
     AND NOT coalesce(p_reemplazar_email, false) THEN
    RAISE EXCEPTION 'email_distinto' USING errcode = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios u
              WHERE u.id <> p_usuario_id AND lower(btrim(u.email)) = v_email) THEN
    RAISE EXCEPTION 'email_en_uso' USING errcode = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users au
              WHERE lower(au.email) = v_email
                AND au.id NOT IN (SELECT ic.auth_user_id FROM public.invitaciones_cuenta ic
                                   WHERE ic.usuario_id = p_usuario_id
                                     AND ic.auth_user_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'email_en_uso' USING errcode = '23505';
  END IF;

  SELECT ic.auth_user_id INTO v_previo
    FROM public.invitaciones_cuenta ic
   WHERE ic.usuario_id = p_usuario_id AND ic.estado = 'enviada';
  UPDATE public.invitaciones_cuenta SET estado = 'cancelada'
   WHERE usuario_id = p_usuario_id AND estado = 'enviada';

  IF v_ficha.email IS DISTINCT FROM v_email THEN
    UPDATE public.usuarios SET email = v_email WHERE id = p_usuario_id;
  END IF;

  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();
  INSERT INTO public.invitaciones_cuenta (usuario_id, email, invitado_por)
  VALUES (p_usuario_id, v_email, v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'email', v_email,
    'nombre', btrim(coalesce(v_ficha.nombre, '')),
    'auth_user_id_previo', v_previo);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_crear(uuid, text, boolean) IS
  'Records a new account invitation for a ficha without account (cancelling the open one); '
  'validates authority, email format and email conflicts; saves the email on the ficha.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_crear(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_crear(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_registrar_envio(p_id uuid, p_auth_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.invitaciones_cuenta
     SET auth_user_id = p_auth_user_id
   WHERE id = p_id AND estado = 'enviada';
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_registrar_envio(uuid, uuid) IS
  'Stores the auth account created for an open account invitation (service_role only).';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_registrar_envio(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_registrar_envio(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_vincular(p_auth_user_id uuid, p_email text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inv public.invitaciones_cuenta%ROWTYPE;
  v_n   integer;
BEGIN
  SELECT ic.* INTO v_inv
    FROM public.invitaciones_cuenta ic
   WHERE ic.auth_user_id = p_auth_user_id AND ic.estado = 'enviada'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'sin_invitacion';
  END IF;
  IF v_inv.email <> lower(btrim(coalesce(p_email, ''))) THEN
    RETURN 'rechazada';
  END IF;

  UPDATE public.usuarios SET auth_id = p_auth_user_id
   WHERE id = v_inv.usuario_id AND auth_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN 'rechazada';
  END IF;

  UPDATE public.invitaciones_cuenta
     SET estado = 'aceptada', aceptada_at = now()
   WHERE id = v_inv.id;
  RETURN 'vinculada';
END;
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_vincular(uuid, text) IS
  'Binds an invited auth account to its invitation''s ficha when the invitation is open, the email '
  'matches and the ficha has no account; marks it aceptada (service_role only).';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_vincular(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_vincular(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_estado(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('estado', ic.estado, 'email', ic.email, 'created_at', ic.created_at)
    FROM public.invitaciones_cuenta ic
   WHERE ic.usuario_id = p_usuario_id
     AND public.invitacion_cuenta_puede_invitar(p_usuario_id)
   ORDER BY ic.created_at DESC
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_estado(uuid) IS
  'The latest account invitation of a ficha (estado, email, created_at) for whoever may invite.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_estado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_estado(uuid) TO authenticated;

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
  ) OR EXISTS (
    SELECT 1 FROM public.invitaciones_cuenta ic
     WHERE ic.usuario_id = p_usuario_id
       AND ic.estado = 'enviada'
  );
$function$;

COMMENT ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) IS
  'Signup linker guard: true when the ficha has an access invitation in en_espera, enviada, activando '
  'or bloqueada, or an account invitation in enviada; such a ficha is linked only through its invitation.';

REVOKE ALL ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ficha_tiene_invitacion_abierta(uuid) TO service_role;
