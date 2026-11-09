-- T2k (odd/tasks/ninos-checkin-pco.md, S9.9 "Invitación automática + botón en
-- la mesa") — the account comes later and nothing is lost
-- (20261108190000_ninos_cuenta_despues.sql).
--
-- Covers:
--   a. Confirming a QR pre-registration stores the email the family gave on
--      the NEW parent (email_guardado true); an email of another ficha or of
--      an account of no ficha is skipped (email_guardado false) and nobody's
--      email changes; without email nothing is reported; an existing parent
--      chosen by id keeps their email.
--   b. Who may invite (ninos_familia_cuenta_invitar), at any later visit:
--      the anfitrión and the coordinator of the family's campus, also another
--      anfitrión than the one who registered it and after the hour; refused
--      for the anfitrión of another campus, a random user, an adult who is
--      not the parent of a Niños child, and anon.
--   c. Same safety checks as before: invalid email, a different email than
--      the ficha's, an email of someone else, a ficha with an account.
--   d. Cooldown: a second invitation of the same ficha within 10 minutes of
--      one whose link was created is refused (invitacion_reciente); after 10
--      minutes, or when the link was never created, it goes through.
--   e. ninos_familia_cuenta: «Sin cuenta», the ficha's email and the last
--      invitation for the same scope; refused outside it.
--   f. Grants: the helpers are internal; the RPCs for authenticated only;
--      definers with an empty search_path.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION W, 2 RANDOM, 3 ANFITRION U
-- (other campus), 4 account of no ficha, 5 second ANFITRION W, 6 COORD W,
-- 7 adult of campus W with no children, 8 parent with an account.
-- Tree: R → W → Anfitriones; R → U → Anfitriones. Salones S1 (W, the
-- fixture campus), S2 (U, a campus of its own).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cd_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_cd_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cd_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '')
                                   || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected permission denied, got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE 'permission denied%' THEN
      PERFORM pg_temp.fail(p_case, 'expected permission denied, got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('c0580000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c801' WHEN 'us' THEN 'c802' WHEN 'eq' THEN 'c804'
                       WHEN 'ro' THEN 'c805' WHEN 'sa' THEN 'c806' WHEN 'pr' THEN 'c807' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_cd_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.p(p_n int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('p' || p_n)::uuid;
$$;

-- A family as the desk confirms it; the parent's email only when given.
CREATE OR REPLACE FUNCTION pg_temp.familia(p_n int, p_email text DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('nombre', 'ZZ Cd Mamá ' || p_n, 'apellido', 'Prueba',
                                'telefono', '0414-555-58' || lpad(p_n::text, 2, '0'), 'genero', 'Femenino')
             || CASE WHEN p_email IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('email', p_email) END,
    'hijos', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Cd Hijo ' || p_n, 'apellido', 'Prueba',
                                'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1)),
    'autorizados', '[]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION pg_temp.invitar(p_n int, p_email text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.ninos_familia_cuenta_invitar(pg_temp.p(p_n), p_email) ->> 'email';
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_cd_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
INSERT INTO public.campus (id, nombre, codigo) VALUES ('c0580000-0000-4000-c808-000000000002', 'ZZ Cd Campus 2', 'ZZCD2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cd-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;
-- Every identity has a ficha, except 4 (an account of no ficha).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cd', 'U' || n, 'cd-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 8) AS n WHERE n <> 4;
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 7), pg_temp.ctx('campus')::uuid, true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Cd R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cd W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Cd U', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 4), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 5), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 5), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 3), pg_temp.id('eq', 5), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 8) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 6), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Cd S1', 20, 1, 1, -100),
  (pg_temp.id('sa', 2), 'c0580000-0000-4000-c808-000000000002', pg_temp.id('eq', 4), 'upstreet', 'ZZ Cd S2', 20, 1, 1, -99);

-- Pending QR pre-registrations of the fixture campus (as the public form stores them).
INSERT INTO public.ninos_preregistros (id, campus_id, payload)
SELECT pg_temp.id('pr', n), pg_temp.ctx('campus')::uuid, pg_temp.familia(n)
  FROM generate_series(1, 5) n;

-- E: an existing parent with an email, chosen by id at the desk.
INSERT INTO public.usuarios (id, nombre, apellido, email, telefono, estado_civil, genero)
VALUES (pg_temp.id('us', 20), 'ZZ Cd Existe', 'Prueba', 'zz-cd-existe@example.test', '04145550020', 'No especificado', 'Femenino');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 20), pg_temp.ctx('campus')::uuid, true);

