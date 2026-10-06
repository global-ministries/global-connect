-- T7 + T9 (odd/tasks/ninos-voluntarios-waumba.md) — registering a new person
-- from the Dream Team assigner.
--
-- Covers:
--   a. Who may register: whoever may create a servicio in the equipo (the
--      dream_team_servicios INSERT policy). A director of another subtree, a
--      plain volunteer and a session without a persona are refused (42501).
--   b. A new person: usuarios row without auth, the 'miembro' role, the
--      actor's principal campus as principal, and the servicio postulado with
--      its history row and one pendiente verificacion per requisito, all in
--      one call.
--   c. Never duplicate by cedula: "V-12.345.678" finds the stored 12345678
--      and returns it ('existente') without writing anything.
--   d. No cedula: the birth date is required (22023); the same normalized
--      full name and birth date returns the candidates ('coincidencias')
--      without writing; a different birth date creates.
--   e. Validation: blank nombre, a rol of another equipo (22023).
--   f. Campus: a selected campus the actor belongs to is used; one they do
--      not belong to is refused (42501).
--   g. T9: an optional representative is linked (child usuario1, the
--      representative usuario2, tipo padre or tutor); the child keeps no
--      cedula; an unknown representative fails the whole call (22023).
--   h. dream_team_persona_por_cedula: finds by normalized cedula for a
--      Dream Team writer, refuses anyone else.
--   i. anon cannot execute either function.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases (0 rows = all ok). concat_ws renders booleans as t/f.
--
-- Identities (usuario n = auth n): 1 DIR dream_team.direct on N, principal
-- campus Z1, also in Z2; 2 OUT dream_team.direct on E; 3 VOL dream_team.serve
-- on S; 4 EXIST cedula 12345678; 5 NAMESAKE "Ana Pérez" born 2018-03-04;
-- 6 REP cedula 87654321; 7 no persona row (auth only).
-- Tree: R → N → S; R → E. Rol 1 on S with one requisito; rol 2 on E.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ap_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ap_result (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ap_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs a registration and keeps its jsonb answer under p_key.
CREATE OR REPLACE FUNCTION pg_temp.registrar(p_case text, p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_ap_result(k, v) VALUES (p_key, v);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected success, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9000000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9001' WHEN 'us' THEN '9002' WHEN 'ca' THEN '9003'
                       WHEN 'eq' THEN '9004' WHEN 'ro' THEN '9005' WHEN 'rq' THEN '9006' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.res(p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT v FROM t_ap_result WHERE k = p_key;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ap-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 7) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ap', 'U' || n, 'ap-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, cedula, estado_civil, genero) VALUES
  (pg_temp.id('us', 4), 'ZZ Existe', 'Cedula', '12345678', 'Casado', 'Femenino'),
  (pg_temp.id('us', 6), 'ZZ Repre', 'Sentante', '87654321', 'Casado', 'Masculino');
INSERT INTO public.usuarios (id, nombre, apellido, fecha_nacimiento, estado_civil, genero) VALUES
  (pg_temp.id('us', 5), 'ZZ Ána', 'Pérez-Gil', '2018-03-04', 'Soltero', 'Femenino');

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Ap Campus 1', 'ZZAP1'),
  (pg_temp.id('ca', 2), 'ZZ Ap Campus 2', 'ZZAP2'),
  (pg_temp.id('ca', 3), 'ZZ Ap Campus 3', 'ZZAP3');

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 1), pg_temp.id('ca', 1), true),
  (pg_temp.id('us', 1), pg_temp.id('ca', 2), false);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'experiencia', NULL, 'ZZ Ap R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ap N', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'ZZ Ap S', true),
  (pg_temp.id('eq', 4), 'estudiantes', pg_temp.id('eq', 1), 'ZZ Ap E', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'voluntario', true);

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad)
SELECT pg_temp.id('rq', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'zz-ap', 'ZZ Ap requisito',
       (enum_range(NULL::public.dream_team_requisito_tipo))[1],
       (enum_range(NULL::public.dream_team_obligatoriedad))[1];

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text),
  (pg_temp.id('us', 3), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

GRANT INSERT, SELECT ON t_ap_failures, t_ap_result TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.registrar(text, text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.res(text) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. who may register ──────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('a: a director of another subtree is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Intruso', p_apellido => 'Uno', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_cedula => '30111222')$q$, '42501');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: a plain volunteer is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Intruso', p_apellido => 'Dos', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_cedula => '30111223')$q$, '42501');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('a: a session without a persona is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Intruso', p_apellido => 'Tres', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_cedula => '30111224')$q$, '42501');

-- ── b. a new person with cedula ──────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.registrar('b: the director registers a new person', 'b',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => '  ZZ Nueva ', p_apellido => 'Persona', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_cedula => 'v-30.555.666', p_fecha_nacimiento => '2000-01-02', p_telefono => '04140000000',
       p_bautizado => true, p_fecha_bautizo => '2015-05-05', p_talla_franela => ' m ', p_redes_sociales => '@zz')$q$);
