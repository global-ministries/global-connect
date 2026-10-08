-- N1 (odd/tasks/ninos-checkin.md) — Niños check-in base
-- (20261008140000_ninos_checkin_base.sql).
--
-- Covers:
--   a. An Anfitriones volunteer checks two siblings in with one shared code.
--   b. The same child cannot be checked in twice in the same fecha + turno.
--   c. A second family gets a different code in the same turno.
--   d. A Líderes volunteer reads the room list (with alerts) but cannot
--      check in or out.
--   e. A random user can neither check in nor read the list, and sees no
--      room, ficha or check-in row.
--   f. Checkout by code releases both siblings; the code then frees up.
--   g. anon cannot execute the RPCs.
--   h. Direct writes to ninos_checkins are denied to authenticated.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION (activo in A), 2 LIDER (activo
-- in L), 3 RANDOM, 4 COORD (dream_team.coordinate on W). Children 5, 6
-- (siblings) and 7 (another family) have no account.
-- Tree: R → W → A ("Anfitriones"), W → L ("Líderes"). Rooms S1, S2 in W, on
-- the Barquisimeto campus and its Domingo 9:00 turno.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_nc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9300000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9301' WHEN 'us' THEN '9302' WHEN 'eq' THEN '9304'
                       WHEN 'ro' THEN '9305' WHEN 'sa' THEN '9306' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.turno() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT v::uuid FROM t_nc_ctx WHERE k = 'turno';
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nc_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nc_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.hora = '09:00' AND t.activo LIMIT 1;
INSERT INTO t_nc_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.turno();

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Nc', 'U' || n, 'nc-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Nino', 'N' || n, 'No especificado', 'Otro', DATE '2023-01-01'
  FROM generate_series(5, 7) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Nc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Nc W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 2), 'Líderes', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true);

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 2), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nc S1', 1, 0, 47, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nc S2', 20, 48, 59, 2);

INSERT INTO public.ninos_fichas (usuario_id, alergias) VALUES
  (pg_temp.id('us', 5), 'ZZ maní'), (pg_temp.id('us', 6), NULL), (pg_temp.id('us', 7), NULL);

GRANT INSERT, SELECT ON t_nc_failures, t_nc_ctx TO authenticated, anon;
GRANT UPDATE ON t_nc_ctx TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.turno(), pg_temp.ctx(text) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. the anfitrión checks two siblings in ──────────────────────────

SELECT pg_temp.as_persona(1);
INSERT INTO t_nc_ctx (k, v)
SELECT 'checkin1', string_agg(x.codigo || ':' || x.ocupacion || '/' || x.capacidad || ':' || x.sobre_capacidad, ',' ORDER BY x.salon_id)
  FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 5), pg_temp.id('us', 6)], pg_temp.turno(), DATE '2099-01-04',
                            ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 2)]) x;
INSERT INTO t_nc_ctx (k, v) SELECT 'codigo1', split_part(pg_temp.ctx('checkin1'), ':', 1);

SELECT pg_temp.assert_eq('a: one shared 4-digit code, occupancy and capacity per room',
  $q$SELECT pg_temp.ctx('checkin1')$q$,
  pg_temp.ctx('codigo1') || ':1/1:false,' || pg_temp.ctx('codigo1') || ':1/20:false');
SELECT pg_temp.assert_eq('a: the code is 4 digits',
  $q$SELECT (pg_temp.ctx('codigo1') ~ '^[0-9]{4}$')::text$q$, 'true');
SELECT pg_temp.assert_eq('a: the anfitrión sees the two check-ins',
  $q$SELECT count(*)::text FROM public.ninos_checkins WHERE fecha = DATE '2099-01-04'
       AND salon_id IN (pg_temp.id('sa', 1), pg_temp.id('sa', 2))$q$, '2');

-- ── b. double check-in guard ─────────────────────────────────────────

SELECT pg_temp.assert_raises('b: the same child cannot be checked in twice in the turno',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 5)], pg_temp.turno(), DATE '2099-01-04',
                                        ARRAY[pg_temp.id('sa', 1)])$q$, '23505');

-- ── c. another family gets a different code; capacity warning ────────

