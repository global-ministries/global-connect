-- T12 (odd/tasks/ninos-voluntarios-waumba.md) — account invitations by email
-- (migration 20261008120000_invitaciones_cuenta.sql).
--
-- Covers:
--   a. invitaciones_cuenta is private: RLS on, no policy, authenticated can
--      neither SELECT nor INSERT it (42501).
--   b. invitacion_cuenta_crear: a plain user is refused (sin_autoridad); an
--      admin invites a ficha without email (email saved lowercase); a ficha
--      with an account is refused (ya_tiene_cuenta); a malformed email is
--      refused; a different email needs p_reemplazar_email (email_distinto);
--      an email of another ficha or of a foreign auth account is email_en_uso;
--      re-inviting cancels the open invitation (one open per ficha) and
--      returns the previous auth account.
--   c. The registration and linking functions are service_role only.
--   d. invitacion_cuenta_vincular: a mismatched email is rechazada and links
--      nothing; the right account links exactly the ficha and marks aceptada;
--      an account without invitation is sin_invitacion; a ficha that already
--      got an account is untouched (rechazada).
--   e. ficha_tiene_invitacion_abierta counts an open account invitation.
--   f. invitacion_cuenta_estado returns the latest invitation to an admin and
--      NULL to a plain user; invitacion_cuenta_sin_cuenta lists only fichas
--      without account, and nothing to a plain user.
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

-- Runs p_sql and records whether it raised p_mensaje (message text).
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
       gen_random_uuid() AS ficha_id,   gen_random_uuid() AS ficha2_id,
       gen_random_uuid() AS conectada_id, gen_random_uuid() AS ajena_auth,
       gen_random_uuid() AS nueva_auth,  gen_random_uuid() AS otra_auth;
GRANT SELECT ON t_ctx TO PUBLIC;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ic-test-' || x || '@example.test'
FROM t_ctx, unnest(ARRAY[admin_auth, plano_auth, ajena_auth, nueva_auth, otra_auth]) AS x;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, genero, estado_civil, email)
SELECT admin_id, admin_auth, 'Admin', 'Prueba', 'Otro'::public.enum_genero,
       'Soltero'::public.enum_estado_civil, NULL FROM t_ctx
UNION ALL
SELECT plano_id, plano_auth, 'Plano', 'Prueba', 'Otro', 'Soltero', NULL FROM t_ctx
UNION ALL
SELECT ficha_id, NULL, 'Ficha', 'Sin Correo', 'Otro', 'Soltero', NULL FROM t_ctx
UNION ALL
SELECT ficha2_id, NULL, 'Ficha', 'Con Correo', 'Otro', 'Soltero', 'ic-ficha2@example.test' FROM t_ctx
UNION ALL
SELECT conectada_id, ajena_auth, 'Ficha', 'Con Cuenta', 'Otro', 'Soltero', NULL FROM t_ctx;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT c.admin_id, rs.id FROM t_ctx c, public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

-- a. Private table.
SELECT pg_temp.ok('a: rls on', relrowsecurity, NULL)
  FROM pg_class WHERE oid = 'public.invitaciones_cuenta'::regclass;
SELECT pg_temp.ok('a: no policy',
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invitaciones_cuenta'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.falla('a: authenticated cannot select',
  'SELECT count(*) FROM public.invitaciones_cuenta', '42501');
SELECT pg_temp.falla('a: authenticated cannot insert',
  format('INSERT INTO public.invitaciones_cuenta (usuario_id, email) VALUES (%L, %L)',
         ficha_id, 'x@example.test'), '42501') FROM t_ctx;

-- b. Creating invitations.
SELECT pg_temp.como(plano_auth) FROM t_ctx;
SELECT pg_temp.falla('b: plain user refused',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', ficha_id, 'ic-a@example.test'),
  'sin_autoridad') FROM t_ctx;

SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('b: admin invites ficha without email',
  public.invitacion_cuenta_crear(ficha_id, '  IC-A@Example.TEST ') ->> 'email' = 'ic-a@example.test')
FROM t_ctx;
SELECT pg_temp.falla('b: ficha with account refused',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', conectada_id, 'ic-z@example.test'),
  'ya_tiene_cuenta') FROM t_ctx;
SELECT pg_temp.falla('b: malformed email refused',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', ficha2_id, 'no-es-correo'),
  'email_invalido') FROM t_ctx;
SELECT pg_temp.falla('b: different email needs confirmation',
  format('SELECT public.invitacion_cuenta_crear(%L, %L)', ficha2_id, 'ic-b@example.test'),
  'email_distinto') FROM t_ctx;
SELECT pg_temp.falla('b: email of another ficha',
  format('SELECT public.invitacion_cuenta_crear(%L, %L, true)', ficha2_id, 'ic-a@example.test'),
  'email_en_uso') FROM t_ctx;
SELECT pg_temp.falla('b: email of a foreign auth account',
  format('SELECT public.invitacion_cuenta_crear(%L, %L, true)', ficha2_id,
         'ic-test-' || ajena_auth || '@example.test'),
  'email_en_uso') FROM t_ctx;
SELECT pg_temp.ok('b: replacing the email with confirmation',
  public.invitacion_cuenta_crear(ficha2_id, 'ic-b@example.test', true) ->> 'email' = 'ic-b@example.test')
FROM t_ctx;

-- c. Service-role-only functions.
SELECT pg_temp.falla('c: registrar_envio refused to authenticated',
  format('SELECT public.invitacion_cuenta_registrar_envio(%L, %L)', ficha_id, nueva_auth), '42501')
