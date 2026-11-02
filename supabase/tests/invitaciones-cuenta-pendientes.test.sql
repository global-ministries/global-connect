-- T1 (odd/tasks/invitaciones-pendientes.md) — pending account invitations
-- (migration 20261102160000_invitaciones_cuenta_pendientes.sql).
--
-- Covers:
--   a. invitacion_cuenta_estados: an admin gets every invitation of the given
--      fichas (history: cancelada + enviada, oldest first) with the inviter's
--      name; a registered person (aceptada) stays visible; a plain user gets
--      nothing; without auth.uid() nothing; more than 2000 ids is
--      demasiados_ids.
--   b. invitacion_cuenta_cancelar: a plain user is refused (sin_autoridad) and
--      the invitation stays 'enviada'; an admin cancels it and gets back
--      {id, auth_user_id}; the estado becomes 'cancelada'; a second cancel is
--      sin_invitacion_abierta.
--   c. Both functions are not executable by anon.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. The MCP
-- connection is postgres (BYPASSRLS), so the authorization cases switch to
-- SET LOCAL ROLE authenticated with the jwt claims of a fixture account. The
-- last statement lists the failing cases plus the total.

BEGIN;

CREATE TEMP TABLE t_res (caso text, ok boolean, detalle text) ON COMMIT DROP;

