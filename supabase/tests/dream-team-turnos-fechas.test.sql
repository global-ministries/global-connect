-- Dated service shifts for The Living Room
-- (odd/tasks/tlr-calendario-servicios.md, T1, S1–S6, A1;
-- 20261026140000_dream_team_turnos_fechas.sql).
--
-- Covers:
--   a. dream_team_turnos.tipo: existing and new turnos default to 'semanal';
--      any other value than 'semanal' / 'fechas' is refused.
--   b. Planned dates: the TLR coordinator adds dates (any weekday, hora and
--      nota optional), saving the same date again edits it, moving a date
--      onto another planned one is refused, a weekly turno takes no dates
--      (RPC and direct insert), a nota over 200 characters is refused.
--   c. Who serves on a date: "Todos" sets every volunteer of the turno, a
--      partial set replaces it, an empty set clears it; a volunteer not
--      assigned to the turno or a NULL set is refused and leaves the set as
--      it was; a direct insert of an unassigned servicio is refused.
--   d. Frequency: a dated turno refuses biweekly assignments (insert and
--      update); a weekly turno with a biweekly assignment cannot become
--      dated; a weekly turno with weekly assignments can, and back to weekly
--      keeps its assignments (S3).
--   e. dream_team_turno_activo_en: weekly → its weekday while active; dated →
--      only its planned dates; inactive → never.
--   f. Authority (A1): coordinator of the TLR node, director of an ancestor
--      and a structure admin may write; a coordinator of another branch and
--      a plain volunteer are refused (42501) and change nothing; anon
--      executes none of the functions; authenticated cannot write the tables
--      directly nor run the trigger functions.
--   g. Niños (S5): for a weekly turno the service list, the roster and the
--      report are identical before and after a dated turno with dates and
--      volunteers exists in the same campus; dated turnos are not listed,
--      not accepted by the roster, marking or check-in, never frozen nor
--      reported, and never in the pre-check window.
--   h. Removing an assignment (directly, by a prune path, or by deactivating
--      the turno) removes its per-date rows; deleting a date removes its
--      volunteers.
--   i. Which nodes serve a dated turno (dream_team_turnos_del_equipo): an
--      unrestricted node does not get it and cannot be assigned it, and
--      still gets every weekly turno exactly as before; the node that lists
--      it gets it and keeps every weekly turno; a child of that node inherits
--      it; a node restricted to a weekly turno and an unlisted dated turno
--      stay out. A weekly turno held by a volunteer of a node that does not
--      list it cannot become dated; the listing node's turno goes dated →
--      weekly → dated keeping its assignments (S3).
--
-- Run against STAGING inside BEGIN…ROLLBACK as postgres. The last statement
-- is a SELECT of the failing cases ('ALL OK' when none). Everything that
-- touches the new column, tables or functions runs through EXECUTE inside an
-- exception-catching helper, so the RED run (migration not applied) still
-- reaches the final SELECT and lists every case as failing.
--
-- Identities (usuario n = auth n): 1 COORD_TLR (dream_team.coordinate on
-- TLR), 2 COORD_OTRA (dream_team.coordinate on E), 3 PLAIN (dream_team.serve
-- on TLR), 4 ADMIN (unscoped dream_team.org.manage), 5 DIRECTOR
-- (dream_team.direct on R). Volunteers 10..16 have no account.
-- Tree: R → TLR → TLRH, R → E, R → W (Niños area with a room). One campus.
-- Servicios: 10..13 in TLR, 14 in E, 15..16 in W.
-- Turnos (campus 1): 1 TS 'Domingo 9' weekly; 2 T3 'Domingo 11' weekly;
-- 3 TF dated (TLR); 4 TSnow weekly, today at this time; 5 TFnow dated, today
-- at this time; 6 TI weekly inactive.
-- Node restrictions: TLR → TF; E → TS; W and TLRH list nothing.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tf_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_tf_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tf_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Rows changed by a DML statement, as text (RLS hides rows instead of raising).
CREATE OR REPLACE FUNCTION pg_temp.filas(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9c40000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9c41' WHEN 'us' THEN '9c42' WHEN 'ca' THEN '9c43'
                       WHEN 'eq' THEN '9c44' WHEN 'ro' THEN '9c45' WHEN 'se' THEN '9c46'
                       WHEN 'tu' THEN '9c47' WHEN 'sa' THEN '9c48' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_tf_ctx WHERE k = p_k;
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (new objects missing) still reaches the final SELECT.

-- The id of turno p_turno's planned date p_fecha.
CREATE OR REPLACE FUNCTION pg_temp.tf(p_turno int, p_fecha date) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT f.id FROM public.dream_team_turno_fechas f
           WHERE f.turno_id = pg_temp.id('tu', p_turno) AND f.fecha = p_fecha);
