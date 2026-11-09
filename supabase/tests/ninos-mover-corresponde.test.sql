-- T2f (odd/tasks/ninos-checkin-pco.md, S9.5, L34) — «Mover a otro salón» only
-- to a salón that corresponds to the child's age and grade
-- (20261108160000_ninos_mover_corresponde.sql).
--
-- Covers:
--   a. Grants: ninos_salon_corresponde is internal (PUBLIC, anon and
--      authenticated cannot run it), SECURITY DEFINER with search_path '',
--      STABLE; ninos_mover_salon and ninos_salon_estado keep their grants.
--   b. ninos_salon_corresponde: age in months → Waumba age range (bounds
--      included); grade → UpStreet grade range; special needs → Plus only when
--      the age fits a Waumba age salón; an inactive salón never corresponds;
--      a child with neither birth date nor grade corresponds to any active
--      salón (S9.5: cannot be checked); the preferred salón does not override
--      the rules (L34).
--   c. ninos_mover_salon: a 12-month child cannot go to the 36–59-month salón
--      (salon_no_corresponde, Spanish HINT, nothing written), nor to a grade
--      salón or Plus; it moves between two salones of the same age band (same
--      check-in, code and visit, one audit row); a grade child only to a
--      grade salón that admits its grade; a special-needs child to Plus; a
--      child of unknown age and grade to any salón. The authority checks still
--      come first.
--   d. ninos_salon_estado: destinos stays the salón's list; destinos_por_nino
--      gives, for each child inside, the destinos that correspond to them.
--
-- Run inside BEGIN…ROLLBACK. The last statement is a SELECT of the failing
-- cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (dream_team.coordinate on W and on
-- U), 2 COORDW (coordinate on W only).
-- Tree: R → W (waumba area), R → U (upstreet area).
-- Salones campus 1: S1 'Maternal A' (W, 0–23 m), S2 'Maternal B' (W, 0–23 m),
-- S3 'Preescolar' (W, 36–59 m), S4 'Grado 1' (U, 1–1), S5 'Grados 1–2' (U,
-- 1–2), S6 'Plus' (W, special needs), S7 'Maternal cerrado' (W, 0–23 m,
-- inactive), S8 'Grado 3' (U, 3–3).
-- Turno T1 campus 1. F = today (Caracas).
-- Children (all with ficha):
--   21 12 months, inside S1
--   22 grade 1 (80 months), inside S4
--   23 12 months, special needs, inside S1
--   24 no birth date, no grade, inside S1
--   25 70 months, special needs, no grade (fits no Waumba age salón)
--   26 23 months (upper bound of S1), preferred salón S3
--   27 24 months (just past S1)
--   28 12 months, inside S1 (the authority cases)

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_mc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL,
                                                 p_hint text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hint text;
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message)
       OR (p_hint IS NOT NULL AND v_hint IS DISTINCT FROM p_hint) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '')
        || coalesce(' / ' || p_hint, '') || ', got ' || SQLSTATE || ' ' || SQLERRM || coalesce(' / ' || v_hint, ''));
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('5a2c0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '6c01' WHEN 'us' THEN '6c02' WHEN 'eq' THEN '6c04' WHEN 'sa' THEN '6c06'
                       WHEN 'tu' THEN '6c07' WHEN 'ca' THEN '6c08' WHEN 'ci' THEN '6c09' WHEN 'vi' THEN '6c0a' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_mc_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.f() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('f')::date;
$$;

-- "SELECT public.ninos_salon_corresponde(niño n, S s, F)::text".
CREATE OR REPLACE FUNCTION pg_temp.corresponde(p_nino int, p_salon int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_corresponde(%L::uuid, %L::uuid, %L::date)::text',
                pg_temp.id('us', p_nino), pg_temp.id('sa', p_salon), pg_temp.f());
$$;

-- The salones (by number) that correspond to child n, among S1–S8.
CREATE OR REPLACE FUNCTION pg_temp.corresponden(p_nino int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce(string_agg('S' || s, ',' ORDER BY s), '')
                     FROM generate_series(1, 8) s
                    WHERE public.ninos_salon_corresponde(%L::uuid, pg_temp.id('sa', s), %L::date)$q$,
                pg_temp.id('us', p_nino), pg_temp.f());
$$;

-- "SELECT public.ninos_mover_salon(niño n, T1, F, S destino)".
CREATE OR REPLACE FUNCTION pg_temp.mover(p_nino int, p_destino int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_mover_salon(%L::uuid, %L::uuid, %L::date, %L::uuid, NULL::text)',
                pg_temp.id('us', p_nino), pg_temp.id('tu', 1), pg_temp.f(), pg_temp.id('sa', p_destino));
$$;

-- "salón destino/código" of a move (as the RPC answers it, by number).
CREATE OR REPLACE FUNCTION pg_temp.movido(p_nino int, p_destino int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT (SELECT 'S' || s FROM generate_series(1, 8) s WHERE pg_temp.id('sa', s) = (r ->> 'salon_destino_id')::uuid)
                          || '/' || (r ->> 'codigo') || '/' || (r ->> 'checkin_id')
                     FROM (SELECT (%s) AS r) x$q$, pg_temp.mover(p_nino, p_destino));
$$;

-- "SELECT public.ninos_salon_estado(S n, T1, F)".
CREATE OR REPLACE FUNCTION pg_temp.estado(p_salon int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_estado(%L::uuid, %L::uuid, %L::date)',
                pg_temp.id('sa', p_salon), pg_temp.id('tu', 1), pg_temp.f());
$$;

-- Everything a refused move must leave as it was.
CREATE OR REPLACE FUNCTION pg_temp.escrituras() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.ninos_checkins) || '/'
         || (SELECT coalesce(string_agg(c.id::text || ':' || c.salon_id::text || ':' || c.codigo || ':' || c.visita_id::text,
                                        ',' ORDER BY c.id), '')
               FROM public.ninos_checkins c WHERE c.nino_id::text LIKE '5a2c0000%') || '/'
         || (SELECT count(*) FROM public.ninos_checkin_movimientos);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_mc_ctx (k, v) VALUES
  ('f', (now() AT TIME ZONE 'America/Caracas')::date::text),
  ('ahora', date_trunc('minute', now() AT TIME ZONE 'America/Caracas')::time::text);

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Mc Campus 1', 'ZZMC1');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'mc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Mc', 'U' || n, 'mc-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Mc Niño', 'N' || n, 'No especificado', 'Otro',
       CASE n WHEN 22 THEN (pg_temp.f() - interval '80 months')::date
              WHEN 24 THEN NULL
              WHEN 25 THEN (pg_temp.f() - interval '70 months')::date
              WHEN 26 THEN (pg_temp.f() - interval '23 months 3 days')::date
              WHEN 27 THEN (pg_temp.f() - interval '24 months 3 days')::date
              ELSE (pg_temp.f() - interval '12 months 3 days')::date END
  FROM generate_series(21, 28) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Mc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Mc W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 1), 'ZZ Mc U', true);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses,
                                  grado_min, grado_max, es_necesidades_especiales, orden, activo) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Mc Maternal A', 18, 0, 23, NULL, NULL, false, 1, true),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Mc Maternal B', 18, 0, 23, NULL, NULL, false, 2, true),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Mc Preescolar', 20, 36, 59, NULL, NULL, false, 3, true),
  (pg_temp.id('sa', 4), pg_temp.id('ca', 1), pg_temp.id('eq', 3), 'upstreet', 'ZZ Mc Grado 1', 20, NULL, NULL, 1, 1, false, 4, true),
  (pg_temp.id('sa', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 3), 'upstreet', 'ZZ Mc Grados 1-2', 20, NULL, NULL, 1, 2, false, 5, true),
  (pg_temp.id('sa', 6), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Mc Plus', 10, NULL, NULL, NULL, NULL, true, 6, true),
  (pg_temp.id('sa', 7), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Mc Maternal cerrado', 18, 0, 23, NULL, NULL, false, 0, false),
  (pg_temp.id('sa', 8), pg_temp.id('ca', 1), pg_temp.id('eq', 3), 'upstreet', 'ZZ Mc Grado 3', 20, NULL, NULL, 3, 3, false, 8, true);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Mc T1', extract(dow FROM pg_temp.f())::smallint, pg_temp.ctx('ahora')::time, 911, true, 'semanal');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 2) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_fichas (usuario_id, grado, necesidades_especiales, salon_preferido_id)
SELECT pg_temp.id('us', n), CASE WHEN n = 22 THEN 1 END, CASE WHEN n IN (23, 25) THEN 'ZZ TEA' END,
       CASE WHEN n = 26 THEN pg_temp.id('sa', 3) END
  FROM generate_series(21, 28) AS n;

-- Inside: 21, 23, 24, 28 in Maternal A; 22 in Grado 1. One visit and code each.
INSERT INTO public.ninos_checkins (id, nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at)
SELECT pg_temp.id('ci', n), pg_temp.id('us', n), pg_temp.id('sa', CASE WHEN n = 22 THEN 4 ELSE 1 END), pg_temp.id('tu', 1),
       pg_temp.id('ca', 1), pg_temp.f(), pg_temp.id('vi', n), (5000 + n)::text, now() - interval '20 minutes'
  FROM unnest(ARRAY[21, 22, 23, 24, 28]) AS n;

GRANT INSERT, SELECT, UPDATE ON t_mc_failures, t_mc_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text),
  pg_temp.f(), pg_temp.corresponde(int, int), pg_temp.corresponden(int), pg_temp.mover(int, int), pg_temp.movido(int, int),
  pg_temp.estado(int)
  TO authenticated, anon;

-- ── a. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: ninos_salon_corresponde is internal; mover and estado keep their grants',
  $q$SELECT string_agg(has_function_privilege('public', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('anon', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_mover_salon(uuid, uuid, date, uuid, text)',
                         'public.ninos_salon_corresponde(uuid, uuid, date)',
                         'public.ninos_salon_estado(uuid, uuid, date)']) f$q$,
  'false/false/true,false/false/false,false/false/true');
SELECT pg_temp.assert_eq('a: SECURITY DEFINER, search_path empty; helper and read STABLE, move VOLATILE',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') || ':' || p.provolatile::text,
                       ',' ORDER BY p.proname)
       FROM pg_proc p
      WHERE p.oid IN ('public.ninos_mover_salon(uuid, uuid, date, uuid, text)'::regprocedure,
                      'public.ninos_salon_corresponde(uuid, uuid, date)'::regprocedure,
                      'public.ninos_salon_estado(uuid, uuid, date)'::regprocedure)$q$,
  'ninos_mover_salon:true:search_path="":v,ninos_salon_corresponde:true:search_path="":s,ninos_salon_estado:true:search_path="":s');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: authenticated cannot call the helper', pg_temp.corresponde(21, 2), '42501');
