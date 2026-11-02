-- 1:1 — The Living Room groups as a source of dirigidos (C6c, L43).
-- Migration: 20261102120000_uno_a_uno_dirigidos_tlr.sql.
--
-- Cases:
--   d. the current leader of an active The Living Room group leads its
--      miembros, with the context "Estudiantes: <grupo>";
--   n. not its visitantes, not a member who left, not the members of another
--      group, not a group whose period closed, not a paused servicio, not an
--      inactive group, never Transit / Inside Out (minors), never oneself;
--   c. a member also led through another source keeps both contexts;
--   l. the function stays internal (service_role only).
--
-- Run as a superuser on a database with the migrations applied. Every row
-- uses the prefix e5a90000 and the whole run is rolled back: the last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases).

BEGIN;
SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ut_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ut_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a90000-0000-4000-%s-%s',
           CASE p_kind WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003' WHEN 'eq' THEN 'a004'
                       WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006' WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

-- The dirigidos of usuario p_n among the suite's people: "apellido:contextos".
CREATE OR REPLACE FUNCTION pg_temp.dirigidos(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(u.apellido || ':' || array_to_string(d.contextos, '+'), ',' ORDER BY u.apellido), '')
    FROM public.uno_a_uno_dirigidos_de(pg_temp.id('us', p_n)) d
    JOIN public.usuarios u ON u.id = d.usuario_id
   WHERE u.nombre = 'ZZ Ut';
$$;

-- ── fixtures ─────────────────────────────────────────────────────────

