-- Estudiantes: add or remove the representante of an existing member
-- (odd/tasks/representante-buscador.md, T2, S2, S3;
-- 20261121003434_estudiantes_representante.sql).
--
-- Covers:
--   a. Level 3 (director de grupo) adds by persona_id: one canonical row
--      (usuario1 = student, usuario2 = representante), creado false, principal
--      because the student had no principal; a student whose inverse 'hijo'
--      link is principal gets a non-principal new link and keeps that one.
--   b. Level 3 adds by typed data: the usuario is created once (no account,
--      estado_civil 'No especificado', normalized phone) with one
--      usuario_campus of the group's campus; a second add with the same cédula
--      (other format, other name and phone) reuses it; teléfono + nombre also
--      reuse it; an already linked representante gets the new tipo, never a
--      second row, keeping its principal flag. A second representante is not
--      principal and never demotes the first; the student's other rows (a
--      pre-existing principal tio) are never modified.
--   c. An existing inverse 'hijo' link is replaced by one canonical row with
--      the new tipo (no duplicates), keeping its (non-principal) flag.
--   d. Refusals: a non-representative relation of the pair (conyuge, or the
--      student as the representante's parent) → relacion_existente; the
--      student as their own representante (by persona_id, by cédula, and by
--      teléfono + nombre) → representante_invalido; a student not in the
--      group, in another group, or with an inactive membership →
--      persona_invalida; a level-3 user on The Living Room →
--      representante_no_aplica, a level-0 user there → sin_autoridad (the
--      level is checked first); a level-1 leader, a level-2 entrenador and a
--      director de grupo of another campus → sin_autoridad for both
--      functions; no current user → sin_autoridad; unknown group →
--      grupo_invalido; payload validation (datos_invalidos,
--      tipo_representante_invalido, representante_no_encontrado,
--      representante_incompleto, genero_requerido, texto_muy_largo). None of
--      them changes a row.
--   e. quitar removes only the representative links of the pair (canonical
--      and inverse 'hijo'), never the usuario nor another relation (conyuge,
--      or a relation where the student is the parent); true, then false the
--      second time.
--   l. Privileges: anon cannot execute either function; authenticated can;
--      both are SECURITY DEFINER with an empty search_path.
--
-- Run against STAGING inside BEGIN…ROLLBACK as postgres. The last statement
-- is a SELECT of the failing cases ('ALL OK' when none). Everything that
-- touches the new functions runs through EXECUTE inside an exception-catching
-- helper, so the RED run (migration not applied) still reaches the final
-- SELECT and lists every case as failing.
--
-- Identities (usuario n = auth n, campus 1): 1 LIDER (lider in Transit ›
-- Chicas, leads G1, level 1), 2 DIRGRUPO (director de grupo in Transit ›
-- Chicas, level 3), 3 DIR_TLR (dream_team.direct on The Living Room),
-- 4 ENTRENADOR (entrenador in Transit › Chicas, level 2), 5 DIRGRUPO_C2
-- (director de grupo in Transit › Chicas but only of campus 2: level 0 on G1).
-- People without account (campus 1): 20 Ana (G1, cédula E-99.771.120),
-- 21 Bea (G1, teléfono 04269771121), 22 Carla (no group), 23 Tomás (G2,
-- The Living Room), 24 Dina (inactive membership of G1, canonical tio 31,
-- principal), 25 Eva (G1, inverse 'hijo' of 36, principal),
-- 30 Papá, 31 Tía (Bea's canonical tio, principal), 32 Abuela (inverse 'hijo'
-- of Bea), 33 Ana's conyuge, 34 Ana's child (Ana is 34's padre),
-- 36 Ana's inverse 'hijo' representante.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit | 4 TLR; 3 › 5 Grupos de
-- Chicas; 4 › 6 Grupos de Chicas. Groups: G1 Transit Chicas 1er año, G2 TLR
-- zona Norte.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_er_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_er_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_er_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e5b30000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'b001' WHEN 'us' THEN 'b002' WHEN 'ca' THEN 'b003'
                       WHEN 'eq' THEN 'b004' WHEN 'ro' THEN 'b005' WHEN 'se' THEN 'b006'
                       WHEN 'gr' THEN 'b008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Signed in as authenticated without a user (no sub).
CREATE OR REPLACE FUNCTION pg_temp.as_nadie() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_er_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cu(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.guardar_ctx(p_k text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_er_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: ' || p_k, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (new functions missing) still reaches the final SELECT.

CREATE OR REPLACE FUNCTION pg_temp.agregar(p_g int, p_persona int, p_rep jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.estudiantes_representante_agregar(pg_temp.id('gr', p_g), pg_temp.id('us', p_persona), p_rep);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.quitar(p_g int, p_persona int, p_rep uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.estudiantes_representante_quitar(pg_temp.id('gr', p_g), pg_temp.id('us', p_persona), p_rep);
END;
$$;

-- Every relation of a pair, from the student's side: 'est:padre:true' when
-- usuario1 is the student, 'rep:hijo:false' when it is the other person; 'none'.
CREATE OR REPLACE FUNCTION pg_temp.par(p_est int, p_rep uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(CASE WHEN r.usuario1_id = pg_temp.id('us', p_est) THEN 'est' ELSE 'rep' END
                             || ':' || r.tipo_relacion || ':' || coalesce(r.es_principal::text, 'null'),
                             ',' ORDER BY r.usuario1_id = pg_temp.id('us', p_est) DESC, r.tipo_relacion::text), 'none')
    FROM public.relaciones_usuarios r
   WHERE (r.usuario1_id = pg_temp.id('us', p_est) AND r.usuario2_id = p_rep)
      OR (r.usuario1_id = p_rep AND r.usuario2_id = pg_temp.id('us', p_est));
$$;

-- The principal representantes (canonical rows) of a student: their nombres.
CREATE OR REPLACE FUNCTION pg_temp.principales(p_est int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(u.nombre, ',' ORDER BY u.nombre), 'none')
    FROM public.relaciones_usuarios r JOIN public.usuarios u ON u.id = r.usuario2_id
   WHERE r.usuario1_id = pg_temp.id('us', p_est)
     AND r.tipo_relacion IN ('padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar')
     AND r.es_principal;
$$;

-- Everything a refusal must leave unchanged: the relations touching the
-- fixture people and the fixture-named usuarios with their campuses.
CREATE OR REPLACE FUNCTION pg_temp.foto() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT md5(coalesce((
           SELECT string_agg(r.id::text || r.usuario1_id::text || r.usuario2_id::text || r.tipo_relacion::text
                             || coalesce(r.es_principal::text, 'n'),
                             ',' ORDER BY r.id)
             FROM public.relaciones_usuarios r
            WHERE r.usuario1_id IN (SELECT u.id FROM public.usuarios u WHERE u.nombre LIKE 'Zzrb%' OR u.nombre = 'ZZ Rb')
               OR r.usuario2_id IN (SELECT u.id FROM public.usuarios u WHERE u.nombre LIKE 'Zzrb%' OR u.nombre = 'ZZ Rb')), '')
         || '|' || (SELECT count(*) FROM public.usuarios u WHERE u.nombre LIKE 'Zzrb%')
         || '|' || (SELECT count(*) FROM public.usuario_campus uc JOIN public.usuarios u ON u.id = uc.usuario_id
                     WHERE u.nombre LIKE 'Zzrb%'));
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'er-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Rb', 'U' || n, 'er-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, telefono, cedula) VALUES
  (pg_temp.id('us', 20), 'Zzrb Ana', 'Uno', 'No especificado', 'Femenino', NULL, 'E-99.771.120'),
  (pg_temp.id('us', 21), 'Zzrb Bea', 'Uno', 'No especificado', 'Femenino', '04269771121', NULL),
  (pg_temp.id('us', 22), 'Zzrb Carla', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 23), 'Zzrb Tomas', 'Dos', 'No especificado', 'Masculino', NULL, NULL),
  (pg_temp.id('us', 24), 'Zzrb Dina', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 25), 'Zzrb Eva', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 30), 'Zzrb Papa', 'Uno', 'No especificado', 'Masculino', '04269771130', NULL),
  (pg_temp.id('us', 31), 'Zzrb Tia', 'Uno', 'No especificado', 'Femenino', '04269771131', NULL),
  (pg_temp.id('us', 32), 'Zzrb Abuela', 'Uno', 'No especificado', 'Femenino', '04269771132', NULL),
  (pg_temp.id('us', 33), 'Zzrb Conyuge', 'Uno', 'No especificado', 'Masculino', '04269771133', NULL),
  (pg_temp.id('us', 34), 'Zzrb Hija', 'Uno', 'No especificado', 'Femenino', NULL, NULL),
  (pg_temp.id('us', 36), 'Zzrb Padrino', 'Uno', 'No especificado', 'Masculino', '04269771136', NULL);

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Rb Campus', 'ZZRB1'),
  (pg_temp.id('ca', 2), 'ZZ Rb Campus 2', 'ZZRB2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true
  FROM unnest(ARRAY[1, 2, 3, 4, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 36]) AS n;
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
VALUES (pg_temp.id('us', 5), pg_temp.id('ca', 2), true);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 21), pg_temp.id('us', 31), 'tio', true),
  (pg_temp.id('us', 32), pg_temp.id('us', 21), 'hijo', false),
  (pg_temp.id('us', 20), pg_temp.id('us', 33), 'conyuge', false),
  (pg_temp.id('us', 34), pg_temp.id('us', 20), 'padre', false),
  (pg_temp.id('us', 36), pg_temp.id('us', 20), 'hijo', false),
  (pg_temp.id('us', 24), pg_temp.id('us', 31), 'tio', true),
  (pg_temp.id('us', 36), pg_temp.id('us', 25), 'hijo', true);

-- (n, parent, experiencia, label).
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Rb Experiencia'), (2, 1, 'estudiantes', 'ZZ Rb Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Rb Transit'), (4, 2, 'the_living_room', 'ZZ Rb TLR'),
               (5, 3, 'estudiantes', 'Grupos de Chicas'), (6, 4, 'the_living_room', 'Grupos de Chicas'))
       AS v(n, p, experiencia, label);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, nivel, true
  FROM (VALUES (1, 5, 'lider', 'lider'), (2, 5, 'director de grupo', 'coordinador'), (3, 5, 'entrenador', 'lider'))
       AS v(n, e, label, nivel);

-- Servicio n belongs to person n.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 5, 1), (2, 5, 2), (4, 5, 3), (5, 5, 2)) AS v(n, e, r);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 3), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text);

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', 1), n, n || 'º', pg_temp.id('eq', 3) FROM generate_series(1, 3) AS n;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, zona) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 5), 'ZZ Rb G1', 1, NULL),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Rb G2', NULL, 'Norte');
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES (pg_temp.id('gr', 1), pg_temp.id('se', 1));
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde)
SELECT pg_temp.id('gr', g), pg_temp.id('us', p), 'miembro', DATE '2026-01-04'
  FROM (VALUES (1, 20), (1, 21), (1, 25), (2, 23)) AS v(g, p);
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado, desde, activo, retirado_at)
VALUES (pg_temp.id('gr', 1), pg_temp.id('us', 24), 'miembro', DATE '2026-01-04', false, now());

