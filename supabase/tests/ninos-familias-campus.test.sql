-- R3a (odd/tasks/ninos-roles-validacion.md) — family and child searches only
-- list people of the caller's campuses
-- (20261013100000_ninos_familias_por_campus.sql).
--
-- Fixtures: campus A (Barquisimeto) and a synthetic campus B, each with its
-- own Niños area, room and Anfitrión. Family A (parent + child on campus A),
-- family B (campus B), family C (campus B, but the child checked in once at
-- campus A) and a childless adult on campus B.
--
-- Covers:
--   a. The Anfitrión of A finds family A and C by name, never family B, nor
--      B's adult by exact cédula; the child searches (vincular, revisar edad)
--      follow the same scope.
--   b. The Anfitrión of B finds B (and C), never A.
--   c. An admin finds every family.
--   d. A user who operates no Niños area is refused; e. anon cannot execute.
--
-- R3d (20261013110000_ninos_alcance_campus_fichas_escrituras.sql):
--   f. Direct reads and updates of ninos_fichas / ninos_autorizados_retiro
--      (RLS) only reach rows of the caller's campuses; admin reaches all.
--   g. ninos_crear_ficha, ninos_vincular_padre and
--      ninos_vincular_revisando_edad refuse a child or parent outside the
--      caller's campuses ('22023', as if not found) and still work inside
--      them; admin works on every campus.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_fc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_fc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9530000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9501' WHEN 'us' THEN '9502' WHEN 'eq' THEN '9504'
                       WHEN 'ro' THEN '9505' WHEN 'sa' THEN '9506' WHEN 'ca' THEN '9507'
                       WHEN 'vi' THEN '9508' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_fc_ctx WHERE k = p_k;
$$;

-- Ids (sorted) returned by a search, as a comma-separated list of fixture
-- numbers (only this suite's people).
CREATE OR REPLACE FUNCTION pg_temp.nums(p_res jsonb) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(n::text, ',' ORDER BY n), '')
    FROM (SELECT DISTINCT n FROM generate_series(1, 40) n, jsonb_array_elements(p_res) e
           WHERE e ->> 'id' = pg_temp.id('us', n)::text) x;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_fc_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.activo ORDER BY t.dia_semana, t.hora LIMIT 1;
INSERT INTO t_fc_ctx (k, v)
SELECT 'campus_a', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 2), 'ZZ Fc Campus B', 'ZZFCB');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'fc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;

-- 1 Anfitrión of A, 2 random user, 3 admin, 4 Anfitrión of B.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Fc', 'U' || n, 'fc-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 3), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

-- Families: 10/11 on A; 12/13 on B; 14/15 on B with a check-in at A;
-- 16 a childless adult on B. Every last name contains 'Zzfcamp'.
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, telefono, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 10), 'ZZ Ana',   'Zzfcamp Uno',  'Soltero', 'Femenino',  '04129995310', 'V-99995310', '1990-01-01'),
  (pg_temp.id('us', 11), 'ZZ Alba',  'Zzfcamp Uno',  'No especificado', 'Femenino',  NULL, 'V-99995311', '2020-01-01'),
  (pg_temp.id('us', 12), 'ZZ Beto',  'Zzfcamp Dos',  'Soltero', 'Masculino', '04129995312', 'V-99995312', '1990-01-01'),
  (pg_temp.id('us', 13), 'ZZ Bruno', 'Zzfcamp Dos',  'No especificado', 'Masculino', NULL, 'V-99995313', '2020-01-01'),
  (pg_temp.id('us', 14), 'ZZ Ciro',  'Zzfcamp Tres', 'Soltero', 'Masculino', '04129995314', 'V-99995314', '1990-01-01'),
  (pg_temp.id('us', 15), 'ZZ Cleo',  'Zzfcamp Tres', 'No especificado', 'Femenino',  NULL, 'V-99995315', '2020-01-01'),
  (pg_temp.id('us', 16), 'ZZ Dora',  'Zzfcamp Cuatro', 'Soltero', 'Femenino', '04129995316', 'V-99995316', '1990-01-01');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 10), 'padre', true),
  (pg_temp.id('us', 13), pg_temp.id('us', 12), 'padre', true),
  (pg_temp.id('us', 15), pg_temp.id('us', 14), 'padre', true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 10), pg_temp.ctx('campus_a')::uuid, true),
  (pg_temp.id('us', 11), pg_temp.ctx('campus_a')::uuid, true),
  (pg_temp.id('us', 12), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 13), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 14), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 15), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 16), pg_temp.id('ca', 2), true);

