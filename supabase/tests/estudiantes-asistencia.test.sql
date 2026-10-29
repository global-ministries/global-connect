-- Estudiantes Phase B attendance (odd/tasks/estudiantes-fase-b.md, C1, S1–S10,
-- Q2–Q7; 20261029100000_estudiantes_asistencia_modelo.sql and
-- 20261029100100_estudiantes_asistencia_rpcs.sql).
--
-- Covers:
--   a. School scale: the Barquisimeto seed (1..6, 1–3 Transit, 4–6 Inside
--      Out, nodes resolved by path); a year whose ámbito is not an Estudiantes
--      node, a ficha year outside the scale and a final year before the
--      current one are refused; the final year defaults to the last of the
--      scale; a Transit group takes only Transit years, The Living Room none.
--   b. Visibility (Q3): a leader sees only their group, an entrenador and a
--      director de grupo their sub-área, the ámbito director the ámbito, a
--      director of Dirección de Estudiantes every ámbito, an unscoped
--      org.manage every group; a Logística coordinator or volunteer, an
--      aprendiz and a scoped org.manage of another branch see nothing; a
--      paused leader loses the group.
--   c. Roster: the leader sees their members with phone and the parent's
--      contact; another leader's group, Logística and anon are refused; anon
--      executes no function; the tables are closed to anon and authenticated.
--   d. Marking: upsert per tap (same state keeps who/when, one row), change,
--      clear; non-member, unknown state, wrong weekday, future date, missing
--      or foreign turno refused; The Living Room takes no turno; lugar.
--   e. Duplicate search (Q6): by normalized cédula (whole church), teléfono
--      and full name (campus only); the active group in the ámbito.
--   f. Visitor creation: person without account, normalized phone, ficha with
--      the group's year, representante as a person with the relation,
--      visitante membership, presente as visitor; cédula and teléfono / name
--      duplicates refused unless ignored; the representante is reused;
--      The Living Room takes no representante nor year; attach an existing
--      person; another campus refused.
--   g. "Confirmar como miembro" hint from the 3rd visit (Q6/L13).
--   h. Confirm a visitor as member.
--   i. One active group per ámbito (RPC and direct insert); another ámbito
--      allowed; removing frees the person.
--   j. Live view (Q5): counts per group, visitors of today with who marked
--      them; entrenador sees their sub-área, unscoped org.manage everything;
--      a leader, a scoped org.manage elsewhere and The Living Room refused.
--   k. Group management: director de grupo creates, renames, sets leaders
--      and deactivates in their sub-área only; entrenador and leader refused;
--      name, year, sub-área and leader-role validation; a Living Room group
--      keeps a regular weekly day and hour (T4, artboard 08), a Transit group
--      takes none, an hour needs its day.
--   l. Privileges: anon executes nothing; authenticated executes exactly the
--      public RPCs; RLS on every table and no table privilege.
--
-- Run against STAGING inside BEGIN…ROLLBACK as postgres. The last statement
-- is a SELECT of the failing cases ('ALL OK' when none). Everything that
-- touches the new tables or functions runs through EXECUTE inside an
-- exception-catching helper, so the RED run (migrations not applied) still
-- reaches the final SELECT and lists every case as failing.
--
-- Identities (usuario n = auth n): 1 LIDER_A (lider in Transit › Chicas,
-- leads G1), 2 LIDER_B (lider in Chicas, leads G2), 3 ENTRENADOR (Chicas),
-- 4 DIRGRUPO (director de grupo in Chicas), 5 DIRTRANSIT (dream_team.direct
-- on Transit), 6 DIRESTUD (dream_team.direct on Dirección de Estudiantes),
-- 7 COORD_LOG (dream_team.coordinate on Transit › Logística), 8 ADMIN
-- (unscoped dream_team.org.manage), 9 LIDER_TLR (lider in TLR › Chicas,
-- leads G5), 10 APRENDIZ (aprendiz in Chicas), 11 ORG_OTRA (org.manage scoped
-- to another root), 12 VOL_LOG (dream_team.serve on Logística).
-- People without account: 20 Ana, 21 Bea, 22 Carla (G1), 23 Dani (G2),
-- 24 Luis (G3), 25 Inés (G4), 26 Tomás (G5), 27 an existing person of campus
-- 1 in no group, 28 a person of campus 2, 40 Carla's parent.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit | 4 Inside Out | 5 TLR;
-- 3 › 6 Grupos de Chicas, 7 Grupos de Chicos, 8 Logística; 4 › 9 Grupos de
-- Chicas; 5 › 10 Grupos de Chicas; 11 another root.
-- Groups: G1 Chicas 1er año, G2 Chicas 2do año, G3 Chicos 1er año (Transit),
-- G4 IO Chicas 4to año, G5 TLR zona Norte. Turnos: 1 Sunday 9 and 2 Sunday 11
-- in campus 1, 3 Sunday 9 in campus 2.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ea_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ea_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ea_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a fixture statement; an error is a failing case, not an abort.
CREATE OR REPLACE FUNCTION pg_temp.exec(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ea_ctx WHERE k = p_k;
$$;

-- Last Sunday (today when today is Sunday), and n weeks before it.
CREATE OR REPLACE FUNCTION pg_temp.dom(p_semanas int DEFAULT 0) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('dom')::date - 7 * p_semanas;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tu(p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_n IS NULL THEN NULL ELSE pg_temp.id('tu', p_n) END;
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (new objects missing) still reaches the final SELECT.

-- The ZZ Ea groups the caller sees, by name: 'ZZ Ea G1,ZZ Ea G2'.
CREATE OR REPLACE FUNCTION pg_temp.mis() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(g.nombre, ',' ORDER BY g.nombre), '')
            FROM public.estudiantes_mis_grupos() g WHERE g.nombre LIKE 'ZZ Ea %');
END;
$$;

-- One flag of the caller's row for group p_g: 'soy_lider|puede_ver_vivo|puede_gestionar'.
CREATE OR REPLACE FUNCTION pg_temp.flags(p_g int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT g.soy_lider || '|' || g.puede_ver_vivo || '|' || g.puede_gestionar
            FROM public.estudiantes_mis_grupos() g WHERE g.grupo_id = pg_temp.id('gr', p_g));
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.lista(p_g int, p_fecha date, p_turno int) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.estudiantes_grupo_lista(pg_temp.id('gr', p_g), p_fecha, pg_temp.tu(p_turno));
END;
$$;