-- U1 leads TLR G1 (and G5, inactive); U2 leads TLR G2; U3 led G1 before (period
-- closed); U4 leads Transit G3; U5 leads TLR G4 with a paused servicio.
-- S20, S21 miembros of G1; S22 visitante of G1; S23 left G1; S24 miembro of G2;
-- S25 miembro of Transit G3; S26 miembro of G4; S27 miembro of inactive G5.
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Ut', CASE WHEN n < 20 THEN 'U' ELSE 'S' END || n, 'Soltero', 'Femenino'
  FROM (SELECT generate_series(1, 5) AS n UNION ALL SELECT generate_series(20, 27)) AS x;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Ut Campus', 'ZZUT1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true
  FROM (SELECT generate_series(1, 5) AS n UNION ALL SELECT generate_series(20, 27)) AS x
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Ut Experiencia'), (2, 1, 'estudiantes', 'ZZ Ut Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Ut Transit'), (5, 1, 'the_living_room', 'ZZ Ut The Living Room'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (10, 5, 'the_living_room', 'Grupos de Chicas'))
       AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 10), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'lider', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 10, 1), (2, 10, 1), (3, 10, 1), (4, 6, 2), (5, 10, 1)) AS v(n, e, r);

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', 1), n, n || 'º', pg_temp.id('eq', 3) FROM generate_series(1, 3) AS n;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, activo) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ut Zona Norte', NULL, true),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ut Zona Sur', NULL, true),
  (pg_temp.id('gr', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ut 1er año · Chicas', 1, true),
  (pg_temp.id('gr', 4), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ut Zona Este', NULL, true),
  (pg_temp.id('gr', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ut Zona Oeste', NULL, true);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde, hasta) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('se', 3), timestamptz '2025-01-01 12:00+00', timestamptz '2025-06-01 12:00+00'),
  (pg_temp.id('gr', 1), pg_temp.id('se', 1), timestamptz '2026-01-01 12:00+00', NULL),
  (pg_temp.id('gr', 2), pg_temp.id('se', 2), timestamptz '2026-01-01 12:00+00', NULL),
  (pg_temp.id('gr', 3), pg_temp.id('se', 4), timestamptz '2026-01-01 12:00+00', NULL),
  (pg_temp.id('gr', 4), pg_temp.id('se', 5), timestamptz '2026-01-01 12:00+00', NULL),
  (pg_temp.id('gr', 5), pg_temp.id('se', 1), timestamptz '2026-01-01 12:00+00', NULL);
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, activo, retirado_at)
SELECT pg_temp.id('gr', g), pg_temp.id('us', n), estado, activo, retirado
  FROM (VALUES (1, 20, 'miembro', true, NULL::timestamptz), (1, 21, 'miembro', true, NULL),
               (1, 22, 'visitante', true, NULL), (1, 23, 'miembro', false, timestamptz '2026-05-01 12:00+00'),
               (2, 24, 'miembro', true, NULL), (3, 25, 'miembro', true, NULL),
               (4, 26, 'miembro', true, NULL), (5, 27, 'miembro', true, NULL)) AS v(g, n, estado, activo, retirado);
-- G5 goes inactive after its members joined; U5's servicio is paused.
UPDATE public.estudiantes_grupos SET activo = false WHERE id = pg_temp.id('gr', 5);
UPDATE public.dream_team_servicios SET estado = 'en_pausa' WHERE id = pg_temp.id('se', 5);

-- ── d. the leader leads the miembros of their group ──────────────────

SELECT pg_temp.assert_eq('d: the TLR leader leads the miembros of the group, with its context',
  $q$SELECT pg_temp.dirigidos(1)$q$, 'S20:Estudiantes: ZZ Ut Zona Norte,S21:Estudiantes: ZZ Ut Zona Norte');
SELECT pg_temp.assert_eq('d: another TLR leader leads only their own group',
  $q$SELECT pg_temp.dirigidos(2)$q$, 'S24:Estudiantes: ZZ Ut Zona Sur');

-- ── n. who is left out ────────────────────────────────────────────────

SELECT pg_temp.assert_eq('n: a leader whose period closed leads nobody there',
  $q$SELECT pg_temp.dirigidos(3)$q$, '');
SELECT pg_temp.assert_eq('n: a Transit leader leads nobody through Estudiantes (minors)',
  $q$SELECT pg_temp.dirigidos(4)$q$, '');
SELECT pg_temp.assert_eq('n: a leader with a paused servicio leads nobody',
  $q$SELECT pg_temp.dirigidos(5)$q$, '');
SELECT pg_temp.assert_eq('n: no visitante, no member who left, no member of an inactive group',
  $q$SELECT count(*)::text FROM public.uno_a_uno_dirigidos_de(pg_temp.id('us', 1)) d
      WHERE d.usuario_id IN (pg_temp.id('us', 22), pg_temp.id('us', 23), pg_temp.id('us', 27))$q$, '0');
SELECT pg_temp.assert_eq('n: a member never leads themself',
  $q$SELECT pg_temp.dirigidos(20)$q$, '');

-- A leader who is also a member of their own group is not their own dirigido.
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado)
VALUES (pg_temp.id('gr', 2), pg_temp.id('us', 2), 'miembro');
SELECT pg_temp.assert_eq('n: the leader as a member of their own group is not their own dirigido',
  $q$SELECT pg_temp.dirigidos(2)$q$, 'S24:Estudiantes: ZZ Ut Zona Sur');

-- ── c. two contexts for one person ───────────────────────────────────

-- U1 also leads S20 through the Dream Team: S20 serves under U1 in the sub-área.
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 3), pg_temp.id('eq', 10), 'voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 20), pg_temp.id('us', 20), pg_temp.id('eq', 10), pg_temp.id('ro', 3), 'activo',
        timestamptz '2020-01-01 12:00+00', 'admin_asignacion');
SELECT pg_temp.assert_eq('c: a member also led through the Dream Team keeps both contexts, once',
  $q$SELECT d.usuario_id = pg_temp.id('us', 20) AND d.contextos @> ARRAY['Estudiantes: ZZ Ut Zona Norte']
            AND cardinality(d.contextos) >= 2
       FROM public.uno_a_uno_dirigidos_de(pg_temp.id('us', 1)) d WHERE d.usuario_id = pg_temp.id('us', 20)$q$,
  'true');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: still internal: service_role only',
  $q$SELECT has_function_privilege('authenticated', 'public.uno_a_uno_dirigidos_de(uuid)', 'EXECUTE')
            || '|' || has_function_privilege('anon', 'public.uno_a_uno_dirigidos_de(uuid)', 'EXECUTE')
            || '|' || has_function_privilege('service_role', 'public.uno_a_uno_dirigidos_de(uuid)', 'EXECUTE')$q$,
  'false|false|true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_ut_failures);
END;
$$;
