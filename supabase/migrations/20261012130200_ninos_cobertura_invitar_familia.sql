-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños coverage G5 (odd/tasks/ninos-cobertura.md): after "Nueva familia" at
-- the table, the operator may invite the NEW adult to create an account.
--
-- Why: families registered at the table never got an account offer; only
-- confirmed pre-registrations did (ninos_preregistro_invitar).
--
-- What (every function runs as owner with an empty search_path):
--   1. public.ninos_altas_mesa: one row per parent ficha CREATED at the table
--      (padre_nuevo), with the operator and the time. RLS on, no policy, no
--      privilege for anon or authenticated.
--   2. ninos_registrar_familia_mesa(p) — the table's "Nueva familia":
--      registers through ninos_registrar_familia unchanged (same checks,
--      same result) and records the alta when the parent is new. An existing
--      parent (padre.id) is never recorded, so it can never be invited here.
--   3. ninos_familia_invitar(padre, email) — the invitation bound to exactly
--      that new ficha: only the operator who registered it, within 1 hour,
--      with the same checks as ninos_preregistro_invitar (no invite when the
--      ficha already has an account, has another email, or the email belongs
--      to someone else); a resend cancels the previous 'enviada' row.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_familia_invitar(uuid, text);
--   DROP FUNCTION IF EXISTS public.ninos_registrar_familia_mesa(jsonb);
--   DROP TABLE IF EXISTS public.ninos_altas_mesa;

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_altas_mesa (
  padre_id       uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  registrado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  registrado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninos_altas_mesa_operador_idx ON public.ninos_altas_mesa (registrado_por);

ALTER TABLE public.ninos_altas_mesa ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_altas_mesa FROM PUBLIC, anon, authenticated;

-- ── 2. "Nueva familia" at the table ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_registrar_familia_mesa(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- Checks the authority and the data, and refuses a silent reuse of a parent.
  v_res := public.ninos_registrar_familia(p);
  IF (v_res ->> 'padre_nuevo')::boolean THEN
    INSERT INTO public.ninos_altas_mesa (padre_id, registrado_por)
    VALUES ((v_res ->> 'padre_id')::uuid, public.ninos_usuario_actual())
    ON CONFLICT (padre_id) DO NOTHING;
  END IF;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_registrar_familia_mesa(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_registrar_familia_mesa(jsonb) TO authenticated;

-- ── 3. account invitation for the new adult ──────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_familia_invitar(p_padre_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_alta   public.ninos_altas_mesa%ROWTYPE;
  v_ficha  public.usuarios%ROWTYPE;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_previo uuid;
  v_inv    uuid;
BEGIN
  SELECT * INTO v_alta FROM public.ninos_altas_mesa a WHERE a.padre_id = p_padre_id;
  IF v_actor IS NULL OR NOT FOUND OR v_alta.registrado_por <> v_actor
     OR v_alta.registrado_at < now() - interval '1 hour'
     OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.* INTO v_ficha FROM public.usuarios u WHERE u.id = v_alta.padre_id FOR UPDATE;
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
REVOKE ALL ON FUNCTION public.ninos_familia_invitar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_familia_invitar(uuid, text) TO authenticated;