GRANT INSERT, SELECT, UPDATE ON t_cd_failures, t_cd_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.p(int), pg_temp.familia(int, text), pg_temp.invitar(int, text)
  TO authenticated, anon;

-- ── a. the QR email on confirmation ──────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_cd_ctx (k, v)
SELECT 'r' || n, public.ninos_preregistro_resolver(pg_temp.id('pr', n), 'confirmar',
         pg_temp.familia(n, CASE n WHEN 1 THEN ' ZZ-Cd-Mama1@Example.test ' WHEN 2 THEN 'cd-2@example.test'
                                   WHEN 3 THEN 'cd-4@example.test' END))::text
  FROM generate_series(1, 4) n;
INSERT INTO t_cd_ctx (k, v)
SELECT 'p' || n, pg_temp.ctx('r' || n)::jsonb ->> 'padre_id' FROM generate_series(1, 4) n;
INSERT INTO t_cd_ctx (k, v)
SELECT 'r5', public.ninos_preregistro_resolver(pg_temp.id('pr', 5), 'confirmar',
         jsonb_set(pg_temp.familia(5), '{padre}',
                   jsonb_build_object('id', pg_temp.id('us', 20), 'email', 'zz-cd-otro@example.test')))::text;
RESET ROLE;

SELECT pg_temp.assert_eq('a: the email the family gave is stored on the new parent, normalized',
  $q$SELECT (pg_temp.ctx('r1')::jsonb ->> 'email_guardado') || ':'
         || (SELECT email FROM public.usuarios WHERE id = pg_temp.p(1))$q$,
  'true:zz-cd-mama1@example.test');
SELECT pg_temp.assert_eq('a: an email of another ficha is skipped; neither ficha changes',
  $q$SELECT (pg_temp.ctx('r2')::jsonb ->> 'email_guardado') || ':'
         || coalesce((SELECT email FROM public.usuarios WHERE id = pg_temp.p(2)), 'null') || ':'
         || (SELECT email FROM public.usuarios WHERE id = pg_temp.id('us', 2))$q$,
  'false:null:cd-2@example.test');
SELECT pg_temp.assert_eq('a: an email of an account of no ficha is skipped',
  $q$SELECT (pg_temp.ctx('r3')::jsonb ->> 'email_guardado') || ':'
         || coalesce((SELECT email FROM public.usuarios WHERE id = pg_temp.p(3)), 'null')$q$,
  'false:null');
SELECT pg_temp.assert_eq('a: without email nothing is stored nor reported',
  $q$SELECT (pg_temp.ctx('r4')::jsonb ? 'email_guardado')::text || ':'
         || coalesce((SELECT email FROM public.usuarios WHERE id = pg_temp.p(4)), 'null')$q$,
  'false:null');
SELECT pg_temp.assert_eq('a: an existing parent chosen by id keeps their email',
  $q$SELECT (pg_temp.ctx('r5')::jsonb ? 'email_guardado')::text || ':'
         || (SELECT email FROM public.usuarios WHERE id = pg_temp.id('us', 20))$q$,
  'false:zz-cd-existe@example.test');
SELECT pg_temp.assert_eq('a: the confirmation is recorded as before',
  $q$SELECT string_agg(estado || ':' || (familia_padre_id IS NOT NULL)::text, ',' ORDER BY id)
       FROM public.ninos_preregistros WHERE id IN (SELECT pg_temp.id('pr', n) FROM generate_series(1, 5) n)$q$,
  'confirmado:true,confirmado:true,confirmado:true,confirmado:true,confirmado:true');

-- The automatic invitation right after confirming keeps working with the stored email.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the confirming operator invites with the stored email',
  $q$SELECT public.ninos_preregistro_invitar(pg_temp.id('pr', 1), 'zz-cd-mama1@example.test') ->> 'email'$q$,
  'zz-cd-mama1@example.test');
RESET ROLE;

-- ── b. who may invite, at any later visit ────────────────────────────