-- Roster names: 'Ana,Bea,Carla'.
CREATE OR REPLACE FUNCTION pg_temp.nombres(p_g int, p_fecha date, p_turno int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(p ->> 'nombre', ',' ORDER BY p ->> 'nombre'), '')
            FROM jsonb_array_elements(pg_temp.lista(p_g, p_fecha, p_turno) -> 'personas') p);
END;
$$;

-- One person of a roster.
CREATE OR REPLACE FUNCTION pg_temp.fila(p_g int, p_fecha date, p_turno int, p_persona uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT p FROM jsonb_array_elements(pg_temp.lista(p_g, p_fecha, p_turno) -> 'personas') p
           WHERE (p ->> 'persona_id')::uuid = p_persona);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.marcar(p_g int, p_fecha date, p_turno int, p_persona uuid, p_estado text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN coalesce(public.estudiantes_marcar(pg_temp.id('gr', p_g), p_fecha, pg_temp.tu(p_turno), p_persona, p_estado)
                  ->> 'estado', 'NULL');
END;
$$;

-- The stored mark of a person at group p_g's meeting: 'estado|era_visitante|marcado_por n' or 'none'.
-- Definer (postgres), so the impersonated callers can check what was stored.
CREATE OR REPLACE FUNCTION pg_temp.marca(p_g int, p_fecha date, p_turno int, p_persona uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN coalesce((
    SELECT a.estado || '|' || a.era_visitante || '|'
           || coalesce((SELECT n::text FROM generate_series(1, 12) n WHERE pg_temp.id('us', n) = a.marcado_por), '-')
      FROM public.estudiantes_asistencias a
      JOIN public.estudiantes_reuniones r ON r.id = a.reunion_id
     WHERE r.grupo_id = pg_temp.id('gr', p_g) AND r.fecha = p_fecha
       AND r.turno_id IS NOT DISTINCT FROM pg_temp.tu(p_turno) AND a.persona_id = p_persona), 'none');
END;
$$;

-- What matched for person p_persona in a search from group p_g ('{cedula,telefono}'), or 'none'.
CREATE OR REPLACE FUNCTION pg_temp.busca(p_g int, p_persona uuid, p_cedula text, p_telefono text, p_nombre text, p_apellido text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN coalesce((SELECT b.coincide::text FROM public.estudiantes_buscar_personas(pg_temp.id('gr', p_g), p_cedula, p_telefono, p_nombre, p_apellido) b
                    WHERE b.persona_id = p_persona), 'none');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.crear(p_g int, p_fecha date, p_turno int, p_datos jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.estudiantes_visitante_crear(pg_temp.id('gr', p_g), p_fecha, pg_temp.tu(p_turno), p_datos);
END;
$$;

-- Live view per group: 'name:presentes/ausentes/visitantes/sin_marcar,...'.
CREATE OR REPLACE FUNCTION pg_temp.vivo(p_ambito int, p_fecha date, p_turno int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg((g ->> 'nombre') || ':' || (g ->> 'presentes') || '/' || (g ->> 'ausentes') || '/'
                                     || (g ->> 'visitantes') || '/' || (g ->> 'sin_marcar'), ',' ORDER BY n), '')
            FROM jsonb_array_elements(public.estudiantes_en_vivo(pg_temp.id('eq', p_ambito), p_fecha, pg_temp.tu(p_turno)) -> 'grupos')
                 WITH ORDINALITY AS x(g, n));
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.guardar_ctx(p_k text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_ea_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: ' || p_k, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cu(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ea_ctx (k, v) VALUES
  ('dom', ((now() AT TIME ZONE 'America/Caracas')::date
           - extract(dow FROM (now() AT TIME ZONE 'America/Caracas')::date)::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ea-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 12) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ea', 'U' || n, 'ea-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 12) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, telefono, cedula) VALUES
  (pg_temp.id('us', 20), 'Zzea Ana', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 21), 'Zzea Bea', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 22), 'Zzea Carla', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 23), 'Zzea Dani', 'Dos', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 24), 'Zzea Luis', 'Tres', 'No especificado', 'Masculino', NULL, NULL),
  (pg_temp.id('us', 25), 'Zzea Ines', 'Cuatro', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 26), 'Zzea Tomas', 'Cinco', 'No especificado', 'Masculino', NULL, NULL),
  (pg_temp.id('us', 27), 'Zzea', 'Duplicada', 'No especificado', 'Femenino', '04269990027', 'E-99.887.766'),
  (pg_temp.id('us', 28), 'Zzea', 'Otrocampus', 'No especificado', 'Femenino', '04269990028', 'E99887767'),
  (pg_temp.id('us', 40), 'Zzea Papa', 'Uno', 'No especificado', 'Masculino', '04269990040', NULL);

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Ea Campus', 'ZZEA1'),
  (pg_temp.id('ca', 2), 'ZZ Ea Campus 2', 'ZZEA2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 28 THEN 2 ELSE 1 END), true
  FROM unnest(ARRAY[20, 21, 22, 23, 24, 25, 26, 27, 28, 40]) AS n;

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
VALUES (pg_temp.id('us', 22), pg_temp.id('us', 40), 'padre', true);

-- (n, parent, experiencia, label).
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Ea Experiencia'), (2, 1, 'estudiantes', 'ZZ Ea Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Ea Transit'), (4, 2, 'estudiantes', 'ZZ Ea Inside Out'),
               (5, 2, 'the_living_room', 'ZZ Ea TLR'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (7, 3, 'estudiantes', 'Grupos de Chicos'),
               (8, 3, 'estudiantes', 'Logística'), (9, 4, 'estudiantes', 'Grupos de Chicas'),
               (10, 5, 'the_living_room', 'Grupos de Chicas'),
               (11, 0, 'experiencia', 'ZZ Ea Otra Rama')) AS v(n, p, experiencia, label);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, nivel, true
  FROM (VALUES (1, 6, 'lider', 'lider'), (2, 6, 'entrenador', 'lider'), (3, 6, 'director de grupo', 'coordinador'),
               (4, 6, 'aprendiz', 'voluntario'), (5, 10, 'lider', 'lider')) AS v(n, e, label, nivel);

-- Servicio n belongs to person n.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 6, 1), (2, 6, 1), (3, 6, 2), (4, 6, 3), (9, 10, 5), (10, 6, 4)) AS v(n, e, r);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 5), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 6), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 7), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 8)::text),
  (pg_temp.id('us', 8), 'dream_team.org.manage', 'dream_team', 'experience', NULL),
  (pg_temp.id('us', 11), 'dream_team.org.manage', 'dream_team', 'equipo', pg_temp.id('eq', 11)::text),
  (pg_temp.id('us', 12), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 8)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Ea Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Ea Domingo 11', 0, '11:00', 2, true),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 2), 'ZZ Ea Otro Campus', 0, '09:00', 1, true);