-- A Niños area per campus, each with an Anfitriones sub-area and a room.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Fc RA', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Fc WA', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', NULL, 'ZZ Fc RB', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 4), 'ZZ Fc WB', true),
  (pg_temp.id('eq', 6), 'ninos', pg_temp.id('eq', 5), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 4), pg_temp.id('eq', 6), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus_a')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Fc SA', 20, 0, 59, 1),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 2), pg_temp.id('eq', 5), 'waumba', 'ZZ Fc SB', 20, 0, 59, 1);

-- Family C's child once checked in at campus A.
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at, salida_at)
VALUES (pg_temp.id('us', 15), pg_temp.id('sa', 1), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus_a')::uuid,
        DATE '2026-01-04', pg_temp.id('vi', 1), '5315', now(), now());

-- R3d fixtures. Fichas for the children of A (11), B (13) and C (15); a
-- pickup person for 11 and 13. Extra people (none named 'Zzfcamp', so the
-- searches above are unchanged): 17 a child of B's parent 12 without ficha,
-- 18 a child of A's parent 10 without ficha, 19 an unlinked child on A,
-- 20 an adult on B (an age-review candidate).
INSERT INTO public.ninos_fichas (usuario_id) VALUES
  (pg_temp.id('us', 11)), (pg_temp.id('us', 13)), (pg_temp.id('us', 15));
INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre) VALUES
  (pg_temp.id('us', 11), 'ZZ Fc Retira A'), (pg_temp.id('us', 13), 'ZZ Fc Retira B');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 17), 'XQ Eva',  'Xqfcamp Dos',  'No especificado', 'Femenino',  'V-99995317', '2021-01-01'),
  (pg_temp.id('us', 18), 'XQ Ema',  'Xqfcamp Uno',  'No especificado', 'Femenino',  'V-99995318', '2021-01-01'),
  (pg_temp.id('us', 19), 'XQ Fito', 'Xqfcamp Solo', 'No especificado', 'Masculino', 'V-99995319', '2021-01-01'),
  (pg_temp.id('us', 20), 'XQ Gil',  'Xqfcamp Adul', 'Soltero',         'Masculino', 'V-99995320', '1990-01-01');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 17), pg_temp.id('us', 12), 'padre', true),
  (pg_temp.id('us', 18), pg_temp.id('us', 10), 'padre', true);
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 17), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 18), pg_temp.ctx('campus_a')::uuid, true),
  (pg_temp.id('us', 19), pg_temp.ctx('campus_a')::uuid, true),
  (pg_temp.id('us', 20), pg_temp.id('ca', 2), true);

GRANT INSERT, SELECT, UPDATE ON t_fc_failures, t_fc_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.nums(jsonb) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. Anfitrión of campus A ─────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: a name search finds families A and C, never B',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('Zzfcamp'))$q$, '10,14');
SELECT pg_temp.assert_eq('a: a 2-letter search never reaches campus B',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('zz'))$q$, '10,14');
SELECT pg_temp.assert_eq('a: B''s parent by exact cédula is not found',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('V-99995312'))$q$, '');
SELECT pg_temp.assert_eq('a: B''s child by exact cédula is not found',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('V-99995313'))$q$, '');
SELECT pg_temp.assert_eq('a: B''s childless adult by exact cédula is not found',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('V-99995316'))$q$, '');
SELECT pg_temp.assert_eq('a: A''s family keeps its children list',
  $q$SELECT f -> 'hijos' -> 0 ->> 'id' FROM jsonb_array_elements(public.ninos_buscar_familias('Zzfcamp Uno')) f
      WHERE f ->> 'id' = pg_temp.id('us', 10)::text$q$, pg_temp.id('us', 11)::text);