GRANT INSERT, SELECT ON t_er_failures, t_er_ctx TO authenticated, anon;
GRANT UPDATE ON t_er_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_persona(int),
  pg_temp.as_nadie(), pg_temp.as_anon(), pg_temp.ctx(text), pg_temp.cu(text), pg_temp.guardar_ctx(text, text),
  pg_temp.agregar(int, int, jsonb), pg_temp.quitar(int, int, uuid), pg_temp.foto()
  TO authenticated, anon;

SELECT pg_temp.guardar_ctx('foto0', $q$SELECT pg_temp.foto()$q$);

-- ── d. refusals first: nothing changes ───────────────────────────────

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: a level-1 leader cannot add by persona_id',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30), 'tipo', 'padre'))$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-1 leader cannot add by typed data',
  $q$SELECT pg_temp.agregar(1, 20, '{"nombre":"Zzrb Lider Rep","apellido":"X","telefono":"04269771170","genero":"Femenino"}')$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-1 leader cannot remove (inverse hijo link)',
  $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 36))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-1 leader cannot remove (canonical link)',
  $q$SELECT pg_temp.quitar(1, 21, pg_temp.id('us', 31))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-0 user on The Living Room gets sin_autoridad, not a hint (agregar)',
  $q$SELECT pg_temp.agregar(2, 23, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-0 user on The Living Room gets sin_autoridad, not a hint (quitar)',
  $q$SELECT pg_temp.quitar(2, 23, pg_temp.id('us', 30))$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('d: a level-2 entrenador cannot add',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a level-2 entrenador cannot remove',
  $q$SELECT pg_temp.quitar(1, 21, pg_temp.id('us', 31))$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('d: a director de grupo of another campus cannot add',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: a director de grupo of another campus cannot remove',
  $q$SELECT pg_temp.quitar(1, 21, pg_temp.id('us', 31))$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_nadie();
SELECT pg_temp.assert_raises('d: no current user cannot add',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('d: no current user cannot remove',
  $q$SELECT pg_temp.quitar(1, 21, pg_temp.id('us', 31))$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d: The Living Room takes no representante, level 3 (agregar)',
  $q$SELECT pg_temp.agregar(2, 23, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$,
  '22023', 'representante_no_aplica');
SELECT pg_temp.assert_raises('d: The Living Room takes no representante, level 3 (quitar)',
  $q$SELECT pg_temp.quitar(2, 23, pg_temp.id('us', 30))$q$, '22023', 'representante_no_aplica');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: an unknown group (agregar)',
  $q$SELECT public.estudiantes_representante_agregar(pg_temp.id('gr', 99), pg_temp.id('us', 20),
                                                     jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$,
  '22023', 'grupo_invalido');
SELECT pg_temp.assert_raises('d: an unknown group (quitar)',
  $q$SELECT public.estudiantes_representante_quitar(pg_temp.id('gr', 99), pg_temp.id('us', 21), pg_temp.id('us', 31))$q$,
  '22023', 'grupo_invalido');
SELECT pg_temp.assert_raises('d: a student not in any group (agregar)',
  $q$SELECT pg_temp.agregar(1, 22, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: a student of another group (agregar)',
  $q$SELECT pg_temp.agregar(1, 23, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: a student not in the group (quitar)',
  $q$SELECT pg_temp.quitar(1, 22, pg_temp.id('us', 30))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: a student with an inactive membership (agregar)',
  $q$SELECT pg_temp.agregar(1, 24, jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: a student with an inactive membership (quitar)',
  $q$SELECT pg_temp.quitar(1, 24, pg_temp.id('us', 31))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('d: the student as their own representante by persona_id',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 20)))$q$, '22023', 'representante_invalido');
SELECT pg_temp.assert_raises('d: typed data resolving to the student by cédula',
  $q$SELECT pg_temp.agregar(1, 20, '{"nombre":"Zzrb Otro","telefono":"04269771177","cedula":"E99771120","genero":"Masculino"}')$q$,
  '22023', 'representante_invalido');
SELECT pg_temp.assert_raises('d: typed teléfono + nombre resolving only to the student',
  $q$SELECT pg_temp.agregar(1, 21, '{"nombre":"Zzrb Bea","apellido":"Uno","telefono":"04269771121","genero":"Femenino"}')$q$,
  '22023', 'representante_invalido');
SELECT pg_temp.assert_raises('d: a conyuge of the student is not a representante',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 33), 'tipo', 'tutor'))$q$,
  '23505', 'relacion_existente');
SELECT pg_temp.assert_raises('d: someone whose padre is the student is not a representante',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 34)))$q$,
  '23505', 'relacion_existente');