FROM t_ctx;
SELECT pg_temp.falla('c: vincular refused to authenticated',
  format('SELECT public.invitacion_cuenta_vincular(%L, %L)', nueva_auth, 'ic-a@example.test'), '42501')
FROM t_ctx;

-- f. State for an admin and for a plain user.
SELECT pg_temp.ok('f: admin sees the open invitation',
  public.invitacion_cuenta_estado(ficha_id) #>> '{invitacion,estado}' = 'enviada'
  AND (public.invitacion_cuenta_estado(ficha_id) ->> 'sin_cuenta')::boolean) FROM t_ctx;
SELECT pg_temp.ok('f: admin lists the fichas without account',
  ARRAY(SELECT public.invitacion_cuenta_sin_cuenta(ARRAY[ficha_id, conectada_id])) = ARRAY[ficha_id])
FROM t_ctx;
SELECT pg_temp.como(plano_auth) FROM t_ctx;
SELECT pg_temp.ok('f: plain user sees nothing',
  public.invitacion_cuenta_estado(ficha_id) IS NULL
  AND NOT EXISTS (SELECT public.invitacion_cuenta_sin_cuenta(ARRAY[ficha_id]))) FROM t_ctx;

RESET ROLE;

SELECT pg_temp.ok('b: ficha email saved lowercase',
  (SELECT email FROM public.usuarios WHERE id = c.ficha_id) = 'ic-a@example.test') FROM t_ctx c;
SELECT pg_temp.ok('b: ficha2 email replaced',
  (SELECT email FROM public.usuarios WHERE id = c.ficha2_id) = 'ic-b@example.test') FROM t_ctx c;

-- Record the auth account of the first invitation (as the app does), then re-invite.
SELECT public.invitacion_cuenta_registrar_envio(ic.id, c.nueva_auth)
  FROM t_ctx c JOIN public.invitaciones_cuenta ic ON ic.usuario_id = c.ficha_id AND ic.estado = 'enviada';
UPDATE auth.users SET email = 'ic-a@example.test' FROM t_ctx c WHERE auth.users.id = c.nueva_auth;

SET LOCAL ROLE authenticated;
SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('b: re-invite returns the previous account (its own auth user is not a conflict)',
  (public.invitacion_cuenta_crear(ficha_id, 'ic-a@example.test') ->> 'auth_user_id_previo')::uuid = nueva_auth)
FROM t_ctx;
RESET ROLE;

SELECT pg_temp.ok('b: one open invitation per ficha',
  (SELECT count(*) FROM public.invitaciones_cuenta WHERE usuario_id = c.ficha_id AND estado = 'enviada') = 1
  AND (SELECT count(*) FROM public.invitaciones_cuenta WHERE usuario_id = c.ficha_id AND estado = 'cancelada') = 1)
FROM t_ctx c;

-- e. Linker guard.
SELECT pg_temp.ok('e: open account invitation counts',
  public.ficha_tiene_invitacion_abierta(ficha_id)) FROM t_ctx;

-- d. Linking.
SELECT public.invitacion_cuenta_registrar_envio(ic.id, c.nueva_auth)
  FROM t_ctx c JOIN public.invitaciones_cuenta ic ON ic.usuario_id = c.ficha_id AND ic.estado = 'enviada';
SELECT pg_temp.ok('d: mismatched email rechazada',
  public.invitacion_cuenta_vincular(nueva_auth, 'otro@example.test') = 'rechazada') FROM t_ctx;
SELECT pg_temp.ok('d: mismatched email links nothing',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha_id) IS NULL) FROM t_ctx c;
SELECT pg_temp.ok('d: account without invitation',
  public.invitacion_cuenta_vincular(otra_auth, 'ic-a@example.test') = 'sin_invitacion') FROM t_ctx;
SELECT pg_temp.ok('d: right account links',
  public.invitacion_cuenta_vincular(nueva_auth, 'IC-A@example.test') = 'vinculada') FROM t_ctx;
SELECT pg_temp.ok('d: exactly that ficha is linked and the invitation aceptada',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha_id) = c.nueva_auth
  AND (SELECT count(*) FROM public.usuarios WHERE auth_id = c.nueva_auth) = 1
  AND (SELECT estado FROM public.invitaciones_cuenta
        WHERE usuario_id = c.ficha_id ORDER BY created_at DESC, estado LIMIT 1) = 'aceptada'
  AND NOT public.ficha_tiene_invitacion_abierta(c.ficha_id))
FROM t_ctx c;

-- d. A ficha that got an account by another path stays untouched.
SELECT public.invitacion_cuenta_registrar_envio(ic.id, c.otra_auth)
  FROM t_ctx c JOIN public.invitaciones_cuenta ic ON ic.usuario_id = c.ficha2_id AND ic.estado = 'enviada';
-- Move ajena_auth from conectada to ficha2 (auth_id is unique).
UPDATE public.usuarios SET auth_id = NULL FROM t_ctx c WHERE usuarios.id = c.conectada_id;
UPDATE public.usuarios SET auth_id = c.ajena_auth FROM t_ctx c WHERE usuarios.id = c.ficha2_id;
SELECT pg_temp.ok('d: already-linked ficha rechazada',
  public.invitacion_cuenta_vincular(otra_auth, 'ic-b@example.test') = 'rechazada') FROM t_ctx;
SELECT pg_temp.ok('d: already-linked ficha keeps its account',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha2_id) = c.ajena_auth) FROM t_ctx c;

SELECT caso, detalle FROM t_res WHERE NOT ok
UNION ALL
SELECT 'total cases', count(*)::text FROM t_res;

ROLLBACK;
