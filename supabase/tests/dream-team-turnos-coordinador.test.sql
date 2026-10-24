-- The Atención al Voluntario coordinator assigns service shifts in their area
-- (odd/tasks/dream-team-turnos-coordinador.md, S1–S3;
-- 20261024100000_dream_team_turnos_coordinador_voluntario.sql).
--
-- Covers:
--   a. The coordinator assigns a shift to a volunteer of the area, changes its
--      frequency and removes it.
--   b. Outside the area (another branch) the insert is refused (42501) and a
--      delete or update touches no row.
--   c. A retired servicio of the area is refused (same reach as the ficha).
--   d. A plain volunteer is still refused.
--   e. The area director keeps assigning (nothing is removed from the old rule).
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (Coordinador in AV); 2 VOL (activo
-- in S); 3 OUTSIDER (activo in E); 4 DIRECTOR (dream_team.direct on N);
-- 5 PLAIN (activo in S, dream_team.serve); 6 RETIRED (retirado in S).
-- Tree: R → N → S; N → AV ("Atención al Voluntario"); R → E. One campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Rows changed by a DML statement, as text (RLS hides rows instead of raising).
CREATE OR REPLACE FUNCTION pg_temp.filas(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9300000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9301' WHEN 'us' THEN '9302' WHEN 'ca' THEN '9303'
                       WHEN 'eq' THEN '9304' WHEN 'ro' THEN '9305' WHEN 'se' THEN '9306'
                       WHEN 'tu' THEN '9307' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'tc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 6) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Tc', 'U' || n, 'tc-' || n || '@example.test', 'No especificado', 'Otro'
  FROM generate_series(1, 6) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Tc Campus', 'ZZTC1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM generate_series(1, 6) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Tc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Tc N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Tc S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Tc E', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 2), 'Atención al Voluntario', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 5), 'Coordinador', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 1), pg_temp.id('us', 1), pg_temp.id('eq', 5), pg_temp.id('ro', 3), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('se', 2), pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('se', 3), pg_temp.id('us', 3), pg_temp.id('eq', 4), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('se', 5), pg_temp.id('us', 5), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, fecha_fin, motivo_actual) VALUES
  (pg_temp.id('se', 6), pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'retirado',
   now() - interval '1 day', now(), 'admin_asignacion');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 4), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 5), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Tc Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Tc Domingo 11', 0, '11:00', 2, true);

-- An assignment outside the area, to check that the coordinator cannot touch it.
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 1));

GRANT INSERT, SELECT ON t_tc_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.filas(text), pg_temp.as_persona(int), pg_temp.id(text, int)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. the coordinator assigns, changes the frequency and removes ────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the coordinator assigns a shift to a volunteer of the area',
  $q$SELECT pg_temp.filas('INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES ('
       || quote_literal(pg_temp.id('se', 2)) || ', ' || quote_literal(pg_temp.id('tu', 1)) || ')')$q$, '1');
SELECT pg_temp.assert_eq('a: the coordinator makes it biweekly',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_servicio_turnos SET frecuencia = ''quincenal'', fecha_ancla = ''2026-10-25''
       WHERE servicio_id = ' || quote_literal(pg_temp.id('se', 2)))$q$, '1');
SELECT pg_temp.assert_eq('a: the coordinator assigns a second shift',
  $q$SELECT pg_temp.filas('INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES ('
       || quote_literal(pg_temp.id('se', 2)) || ', ' || quote_literal(pg_temp.id('tu', 2)) || ')')$q$, '1');
SELECT pg_temp.assert_eq('a: the coordinator removes a shift',
  $q$SELECT pg_temp.filas('DELETE FROM public.dream_team_servicio_turnos WHERE servicio_id = '
       || quote_literal(pg_temp.id('se', 2)) || ' AND turno_id = ' || quote_literal(pg_temp.id('tu', 2)))$q$, '1');

-- ── b. outside the area ──────────────────────────────────────────────

SELECT pg_temp.assert_raises('b: a volunteer of another branch is refused',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 3), pg_temp.id('tu', 2))$q$,
  '42501');
SELECT pg_temp.assert_eq('b: an update outside the area touches no row',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_servicio_turnos SET frecuencia = ''quincenal'', fecha_ancla = ''2026-10-25''
       WHERE servicio_id = ' || quote_literal(pg_temp.id('se', 3)))$q$, '0');
SELECT pg_temp.assert_eq('b: a delete outside the area touches no row',
  $q$SELECT pg_temp.filas('DELETE FROM public.dream_team_servicio_turnos WHERE servicio_id = ' || quote_literal(pg_temp.id('se', 3)))$q$,
  '0');

-- ── c. a retired servicio ────────────────────────────────────────────

SELECT pg_temp.assert_raises('c: a retired servicio of the area is refused',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 6), pg_temp.id('tu', 1))$q$,
  '42501');

-- ── d. a plain volunteer ─────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('d: a plain volunteer cannot assign',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 5), pg_temp.id('tu', 1))$q$,
  '42501');

-- ── e. the director keeps assigning ──────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('e: the area director assigns a shift',
  $q$SELECT pg_temp.filas('INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES ('
       || quote_literal(pg_temp.id('se', 5)) || ', ' || quote_literal(pg_temp.id('tu', 2)) || ')')$q$, '1');

RESET ROLE;

-- ── stored state ─────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('stored: the area volunteer keeps one biweekly shift; the outsider keeps theirs, weekly',
  $q$SELECT string_agg(s.u || ':' || st.frecuencia, ',' ORDER BY s.u)
       FROM public.dream_team_servicio_turnos st
       JOIN (VALUES (pg_temp.id('se', 2), 'vol'), (pg_temp.id('se', 3), 'outsider'), (pg_temp.id('se', 5), 'plain')) s(id, u)
         ON s.id = st.servicio_id$q$,
  'outsider:semanal,plain:semanal,vol:quincenal');

SELECT coalesce(string_agg(case_name, E'\n'), 'ALL OK') AS result FROM t_tc_failures;

ROLLBACK;
