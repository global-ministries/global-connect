-- Pending links by cédula for fichas that hold a service role.
--
-- What: a table vinculos_pendientes plus two definer RPCs,
-- vinculos_pendientes_listar() and vinculo_pendiente_resolver(uuid, boolean).
--
-- Why: after a confirmed signup the app links a ficha to the new account by
-- the confirmed email, or by the typed cédula when the ficha has no email.
-- Knowing someone's cédula is not proof of identity. When that ficha holds a
-- service role (lider, director-etapa, director-general, pastor, admin, or an
-- active Dream Team service) the app stores a pending request here instead of
-- linking, and a person above that ficha approves or rejects it.
--
-- Who may resolve a request: the director de etapa of a group the person is
-- an active member of (director_etapa_grupos + segmento_lideres), the director
-- general of that group (es_director_general_de_grupo, superadmin included),
-- and admin or pastor (es_admin_o_pastor).
--
-- Access: RLS on, no policies, no table grants for anon or authenticated. The
-- app inserts with the service client; people read and resolve only through
-- the RPCs, which take the actor from auth.uid().
--
-- Rollback: remove the three functions (vinculo_pendiente_resolver,
-- vinculos_pendientes_listar, vinculo_pendiente_puede_resolver) and then the
-- vinculos_pendientes table.

CREATE TABLE public.vinculos_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  resuelto_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  CHECK ((estado = 'pendiente') = (resuelto_en IS NULL))
);

COMMENT ON TABLE public.vinculos_pendientes IS
  'Signup links by cédula to a ficha that holds a service role, waiting for a director, pastor or admin. Written by the service client; read and resolved only through vinculos_pendientes_listar and vinculo_pendiente_resolver.';

-- One open request per account and ficha.
CREATE UNIQUE INDEX vinculos_pendientes_abierto_uq
  ON public.vinculos_pendientes (ficha_id, auth_user_id)
  WHERE estado = 'pendiente';

CREATE INDEX vinculos_pendientes_estado_idx
  ON public.vinculos_pendientes (estado, creado_en);

ALTER TABLE public.vinculos_pendientes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vinculos_pendientes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vinculos_pendientes TO service_role;

-- Internal: may the person with auth id p_actor resolve requests for p_ficha?
-- Not granted to anyone; only the two RPCs below call it, as owner.
CREATE OR REPLACE FUNCTION public.vinculo_pendiente_puede_resolver(p_actor uuid, p_ficha uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_actor IS NULL OR p_ficha IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_admin_o_pastor(p_actor) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id
    WHERE gm.usuario_id = p_ficha
      AND gm.fecha_salida IS NULL
      AND g.activo IS TRUE
      AND g.eliminado IS NOT TRUE
      AND (
        EXISTS (
          SELECT 1
          FROM public.director_etapa_grupos deg
          JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
          JOIN public.usuarios yo ON yo.id = sl.usuario_id
          WHERE deg.grupo_id = g.id
            AND sl.tipo_lider = 'director_etapa'
            AND yo.auth_id = p_actor
        )
        OR public.es_director_general_de_grupo(p_actor, g.id)
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.vinculos_pendientes_listar()
 RETURNS TABLE (
   id uuid,
   ficha_id uuid,
   nombre_enmascarado text,
   cedula_enmascarada text,
   correo_solicitante text,
   creado_en timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    vp.id,
    vp.ficha_id,
    -- Initials only: enough to recognise the person, not to read the ficha.
    concat_ws(' ',
      nullif(left(btrim(u.nombre), 1), '') || '.',
      nullif(left(btrim(u.apellido), 1), '') || '.'),
    CASE
      WHEN u.cedula IS NULL OR length(u.cedula) <= 3 THEN '***'
      ELSE repeat('*', length(u.cedula) - 3) || right(u.cedula, 3)
    END,
    au.email::text,
    vp.creado_en
  FROM public.vinculos_pendientes vp
  JOIN public.usuarios u ON u.id = vp.ficha_id
  LEFT JOIN auth.users au ON au.id = vp.auth_user_id
  WHERE vp.estado = 'pendiente'
    AND public.vinculo_pendiente_puede_resolver(v_actor, vp.ficha_id)
  ORDER BY vp.creado_en, vp.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vinculo_pendiente_resolver(p_id uuid, p_aprobar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_ficha uuid;
  v_req public.vinculos_pendientes%ROWTYPE;
  v_filas integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'SIN_SESION' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_aprobar IS NULL THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req
  FROM public.vinculos_pendientes
  WHERE id = p_id
  FOR UPDATE;

  -- A missing request and one the caller may not resolve look the same.
  IF NOT FOUND OR NOT public.vinculo_pendiente_puede_resolver(v_actor, v_req.ficha_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_ENCONTRADO');
  END IF;

  IF v_req.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'YA_RESUELTO');
  END IF;

  SELECT id INTO v_actor_ficha FROM public.usuarios WHERE auth_id = v_actor;

  IF NOT p_aprobar THEN
    UPDATE public.vinculos_pendientes
    SET estado = 'rechazado', resuelto_por = v_actor_ficha, resuelto_en = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'estado', 'rechazado');
  END IF;

  -- The account must not own another ficha already.
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = v_req.auth_user_id) THEN
    UPDATE public.vinculos_pendientes
    SET estado = 'rechazado', resuelto_por = v_actor_ficha, resuelto_en = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'codigo', 'CUENTA_YA_VINCULADA');
  END IF;

  -- Never take a ficha that already has an account.
  UPDATE public.usuarios
  SET auth_id = v_req.auth_user_id
  WHERE id = v_req.ficha_id
    AND auth_id IS NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas = 0 THEN
    UPDATE public.vinculos_pendientes
    SET estado = 'rechazado', resuelto_por = v_actor_ficha, resuelto_en = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'codigo', 'FICHA_YA_VINCULADA');
  END IF;

  UPDATE public.vinculos_pendientes
  SET estado = 'aprobado', resuelto_por = v_actor_ficha, resuelto_en = now()
  WHERE id = p_id;

  -- Other open requests for the same ficha can no longer succeed.
  UPDATE public.vinculos_pendientes
  SET estado = 'rechazado', resuelto_por = v_actor_ficha, resuelto_en = now()
  WHERE ficha_id = v_req.ficha_id
    AND estado = 'pendiente'
    AND id <> p_id;

  RETURN jsonb_build_object('ok', true, 'estado', 'aprobado');
END;
$function$;

REVOKE ALL ON FUNCTION public.vinculo_pendiente_puede_resolver(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vinculos_pendientes_listar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vinculo_pendiente_resolver(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.vinculo_pendiente_puede_resolver(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vinculos_pendientes_listar() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vinculo_pendiente_resolver(uuid, boolean) TO authenticated, service_role;