SELECT pg_temp.assert_raises('d: a payload that is not an object',
  $q$SELECT pg_temp.agregar(1, 20, '"x"')$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('d: a null payload',
  $q$SELECT pg_temp.agregar(1, 20, NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('d: a tipo outside the representative types',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30), 'tipo', 'conyuge'))$q$,
  '22023', 'tipo_representante_invalido');
SELECT pg_temp.assert_raises('d: a persona_id that is not a uuid',
  $q$SELECT pg_temp.agregar(1, 20, '{"persona_id":"no-es-uuid"}')$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('d: a persona_id that is not a usuario',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 99)))$q$, '22023', 'representante_no_encontrado');
SELECT pg_temp.assert_raises('d: typed data without phone',
  $q$SELECT pg_temp.agregar(1, 20, '{"nombre":"Zzrb Sin Tel","genero":"Femenino"}')$q$, '22023', 'representante_incompleto');
SELECT pg_temp.assert_raises('d: typed data without gender',
  $q$SELECT pg_temp.agregar(1, 20, '{"nombre":"Zzrb Sin Genero","telefono":"04269771178"}')$q$, '22023', 'genero_requerido');
SELECT pg_temp.assert_raises('d: typed data with a gender other than Masculino / Femenino',
  $q$SELECT pg_temp.agregar(1, 20, '{"nombre":"Zzrb Otro","telefono":"04269771178","genero":"Otro"}')$q$, '22023', 'genero_requerido');