END;
$$;

-- The persons (n) serving on turno p_turno's date p_fecha, sorted: '10,11'.
CREATE OR REPLACE FUNCTION pg_temp.sirven(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(n::text, ',' ORDER BY n), '')
            FROM public.dream_team_turno_fecha_servidores x
            JOIN public.dream_team_turno_fechas f ON f.id = x.turno_fecha_id
            JOIN generate_series(10, 16) AS n ON pg_temp.id('se', n) = x.servicio_id
           WHERE f.turno_id = pg_temp.id('tu', p_turno) AND f.fecha = p_fecha);
END;
$$;

-- Sets who serves on turno p_turno's date p_fecha to the servicios of persons p_ns.
CREATE OR REPLACE FUNCTION pg_temp.fijar(p_turno int, p_fecha date, p_ns int[]) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_turno_fecha_servidores_fijar(
           pg_temp.tf(p_turno, p_fecha),
           CASE WHEN p_ns IS NULL THEN NULL
                ELSE coalesce((SELECT array_agg(pg_temp.id('se', n)) FROM unnest(p_ns) AS n), ARRAY[]::uuid[]) END)::text;
END;
$$;

-- Saves a planned date of turno p_turno; returns 'fecha|hora|nota' as stored.
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_turno int, p_fecha date, p_hora time DEFAULT NULL, p_nota text DEFAULT NULL,
                                           p_mover_desde date DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public.dream_team_turno_fecha_guardar(pg_temp.id('tu', p_turno), p_fecha, p_hora, p_nota,
            CASE WHEN p_mover_desde IS NOT NULL THEN pg_temp.tf(p_turno, p_mover_desde) END);
  RETURN (SELECT f.fecha || '|' || coalesce(f.hora::text, '-') || '|' || coalesce(f.nota, '-')
            FROM public.dream_team_turno_fechas f WHERE f.id = v_id);
END;
$$;

-- The names of the turnos node p_eq serves in campus 1, in the function's order.
CREATE OR REPLACE FUNCTION pg_temp.turnos_de(p_eq int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(t.nombre, ',' ORDER BY x.n)
            FROM public.dream_team_turnos_del_equipo(pg_temp.id('eq', p_eq), pg_temp.id('ca', 1)) WITH ORDINALITY AS x(turno_id, n)
            JOIN public.dream_team_turnos t ON t.id = x.turno_id);
END;
$$;

-- What a Niños user sees for weekly turno TS: its service list (campus 1),
-- its roster on Sunday 'dom' and the volunteer report of the last two weeks.
CREATE OR REPLACE FUNCTION pg_temp.ninos_vista() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN concat_ws(E'\n',
    (SELECT string_agg(t.nombre || ':' || t.dia_semana || ':' || t.hora, ',' ORDER BY t.orden, t.nombre)
       FROM public.ninos_voluntarios_turnos() t WHERE t.campus_id = pg_temp.id('ca', 1)),
    public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), pg_temp.ctx('dom')::date)::text,
    public.ninos_reporte_voluntarios(pg_temp.ctx('dom')::date - 14, pg_temp.ctx('dom')::date,
                                     pg_temp.id('ca', 1), NULL)::text);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.guardar_vista(p_k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_tf_ctx (k, v) VALUES (p_k, pg_temp.ninos_vista());
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('g: Niños view ' || p_k, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_tf_ctx (k, v) VALUES
  ('hoy', public.ninos_hoy()::text),
  ('dom', (public.ninos_hoy() - extract(dow FROM public.ninos_hoy())::int)::text),
  ('ahora', date_trunc('minute', now() AT TIME ZONE 'America/Caracas')::time::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'tf-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Tf', 'U' || n, 'tf-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Tf', 'V' || n, 'Soltero', 'Femenino' FROM generate_series(10, 16) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Tf Campus', 'ZZTF1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM generate_series(10, 16) AS n;

-- (n, parent, experiencia, label): 1 R, 2 TLR, 3 E, 4 W.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Tf Raiz'), (2, 1, 'the_living_room', 'ZZ Tf TLR'),
               (3, 1, 'estudiantes', 'ZZ Tf Otra'), (4, 1, 'ninos', 'ZZ Tf Waumba'),
               (5, 2, 'the_living_room', 'ZZ Tf TLR Hijo')) AS v(n, p, experiencia, label);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), 'Voluntario', true
  FROM (VALUES (1, 2), (2, 3), (3, 4)) AS v(n, e);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden)
