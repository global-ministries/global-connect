-- T2g (odd/tasks/ninos-checkin-pco.md, S9.5) — ninos_salon_corresponde and
-- ninos_salon_esperado measure the age on the salón's reference date (fecha
-- de corte and promoción) exactly like the TS engine
-- (lib/platform/ninos/sugerir-salon.ts fechaReferencia / edadParaSalon;
-- 20261108180000_ninos_corresponde_corte.sql).
--
-- Covers:
--   a. Grants: the helpers and ninos_salon_corresponde are internal (PUBLIC,
--      anon and authenticated cannot run them); SECURITY DEFINER with
--      search_path ''; the helpers IMMUTABLE, corresponde STABLE.
--   b. ninos_salon_fecha_referencia: the cases of the TS fechaReferencia
--      tests (no rule → the service date; corte + promoción → the corte of the
--      cycle started on the last promoción; only a corte → the last corte;
--      only a promoción → the last promoción; 29 Feb → 28 Feb in a common
--      year).
--   c. ninos_edad_para_salon: the TS edadParaSalon cases (48 with the rule,
--      47 without; null for no or a future birth date; a baby born after the
--      last corte is 0).
--   d. ninos_salon_corresponde, mirroring the TS sugerirSalon rules tests
--      (same inputs → same salón): born 2022-11-20 on 2026-11-08 is pre2
--      without the rule, pre3 with corte 1 dic / promoción 1 ago; born
--      2022-12-15 is pre3 on 2027-01-10 without the rule, pre2 with it, pre3
--      again from the promoción (2027-08-01); a baby born after the last corte
--      corresponds to maternal; special needs go to Plus only when the age on
--      the reference date fits a Waumba age salón.
--   e. Without corte nothing changes: the age on the service date, bounds
--      included; grade salones and unknown children as before.
--   f. ninos_salon_esperado picks by the same age.
--
-- Run inside BEGIN…ROLLBACK. The last statement is a SELECT of the failing
-- cases ('ALL OK' when none).
--
-- Campus 1, no rule: S1 'Pre2' (W, 36–47 m), S2 'Pre3' (W, 48–71 m), S3
-- 'Grado 1' (U, 1–1).
-- Campus 2, corte 1 dic + promoción 1 ago: S4 'Pre2' (36–47), S5 'Pre3'
-- (48–71).
-- Campus 3, only corte 1 dic: S6 'Maternal' (W, 0–23).
-- Campus 4, corte + promoción: S7 'Waumba' (W, 0–47), S8 'Plus' (W, special
-- needs).
-- Children (all with ficha): 21 born 2022-11-20; 22 born 2022-12-15; 23 born
-- 2026-01-10; 24 born 2022-11-20 with special needs; 25 no birth date, no
-- grade; 26 grade 1, born 2019-06-01; 27 born 2022-11-08 (47 → 48 months on
-- 2026-11-08 exactly).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('5a2d0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '7d01' WHEN 'us' THEN '7d02' WHEN 'eq' THEN '7d04' WHEN 'sa' THEN '7d06'
                       WHEN 'ca' THEN '7d08' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The salones (by number, among S1–S8) that correspond to child n on date d.
CREATE OR REPLACE FUNCTION pg_temp.corresponden(p_nino int, p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce(string_agg('S' || s, ',' ORDER BY s), '')
                     FROM generate_series(1, 8) s
                    WHERE public.ninos_salon_corresponde(%L::uuid, pg_temp.id('sa', s), %L::date)$q$,
                pg_temp.id('us', p_nino), p_fecha);
$$;

-- The expected salón (by number) of child n in campus c on date d.
CREATE OR REPLACE FUNCTION pg_temp.esperado(p_nino int, p_campus int, p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce((SELECT 'S' || s FROM generate_series(1, 8) s
                                     WHERE pg_temp.id('sa', s) = public.ninos_salon_esperado(%L::uuid, %L::uuid, %L::date)), 'ninguno')$q$,
                pg_temp.id('us', p_nino), pg_temp.id('ca', p_campus), p_fecha);
$$;

-- "ninos_salon_fecha_referencia(corte, promoción, fecha)::text".
CREATE OR REPLACE FUNCTION pg_temp.referencia(p_cm int, p_cd int, p_pm int, p_pd int, p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_fecha_referencia(%s, %s, %s, %s, %L::date)::text',
                coalesce(p_cm::text, 'NULL'), coalesce(p_cd::text, 'NULL'), coalesce(p_pm::text, 'NULL'), coalesce(p_pd::text, 'NULL'), p_fecha);
$$;

-- "ninos_edad_para_salon(nacimiento, fecha, corte, promoción)::text".
CREATE OR REPLACE FUNCTION pg_temp.edad(p_nac date, p_fecha date, p_cm int, p_cd int, p_pm int, p_pd int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_edad_para_salon(%L::date, %L::date, %s, %s, %s, %s)::text',
                p_nac, p_fecha, coalesce(p_cm::text, 'NULL'), coalesce(p_cd::text, 'NULL'),
                coalesce(p_pm::text, 'NULL'), coalesce(p_pd::text, 'NULL'));
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO public.campus (id, nombre, codigo)
SELECT pg_temp.id('ca', n), 'ZZ Cc Campus ' || n, 'ZZCC' || n FROM generate_series(1, 4) AS n;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.id('au', 1), 'authenticated', 'authenticated', 'cc-1@example.test', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Cc', 'U1', 'cc-1@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Cc Niño', 'N' || n, 'No especificado', 'Otro',
       CASE n WHEN 21 THEN DATE '2022-11-20' WHEN 22 THEN DATE '2022-12-15' WHEN 23 THEN DATE '2026-01-10'
              WHEN 24 THEN DATE '2022-11-20' WHEN 25 THEN NULL WHEN 26 THEN DATE '2019-06-01'
              WHEN 27 THEN DATE '2022-11-08' END
  FROM generate_series(21, 27) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Cc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cc W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 1), 'ZZ Cc U', true);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses,
                                  grado_min, grado_max, es_necesidades_especiales, orden, activo,
                                  corte_mes, corte_dia, promocion_mes, promocion_dia) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Pre2', 20, 36, 47, NULL, NULL, false, 30, true, NULL, NULL, NULL, NULL),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Pre3', 20, 48, 71, NULL, NULL, false, 40, true, NULL, NULL, NULL, NULL),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 3), 'upstreet', 'ZZ Cc Grado 1', 20, NULL, NULL, 1, 1, false, 110, true, NULL, NULL, NULL, NULL),
  (pg_temp.id('sa', 4), pg_temp.id('ca', 2), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Pre2 corte', 20, 36, 47, NULL, NULL, false, 30, true, 12, 1, 8, 1),
  (pg_temp.id('sa', 5), pg_temp.id('ca', 2), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Pre3 corte', 20, 48, 71, NULL, NULL, false, 40, true, 12, 1, 8, 1),
  (pg_temp.id('sa', 6), pg_temp.id('ca', 3), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Maternal corte', 20, 0, 23, NULL, NULL, false, 10, true, 12, 1, NULL, NULL),
  (pg_temp.id('sa', 7), pg_temp.id('ca', 4), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Waumba corte', 20, 0, 47, NULL, NULL, false, 10, true, 12, 1, 8, 1),
  (pg_temp.id('sa', 8), pg_temp.id('ca', 4), pg_temp.id('eq', 2), 'waumba', 'ZZ Cc Plus', 10, NULL, NULL, NULL, NULL, true, 50, true, NULL, NULL, NULL, NULL);

INSERT INTO public.ninos_fichas (usuario_id, grado, necesidades_especiales)
SELECT pg_temp.id('us', n), CASE WHEN n = 26 THEN 1 END, CASE WHEN n = 24 THEN 'ZZ TEA' END
  FROM generate_series(21, 27) AS n;

GRANT INSERT, SELECT ON t_cc_failures TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.corresponden(int, date), pg_temp.referencia(int, int, int, int, date),
  pg_temp.edad(date, date, int, int, int, int)
  TO authenticated, anon;

-- ── a. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: the helpers and ninos_salon_corresponde are internal',
  $q$SELECT string_agg(has_function_privilege('public', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('anon', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_edad_meses(date, date)',
                         'public.ninos_edad_para_salon(date, date, integer, integer, integer, integer)',
                         'public.ninos_salon_corresponde(uuid, uuid, date)',
                         'public.ninos_salon_fecha_referencia(integer, integer, integer, integer, date)']) f$q$,
  'false/false/false,false/false/false,false/false/false,false/false/false');
SELECT pg_temp.assert_eq('a: SECURITY DEFINER, search_path empty; helpers IMMUTABLE, corresponde STABLE',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') || ':' || p.provolatile::text,
                       ',' ORDER BY p.proname)
       FROM pg_proc p
      WHERE p.oid IN ('public.ninos_edad_meses(date, date)'::regprocedure,
                      'public.ninos_edad_para_salon(date, date, integer, integer, integer, integer)'::regprocedure,
                      'public.ninos_salon_corresponde(uuid, uuid, date)'::regprocedure,
                      'public.ninos_salon_fecha_referencia(integer, integer, integer, integer, date)'::regprocedure)$q$,
  'ninos_edad_meses:true:search_path="":i,ninos_edad_para_salon:true:search_path="":i,'
  || 'ninos_salon_corresponde:true:search_path="":s,ninos_salon_fecha_referencia:true:search_path="":i');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: authenticated cannot call the reference date helper',
  pg_temp.referencia(12, 1, 8, 1, DATE '2026-11-08'), '42501');
SELECT pg_temp.assert_raises('a: nor the age helper', pg_temp.edad(DATE '2022-11-20', DATE '2026-11-08', 12, 1, 8, 1), '42501');
RESET ROLE;

-- ── b. reference date (TS fechaReferencia) ───────────────────────────

SELECT pg_temp.assert_eq('b: no rule: the service date', pg_temp.referencia(NULL, NULL, NULL, NULL, DATE '2026-11-08'), '2026-11-08');
SELECT pg_temp.assert_eq('b: corte + promoción: the corte of the cycle started on the last promoción',
  $q$SELECT string_agg(public.ninos_salon_fecha_referencia(12, 1, 8, 1, d)::text, ',' ORDER BY d)
       FROM unnest(ARRAY[DATE '2026-11-08', DATE '2027-01-10', DATE '2027-07-31', DATE '2027-08-01']) d$q$,
  '2026-12-01,2026-12-01,2026-12-01,2027-12-01');
SELECT pg_temp.assert_eq('b: only a corte: the last corte', pg_temp.referencia(12, 1, NULL, NULL, DATE '2026-11-08'), '2025-12-01');
SELECT pg_temp.assert_eq('b: only a corte, on the corte day', pg_temp.referencia(12, 1, NULL, NULL, DATE '2026-12-01'), '2026-12-01');
SELECT pg_temp.assert_eq('b: only a promoción: the last promoción', pg_temp.referencia(NULL, NULL, 8, 1, DATE '2026-11-08'), '2026-08-01');
SELECT pg_temp.assert_eq('b: 29 Feb is 28 Feb in a common year', pg_temp.referencia(2, 29, NULL, NULL, DATE '2027-03-01'), '2027-02-28');
SELECT pg_temp.assert_eq('b: 29 Feb in a leap year', pg_temp.referencia(2, 29, NULL, NULL, DATE '2028-03-01'), '2028-02-29');

-- ── c. age for a salón (TS edadParaSalon) ────────────────────────────

SELECT pg_temp.assert_eq('c: on the reference date with the rule', pg_temp.edad(DATE '2022-11-20', DATE '2026-11-08', 12, 1, 8, 1), '48');
SELECT pg_temp.assert_eq('c: on the service date without it', pg_temp.edad(DATE '2022-11-20', DATE '2026-11-08', NULL, NULL, NULL, NULL), '47');
SELECT pg_temp.assert_eq('c: no birth date', pg_temp.edad(NULL, DATE '2026-11-08', 12, 1, 8, 1), NULL);
SELECT pg_temp.assert_eq('c: a birth date after the service', pg_temp.edad(DATE '2027-01-01', DATE '2026-11-08', 12, 1, 8, 1), NULL);
SELECT pg_temp.assert_eq('c: a baby born after the last corte is 0', pg_temp.edad(DATE '2026-01-10', DATE '2026-11-08', 12, 1, NULL, NULL), '0');
SELECT pg_temp.assert_eq('c: completed months count the day of the month, as the TS engine',
  $q$SELECT string_agg(public.ninos_edad_meses(n, DATE '2026-02-28')::text, ',' ORDER BY n)
       FROM unnest(ARRAY[DATE '2025-01-31', DATE '2025-02-28', DATE '2026-02-28', DATE '2026-03-01']) n$q$,
  '12,12,0');

-- ── d. ninos_salon_corresponde with corte and promoción ──────────────

SELECT pg_temp.assert_eq('d: born 2022-11-20 on 2026-11-08: Pre2 without the rule, Pre3 with it',
  pg_temp.corresponden(21, DATE '2026-11-08'), 'S1,S5');
SELECT pg_temp.assert_eq('d: born 2022-12-15 on 2027-01-10: Pre3 without the rule, Pre2 with it until the promoción',
  pg_temp.corresponden(22, DATE '2027-01-10'), 'S2,S4,S7');
SELECT pg_temp.assert_eq('d: born 2022-12-15 on 2027-08-01 (promoción): Pre3 with the rule too',
  pg_temp.corresponden(22, DATE '2027-08-01'), 'S2,S5');
SELECT pg_temp.assert_eq('d: a baby born after the last corte corresponds to maternal',
  pg_temp.corresponden(23, DATE '2026-11-08'), 'S6,S7');
SELECT pg_temp.assert_eq('d: special needs: Plus only when the age on the reference date fits a Waumba age salón',
  pg_temp.corresponden(24, DATE '2026-11-08'), 'S1,S5');
SELECT pg_temp.assert_eq('d: the same child before the corte cycle fits the Waumba salón and Plus',
  pg_temp.corresponden(24, DATE '2026-07-31'), 'S1,S4,S7,S8');

-- ── e. without corte nothing changes ─────────────────────────────────

SELECT pg_temp.assert_eq('e: 48 months exactly on the service date: Pre3 (bounds included)',
  pg_temp.corresponden(27, DATE '2026-11-08'), 'S2,S5');
SELECT pg_temp.assert_eq('e: the day before: 47 months, Pre2',
  pg_temp.corresponden(27, DATE '2026-11-07'), 'S1,S5');
SELECT pg_temp.assert_eq('e: a grade child: its grade salón (and no age salón of another age)',
  pg_temp.corresponden(26, DATE '2026-11-08'), 'S3');
SELECT pg_temp.assert_eq('e: no birth date and no grade: every active salón, as before',
  pg_temp.corresponden(25, DATE '2026-11-08'), 'S1,S2,S3,S4,S5,S6,S7,S8');

-- ── f. ninos_salon_esperado by the same age ──────────────────────────

SELECT pg_temp.assert_eq('f: without the rule the expected salón is Pre2', pg_temp.esperado(21, 1, DATE '2026-11-08'), 'S1');
SELECT pg_temp.assert_eq('f: with corte and promoción it is Pre3', pg_temp.esperado(21, 2, DATE '2026-11-08'), 'S5');
SELECT pg_temp.assert_eq('f: and Pre2 for a birthday after the corte', pg_temp.esperado(22, 2, DATE '2027-01-10'), 'S4');
SELECT pg_temp.assert_eq('f: special needs go to Plus only when the age on the reference date fits',
  $q$SELECT (SELECT 'S' || s FROM generate_series(1, 8) s
              WHERE pg_temp.id('sa', s) = public.ninos_salon_esperado(pg_temp.id('us', 24), pg_temp.id('ca', 4), DATE '2026-07-31'))
            || ',' || coalesce((SELECT 'S' || s FROM generate_series(1, 8) s
              WHERE pg_temp.id('sa', s) = public.ninos_salon_esperado(pg_temp.id('us', 24), pg_temp.id('ca', 4), DATE '2026-11-08')), 'ninguno')$q$,
  'S8,ninguno');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cc_failures;

ROLLBACK;