SELECT pg_temp.assert_raises('d: typed data over 80 characters',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('nombre', 'Zzrb ' || repeat('x', 80), 'telefono', '04269771179',
                                                     'genero', 'Femenino'))$q$, '22023', 'texto_muy_largo');

RESET ROLE;
SELECT pg_temp.assert_eq('d: no refusal changed a relation, a usuario or a campus',
  $q$SELECT (pg_temp.foto() = pg_temp.ctx('foto0'))::text$q$, 'true');
SELECT pg_temp.assert_eq('d: the inactive member keeps their link',
  $q$SELECT pg_temp.par(24, pg_temp.id('us', 31))$q$, 'est:tio:true');

-- ── a. add by persona_id ─────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('a1',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30)))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('a: returns the representante, not created',
  $q$SELECT ((pg_temp.ctx('a1')::jsonb ->> 'representante_id')::uuid = pg_temp.id('us', 30)) || '|'
            || (pg_temp.ctx('a1')::jsonb ->> 'creado')$q$, 'true|false');
SELECT pg_temp.assert_eq('a: one canonical row, padre by default, principal (the student had none)',
  $q$SELECT pg_temp.par(20, pg_temp.id('us', 30))$q$, 'est:padre:true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('a2',
  $q$SELECT pg_temp.agregar(1, 25, jsonb_build_object('persona_id', pg_temp.id('us', 30)))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('a: an inverse principal hijo link counts: the new link is not principal, the old one stays',
  $q$SELECT pg_temp.par(25, pg_temp.id('us', 30)) || '|' || pg_temp.par(25, pg_temp.id('us', 36))$q$,
  'est:padre:false|rep:hijo:true');

-- ── b. add by typed data ─────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('b1',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object(
       'nombre', 'Zzrb Mama', 'apellido', 'Nueva', 'telefono', '0426-977-1150', 'cedula', 'E-99.771.150',
       'genero', 'Femenino', 'tipo', 'tutor'))::text$q$);