VALUES (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 4), 'waumba', 'ZZ Tf S1', 20, NULL, NULL, 1);

-- Servicio n belongs to person n: 10..13 in TLR, 14 in E, 15..16 in W.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (10, 2, 1), (11, 2, 1), (12, 2, 1), (13, 2, 1), (14, 3, 2), (15, 4, 3), (16, 4, 3)) AS v(n, e, r);

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 3), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 4), 'dream_team.org.manage', 'dream_team', 'experience', NULL),
  (pg_temp.id('us', 5), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text);

-- Weekly turnos (no tipo column needed).
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Tf Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Tf Domingo 11', 0, '11:00', 2, true),
  (pg_temp.id('tu', 4), pg_temp.id('ca', 1), 'ZZ Tf Ahora', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time, 4, true),
  (pg_temp.id('tu', 6), pg_temp.id('ca', 1), 'ZZ Tf Inactivo', 0, '13:00', 6, false);

-- E serves only TS; 14 serves TS every other week; 15 (Niños) serves TS weekly.
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 3), pg_temp.id('tu', 1));
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla) VALUES
  (pg_temp.id('se', 14), pg_temp.id('tu', 1), 'quincenal', DATE '2099-01-04'),
  (pg_temp.id('se', 15), pg_temp.id('tu', 1), 'semanal', NULL);

GRANT INSERT, SELECT ON t_tf_failures, t_tf_ctx TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.exec(text, text), pg_temp.filas(text),
  pg_temp.id(text, int), pg_temp.as_persona(int), pg_temp.ctx(text), pg_temp.tf(int, date),
  pg_temp.sirven(int, date), pg_temp.fijar(int, date, int[]), pg_temp.guardar(int, date, time, text, date),
  pg_temp.ninos_vista(), pg_temp.guardar_vista(text)
  TO authenticated;

-- What Niños shows for TS before any dated turno exists.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.guardar_vista('antes');
RESET ROLE;

-- The turnos W and TLR serve before any dated turno exists.
INSERT INTO t_tf_ctx (k, v) VALUES ('w_antes', pg_temp.turnos_de(4)), ('tlr_antes', pg_temp.turnos_de(2));

-- Dated turnos, TLR's restriction and TLR's volunteers.
SELECT pg_temp.exec('fixture: dated turnos',
  $q$INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
       (pg_temp.id('tu', 3), pg_temp.id('ca', 1), 'ZZ Tf TLR', 0, '19:00', 3, true, 'fechas'),
       (pg_temp.id('tu', 5), pg_temp.id('ca', 1), 'ZZ Tf TLR Ahora', extract(dow FROM public.ninos_hoy())::smallint,
        pg_temp.ctx('ahora')::time, 5, true, 'fechas')$q$);
SELECT pg_temp.exec('fixture: TLR serves TF',
  $q$INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES (pg_temp.id('eq', 2), pg_temp.id('tu', 3))$q$);
SELECT pg_temp.exec('fixture: TLR volunteers 10..12 on TF',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id)
     SELECT pg_temp.id('se', n), pg_temp.id('tu', 3) FROM generate_series(10, 12) AS n$q$);
SELECT pg_temp.exec('fixture: TFnow planned today',
  $q$INSERT INTO public.dream_team_turno_fechas (turno_id, fecha) VALUES (pg_temp.id('tu', 5), pg_temp.ctx('hoy')::date)$q$);

-- ── a. tipo ──────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: a turno created without tipo is weekly',
  $q$SELECT tipo FROM public.dream_team_turnos WHERE id = pg_temp.id('tu', 1)$q$, 'semanal');
SELECT pg_temp.assert_eq('a: every turno outside the fixtures is weekly',
  $q$SELECT count(*)::text FROM public.dream_team_turnos
      WHERE tipo <> 'semanal' AND id NOT IN (pg_temp.id('tu', 3), pg_temp.id('tu', 5))$q$, '0');
SELECT pg_temp.assert_raises('a: an unknown tipo is refused',
  $q$UPDATE public.dream_team_turnos SET tipo = 'mensual' WHERE id = pg_temp.id('tu', 2)$q$, '23514');

