-- S11 (odd/tasks/dps-asistencia-pco.md, L52; T11c) — the person search of
-- the programming sheet's Productor, Host and Comunicador cells
-- (20261108207000_dps_buscar_personas.sql). Needs the earlier DPS
-- migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_buscar_personas(text, integer) is
--      SECURITY DEFINER with search_path '', returns exactly id, nombre,
--      apellido and iniciales (no email, no teléfono), is executable by
--      authenticated, not by anon nor PUBLIC; anon cannot call it.
--   b. Search: by nombre, by apellido, by «nombre apellido», ignoring case
--      and the order of the words; iniciales as dps_iniciales; fewer than 2
--      characters (also blank or NULL) return nothing; '%' and '_' are
--      literal; more than 100 characters is 'busqueda_invalida'; the limit
--      is 10 by default, at least 1 and at most 20; ordered by nombre,
--      apellido.
--   c. Authority (dps_exigir_planificador): an admin without any Dream Team
--      or Talleres grant (talleres_buscar_personas refuses them) and an
--      added planner (dps_planificadores) search; a plain DPS servidor, a
--      user without anything and a caller without a session get 42501
--      'sin_autoridad'.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Reads that need a session set request.jwt.claim.sub to the fixture
-- auth id; the anon case runs under SET LOCAL ROLE anon. No plan is created.
--
-- Identities (usuario n = auth n, all fictitious, nombre «ZZ Bq…»):
--   1 ADMIN    rol admin, no grant
--   2 PLAN     a row in dps_planificadores, no grant
--   3 VOL      Voluntario servicio in ZZ Bq Alfa (a plain servidor)
--   4 RANDOM   nothing
--   5 ANA      «ZZ Bqana Pérez» (the person searched for)
--   6 ANDRES   «ZZ Bqandrés Pérez_x» (an apellido with '_')
--   7..31      «ZZ Bqlote NN» (25 people for the limits)

SET LOCAL search_path TO pg_temp, public;
-- The helpers name a new function: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_bq_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_bq_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_bq_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_bq_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9c00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd9c1' WHEN 'us' THEN 'd9c2' WHEN 'eq' THEN 'd9c3'
                       WHEN 'ro' THEN 'd9c4' WHEN 'se' THEN 'd9c5' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

-- The fixture people a search returns, as 'nombre apellido' in order (real
-- people that happen to match are left out).
CREATE OR REPLACE FUNCTION pg_temp.nombres(p_texto text, p_limite int DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(b.nombre || ' ' || b.apellido, ',' ORDER BY b.o), '')
            FROM (SELECT r.*, row_number() OVER () AS o
                    FROM public.dps_buscar_personas(p_texto, coalesce(p_limite, 10)) r) b
           WHERE b.id::text LIKE 'd9c00000-%');
END;
$$;

-- How many rows a search returns (real people included).
CREATE OR REPLACE FUNCTION pg_temp.cuantos(p_texto text, p_limite int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT count(*)::text FROM public.dps_buscar_personas(p_texto, p_limite));
END;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_bq_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'bq-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', x.n), CASE WHEN x.n <= 4 THEN pg_temp.id('au', x.n) END, x.nombre, x.apellido,
       'bq-' || x.n || '@example.test', 'Soltero', 'Femenino'
  FROM (VALUES (1, 'ZZ Bqadmin', 'U1'), (2, 'ZZ Bqplan', 'U2'), (3, 'ZZ Bqvol', 'U3'), (4, 'ZZ Bqrandom', 'U4'),
               (5, 'ZZ Bqana', 'Pérez'), (6, 'ZZ Bqandrés', 'Pérez_x')) AS x(n, nombre, apellido);
-- A separate INSERT: in a UNION the literals would resolve to text and not
-- cast to the estado_civil / genero enums of a real database.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), NULL, 'ZZ Bqlote', lpad(n::text, 2, '0'), 'bq-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(7, 31) AS n;
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id = pg_temp.id('us', 3)
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
INSERT INTO public.dps_planificadores (persona_id, agregado_por) VALUES (pg_temp.id('us', 2), pg_temp.id('us', 1));

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Bq Alfa', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'Voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo', now() - interval '30 days', 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
VALUES (pg_temp.id('us', 3), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test');

GRANT INSERT, SELECT, UPDATE ON t_bq_failures, t_bq_ctx TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

-- ── a. structure and privileges ──────────────────────────────────────

SELECT pg_temp.assert_eq('a1: SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""'])
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'dps_buscar_personas'$q$, '1|1');
SELECT pg_temp.assert_eq('a2: returns only id, nombre, apellido and iniciales',
  $q$SELECT pg_get_function_result('public.dps_buscar_personas(text, integer)'::regprocedure)$q$,
  'TABLE(id uuid, nombre text, apellido text, iniciales text)');
SELECT pg_temp.assert_eq('a3: p_limite defaults to 10',
  $q$SELECT pg_get_function_arguments('public.dps_buscar_personas(text, integer)'::regprocedure)$q$,
  'p_texto text, p_limite integer DEFAULT 10');
SELECT pg_temp.assert_eq('a4: authenticated executes it; anon and PUBLIC do not',
  $q$SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') || ':' || has_function_privilege('anon', p.oid, 'EXECUTE') || ':'
            || coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x WHERE x.privilege_type = 'EXECUTE'), false)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'dps_buscar_personas'$q$, 'true:false:false');