RESET ROLE;
SELECT pg_temp.guardar_ctx('mama', $q$SELECT pg_temp.ctx('b1')::jsonb ->> 'representante_id'$q$);
SELECT pg_temp.assert_eq('b: typed data creates the usuario (creado true)',
  $q$SELECT pg_temp.ctx('b1')::jsonb ->> 'creado'$q$, 'true');
SELECT pg_temp.assert_eq('b: a person without account, normalized phone, estado civil No especificado',
  $q$SELECT nombre || '|' || apellido || '|' || telefono || '|' || estado_civil || '|' || genero || '|' || (auth_id IS NULL)
       FROM public.usuarios WHERE id = pg_temp.cu('mama')$q$, 'Zzrb Mama|Nueva|04269771150|No especificado|Femenino|true');
SELECT pg_temp.assert_eq('b: with one usuario_campus of the group''s campus',
  $q$SELECT string_agg(campus_id::text || ':' || es_campus_principal, ',') FROM public.usuario_campus WHERE usuario_id = pg_temp.cu('mama')$q$,
  pg_temp.id('ca', 1)::text || ':true');
SELECT pg_temp.assert_eq('b: a second representante is linked as tutor, not principal',
  $q$SELECT pg_temp.par(20, pg_temp.cu('mama'))$q$, 'est:tutor:false');
