-- T11 follow-up (odd/tasks/ninos-voluntarios-waumba.md) — the Atención al
-- Voluntario coordinator READS the volunteers of their whole area
-- (20261008110000_dream_team_coordinador_voluntario_lectura.sql).
--
-- Covers:
--   a. The coordinator sees the servicios, equipos and roles of the area (the
--      equipos of dream_team_equipos_registrables: S and AV), not another
--      area (E).
--   b. dream_team_resolver_nombres and dream_team_contactos_personas answer
--      for a volunteer of the area, not for one of another area.
--   c. A plain volunteer sees nothing new (only their own servicio).
--   d. Writes stay denied: the coordinator updates zero servicio rows and
--      cannot insert one.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (Coordinador in AV, active, with
-- its minted grants dream_team.coordinate + dream_team.serve on AV); 2 VOL
-- (voluntario in S, dream_team.serve on S); 3 TARGET (postulado in S);
-- 4 OUTSIDER (activo in E).
-- Tree: R → N → S; N → AV ("Atención al Voluntario"); R → E.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cl_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cl_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9200000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9201' WHEN 'us' THEN '9202'
                       WHEN 'eq' THEN '9204' WHEN 'ro' THEN '9205' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Short labels for the fixture ids, so a visible set reads as "AV,S".
CREATE OR REPLACE FUNCTION pg_temp.k(p_id uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_id
    WHEN pg_temp.id('eq', 1) THEN 'R' WHEN pg_temp.id('eq', 2) THEN 'N' WHEN pg_temp.id('eq', 3) THEN 'S'
    WHEN pg_temp.id('eq', 4) THEN 'E' WHEN pg_temp.id('eq', 5) THEN 'AV'
    WHEN pg_temp.id('us', 1) THEN 'u1' WHEN pg_temp.id('us', 2) THEN 'u2' WHEN pg_temp.id('us', 3) THEN 'u3'
    WHEN pg_temp.id('us', 4) THEN 'u4' END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cl-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cl', 'U' || n, 'cl-' || n || '@example.test', 'Soltero', 'Otro',
       '0414000000' || n
  FROM generate_series(1, 4) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Cl R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cl N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Cl S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Cl E', true),
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

-- The grants a Coordinador servicio mints (grants.ts): no read capability at all.
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (pg_temp.id('us', 1), pg_temp.id('us', 2), pg_temp.id('us', 3), pg_temp.id('us', 4));
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 5)::text),
  (pg_temp.id('us', 1), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 5)::text),
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

GRANT INSERT, SELECT ON t_cl_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.k(uuid) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. the coordinator reads the area ────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the coordinator sees the servicios of the area, not of E',
  $q$SELECT string_agg(pg_temp.k(s.persona_id), ',' ORDER BY pg_temp.k(s.persona_id))
       FROM public.dream_team_servicios s WHERE pg_temp.k(s.equipo_id) IS NOT NULL$q$,
  'u1,u2,u3');
SELECT pg_temp.assert_eq('a: the coordinator sees the equipos of the area (S, AV), not N, R or E',
  $q$SELECT string_agg(pg_temp.k(e.id), ',' ORDER BY pg_temp.k(e.id))
       FROM public.dream_team_equipos e WHERE pg_temp.k(e.id) IS NOT NULL$q$,
  'AV,S');
SELECT pg_temp.assert_eq('a: the coordinator sees the roles of S, not of E',
  $q$SELECT string_agg(pg_temp.k(r.equipo_id), ',' ORDER BY pg_temp.k(r.equipo_id))
       FROM public.dream_team_roles r WHERE pg_temp.k(r.equipo_id) IS NOT NULL$q$,
  'AV,S');

-- ── b. names and contacts ────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: names of the area, not of E',
  $q$SELECT string_agg(pg_temp.k(x.id), ',' ORDER BY pg_temp.k(x.id))
       FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 2), pg_temp.id('us', 3), pg_temp.id('us', 4)]) x$q$,
  'u2,u3');
SELECT pg_temp.assert_eq('b: contacts of the area, not of E',
  $q$SELECT string_agg(pg_temp.k(x.id) || ':' || x.telefono, ',' ORDER BY pg_temp.k(x.id))
       FROM public.dream_team_contactos_personas(ARRAY[pg_temp.id('us', 3), pg_temp.id('us', 4)]) x$q$,
  'u3:04140000003');

-- ── d. writes stay denied ────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: the coordinator updates no servicio',
  $q$WITH u AS (UPDATE public.dream_team_servicios SET motivo_actual = motivo_actual
                 WHERE persona_id = pg_temp.id('us', 3) RETURNING 1)
     SELECT count(*)::text FROM u$q$,
  '0');
SELECT pg_temp.assert_raises('d: the coordinator cannot insert a servicio',
  $q$INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
     VALUES (pg_temp.id('us', 4), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'postulado', now(), 'admin_asignacion')$q$,
  '42501');
SELECT pg_temp.assert_raises('d: the coordinator cannot delete a servicio (no DELETE privilege)',
  $q$DELETE FROM public.dream_team_servicios WHERE persona_id = pg_temp.id('us', 3)$q$,
  '42501');

-- ── c. a plain volunteer sees nothing new ────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: a plain volunteer sees only their own servicio',
  $q$SELECT string_agg(pg_temp.k(s.persona_id), ',' ORDER BY pg_temp.k(s.persona_id))
       FROM public.dream_team_servicios s WHERE pg_temp.k(s.equipo_id) IS NOT NULL$q$,
  'u2');
SELECT pg_temp.assert_eq('c: a plain volunteer resolves no other name',
  $q$SELECT count(*)::text FROM public.dream_team_resolver_nombres(ARRAY[pg_temp.id('us', 3), pg_temp.id('us', 4)])$q$,
  '0');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cl_failures;

ROLLBACK;