-- ── b. planned dates (as the TLR coordinator) ────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('b: the coordinator plans a Saturday with no hora nor nota',
  $q$SELECT pg_temp.guardar(3, DATE '2099-01-10')$q$, '2099-01-10|-|-');
SELECT pg_temp.assert_eq('b: the coordinator plans a Sunday with hora and nota',
  $q$SELECT pg_temp.guardar(3, DATE '2099-01-18', '18:30', '  Bautizos  ')$q$, '2099-01-18|18:30:00|Bautizos');
SELECT pg_temp.assert_eq('b: saving the same date again edits it and keeps one row',
  $q$SELECT pg_temp.guardar(3, DATE '2099-01-18', '17:00', '') || '#'
       || (SELECT count(*) FROM public.dream_team_turno_fechas WHERE turno_id = pg_temp.id('tu', 3))$q$,
  '2099-01-18|17:00:00|-#2');
SELECT pg_temp.assert_eq('b: a planned date moves to a free date, same row',
  $q$SELECT pg_temp.guardar(3, DATE '2099-01-25', NULL, 'Movida', DATE '2099-01-18') || '#'
       || (pg_temp.tf(3, DATE '2099-01-18') IS NULL)$q$, '2099-01-25|-|Movida#true');
SELECT pg_temp.assert_raises('b: moving a date onto another planned date is refused',
  $q$SELECT pg_temp.guardar(3, DATE '2099-01-10', NULL, NULL, DATE '2099-01-25')$q$, '23505', 'fecha_duplicada');