RESET ROLE;

-- ── b. ninos_salon_corresponde ───────────────────────────────────────

SELECT pg_temp.assert_eq('b: 12 months: the two 0–23 salones only (not 36–59, grade, Plus, inactive)',
  pg_temp.corresponden(21), 'S1,S2');
SELECT pg_temp.assert_eq('b: grade 1: the grade salones that admit grade 1 (not grade 3, not the age salones)',
  pg_temp.corresponden(22), 'S4,S5');
SELECT pg_temp.assert_eq('b: 12 months with special needs: its age salones and Plus',
  pg_temp.corresponden(23), 'S1,S2,S6');
SELECT pg_temp.assert_eq('b: no birth date and no grade: every active salón (cannot be checked)',
  pg_temp.corresponden(24), 'S1,S2,S3,S4,S5,S6,S8');
SELECT pg_temp.assert_eq('b: special needs but no Waumba age salón fits: not Plus, nowhere',
  pg_temp.corresponden(25), '');
SELECT pg_temp.assert_eq('b: 23 months is inside 0–23; the preferred salón (36–59) does not override (L34)',
  pg_temp.corresponden(26), 'S1,S2');
SELECT pg_temp.assert_eq('b: 24 months is past 0–23 and before 36–59', pg_temp.corresponden(27), '');
SELECT pg_temp.assert_eq('b: an inactive salón never corresponds, not even for an unknown child',
  pg_temp.corresponde(24, 7), 'false');