SELECT pg_temp.exec('fixture: campus 1 scale',
  $q$INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
     SELECT pg_temp.id('ca', 1), n, n || 'º', pg_temp.id('eq', CASE WHEN n <= 3 THEN 3 ELSE 4 END)
       FROM generate_series(1, 6) AS n$q$);
SELECT pg_temp.exec('fixture: groups',
  $q$INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, zona) VALUES
       (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ea G1', 1, NULL),
       (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ea G2', 2, NULL),
       (pg_temp.id('gr', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 7), 'ZZ Ea G3', 1, NULL),
       (pg_temp.id('gr', 4), pg_temp.id('ca', 1), pg_temp.id('eq', 9), 'ZZ Ea G4', 4, NULL),
       (pg_temp.id('gr', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ea G5', NULL, ' Norte ')$q$);
SELECT pg_temp.exec('fixture: leaders',
  $q$INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES
       (pg_temp.id('gr', 1), pg_temp.id('se', 1)), (pg_temp.id('gr', 2), pg_temp.id('se', 2)),
       (pg_temp.id('gr', 5), pg_temp.id('se', 9))$q$);
SELECT pg_temp.exec('fixture: members',
  $q$INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde)
     SELECT pg_temp.id('gr', g), pg_temp.id('us', p), 'miembro', DATE '2026-01-04'
       FROM (VALUES (1, 20), (1, 21), (1, 22), (2, 23), (3, 24), (4, 25), (5, 26)) AS v(g, p)$q$);
SELECT pg_temp.exec('fixture: fichas',
  $q$INSERT INTO public.estudiantes_fichas (persona_id, campus_id, anio_actual)
     VALUES (pg_temp.id('us', 20), pg_temp.id('ca', 1), 1), (pg_temp.id('us', 22), pg_temp.id('ca', 1), 1)$q$);

GRANT INSERT, SELECT ON t_ea_failures, t_ea_ctx TO authenticated, anon;
GRANT UPDATE ON t_ea_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.exec(text, text), pg_temp.id(text, int),
  pg_temp.as_persona(int), pg_temp.as_anon(), pg_temp.ctx(text), pg_temp.dom(int), pg_temp.tu(int),
  pg_temp.mis(), pg_temp.flags(int), pg_temp.lista(int, date, int), pg_temp.nombres(int, date, int),
  pg_temp.fila(int, date, int, uuid), pg_temp.marcar(int, date, int, uuid, text),
  pg_temp.marca(int, date, int, uuid), pg_temp.busca(int, uuid, text, text, text, text),
  pg_temp.crear(int, date, int, jsonb), pg_temp.vivo(int, date, int), pg_temp.guardar_ctx(text, text),
  pg_temp.cu(text)
  TO authenticated, anon;

-- ── a. school scale ──────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: Barquisimeto is seeded 1..6, 1–3 Transit, 4–6 Inside Out, by path',
  $q$SELECT string_agg(e.numero || ':' || e.etiqueta || ':' || a.label, ',' ORDER BY e.numero)
       FROM public.estudiantes_escala e
       JOIN public.dream_team_equipos a ON a.id = e.ambito_id
       JOIN public.dream_team_equipos d ON d.id = a.parent_equipo_id AND d.label = 'Dirección de Estudiantes'
       JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id AND x.label = 'Dirección de Experiencia'
                                       AND x.parent_equipo_id IS NULL
      WHERE e.campus_id = 'a0000000-0000-0000-0000-000000000001'$q$,
  '1:1er año:Transit,2:2do año:Transit,3:3er año:Transit,4:4to año:Inside Out,5:5to año:Inside Out,6:6to año:Inside Out');
SELECT pg_temp.assert_raises('a: a year whose ámbito is not an Estudiantes node is refused',
  $q$INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
     VALUES (pg_temp.id('ca', 2), 1, '1º', pg_temp.id('eq', 5))$q$, '22023', 'ambito_invalido');
SELECT pg_temp.assert_raises('a: a ficha year outside the campus scale is refused',
  $q$INSERT INTO public.estudiantes_fichas (persona_id, campus_id, anio_actual, anio_final)
     VALUES (pg_temp.id('us', 21), pg_temp.id('ca', 1), 9, 9)$q$, '23503');
SELECT pg_temp.assert_eq('a: the final year defaults to the last of the scale',
  $q$SELECT anio_actual || '-' || anio_final FROM public.estudiantes_fichas WHERE persona_id = pg_temp.id('us', 20)$q$, '1-6');
SELECT pg_temp.assert_raises('a: a final year before the current one is refused',
  $q$UPDATE public.estudiantes_fichas SET anio_actual = 5, anio_final = 4 WHERE persona_id = pg_temp.id('us', 20)$q$, '23514');
SELECT pg_temp.assert_eq('a: the group trigger derived the ámbito and trimmed zona',
  $q$SELECT (ambito_id = pg_temp.id('eq', 3)) || ',' || (SELECT zona FROM public.estudiantes_grupos WHERE id = pg_temp.id('gr', 5))
       FROM public.estudiantes_grupos WHERE id = pg_temp.id('gr', 1)$q$, 'true,Norte');
SELECT pg_temp.assert_raises('a: a Transit group with an Inside Out year is refused',
  $q$INSERT INTO public.estudiantes_grupos (campus_id, subarea_id, nombre, anio)
     VALUES (pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ea X', 4)$q$, '23503');
SELECT pg_temp.assert_raises('a: a Transit group without a year is refused',
  $q$INSERT INTO public.estudiantes_grupos (campus_id, subarea_id, nombre) VALUES (pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Ea X')$q$,
  '22023', 'anio_invalido');
SELECT pg_temp.assert_raises('a: a Living Room group with a year is refused',
  $q$INSERT INTO public.estudiantes_grupos (campus_id, subarea_id, nombre, anio) VALUES (pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Ea X', 1)$q$,
  '22023', 'anio_invalido');
SELECT pg_temp.assert_raises('a: a group under a sub-área that is not Grupos de Chicas / Chicos is refused',
  $q$INSERT INTO public.estudiantes_grupos (campus_id, subarea_id, nombre, anio) VALUES (pg_temp.id('ca', 1), pg_temp.id('eq', 8), 'ZZ Ea X', 1)$q$,
  '22023', 'subarea_invalida');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: a signed-in user reads the campus scale',
  $q$SELECT string_agg(numero || ':' || (ambito_id = pg_temp.id('eq', CASE WHEN numero <= 3 THEN 3 ELSE 4 END)), ',' ORDER BY numero)
       FROM public.estudiantes_escala_campus(pg_temp.id('ca', 1))$q$, '1:true,2:true,3:true,4:true,5:true,6:true');
RESET ROLE;

-- ── b. visibility (Q3) ───────────────────────────────────────────────

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: a leader sees only their group', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1');
SELECT pg_temp.assert_eq('b: a leader leads, no live view, no management', $q$SELECT pg_temp.flags(1)$q$, 'true|false|false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: the other leader sees only theirs', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G2');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b: the entrenador sees every group of the sub-área', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G2');
SELECT pg_temp.assert_eq('b: the entrenador gets the live view, no management', $q$SELECT pg_temp.flags(2)$q$, 'false|true|false');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b: the director de grupo sees the sub-área', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G2');
SELECT pg_temp.assert_eq('b: the director de grupo manages', $q$SELECT pg_temp.flags(1)$q$, 'false|true|true');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b: the ámbito director sees the whole ámbito', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G2,ZZ Ea G3');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('b: a director of Dirección de Estudiantes sees every ámbito',
  $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G2,ZZ Ea G3,ZZ Ea G4,ZZ Ea G5');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('b: an unscoped org.manage sees every group',
  $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G2,ZZ Ea G3,ZZ Ea G4,ZZ Ea G5');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('b: the TLR leader sees their TLR group', $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G5');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('b: a Logística coordinator sees nothing', $q$SELECT pg_temp.mis()$q$, '');
SELECT pg_temp.as_persona(12);
SELECT pg_temp.assert_eq('b: a Logística volunteer sees nothing', $q$SELECT pg_temp.mis()$q$, '');
SELECT pg_temp.as_persona(10);
SELECT pg_temp.assert_eq('b: an aprendiz of the sub-área sees nothing', $q$SELECT pg_temp.mis()$q$, '');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_eq('b: an org.manage scoped to another branch sees nothing', $q$SELECT pg_temp.mis()$q$, '');

RESET ROLE;
SELECT pg_temp.exec('fixture: pause the servicio of LIDER_B',
  $q$UPDATE public.dream_team_servicios SET estado = 'en_pausa' WHERE id = pg_temp.id('se', 2)$q$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b: a paused leader loses the group', $q$SELECT pg_temp.mis()$q$, '');
RESET ROLE;

-- ── c. roster ────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the leader sees their members',
  $q$SELECT pg_temp.nombres(1, pg_temp.dom(), 1)$q$, 'Zzea Ana,Zzea Bea,Zzea Carla');
SELECT pg_temp.assert_eq('c: the leader sees the parent''s contact',
  $q$SELECT r ->> 'nombre' || '|' || (r ->> 'telefono') || '|' || (r ->> 'tipo')
       FROM jsonb_array_elements(pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.id('us', 22)) -> 'representantes') r$q$,
  'Zzea Papa|04269990040|padre');
SELECT pg_temp.assert_eq('c: the roster carries año and no mark yet',
  $q$SELECT (f ->> 'anio_etiqueta') || '|' || coalesce(f ->> 'marca', 'null') || '|' || (f ->> 'visitas')
       FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.id('us', 20)) f$q$, '1º|null|0');
SELECT pg_temp.assert_eq('c: reading creates no meeting',
  $q$SELECT coalesce(pg_temp.lista(1, pg_temp.dom(), 1) ->> 'reunion_id', 'null')$q$, 'null');
SELECT pg_temp.assert_raises('c: a leader cannot read another leader''s group',
  $q$SELECT pg_temp.lista(3, pg_temp.dom(), 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: the entrenador reads another group of the sub-área',
  $q$SELECT pg_temp.nombres(2, pg_temp.dom(), 1)$q$, 'Zzea Dani');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('c: a Logística coordinator cannot read a roster',
  $q$SELECT pg_temp.lista(1, pg_temp.dom(), 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c: authenticated cannot read the tables directly',
  $q$SELECT count(*) FROM public.estudiantes_grupo_miembros$q$, '42501');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();
SELECT pg_temp.assert_raises('c: anon cannot call the roster',
  $q$SELECT public.estudiantes_grupo_lista(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1))$q$, '42501');
SELECT pg_temp.assert_raises('c: anon cannot list groups',
  $q$SELECT * FROM public.estudiantes_mis_grupos()$q$, '42501');
SELECT pg_temp.assert_raises('c: anon cannot read the tables',
  $q$SELECT count(*) FROM public.estudiantes_fichas$q$, '42501');
RESET ROLE;

-- ── d. marking ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('d: a tap marks presente',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 20), 'presente') || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 20))$q$,
  'presente#presente|false|1');