SELECT pg_temp.assert_raises('b: a weekly turno takes no dates',
  $q$SELECT public.dream_team_turno_fecha_guardar(pg_temp.id('tu', 1), DATE '2099-01-11', NULL, NULL, NULL)$q$,
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('b: a NULL date is refused',
  $q$SELECT public.dream_team_turno_fecha_guardar(pg_temp.id('tu', 3), NULL, NULL, NULL, NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('b: a nota over 200 characters is refused',
  $q$SELECT pg_temp.guardar(3, DATE '2099-02-01', NULL, repeat('x', 201))$q$, '23514');
SELECT pg_temp.assert_eq('b: the coordinator reads the planned dates',
  $q$SELECT string_agg(fecha::text, ',' ORDER BY fecha) FROM public.dream_team_turno_fechas
      WHERE turno_id = pg_temp.id('tu', 3)$q$, '2099-01-10,2099-01-25');
SELECT pg_temp.assert_eq('b: the coordinator may manage TF, not TS',
  $q$SELECT public.dream_team_puede_gestionar_turno(pg_temp.id('tu', 3)) || ',' || public.dream_team_puede_gestionar_turno(pg_temp.id('tu', 1))$q$,
  'true,false');

RESET ROLE;

SELECT pg_temp.assert_raises('b: two rows for the same turno and date are refused',
  $q$INSERT INTO public.dream_team_turno_fechas (turno_id, fecha) VALUES (pg_temp.id('tu', 3), DATE '2099-01-10')$q$, '23505');
SELECT pg_temp.assert_raises('b: a direct date on a weekly turno is refused',
  $q$INSERT INTO public.dream_team_turno_fechas (turno_id, fecha) VALUES (pg_temp.id('tu', 1), DATE '2099-01-11')$q$, '23514');

-- ── c. who serves on a date ──────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('c: "Todos" sets every volunteer of the turno',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[10, 11, 12]) || '#' || pg_temp.sirven(3, DATE '2099-01-10')$q$,
  '3#10,11,12');
SELECT pg_temp.assert_eq('c: a partial set replaces it',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[10, 12, 12]) || '#' || pg_temp.sirven(3, DATE '2099-01-10')$q$,
  '2#10,12');
SELECT pg_temp.assert_raises('c: a volunteer not assigned to the turno is refused',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[10, 13])$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('c: a volunteer of another node is refused',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[14])$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('c: a NULL set is refused',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', NULL)$q$, '22023', 'servicios_invalidos');
SELECT pg_temp.assert_eq('c: the refused calls left the set as it was',
  $q$SELECT pg_temp.sirven(3, DATE '2099-01-10')$q$, '10,12');
SELECT pg_temp.assert_eq('c: another date has its own set',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-25', ARRAY[10, 11, 12]) || '#' || pg_temp.sirven(3, DATE '2099-01-25')$q$,
  '3#10,11,12');
SELECT pg_temp.assert_eq('c: an empty set clears a date',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-25', ARRAY[]::int[]) || '#' || pg_temp.sirven(3, DATE '2099-01-25')$q$, '0#');
SELECT pg_temp.assert_eq('c: the coordinator reads who serves',
  $q$SELECT count(*)::text FROM public.dream_team_turno_fecha_servidores$q$, '2');

RESET ROLE;

SELECT pg_temp.assert_raises('c: a direct row for an unassigned servicio is refused',
  $q$INSERT INTO public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id)
     VALUES (pg_temp.tf(3, DATE '2099-01-10'), pg_temp.id('tu', 3), pg_temp.id('se', 13))$q$, '23503');

-- ── d. frequency ─────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: a dated turno refuses a biweekly assignment',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
     VALUES (pg_temp.id('se', 13), pg_temp.id('tu', 3), 'quincenal', DATE '2099-01-04')$q$, '23514');
SELECT pg_temp.assert_raises('d: a dated assignment cannot become biweekly',
  $q$UPDATE public.dream_team_servicio_turnos SET frecuencia = 'quincenal', fecha_ancla = DATE '2099-01-04'
      WHERE servicio_id = pg_temp.id('se', 10) AND turno_id = pg_temp.id('tu', 3)$q$, '23514');
SELECT pg_temp.assert_raises('d: a weekly turno with a biweekly assignment cannot become dated',
  $q$UPDATE public.dream_team_turnos SET tipo = 'fechas' WHERE id = pg_temp.id('tu', 1)$q$, '23514');
SELECT pg_temp.assert_eq('d: TS is still weekly',
  $q$SELECT tipo FROM public.dream_team_turnos WHERE id = pg_temp.id('tu', 1)$q$, 'semanal');

-- ── e. dream_team_turno_activo_en ────────────────────────────────────

SELECT pg_temp.assert_eq('e: weekly turno on its weekday, another day',
  $q$SELECT public.dream_team_turno_activo_en(pg_temp.id('tu', 1), DATE '2099-01-04') || ','
       || public.dream_team_turno_activo_en(pg_temp.id('tu', 1), DATE '2099-01-05')$q$, 'true,false');
SELECT pg_temp.assert_eq('e: dated turno on a planned Saturday, an unplanned Sunday',
  $q$SELECT public.dream_team_turno_activo_en(pg_temp.id('tu', 3), DATE '2099-01-10') || ','
       || public.dream_team_turno_activo_en(pg_temp.id('tu', 3), DATE '2099-01-04')$q$, 'true,false');
SELECT pg_temp.assert_eq('e: inactive turno, NULL date and unknown turno are never active',
  $q$SELECT public.dream_team_turno_activo_en(pg_temp.id('tu', 6), DATE '2099-01-04') || ','
       || public.dream_team_turno_activo_en(pg_temp.id('tu', 1), NULL) || ','
       || public.dream_team_turno_activo_en(pg_temp.id('tu', 99), DATE '2099-01-04')$q$, 'false,false,false');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('e: any signed-in user can ask',
  $q$SELECT public.dream_team_turno_activo_en(pg_temp.id('tu', 3), DATE '2099-01-10')::text$q$, 'true');

-- ── f. authority ─────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('f: a plain volunteer cannot plan a date',
  $q$SELECT pg_temp.guardar(3, DATE '2099-03-01')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a plain volunteer cannot set who serves',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[10, 11, 12])$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a plain volunteer cannot delete a date',
  $q$SELECT public.dream_team_turno_fecha_borrar(pg_temp.tf(3, DATE '2099-01-10'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a plain volunteer cannot insert a date directly',
  $q$INSERT INTO public.dream_team_turno_fechas (turno_id, fecha) VALUES (pg_temp.id('tu', 3), DATE '2099-03-01')$q$, '42501');
SELECT pg_temp.assert_eq('f: a plain volunteer may not manage TF',
  $q$SELECT public.dream_team_puede_gestionar_turno(pg_temp.id('tu', 3))::text$q$, 'false');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('f: a coordinator of another branch cannot plan a date',
  $q$SELECT pg_temp.guardar(3, DATE '2099-03-01')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a coordinator of another branch cannot set who serves',
  $q$SELECT pg_temp.fijar(3, DATE '2099-01-10', ARRAY[10, 11, 12])$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a coordinator of another branch cannot delete a date',
  $q$SELECT public.dream_team_turno_fecha_borrar(pg_temp.tf(3, DATE '2099-01-10'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a coordinator of another branch cannot write the table directly',
  $q$DELETE FROM public.dream_team_turno_fecha_servidores$q$, '42501');

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('f: the director of an ancestor plans a date',
  $q$SELECT pg_temp.guardar(3, DATE '2099-03-01')$q$, '2099-03-01|-|-');

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('f: a structure admin plans a date',
  $q$SELECT pg_temp.guardar(3, DATE '2099-03-08')$q$, '2099-03-08|-|-');

RESET ROLE;

SELECT pg_temp.assert_eq('f: refused callers changed nothing',
  $q$SELECT string_agg(fecha::text, ',' ORDER BY fecha) || '#' || pg_temp.sirven(3, DATE '2099-01-10')
       FROM public.dream_team_turno_fechas WHERE turno_id = pg_temp.id('tu', 3)$q$,
  '2099-01-10,2099-01-25,2099-03-01,2099-03-08#10,12');

SELECT pg_temp.assert_eq('f: anon executes none of the functions',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid)'),
       ('public.dream_team_turno_fecha_borrar(uuid)'),
       ('public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[])'),
       ('public.dream_team_puede_gestionar_turno(uuid)'),
       ('public.dream_team_turno_activo_en(uuid, date)')) AS f(sig)
      WHERE has_function_privilege('anon', f.sig, 'EXECUTE')$q$, '0');
SELECT pg_temp.assert_eq('f: authenticated executes the five public functions',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.dream_team_turno_fecha_guardar(uuid, date, time, text, uuid)'),
       ('public.dream_team_turno_fecha_borrar(uuid)'),
       ('public.dream_team_turno_fecha_servidores_fijar(uuid, uuid[])'),
       ('public.dream_team_puede_gestionar_turno(uuid)'),
       ('public.dream_team_turno_activo_en(uuid, date)')) AS f(sig)
      WHERE has_function_privilege('authenticated', f.sig, 'EXECUTE')$q$, '5');
SELECT pg_temp.assert_eq('f: nobody but the trigger machinery runs the trigger functions',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.dream_team_turno_fechas_validar()'),
       ('public.dream_team_servicio_turnos_validar_tipo()'),
       ('public.dream_team_turnos_validar_tipo()'),
       ('public.dream_team_turnos_tipo_cambiado()')) AS f(sig)
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rol)
      WHERE has_function_privilege(r.rol, f.sig, 'EXECUTE')$q$, '0');