SELECT pg_temp.assert_eq('b: answers creada with a servicio',
  $q$SELECT (pg_temp.res('b') ->> 'resultado') || '/' || ((pg_temp.res('b') ->> 'servicio_id') IS NOT NULL)::text$q$,
  'creada/true');

RESET ROLE;
SELECT pg_temp.assert_eq('b: the usuarios row, trimmed, normalized, without auth',
  $q$SELECT concat_ws('|', u.nombre, u.apellido, u.cedula, u.genero, u.estado_civil, u.fecha_nacimiento,
                       u.telefono, u.bautizado, u.fecha_bautizo, u.talla_franela, u.redes_sociales, u.auth_id IS NULL)
       FROM public.usuarios u WHERE u.id = (pg_temp.res('b') ->> 'persona_id')::uuid$q$,
  'ZZ Nueva|Persona|30555666|Femenino|Soltero|2000-01-02|04140000000|t|2015-05-05|M|@zz|t');
SELECT pg_temp.assert_eq('b: the miembro role',
  $q$SELECT string_agg(rs.nombre_interno, ',') FROM public.usuario_roles ur
       JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = (pg_temp.res('b') ->> 'persona_id')::uuid$q$,
  'miembro');
SELECT pg_temp.assert_eq('b: the actor principal campus as principal',
  $q$SELECT string_agg(uc.campus_id::text || ':' || uc.es_campus_principal, ',') FROM public.usuario_campus uc
      WHERE uc.usuario_id = (pg_temp.res('b') ->> 'persona_id')::uuid$q$,
  pg_temp.id('ca', 1)::text || ':true');
SELECT pg_temp.assert_eq('b: the servicio postulado in S with rol 1',
  $q$SELECT concat_ws('|', s.persona_id = (pg_temp.res('b') ->> 'persona_id')::uuid, s.equipo_id = pg_temp.id('eq', 3),
                       s.rol_id = pg_temp.id('ro', 1), s.estado, s.motivo_actual)
       FROM public.dream_team_servicios s WHERE s.id = (pg_temp.res('b') ->> 'servicio_id')::uuid$q$,
  't|t|t|postulado|admin_asignacion');
SELECT pg_temp.assert_eq('b: its history row postulado -> postulado by the actor',
  $q$SELECT string_agg(concat_ws('|', h.estado_anterior, h.estado_nuevo, h.motivo, h.actor_persona_id = pg_temp.id('us', 1)), ',')
       FROM public.dream_team_estados_historial h WHERE h.servicio_id = (pg_temp.res('b') ->> 'servicio_id')::uuid$q$,
  'postulado|postulado|admin_asignacion|t');
SELECT pg_temp.assert_eq('b: one pendiente verificacion per requisito',
  $q$SELECT string_agg(v.estado::text, ',') FROM public.dream_team_requisitos_verificacion v
      WHERE v.servicio_id = (pg_temp.res('b') ->> 'servicio_id')::uuid$q$,
  'pendiente');

-- ── c. never duplicate by cedula ─────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.registrar('c: an existing cedula answers', 'c',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'Otro', p_apellido => 'Nombre', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_cedula => 'V-12.345.678')$q$);
SELECT pg_temp.assert_eq('c: existente, with the stored person and no servicio',
  $q$SELECT concat_ws('|', pg_temp.res('c') ->> 'resultado', (pg_temp.res('c') ->> 'persona_id')::uuid = pg_temp.id('us', 4),
                       pg_temp.res('c') ->> 'nombre', pg_temp.res('c') ->> 'servicio_id')$q$,
  'existente|t|ZZ Existe Cedula');
RESET ROLE;
SELECT pg_temp.assert_eq('c: nothing was written',
  $q$SELECT count(*)::text FROM public.usuarios WHERE nombre = 'Otro' AND apellido = 'Nombre'$q$, '0');

-- ── d. no cedula ─────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: no cedula and no birth date is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Sin', p_apellido => 'Nada', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_cedula => '  ')$q$, '22023');
SELECT pg_temp.registrar('d: a namesake born the same day answers', 'd1',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'zz ana', p_apellido => 'perez gil', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_fecha_nacimiento => '2018-03-04')$q$);
SELECT pg_temp.assert_eq('d: coincidencias, listing the namesake, no servicio',
  $q$SELECT concat_ws('|', pg_temp.res('d1') ->> 'resultado', jsonb_array_length(pg_temp.res('d1') -> 'candidatos'),
                       (pg_temp.res('d1') -> 'candidatos' -> 0 ->> 'id')::uuid = pg_temp.id('us', 5),
                       pg_temp.res('d1') ->> 'servicio_id')$q$,
  'coincidencias|1|t');