-- A family registered at the desk two hours ago by anfitrión 1.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_cd_ctx (k, v)
SELECT 'p6', public.ninos_registrar_familia_mesa(pg_temp.familia(6)) ->> 'padre_id';
RESET ROLE;
UPDATE public.ninos_altas_mesa SET registrado_at = now() - interval '2 hours' WHERE padre_id = pg_temp.p(6);
UPDATE public.ninos_preregistros SET confirmado_at = now() - interval '2 hours' WHERE id = pg_temp.id('pr', 4);
-- 8: a parent with an account: second parent of P6's child.
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
SELECT (SELECT r.usuario1_id FROM public.relaciones_usuarios r WHERE r.usuario2_id = pg_temp.p(6) LIMIT 1),
       pg_temp.id('us', 8), 'padre';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('b: the anfitrión of another campus cannot invite',
  $q$SELECT pg_temp.invitar(6, 'zz-cd-mama6@example.test')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: a random user cannot invite',
  $q$SELECT pg_temp.invitar(6, 'zz-cd-mama6@example.test')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: an adult who is not the parent of a Niños child cannot be invited',
  $q$SELECT public.ninos_familia_cuenta_invitar(pg_temp.id('us', 7), 'zz-cd-adulto@example.test')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: an unknown person is refused like one out of scope',
  $q$SELECT public.ninos_familia_cuenta_invitar(gen_random_uuid(), 'zz-cd-nadie@example.test')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('b: the anfitrión who registered it invites after the hour',
  $q$SELECT pg_temp.invitar(6, ' ZZ-Cd-Mama6@example.test ')$q$, 'zz-cd-mama6@example.test');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b: another anfitrión of the campus invites a confirmed pre-registration later',
  $q$SELECT pg_temp.invitar(4, 'zz-cd-mama4@example.test')$q$, 'zz-cd-mama4@example.test');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('b: the coordinator of the campus invites too',
  $q$SELECT pg_temp.invitar(3, 'zz-cd-mama3@example.test')$q$, 'zz-cd-mama3@example.test');
RESET ROLE;

SELECT pg_temp.assert_eq('b: the email is stored on the ficha and the invitation is open, by its operator',
  $q$SELECT string_agg(u.email || ':' || ic.estado || ':' || (ic.invitado_por = pg_temp.id('us', x.op))::text, ',' ORDER BY x.n)
       FROM (VALUES (6, 1), (4, 5), (3, 6)) x(n, op)
       JOIN public.usuarios u ON u.id = pg_temp.p(x.n)
       JOIN public.invitaciones_cuenta ic ON ic.usuario_id = u.id AND ic.estado = 'enviada'$q$,
  'zz-cd-mama3@example.test:enviada:true,zz-cd-mama4@example.test:enviada:true,zz-cd-mama6@example.test:enviada:true');

-- ── c. same safety checks ────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('c: an invalid email is refused',
  $q$SELECT pg_temp.invitar(2, 'no-es-correo')$q$, '22023', 'email_invalido');
SELECT pg_temp.assert_raises('c: another email than the ficha''s is refused',
  $q$SELECT pg_temp.invitar(1, 'zz-cd-otra@example.test')$q$, '22023', 'email_distinto');
SELECT pg_temp.assert_raises('c: the email of another person is refused',
  $q$SELECT pg_temp.invitar(2, 'cd-2@example.test')$q$, '23505', 'email_en_uso');
SELECT pg_temp.assert_raises('c: the email of an account of no ficha is refused',
  $q$SELECT pg_temp.invitar(2, 'cd-4@example.test')$q$, '23505', 'email_en_uso');
SELECT pg_temp.assert_raises('c: a parent who already has an account is refused',
  $q$SELECT public.ninos_familia_cuenta_invitar(pg_temp.id('us', 8), 'cd-8@example.test')$q$, '22023', 'ya_tiene_cuenta');
RESET ROLE;

-- ── d. cooldown per family ───────────────────────────────────────────

-- The link of P6's invitation was created (invitacion_cuenta_registrar_envio).
UPDATE public.invitaciones_cuenta SET auth_user_id = gen_random_uuid()
 WHERE usuario_id = pg_temp.p(6) AND estado = 'enviada';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('d: a second invitation within 10 minutes is refused',
  $q$SELECT pg_temp.invitar(6, 'zz-cd-mama6@example.test')$q$, '22023', 'invitacion_reciente');
SELECT pg_temp.assert_eq('d: an invitation whose link was never created can be retried at once',
  $q$SELECT pg_temp.invitar(4, 'zz-cd-mama4@example.test')$q$, 'zz-cd-mama4@example.test');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the refusal wrote nothing',
  $q$SELECT count(*)::text FROM public.invitaciones_cuenta WHERE usuario_id = pg_temp.p(6)$q$, '1');
