-- Estudiantes C2 group management (20261029130000_estudiantes_gestion_grupos.sql).
--
-- Covers:
--   s. estudiantes_subareas_gestionables: an ámbito director sees both
--      sub-áreas of their ámbito in their campus, a director de grupo only
--      their sub-área (with its entrenadora and directora de grupo), a pastor
--      every sub-área of their campus, the system admin every campus, a
--      director of another campus only that campus; an entrenadora, a leader
--      and a person without role see none.
--   i. estudiantes_grupo_integrantes: members with representante and estado
--      without a meeting; leaders read their group only; an inactive group
--      only at level 3; another campus refused; unknown group.
--   n. estudiantes_sin_grupo: people who left a group of the sub-área and have
--      no active group in the ámbito, last removed first; level 3 only.
--   m. estudiantes_grupo_miembro_mover: moves keeping the estado, the old
--      membership stays inactive; same group is a no-op; level 3 on both
--      groups; another ámbito and an inactive target refused.
--   l. Privileges: authenticated executes the four functions, anon none.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n): 1 DIRGRUPO (director de grupo in Transit ›
-- Chicas), 2 ENTRENADORA (Chicas), 3 LIDER (Chicas, leads G1), 4 DIRTRANSIT
-- (dream_team.direct on Transit, campus 1), 5 DIRTRANSIT_2 (same grant,
-- campus 2), 6 ADMIN (system admin, no campus), 7 PASTOR (campus 1), 8 NADIE
-- (campus 1, no role). 1–4, 7, 8 belong to campus 1.
-- People without account: 20 Ana (G1 miembro, father 40), 21 Bea (G1
-- visitante), 22 Carla (left G2), 23 Dani (left G1, in G4 of Inside Out),
-- 24 Eva (left G1, now in G3 Chicos), 25 Fio (G5, campus 2).
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit (6 Chicas, 7 Chicos) |
-- 4 Inside Out (9 Chicas). Groups: G1 Chicas 1er, G2 Chicas 2do, G3 Chicos
-- 1er, G4 IO Chicas 4to, G6 Chicas 3er (inactive) in campus 1; G5 Chicas 1er
-- in campus 2.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_eg_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_eg_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a20000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 'ámbito:sub-área:campus' of the ZZ Eg rows the caller manages.
CREATE OR REPLACE FUNCTION pg_temp.gestiona() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(s.ambito || ':' || s.subarea || ':' || s.campus, ',' ORDER BY s.ambito, s.subarea, s.campus), '')
            FROM public.estudiantes_subareas_gestionables() s
           WHERE s.ambito LIKE 'ZZ Eg %' AND s.campus LIKE 'ZZ Eg %');
END;
$$;

-- Member names of a group: 'Zzeg Ana,Zzeg Bea'.
CREATE OR REPLACE FUNCTION pg_temp.integrantes(p_g int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(p ->> 'nombre', ',' ORDER BY p ->> 'nombre'), '')
            FROM jsonb_array_elements(public.estudiantes_grupo_integrantes(pg_temp.id('gr', p_g)) -> 'personas') p);
END;
$$;

-- Active memberships of a person: 'ZZ Eg G2:visitante'.
CREATE OR REPLACE FUNCTION pg_temp.activo_en(p_persona int) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(g.nombre || ':' || m.estado, ',' ORDER BY g.nombre), '')
            FROM public.estudiantes_grupo_miembros m JOIN public.estudiantes_grupos g ON g.id = m.grupo_id
           WHERE m.persona_id = pg_temp.id('us', p_persona) AND m.activo);