SELECT pg_temp.assert_eq('f: anon reads neither table; authenticated only reads',
  $q$SELECT has_table_privilege('anon', 'public.dream_team_turno_fechas', 'SELECT') || ','
       || has_table_privilege('anon', 'public.dream_team_turno_fecha_servidores', 'SELECT') || ','
       || has_table_privilege('authenticated', 'public.dream_team_turno_fechas', 'SELECT') || ','
       || has_table_privilege('authenticated', 'public.dream_team_turno_fechas', 'INSERT, UPDATE, DELETE') || ','
       || has_table_privilege('authenticated', 'public.dream_team_turno_fecha_servidores', 'INSERT, UPDATE, DELETE')$q$,
  'false,false,true,false,false');

-- ── g. Niños ─────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.guardar_vista('despues');
RESET ROLE;

SELECT pg_temp.assert_eq('g: TS list, roster and report are identical with a dated turno around',
  $q$SELECT (pg_temp.ctx('antes') = pg_temp.ctx('despues'))::text$q$, 'true');
SELECT pg_temp.assert_eq('g: the Niños view of TS is not empty',
  $q$SELECT (pg_temp.ctx('antes') LIKE 'ZZ Tf Domingo 9:0:09:00:00,ZZ Tf Domingo 11:0:11:00:00,ZZ Tf Ahora:%')::text$q$, 'true');


SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);

SELECT pg_temp.assert_eq('g: the Niños service list leaves dated turnos out',
  $q$SELECT string_agg(t.nombre, ',' ORDER BY t.orden) FROM public.ninos_voluntarios_turnos() t
      WHERE t.campus_id = pg_temp.id('ca', 1)$q$, 'ZZ Tf Domingo 9,ZZ Tf Domingo 11,ZZ Tf Ahora');
