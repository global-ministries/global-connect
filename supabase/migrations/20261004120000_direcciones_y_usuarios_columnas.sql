-- Who reads and writes direcciones, and which usuarios columns a session may
-- update (security, pending batch D1 and D2).
--
-- D1. direcciones
--   Before: SELECT open to every session, UPDATE and DELETE to any leader
--   (tiene_rol_de_liderazgo), and the own-address branch compared
--   usuarios.direccion_id with usuarios.id, so it never matched. anon held
--   every table privilege.
--   A direccion is referenced from usuarios.direccion_id, familias.direccion_id,
--   grupos.direccion_anfitrion_id, casas_anfitrionas.direccion_id and
--   casa_anfitriona_location_reviews.proposed_direccion_id. No new visibility
--   rule is made here; each branch reuses the predicate that already guards
--   the row pointing at the address:
--     puede_ver_direccion(id)  admin or pastor (es_superadmin); a person the
--       caller may see (puede_ver_usuario or puede_ver_usuario_ficha) whose
--       own or family address it is; a group the caller may see
--       (puede_ver_grupo).
--     casas_anfitrionas        the policy adds an EXISTS on that table, which
--       runs under the caller's own RLS there.
--     puede_editar_direccion(id)  admin or pastor; a person the caller may
--       edit (puede_editar_usuario), own or family address; a group the
--       caller may edit (puede_editar_grupo).
--   SELECT: puede_ver_direccion or a visible casa. UPDATE: puede_editar_direccion
--   (USING and WITH CHECK). DELETE: service_role only (no app path deletes).
--   INSERT: kept for authenticated; RETURNING needs the SELECT policy, so the
--   app creates addresses with the service client after its own check.
--   anon loses every privilege.
--   The views v_mapa_grupos_vida and v_casas_anfitrionas_disponibles run as
--   their owner and are not affected; definer RPCs neither.
--
-- D2. usuarios
--   Before: anon and authenticated held UPDATE (and INSERT) on twenty columns,
--   cedula, email, id, auth_id, familia_id, fecha_registro and estado_civil
--   among them. Every app write to usuarios already goes through the service
--   client after puede_editar_usuario (lib/actions/user.actions.ts,
--   photo.actions.ts, auth.actions.ts, app/api/import/grupos).
--   Now authenticated keeps UPDATE only on telefono, foto_perfil_url,
--   ocupacion_id and profesion_id; anon keeps no UPDATE or INSERT. direccion_id
--   is left out on purpose: pointing it at another address would open that
--   address through puede_ver_direccion.
--   The UPDATE policy "Los usuarios pueden editar perfiles según su rol"
--   called puede_ver_usuario(auth.uid(), id), mixing id kinds (always false
--   since lot 6); it now uses puede_editar_usuario(auth.uid(), id).
--   actualizar_usuario_y_direccion (invoker, no caller in the app, wrote
--   cedula and email) loses EXECUTE for PUBLIC, anon and authenticated.

CREATE OR REPLACE FUNCTION public.puede_ver_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_superadmin(v_me) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_ver_grupo(v_me, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_direccion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_editar_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_superadmin(v_me) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_editar_grupo(v_auth, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_editar_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_direccion(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Los usuarios autenticados pueden ver todas las direcciones" ON public.direcciones;
DROP POLICY IF EXISTS "Los usuarios pueden editar su propia dirección o los líderes " ON public.direcciones;
DROP POLICY IF EXISTS "Solo los líderes pueden eliminar direcciones" ON public.direcciones;
DROP POLICY IF EXISTS "Los usuarios autenticados pueden crear direcciones" ON public.direcciones;

CREATE POLICY "direcciones_select_segun_ficha_grupo_o_casa" ON public.direcciones
  FOR SELECT TO authenticated
  USING (
    public.puede_ver_direccion(id)
    OR EXISTS (SELECT 1 FROM public.casas_anfitrionas c WHERE c.direccion_id = direcciones.id)
  );

CREATE POLICY "direcciones_update_segun_ficha_o_grupo" ON public.direcciones
  FOR UPDATE TO authenticated
  USING (public.puede_editar_direccion(id))
  WITH CHECK (public.puede_editar_direccion(id));

CREATE POLICY "direcciones_insert_con_sesion" ON public.direcciones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL ON public.direcciones FROM anon;
REVOKE DELETE, TRUNCATE ON public.direcciones FROM authenticated;

-- D2
REVOKE INSERT, UPDATE ON public.usuarios FROM anon;
REVOKE UPDATE ON public.usuarios FROM authenticated;
GRANT UPDATE (telefono, foto_perfil_url, ocupacion_id, profesion_id) ON public.usuarios TO authenticated;

DROP POLICY IF EXISTS "Los usuarios pueden editar perfiles según su rol" ON public.usuarios;
CREATE POLICY "Los usuarios pueden editar perfiles según su rol" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.puede_editar_usuario((SELECT auth.uid()), id))
  WITH CHECK (public.puede_editar_usuario((SELECT auth.uid()), id));

REVOKE ALL ON FUNCTION public.actualizar_usuario_y_direccion(uuid, text, text, text, text, text, date, text, text, uuid, uuid, uuid, text, text, text, text, uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