CREATE FUNCTION pg_temp.como(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.ok(p_caso text, p_ok boolean, p_detalle text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_res VALUES (p_caso, coalesce(p_ok, false), p_detalle);
$$;

-- Runs p_sql and records whether it raised p_mensaje (message text or SQLSTATE).
CREATE FUNCTION pg_temp.falla(p_caso text, p_sql text, p_mensaje text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.ok(p_caso, false, 'no error');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(p_caso, SQLERRM = p_mensaje OR SQLSTATE = p_mensaje, SQLSTATE || ' ' || SQLERRM);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
GRANT ALL ON t_res TO PUBLIC;

CREATE TEMP TABLE t_ctx ON COMMIT DROP AS
SELECT gen_random_uuid() AS admin_auth, gen_random_uuid() AS admin_id,
       gen_random_uuid() AS plano_auth, gen_random_uuid() AS plano_id,
       gen_random_uuid() AS ficha_id,   gen_random_uuid() AS registrada_id,
       gen_random_uuid() AS registrada_auth, gen_random_uuid() AS envio_auth;
GRANT SELECT ON t_ctx TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'icp-test-' || x || '@example.test'
FROM t_ctx, unnest(ARRAY[admin_auth, plano_auth, registrada_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil, email)
SELECT admin_id, admin_auth, 'Admin', 'Prueba', 'Otro'::public.enum_genero,
       'Soltero'::public.enum_estado_civil, NULL FROM t_ctx
UNION ALL
SELECT plano_id, plano_auth, 'Plano', 'Prueba', 'Otro', 'Soltero', NULL FROM t_ctx
UNION ALL
SELECT ficha_id, NULL, 'Ficha', 'Pendiente', 'Otro', 'Soltero', 'icp-ficha@example.test' FROM t_ctx
UNION ALL
SELECT registrada_id, registrada_auth, 'Ficha', 'Registrada', 'Otro', 'Soltero',
       'icp-registrada@example.test' FROM t_ctx;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT c.admin_id, rs.id FROM t_ctx c, public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

-- History: ficha has a cancelled then an open invitation (with an auth
-- account); registrada has an accepted one.
INSERT INTO public.invitaciones_cuenta
  (usuario_id, email, invitado_por, estado, auth_user_id, created_at, aceptada_at)
SELECT ficha_id, 'icp-ficha@example.test', admin_id, 'cancelada', NULL::uuid, now() - interval '3 days', NULL::timestamptz
  FROM t_ctx
UNION ALL
SELECT ficha_id, 'icp-ficha@example.test', admin_id, 'enviada', envio_auth, now() - interval '2 days', NULL
  FROM t_ctx
UNION ALL
SELECT registrada_id, 'icp-registrada@example.test', admin_id, 'aceptada', registrada_auth,
       now() - interval '5 days', now() - interval '4 days'
  FROM t_ctx;

CREATE TEMP TABLE t_abierta ON COMMIT DROP AS
SELECT ic.id FROM public.invitaciones_cuenta ic, t_ctx c
 WHERE ic.usuario_id = c.ficha_id AND ic.estado = 'enviada';
GRANT SELECT ON t_abierta TO PUBLIC;

-- c. Not for anon.
SELECT pg_temp.ok('c: anon cannot execute estados',
  NOT has_function_privilege('anon', 'public.invitacion_cuenta_estados(uuid[])', 'EXECUTE'));
SELECT pg_temp.ok('c: anon cannot execute cancelar',
  NOT has_function_privilege('anon', 'public.invitacion_cuenta_cancelar(uuid)', 'EXECUTE'));
SELECT pg_temp.ok('c: authenticated may execute both',
  has_function_privilege('authenticated', 'public.invitacion_cuenta_estados(uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.invitacion_cuenta_cancelar(uuid)', 'EXECUTE'));

SET LOCAL ROLE authenticated;

-- a. Without auth.uid() nothing.
SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.ok('a: nothing without auth.uid()',
  NOT EXISTS (SELECT 1 FROM public.invitacion_cuenta_estados(ARRAY[ficha_id, registrada_id])))
FROM t_ctx;

-- a. Admin sees the history.
SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('a: admin gets the history of the ficha, oldest first',
  ARRAY(SELECT e.estado FROM public.invitacion_cuenta_estados(ARRAY[c.ficha_id]) e)
    = ARRAY['cancelada', 'enviada'])
FROM t_ctx c;
SELECT pg_temp.ok('a: rows carry email, dates and the inviter name',
  bool_and(e.email = 'icp-ficha@example.test' AND e.created_at IS NOT NULL
           AND e.aceptada_at IS NULL AND e.invitado_por_nombre = 'Admin Prueba'
           AND e.usuario_id = c.ficha_id))
FROM t_ctx c, public.invitacion_cuenta_estados(ARRAY[c.ficha_id]) e;
SELECT pg_temp.ok('a: a registered person stays visible (aceptada with aceptada_at)',
  EXISTS (SELECT 1 FROM public.invitacion_cuenta_estados(ARRAY[c.registrada_id]) e
           WHERE e.estado = 'aceptada' AND e.aceptada_at IS NOT NULL))
FROM t_ctx c;
SELECT pg_temp.ok('a: three rows for both fichas, duplicates and NULLs ignored',
  (SELECT count(*) FROM public.invitacion_cuenta_estados(
     ARRAY[c.ficha_id, c.registrada_id, c.ficha_id, NULL, c.plano_id])) = 3)
FROM t_ctx c;
SELECT pg_temp.falla('a: more than 2000 ids refused',
  'SELECT count(*) FROM public.invitacion_cuenta_estados(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 2001)))',
  'demasiados_ids');

-- a/b. Plain user sees nothing and cannot cancel.
SELECT pg_temp.como(plano_auth) FROM t_ctx;
SELECT pg_temp.ok('a: plain user sees nothing',
  NOT EXISTS (SELECT 1 FROM public.invitacion_cuenta_estados(ARRAY[ficha_id, registrada_id])))
FROM t_ctx;
SELECT pg_temp.falla('b: plain user cannot cancel',
  format('SELECT public.invitacion_cuenta_cancelar(%L)', ficha_id), 'sin_autoridad') FROM t_ctx;
SELECT pg_temp.falla('b: sin_autoridad is 42501',
  format('SELECT public.invitacion_cuenta_cancelar(%L)', ficha_id), '42501') FROM t_ctx;

RESET ROLE;
SELECT pg_temp.ok('b: refused cancel leaves the invitation open',
  (SELECT count(*) FROM public.invitaciones_cuenta
    WHERE usuario_id = c.ficha_id AND estado = 'enviada') = 1)
FROM t_ctx c;
SET LOCAL ROLE authenticated;

-- b. Admin cancels.
SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('b: admin cancel returns the id and the auth account',
  (r ->> 'id')::uuid = (SELECT id FROM t_abierta)
  AND (r ->> 'auth_user_id')::uuid = c.envio_auth)
FROM t_ctx c, LATERAL (SELECT public.invitacion_cuenta_cancelar(c.ficha_id) AS r) x;
SELECT pg_temp.ok('b: the history now shows both cancelled',
  ARRAY(SELECT e.estado FROM public.invitacion_cuenta_estados(ARRAY[c.ficha_id]) e)
    = ARRAY['cancelada', 'cancelada'])
FROM t_ctx c;
SELECT pg_temp.falla('b: second cancel has no open invitation',
  format('SELECT public.invitacion_cuenta_cancelar(%L)', ficha_id), 'sin_invitacion_abierta') FROM t_ctx;
SELECT pg_temp.falla('b: accepted invitation cannot be cancelled',
  format('SELECT public.invitacion_cuenta_cancelar(%L)', registrada_id), 'sin_invitacion_abierta') FROM t_ctx;

RESET ROLE;

SELECT pg_temp.ok('b: no open invitation left and the accepted one untouched',
  NOT EXISTS (SELECT 1 FROM public.invitaciones_cuenta WHERE usuario_id = c.ficha_id AND estado = 'enviada')
  AND (SELECT estado FROM public.invitaciones_cuenta WHERE usuario_id = c.registrada_id) = 'aceptada')
FROM t_ctx c;

SELECT caso, detalle FROM t_res WHERE NOT ok
UNION ALL
SELECT 'total cases', count(*)::text FROM t_res;

ROLLBACK;