SELECT pg_temp.assert_raises('g: the Niños roster refuses a dated turno',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 3), pg_temp.ctx('dom')::date)$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('g: Niños marking refuses a dated turno',
  $q$SELECT public.ninos_voluntarios_marcar(pg_temp.id('tu', 3), pg_temp.ctx('dom')::date,
       ARRAY[pg_temp.id('se', 15)], 'presente', false)$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_eq('g: the Niños report has no dated turno',
  $q$SELECT count(*)::text FROM jsonb_array_elements(
       public.ninos_reporte_voluntarios(pg_temp.ctx('dom')::date - 14, pg_temp.ctx('dom')::date, pg_temp.id('ca', 1), NULL)
       -> 'servicios') s
      WHERE (s ->> 'turno_id')::uuid IN (pg_temp.id('tu', 3), pg_temp.id('tu', 5))$q$, '0');
SELECT pg_temp.assert_raises('g: Niños check-in refuses a dated turno',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 15)], pg_temp.id('tu', 3), pg_temp.ctx('hoy')::date,
       ARRAY[pg_temp.id('sa', 99)])$q$, '22023', 'unknown or inactive turno');
SELECT pg_temp.assert_raises('g: Niños check-in still takes a weekly turno past the turno gate',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 15)], pg_temp.id('tu', 1), pg_temp.ctx('hoy')::date,
       ARRAY[pg_temp.id('sa', 99)])$q$,
  '22023', 'room ' || pg_temp.id('sa', 99) || ' is not an active room of the turno campus');

RESET ROLE;

SELECT pg_temp.assert_eq('g: the report froze no dated date; weekly dates are frozen as before',
  $q$SELECT count(*) FILTER (WHERE turno_id = pg_temp.id('tu', 3))::text || ','
       || (count(*) FILTER (WHERE turno_id = pg_temp.id('tu', 1))
           = (SELECT count(*) FROM generate_series(pg_temp.ctx('dom')::date - 14, public.ninos_hoy() - 1, interval '7 days') d
               WHERE d::date >= public.ninos_voluntarios_congelado_desde()))::text
       FROM public.ninos_voluntarios_rosters$q$, '0,true');
SELECT pg_temp.assert_eq('g: a dated turno is never frozen',
  $q$SELECT public.ninos_voluntarios_congelar(pg_temp.id('tu', 3),
       public.ninos_hoy() - 1 - extract(dow FROM public.ninos_hoy() - 1)::int)::text$q$, 'false');
SELECT pg_temp.assert_eq('g: the pre-check window opens for the weekly turno of now, not the dated one',
  $q$SELECT public.ninos_precheck_en_ventana(pg_temp.id('tu', 4)) || ',' || public.ninos_precheck_en_ventana(pg_temp.id('tu', 5))$q$,
  'true,false');
SELECT pg_temp.assert_eq('g: today''s pre-registration services leave the dated turno out',
  $q$SELECT (public.ninos_preregistro_servicios_hoy(pg_temp.id('ca', 1)) @> jsonb_build_array(jsonb_build_object('turno_id', pg_temp.id('tu', 4))))
       || ',' || (public.ninos_preregistro_servicios_hoy(pg_temp.id('ca', 1)) @> jsonb_build_array(jsonb_build_object('turno_id', pg_temp.id('tu', 5))))$q$,
  'true,false');

-- ── i. which nodes serve a dated turno ────────────────────────────────

SELECT pg_temp.assert_eq('i: before any dated turno, W and TLR serve every active weekly turno',
  $q$SELECT pg_temp.ctx('w_antes') || '#' || pg_temp.ctx('tlr_antes')$q$,
  'ZZ Tf Domingo 9,ZZ Tf Domingo 11,ZZ Tf Ahora#ZZ Tf Domingo 9,ZZ Tf Domingo 11,ZZ Tf Ahora');
SELECT pg_temp.assert_eq('i: the unrestricted node W gets no dated turno and every weekly one, as before',
  $q$SELECT pg_temp.turnos_de(4)$q$, pg_temp.ctx('w_antes'));
SELECT pg_temp.assert_eq('i: TLR, which lists TF, gets TF and keeps every weekly turno',
  $q$SELECT pg_temp.turnos_de(2)$q$, 'ZZ Tf Domingo 9,ZZ Tf Domingo 11,ZZ Tf TLR,ZZ Tf Ahora');
SELECT pg_temp.assert_eq('i: a child of TLR inherits TF',
  $q$SELECT pg_temp.turnos_de(5)$q$, 'ZZ Tf Domingo 9,ZZ Tf Domingo 11,ZZ Tf TLR,ZZ Tf Ahora');