INSERT INTO t_nc_ctx (k, v)
SELECT 'checkin2', x.codigo || ':' || x.sobre_capacidad
  FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 7)], pg_temp.turno(), DATE '2099-01-04',
                            ARRAY[pg_temp.id('sa', 1)]) x;
SELECT pg_temp.assert_eq('c: a second family gets a different code',
  $q$SELECT (split_part(pg_temp.ctx('checkin2'), ':', 1) <> pg_temp.ctx('codigo1'))::text$q$, 'true');
SELECT pg_temp.assert_eq('c: S1 (capacity 1) warns over capacity',
  $q$SELECT split_part(pg_temp.ctx('checkin2'), ':', 2)$q$, 'true');

-- ── d. the líder reads the list but cannot operate ───────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d: the líder reads the room list with alerts',
  $q$SELECT string_agg(x.apellido || ':' || coalesce(x.alergias, '-'), ',' ORDER BY x.apellido)
       FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.turno()) x$q$,
  'N5:ZZ maní,N7:-');
SELECT pg_temp.assert_raises('d: the líder cannot check in',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 6)], pg_temp.turno(), DATE '2099-01-11',
                                        ARRAY[pg_temp.id('sa', 2)])$q$, '42501');
SELECT pg_temp.assert_raises('d: the líder cannot check out',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.ctx('codigo1'), pg_temp.turno(), DATE '2099-01-04', 'ZZ Madre')$q$,
  '42501');
SELECT pg_temp.assert_eq('d: the líder does not read fichas',
  $q$SELECT count(*)::text FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 5)$q$, '0');

-- ── e. a random user gets nothing ────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a random user cannot check in',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 6)], pg_temp.turno(), DATE '2099-01-11',
                                        ARRAY[pg_temp.id('sa', 2)])$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot read the list',
  $q$SELECT * FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.turno())$q$, '42501');
SELECT pg_temp.assert_eq('e: a random user sees no room, ficha or check-in',
  $q$SELECT (SELECT count(*) FROM public.ninos_salones WHERE id IN (pg_temp.id('sa', 1), pg_temp.id('sa', 2)))
          || ',' || (SELECT count(*) FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 5))
          || ',' || (SELECT count(*) FROM public.ninos_checkins WHERE fecha = DATE '2099-01-04')$q$,
  '0,0,0');

-- ── h. no direct writes on check-ins ─────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('h: the anfitrión cannot update a check-in directly',
  $q$UPDATE public.ninos_checkins SET salida_at = now() WHERE fecha = DATE '2099-01-04'$q$, '42501');

-- ── f. checkout by code ──────────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('f: the coordinator checks the siblings out by code',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.ctx('codigo1'), pg_temp.turno(), DATE '2099-01-04', 'ZZ Madre')$q$,
  '2');
SELECT pg_temp.assert_eq('f: the list keeps only the other family',
  $q$SELECT string_agg(x.apellido, ',') FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.turno()) x$q$,
  'N7');
SELECT pg_temp.assert_eq('f: who picked up is recorded',
  $q$SELECT string_agg(DISTINCT retirado_por_nombre, ',') FROM public.ninos_checkins
       WHERE fecha = DATE '2099-01-04' AND codigo = pg_temp.ctx('codigo1')$q$, 'ZZ Madre');
SELECT pg_temp.assert_eq('f: a used code checks out nothing more',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.ctx('codigo1'), pg_temp.turno(), DATE '2099-01-04', 'ZZ Madre')$q$,
  '0');

-- ── g. anon cannot execute the RPCs ──────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_checkin',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 6)], pg_temp.turno(), DATE '2099-01-11', ARRAY[pg_temp.id('sa', 2)])$q$,
  '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_checkout',
  $q$SELECT * FROM public.ninos_checkout('1234', pg_temp.turno(), DATE '2099-01-04', 'x')$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_lista_salon',
  $q$SELECT * FROM public.ninos_lista_salon(pg_temp.id('sa', 1), DATE '2099-01-04', pg_temp.turno())$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot read ninos_salones',
  $q$SELECT count(*) FROM public.ninos_salones$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nc_failures;

ROLLBACK;