END;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'eg-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Eg', 'U' || n, 'eg-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, telefono) VALUES
  (pg_temp.id('us', 20), 'Zzeg Ana', 'Uno', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 21), 'Zzeg Bea', 'Uno', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 22), 'Zzeg Carla', 'Dos', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 23), 'Zzeg Dani', 'Tres', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 24), 'Zzeg Eva', 'Cuatro', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 25), 'Zzeg Fio', 'Cinco', 'No especificado', 'Femenino', NULL),
  (pg_temp.id('us', 40), 'Zzeg Papa', 'Uno', 'No especificado', 'Masculino', '04269990440');

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Eg Campus 1', 'ZZEG1'),
  (pg_temp.id('ca', 2), 'ZZ Eg Campus 2', 'ZZEG2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n IN (5, 25) THEN 2 ELSE 1 END), true
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 8, 20, 21, 22, 23, 24, 25, 40]) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', v.n), rs.id
  FROM (VALUES (6, 'admin'), (7, 'pastor')) AS v(n, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
VALUES (pg_temp.id('us', 20), pg_temp.id('us', 40), 'padre', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Eg Experiencia'), (2, 1, 'estudiantes', 'ZZ Eg Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Eg Transit'), (4, 2, 'estudiantes', 'ZZ Eg Inside Out'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (7, 3, 'estudiantes', 'Grupos de Chicos'),
               (9, 4, 'estudiantes', 'Grupos de Chicas')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', 6), label, nivel, true
  FROM (VALUES (1, 'director de grupo', 'coordinador'), (2, 'entrenador', 'lider'), (3, 'lider', 'lider')) AS v(n, label, nivel);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 6), pg_temp.id('ro', n), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM generate_series(1, 3) AS n;
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 4), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 5), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', c), n, n || 'º', pg_temp.id('eq', CASE WHEN n <= 3 THEN 3 ELSE 4 END)
  FROM generate_series(1, 6) AS n, generate_series(1, 2) AS c;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, activo) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Eg G1', 1, true),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Eg G2', 2, true),
  (pg_temp.id('gr', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 7), 'ZZ Eg G3', 1, true),
  (pg_temp.id('gr', 4), pg_temp.id('ca', 1), pg_temp.id('eq', 9), 'ZZ Eg G4', 4, true),
  (pg_temp.id('gr', 5), pg_temp.id('ca', 2), pg_temp.id('eq', 6), 'ZZ Eg G5', 1, true),
  (pg_temp.id('gr', 6), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Eg G6', 3, false);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES (pg_temp.id('gr', 1), pg_temp.id('se', 3));
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, activo, retirado_at) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 20), 'miembro', true, NULL),
  (pg_temp.id('gr', 1), pg_temp.id('us', 21), 'visitante', true, NULL),
  (pg_temp.id('gr', 2), pg_temp.id('us', 22), 'miembro', false, timestamptz '2026-09-01 12:00+00'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 23), 'miembro', false, timestamptz '2026-10-01 12:00+00'),
  (pg_temp.id('gr', 4), pg_temp.id('us', 23), 'miembro', true, NULL),
  (pg_temp.id('gr', 1), pg_temp.id('us', 24), 'miembro', false, timestamptz '2026-08-01 12:00+00'),
  (pg_temp.id('gr', 3), pg_temp.id('us', 24), 'miembro', true, NULL),
  (pg_temp.id('gr', 5), pg_temp.id('us', 25), 'miembro', true, NULL);

GRANT INSERT, SELECT ON t_eg_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_persona(int),
  pg_temp.gestiona(), pg_temp.integrantes(int), pg_temp.activo_en(int)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── s. sub-áreas the caller manages ──────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('s: the ámbito director manages both sub-áreas of their ámbito in their campus',
  $q$SELECT pg_temp.gestiona()$q$, 'ZZ Eg Transit:Grupos de Chicas:ZZ Eg Campus 1,ZZ Eg Transit:Grupos de Chicos:ZZ Eg Campus 1');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('s: the director de grupo manages only their sub-área',
  $q$SELECT pg_temp.gestiona()$q$, 'ZZ Eg Transit:Grupos de Chicas:ZZ Eg Campus 1');
SELECT pg_temp.assert_eq('s: with its entrenadora and directora de grupo, not its leaders',
  $q$SELECT string_agg(r ->> 'apellido' || ':' || (r ->> 'rol'), ',' ORDER BY r ->> 'apellido')
       FROM public.estudiantes_subareas_gestionables() s, jsonb_array_elements(s.responsables) r
      WHERE s.subarea_id = pg_temp.id('eq', 6)$q$, 'U1:director de grupo,U2:entrenador');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('s: a pastor manages every sub-área of their campus',
  $q$SELECT pg_temp.gestiona()$q$,
  'ZZ Eg Inside Out:Grupos de Chicas:ZZ Eg Campus 1,ZZ Eg Transit:Grupos de Chicas:ZZ Eg Campus 1,ZZ Eg Transit:Grupos de Chicos:ZZ Eg Campus 1');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('s: the system admin manages every campus',
  $q$SELECT count(*)::text FROM public.estudiantes_subareas_gestionables() s
      WHERE s.ambito LIKE 'ZZ Eg %' AND s.campus LIKE 'ZZ Eg %'$q$, '6');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('s: a director of another campus manages only that campus',
  $q$SELECT pg_temp.gestiona()$q$, 'ZZ Eg Transit:Grupos de Chicas:ZZ Eg Campus 2,ZZ Eg Transit:Grupos de Chicos:ZZ Eg Campus 2');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('s: an entrenadora manages none', $q$SELECT pg_temp.gestiona()$q$, '');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('s: a leader manages none', $q$SELECT pg_temp.gestiona()$q$, '');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('s: a person without role manages none', $q$SELECT pg_temp.gestiona()$q$, '');

