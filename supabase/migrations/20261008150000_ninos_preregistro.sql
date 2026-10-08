-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: public family pre-registration and parent email notifications
-- (odd/tasks/ninos-checkin.md, tasks N8 and N9).
--
-- What (every function runs as owner with an empty search_path):
--   1. public.ninos_preregistros: one row per form sent from the public page
--      /ninos/registro (QR at the church entrance). RLS on, no policy, no
--      privilege for anon or authenticated: every read and write goes
--      through the functions below. ip_hash is a salted SHA-256 of the
--      client IP computed by the app (never the raw IP), only for the rate
--      limit.
--   2. ninos_preregistro_campus() — campuses with an active room, for the
--      public page's campus picker (service_role).
--   3. ninos_preregistro_crear(campus, payload, ip_hash) — stores a pending
--      pre-registration (service_role; the route handler validated and
--      size-limited the payload). At most 5 per ip_hash per 10 minutes and
--      200 per campus per hour; returns 'ok' or 'limite'.
--   4. ninos_preregistros_pendientes() — the pending pre-registrations of
--      the last 14 days of the campuses where the caller operates a room.
--   5. ninos_preregistro_resolver(id, accion, payload) — 'descartar', or
--      'confirmar': registers the (reviewed) family through
--      ninos_registrar_familia in the same transaction, so the rule that an
--      existing parent must be chosen explicitly (padre.id) still applies.
--   6. ninos_preregistro_invitar(id, email) — right after confirming, the
--      confirming operator may create the account invitation of the parent
--      (no account, email given in the pre-registration). Same row and
--      checks as invitacion_cuenta_crear, which an anfitrión may not call.
--   7. ninos_correos_visita(ninos, turno, fecha, evento) — parent emails of
--      the children of a check-in ('ingreso') or check-out ('retiro'), only
--      for the rows the caller made (entrada_por / salida_por).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_correos_visita(uuid[], uuid, date, text);
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_invitar(uuid, text);
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_resolver(uuid, text, jsonb);
--   DROP FUNCTION IF EXISTS public.ninos_preregistros_pendientes();
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_crear(uuid, jsonb, text);
--   DROP FUNCTION IF EXISTS public.ninos_preregistro_campus();
--   DROP TABLE IF EXISTS public.ninos_preregistros;

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_preregistros (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id        uuid NOT NULL REFERENCES public.campus(id) ON DELETE CASCADE,
  payload          jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 32768),
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'descartado')),
  ip_hash          text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmado_por   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  confirmado_at    timestamptz,
  familia_padre_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ninos_preregistros_pendientes_idx
  ON public.ninos_preregistros (campus_id, created_at DESC) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS ninos_preregistros_ip_idx
  ON public.ninos_preregistros (ip_hash, created_at DESC);

ALTER TABLE public.ninos_preregistros ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_preregistros FROM PUBLIC, anon, authenticated;

-- ── 2. campus picker ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_campus()
RETURNS TABLE (id uuid, nombre text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id, c.nombre::text FROM public.campus c
   WHERE EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = c.id AND s.activo)
   ORDER BY c.nombre;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_campus() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_campus() TO service_role;

-- ── 3. create (public page, through the route handler) ──────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_crear(p_campus_id uuid, p_payload jsonb, p_ip_hash text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR jsonb_typeof(p_payload -> 'padre') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload -> 'hijos') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'hijos') NOT BETWEEN 1 AND 10
     OR octet_length(p_payload::text) > 32768 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo) THEN
    RAISE EXCEPTION 'sin_campus' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_preregistro:' || coalesce(p_ip_hash, '-'), 0));
  IF (SELECT count(*) FROM public.ninos_preregistros r
       WHERE r.ip_hash = p_ip_hash AND r.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.ninos_preregistros r
          WHERE r.campus_id = p_campus_id AND r.created_at > now() - interval '1 hour') >= 200 THEN
    RETURN 'limite';
  END IF;

  INSERT INTO public.ninos_preregistros (campus_id, payload, ip_hash)
  VALUES (p_campus_id, p_payload, p_ip_hash);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_crear(uuid, jsonb, text) TO service_role;