SET LOCAL ROLE anon;
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('a5: anon cannot call it',
  $q$SELECT count(*) FROM public.dps_buscar_personas('ZZ Bqana', 10)$q$, '42501');
RESET ROLE;

-- ── b. search (as the admin without grants) ──────────────────────────

SELECT pg_temp.as_persona(1);
-- talleres_buscar_personas needs a Dream Team or Talleres grant: this admin has none.
SELECT pg_temp.assert_eq('b0: the admin plans without any grant',
  $q$SELECT public.dps_puede_planificar() || ':' || (SELECT count(*) FROM public.dream_team_capability_grants g
                                                    WHERE g.persona_id = pg_temp.id('us', 1) AND g.revoked_at IS NULL)$q$, 'true:0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b1: by nombre', $q$SELECT pg_temp.nombres('ZZ Bqana')$q$, 'ZZ Bqana Pérez');
-- «zz bq» keeps real people named Pérez in a loaded database out of the limit.
SELECT pg_temp.assert_eq('b2: by apellido, ignoring case, ordered by nombre',
  $q$SELECT pg_temp.nombres('pÉREZ zz bQ')$q$, 'ZZ Bqana Pérez,ZZ Bqandrés Pérez_x');
SELECT pg_temp.assert_eq('b3: by «nombre apellido»', $q$SELECT pg_temp.nombres('Bqana Pérez')$q$, 'ZZ Bqana Pérez');
SELECT pg_temp.assert_eq('b4: the words in any order', $q$SELECT pg_temp.nombres('  pérez   bqana ')$q$, 'ZZ Bqana Pérez');
SELECT pg_temp.assert_eq('b5: one row carries id, nombre, apellido and iniciales',
  $q$SELECT (SELECT to_jsonb(r) FROM public.dps_buscar_personas('ZZ Bqana Pérez', 10) r WHERE r.id = pg_temp.id('us', 5))::text$q$,
  jsonb_build_object('id', pg_temp.id('us', 5), 'nombre', 'ZZ Bqana', 'apellido', 'Pérez', 'iniciales', 'ZP')::text);
SELECT pg_temp.assert_eq('b6: one character returns nothing', $q$SELECT pg_temp.cuantos('Z', 10)$q$, '0');
SELECT pg_temp.assert_eq('b6: blank returns nothing', $q$SELECT pg_temp.cuantos('   ', 10)$q$, '0');
SELECT pg_temp.assert_eq('b6: NULL returns nothing', $q$SELECT pg_temp.cuantos(NULL, 10)$q$, '0');
SELECT pg_temp.assert_eq('b6: two characters search', $q$SELECT (pg_temp.cuantos('Bq', 10)::int > 0)::text$q$, 'true');
SELECT pg_temp.assert_eq('b7: "_" is literal', $q$SELECT pg_temp.nombres('Pérez_')$q$, 'ZZ Bqandrés Pérez_x');
SELECT pg_temp.assert_eq('b7: "%" is literal', $q$SELECT pg_temp.cuantos('Bq%x', 10)$q$, '0');
SELECT pg_temp.assert_raises('b8: more than 100 characters',
  $q$SELECT count(*) FROM public.dps_buscar_personas(repeat('a', 101), 10)$q$, '22023', 'busqueda_invalida');
SELECT pg_temp.assert_eq('b8: 100 characters are fine', $q$SELECT pg_temp.cuantos(repeat('a', 100), 10)$q$, '0');
SELECT pg_temp.assert_eq('b9: 10 by default',
  $q$SELECT count(*)::text FROM public.dps_buscar_personas('ZZ Bqlote')$q$, '10');
SELECT pg_temp.assert_eq('b9: ordered by nombre, apellido',
  $q$SELECT pg_temp.nombres('ZZ Bqlote', 3)$q$, 'ZZ Bqlote 07,ZZ Bqlote 08,ZZ Bqlote 09');
SELECT pg_temp.assert_eq('b10: at most 20', $q$SELECT pg_temp.cuantos('ZZ Bqlote', 500)$q$, '20');
SELECT pg_temp.assert_eq('b10: at least 1', $q$SELECT pg_temp.cuantos('ZZ Bqlote', 0)$q$, '1');
SELECT pg_temp.assert_eq('b10: NULL is the default', $q$SELECT count(*)::text FROM public.dps_buscar_personas('ZZ Bqlote', NULL)$q$, '10');

-- ── c. authority ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c1: an added planner searches', $q$SELECT pg_temp.nombres('ZZ Bqana')$q$, 'ZZ Bqana Pérez');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c2: the servidor sees DPS', $q$SELECT public.dps_puede_ver()::text$q$, 'true');
SELECT pg_temp.assert_raises('c2: a servidor cannot search',
  $q$SELECT count(*) FROM public.dps_buscar_personas('ZZ Bqana', 10)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c2: not even with a short text',
  $q$SELECT count(*) FROM public.dps_buscar_personas('Z', 10)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('c3: a random user cannot search',
  $q$SELECT count(*) FROM public.dps_buscar_personas('ZZ Bqana', 10)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('c4: nor a caller without a session',
  $q$SELECT count(*) FROM public.dps_buscar_personas('ZZ Bqana', 10)$q$, '42501', 'sin_autoridad');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_bq_failures);
END;
$$;