RESET ROLE;
SELECT pg_temp.guardar_ctx('marcado_at_20',
  $q$SELECT a.marcado_at::text FROM public.estudiantes_asistencias a WHERE a.persona_id = pg_temp.id('us', 20)$q$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('d: tapping the same state again keeps one row, who and when',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 20), 'presente') || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 20))$q$,
  'presente#presente|false|1');
SELECT pg_temp.as_persona(1);
RESET ROLE;
SELECT pg_temp.assert_eq('d: one row per person and meeting, marcado_at unchanged',
  $q$SELECT count(*) || '|' || (max(a.marcado_at)::text = pg_temp.ctx('marcado_at_20'))
       FROM public.estudiantes_asistencias a WHERE a.persona_id = pg_temp.id('us', 20)$q$, '1|true');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: a tap changes the mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 20), 'ausente') || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 20))$q$,
  'ausente#ausente|false|1');
SELECT pg_temp.assert_eq('d: NULL clears the mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 20), NULL) || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 20))$q$,
  'NULL#none');
SELECT pg_temp.assert_eq('d: clearing twice is harmless',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 20), NULL)$q$, 'NULL');
SELECT pg_temp.assert_eq('d: Bea presente',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 21), 'presente')$q$, 'presente');
SELECT pg_temp.assert_eq('d: Carla ausente',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 22), 'ausente')$q$, 'ausente');
SELECT pg_temp.assert_eq('d: the roster shows the mark and the meeting',
  $q$SELECT (pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.id('us', 21)) ->> 'marca') || '|' || (pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.id('us', 21)) ->> 'visitas')
       || '|' || (pg_temp.lista(1, pg_temp.dom(), 1) ->> 'reunion_id' IS NOT NULL)$q$, 'presente|1|true');