SELECT pg_temp.assert_eq('a: vincular finds A''s and C''s children, never B''s',
  $q$SELECT pg_temp.nums(public.ninos_buscar_hijos_vincular('zzfcamp', NULL))$q$, '11,15');
SELECT pg_temp.assert_eq('a: revisar edad finds A''s and C''s adults, never B''s',
  $q$SELECT pg_temp.nums(public.ninos_buscar_hijos_revisar_edad('zzfcamp', NULL))$q$, '10,14');

-- ── b. Anfitrión of campus B ─────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b: the Anfitrión of B finds B and C, never A',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('Zzfcamp'))$q$, '12,14');
SELECT pg_temp.assert_eq('b: B''s childless adult by exact cédula is found',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('V-99995316'))$q$, '16');
SELECT pg_temp.assert_eq('b: vincular never offers A''s child',
  $q$SELECT pg_temp.nums(public.ninos_buscar_hijos_vincular('zzfcamp', NULL))$q$, '13,15');

-- ── c. admin keeps every campus ──────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: admin finds every family',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('Zzfcamp'))$q$, '10,12,14');
SELECT pg_temp.assert_eq('c: admin finds B''s childless adult',
  $q$SELECT pg_temp.nums(public.ninos_buscar_familias('V-99995316'))$q$, '16');
SELECT pg_temp.assert_eq('c: admin vincular sees every child',
  $q$SELECT pg_temp.nums(public.ninos_buscar_hijos_vincular('zzfcamp', NULL))$q$, '11,13,15');
SELECT pg_temp.assert_eq('c: admin revisar edad sees every adult',
  $q$SELECT pg_temp.nums(public.ninos_buscar_hijos_revisar_edad('zzfcamp', NULL))$q$, '10,12,14,16');

-- ── d. a user who operates no Niños area ─────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: a random user cannot search families',
  $q$SELECT public.ninos_buscar_familias('Zzfcamp')$q$, '42501');
SELECT pg_temp.assert_raises('d: a random user cannot search children to link',
  $q$SELECT public.ninos_buscar_hijos_vincular('zzfcamp', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('d: a random user cannot search for age review',
  $q$SELECT public.ninos_buscar_hijos_revisar_edad('zzfcamp', NULL)$q$, '42501');

-- ── f. direct reads and updates (RLS) ────────────────────────────────

-- Fixture numbers of the fichas / pickup rows the caller can read.
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.fichas_visibles() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(n::text, ',' ORDER BY n), '')
    FROM generate_series(1, 40) n
   WHERE EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = pg_temp.id('us', n));
$$;
CREATE OR REPLACE FUNCTION pg_temp.retiro_visibles() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(n::text, ',' ORDER BY n), '')
    FROM generate_series(1, 40) n
   WHERE EXISTS (SELECT 1 FROM public.ninos_autorizados_retiro a WHERE a.nino_id = pg_temp.id('us', n));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.fichas_visibles(), pg_temp.retiro_visibles() TO authenticated;
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: the Anfitrión of A reads A''s and C''s fichas, never B''s',
  $q$SELECT pg_temp.fichas_visibles()$q$, '11,15');
SELECT pg_temp.assert_eq('f: the Anfitrión of A reads A''s pickup list, never B''s',
  $q$SELECT pg_temp.retiro_visibles()$q$, '11');
