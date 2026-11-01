-- Estudiantes C6b4 editing the school years of a ficha (S16)
-- (20261102110000_estudiantes_ficha_leer.sql, with the existing
-- estudiantes_ficha_guardar of 20261029100100).
--
-- Covers:
--   r. estudiantes_ficha: the keys, the years, egresado, puede_editar and the
--      campus scale; a member without ficha; read by the leader (level 1),
--      the entrenadora (2) and a director (3, Inside Out); a graduate cannot
--      be edited; a member of Transit and The Living Room read by the Transit
--      leader.
--   s. estudiantes_ficha_guardar from the editor: the leader saves both
--      years (updated_by is the caller); anio_final NULL takes the last year
--      of the scale and creates the missing ficha; a year outside the scale,
--      an out-of-range number and anio_final < anio_actual raise
--      anio_invalido and leave the ficha unchanged.
--   a. Authority: the leader of another group, a director of another campus,
--      a person without role and an unknown person get sin_autoridad on read
--      and save; the ficha stays unchanged.
--   t. The Living Room: a TLR-only member and a member the caller sees only
--      through a TLR group raise anio_no_aplica; a Transit leader does not see
--      a TLR-only member (sin_autoridad).
--   l. Privileges: authenticated executes estudiantes_ficha, anon not; it is
--      SECURITY DEFINER with an empty search_path.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back.
--
-- Identities (usuario n = auth n): 1 LIDER_A (leads G1), 2 LIDER_B (leads G2),
-- 3 DIR_OTRO (dream_team.direct on Estudiantes, campus 2), 4 NADIE (campus 1,
-- no role), 5 LIDER_TLR (leads G4), 6 ENTRENADORA (Transit › Chicas),
-- 7 DIRECTORA (dream_team.direct on Estudiantes, campus 1). All but 3 belong
-- to campus 1.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit › 6 Grupos de Chicas;
-- 2 › 4 Inside Out › 8 Grupos de Chicas; 1 › 5 The Living Room › 10 Grupos de
-- Chicas. Scale of campus 1: 1–3 Transit, 4–6 Inside Out ("1er año".."6to año").
-- Groups (campus 1): G1 1er año · Chicas (30, 31, 36), G2 2do año · Chicas
-- (32), G3 6to año · Chicas of Inside Out (34), G4 Zona Norte of TLR (33, 36).
-- Fichas: 30 (1, 6), 32 (2, 6), 33 (NULL, NULL), 34 (6, 6, egresada); 31 and
-- 36 have none.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_fi_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fi_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e5a80000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- What the caller reads of a person: 'anio_actual|anio_final|egresado|puede_editar' ('-' for NULL).
CREATE OR REPLACE FUNCTION pg_temp.ficha(p_n int) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v jsonb := public.estudiantes_ficha(pg_temp.id('us', p_n));
BEGIN
  RETURN coalesce(v ->> 'anio_actual', '-') || '|' || coalesce(v ->> 'anio_final', '-')
         || '|' || (v ->> 'egresado') || '|' || (v ->> 'puede_editar');
END;
$$;

-- The stored ficha, read past RLS: 'anio_actual|anio_final|updated_by n' ('-' for NULL, 'none' without ficha).
CREATE OR REPLACE FUNCTION pg_temp.fila(p_n int) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN coalesce((SELECT coalesce(f.anio_actual::text, '-') || '|' || coalesce(f.anio_final::text, '-')
                          || '|' || coalesce((SELECT n::text FROM generate_series(1, 7) n WHERE pg_temp.id('us', n) = f.updated_by), '-')
                     FROM public.estudiantes_fichas f
                    WHERE f.persona_id = pg_temp.id('us', p_n)), 'none');
