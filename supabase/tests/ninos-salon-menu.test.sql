-- N5/N6 (odd/tasks/ninos-checkin.md) — room list, check-out lookup, menu
-- flags and the Caracas date (20261008144000_ninos_salon_menu.sql).
--
-- Covers:
--   a. ninos_hoy() is today's date in America/Caracas.
--   b. Menu flags: the anfitrión operates and sees rooms; the Líderes
--      volunteer sees rooms but does not operate; a random user has neither.
--   c. ninos_lista_salon returns the grade; the líder reads it too.
--   d. ninos_buscar_codigo returns the children carrying the code with their
--      pickup people; a wrong code returns nothing; the líder is refused.
--   e. After ninos_checkout the lookup shows salida_at and who picked up,
--      and the room list is empty.
--   f. anon cannot execute the new RPCs.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 LIDER, 3 RANDOM; 5, 6 children.
-- Tree: R → W → A ("Anfitriones"), W → L ("Líderes"). Room S1 in W.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ns_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ns_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ns_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9500000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9501' WHEN 'us' THEN '9502' WHEN 'eq' THEN '9504'
                       WHEN 'ro' THEN '9505' WHEN 'sa' THEN '9506' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ns_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ns_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
INSERT INTO t_ns_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ns-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ns', 'U' || n, 'ns-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Nino', 'N' || n, 'No especificado', 'Otro', DATE '2023-01-01'
  FROM generate_series(5, 6) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Ns R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ns W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 2), 'Líderes', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 2), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Ns S1', 20, 1, 1, 1);
INSERT INTO public.ninos_fichas (usuario_id, grado, alergias) VALUES
  (pg_temp.id('us', 5), 1, 'ZZ maní'), (pg_temp.id('us', 6), 1, NULL);
INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, telefono, relacion) VALUES
  (pg_temp.id('us', 5), 'ZZ Abuela Ns', '04129990001', 'Abuela');

GRANT INSERT, SELECT, UPDATE ON t_ns_failures, t_ns_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

-- ── a. Caracas date ──────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: ninos_hoy is the Caracas date',
  $q$SELECT (public.ninos_hoy() = (now() AT TIME ZONE 'America/Caracas')::date)::text$q$, 'true');

SET LOCAL ROLE authenticated;

-- ── b. menu flags ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: anfitrión operates and sees rooms',
  $q$SELECT public.ninos_puede_operar_algun_area() || ':' || public.ninos_puede_ver_algun_salon()$q$, 'true:true');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: líder sees rooms but does not operate',
  $q$SELECT public.ninos_puede_operar_algun_area() || ':' || public.ninos_puede_ver_algun_salon()$q$, 'false:true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b: random user has neither',
  $q$SELECT public.ninos_puede_operar_algun_area() || ':' || public.ninos_puede_ver_algun_salon()$q$, 'false:false');

-- ── c. room list with grade ──────────────────────────────────────────

SELECT pg_temp.as_persona(1);
INSERT INTO t_ns_ctx (k, v)
SELECT 'codigo', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 6)],
  pg_temp.ctx('turno')::uuid, DATE '2099-01-04', ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]);
SELECT pg_temp.assert_eq('c: the room list carries the grade and the allergy',
  $q$SELECT string_agg(apellido || ':' || grado || ':' || coalesce(alergias, '-'), ',' ORDER BY apellido)
       FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.ctx('turno')::uuid)$q$,
  'N5:1:ZZ maní,N6:1:-');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: the líder reads the room list',
  $q$SELECT count(*)::text FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.ctx('turno')::uuid)$q$,
  '2');

-- ── d. lookup by code ────────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: the líder cannot look up a code',
  $q$SELECT * FROM public.ninos_buscar_codigo(pg_temp.ctx('codigo'), pg_temp.ctx('turno')::uuid, DATE '2099-01-04')$q$,
  '42501');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: the code finds both children, the pickup people and the room',
  $q$SELECT string_agg(apellido || ':' || salon || ':' || jsonb_array_length(autorizados) || ':'
                       || coalesce(autorizados -> 0 ->> 'telefono', '-'), ',' ORDER BY apellido)
       FROM public.ninos_buscar_codigo(pg_temp.ctx('codigo'), pg_temp.ctx('turno')::uuid, DATE '2099-01-04')$q$,
  'N5:ZZ Ns S1:1:04129990001,N6:ZZ Ns S1:0:-');
SELECT pg_temp.assert_eq('d: a wrong code finds nothing',
  $q$SELECT count(*)::text FROM public.ninos_buscar_codigo('99999', pg_temp.ctx('turno')::uuid, DATE '2099-01-04')$q$, '0');

-- ── e. after check-out ───────────────────────────────────────────────

SELECT pg_temp.assert_eq('e: check-out releases both children',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.ctx('codigo'), pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'ZZ Mamá')$q$,
  '2');
SELECT pg_temp.assert_eq('e: the lookup shows who picked up and when',
  $q$SELECT string_agg((salida_at IS NOT NULL)::text || ':' || retirado_por_nombre, ',')
       FROM public.ninos_buscar_codigo(pg_temp.ctx('codigo'), pg_temp.ctx('turno')::uuid, DATE '2099-01-04')$q$,
  'true:ZZ Mamá,true:ZZ Mamá');
SELECT pg_temp.assert_eq('e: the room list is empty',
  $q$SELECT count(*)::text FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.ctx('turno')::uuid)$q$,
  '0');

-- ── f. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_buscar_codigo',
  $q$SELECT * FROM public.ninos_buscar_codigo('1234', gen_random_uuid(), DATE '2099-01-04')$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_puede_ver_algun_salon',
  $q$SELECT public.ninos_puede_ver_algun_salon()$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_hoy',
  $q$SELECT public.ninos_hoy()$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ns_failures;

ROLLBACK;
