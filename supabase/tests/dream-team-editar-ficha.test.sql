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
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (Coordinador in AV, active);
-- 2 VOL (plain voluntario serving in S, dream_team.serve on S); 3 TARGET
-- (postulado in S, gaps in the ficha); 4 OUTSIDER (activo in E); 5 ADMIN;
-- 6 HOLDER of cedula 12345678; 7 RETIRED (retirado in S); 8 DIR
-- (dream_team.direct on N).
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
  FROM generate_series(1, 8) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ef', 'U' || n, 'ef-' || n || '@example.test', 'No especificado', 'Otro'
  FROM generate_series(1, 8) AS n;
UPDATE public.usuarios SET cedula = '12345678' WHERE id = pg_temp.id('us', 6);
UPDATE public.usuarios SET telefono = '04141234567', redes_sociales = '@zz_ef_3' WHERE id = pg_temp.id('us', 3);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 5), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

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
  (pg_temp.id('us', 4), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
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
SELECT pg_temp.assert_raises('c: the area director is refused (same rule as registering)',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"genero":"Masculino"}')$q$, '42501');

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
SELECT pg_temp.assert_raises('f: email is not editable',
  $q$SELECT public.dream_team_editar_ficha(pg_temp.id('us', 3), '{"email":"x@example.test"}')$q$,
  '22023', 'campo_no_editable');

RESET ROLE;

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

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ef_failures;

ROLLBACK;