END;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'fi-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Fi', 'U' || n, 'fi-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 7) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Fi', 'S' || n, 'No especificado', 'Femenino'
  FROM generate_series(30, 36) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Fi Campus 1', 'ZZFI1'),
  (pg_temp.id('ca', 2), 'ZZ Fi Campus 2', 'ZZFI2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 3 THEN 2 ELSE 1 END), true
  FROM (SELECT generate_series(1, 7) AS n UNION ALL SELECT generate_series(30, 36)) AS x
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Fi Experiencia'), (2, 1, 'estudiantes', 'ZZ Fi Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Fi Transit'), (4, 2, 'estudiantes', 'ZZ Fi Inside Out'),
               (5, 1, 'the_living_room', 'ZZ Fi The Living Room'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (8, 4, 'estudiantes', 'Grupos de Chicas'),
               (10, 5, 'the_living_room', 'Grupos de Chicas')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'entrenador', 'lider', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 10), 'lider', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 6, 1), (2, 6, 1), (5, 10, 3), (6, 6, 2)) AS v(n, e, r);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 3), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 7), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id) VALUES
  (pg_temp.id('ca', 1), 1, '1er año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 2, '2do año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 3, '3er año', pg_temp.id('eq', 3)),
  (pg_temp.id('ca', 1), 4, '4to año', pg_temp.id('eq', 4)),
  (pg_temp.id('ca', 1), 5, '5to año', pg_temp.id('eq', 4)),
  (pg_temp.id('ca', 1), 6, '6to año', pg_temp.id('eq', 4));

INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, activo)
SELECT pg_temp.id('gr', n), pg_temp.id('ca', 1), pg_temp.id('eq', e), nombre, anio, true
  FROM (VALUES (1, 6, 'ZZ Fi 1er año · Chicas', 1), (2, 6, 'ZZ Fi 2do año · Chicas', 2),
               (3, 8, 'ZZ Fi 6to año · Chicas', 6), (4, 10, 'ZZ Fi Zona Norte', NULL)) AS v(n, e, nombre, anio);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id, desde)
SELECT pg_temp.id('gr', g), pg_temp.id('se', s), timestamptz '2026-01-01 12:00+00'
  FROM (VALUES (1, 1), (2, 2), (4, 5)) AS v(g, s);

INSERT INTO public.estudiantes_fichas (persona_id, campus_id, anio_actual, anio_final, egresado_at)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), a, f, e
  FROM (VALUES (30, 1, 6, NULL::timestamptz), (32, 2, 6, NULL), (33, NULL, NULL, NULL), (34, 6, 6, now())) AS v(n, a, f, e);
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado)
SELECT pg_temp.id('gr', g), pg_temp.id('us', n), 'miembro'
  FROM (VALUES (1, 30), (1, 31), (1, 36), (2, 32), (3, 34), (4, 33), (4, 36)) AS v(g, n);

GRANT INSERT, SELECT ON t_fi_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.exec(text, text), pg_temp.id(text, int), pg_temp.as_persona(int),
  pg_temp.ficha(int), pg_temp.fila(int)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── r. reading ───────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('r: the leader reads a member''s years',
  $q$SELECT pg_temp.ficha(30)$q$, '1|6|false|true');
SELECT pg_temp.assert_eq('r: the keys, the person and the campus',
  $q$SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(v) k)
            || '|' || (v ->> 'persona_id' = pg_temp.id('us', 30)::text) || '|' || (v ->> 'campus_id' = pg_temp.id('ca', 1)::text)
       FROM public.estudiantes_ficha(pg_temp.id('us', 30)) AS x(v)$q$,
  'anio_actual,anio_final,campus_id,egresado,escala,persona_id,puede_editar|true|true');
SELECT pg_temp.assert_eq('r: the scale of the campus in order, with its ámbito',
  $q$SELECT string_agg((e ->> 'numero') || ':' || (e ->> 'etiqueta') || ':' || (e ->> 'ambito'), ',' ORDER BY n)
       FROM jsonb_array_elements(public.estudiantes_ficha(pg_temp.id('us', 30)) -> 'escala') WITH ORDINALITY AS x(e, n)$q$,
  '1:1er año:ZZ Fi Transit,2:2do año:ZZ Fi Transit,3:3er año:ZZ Fi Transit,'
  || '4:4to año:ZZ Fi Inside Out,5:5to año:ZZ Fi Inside Out,6:6to año:ZZ Fi Inside Out');