SELECT pg_temp.assert_eq('b: adding a second representante does not demote the first',
  $q$SELECT pg_temp.principales(20) || '|' || pg_temp.par(20, pg_temp.id('us', 30))$q$, 'Zzrb Papa|est:padre:true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('b2',
  $q$SELECT pg_temp.agregar(1, 21, jsonb_build_object(
       'nombre', 'Zzrb Otra', 'apellido', 'Persona', 'telefono', '04269771999', 'cedula', 'E99771150',
       'genero', 'Femenino', 'tipo', 'otro_familiar'))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('b: the same cédula in another format reuses the usuario (creado false)',
  $q$SELECT ((pg_temp.ctx('b2')::jsonb ->> 'representante_id')::uuid = pg_temp.cu('mama')) || '|'
            || (pg_temp.ctx('b2')::jsonb ->> 'creado')$q$, 'true|false');
SELECT pg_temp.assert_eq('b: still one usuario with that cédula and one usuario_campus',
  $q$SELECT (SELECT count(*) FROM public.usuarios u
              WHERE public.normalizar_cedula_ve(u.cedula) = public.normalizar_cedula_ve('E99771150')) || '|'
            || (SELECT count(*) FROM public.usuario_campus WHERE usuario_id = pg_temp.cu('mama')) || '|'
            || (SELECT count(*) FROM public.usuarios WHERE nombre = 'Zzrb Otra')$q$, '1|1|0');
SELECT pg_temp.assert_eq('b: the reused person keeps their data',
  $q$SELECT nombre || '|' || telefono FROM public.usuarios WHERE id = pg_temp.cu('mama')$q$, 'Zzrb Mama|04269771150');
SELECT pg_temp.assert_eq('b: linked to the second student as otro_familiar, not principal; their principal tio keeps es_principal',
  $q$SELECT pg_temp.par(21, pg_temp.cu('mama')) || '|' || pg_temp.principales(21) || '|' || pg_temp.par(21, pg_temp.id('us', 31))$q$,
  'est:otro_familiar:false|Zzrb Tia|est:tio:true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('b3',
  $q$SELECT pg_temp.agregar(1, 21, jsonb_build_object(
       'nombre', 'ZZRB MAMÁ', 'apellido', 'nueva', 'telefono', '04269771150', 'genero', 'Femenino', 'tipo', 'tutor'))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('b: teléfono + nombre reuse the usuario',
  $q$SELECT ((pg_temp.ctx('b3')::jsonb ->> 'representante_id')::uuid = pg_temp.cu('mama')) || '|'
            || (pg_temp.ctx('b3')::jsonb ->> 'creado') || '|'
            || (SELECT count(*) FROM public.usuarios WHERE nombre IN ('Zzrb Mama', 'ZZRB MAMÁ'))$q$, 'true|false|1');
SELECT pg_temp.assert_eq('b: an already linked representante gets the new tipo, never a second row, keeping its flag',
  $q$SELECT pg_temp.par(21, pg_temp.cu('mama')) || '|' || pg_temp.par(21, pg_temp.id('us', 31))$q$,
  'est:tutor:false|est:tio:true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('b4',
  $q$SELECT pg_temp.agregar(1, 20, jsonb_build_object('persona_id', pg_temp.id('us', 30), 'tipo', 'abuelo'))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('b: replacing a principal pair updates the parentesco and keeps it principal',
  $q$SELECT pg_temp.par(20, pg_temp.id('us', 30)) || '|' || pg_temp.principales(20) || '|' || pg_temp.par(20, pg_temp.cu('mama'))$q$,
  'est:abuelo:true|Zzrb Papa|est:tutor:false');

-- ── c. an inverse 'hijo' link becomes one canonical row ──────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('c1',
  $q$SELECT pg_temp.agregar(1, 21, jsonb_build_object('persona_id', pg_temp.id('us', 32), 'tipo', 'abuelo'))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c: the inverse hijo row is replaced by one canonical row with the new tipo, keeping its flag',
  $q$SELECT (pg_temp.ctx('c1')::jsonb ->> 'creado') || '|' || pg_temp.par(21, pg_temp.id('us', 32))$q$, 'false|est:abuelo:false');
SELECT pg_temp.assert_eq('c: the student''s other representantes keep their flags',
  $q$SELECT pg_temp.principales(21) || '|' || pg_temp.par(21, pg_temp.cu('mama')) || '|' || pg_temp.par(21, pg_temp.id('us', 31))$q$,
  'Zzrb Tia|est:tutor:false|est:tio:true');
SELECT pg_temp.assert_eq('c: the other relations of the student are untouched',
  $q$SELECT pg_temp.par(20, pg_temp.id('us', 33)) || '|' || pg_temp.par(20, pg_temp.id('us', 34)) || '|' || pg_temp.par(20, pg_temp.id('us', 36))$q$,
  'est:conyuge:false|rep:padre:false|rep:hijo:false');

-- ── e. quitar ────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar_ctx('e1', $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 30))::text$q$);
SELECT pg_temp.guardar_ctx('e2', $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 30))::text$q$);
SELECT pg_temp.guardar_ctx('e3', $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 36))::text$q$);
SELECT pg_temp.guardar_ctx('e4', $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 33))::text$q$);
SELECT pg_temp.guardar_ctx('e5', $q$SELECT pg_temp.quitar(1, 20, pg_temp.id('us', 34))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('e: removing a canonical link returns true, then false',
  $q$SELECT pg_temp.ctx('e1') || '|' || pg_temp.ctx('e2')$q$, 'true|false');
SELECT pg_temp.assert_eq('e: only the link is gone, the usuario and its campus stay',
  $q$SELECT pg_temp.par(20, pg_temp.id('us', 30)) || '|'
            || (SELECT count(*) FROM public.usuarios WHERE id = pg_temp.id('us', 30)) || '|'
            || (SELECT count(*) FROM public.usuario_campus WHERE usuario_id = pg_temp.id('us', 30))$q$, 'none|1|1');
SELECT pg_temp.assert_eq('e: removing an inverse hijo link returns true and keeps the usuario',
  $q$SELECT pg_temp.ctx('e3') || '|' || pg_temp.par(20, pg_temp.id('us', 36)) || '|'
            || (SELECT count(*) FROM public.usuarios WHERE id = pg_temp.id('us', 36))$q$, 'true|none|1');
SELECT pg_temp.assert_eq('e: a non-representative relation is never removed',
  $q$SELECT pg_temp.ctx('e4') || '|' || pg_temp.par(20, pg_temp.id('us', 33))$q$, 'false|est:conyuge:false');
SELECT pg_temp.assert_eq('e: a relation where the student is the parent is never removed',
  $q$SELECT pg_temp.ctx('e5') || '|' || pg_temp.par(20, pg_temp.id('us', 34))$q$, 'false|rep:padre:false');
SELECT pg_temp.assert_eq('e: the student''s other representantes stay',
  $q$SELECT pg_temp.par(20, pg_temp.cu('mama'))$q$, 'est:tutor:false');

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes both functions, anon neither',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('public', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_representante_agregar', 'estudiantes_representante_quitar')$q$,
  'estudiantes_representante_agregar:true:false:false,estudiantes_representante_quitar:true:false:false');
SELECT pg_temp.assert_eq('l: both are SECURITY DEFINER with an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_representante_agregar', 'estudiantes_representante_quitar')$q$,
  'estudiantes_representante_agregar:true,estudiantes_representante_quitar:true');

SELECT pg_temp.guardar_ctx('foto1', $q$SELECT pg_temp.foto()$q$);
SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();
SELECT pg_temp.assert_raises('l: anon cannot execute agregar',
  $q$SELECT public.estudiantes_representante_agregar(pg_temp.id('gr', 1), pg_temp.id('us', 20),
                                                     jsonb_build_object('persona_id', pg_temp.id('us', 30)))$q$, '42501');
SELECT pg_temp.assert_raises('l: anon cannot execute quitar',
  $q$SELECT public.estudiantes_representante_quitar(pg_temp.id('gr', 1), pg_temp.id('us', 20), pg_temp.cu('mama'))$q$, '42501');
RESET ROLE;
SELECT pg_temp.assert_eq('l: anon changed nothing',
  $q$SELECT (pg_temp.foto() = pg_temp.ctx('foto1'))::text$q$, 'true');

SELECT coalesce(string_agg(case_name, E'\n' ORDER BY case_name), 'ALL OK') AS result FROM t_er_failures;

ROLLBACK;