SELECT pg_temp.assert_raises('d: a person of another group is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 23), 'presente')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: an unknown state is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 21), 'justificado')$q$, '22023', 'estado_invalido');
SELECT pg_temp.assert_raises('d: a day the turno does not happen is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom() - 6, 1, pg_temp.id('us', 21), 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('d: a future date is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(-1), 1, pg_temp.id('us', 21), 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('d: Transit without turno is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), NULL, pg_temp.id('us', 21), 'presente')$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('d: a turno of another campus is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 3, pg_temp.id('us', 21), 'presente')$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('d: a leader cannot mark another group',
  $q$SELECT pg_temp.marcar(3, pg_temp.dom(), 1, pg_temp.id('us', 24), 'presente')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: the entrenador marks in a group of the sub-área',
  $q$SELECT pg_temp.marcar(2, pg_temp.dom(), 1, pg_temp.id('us', 23), 'presente') || '#' || pg_temp.marca(2, pg_temp.dom(), 1, pg_temp.id('us', 23))$q$,
  'presente#presente|false|3');

SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('d: The Living Room marks on its own weekday without turno',
  $q$SELECT pg_temp.marcar(5, pg_temp.dom() - 4, NULL, pg_temp.id('us', 26), 'presente') || '#' || pg_temp.marca(5, pg_temp.dom() - 4, NULL, pg_temp.id('us', 26))$q$,
  'presente#presente|false|9');
SELECT pg_temp.assert_raises('d: The Living Room takes no turno',
  $q$SELECT pg_temp.marcar(5, pg_temp.dom(), 1, pg_temp.id('us', 26), 'presente')$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_eq('d: The Living Room meeting keeps a lugar',
  $q$SELECT (public.estudiantes_reunion_guardar(pg_temp.id('gr', 5), pg_temp.dom() - 4, NULL, '  Casa de Tomás ') IS NOT NULL)
       || '|' || (pg_temp.lista(5, pg_temp.dom() - 4, NULL) ->> 'lugar')
       || '|' || (SELECT count(*) FROM jsonb_array_elements(pg_temp.lista(5, pg_temp.dom() - 4, NULL) -> 'personas'))$q$,
  'true|Casa de Tomás|1');

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('d: a Logística coordinator cannot mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(), 1, pg_temp.id('us', 21), 'ausente')$q$, '42501', 'sin_autoridad');
RESET ROLE;

-- ── e. duplicate search (Q6) ─────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: by cédula in another spelling',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 27), 'e 99887766', NULL, NULL, NULL)$q$, '{cedula}');
SELECT pg_temp.assert_eq('e: by teléfono in another spelling',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 27), NULL, '+58 426-999.0027', NULL, NULL)$q$, '{telefono}');
SELECT pg_temp.assert_eq('e: by full name, ignoring case and accents',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 27), NULL, NULL, 'ZZEA', 'Dúplicada')$q$, '{nombre}');
SELECT pg_temp.assert_eq('e: every criterion that matched',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 27), 'E99887766', '04269990027', 'Zzea', 'Duplicada')$q$, '{cedula,nombre,telefono}');
SELECT pg_temp.assert_eq('e: a person of another campus is not found by name nor teléfono',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 28), NULL, '04269990028', 'Zzea', 'Otrocampus')$q$, 'none');
SELECT pg_temp.assert_eq('e: a cédula is found in the whole church',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 28), 'E-99.887.767', NULL, NULL, NULL)$q$, '{cedula}');
SELECT pg_temp.assert_eq('e: a member shows their active group in the ámbito',
  $q$SELECT b.grupo || '|' || b.en_este_grupo FROM public.estudiantes_buscar_personas(pg_temp.id('gr', 1), NULL, NULL, 'Zzea Ana', 'Uno') b
      WHERE b.persona_id = pg_temp.id('us', 20)$q$, 'ZZ Ea G1|true');
SELECT pg_temp.assert_eq('e: only minimal fields come back',
  $q$SELECT pg_get_function_result('public.estudiantes_buscar_personas(uuid, text, text, text, text)'::regprocedure)$q$,
  'TABLE(persona_id uuid, nombre text, apellido text, coincide text[], grupo_id uuid, grupo text, en_este_grupo boolean)');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('e: a Logística coordinator cannot search',
  $q$SELECT pg_temp.busca(1, pg_temp.id('us', 27), 'E99887766', NULL, NULL, NULL)$q$, '42501', 'sin_autoridad');
RESET ROLE;

-- ── f. visitor creation ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar_ctx('v1',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, jsonb_build_object(
       'nombre', 'Zzea', 'apellido', 'Nueva', 'genero', 'Femenino', 'telefono', '0412 999 0101',
       'representante', jsonb_build_object('nombre', 'Zzea Mama', 'apellido', 'Nueva', 'telefono', '0412-999-0102',
                                           'genero', 'Femenino'))) ->> 'persona_id'$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f: the visitor is a person without account, normalized phone',
  $q$SELECT nombre || '|' || apellido || '|' || telefono || '|' || estado_civil || '|' || genero || '|' || (auth_id IS NULL)
       FROM public.usuarios WHERE id = pg_temp.cu('v1')$q$, 'Zzea|Nueva|04129990101|No especificado|Femenino|true');
SELECT pg_temp.assert_eq('f: the visitor belongs to the group''s campus',
  $q$SELECT string_agg(campus_id::text, ',') FROM public.usuario_campus WHERE usuario_id = pg_temp.cu('v1')$q$,
  pg_temp.id('ca', 1)::text);
SELECT pg_temp.assert_eq('f: the ficha takes the group''s year and the last year of the scale',
  $q$SELECT anio_actual || '-' || anio_final || '|' || (campus_id = pg_temp.id('ca', 1)) FROM public.estudiantes_fichas WHERE persona_id = pg_temp.cu('v1')$q$,
  '1-6|true');
SELECT pg_temp.assert_eq('f: the representante is a person linked as padre, principal',
  $q$SELECT u.nombre || '|' || u.telefono || '|' || r.tipo_relacion || '|' || r.es_principal
       FROM public.relaciones_usuarios r JOIN public.usuarios u ON u.id = r.usuario2_id
      WHERE r.usuario1_id = pg_temp.cu('v1')$q$, 'Zzea Mama|04129990102|padre|true');
SELECT pg_temp.assert_eq('f: the visitor joined as visitante from that Sunday',
  $q$SELECT estado || '|' || (desde = pg_temp.dom()) || '|' || activo FROM public.estudiantes_grupo_miembros
      WHERE persona_id = pg_temp.cu('v1') AND grupo_id = pg_temp.id('gr', 1)$q$, 'visitante|true|true');