SELECT pg_temp.assert_eq('r: a member without ficha has no years and can be edited',
  $q$SELECT pg_temp.ficha(31)$q$, '-|-|false|true');
SELECT pg_temp.assert_eq('r: a member of Transit and The Living Room, read by the Transit leader',
  $q$SELECT pg_temp.ficha(36)$q$, '-|-|false|true');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('r: the entrenadora reads a member of another group of her sub-área',
  $q$SELECT pg_temp.ficha(32)$q$, '2|6|false|true');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('r: the directora reads an Inside Out member; a graduate cannot be edited',
  $q$SELECT pg_temp.ficha(34)$q$, '6|6|true|false');

-- ── s. saving ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.exec('s: the leader saves both years',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 2, 5)$q$);
SELECT pg_temp.assert_eq('s: the saved years, read back and stored with the caller',
  $q$SELECT pg_temp.ficha(30) || '|' || pg_temp.fila(30)$q$, '2|5|false|true|2|5|1');
SELECT pg_temp.exec('s: anio_final NULL',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 31), 3, NULL)$q$);
SELECT pg_temp.assert_eq('s: anio_final NULL takes the last year of the scale and creates the ficha',
  $q$SELECT pg_temp.ficha(31) || '|' || pg_temp.fila(31)$q$, '3|6|false|true|3|6|1');
SELECT pg_temp.assert_raises('s: a year outside the scale',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 7, 7)$q$, '22023', 'anio_invalido');
SELECT pg_temp.assert_raises('s: an out-of-range number',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 99999, NULL)$q$, '22023', 'anio_invalido');
SELECT pg_temp.assert_raises('s: anio_final before anio_actual',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 3, 2)$q$, '22023', 'anio_invalido');
SELECT pg_temp.assert_eq('s: the refused saves leave the ficha unchanged',
  $q$SELECT pg_temp.fila(30)$q$, '2|5|1');

-- ── a. authority ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('a: the leader of another group cannot read',
  $q$SELECT pg_temp.ficha(30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: the leader of another group cannot save',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 1, 6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: a director of another campus cannot read',
  $q$SELECT pg_temp.ficha(30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a director of another campus cannot save',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 1, 6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('a: a person without role cannot read',
  $q$SELECT pg_temp.ficha(30)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a person without role cannot save',
  $q$SELECT public.estudiantes_ficha_guardar(pg_temp.id('us', 30), 1, 6)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: an unknown person',
  $q$SELECT public.estudiantes_ficha('e5a80000-0000-4000-a002-0000000000ff'::uuid)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('a: the refused saves leave the ficha unchanged',
  $q$SELECT pg_temp.fila(30)$q$, '2|5|1');

-- ── t. The Living Room ───────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('t: a TLR-only member has no school year',
  $q$SELECT pg_temp.ficha(33)$q$, '22023', 'anio_no_aplica');
SELECT pg_temp.assert_raises('t: a member seen only through a TLR group has no school year',
  $q$SELECT pg_temp.ficha(36)$q$, '22023', 'anio_no_aplica');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('t: a Transit leader does not see a TLR-only member',
  $q$SELECT pg_temp.ficha(33)$q$, '42501', 'sin_autoridad');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes estudiantes_ficha, anon not',
  $q$SELECT has_function_privilege('authenticated', 'public.estudiantes_ficha(uuid)', 'EXECUTE')
            || '|' || has_function_privilege('anon', 'public.estudiantes_ficha(uuid)', 'EXECUTE')$q$,
  'true|false');
SELECT pg_temp.assert_eq('l: estudiantes_ficha is SECURITY DEFINER with an empty search_path',
  $q$SELECT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'estudiantes_ficha'$q$, 'true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_fi_failures);
END;
$$;
