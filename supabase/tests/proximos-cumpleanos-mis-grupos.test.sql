-- T8 (odd/tasks/home-por-rol.md, S14a, L18–L19) — upcoming birthdays of the
-- caller's groupmates (20261110110000_proximos_cumpleanos_mis_grupos.sql).
--
-- Covers:
--   a. A Miembro sees a groupmate's birthday in the window with mes, dia and
--      the next date, and the function has no year or age column.
--   b. Not seen: the caller themself; someone outside the window; a member
--      of another group; someone who left (fecha_salida); a member of an
--      inactive or eliminado group; someone without fecha_nacimiento.
--   c. The window: today included, the last day included, p_dias clamped to
--      1..60 (NULL → 30); someone in two shared groups comes once per group;
--      order by proxima, nombre.
--   d. Colíder and Líder see their groupmates too; a person without groups
--      and a call without session get no rows.
--   e. 29 Feb: the next birthday is 29 Feb in a leap year and 28 Feb
--      otherwise (computed here independently of the function).
--   f. anon cannot execute; definer, stable, empty search_path.
--
-- The birthdays are relative to today in Caracas (birth year 2000, a leap
-- year, so every month-day exists). Run against STAGING inside
-- BEGIN…ROLLBACK. The last statement is a SELECT of the failing cases
-- ('ALL OK' when none). Before the migration every case that calls the
-- function fails (RED).
--
-- Identities (usuario n = auth n; apellido = tag; birthday = today + k):
--   1 M1 Miembro G1, G3, G4, G5 (k 4) · 2 LID Líder G1 (k 3)
--   3 COL Colíder G1 (k 5) · 4 FAR Miembro G1 (k 45) · 5 VFAR Miembro G1 (k 90)
--   6 LEFT left G1 (k 2) · 7 OTHER Líder G2 (k 1) · 8 NOGRP no group (k 1)
--   9 FEB29 Miembro G1 (2000-02-29) · 10 INACT Miembro G3 inactive (k 6)
--   11 ELIM Miembro G4 eliminado (k 7) · 12 NOBIRTH Miembro G1 (no date)
--   13 BOTH Miembro G1 and G5 (k 8) · 14 TODAY Miembro G1 (k 0)

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cm_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cm_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9300000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9301' WHEN 'us' THEN '9302' WHEN 'gr' THEN '9303' WHEN 'se' THEN '9304' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.hoy() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Caracas')::date;
$$;

-- The birth date (year 2000) whose month and day are today + k.
CREATE OR REPLACE FUNCTION pg_temp.nacido(p_k int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT make_date(2000, EXTRACT(MONTH FROM pg_temp.hoy() + p_k)::int, EXTRACT(DAY FROM pg_temp.hoy() + p_k)::int);
$$;

-- 'mes|dia' of today + k.
CREATE OR REPLACE FUNCTION pg_temp.mes_dia(p_k int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(MONTH FROM pg_temp.hoy() + p_k)::int || '|' || EXTRACT(DAY FROM pg_temp.hoy() + p_k)::int;
$$;

-- The next 29 Feb birthday from p_hoy, written apart from the function.
CREATE OR REPLACE FUNCTION pg_temp.proximo_29_feb(p_hoy date) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_anio int := EXTRACT(YEAR FROM p_hoy)::int;
  v_fecha date;
BEGIN
  FOR v_y IN v_anio .. v_anio + 1 LOOP
    v_fecha := make_date(v_y, 2, CASE WHEN (v_y % 4 = 0 AND v_y % 100 <> 0) OR v_y % 400 = 0 THEN 29 ELSE 28 END);
    IF v_fecha >= p_hoy THEN
      RETURN v_fecha;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

SELECT pg_temp.fail('setup', 'there is no active temporada on this database')
 WHERE NOT EXISTS (SELECT 1 FROM public.temporadas WHERE activa);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cm-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 14) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', p.n), pg_temp.id('au', p.n), 'ZZ Cm', p.tag, 'cm-' || p.n || '@example.test', 'No especificado', 'Otro',
       CASE p.tag WHEN 'FEB29' THEN DATE '2000-02-29' WHEN 'NOBIRTH' THEN NULL ELSE pg_temp.nacido(p.k) END
  FROM (VALUES (1, 'M1', 4), (2, 'LID', 3), (3, 'COL', 5), (4, 'FAR', 45), (5, 'VFAR', 90), (6, 'LEFT', 2),
               (7, 'OTHER', 1), (8, 'NOGRP', 1), (9, 'FEB29', 0), (10, 'INACT', 6), (11, 'ELIM', 7),
               (12, 'NOBIRTH', 0), (13, 'BOTH', 8), (14, 'TODAY', 0)) AS p(n, tag, k);

INSERT INTO public.segmentos (id, nombre) VALUES (pg_temp.id('se', 1), 'ZZ Cm S1');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, eliminado)
SELECT pg_temp.id('gr', g.n), 'ZZ Cm G' || g.n, (SELECT id FROM public.temporadas WHERE activa LIMIT 1),
       pg_temp.id('se', 1), g.activo, g.eliminado
  FROM (VALUES (1, true, false), (2, true, false), (3, false, false), (4, true, true), (5, true, false)) AS g(n, activo, eliminado);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_salida)