SELECT pg_temp.assert_eq('f: and is marked presente as a visitor by the leader',
  $q$SELECT pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.cu('v1'))$q$, 'presente|true|1');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('f: a registered cédula is refused',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"Zzea","apellido":"Otra","genero":"Femenino","cedula":"E 99.887.766"}')$q$,
  '23505', 'cedula_existente');
SELECT pg_temp.assert_raises('f: a phone match is refused until ignored',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"Zzea","apellido":"Hermana","genero":"Femenino","telefono":"04269990027"}')$q$,
  '23505', 'posibles_duplicados');
SELECT pg_temp.assert_raises('f: a full-name match is refused until ignored',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"zzea","apellido":"DUPLICADA","genero":"Femenino"}')$q$,
  '23505', 'posibles_duplicados');
SELECT pg_temp.guardar_ctx('v3',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1,
       '{"nombre":"Zzea","apellido":"Hermana","genero":"Femenino","telefono":"04269990027","ignorar_coincidencias":true}') ->> 'persona_id'$q$);
SELECT pg_temp.assert_eq('f: ignoring the matches creates the visitor',
  $q$SELECT pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.cu('v3'))$q$, 'presente|true|1');
SELECT pg_temp.guardar_ctx('v2',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, jsonb_build_object(
       'nombre', 'Zzea', 'apellido', 'Nueva Dos', 'genero', 'Femenino',
       'representante', jsonb_build_object('nombre', 'ZZEA MAMÁ', 'apellido', 'nueva', 'telefono', '04129990102'))) ->> 'persona_id'$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f: a sibling reuses the representante found by phone and name',
  $q$SELECT count(DISTINCT r.usuario2_id) || '|' || count(*) FROM public.relaciones_usuarios r
      WHERE r.usuario1_id IN (pg_temp.cu('v1'), pg_temp.cu('v2'))$q$, '1|2');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('f: the gender is required',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"Zzea","apellido":"Singenero"}')$q$, '22023', 'genero_requerido');
SELECT pg_temp.assert_raises('f: a representante without phone is refused',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"Zzea","apellido":"Sinrep","genero":"Femenino","representante":{"nombre":"X"}}')$q$,
  '22023', 'representante_incompleto');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('f: The Living Room takes no representante',
  $q$SELECT pg_temp.crear(5, pg_temp.dom() - 4, NULL, '{"nombre":"Zzea","apellido":"Tlr","genero":"Masculino","representante":{"nombre":"X","telefono":"04269990999"}}')$q$,
  '22023', 'representante_no_aplica');
SELECT pg_temp.assert_raises('f: The Living Room takes no school year',
  $q$SELECT pg_temp.crear(5, pg_temp.dom() - 4, NULL, '{"nombre":"Zzea","apellido":"Tlr","genero":"Masculino","anio":1}')$q$,
  '22023', 'anio_invalido');
SELECT pg_temp.guardar_ctx('vtlr',
  $q$SELECT pg_temp.crear(5, pg_temp.dom() - 4, NULL, '{"nombre":"Zzea","apellido":"Tlr","genero":"Masculino","telefono":"04269990555"}') ->> 'persona_id'$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f: a Living Room visitor has a ficha without year',
  $q$SELECT coalesce(anio_actual::text, 'null') || '|' || coalesce(anio_final::text, 'null') FROM public.estudiantes_fichas WHERE persona_id = pg_temp.cu('vtlr')$q$,
  'null|null');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('f: a Logística coordinator cannot register a visitor',
  $q$SELECT pg_temp.crear(1, pg_temp.dom(), 1, '{"nombre":"Zzea","apellido":"Nadie","genero":"Femenino"}')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: an existing person found by the search is added as visitante and marked',
  $q$SELECT public.estudiantes_visitante_agregar(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.id('us', 27)) ->> 'estado'
       || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 27))$q$, 'visitante#presente|true|1');
SELECT pg_temp.assert_eq('f: adding an active member keeps them as miembro',
  $q$SELECT public.estudiantes_visitante_agregar(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.id('us', 20)) ->> 'estado'
       || '#' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 20))$q$, 'miembro#presente|false|1');
SELECT pg_temp.assert_raises('f: a person of another campus cannot be added',
  $q$SELECT public.estudiantes_visitante_agregar(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.id('us', 28))$q$,
  '22023', 'persona_invalida');
RESET ROLE;

-- ── j. live view (state of G1..G3 on dom, turno 1) ───────────────────
-- G1: presentes 21, 20, v1, v2, v3, 27 (four visitors); ausente 22.
-- G2: presente 23. G3: no meeting, 24 unmarked.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('j: the ámbito director sees counts per group',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, 'ZZ Ea G1:6/1/4/0,ZZ Ea G2:1/0/0/0,ZZ Ea G3:0/0/0/1');
SELECT pg_temp.assert_eq('j: today''s visitors with who marked them',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE v ->> 'registrado_por' = 'ZZ Ea U1')
       || '|' || bool_and((v ->> 'es_nuevo')::boolean)
       FROM jsonb_array_elements(public.estudiantes_en_vivo(pg_temp.id('eq', 3), pg_temp.dom(), pg_temp.id('tu', 1)) -> 'visitantes_hoy') v$q$,
  '4|4|true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('j: the entrenador sees only their sub-área',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, 'ZZ Ea G1:6/1/4/0,ZZ Ea G2:1/0/0/0');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('j: an unscoped org.manage sees the whole ámbito',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, 'ZZ Ea G1:6/1/4/0,ZZ Ea G2:1/0/0/0,ZZ Ea G3:0/0/0/1');
SELECT pg_temp.assert_eq('j: another turno has no marks',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 2)$q$, 'ZZ Ea G1:0/0/0/7,ZZ Ea G2:0/0/0/1,ZZ Ea G3:0/0/0/1');
SELECT pg_temp.assert_raises('j: The Living Room has no live view',
  $q$SELECT pg_temp.vivo(5, pg_temp.dom(), NULL)$q$, '22023', 'ambito_invalido');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_raises('j: an org.manage scoped to another branch is refused',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('j: a leader has no live view',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('j: a Logística coordinator has no live view',
  $q$SELECT pg_temp.vivo(3, pg_temp.dom(), 1)$q$, '42501', 'sin_autoridad');
RESET ROLE;

-- ── g. 3rd-visit hint (Q6/L13) ───────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: first visit, no hint',
  $q$SELECT (f ->> 'visitas') || '|' || (f ->> 'sugerir_confirmar') FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.cu('v1')) f$q$, '1|false');
