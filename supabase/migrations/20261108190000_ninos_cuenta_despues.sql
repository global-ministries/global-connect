-- noqa: insert-into (every INSERT lives inside a function body; no data is written here)
-- Niños: the account comes later and nothing is lost
-- (odd/tasks/ninos-checkin-pco.md, T2k, S9.9 "Invitación automática + botón
-- en la mesa").
--
-- Why: a family registered without an account keeps everything (usuarios,
-- fichas, relaciones), but the email the parent left in the QR was only
-- written on the ficha when the invitation went out, and the desk could only
-- invite a parent it had just registered, within one hour
-- (ninos_familia_invitar, 20261012130200). On a later visit nobody at the
-- desk could offer the account.
--
-- What (every function runs as owner with an empty search_path):
--   1. ninos_guardar_email_padre(padre, email) → boolean, internal: writes a
--      valid email on a ficha with no account and no email, only when no
--      other ficha and no auth account use it. Never overwrites an email.
--   2. ninos_preregistro_resolver(uuid, text, jsonb): as in 20261012150000;
--      confirming a QR request whose reviewed payload has padre.email stores
--      it on the NEW parent through (1) and reports email_guardado
--      (true | false). An existing parent chosen by id is never touched; no
--      email → no email_guardado.
--   3. ninos_familia_puede_invitar(padre) → boolean, internal: the caller
--      operates Niños and the person is the parent (padre/tutor) of a child
--      with a Niños ficha, inside the caller's operable campuses (the scope
--      of ninos_buscar_familias: ninos_en_alcance + ninos_campus_operables;
--      admin and pastor keep every campus). Never by phone, never global.
--   4. ninos_familia_cuenta(padre) → jsonb, for the desk: {sin_cuenta,
--      email_ficha, invitacion: {estado, email, created_at} | null}; for a
--      parent with an account only {sin_cuenta: false}. sin_autoridad
--      outside (3).
--   5. ninos_familia_cuenta_invitar(padre, email) → jsonb, the invitation at
--      any later visit: same checks and result as ninos_familia_invitar
--      (email_invalido, ya_tiene_cuenta, email_distinto, email_en_uso; a
--      resend cancels the previous 'enviada' row) with (3) instead of "the
--      operator who registered it, within one hour", plus a cooldown per
--      family: no second invitation within 10 minutes of one whose link was
--      created (auth_user_id set) → invitacion_reciente (22023).
--   ninos_familia_invitar and ninos_preregistro_invitar are unchanged.
--
-- Rollback:
--   re-run ninos_preregistro_resolver from 20261012150000_ninos_mis_hijos_equipo.sql;
--   DROP FUNCTION IF EXISTS public.ninos_familia_cuenta_invitar(uuid, text);
--   DROP FUNCTION IF EXISTS public.ninos_familia_cuenta(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_familia_puede_invitar(uuid);
--   DROP FUNCTION IF EXISTS public.ninos_guardar_email_padre(uuid, text);

-- ── 1. store an email on a ficha without one ─────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_guardar_email_padre(p_padre_id uuid, p_email text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN false;
  END IF;
  -- Two confirmations with the same address never both store it.
  PERFORM pg_advisory_xact_lock(hashtext('ninos_email:' || v_email));
  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id <> p_padre_id AND lower(btrim(u.email)) = v_email)
     OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email) THEN
    RETURN false;
  END IF;
  UPDATE public.usuarios SET email = v_email
   WHERE id = p_padre_id AND auth_id IS NULL AND nullif(btrim(coalesce(email, '')), '') IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_guardar_email_padre(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 2. confirming a pre-registration keeps the QR email ──────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_resolver(p_id uuid, p_accion text, p_payload jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_row    public.ninos_preregistros%ROWTYPE;
  v_res    jsonb;
  v_email  text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.ninos_preregistros r WHERE r.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.ninos_salones s
                               WHERE s.campus_id = v_row.campus_id AND s.activo
                                 AND public.ninos_puede_operar(s.equipo_id)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_row.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'preregistro_resuelto' USING ERRCODE = '22023';
  END IF;
  IF p_accion = 'descartar' THEN
    UPDATE public.ninos_preregistros
       SET estado = 'descartado', confirmado_por = v_actor, confirmado_at = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('estado', 'descartado');
  ELSIF p_accion = 'confirmar' THEN
    IF v_row.solicitado_por IS NOT NULL THEN
      v_res := public.ninos_preregistro_confirmar_cuenta(v_row.solicitado_por, p_payload);
    ELSE
      IF jsonb_typeof(p_payload -> 'hijos') = 'array'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload -> 'hijos') h(x)
                      WHERE jsonb_typeof(h.x) = 'object' AND h.x ? 'existente_id') THEN
        RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'existente_id only for account requests';
      END IF;
      v_res := public.ninos_registrar_familia(p_payload);
      -- The email the family gave (reviewed at the desk), on the new parent only.
      v_email := public.ninos_texto(p_payload -> 'padre', 'email');
      IF (v_res ->> 'padre_nuevo')::boolean AND v_email IS NOT NULL THEN
        v_res := v_res || jsonb_build_object('email_guardado',
                   public.ninos_guardar_email_padre((v_res ->> 'padre_id')::uuid, v_email));
      END IF;
    END IF;
    UPDATE public.ninos_preregistros
       SET estado = 'confirmado', confirmado_por = v_actor, confirmado_at = now(),
           familia_padre_id = (v_res ->> 'padre_id')::uuid, payload = p_payload
     WHERE id = p_id;
    RETURN v_res || jsonb_build_object('estado', 'confirmado');
  END IF;
  RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023', DETAIL = 'accion: confirmar | descartar';
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_resolver(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_resolver(uuid, text, jsonb) TO authenticated;

-- ── 3. who may offer the account at the desk ─────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_familia_puede_invitar(p_padre_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_usuario_actual() IS NOT NULL
     AND public.ninos_puede_operar_algun_area()
     AND EXISTS (SELECT 1 FROM public.relaciones_usuarios r
                   JOIN public.ninos_fichas f ON f.usuario_id = r.usuario1_id
                  WHERE r.usuario2_id = p_padre_id AND r.tipo_relacion IN ('padre', 'tutor')
                 UNION ALL
                 SELECT 1 FROM public.relaciones_usuarios r
                   JOIN public.ninos_fichas f ON f.usuario_id = r.usuario2_id
                  WHERE r.usuario1_id = p_padre_id AND r.tipo_relacion = 'hijo')
     AND public.ninos_en_alcance(p_padre_id, public.ninos_campus_operables());
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_puede_invitar(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. the account state on the family card ──────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_familia_cuenta(p_padre_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ficha public.usuarios%ROWTYPE;
BEGIN
  IF NOT public.ninos_familia_puede_invitar(p_padre_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT u.* INTO v_ficha FROM public.usuarios u WHERE u.id = p_padre_id;
  IF v_ficha.auth_id IS NOT NULL THEN
    RETURN jsonb_build_object('sin_cuenta', false);
  END IF;
  RETURN jsonb_build_object(
    'sin_cuenta', true,
    'email_ficha', nullif(btrim(coalesce(v_ficha.email, '')), ''),
    'invitacion', (SELECT jsonb_build_object('estado', ic.estado, 'email', ic.email, 'created_at', ic.created_at)
                     FROM public.invitaciones_cuenta ic
                    WHERE ic.usuario_id = p_padre_id
                    ORDER BY ic.created_at DESC
                    LIMIT 1));
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_cuenta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_familia_cuenta(uuid) TO authenticated;

-- ── 5. the invitation at any later visit ─────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_familia_cuenta_invitar(p_padre_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_ficha  public.usuarios%ROWTYPE;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_previo uuid;
  v_inv    uuid;
BEGIN
  IF NOT public.ninos_familia_puede_invitar(p_padre_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = '22023';
  END IF;

  -- The row lock also serializes two invitations of the same family.
  SELECT u.* INTO v_ficha FROM public.usuarios u WHERE u.id = p_padre_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ficha_no_encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_ficha.auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'ya_tiene_cuenta' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(v_ficha.email, '')), '') IS NOT NULL AND lower(btrim(v_ficha.email)) <> v_email THEN
    RAISE EXCEPTION 'email_distinto' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id <> v_ficha.id AND lower(btrim(u.email)) = v_email)
     OR EXISTS (SELECT 1 FROM auth.users au
                 WHERE lower(au.email) = v_email
                   AND au.id NOT IN (SELECT ic.auth_user_id FROM public.invitaciones_cuenta ic
                                      WHERE ic.usuario_id = v_ficha.id AND ic.auth_user_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'email_en_uso' USING ERRCODE = '23505';
  END IF;
  -- One email per family every 10 minutes (an invitation whose link was created).
  IF EXISTS (SELECT 1 FROM public.invitaciones_cuenta ic
              WHERE ic.usuario_id = v_ficha.id AND ic.auth_user_id IS NOT NULL
                AND ic.created_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'invitacion_reciente' USING ERRCODE = '22023';
  END IF;

  SELECT ic.auth_user_id INTO v_previo
    FROM public.invitaciones_cuenta ic WHERE ic.usuario_id = v_ficha.id AND ic.estado = 'enviada';
  UPDATE public.invitaciones_cuenta SET estado = 'cancelada'
   WHERE usuario_id = v_ficha.id AND estado = 'enviada';
  IF v_ficha.email IS DISTINCT FROM v_email THEN
    UPDATE public.usuarios SET email = v_email WHERE id = v_ficha.id;
  END IF;
  INSERT INTO public.invitaciones_cuenta (usuario_id, email, invitado_por)
  VALUES (v_ficha.id, v_email, v_actor)
  RETURNING id INTO v_inv;

  RETURN jsonb_build_object('id', v_inv, 'email', v_email,
                            'nombre', btrim(coalesce(v_ficha.nombre, '')), 'auth_user_id_previo', v_previo);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_familia_cuenta_invitar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_familia_cuenta_invitar(uuid, text) TO authenticated;