SELECT pg_temp.id('gr', m.g), pg_temp.id('us', m.u), m.rol::public.enum_rol_grupo, 'activo', m.salida
  FROM (VALUES (1, 1, 'Miembro', NULL::timestamptz), (1, 2, 'Líder', NULL), (1, 3, 'Colíder', NULL),
               (1, 4, 'Miembro', NULL), (1, 5, 'Miembro', NULL), (1, 6, 'Miembro', now()),
               (1, 9, 'Miembro', NULL), (1, 12, 'Miembro', NULL), (1, 13, 'Miembro', NULL), (1, 14, 'Miembro', NULL),
               (2, 7, 'Líder', NULL),
               (3, 1, 'Miembro', NULL), (3, 10, 'Miembro', NULL),
               (4, 1, 'Miembro', NULL), (4, 11, 'Miembro', NULL),
               (5, 1, 'Miembro', NULL), (5, 13, 'Miembro', NULL)) AS m(g, u, rol, salida);

GRANT INSERT, SELECT ON t_cm_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text), pg_temp.as_persona(int),
  pg_temp.id(text, int), pg_temp.hoy(), pg_temp.nacido(int), pg_temp.mes_dia(int), pg_temp.proximo_29_feb(date) TO authenticated;

SET LOCAL ROLE authenticated;

-- ── a. a Miembro sees a groupmate, day and month only ────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the Miembro sees the Líder''s birthday with mes, dia and the next date',
  $q$SELECT concat_ws('|', nombre, apellido, grupo_id = pg_temp.id('gr', 1), grupo_nombre, mes, dia, proxima = pg_temp.hoy() + 3)
       FROM public.proximos_cumpleanos_mis_grupos() WHERE usuario_id = pg_temp.id('us', 2)$q$,
  'ZZ Cm|LID|t|ZZ Cm G1|' || pg_temp.mes_dia(3) || '|t');
SELECT pg_temp.assert_eq('a: no year or age column',
  $q$SELECT array_to_string(p.proargnames, ',')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'proximos_cumpleanos_mis_grupos'$q$,
  'p_dias,usuario_id,nombre,apellido,grupo_id,grupo_nombre,mes,dia,proxima');

-- ── b. who is not seen ───────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: not the caller, outside the window, another group, left, inactive, eliminado, no date',
  $q$SELECT string_agg(t.tag || '=' || (SELECT count(*) FROM public.proximos_cumpleanos_mis_grupos() r WHERE r.usuario_id = pg_temp.id('us', t.n)), ',' ORDER BY t.n)
       FROM (VALUES (1, 'M1'), (4, 'FAR'), (5, 'VFAR'), (6, 'LEFT'), (7, 'OTHER'), (8, 'NOGRP'),
                    (10, 'INACT'), (11, 'ELIM'), (12, 'NOBIRTH')) AS t(n, tag)$q$,
  'M1=0,FAR=0,VFAR=0,LEFT=0,OTHER=0,NOGRP=0,INACT=0,ELIM=0,NOBIRTH=0');

-- ── c. the window, the clamp, two groups and the order ───────────────