SELECT pg_temp.exec('fixture: v1 present two Sundays before',
  $q$SELECT pg_temp.marcar(1, pg_temp.dom(2), 1, pg_temp.cu('v1'), 'presente')$q$);
SELECT pg_temp.assert_eq('g: the second visit gives no hint yet',
  $q$SELECT (f ->> 'visitas') || '|' || (f ->> 'sugerir_confirmar') FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.cu('v1')) f$q$, '2|false');
SELECT pg_temp.assert_eq('g: the third visit suggests confirming (also in the mark answer)',
  $q$SELECT public.estudiantes_marcar(pg_temp.id('gr', 1), pg_temp.dom(1), pg_temp.id('tu', 1), pg_temp.cu('v1'), 'presente') ->> 'visitas'
       || '|' || ((SELECT f ->> 'visitas' FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.cu('v1')) f))
       || '|' || ((SELECT f ->> 'sugerir_confirmar' FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.cu('v1')) f))$q$, '2|3|true');
SELECT pg_temp.assert_eq('g: the roster of an earlier Sunday counts the visits up to it',
  $q$SELECT (f ->> 'visitas') || '|' || (f ->> 'sugerir_confirmar') FROM pg_temp.fila(1, pg_temp.dom(1), 1, pg_temp.cu('v1')) f$q$, '2|false');

-- ── h. confirm as member ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('h: the leader confirms the visitor',
  $q$SELECT public.estudiantes_confirmar_miembro(pg_temp.id('gr', 1), pg_temp.cu('v1'))::text
       || '|' || public.estudiantes_confirmar_miembro(pg_temp.id('gr', 1), pg_temp.cu('v1'))::text$q$, 'true|false');
SELECT pg_temp.assert_eq('h: the roster shows a member and no hint',
  $q$SELECT (f ->> 'estado') || '|' || (f ->> 'sugerir_confirmar') FROM pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.cu('v1')) f$q$, 'miembro|false');
SELECT pg_temp.assert_raises('h: a person outside the group is refused',
  $q$SELECT public.estudiantes_confirmar_miembro(pg_temp.id('gr', 1), pg_temp.id('us', 23))$q$, '22023', 'persona_invalida');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('h: a Logística coordinator cannot confirm',
  $q$SELECT public.estudiantes_confirmar_miembro(pg_temp.id('gr', 1), pg_temp.cu('v3'))$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('h: who confirmed and when is kept; the past mark stays a visitor''s',
  $q$SELECT (confirmado_por = pg_temp.id('us', 1)) || '|' || (confirmado_at IS NOT NULL) || '|' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.cu('v1'))
       FROM public.estudiantes_grupo_miembros WHERE persona_id = pg_temp.cu('v1') AND grupo_id = pg_temp.id('gr', 1)$q$,
  'true|true|presente|true|1');

-- ── i. one active group per ámbito ───────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('i: a member of G1 cannot join G2 of the same ámbito',
  $q$SELECT public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 2), pg_temp.id('us', 20), 'miembro')$q$, '23505', 'persona_en_otro_grupo');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('i: they can join a group of another ámbito',
  $q$SELECT (public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 4), pg_temp.id('us', 20)) IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('i: removing frees the person for another group',
  $q$SELECT public.estudiantes_grupo_miembro_quitar(pg_temp.id('gr', 1), pg_temp.id('us', 21))::text || '|'
       || (public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 2), pg_temp.id('us', 21)) IS NOT NULL)$q$, 'true|true');
SELECT pg_temp.assert_eq('i: the removed member leaves the roster, their mark stays',
  $q$SELECT (pg_temp.fila(1, pg_temp.dom(), 1, pg_temp.id('us', 21)) IS NULL) || '|' || pg_temp.marca(1, pg_temp.dom(), 1, pg_temp.id('us', 21))$q$,
  'true|presente|false|1');
SELECT pg_temp.assert_raises('i: an unknown estado is refused',
  $q$SELECT public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 2), pg_temp.id('us', 27), 'lider')$q$, '22023', 'estado_invalido');
RESET ROLE;
SELECT pg_temp.assert_raises('i: a direct second active membership in the ámbito is refused',
  $q$INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id) VALUES (pg_temp.id('gr', 3), pg_temp.id('us', 22))$q$, '23505');

-- ── k. group management ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.guardar_ctx('g6',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), '  ZZ Ea G6 ', 3)::text$q$);
SELECT pg_temp.assert_eq('k: the director de grupo creates a group in their sub-área',
  $q$SELECT g.grupo_id::text || '|' || g.nombre || '|' || g.anio || '|' || (g.ambito_id = pg_temp.id('eq', 3))
       FROM public.estudiantes_mis_grupos() g WHERE g.grupo_id = pg_temp.cu('g6')$q$, pg_temp.ctx('g6') || '|ZZ Ea G6|3|true');
