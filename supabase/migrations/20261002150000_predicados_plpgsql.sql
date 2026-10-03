-- Role predicates in plpgsql (security phase 2, follow-up of batch 3).
--
-- What: obtener_roles_usuario and tiene_rol_de_liderazgo move from LANGUAGE sql
-- to LANGUAGE plpgsql. They return exactly what they return today, identity
-- guard of 20261002120000 included.
--
-- Why: RLS policies call them per row. The usuarios policies call
-- obtener_roles_usuario(auth.uid()) and puede_ver_usuario(auth.uid(), id), which
-- calls it again; twenty policies call tiene_rol_de_liderazgo(auth.uid()). A
-- SECURITY DEFINER LANGUAGE sql function is never inlined, so its body is
-- planned again in every statement that calls it, and the guard added
-- auth.uid() and auth.role() to that body. A plpgsql body is compiled once per
-- session, keeps its query plans, and runs the guard as plain comparisons
-- before the query.
--   Measured on production, per call: obtener_roles_usuario 0.38 ms before the
--   guard, 0.56 ms with it; tiene_rol_de_liderazgo 0.42 ms before, 0.69 ms with
--   it. A plpgsql prototype with the guard ran 2-3x faster than the original on
--   staging.
--
-- What changes in the bodies:
--   * The guard is an IF before the query, the form of the plpgsql functions of
--     20261002120000. When it fails the functions return what the guarded query
--     returned: NULL for obtener_roles_usuario (array_agg over no rows) and
--     false for tiene_rol_de_liderazgo.
--   * tiene_rol_de_liderazgo checks the five leadership roles with one EXISTS on
--     the tables instead of calling obtener_roles_usuario (a second definer call
--     per row). Same answer: true when the person holds at least one of them,
--     false otherwise, never NULL. Being STABLE with no VOLATILE call inside, it
--     now reads the roles with the snapshot of the calling statement.
--
-- What does not change: signature, argument name, return type, SECURITY
-- DEFINER, search_path pinned to public, volatility (obtener_roles_usuario stays
-- VOLATILE, tiene_rol_de_liderazgo stays STABLE), not STRICT, owner, and grants
-- (restated at the end, today's state: no anon, no PUBLIC).
--
-- Rollback: recreate both functions from
-- 20261002120000_definer_identidad_predicados.sql.

CREATE OR REPLACE FUNCTION public.obtener_roles_usuario(p_auth_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- NULL when the person has no roles (array_agg over no rows), as before.
  RETURN (
    SELECT array_agg(rs.nombre_interno)
    FROM public.roles_sistema rs
    JOIN public.usuario_roles ur ON rs.id = ur.rol_id
    JOIN public.usuarios u ON ur.usuario_id = u.id
    WHERE u.auth_id = p_auth_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_rol_de_liderazgo(p_auth_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- auth.role() reads the request role from either PostgREST claim format.
  v_request_role text := auth.role();
BEGIN
  -- The caller is the person in the session; only service_role may act for
  -- somebody else.
  IF coalesce(v_request_role, '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_auth_id IS DISTINCT FROM auth.uid()) THEN
    RETURN false;
  END IF;

  -- Read the roles directly: calling obtener_roles_usuario here would add a
  -- second definer call per row.
  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id = u.id
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE u.auth_id = p_auth_id
      AND rs.nombre_interno IN ('lider', 'director-etapa', 'director-general', 'pastor', 'admin')
  );
END;
$function$;

-- Execution rights: signed-in people and the service client only (today's state).
REVOKE ALL ON FUNCTION public.obtener_roles_usuario(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_rol_de_liderazgo(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.obtener_roles_usuario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_rol_de_liderazgo(uuid) TO authenticated, service_role;