SELECT pg_temp.assert_eq('b: the expected salón ignores a preferred salón that does not correspond (L34)',
  format('SELECT public.ninos_salon_esperado(%L::uuid, %L::uuid, %L::date)::text',
         pg_temp.id('us', 26), pg_temp.id('ca', 1), pg_temp.f()), pg_temp.id('sa', 1)::text);
UPDATE public.ninos_fichas SET salon_preferido_id = pg_temp.id('sa', 2) WHERE usuario_id = pg_temp.id('us', 26);
SELECT pg_temp.assert_eq('b: a preferred salón that corresponds still wins',
  format('SELECT public.ninos_salon_esperado(%L::uuid, %L::uuid, %L::date)::text',
         pg_temp.id('us', 26), pg_temp.id('ca', 1), pg_temp.f()), pg_temp.id('sa', 2)::text);
UPDATE public.ninos_fichas SET salon_preferido_id = pg_temp.id('sa', 3) WHERE usuario_id = pg_temp.id('us', 26);

-- ── c. ninos_mover_salon ─────────────────────────────────────────────

INSERT INTO t_mc_ctx (k, v) VALUES ('antes', pg_temp.escrituras());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_raises('c: a 12-month child cannot go to the 36–59-month salón', pg_temp.mover(21, 3),
  '22023', 'salon_no_corresponde', 'Ese salón no corresponde a la edad o el grado del niño.');