SELECT pg_temp.registrar('d: the same name born another day creates', 'd2',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Ána', p_apellido => 'Pérez Gil', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_fecha_nacimiento => '2019-07-08')$q$);
SELECT pg_temp.assert_eq('d: creada',
  $q$SELECT pg_temp.res('d2') ->> 'resultado'$q$, 'creada');

-- ── e. validation ────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('e: a blank nombre is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => '  ', p_apellido => 'X', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_cedula => '30999888')$q$, '22023');
SELECT pg_temp.assert_raises('e: a rol of another equipo is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 2),
       p_nombre => 'ZZ Rol', p_apellido => 'Ajeno', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_cedula => '30999887')$q$, '22023');

-- ── f. campus ────────────────────────────────────────────────────────

SELECT pg_temp.registrar('f: a selected campus of the actor is used', 'f',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Campus', p_apellido => 'Dos', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_cedula => '30999886', p_campus_id => pg_temp.id('ca', 2))$q$);
SELECT pg_temp.assert_raises('f: a campus the actor does not belong to is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Campus', p_apellido => 'Tres', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_cedula => '30999885', p_campus_id => pg_temp.id('ca', 3))$q$, '42501');
RESET ROLE;
SELECT pg_temp.assert_eq('f: principal on campus 2',
  $q$SELECT string_agg(uc.campus_id::text || ':' || uc.es_campus_principal, ',') FROM public.usuario_campus uc
      WHERE uc.usuario_id = (pg_temp.res('f') ->> 'persona_id')::uuid$q$,
  pg_temp.id('ca', 2)::text || ':true');

-- ── g. T9 representative ─────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.registrar('g: a child with a representative', 'g',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Niño', p_apellido => 'Sentante', p_genero => 'Masculino', p_estado_civil => 'Soltero',
       p_fecha_nacimiento => '2017-01-01', p_representante_id => pg_temp.id('us', 6), p_representante_tipo => 'tutor')$q$);
SELECT pg_temp.assert_raises('g: an unknown representative fails the call',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Niña', p_apellido => 'Huérfana', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_fecha_nacimiento => '2017-02-02', p_representante_id => pg_temp.id('us', 99))$q$, '22023');
SELECT pg_temp.assert_raises('g: a representative tipo other than padre or tutor is refused',
  $q$SELECT public.dream_team_registrar_persona(p_equipo_id => pg_temp.id('eq', 3), p_rol_id => pg_temp.id('ro', 1),
       p_nombre => 'ZZ Niña', p_apellido => 'Tipo', p_genero => 'Femenino', p_estado_civil => 'Soltero',
       p_fecha_nacimiento => '2017-02-03', p_representante_id => pg_temp.id('us', 6), p_representante_tipo => 'conyuge')$q$, '22023');
RESET ROLE;
SELECT pg_temp.assert_eq('g: the link child -> representative (tutor), child without cedula',
  $q$SELECT concat_ws('|', r.usuario2_id = pg_temp.id('us', 6), r.tipo_relacion, u.cedula IS NULL)
       FROM public.relaciones_usuarios r JOIN public.usuarios u ON u.id = r.usuario1_id
      WHERE r.usuario1_id = (pg_temp.res('g') ->> 'persona_id')::uuid$q$,
  't|tutor|t');
SELECT pg_temp.assert_eq('g: the failed call left no person behind',
  $q$SELECT count(*)::text FROM public.usuarios WHERE nombre IN ('ZZ Niña')$q$, '0');

-- ── h. lookup by cedula ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('h: a writer finds by normalized cedula',
  $q$SELECT string_agg(p.id::text || '|' || p.nombre, ',') FROM public.dream_team_persona_por_cedula('V 87.654.321') p$q$,
  pg_temp.id('us', 6)::text || '|ZZ Repre');
SELECT pg_temp.assert_eq('h: an unknown cedula finds nobody',
  $q$SELECT count(*)::text FROM public.dream_team_persona_por_cedula('11122233')$q$, '0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('h: a plain volunteer is refused',
  $q$SELECT * FROM public.dream_team_persona_por_cedula('87654321')$q$, '42501');

RESET ROLE;

-- ── i. anon ──────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('i: anon cannot execute either function',
  $q$SELECT (has_function_privilege('anon', 'public.dream_team_registrar_persona(uuid, uuid, text, text, public.enum_genero, public.enum_estado_civil, text, date, text, boolean, date, text, text, uuid, uuid, public.enum_tipo_relacion)', 'EXECUTE')
          OR has_function_privilege('anon', 'public.dream_team_persona_por_cedula(text)', 'EXECUTE'))::text$q$,
  'false');

SELECT case_name FROM t_ap_failures;

ROLLBACK;