SELECT pg_temp.assert_raises('k: not in another sub-área',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 7), pg_temp.id('ca', 1), 'ZZ Ea X', 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('k: a duplicate active name is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), 'zz ea g1', 1)$q$, '23505', 'nombre_duplicado');
SELECT pg_temp.assert_raises('k: an Inside Out year in Transit is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), 'ZZ Ea X', 4)$q$, '22023', 'anio_invalido');
SELECT pg_temp.assert_raises('k: a blank name is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), '  ', 1)$q$, '22023', 'nombre_invalido');
SELECT pg_temp.assert_eq('k: the leaders the sub-área offers (no aprendiz, no paused)',
  $q$SELECT string_agg(apellido || ':' || rol, ',' ORDER BY apellido) FROM public.estudiantes_lideres_disponibles(pg_temp.id('eq', 6))$q$,
  'U1:lider,U3:entrenador,U4:director de grupo');
SELECT pg_temp.assert_eq('k: setting the leaders',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.cu('g6'), ARRAY[pg_temp.id('se', 1), pg_temp.id('se', 3), pg_temp.id('se', 1)])::text$q$, '2');
SELECT pg_temp.assert_raises('k: an aprendiz cannot lead',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.cu('g6'), ARRAY[pg_temp.id('se', 10)])$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('k: a leader of another sub-área cannot lead',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.cu('g6'), ARRAY[pg_temp.id('se', 9)])$q$, '22023', 'servicio_invalido');
SELECT pg_temp.exec('k: renaming',
  $q$SELECT public.estudiantes_grupo_editar(pg_temp.cu('g6'), 'ZZ Ea G6b', 3, NULL, NULL, NULL)$q$);
SELECT pg_temp.assert_eq('k: the group is renamed',
  $q$SELECT EXISTS (SELECT 1 FROM public.estudiantes_mis_grupos() g WHERE g.grupo_id = pg_temp.cu('g6') AND g.nombre = 'ZZ Ea G6b')::text$q$, 'true');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('k: the new leader sees the new group',
  $q$SELECT pg_temp.mis()$q$, 'ZZ Ea G1,ZZ Ea G6b');
SELECT pg_temp.assert_raises('k: a leader cannot create groups',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), 'ZZ Ea X', 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('k: a leader cannot set leaders',
  $q$SELECT public.estudiantes_grupo_lideres_fijar(pg_temp.id('gr', 1), ARRAY[]::uuid[])$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('k: the entrenador cannot create groups',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), 'ZZ Ea X', 1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('k: the entrenador cannot add members',
  $q$SELECT public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 3), pg_temp.id('us', 27))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_raises('k: a group under Logística is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 8), pg_temp.id('ca', 1), 'ZZ Ea X', 1)$q$, '22023', 'subarea_invalida');
SELECT pg_temp.guardar_ctx('g7',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 10), pg_temp.id('ca', 1), 'ZZ Ea G7', NULL, 'Este', 4, '19:00')::text$q$);
SELECT pg_temp.assert_eq('k: The Living Room group by zona with its weekly day and hour',
  $q$SELECT g.zona || '|' || g.dia_semana || '|' || g.hora || '|' || coalesce(g.anio::text, 'null')
       FROM public.estudiantes_mis_grupos() g WHERE g.grupo_id = pg_temp.cu('g7')$q$, 'Este|4|19:00:00|null');
SELECT pg_temp.assert_raises('k: a Transit group takes no weekly day (it meets in the turno)',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 6), pg_temp.id('ca', 1), 'ZZ Ea X', 1, NULL, 0, NULL)$q$,
  '22023', 'horario_invalido');
SELECT pg_temp.assert_raises('k: an hour without its day is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 10), pg_temp.id('ca', 1), 'ZZ Ea X', NULL, NULL, NULL, '19:00')$q$,
  '22023', 'horario_invalido');
SELECT pg_temp.assert_raises('k: a day outside 0..6 is refused',
  $q$SELECT public.estudiantes_grupo_crear(pg_temp.id('eq', 10), pg_temp.id('ca', 1), 'ZZ Ea X', NULL, NULL, 7, NULL)$q$,
  '22023', 'horario_invalido');
SELECT pg_temp.exec('k: editing the weekly day and hour of a Living Room group',
  $q$SELECT public.estudiantes_grupo_editar(pg_temp.id('gr', 5), 'ZZ Ea G5', NULL, 'Norte', 2, '18:30')$q$);
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('k: the TLR leader reads the weekly day and hour in the roster',
  $q$SELECT (l -> 'grupo' ->> 'dia_semana') || '|' || (l -> 'grupo' ->> 'hora') || '|' || (l -> 'grupo' ->> 'zona')
       FROM pg_temp.lista(5, pg_temp.dom() - 4, NULL) l$q$, '2|18:30:00|Norte');
SELECT pg_temp.assert_raises('k: the TLR leader cannot edit the group',
  $q$SELECT public.estudiantes_grupo_editar(pg_temp.id('gr', 5), 'ZZ Ea G5', NULL, 'Norte', 3, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.exec('fixture: v3 joins G6',
  $q$SELECT public.estudiantes_grupo_miembro_quitar(pg_temp.id('gr', 1), pg_temp.cu('v3')),
            public.estudiantes_grupo_miembro_agregar(pg_temp.cu('g6'), pg_temp.cu('v3'), 'visitante')$q$);
SELECT pg_temp.exec('k: deactivating',
  $q$SELECT public.estudiantes_grupo_activar(pg_temp.cu('g6'), false)$q$);
SELECT pg_temp.assert_eq('k: deactivating hides the group and frees its members',
  $q$SELECT (NOT EXISTS (SELECT 1 FROM public.estudiantes_mis_grupos() g WHERE g.grupo_id = pg_temp.cu('g6'))
       AND EXISTS (SELECT 1 FROM public.estudiantes_mis_grupos(true) g WHERE g.grupo_id = pg_temp.cu('g6') AND NOT g.activo)
       AND public.estudiantes_grupo_miembro_agregar(pg_temp.id('gr', 1), pg_temp.cu('v3'), 'visitante') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_raises('k: an inactive group takes no members',
  $q$SELECT public.estudiantes_grupo_miembro_agregar(pg_temp.cu('g6'), pg_temp.id('us', 27))$q$, '22023', 'grupo_invalido');
SELECT pg_temp.assert_raises('k: an inactive group takes no marks',
  $q$SELECT public.estudiantes_marcar(pg_temp.cu('g6'), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.cu('v3'), 'presente')$q$, '22023', 'grupo_invalido');
RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: anon executes no estudiantes function',
  $q$SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE')$q$, '0');
SELECT pg_temp.assert_eq('l: authenticated executes exactly the public RPCs',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_%' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')$q$,
  'estudiantes_buscar_personas,estudiantes_confirmar_miembro,estudiantes_en_vivo,estudiantes_escala_campus,'
  || 'estudiantes_ficha_guardar,estudiantes_grupo_activar,estudiantes_grupo_crear,estudiantes_grupo_editar,'
  || 'estudiantes_grupo_lideres_fijar,estudiantes_grupo_lista,estudiantes_grupo_miembro_agregar,'
  || 'estudiantes_grupo_miembro_quitar,estudiantes_lideres_disponibles,estudiantes_marcar,estudiantes_mis_grupos,'
  || 'estudiantes_reunion_guardar,estudiantes_visitante_agregar,estudiantes_visitante_crear');
SELECT pg_temp.assert_eq('l: every function is SECURITY DEFINER with an empty search_path, but the label helper',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'estudiantes\_%'
        AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])$q$, 'estudiantes_es_subarea_grupos');
SELECT pg_temp.assert_eq('l: RLS on every table and no privilege for anon or authenticated',
  $q$SELECT count(*) FILTER (WHERE c.relrowsecurity) || '|'
       || count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
                              OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'estudiantes\_%'$q$, '7|0');

SELECT coalesce(string_agg(case_name, E'\n' ORDER BY case_name), 'ALL OK') AS result FROM t_ea_failures;

ROLLBACK;