UPDATE public.invitaciones_cuenta SET created_at = now() - interval '11 minutes' WHERE usuario_id = pg_temp.p(6);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('d: after 10 minutes it can be resent',
  $q$SELECT pg_temp.invitar(6, 'zz-cd-mama6@example.test')$q$, 'zz-cd-mama6@example.test');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the resend cancels the previous invitation',
  $q$SELECT string_agg(estado, ',' ORDER BY estado) FROM public.invitaciones_cuenta WHERE usuario_id = pg_temp.p(6)$q$,
  'cancelada,enviada');

-- ── e. the account state at the desk ─────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: without account: «Sin cuenta», the ficha''s email and the last invitation',
  $q$SELECT concat_ws(':', c ->> 'sin_cuenta', c ->> 'email_ficha', c -> 'invitacion' ->> 'estado', c -> 'invitacion' ->> 'email')
       FROM public.ninos_familia_cuenta(pg_temp.p(6)) c$q$,
  'true:zz-cd-mama6@example.test:enviada:zz-cd-mama6@example.test');
SELECT pg_temp.assert_eq('e: never invited and without email',
  $q$SELECT concat_ws(':', c ->> 'sin_cuenta', coalesce(c ->> 'email_ficha', 'null'), coalesce(c ->> 'invitacion', 'null'))
       FROM public.ninos_familia_cuenta(pg_temp.p(2)) c$q$,
  'true:null:null');
SELECT pg_temp.assert_eq('e: a parent with an account',
  $q$SELECT public.ninos_familia_cuenta(pg_temp.id('us', 8)) ->> 'sin_cuenta'$q$, 'false');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: the anfitrión of another campus cannot read it',
  $q$SELECT public.ninos_familia_cuenta(pg_temp.p(6))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot read it',
  $q$SELECT public.ninos_familia_cuenta(pg_temp.p(6))$q$, '42501', 'sin_autoridad');
RESET ROLE;

-- ── f. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: execute privileges (authenticated, anon, public)',
  $q$SELECT string_agg(f || ':' || has_function_privilege('authenticated', f, 'EXECUTE')::text
                          || has_function_privilege('anon', f, 'EXECUTE')::text
                          || EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                      WHERE p.oid = f::regprocedure AND a.grantee = 0)::text,
                       ',' ORDER BY f COLLATE "C")
       FROM unnest(ARRAY['public.ninos_familia_cuenta(uuid)',
                         'public.ninos_familia_cuenta_invitar(uuid, text)',
                         'public.ninos_familia_puede_invitar(uuid)',
                         'public.ninos_guardar_email_padre(uuid, text)',
                         'public.ninos_preregistro_resolver(uuid, text, jsonb)']) f$q$,
  'public.ninos_familia_cuenta(uuid):truefalsefalse,'
  || 'public.ninos_familia_cuenta_invitar(uuid, text):truefalsefalse,'
  || 'public.ninos_familia_puede_invitar(uuid):falsefalsefalse,'
  || 'public.ninos_guardar_email_padre(uuid, text):falsefalsefalse,'
  || 'public.ninos_preregistro_resolver(uuid, text, jsonb):truefalsefalse');
SELECT pg_temp.assert_eq('f: the definers keep an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ',' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_familia_cuenta', 'ninos_familia_cuenta_invitar', 'ninos_familia_puede_invitar',
                          'ninos_guardar_email_padre', 'ninos_preregistro_resolver')$q$,
  'ninos_familia_cuenta:true:search_path="",ninos_familia_cuenta_invitar:true:search_path="",'
  || 'ninos_familia_puede_invitar:true:search_path="",ninos_guardar_email_padre:true:search_path="",'
  || 'ninos_preregistro_resolver:true:search_path=""');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('f: authenticated cannot call the email helper',
  $q$SELECT public.ninos_guardar_email_padre(pg_temp.p(2), 'zz-cd-x@example.test')$q$);
SELECT pg_temp.assert_denied('f: nor the permission helper',
  $q$SELECT public.ninos_familia_puede_invitar(pg_temp.p(2))$q$);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('f: anon cannot invite',
  $q$SELECT public.ninos_familia_cuenta_invitar(gen_random_uuid(), 'x@example.test')$q$);
SELECT pg_temp.assert_denied('f: anon cannot read the account state',
  $q$SELECT public.ninos_familia_cuenta(gen_random_uuid())$q$);
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cd_failures;

ROLLBACK;