-- ── 4. pending list at the table ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistros_pendientes()
RETURNS TABLE (id uuid, campus_id uuid, payload jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT r.id, r.campus_id, r.payload, r.created_at
    FROM public.ninos_preregistros r
   WHERE r.estado = 'pendiente'
     AND r.created_at > now() - interval '14 days'
     AND EXISTS (SELECT 1 FROM public.ninos_salones s
                  WHERE s.campus_id = r.campus_id AND s.activo AND public.ninos_puede_operar(s.equipo_id))
   ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.ninos_preregistros_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistros_pendientes() TO authenticated;

-- ── 5. confirm or discard ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_resolver(p_id uuid, p_accion text, p_payload jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_row    public.ninos_preregistros%ROWTYPE;
  v_res    jsonb;
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
    -- Raises padre_existente unless an existing parent was chosen (padre.id).
    v_res := public.ninos_registrar_familia(p_payload);
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

-- ── 6. account invitation for the confirmed parent ───────────────────

CREATE OR REPLACE FUNCTION public.ninos_preregistro_invitar(p_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_row    public.ninos_preregistros%ROWTYPE;
  v_ficha  public.usuarios%ROWTYPE;
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_previo uuid;
  v_inv    uuid;
BEGIN
  SELECT * INTO v_row FROM public.ninos_preregistros r WHERE r.id = p_id;
  IF v_actor IS NULL OR NOT FOUND OR v_row.estado <> 'confirmado' OR v_row.confirmado_por <> v_actor
     OR v_row.confirmado_at < now() - interval '1 hour' OR v_row.familia_padre_id IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  -- Only the address the family itself gave (possibly corrected at the table).
  IF v_email = '' OR v_email <> lower(btrim(coalesce(v_row.payload -> 'padre' ->> 'email', ''))) THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.* INTO v_ficha FROM public.usuarios u WHERE u.id = v_row.familia_padre_id FOR UPDATE;
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
REVOKE ALL ON FUNCTION public.ninos_preregistro_invitar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_preregistro_invitar(uuid, text) TO authenticated;

-- ── 7. parent emails of a visit ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_correos_visita(p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_evento text)
RETURNS TABLE (visita_id uuid, padre_id uuid, email text, padre_nombre text, nino_nombre text,
               nino_genero text, salon text, codigo text, entrada_at timestamptz, salida_at timestamptz,
               retirado_por_nombre text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.visita_id, p.id, lower(btrim(p.email)), p.nombre::text, n.nombre::text, n.genero::text, s.nombre::text,
         c.codigo, c.entrada_at, c.salida_at, c.retirado_por_nombre
    FROM public.ninos_checkins c
    JOIN public.ninos_salones s ON s.id = c.salon_id
    JOIN public.usuarios n ON n.id = c.nino_id
    JOIN public.relaciones_usuarios r ON r.usuario1_id = c.nino_id AND r.tipo_relacion::text IN ('padre', 'madre', 'tutor')
    JOIN public.usuarios p ON p.id = r.usuario2_id
   WHERE public.ninos_usuario_actual() IS NOT NULL
     AND c.nino_id = ANY (p_nino_ids) AND c.turno_id = p_turno_id AND c.fecha = p_fecha
     AND ((p_evento = 'ingreso' AND c.entrada_por = public.ninos_usuario_actual())
       OR (p_evento = 'retiro' AND c.salida_at IS NOT NULL AND c.salida_por = public.ninos_usuario_actual()))
     AND nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
   ORDER BY c.visita_id, p.id, n.nombre;
$$;
REVOKE ALL ON FUNCTION public.ninos_correos_visita(uuid[], uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_correos_visita(uuid[], uuid, date, text) TO authenticated;
