-- T11 (odd/tasks/ninos-voluntarios-waumba.md) — the volunteer coordinator
-- fixes a person's ficha (20261008100000_dream_team_editar_ficha.sql).
--
-- Covers:
--   a. The coordinator of Atención al Voluntario edits a volunteer of their
--      area (S, under the parent N); the answer is the updated ficha.
--   b. Partial update: only the keys sent change.
--   c. Refused (42501): a person outside the subtree (E), a person whose only
--      servicio is retirado, a plain volunteer, the area director
--      (dream_team.direct; same rule as registering), anon.
--   d. An admin may edit.
--   e. A cedula another person holds (also written differently) is refused
--      (23505 cedula_duplicada); the person's own cedula is accepted.
--   f. Validation (22023): a future birth date, one before 1900, an unknown
--      genero, a key that is not editable (email).
--   g. dream_team_ficha_persona answers the same people, refuses the rest.
--   h. The email (20261106100000, odd/tasks/dream-team-pendientes-director.md,
--      S3): whoever may edit the ficha changes the email of a person WITHOUT
--      an account; for a person WITH an account only an admin (role admin;
--      pastor is not enough): anyone else gets 42501 email_solo_admin and
--      nothing changes. A bad format (22023 email_invalido) and an email of
--      another ficha or another auth account (23505 email_en_uso) are refused
--      and change nothing. dream_team_ficha_persona answers email,
--      tiene_cuenta and puede_editar_email.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (Coordinador in AV, active);
-- 2 VOL (plain voluntario serving in S, dream_team.serve on S); 3 TARGET
-- (postulado in S, gaps in the ficha); 4 OUTSIDER (activo in E); 5 ADMIN;
-- 6 HOLDER of cedula 12345678; 7 RETIRED (retirado in S); 8 DIR
-- (dream_team.direct on N); 9 SIN CUENTA (usuario without auth account,
-- activo in S); 10 PASTOR; auth 11 is an account without ficha.
-- The area director reaches 3 and 9 (20261105100000).
-- Tree: R → N → S; N → AV ("Atención al Voluntario"); R → E.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ef_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ef_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || coalesce(' ' || p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9100000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9101' WHEN 'us' THEN '9102'
                       WHEN 'eq' THEN '9104' WHEN 'ro' THEN '9105' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ef-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 11) AS n
 WHERE n <> 9;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ef', 'U' || n, 'ef-' || n || '@example.test', 'No especificado', 'Otro'
  FROM generate_series(1, 10) AS n
 WHERE n <> 9;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 9), NULL, 'ZZ Ef', 'U9', 'ef-9@example.test', 'No especificado', 'Otro');
UPDATE public.usuarios SET cedula = '12345678' WHERE id = pg_temp.id('us', 6);
UPDATE public.usuarios SET telefono = '04141234567', redes_sociales = '@zz_ef_3' WHERE id = pg_temp.id('us', 3);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 5), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 10), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'pastor';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Ef R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ef N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Ef S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Ef E', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 2), 'Atención al Voluntario', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 5), 'Coordinador', true);

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 5), pg_temp.id('ro', 3), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 3), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'postulado', now(), 'admin_asignacion'),
  (pg_temp.id('us', 4), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 9), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual) VALUES
  (pg_temp.id('us', 7), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'retirado', now() - interval '1 day', now(), 'admin_asignacion');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 8), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

GRANT INSERT, SELECT ON t_ef_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a/b. the coordinator edits a volunteer of the area, partially ────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the coordinator edits a volunteer in scope',
  $q$SELECT concat_ws('|', f->>'fecha_nacimiento', f->>'cedula', f->>'estado_civil', f->>'genero')
       FROM public.dream_team_editar_ficha(pg_temp.id('us', 3),
         '{"fecha_nacimiento":"1990-05-17","cedula":"V-20.111.222","estado_civil":"Casado","genero":"Femenino"}') f$q$,
  '1990-05-17|20111222|Casado|Femenino');
SELECT pg_temp.assert_eq('b: the keys not sent keep their value',
  $q$SELECT concat_ws('|', f->>'telefono', f->>'redes_sociales', f->>'cedula')
       FROM public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"fecha_nacimiento":"1991-01-02"}') f$q$,
  '04141234567|@zz_ef_3|20111222');
SELECT pg_temp.assert_eq('b: a null clears the birth date only',
  $q$SELECT concat_ws('|', coalesce(f->>'fecha_nacimiento', 'null'), f->>'estado_civil')
       FROM public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"fecha_nacimiento":null}') f$q$,
  'null|Casado');
