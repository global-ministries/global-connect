-- Pending account invitations in Servidores (T1 of odd/tasks/invitaciones-pendientes.md).
--
-- Why: directors want to see, inside Dream Team → Servidores, who never
-- accepted the invitation to register, and resend or cancel it. The state is
-- only readable one person at a time (invitacion_cuenta_estado) and there is
-- no way to cancel an invitation, so the old link keeps working.
--
-- What:
--   1. public.invitacion_cuenta_estados(p_usuario_ids): every account
--      invitation (all estados, oldest first per person) of the given fichas
--      the actor may invite (invitacion_cuenta_puede_invitar), with the
--      inviter's name. Nothing without auth.uid(). At most 2000 ids per call
--      (22023 demasiados_ids). puede_invitar does not look at auth_id, so
--      people who already registered stay visible to the same actors (the
--      "Se registraron (30 días)" view) without widening authority.
--      The 24 h expiry ("Invitación vencida") is derived by the app from
--      created_at; the stored estado stays 'enviada'.
--   2. public.invitacion_cuenta_cancelar(p_usuario_id): for whoever may
--      invite, sets the open ('enviada') invitation to 'cancelada' and returns
--      {id, auth_user_id} so the app can delete the auth account when it was
--      never confirmed (the old link stops working). Errors (RAISE '<code>'):
--      42501 sin_autoridad; P0002 sin_invitacion_abierta.
--
-- Blast radius: two new functions; no table, policy or existing function
-- changes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_cancelar(uuid);
--   DROP FUNCTION IF EXISTS public.invitacion_cuenta_estados(uuid[]);

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_estados(p_usuario_ids uuid[])
RETURNS TABLE (
  usuario_id          uuid,
  id                  uuid,
  estado              text,
  email               text,
  created_at          timestamptz,
  aceptada_at         timestamptz,
  invitado_por_nombre text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF cardinality(p_usuario_ids) > 2000 THEN
    RAISE EXCEPTION 'demasiados_ids' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH permitidos AS MATERIALIZED (
    SELECT DISTINCT x AS uid
      FROM unnest(coalesce(p_usuario_ids, '{}'::uuid[])) AS x
     WHERE x IS NOT NULL
  ), autorizados AS MATERIALIZED (
    SELECT p.uid FROM permitidos p
     WHERE public.invitacion_cuenta_puede_invitar(p.uid)
  )
  SELECT ic.usuario_id, ic.id, ic.estado, ic.email, ic.created_at, ic.aceptada_at,
         nullif(btrim(concat_ws(' ', inv.nombre, inv.apellido)), '')
    FROM autorizados a
    JOIN public.invitaciones_cuenta ic ON ic.usuario_id = a.uid
    LEFT JOIN public.usuarios inv ON inv.id = ic.invitado_por
   ORDER BY ic.usuario_id, ic.created_at, ic.id;
END;
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_estados(uuid[]) IS
  'Every account invitation (all estados, oldest first per person, with the inviter''s name) of the '
  'given fichas the actor may invite (invitacion_cuenta_puede_invitar); nothing without auth.uid(). '
  'At most 2000 ids (demasiados_ids).';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_estados(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_estados(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.invitacion_cuenta_cancelar(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inv public.invitaciones_cuenta%ROWTYPE;
BEGIN
  IF NOT public.invitacion_cuenta_puede_invitar(p_usuario_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING errcode = '42501';
  END IF;

  SELECT ic.* INTO v_inv
    FROM public.invitaciones_cuenta ic
   WHERE ic.usuario_id = p_usuario_id AND ic.estado = 'enviada'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_invitacion_abierta' USING errcode = 'P0002';
  END IF;

  UPDATE public.invitaciones_cuenta SET estado = 'cancelada' WHERE id = v_inv.id;

  RETURN jsonb_build_object('id', v_inv.id, 'auth_user_id', v_inv.auth_user_id);
END;
$function$;

COMMENT ON FUNCTION public.invitacion_cuenta_cancelar(uuid) IS
  'For whoever may invite: cancels the open account invitation of the ficha and returns '
  '{id, auth_user_id} so the app can delete a never-confirmed auth account.';

REVOKE ALL ON FUNCTION public.invitacion_cuenta_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitacion_cuenta_cancelar(uuid) TO authenticated;