SELECT pg_temp.assert_eq('f: the Anfitrión of A cannot update B''s ficha',
  $q$WITH u AS (UPDATE public.ninos_fichas SET notas = 'x' WHERE usuario_id = pg_temp.id('us', 13) RETURNING 1)
     SELECT count(*)::text FROM u$q$, '0');
SELECT pg_temp.assert_eq('f: the Anfitrión of A cannot update B''s pickup list',
  $q$WITH u AS (UPDATE public.ninos_autorizados_retiro SET activo = false WHERE nino_id = pg_temp.id('us', 13) RETURNING 1)
     SELECT count(*)::text FROM u$q$, '0');
SELECT pg_temp.assert_eq('f: the Anfitrión of A updates A''s ficha',
  $q$WITH u AS (UPDATE public.ninos_fichas SET notas = 'x' WHERE usuario_id = pg_temp.id('us', 11) RETURNING 1)
     SELECT count(*)::text FROM u$q$, '1');
SELECT pg_temp.assert_raises('f: the Anfitrión of A cannot insert a pickup person for B''s child',
  $q$INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre) VALUES (pg_temp.id('us', 13), 'ZZ Fc Intruso')$q$, '42501');

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('f: the Anfitrión of B reads B''s and C''s fichas, never A''s',
  $q$SELECT pg_temp.fichas_visibles()$q$, '13,15');
SELECT pg_temp.assert_eq('f: the Anfitrión of B reads B''s pickup list, never A''s',
  $q$SELECT pg_temp.retiro_visibles()$q$, '13');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('f: admin reads every ficha',
  $q$SELECT pg_temp.fichas_visibles()$q$, '11,13,15');
SELECT pg_temp.assert_eq('f: admin reads every pickup list',
  $q$SELECT pg_temp.retiro_visibles()$q$, '11,13');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f: a random user reads no ficha',
  $q$SELECT pg_temp.fichas_visibles()$q$, '');

-- ── g. write RPCs ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('g: A cannot create a ficha for B''s child',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 17), '{}'::jsonb, '[]'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('g: A cannot link B''s child to A''s parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 13)], pg_temp.id('us', 10), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('g: A cannot link A''s child to B''s parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 19)], pg_temp.id('us', 12), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('g: A cannot review the age of B''s adult',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 20), DATE '2021-01-01', pg_temp.id('us', 10), NULL)$q$, '22023');
SELECT pg_temp.assert_eq('g: A creates a ficha for A''s child',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 18), '{}'::jsonb, '[]'::jsonb)::text$q$, '');
SELECT pg_temp.assert_eq('g: A links A''s unlinked child to A''s parent',
  $q$SELECT (public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 19)], pg_temp.id('us', 10), NULL) ->> 'vinculados')$q$, '1');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('g: admin creates a ficha for B''s child',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 17), '{}'::jsonb, '[]'::jsonb)::text$q$, '');
SELECT pg_temp.assert_eq('g: admin reviews the age of B''s adult and links them',
  $q$SELECT (public.ninos_vincular_revisando_edad(pg_temp.id('us', 20), DATE '2021-01-01', pg_temp.id('us', 12), NULL) ->> 'vinculados')$q$, '1');

-- ── e. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_buscar_familias',
  $q$SELECT public.ninos_buscar_familias('Zzfcamp')$q$, '42501');
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_buscar_hijos_vincular',
  $q$SELECT public.ninos_buscar_hijos_vincular('zzfcamp', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_buscar_hijos_revisar_edad',
  $q$SELECT public.ninos_buscar_hijos_revisar_edad('zzfcamp', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_en_alcance',
  $q$SELECT public.ninos_en_alcance(NULL, NULL)$q$, '42501');
SELECT pg_temp.assert_raises('e: anon cannot execute ninos_en_mi_alcance',
  $q$SELECT public.ninos_en_mi_alcance(NULL)$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_fc_failures;

ROLLBACK;
