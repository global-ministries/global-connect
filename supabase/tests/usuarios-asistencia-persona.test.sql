-- Per-person attendance (20261030100000_usuarios_lista_v2.sql, section 5;
-- T8-1 of odd/tasks/sistema-diseno-v2.md, S13).
--
-- Covers:
--   1. Gate (puede_ver_asistencia_persona / obtener_asistencia_persona): self;
--      admin any campus; pastor and director general only their campus; the
--      leader of a group of the person; a direct relation; nobody else. It
--      never allows what obtener_reporte_asistencia_usuario denies.
--   2. Grupos de Vida: current and past groups (salio), marks in the range only,
--      meetings flagged no_hubo_reunion left out, rol of the membership.
--   3. Estudiantes (The Living Room): area "<ámbito> · <sub-área>", rol,
--      era_visitante from the mark.
--   4. Talleres: nombre of the taller, area of the group, no_aplica left out,
--      total_sesiones.
--   5. A person with no records gets an empty list; identity and privileges.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own e9b00000-... namespace and every fixture person has
-- nombre 'ZZ As'. The Talleres fixture follows
-- supabase/tests/talleres-asistencia-lider.test.sql (open_edicion under the
-- staging Talleres node e524ea89-…). The last statement is a SELECT of the
-- failing cases (empty = all ok).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_as_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_as_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_as_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ As' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ As' AND apellido = p_tag;
$$;

-- The attendance of P as seen by the tagged caller (who is also the session).
CREATE OR REPLACE FUNCTION pg_temp.de(p_tag text, p_persona text DEFAULT 'P')
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN public.obtener_asistencia_persona(pg_temp.u(p_persona), pg_temp.a(p_tag),
                                           current_date - 90, current_date);
END;
$$;