SELECT pg_temp.assert_eq('g: the coordinator reads the ficha',
  $q$SELECT f->>'cedula' FROM public.dream_team_ficha_persona(pg_temp.id('us', 3)) f$q$, '20111222');

-- ── c. refused ───────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('c: a person outside the subtree is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"genero":"Femenino"}')$q$, '42501');
SELECT pg_temp.assert_raises('c: a person whose servicio is retirado is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 7), '{"genero":"Femenino"}')$q$, '42501');
SELECT pg_temp.assert_raises('g: the ficha of an outsider is refused',
  $q$SELECT public.dream_team_ficha_persona(pg_temp.id('us', 4))$q$, '42501');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: a plain volunteer is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"genero":"Masculino"}')$q$, '42501');
SELECT pg_temp.as_persona(8);
-- Since 20261105100000 the area director reaches the people of their subtree.
SELECT pg_temp.assert_eq('c: the area director edits a person they reach (20261105100000)',
  $q$SELECT f->>'telefono' FROM public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"telefono":"04141234567"}') f$q$,
  '04141234567');

-- ── d. admin ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('d: an admin edits',
  $q$SELECT f->>'telefono' FROM public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"telefono":"04241112233"}') f$q$,
  '04241112233');

-- ── e. cedula ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e: a cedula another person holds is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"cedula":"V-12.345.678"}')$q$, '23505', 'cedula_duplicada');
SELECT pg_temp.assert_eq('e: the person''s own cedula is accepted',
  $q$SELECT f->>'cedula' FROM public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"cedula":"20111222"}') f$q$,
  '20111222');

-- ── f. validation ────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('f: a future birth date is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3),
       jsonb_build_object('fecha_nacimiento', (current_date + 1)::text))$q$, '22023', 'fecha_nacimiento_invalida');
SELECT pg_temp.assert_raises('f: a birth date before 1900 is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"fecha_nacimiento":"1899-12-31"}')$q$,
  '22023', 'fecha_nacimiento_invalida');
SELECT pg_temp.assert_raises('f: an impossible date is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"fecha_nacimiento":"2001-02-30"}')$q$,
  '22023', 'fecha_nacimiento_invalida');
SELECT pg_temp.assert_raises('f: an unknown genero is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"genero":"X"}')$q$, '22023', 'genero_invalido');
SELECT pg_temp.assert_raises('f: a key that is not editable is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"nombre":"Otro"}')$q$,
  '22023', 'campo_no_editable');

-- ── h. email (S3) ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('h: the director reads email, no account, may edit it',
  $q$SELECT concat_ws('|', f->>'email', f->>'tiene_cuenta', f->>'puede_editar_email')
       FROM public.dream_team_ficha_persona(pg_temp.id('us', 9)) f$q$,
  'ef-9@example.test|false|true');
SELECT pg_temp.assert_eq('h: the director reads that a person with account has a locked email',
  $q$SELECT concat_ws('|', f->>'email', f->>'tiene_cuenta', f->>'puede_editar_email')
       FROM public.dream_team_ficha_persona(pg_temp.id('us', 3)) f$q$,
  'ef-3@example.test|true|false');
SELECT pg_temp.assert_eq('h: the director edits the email of a person without account (trimmed, lowercase)',
  $q$SELECT concat_ws('|', f->>'email', f->>'telefono', f->>'genero')
       FROM public.dream_team_editar_ficha(pg_temp.id('us', 9),
         '{"email":"  Nueva.9@Example.TEST ","telefono":"04140000009"}') f$q$,
  'nueva.9@example.test|04140000009|Otro');
SELECT pg_temp.assert_raises('h: the director cannot change the email of a person with account',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"email":"otro-3@example.test","telefono":"04249999999"}')$q$,
  '42501', 'email_solo_admin');
SELECT pg_temp.assert_eq('h: the same email (other case) of a person with account is not a change',
  $q$SELECT f->>'email' FROM public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"email":"EF-3@example.test"}') f$q$,
  'ef-3@example.test');
SELECT pg_temp.assert_raises('h: a bad email format is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 9), '{"email":"sin-arroba","telefono":"04241111111"}')$q$,
  '22023', 'email_invalido');
SELECT pg_temp.assert_raises('h: an email with spaces inside is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 9), '{"email":"a b@example.test"}')$q$,
  '22023', 'email_invalido');