SELECT pg_temp.assert_eq('i: a node restricted to TS gets neither TF nor the other weekly turnos',
  $q$SELECT pg_temp.turnos_de(3)$q$, 'ZZ Tf Domingo 9');
SELECT pg_temp.assert_raises('i: a volunteer of the unrestricted node cannot be assigned TF',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 15), pg_temp.id('tu', 3))$q$,
  '23514', 'El turno no está disponible para este equipo y campus');

SELECT pg_temp.exec('fixture: volunteer 16 (W) weekly on T3',
  $q$INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('se', 16), pg_temp.id('tu', 2))$q$);
SELECT pg_temp.assert_raises('i: T3, held by a volunteer of a node that does not list it, cannot become dated',
  $q$UPDATE public.dream_team_turnos SET tipo = 'fechas' WHERE id = pg_temp.id('tu', 2)$q$, '23514',
  'El turno tiene voluntarios de equipos que no lo listan: un turno por fechas sólo lo sirven los equipos que lo tienen en su lista');
SELECT pg_temp.assert_eq('i: T3 stays weekly with its assignment',
  $q$SELECT tipo || '#' || (SELECT count(*) FROM public.dream_team_servicio_turnos WHERE turno_id = pg_temp.id('tu', 2))
       FROM public.dream_team_turnos WHERE id = pg_temp.id('tu', 2)$q$, 'semanal#1');
SELECT pg_temp.assert_eq('i: TF dated → weekly keeps its assignments (S3)',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_turnos SET tipo = ''semanal'' WHERE id = ' || quote_literal(pg_temp.id('tu', 3)))
       || '#' || (SELECT count(*) FROM public.dream_team_servicio_turnos WHERE turno_id = pg_temp.id('tu', 3))$q$, '1#3');
SELECT pg_temp.assert_eq('i: TF weekly → dated again keeps its assignments',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_turnos SET tipo = ''fechas'' WHERE id = ' || quote_literal(pg_temp.id('tu', 3)))
       || '#' || (SELECT count(*) FROM public.dream_team_servicio_turnos WHERE turno_id = pg_temp.id('tu', 3))$q$, '1#3');

-- ── h. removals ──────────────────────────────────────────────────────

SELECT pg_temp.exec('fixture: everyone serves 2099-01-25',
  $q$INSERT INTO public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id)
     SELECT pg_temp.tf(3, DATE '2099-01-25'), pg_temp.id('tu', 3), pg_temp.id('se', n) FROM unnest(ARRAY[10, 11, 12]) AS n$q$);
SELECT pg_temp.assert_eq('h: removing an assignment removes its per-date rows',
  $q$SELECT pg_temp.filas('DELETE FROM public.dream_team_servicio_turnos WHERE servicio_id = ' || quote_literal(pg_temp.id('se', 11))
       || ' AND turno_id = ' || quote_literal(pg_temp.id('tu', 3))) || '#' || pg_temp.sirven(3, DATE '2099-01-25')$q$, '1#10,12');
SELECT pg_temp.assert_eq('h: moving a servicio to a node that does not serve TF prunes its per-date rows',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_servicios SET equipo_id = ' || quote_literal(pg_temp.id('eq', 3))
       || ' WHERE id = ' || quote_literal(pg_temp.id('se', 12)))
       || '#' || pg_temp.sirven(3, DATE '2099-01-25') || '#' || pg_temp.sirven(3, DATE '2099-01-10')$q$, '1#10#10');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('h: deleting a date removes its volunteers',
  $q$SELECT public.dream_team_turno_fecha_borrar(pg_temp.tf(3, DATE '2099-01-10')) || '#' || pg_temp.sirven(3, DATE '2099-01-10')
       || '#' || (pg_temp.tf(3, DATE '2099-01-10') IS NULL)$q$, 'true##true');
RESET ROLE;

SELECT pg_temp.assert_eq('h: deactivating TF prunes every assignment and per-date row, dates stay',
  $q$SELECT pg_temp.filas('UPDATE public.dream_team_turnos SET activo = false WHERE id = ' || quote_literal(pg_temp.id('tu', 3)))
       || '#' || pg_temp.sirven(3, DATE '2099-01-25')
       || '#' || (SELECT count(*) FROM public.dream_team_turno_fechas WHERE turno_id = pg_temp.id('tu', 3))$q$, '1##3');

SELECT coalesce(string_agg(case_name, E'\n' ORDER BY case_name), 'ALL OK') AS result FROM t_tf_failures;

ROLLBACK;