-- ── i. members without a meeting ─────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('i: the leader reads their group''s members', $q$SELECT pg_temp.integrantes(1)$q$, 'Zzeg Ana,Zzeg Bea');
SELECT pg_temp.assert_eq('i: with the representante and the estado, no management',
  $q$SELECT (SELECT r ->> 'nombre' || '|' || (r ->> 'telefono')
               FROM jsonb_array_elements(p -> 'representantes') r)
            || '|' || (SELECT q ->> 'estado' FROM jsonb_array_elements(l -> 'personas') q WHERE q ->> 'nombre' = 'Zzeg Bea')
            || '|' || (l ->> 'puede_gestionar')
       FROM (SELECT public.estudiantes_grupo_integrantes(pg_temp.id('gr', 1)) AS l) x,
            jsonb_array_elements(x.l -> 'personas') p
      WHERE p ->> 'nombre' = 'Zzeg Ana'$q$, 'Zzeg Papa|04269990440|visitante|false');
SELECT pg_temp.assert_raises('i: a leader cannot read another group',
  $q$SELECT pg_temp.integrantes(2)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('i: the director de grupo manages the group',
  $q$SELECT public.estudiantes_grupo_integrantes(pg_temp.id('gr', 1)) ->> 'puede_gestionar'$q$, 'true');
SELECT pg_temp.assert_eq('i: the director de grupo reads an inactive group',
  $q$SELECT public.estudiantes_grupo_integrantes(pg_temp.id('gr', 6)) -> 'grupo' ->> 'activo'$q$, 'false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('i: an inactive group needs management level',
  $q$SELECT pg_temp.integrantes(6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('i: a director of another campus cannot read it',
  $q$SELECT pg_temp.integrantes(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_raises('i: a person without role cannot read it',
  $q$SELECT pg_temp.integrantes(1)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i: an unknown group',
  $q$SELECT pg_temp.integrantes(99)$q$, '22023', 'grupo_invalido');

-- ── n. people without a group ────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('n: who left the sub-área and has no group in the ámbito, last removed first',
  $q$SELECT string_agg(nombre || ':' || ultimo_grupo, ',' ORDER BY retirado_at DESC) FROM public.estudiantes_sin_grupo(pg_temp.id('gr', 1))$q$,
  'Zzeg Dani:ZZ Eg G1,Zzeg Carla:ZZ Eg G2');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('n: an entrenadora cannot list them',
  $q$SELECT count(*) FROM public.estudiantes_sin_grupo(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('n: a director of another campus cannot list them',
  $q$SELECT count(*) FROM public.estudiantes_sin_grupo(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');

-- ── m. move a member ─────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('m: a leader cannot move members',
  $q$SELECT public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 21), pg_temp.id('gr', 2))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('m: the director de grupo moves a visitor and keeps the estado',
  $q$SELECT (public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 21), pg_temp.id('gr', 2)) IS NOT NULL)
       || '|' || pg_temp.activo_en(21) || '|' || pg_temp.integrantes(1)$q$, 'true|ZZ Eg G2:visitante|Zzeg Ana');
SELECT pg_temp.assert_eq('m: moving to the same group changes nothing',
  $q$SELECT (public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 20), pg_temp.id('gr', 1)) IS NOT NULL)
       || '|' || pg_temp.activo_en(20)$q$, 'true|ZZ Eg G1:miembro');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('m: a group of another ámbito is refused (no member there to move)',
  $q$SELECT public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 20), pg_temp.id('gr', 4))$q$, '22023', 'persona_invalida');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('m: without management of the source group it is refused',
  $q$SELECT public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 24), pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('m: a refused move leaves the person where they were',
  $q$SELECT pg_temp.activo_en(24)$q$, 'ZZ Eg G3:miembro');
SELECT pg_temp.assert_raises('m: an inactive target is refused',
  $q$SELECT public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 20), pg_temp.id('gr', 6))$q$, '22023', 'grupo_invalido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('m: the ámbito director moves between sub-áreas of the ámbito',
  $q$SELECT (public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 24), pg_temp.id('gr', 1)) IS NOT NULL)
       || '|' || pg_temp.activo_en(24)$q$, 'true|ZZ Eg G1:miembro');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('m: a director of another campus cannot move into this campus',
  $q$SELECT public.estudiantes_grupo_miembro_mover(pg_temp.id('us', 25), pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes the four functions, anon none',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_subareas_gestionables', 'estudiantes_grupo_integrantes',
                                                   'estudiantes_sin_grupo', 'estudiantes_grupo_miembro_mover')$q$,
  'estudiantes_grupo_integrantes:true:false,estudiantes_grupo_miembro_mover:true:false,'
  || 'estudiantes_sin_grupo:true:false,estudiantes_subareas_gestionables:true:false');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_eg_failures);
END;
$$;