SELECT pg_temp.assert_eq('c: default 30 days in order: today first, two shared groups twice',
  $q$SELECT string_agg(r.apellido || '@' || r.grupo_nombre, ',' ORDER BY r.ord)
       FROM public.proximos_cumpleanos_mis_grupos() WITH ORDINALITY AS r(usuario_id, nombre, apellido, grupo_id, grupo_nombre, mes, dia, proxima, ord)
      WHERE r.apellido <> 'FEB29'$q$,
  'TODAY@ZZ Cm G1,LID@ZZ Cm G1,COL@ZZ Cm G1,BOTH@ZZ Cm G1,BOTH@ZZ Cm G5');
SELECT pg_temp.assert_eq('c: the last day is included (3 days: LID yes, COL no)',
  $q$SELECT string_agg(apellido, ',' ORDER BY proxima) FROM public.proximos_cumpleanos_mis_grupos(3) WHERE apellido IN ('LID', 'COL')$q$,
  'LID');
SELECT pg_temp.assert_eq('c: p_dias clamps to 1..60 and NULL is 30 (FAR at 45, VFAR at 90, TODAY at 0)',
  $q$SELECT concat_ws('|',
       (SELECT count(*) FROM public.proximos_cumpleanos_mis_grupos(60) WHERE apellido = 'FAR'),
       (SELECT count(*) FROM public.proximos_cumpleanos_mis_grupos(1000) WHERE apellido = 'FAR'),
       (SELECT count(*) FROM public.proximos_cumpleanos_mis_grupos(1000) WHERE apellido = 'VFAR'),
       (SELECT count(*) FROM public.proximos_cumpleanos_mis_grupos(NULL) WHERE apellido IN ('FAR', 'TODAY', 'LID')),
       (SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.proximos_cumpleanos_mis_grupos(0) WHERE apellido <> 'FEB29'),
       (SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.proximos_cumpleanos_mis_grupos(-5) WHERE apellido <> 'FEB29'))$q$,
  '1|1|0|2|TODAY|TODAY');

-- ── d. Colíder and Líder; no group; no session ───────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: the Colíder sees groupmates, not themself',
  $q$SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.proximos_cumpleanos_mis_grupos(10) WHERE apellido <> 'FEB29'$q$,
  'BOTH,LID,M1,TODAY');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d: the Líder sees groupmates, not themself',
  $q$SELECT string_agg(apellido, ',' ORDER BY apellido) FROM public.proximos_cumpleanos_mis_grupos(10) WHERE apellido <> 'FEB29'$q$,
  'BOTH,COL,M1,TODAY');

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('d: a person without groups gets no rows',
  $q$SELECT count(*)::text FROM public.proximos_cumpleanos_mis_grupos(60)$q$,
  '0');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_eq('d: without session no rows',
  $q$SELECT count(*)::text FROM public.proximos_cumpleanos_mis_grupos(60)$q$,
  '0');

-- ── e. 29 Feb ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: 29 Feb is 28 Feb in a year that is not leap (and the call never fails)',
  $q$SELECT coalesce(string_agg(concat_ws('|', proxima, mes, dia), ','), 'none')
       FROM public.proximos_cumpleanos_mis_grupos(60) WHERE apellido = 'FEB29'$q$,
  CASE WHEN pg_temp.proximo_29_feb(pg_temp.hoy()) <= pg_temp.hoy() + 60
       THEN pg_temp.proximo_29_feb(pg_temp.hoy())::text || '|2|29'
       ELSE 'none' END);

RESET ROLE;

-- ── f. grants and attributes ─────────────────────────────────────────

SELECT pg_temp.assert_eq('f: anon and PUBLIC cannot execute; authenticated can',
  $q$SELECT concat_ws('|',
       has_function_privilege('anon', 'public.proximos_cumpleanos_mis_grupos(integer)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.proximos_cumpleanos_mis_grupos(integer)', 'EXECUTE'),
       EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.oid = 'public.proximos_cumpleanos_mis_grupos(integer)'::regprocedure
                  AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'))$q$,
  'f|t|f');
SELECT pg_temp.assert_eq('f: definer, stable, empty search_path',
  $q$SELECT p.prosecdef || ':' || p.provolatile || ':' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = 'public.proximos_cumpleanos_mis_grupos(integer)'::regprocedure$q$,
  'true:s:search_path=""');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cm_failures;

ROLLBACK;