SELECT pg_temp.assert_raises('c: nor to a grade salón', pg_temp.mover(21, 4), '22023', 'salon_no_corresponde');
SELECT pg_temp.assert_raises('c: nor to Plus without special needs', pg_temp.mover(21, 6), '22023', 'salon_no_corresponde');
SELECT pg_temp.assert_raises('c: a grade-1 child cannot go to grade 3', pg_temp.mover(22, 8), '22023', 'salon_no_corresponde');
SELECT pg_temp.assert_raises('c: nor to an age salón', pg_temp.mover(22, 3), '22023', 'salon_no_corresponde');
SELECT pg_temp.assert_raises('c: the inactive salón is still salon_invalido', pg_temp.mover(21, 7), '22023', 'salon_invalido');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: without authority on the destination it is still sin_autoridad', pg_temp.mover(28, 4),
  '42501', 'sin_autoridad', 'No tienes permiso para pasar niños a ese salón.');
SELECT pg_temp.as_persona(1);
RESET ROLE;
SELECT pg_temp.assert_eq('c: the refused moves wrote nothing', 'SELECT pg_temp.escrituras()', pg_temp.ctx('antes'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('c: 12 months moves between the two 0–23 salones: same check-in and code',
  pg_temp.movido(21, 2), 'S2/5021/' || pg_temp.id('ci', 21)::text);
SELECT pg_temp.assert_eq('c: grade 1 moves to Grados 1–2', pg_temp.movido(22, 5), 'S5/5022/' || pg_temp.id('ci', 22)::text);
SELECT pg_temp.assert_eq('c: special needs moves to Plus', pg_temp.movido(23, 6), 'S6/5023/' || pg_temp.id('ci', 23)::text);
SELECT pg_temp.assert_eq('c: unknown age and grade moves to Preescolar', pg_temp.movido(24, 3), 'S3/5024/' || pg_temp.id('ci', 24)::text);
RESET ROLE;
SELECT pg_temp.assert_eq('c: the accepted moves: same visit, still open, one audit row each by the coordinator',
  $q$SELECT string_agg(u.apellido || ':' || (c.visita_id = pg_temp.id('vi', substr(u.apellido, 2)::int))::text || ':'
                       || (c.salida_at IS NULL)::text || ':'
                       || (SELECT count(*) FROM public.ninos_checkin_movimientos m
                            WHERE m.checkin_id = c.id AND m.movido_por = pg_temp.id('us', 1))::text,
                       ',' ORDER BY u.apellido)
       FROM public.ninos_checkins c JOIN public.usuarios u ON u.id = c.nino_id
      WHERE c.nino_id::text LIKE '5a2c0000%' AND u.apellido IN ('N21', 'N22', 'N23', 'N24')$q$,
  'N21:true:true:1,N22:true:true:1,N23:true:true:1,N24:true:true:1');

-- ── d. ninos_salon_estado: destinos_por_nino ─────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
-- Inside Maternal B now: 21 (12 months). Inside Maternal A: 28 (12 months).
SELECT pg_temp.assert_eq('d: destinos stays the salón''s list (every operable active salón but this one)',
  format($q$SELECT string_agg(d ->> 'nombre', ',' ORDER BY d ->> 'nombre') FROM jsonb_array_elements((%s) -> 'destinos') d$q$,
         pg_temp.estado(1)),
  'ZZ Mc Grado 1,ZZ Mc Grado 3,ZZ Mc Grados 1-2,ZZ Mc Maternal B,ZZ Mc Plus,ZZ Mc Preescolar');
SELECT pg_temp.assert_eq('d: destinos_por_nino: for each child inside, the destinos that correspond',
  format($q$SELECT string_agg(k || '=' || (SELECT coalesce(string_agg(s.nombre, '+' ORDER BY s.nombre), '')
                                            FROM jsonb_array_elements_text(v) x JOIN public.ninos_salones s ON s.id = x::uuid),
                              ',' ORDER BY k)
              FROM jsonb_each((%s) -> 'destinos_por_nino') e(k, v)$q$, pg_temp.estado(2)),
  pg_temp.id('us', 21)::text || '=ZZ Mc Maternal A');
SELECT pg_temp.assert_eq('d: in Preescolar the child of unknown age gets every destino',
  format($q$SELECT jsonb_array_length((%s) -> 'destinos_por_nino' -> %L)::text$q$, pg_temp.estado(3), pg_temp.id('us', 24)),
  '6');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d: a coordinator of W only: destinos_por_nino lists only what it may operate',
  format($q$SELECT (SELECT string_agg(s.nombre, '+' ORDER BY s.nombre)
                      FROM jsonb_array_elements_text((%s) -> 'destinos_por_nino' -> %L) x
                      JOIN public.ninos_salones s ON s.id = x::uuid)$q$, pg_temp.estado(3), pg_temp.id('us', 24)),
  'ZZ Mc Maternal A+ZZ Mc Maternal B+ZZ Mc Plus');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_mc_failures;

ROLLBACK;