SELECT pg_temp.assert_raises('h: an email over 254 characters is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 9),
       jsonb_build_object('email', repeat('a', 250) || '@x.io'))$q$,
  '22023', 'email_invalido');
SELECT pg_temp.assert_raises('h: the email of another ficha is refused (any case)',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 9), '{"email":"EF-6@example.test"}')$q$,
  '23505', 'email_en_uso');
SELECT pg_temp.assert_raises('h: the email of an auth account without this ficha is refused',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 9), '{"email":"ef-11@example.test"}')$q$,
  '23505', 'email_en_uso');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('h: the volunteer coordinator cannot change the email of a person with account',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"email":"otro-3@example.test"}')$q$,
  '42501', 'email_solo_admin');

SELECT pg_temp.as_persona(10);
SELECT pg_temp.assert_eq('h: a pastor reads the email of a person with account as locked',
  $q$SELECT f->>'puede_editar_email' FROM public.dream_team_ficha_persona(pg_temp.id('us', 4)) f$q$, 'false');
SELECT pg_temp.assert_raises('h: a pastor cannot change the email of a person with account',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"email":"otro-4@example.test"}')$q$,
  '42501', 'email_solo_admin');

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('h: an admin may edit the email of a person with account',
  $q$SELECT f->>'puede_editar_email' FROM public.dream_team_ficha_persona(pg_temp.id('us', 4)) f$q$, 'true');
SELECT pg_temp.assert_eq('h: an admin changes the email of a person with account',
  $q$SELECT f->>'email' FROM public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"email":"Nuevo-4@example.test"}') f$q$,
  'nuevo-4@example.test');
SELECT pg_temp.assert_raises('h: an admin cannot leave a person with account without email',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"email":"  "}')$q$,
  '22023', 'email_invalido');
SELECT pg_temp.assert_raises('h: an admin cannot take the email of another ficha either',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 4), '{"email":"ef-6@example.test"}')$q$,
  '23505', 'email_en_uso');

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('h: the director clears the email of a person without account',
  $q$SELECT coalesce(f->>'email', 'null') FROM public.dream_team_editar_ficha(pg_temp.id('us', 9), '{"email":null}') f$q$,
  'null');

RESET ROLE;

SELECT pg_temp.assert_eq('h: the refused email changes left every field as it was',
  $q$SELECT concat_ws('|', u3.email, u3.telefono, coalesce(u9.email, 'null'), u9.telefono, u4.email, u6.email)
       FROM public.usuarios u3, public.usuarios u9, public.usuarios u4, public.usuarios u6
      WHERE u3.id = pg_temp.id('us', 3) AND u9.id = pg_temp.id('us', 9)
        AND u4.id = pg_temp.id('us', 4) AND u6.id = pg_temp.id('us', 6)$q$,
  'ef-3@example.test|04141234567|null|04140000009|nuevo-4@example.test|ef-6@example.test');
SELECT pg_temp.assert_eq('h: no auth account email changed',
  $q$SELECT string_agg(email, ',' ORDER BY email) FROM auth.users
      WHERE id IN (pg_temp.id('au', 3), pg_temp.id('au', 4))$q$,
  'ef-3@example.test,ef-4@example.test');

SELECT pg_temp.assert_eq('b: the stored row matches (no other field touched)',
  $q$SELECT concat_ws('|', nombre, email, telefono, coalesce(fecha_nacimiento::text, 'null'))
       FROM public.usuarios WHERE id = pg_temp.id('us', 3)$q$,
  'ZZ Ef|ef-3@example.test|04141234567|null');

-- ── c. anon ──────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: anon cannot execute the functions',
  $q$SELECT concat_ws('|',
       has_function_privilege('anon', 'public.dream_team_editar_ficha(uuid, jsonb)', 'EXECUTE'),
       has_function_privilege('anon', 'public.dream_team_ficha_persona(uuid)', 'EXECUTE'),
       has_function_privilege('anon', 'public.dream_team_puede_editar_ficha(uuid)', 'EXECUTE'))$q$,
  'f|f|f');
SELECT pg_temp.assert_eq('h: the admin helper is internal (no EXECUTE for anon or authenticated)',
  $q$SELECT concat_ws('|',
       has_function_privilege('anon', 'public.dream_team_ficha_actor_es_admin()', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.dream_team_ficha_actor_es_admin()', 'EXECUTE'))$q$,
  'f|f');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ef_failures;

ROLLBACK;