-- One group of an attendance result, by tipo and nombre.
CREATE OR REPLACE FUNCTION pg_temp.grupo(p jsonb, p_tipo text, p_nombre text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT g FROM jsonb_array_elements(p -> 'grupos') g
   WHERE g ->> 'tipo' = p_tipo AND g ->> 'nombre' = p_nombre;
$$;

-- "<marks>|<presentes>|<visitante marks>" of a group.
CREATE OR REPLACE FUNCTION pg_temp.marcas(g jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT count(*) || '|' || count(*) FILTER (WHERE (m ->> 'presente')::boolean)
         || '|' || count(*) FILTER (WHERE (m ->> 'era_visitante')::boolean)
    FROM jsonb_array_elements(g -> 'marcas') m;
$$;

-- Whether today's report lets the tagged caller see P (no 'error' key).
CREATE OR REPLACE FUNCTION pg_temp.reporte_permite(p_tag text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(pg_temp.a(p_tag));
  RETURN NOT (public.obtener_reporte_asistencia_usuario(pg_temp.u('P'), pg_temp.a(p_tag)) ? 'error');
END;
$$;

-- Fixtures (as postgres). ----------------------------------------------------
INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('e9b00000-0000-4000-8000-0000000000ca', 'ZZ As Campus A', 'ZZASA'),
  ('e9b00000-0000-4000-8000-0000000000cb', 'ZZ As Campus B', 'ZZASB');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e9b00000-0000-4000-8000-0000000000a1', 'ZZ As Segmento');

-- People: P (the person, campus A), VACIO (no records, campus A), ADM admin
-- (campus B), PAS pastor A, PASB pastor B, DGB director general B, LID leader
-- of G1 (P's group), LID2 leader of G9 (not P's), REL related to P, OTRO a
-- miembro of campus A, DIR who opens the taller edition.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('e9b00000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       'zzas-auth-' || n || '@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 11) n;

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id)
SELECT ('e9b00000-0000-4000-8000-0000000000' || lpad(v.n::text, 2, '0'))::uuid, 'ZZ As', v.tag, 'Otro', 'Soltero',
       CASE WHEN v.tag = 'VACIO' THEN NULL ELSE ('e9b00000-0000-4000-8000-0000000001' || lpad(v.n::text, 2, '0'))::uuid END
  FROM (VALUES (1, 'P'), (2, 'VACIO'), (3, 'ADM'), (4, 'PAS'), (5, 'PASB'), (6, 'DGB'),
               (7, 'LID'), (8, 'LID2'), (9, 'REL'), (10, 'OTRO'), (11, 'DIR')) AS v(n, tag);

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.u(v.tag), CASE v.c WHEN 'A' THEN 'e9b00000-0000-4000-8000-0000000000ca'::uuid ELSE 'e9b00000-0000-4000-8000-0000000000cb'::uuid END, true
  FROM (VALUES ('P', 'A'), ('VACIO', 'A'), ('ADM', 'B'), ('PAS', 'A'), ('PASB', 'B'), ('DGB', 'B'),
               ('LID', 'A'), ('LID2', 'A'), ('REL', 'A'), ('OTRO', 'A'), ('DIR', 'A')) AS v(tag, c);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.u(v.tag), rs.id
  FROM (VALUES ('P', 'miembro'), ('ADM', 'admin'), ('PAS', 'pastor'), ('PASB', 'pastor'),
               ('DGB', 'director-general'), ('LID', 'lider'), ('LID2', 'lider'), ('REL', 'miembro'),
               ('OTRO', 'miembro')) AS v(tag, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
VALUES (pg_temp.u('P'), pg_temp.u('REL'), 'otro_familiar');

-- Grupos de Vida: G1 current (led by LID), G0 left 50 days ago, G9 led by LID2.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo) VALUES
  ('e9b00000-0000-4000-8000-0000000000c1', 'ZZ As G1', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9b00000-0000-4000-8000-0000000000a1', true),
  ('e9b00000-0000-4000-8000-0000000000c0', 'ZZ As G0', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9b00000-0000-4000-8000-0000000000a1', true),
  ('e9b00000-0000-4000-8000-0000000000c9', 'ZZ As G9', (SELECT id FROM public.temporadas WHERE activa LIMIT 1), 'e9b00000-0000-4000-8000-0000000000a1', true);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion, fecha_salida) VALUES
  ('e9b00000-0000-4000-8000-0000000000c1', pg_temp.u('P'),    'Miembro', 'activo',   current_date - 200, NULL),
  ('e9b00000-0000-4000-8000-0000000000c0', pg_temp.u('P'),    'Miembro', NULL,       current_date - 300, current_date - 50),
  ('e9b00000-0000-4000-8000-0000000000c1', pg_temp.u('LID'),  'Líder',   'activo',   current_date - 300, NULL),
  ('e9b00000-0000-4000-8000-0000000000c9', pg_temp.u('LID2'), 'Líder',   'activo',   current_date - 300, NULL);

-- G1: three meetings in the range (2 present), one out of the range, one
-- flagged no_hubo_reunion. G0: one meeting in the range.
INSERT INTO public.eventos_grupo (id, grupo_id, fecha, no_hubo_reunion) VALUES
  ('e9b00000-0000-4000-8000-0000000000e1', 'e9b00000-0000-4000-8000-0000000000c1', current_date - 7, false),
  ('e9b00000-0000-4000-8000-0000000000e2', 'e9b00000-0000-4000-8000-0000000000c1', current_date - 14, false),
  ('e9b00000-0000-4000-8000-0000000000e3', 'e9b00000-0000-4000-8000-0000000000c1', current_date - 21, false),
  ('e9b00000-0000-4000-8000-0000000000e4', 'e9b00000-0000-4000-8000-0000000000c1', current_date - 200, false),
  ('e9b00000-0000-4000-8000-0000000000e5', 'e9b00000-0000-4000-8000-0000000000c1', current_date - 28, true),
  ('e9b00000-0000-4000-8000-0000000000e6', 'e9b00000-0000-4000-8000-0000000000c0', current_date - 60, false);

INSERT INTO public.asistencia (evento_grupo_id, usuario_id, presente) VALUES
  ('e9b00000-0000-4000-8000-0000000000e1', pg_temp.u('P'), true),
  ('e9b00000-0000-4000-8000-0000000000e2', pg_temp.u('P'), false),
  ('e9b00000-0000-4000-8000-0000000000e3', pg_temp.u('P'), true),
  ('e9b00000-0000-4000-8000-0000000000e4', pg_temp.u('P'), true),
  ('e9b00000-0000-4000-8000-0000000000e5', pg_temp.u('P'), true),
  ('e9b00000-0000-4000-8000-0000000000e6', pg_temp.u('P'), true);

-- Estudiantes: a The Living Room group of campus A; P is a miembro and was
-- marked present once as a visitor and absent once.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('e9b00000-0000-4000-8000-0000000000d1', 'experiencia', NULL, 'ZZ As Experiencia', true),
  ('e9b00000-0000-4000-8000-0000000000d2', 'estudiantes', 'e9b00000-0000-4000-8000-0000000000d1', 'ZZ As Estudiantes', true),
  ('e9b00000-0000-4000-8000-0000000000d3', 'the_living_room', 'e9b00000-0000-4000-8000-0000000000d2', 'ZZ As TLR', true),
  ('e9b00000-0000-4000-8000-0000000000d4', 'the_living_room', 'e9b00000-0000-4000-8000-0000000000d3', 'Grupos de Chicos', true);

INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, zona) VALUES
  ('e9b00000-0000-4000-8000-0000000000f1', 'e9b00000-0000-4000-8000-0000000000ca', 'e9b00000-0000-4000-8000-0000000000d4', 'ZZ As E1', 'Norte');

INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde) VALUES
  ('e9b00000-0000-4000-8000-0000000000f1', pg_temp.u('P'), 'miembro', current_date - 100);

INSERT INTO public.estudiantes_reuniones (id, grupo_id, fecha) VALUES
  ('e9b00000-0000-4000-8000-0000000000f2', 'e9b00000-0000-4000-8000-0000000000f1', current_date - 10),
  ('e9b00000-0000-4000-8000-0000000000f3', 'e9b00000-0000-4000-8000-0000000000f1', current_date - 17);

INSERT INTO public.estudiantes_asistencias (reunion_id, persona_id, estado, era_visitante) VALUES
  ('e9b00000-0000-4000-8000-0000000000f2', pg_temp.u('P'), 'presente', true),
  ('e9b00000-0000-4000-8000-0000000000f3', pg_temp.u('P'), 'ausente', false);

-- Talleres: one edition opened by DIR, one group with three sesiones; P is
-- present at 1, absent at 2 and no_aplica at 3.
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('e9b00000-0000-4000-8000-0000000000d9', 'talleres_crecimiento', 'ZZ As Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('e9b00000-0000-4000-8000-0000000000b1', 'zz-as-taller', 'ZZ As Taller', 'e9b00000-0000-4000-8000-0000000000d9');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.u('DIR'), 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'e9b00000-0000-4000-8000-0000000000d9'),
  (pg_temp.u('DIR'), 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'e9b00000-0000-4000-8000-0000000000d9');

SELECT pg_temp.as_user(pg_temp.a('DIR'));
DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'e9b00000-0000-4000-8000-0000000000b1',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ As Edición', p_link_type => NULL,
    p_sesiones_estimadas => 3, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_as_fixture (key, id) VALUES
    ('edicion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('e9b00000-0000-4000-8000-0000000000b2', (SELECT id FROM t_as_fixture WHERE key = 'cohorte'), 'ZZ As Grupo T', 'activo', 10);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('e9b00000-0000-4000-8000-0000000000b3', 'e9b00000-0000-4000-8000-0000000000b2', 1, current_date - 19, 'programada'),
  ('e9b00000-0000-4000-8000-0000000000b4', 'e9b00000-0000-4000-8000-0000000000b2', 2, current_date - 12, 'programada'),
  ('e9b00000-0000-4000-8000-0000000000b5', 'e9b00000-0000-4000-8000-0000000000b2', 3, current_date - 5, 'programada');

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado, grupo_id) VALUES
  ('e9b00000-0000-4000-8000-0000000000b6', (SELECT id FROM t_as_fixture WHERE key = 'edicion'), (SELECT id FROM t_as_fixture WHERE key = 'cohorte'),
   pg_temp.u('P'), 'aprobado', NULL, 'e9b00000-0000-4000-8000-0000000000b2');

INSERT INTO public.taller_asistencias (sesion_id, inscripcion_id, persona_id, estado) VALUES
  ('e9b00000-0000-4000-8000-0000000000b3', 'e9b00000-0000-4000-8000-0000000000b6', pg_temp.u('P'), 'presente'),
  ('e9b00000-0000-4000-8000-0000000000b4', 'e9b00000-0000-4000-8000-0000000000b6', pg_temp.u('P'), 'ausente'),
  ('e9b00000-0000-4000-8000-0000000000b5', 'e9b00000-0000-4000-8000-0000000000b6', pg_temp.u('P'), 'no_aplica');

-- Cases ----------------------------------------------------------------------

-- 1. Gate.
SELECT pg_temp.assert_eq('gate: the person sees their own attendance',
  $q$SELECT (pg_temp.de('P') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: admin sees any campus',
  $q$SELECT (pg_temp.de('ADM') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: pastor of the person''s campus',
  $q$SELECT (pg_temp.de('PAS') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: pastor of another campus gets NULL',
  $q$SELECT (pg_temp.de('PASB') IS NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: director general of another campus gets NULL',
  $q$SELECT (pg_temp.de('DGB') IS NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: the leader of the person''s group',
  $q$SELECT (pg_temp.de('LID') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: the leader of another group gets NULL',
  $q$SELECT (pg_temp.de('LID2') IS NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: a direct relation',
  $q$SELECT (pg_temp.de('REL') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: a miembro of the same campus gets NULL',
  $q$SELECT (pg_temp.de('OTRO') IS NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('gate: never wider than obtener_reporte_asistencia_usuario',
  $q$SELECT count(*)::text
       FROM unnest(ARRAY['P', 'ADM', 'PAS', 'PASB', 'DGB', 'LID', 'LID2', 'REL', 'OTRO', 'DIR']) t
      WHERE pg_temp.de(t) IS NOT NULL AND NOT pg_temp.reporte_permite(t)$q$, '0');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('gate: acting for somebody else gets NULL',
  $q$SELECT (public.obtener_asistencia_persona(pg_temp.u('P'), pg_temp.a('ADM')) IS NULL)::text$q$, 'true');

-- 2. Grupos de Vida.
SELECT pg_temp.assert_eq('kinds: only the kinds with records, in gdv, estudiantes, talleres order',
  $q$SELECT string_agg(g ->> 'tipo' || ':' || (g ->> 'nombre'), ',' ORDER BY n)
       FROM jsonb_array_elements(pg_temp.de('ADM') -> 'grupos') WITH ORDINALITY AS x(g, n)$q$,
  'gdv:ZZ As G1,gdv:ZZ As G0,estudiantes:ZZ As E1,talleres:ZZ As Taller');
SELECT pg_temp.assert_eq('gdv current: marks in the range, no_hubo_reunion left out',
  $q$SELECT pg_temp.marcas(pg_temp.grupo(pg_temp.de('ADM'), 'gdv', 'ZZ As G1'))$q$, '3|2|0');
SELECT pg_temp.assert_eq('gdv current: rol, area, actual, desde, salio',
  $q$SELECT g ->> 'rol' || '|' || (g ->> 'area') || '|' || (g ->> 'actual') || '|' || (g ->> 'desde') || '|' || coalesce(g ->> 'salio', '-')
       FROM pg_temp.grupo(pg_temp.de('ADM'), 'gdv', 'ZZ As G1') g$q$,
  'Miembro|ZZ As Segmento|true|' || (current_date - 200)::text || '|-');
SELECT pg_temp.assert_eq('gdv past: actual false and the date they left',
  $q$SELECT (g ->> 'actual') || '|' || (g ->> 'salio') || '|' || pg_temp.marcas(g)
       FROM pg_temp.grupo(pg_temp.de('ADM'), 'gdv', 'ZZ As G0') g$q$,
  'false|' || (current_date - 50)::text || '|1|1|0');
SELECT pg_temp.assert_eq('range: echoed back',
  $q$SELECT (pg_temp.de('ADM') ->> 'desde') || '|' || (pg_temp.de('ADM') ->> 'hasta')$q$,
  (current_date - 90)::text || '|' || current_date::text);

-- 3. Estudiantes.
SELECT pg_temp.assert_eq('estudiantes: area, rol, actual and marks with the visitor flag',
  $q$SELECT (g ->> 'area') || '|' || (g ->> 'rol') || '|' || (g ->> 'actual') || '|' || pg_temp.marcas(g)
       FROM pg_temp.grupo(pg_temp.de('ADM'), 'estudiantes', 'ZZ As E1') g$q$,
  'ZZ As TLR · Grupos de Chicos|Miembro|true|2|1|1');

-- 4. Talleres.
SELECT pg_temp.assert_eq('talleres: group as area, no_aplica left out, total_sesiones',
  $q$SELECT (g ->> 'area') || '|' || (g ->> 'rol') || '|' || (g ->> 'actual') || '|' || (g ->> 'completado')
            || '|' || (g ->> 'total_sesiones') || '|' || pg_temp.marcas(g)
       FROM pg_temp.grupo(pg_temp.de('ADM'), 'talleres', 'ZZ As Taller') g$q$,
  'ZZ As Grupo T|Participante|true|false|3|2|1|0');

-- 5. No records, privileges.
SELECT pg_temp.assert_eq('no records: an empty list',
  $q$SELECT (pg_temp.de('ADM', 'VACIO') -> 'grupos')::text$q$, '[]');
SELECT pg_temp.assert_eq('privileges: anon cannot run obtener_asistencia_persona',
  $q$SELECT has_function_privilege('anon', 'public.obtener_asistencia_persona(uuid,uuid,date,date)', 'execute')::text$q$, 'false');
SELECT pg_temp.assert_eq('privileges: authenticated runs obtener_asistencia_persona',
  $q$SELECT has_function_privilege('authenticated', 'public.obtener_asistencia_persona(uuid,uuid,date,date)', 'execute')::text$q$, 'true');
SELECT pg_temp.assert_eq('privileges: the gate is not callable by clients',
  $q$SELECT (has_function_privilege('authenticated', 'public.puede_ver_asistencia_persona(uuid,uuid)', 'execute')
          OR has_function_privilege('anon', 'public.puede_ver_asistencia_persona(uuid,uuid)', 'execute'))::text$q$, 'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_as_failures;

ROLLBACK;
