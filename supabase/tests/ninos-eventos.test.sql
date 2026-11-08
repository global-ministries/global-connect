-- T1a (odd/tasks/ninos-checkin-pco.md, S5, S8) — Niños eventos, horarios and
-- salón rules (20261108100000_ninos_eventos.sql).
--
-- Covers:
--   a. Grants: anon runs none of the new functions; authenticated runs the
--      RPCs but not the backfill nor the internal date sync; anon reads no new
--      table; authenticated only reads them.
--   b. S8.5: every salón that existed before the test reads the default rules,
--      and the pre-existing salones are byte-identical at the end of the test.
--   c. Backfill: one "Domingo semanal" per campus with salones (none for a
--      campus without), linking only its active Sunday weekly turnos (not the
--      dated, Saturday or inactive ones) with 120/120; one carpeta per campus
--      and area; a second run inserts nothing.
--   d. Table constraints: tipo/date combos, ranges, unique turno, carpeta.
--   e. Authority: events and horarios need every area of the campus. A user
--      without Niños rights, an anfitrión, the Waumba-only coordinator (who
--      reads the events) and a coordinator of another campus are refused with
--      sin_autoridad on every event / horario write; the Dirección writes.
--   f. ninos_eventos_admin: events, horarios with turno name/hour, last
--      sessions as distinct children per fecha.
--   g. ninos_evento_guardar validation codes and hints; create and update.
--   h. Horarios: semanal links / creates a weekly turno; diario creates a
--      'fechas' turno with one planned date per day, listed for the campus's
--      salón equipos; date changes re-sync; window bounds.
--   i. Removing a horario: a weekly turno stays; a dated turno with check-ins
--      stays; an unused future dated turno Niños created is deleted.
--   j. ninos_horario_de_turno: the horario's window, 120/120 fallback.
--   k. ninos_es_visitante: 2 prior fechas → visitante, 3 → regular; a child
--      outside the caller's campuses is sin_autoridad.
--   Also (verification round): a dated turno with a volunteer assignment is
--   unlinked, never deleted (B1); explicit arguments that do not fit the
--   event are refused and write nothing (B2); re-syncing dates never deletes
--   a past date or a date with check-ins; anuncio NULL keeps, '' clears.
--   l. Salón rules and carpetas stay per salón / per area: the Waumba-only
--      coordinator saves a Waumba salón and the Waumba carpeta, not UpStreet's.
--   m. RLS: authenticated cannot write the new tables nor the new salón
--      columns directly; reads follow the campus.
--
-- Run against STAGING (after the migration) inside BEGIN…ROLLBACK. The last
-- statement is a SELECT of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD WAUMBA (dream_team.coordinate on
-- W1 only, campus 1), 2 ANFITRION (servicio in W1/Anfitriones), 3 NADIE,
-- 4 COORD2 (coordinate on W2, campus 2), 5 DIRECCION (coordinate on R1, so
-- both areas of campus 1). Children 11 (K1) and 12 (K2).
-- Tree: R1 → W1 → Anfitriones; R1 → U1. R2 → W2.
-- Salones: S1 (campus 1, waumba, W1), S2 (campus 1, upstreet, U1),
-- S3 (campus 2, waumba, W2). Campus 3 has no salón.
-- Turnos campus 1: T1 Sunday 9:00, T2 Sunday 11:00 (weekly), T3 Sunday dated,
-- T4 Saturday weekly, T5 Sunday weekly inactive. Campus 2: T6 Sunday weekly.
-- Check-ins on T1/T2: K1 on 1, 8, 15 Mar 2026; K2 on 8 (T1 and T2) and 15 Mar.
-- Children 13 (no campus: out of scope) and 14 (campus 1, never checked in).
-- Usuario 2 has campus 1 as principal campus (volunteer assignments need it).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ev_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ev_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ev_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected permission denied, got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE 'permission denied%' THEN
      PERFORM pg_temp.fail(p_case, 'expected permission denied, got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- Runs a statement that needs the new objects; an error is a failure, not an abort.
CREATE OR REPLACE FUNCTION pg_temp.run(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e7e70000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9e01' WHEN 'us' THEN '9e02' WHEN 'eq' THEN '9e04'
                       WHEN 'ro' THEN '9e05' WHEN 'sa' THEN '9e06' WHEN 'tu' THEN '9e07' WHEN 'ca' THEN '9e08' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ev_ctx WHERE k = p_k;
$$;

-- The pre-existing salones (fixtures excluded), as one hash.
CREATE OR REPLACE FUNCTION pg_temp.salones_md5() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.id), ''))
    FROM public.ninos_salones s
   WHERE s.id NOT IN (pg_temp.id('sa', 1), pg_temp.id('sa', 2), pg_temp.id('sa', 3));
$$;

-- "SELECT public.ninos_evento_guardar(campus n, evento, nombre, tipo, dia, ini, fin, … anuncio)".
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_campus int, p_evento text, p_nombre text, p_tipo text,
                                           p_dia int, p_ini date, p_fin date, p_anuncio text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_evento_guardar(%L::uuid, %L::uuid, %L, %L, %L::smallint, %L::date, %L::date, '
                'NULL, NULL, NULL, NULL, %L, NULL)',
                pg_temp.id('ca', p_campus), pg_temp.ctx(p_evento), p_nombre, p_tipo, p_dia, p_ini, p_fin, p_anuncio);
$$;

-- "SELECT public.ninos_salon_reglas_guardar(S n, …)".
CREATE OR REPLACE FUNCTION pg_temp.reglas(p_salon int, p_cupo int, p_ratio int, p_min int,
                                          p_corte_mes int DEFAULT NULL, p_corte_dia int DEFAULT NULL,
                                          p_promo_mes int DEFAULT NULL, p_promo_dia int DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_reglas_guardar(%L::uuid, %L::int, %L::int, %L::int, false, true, true, '
                '%L::smallint, %L::smallint, %L::smallint, %L::smallint)',
                pg_temp.id('sa', p_salon), p_cupo, p_ratio, p_min, p_corte_mes, p_corte_dia, p_promo_mes, p_promo_dia);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ev_ctx (k, v) VALUES ('md5_antes', pg_temp.salones_md5());
INSERT INTO t_ev_ctx (k, v)
SELECT 'fuera_de_defecto', count(*)::text FROM public.ninos_salones s
 WHERE s.cupo_visitantes <> 0 OR s.ninos_por_voluntario IS NOT NULL OR s.min_voluntarios <> 0
    OR NOT s.abierto OR s.opcion_panal OR s.opcion_merienda
    OR s.corte_mes IS NOT NULL OR s.corte_dia IS NOT NULL OR s.promocion_mes IS NOT NULL OR s.promocion_dia IS NOT NULL;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Ev Campus 1', 'ZZEV1'),
  (pg_temp.id('ca', 2), 'ZZ Ev Campus 2', 'ZZEV2'),
  (pg_temp.id('ca', 3), 'ZZ Ev Campus 3', 'ZZEV3');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ev-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ev', 'U' || n, 'ev-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Ev Nino', 'K' || n, 'No especificado', 'Masculino', DATE '2021-01-01'
  FROM generate_series(11, 14) AS n;
INSERT INTO public.ninos_fichas (usuario_id) SELECT pg_temp.id('us', n) FROM generate_series(11, 14) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Ev R1', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ev W1', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Ev U1', true),
  (pg_temp.id('eq', 5), 'ninos', NULL, 'ZZ Ev R2', true),
  (pg_temp.id('eq', 6), 'ninos', pg_temp.id('eq', 5), 'ZZ Ev W2', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 5) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 6)::text),
  (pg_temp.id('us', 5), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Ev S1', 20, 0, 71, 1),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 4), 'upstreet', 'ZZ Ev S2', 20, 72, 155, 2),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 2), pg_temp.id('eq', 6), 'waumba', 'ZZ Ev S3', 20, 0, 71, 1);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Ev Domingo 9', 0, '09:00', 1, true, 'semanal'),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Ev Domingo 11', 0, '11:00', 2, true, 'semanal'),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 1), 'ZZ Ev TLR', 0, '19:00', 3, true, 'fechas'),
  (pg_temp.id('tu', 4), pg_temp.id('ca', 1), 'ZZ Ev Sabado', 6, '17:00', 4, true, 'semanal'),
  (pg_temp.id('tu', 5), pg_temp.id('ca', 1), 'ZZ Ev Inactivo', 0, '13:00', 5, false, 'semanal'),
  (pg_temp.id('tu', 6), pg_temp.id('ca', 2), 'ZZ Ev Domingo C2', 0, '10:00', 1, true, 'semanal');

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 2), pg_temp.id('ca', 1), true),
  (pg_temp.id('us', 14), pg_temp.id('ca', 1), true);
INSERT INTO t_ev_ctx (k, v)
SELECT 'turnos_c1', count(*)::text FROM public.dream_team_turnos WHERE campus_id = pg_temp.id('ca', 1);

INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo)
SELECT pg_temp.id('us', k), pg_temp.id('sa', 1), pg_temp.id('tu', t), pg_temp.id('ca', 1), f, gen_random_uuid(), '1234'
  FROM (VALUES (11, 1, DATE '2026-03-01'), (11, 1, DATE '2026-03-08'), (11, 1, DATE '2026-03-15'),
               (12, 1, DATE '2026-03-08'), (12, 2, DATE '2026-03-08'), (12, 1, DATE '2026-03-15')) AS v(k, t, f);

GRANT INSERT, SELECT, UPDATE ON t_ev_failures, t_ev_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text),
  pg_temp.guardar(int, text, text, text, int, date, date, text),
  pg_temp.reglas(int, int, int, int, int, int, int, int)
  TO authenticated, anon;

-- ── a. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: anon runs none of the new functions',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.ninos_puede_configurar_campus(uuid)'), ('public.ninos_puede_operar_campus(uuid)'),
       ('public.ninos_puede_configurar_algun_area_campus(uuid)'), ('public.ninos_turno_en_uso(uuid)'),
       ('public.ninos_eventos_admin(uuid)'),
       ('public.ninos_evento_guardar(uuid, uuid, text, text, smallint, date, date, boolean, boolean, boolean, boolean, text, integer)'),
       ('public.ninos_evento_archivar(uuid, boolean)'),
       ('public.ninos_horario_agregar(uuid, uuid, text, time, integer, integer)'),
       ('public.ninos_horario_ventana_guardar(uuid, integer, integer)'), ('public.ninos_horario_quitar(uuid)'),
       ('public.ninos_salon_reglas_guardar(uuid, integer, integer, integer, boolean, boolean, boolean, smallint, smallint, smallint, smallint)'),
       ('public.ninos_carpeta_guardar(uuid, text, text, boolean)'),
       ('public.ninos_horario_de_turno(uuid)'), ('public.ninos_es_visitante(uuid, date)'),
       ('public.ninos_eventos_sembrar()'), ('public.ninos_evento_sync_fechas(uuid)'),
       ('public.ninos_eventos_touch()')) AS f(sig)
      WHERE has_function_privilege('anon', f.sig, 'EXECUTE')$q$, '0');
SELECT pg_temp.assert_eq('a: authenticated runs the 13 RPCs and helpers',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.ninos_puede_configurar_campus(uuid)'), ('public.ninos_puede_operar_campus(uuid)'),
       ('public.ninos_puede_configurar_algun_area_campus(uuid)'),
       ('public.ninos_eventos_admin(uuid)'),
       ('public.ninos_evento_guardar(uuid, uuid, text, text, smallint, date, date, boolean, boolean, boolean, boolean, text, integer)'),
       ('public.ninos_evento_archivar(uuid, boolean)'),
       ('public.ninos_horario_agregar(uuid, uuid, text, time, integer, integer)'),
       ('public.ninos_horario_ventana_guardar(uuid, integer, integer)'), ('public.ninos_horario_quitar(uuid)'),
       ('public.ninos_salon_reglas_guardar(uuid, integer, integer, integer, boolean, boolean, boolean, smallint, smallint, smallint, smallint)'),
       ('public.ninos_carpeta_guardar(uuid, text, text, boolean)'),
       ('public.ninos_horario_de_turno(uuid)'), ('public.ninos_es_visitante(uuid, date)')) AS f(sig)
      WHERE has_function_privilege('authenticated', f.sig, 'EXECUTE')$q$, '13');
SELECT pg_temp.assert_eq('a: authenticated runs neither the backfill, the date sync nor the turno usage probe',
  $q$SELECT (has_function_privilege('authenticated', 'public.ninos_eventos_sembrar()', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.ninos_evento_sync_fechas(uuid)', 'EXECUTE')
          OR has_function_privilege('authenticated', 'public.ninos_turno_en_uso(uuid)', 'EXECUTE'))::text$q$,
  'false');
SELECT pg_temp.assert_eq('a: anon reads no new table; authenticated reads but cannot write',
  $q$SELECT string_agg(has_table_privilege('anon', t, 'SELECT')::text || '/'
                       || has_table_privilege('authenticated', t, 'SELECT')::text || '/'
                       || has_table_privilege('authenticated', t, 'INSERT, UPDATE, DELETE')::text, ',' ORDER BY t)
       FROM unnest(ARRAY['public.ninos_carpetas', 'public.ninos_evento_horarios', 'public.ninos_eventos']) t$q$,
  'false/true/false,false/true/false,false/true/false');
SELECT pg_temp.assert_eq('a: RLS is on for the three tables',
  $q$SELECT bool_and(c.relrowsecurity)::text FROM pg_class c
      WHERE c.oid IN ('public.ninos_eventos'::regclass, 'public.ninos_evento_horarios'::regclass,
                      'public.ninos_carpetas'::regclass)$q$,
  'true');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot call ninos_eventos_admin',
  format('SELECT public.ninos_eventos_admin(%L::uuid)', pg_temp.id('ca', 1)));
SELECT pg_temp.assert_denied('a: anon cannot call ninos_evento_guardar',
  pg_temp.guardar(1, 'nada', 'ZZ Ev X', 'semanal', 0, NULL, NULL));
SELECT pg_temp.assert_denied('a: anon cannot read ninos_eventos', 'SELECT count(*) FROM public.ninos_eventos');
SELECT pg_temp.assert_denied('a: anon cannot call ninos_puede_configurar_algun_area_campus',
  format('SELECT public.ninos_puede_configurar_algun_area_campus(%L::uuid)', pg_temp.id('ca', 1)));
RESET ROLE;

-- ── b. existing salones unchanged (S8.5) ─────────────────────────────

SELECT pg_temp.assert_eq('b: every pre-existing salón reads the default rules',
  $q$SELECT pg_temp.ctx('fuera_de_defecto')$q$, '0');
SELECT pg_temp.assert_eq('b: the new salón columns default to today''s behavior',
  format($q$SELECT concat_ws(',', cupo_visitantes, coalesce(ninos_por_voluntario::text, 'null'), min_voluntarios,
                             abierto, opcion_panal, opcion_merienda, coalesce(corte_mes::text, 'null'),
                             coalesce(promocion_mes::text, 'null'))
              FROM public.ninos_salones WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)),
  '0,null,0,t,f,f,null,null');

-- ── c. backfill ──────────────────────────────────────────────────────

SELECT pg_temp.run('c: run the backfill', $q$
  INSERT INTO t_ev_ctx (k, v) VALUES ('sembrar1', public.ninos_eventos_sembrar()::text)$q$);
SELECT pg_temp.assert_eq('c: one Domingo semanal per campus with salones, none without',
  format($q$SELECT string_agg(c.codigo || ':' || coalesce(x.n, 0)::text || ':' || coalesce(x.nombres, '-'), ',' ORDER BY c.codigo)
              FROM public.campus c
              LEFT JOIN (SELECT e.campus_id, count(*) AS n,
                                string_agg(e.nombre || '/' || e.tipo || '/' || e.dia_semana, ';') AS nombres
                           FROM public.ninos_eventos e GROUP BY e.campus_id) x ON x.campus_id = c.id
             WHERE c.id IN (%L::uuid, %L::uuid, %L::uuid)$q$,
         pg_temp.id('ca', 1), pg_temp.id('ca', 2), pg_temp.id('ca', 3)),
  'ZZEV1:1:Domingo semanal/semanal/0,ZZEV2:1:Domingo semanal/semanal/0,ZZEV3:0:-');
SELECT pg_temp.assert_eq('c: only the active Sunday weekly turnos are linked, with 120/120',
  format($q$SELECT string_agg(t.nombre || ':' || h.abre_min_antes || '/' || h.cierra_min_despues || ':' || h.turno_creado,
                              ',' ORDER BY t.nombre)
              FROM public.ninos_evento_horarios h
              JOIN public.ninos_eventos e ON e.id = h.evento_id
              JOIN public.dream_team_turnos t ON t.id = h.turno_id
             WHERE e.campus_id IN (%L::uuid, %L::uuid)$q$, pg_temp.id('ca', 1), pg_temp.id('ca', 2)),
  'ZZ Ev Domingo 11:120/120:false,ZZ Ev Domingo 9:120/120:false,ZZ Ev Domingo C2:120/120:false');
SELECT pg_temp.assert_eq('c: one carpeta per campus and area, default settings',
  format($q$SELECT string_agg(c.codigo || ':' || k.area || ':' || k.distribucion || ':' || k.mantener_regulares, ',' ORDER BY c.codigo, k.area)
              FROM public.ninos_carpetas k JOIN public.campus c ON c.id = k.campus_id
             WHERE k.campus_id IN (%L::uuid, %L::uuid, %L::uuid)$q$,
         pg_temp.id('ca', 1), pg_temp.id('ca', 2), pg_temp.id('ca', 3)),
  'ZZEV1:upstreet:en_orden:true,ZZEV1:waumba:en_orden:true,ZZEV2:waumba:en_orden:true');
SELECT pg_temp.assert_eq('c: re-running the backfill inserts nothing',
  'SELECT public.ninos_eventos_sembrar()::text', '0');
SELECT pg_temp.run('c: keep the Domingo semanal of campus 1', format($q$
  INSERT INTO t_ev_ctx (k, v)
  SELECT 'domingo', e.id::text FROM public.ninos_eventos e WHERE e.campus_id = %L::uuid$q$, pg_temp.id('ca', 1)));
SELECT pg_temp.run('c: keep the T1 horario', format($q$
  INSERT INTO t_ev_ctx (k, v)
  SELECT 'h_t1', h.id::text FROM public.ninos_evento_horarios h WHERE h.turno_id = %L::uuid$q$, pg_temp.id('tu', 1)));

-- ── d. table constraints ─────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: a semanal event needs dia_semana',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo) VALUES (%L::uuid, 'ZZ Ev d1', 'semanal')$q$,
         pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: a semanal event takes no dates',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana, fecha_inicio)
            VALUES (%L::uuid, 'ZZ Ev d2', 'semanal', 0, DATE '2099-01-01')$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: a diario event ends on or after it starts',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, fecha_inicio, fecha_fin)
            VALUES (%L::uuid, 'ZZ Ev d3', 'diario', DATE '2099-01-05', DATE '2099-01-04')$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: a diario event lasts at most 31 days',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, fecha_inicio, fecha_fin)
            VALUES (%L::uuid, 'ZZ Ev d4', 'diario', DATE '2099-01-01', DATE '2099-02-01')$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_eq('d: a diario event of exactly 31 days is valid',
  format($q$WITH i AS (INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, fecha_inicio, fecha_fin)
            VALUES (%L::uuid, 'ZZ Ev d5', 'diario', DATE '2099-01-01', DATE '2099-01-31') RETURNING 1)
            SELECT count(*)::text FROM i$q$, pg_temp.id('ca', 3)), '1');
SELECT pg_temp.assert_raises('d: a unico event has one date only',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, fecha_inicio, fecha_fin)
            VALUES (%L::uuid, 'ZZ Ev d6', 'unico', DATE '2099-01-01', DATE '2099-01-02')$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: an unknown tipo',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana)
            VALUES (%L::uuid, 'ZZ Ev d7', 'mensual', 0)$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: the desk notice holds 140 characters',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana, anuncio_mesa)
            VALUES (%L::uuid, 'ZZ Ev d8', 'semanal', 1, repeat('a', 141))$q$, pg_temp.id('ca', 1)), '23514');
SELECT pg_temp.assert_raises('d: two active events cannot share a name',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana)
            VALUES (%L::uuid, ' domingo SEMANAL', 'semanal', 1)$q$, pg_temp.id('ca', 1)), '23505');
SELECT pg_temp.assert_raises('d: the window opens at most 240 minutes before',
  format($q$INSERT INTO public.ninos_evento_horarios (evento_id, turno_id, abre_min_antes)
            VALUES (%L::uuid, %L::uuid, 241)$q$, pg_temp.ctx('domingo'), pg_temp.id('tu', 4)), '23514');
SELECT pg_temp.assert_raises('d: the window closes at least 0 minutes after',
  format($q$INSERT INTO public.ninos_evento_horarios (evento_id, turno_id, cierra_min_despues)
            VALUES (%L::uuid, %L::uuid, -1)$q$, pg_temp.ctx('domingo'), pg_temp.id('tu', 4)), '23514');
SELECT pg_temp.assert_raises('d: a turno belongs to one horario',
  format($q$INSERT INTO public.ninos_evento_horarios (evento_id, turno_id) VALUES (%L::uuid, %L::uuid)$q$,
         pg_temp.ctx('domingo'), pg_temp.id('tu', 1)), '23505');
SELECT pg_temp.assert_raises('d: a horario needs a turno',
  format($q$INSERT INTO public.ninos_evento_horarios (evento_id, turno_id) VALUES (%L::uuid, NULL)$q$,
         pg_temp.ctx('domingo')), '23502');
SELECT pg_temp.assert_raises('d: an unknown distribution',
  format($q$INSERT INTO public.ninos_carpetas (campus_id, area, distribucion) VALUES (%L::uuid, 'waumba', 'azar')$q$,
         pg_temp.id('ca', 3)), '23514');
SELECT pg_temp.assert_raises('d: one carpeta per campus and area',
  format($q$INSERT INTO public.ninos_carpetas (campus_id, area) VALUES (%L::uuid, 'waumba')$q$, pg_temp.id('ca', 1)),
  '23505');
SELECT pg_temp.assert_raises('d: a cut-off date must exist (30 Feb)',
  format($q$UPDATE public.ninos_salones SET corte_mes = 2, corte_dia = 30 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)),
  '23514');
SELECT pg_temp.assert_raises('d: a cut-off needs day and month',
  format($q$UPDATE public.ninos_salones SET corte_mes = 12 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)), '23514');
SELECT pg_temp.assert_raises('d: a promotion date must exist (31 Apr)',
  format($q$UPDATE public.ninos_salones SET promocion_mes = 4, promocion_dia = 31 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)),
  '23514');
SELECT pg_temp.assert_raises('d: the visitor quota is at most 500',
  format($q$UPDATE public.ninos_salones SET cupo_visitantes = 501 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)), '23514');
SELECT pg_temp.assert_raises('d: at least one child per volunteer',
  format($q$UPDATE public.ninos_salones SET ninos_por_voluntario = 0 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)), '23514');
SELECT pg_temp.assert_raises('d: the volunteer minimum is at most 50',
  format($q$UPDATE public.ninos_salones SET min_voluntarios = 51 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)), '23514');

-- ── e. authority ─────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a user without Niños rights cannot read the events',
  format('SELECT public.ninos_eventos_admin(%L::uuid)', pg_temp.id('ca', 1)), '42501', 'sin_autoridad',
  'No tienes permiso para ver los eventos de Niños de este campus.');
SELECT pg_temp.assert_raises('e: a user without Niños rights cannot create an event',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Nadie', 'semanal', 3, NULL, NULL), '42501', 'sin_autoridad',
  'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.');
SELECT pg_temp.assert_raises('e: a user without Niños rights cannot ask visitante',
  format('SELECT public.ninos_es_visitante(%L::uuid, DATE %L)', pg_temp.id('us', 12), '2026-03-22'),
  '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: an anfitrión does not read the events admin',
  format('SELECT public.ninos_eventos_admin(%L::uuid)', pg_temp.id('ca', 1)), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: an anfitrión cannot create an event',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Anfi', 'semanal', 3, NULL, NULL), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: an anfitrión cannot change a window',
  format('SELECT public.ninos_horario_ventana_guardar(%L::uuid, 30, 30)', pg_temp.ctx('h_t1')), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: an anfitrión cannot change the salón rules',
  pg_temp.reglas(1, 2, 8, 2), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: an anfitrión cannot change a carpeta',
  format($q$SELECT public.ninos_carpeta_guardar(%L::uuid, 'waumba', 'equilibrada', false)$q$, pg_temp.id('ca', 1)),
  '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: the Waumba-only coordinator reads the events of the campus',
  format($q$SELECT jsonb_array_length(public.ninos_eventos_admin(%L::uuid))::text$q$, pg_temp.id('ca', 1)), '1');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot create an event',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Waumba', 'semanal', 3, NULL, NULL), '42501', 'sin_autoridad',
  'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot edit an event',
  pg_temp.guardar(1, 'domingo', 'Domingo semanal', 'semanal', 0, NULL, NULL, 'ZZ Ev aviso'), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot archive an event',
  format('SELECT public.ninos_evento_archivar(%L::uuid)', pg_temp.ctx('domingo')), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot add a horario',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, NULL, 'ZZ Ev Waumba 17', TIME '17:00')$q$, pg_temp.ctx('domingo')),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot change a window',
  format('SELECT public.ninos_horario_ventana_guardar(%L::uuid, 30, 30)', pg_temp.ctx('h_t1')), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the Waumba-only coordinator cannot remove a horario',
  format('SELECT public.ninos_horario_quitar(%L::uuid)', pg_temp.ctx('h_t1')), '42501', 'sin_autoridad');

SELECT pg_temp.assert_eq('e: the refused writes created no Dream Team turno',
  format('SELECT count(*)::text FROM public.dream_team_turnos WHERE campus_id = %L::uuid', pg_temp.id('ca', 1)),
  pg_temp.ctx('turnos_c1'));

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e: the coordinator of another campus cannot read the events here',
  format('SELECT public.ninos_eventos_admin(%L::uuid)', pg_temp.id('ca', 1)), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the coordinator of another campus cannot create an event here',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Otro', 'semanal', 3, NULL, NULL), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the coordinator of another campus cannot add a horario here',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 4)),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the coordinator of another campus cannot remove a horario here',
  format('SELECT public.ninos_horario_quitar(%L::uuid)', pg_temp.ctx('h_t1')), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: the coordinator of another campus cannot archive an event here',
  format('SELECT public.ninos_evento_archivar(%L::uuid)', pg_temp.ctx('domingo')), '42501', 'sin_autoridad');

-- ── f. read ──────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: the event with its horarios (turno name and hour) and window',
  format($q$SELECT string_agg(e ->> 'nombre' || '|' || (h ->> 'nombre') || '@' || (h ->> 'hora') || ':'
                              || (h ->> 'abre_min_antes') || '/' || (h ->> 'cierra_min_despues'), ',')
              FROM jsonb_array_elements(public.ninos_eventos_admin(%L::uuid)) e,
                   jsonb_array_elements(e -> 'horarios') h$q$, pg_temp.id('ca', 1)),
  'Domingo semanal|ZZ Ev Domingo 9@09:00:120/120,Domingo semanal|ZZ Ev Domingo 11@11:00:120/120');
SELECT pg_temp.assert_eq('f: sessions are distinct children per fecha, newest first',
  format($q$SELECT string_agg((s ->> 'fecha') || ':' || (s ->> 'ninos'), ',')
              FROM jsonb_array_elements(public.ninos_eventos_admin(%L::uuid)) e,
                   jsonb_array_elements(e -> 'sesiones') s$q$, pg_temp.id('ca', 1)),
  '2026-03-15:2,2026-03-08:2,2026-03-01:1');
SELECT pg_temp.assert_eq('f: the default options of the backfilled event',
  format($q$SELECT concat_ws(',', e ->> 'precheck_app', e ->> 'avisos_push', e ->> 'visitante_una_vez',
                             e ->> 'integracion_dream_team', coalesce(e ->> 'anuncio_mesa', 'null'), e ->> 'activo')
              FROM jsonb_array_elements(public.ninos_eventos_admin(%L::uuid)) e$q$, pg_temp.id('ca', 1)),
  'true,true,false,true,null,true');

-- ── g. ninos_evento_guardar (as the Dirección, both areas) ──────────

SELECT pg_temp.as_persona(5);

SELECT pg_temp.assert_raises('g: a name is required',
  pg_temp.guardar(1, 'nada', '  ', 'semanal', 3, NULL, NULL), '22023', 'nombre_invalido',
  'El evento necesita un nombre de hasta 80 caracteres.');
SELECT pg_temp.assert_raises('g: an unknown tipo',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Mensual', 'mensual', 3, NULL, NULL), '22023', 'tipo_invalido',
  'El evento es semanal, diario o de un solo día.');
SELECT pg_temp.assert_raises('g: a semanal event needs its weekday',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Sin dia', 'semanal', NULL, NULL, NULL), '22023', 'dia_invalido',
  'Un evento semanal necesita el día de la semana.');
SELECT pg_temp.assert_raises('g: a diario event that ends before it starts',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Al reves', 'diario', NULL, DATE '2099-07-08', DATE '2099-07-06'), '22023',
  'fechas_invalidas', 'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.');
SELECT pg_temp.assert_raises('g: a diario event of 32 days',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Largo', 'diario', NULL, DATE '2099-07-01', DATE '2099-08-01'), '22023',
  'fechas_invalidas');
SELECT pg_temp.assert_raises('g: a unico event without its date',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Sin fecha', 'unico', NULL, NULL, NULL), '22023', 'fechas_invalidas',
  'Un evento de un solo día necesita su fecha.');
SELECT pg_temp.assert_raises('g: a desk notice of 141 characters',
  pg_temp.guardar(1, 'nada', 'ZZ Ev Anuncio', 'semanal', 3, NULL, NULL, repeat('a', 141)), '22023', 'anuncio_largo',
  'El anuncio de la mesa admite hasta 140 caracteres.');
SELECT pg_temp.assert_raises('g: the name of another active event',
  pg_temp.guardar(1, 'nada', 'domingo semanal', 'semanal', 3, NULL, NULL), '23505', 'nombre_duplicado',
  'Ya hay un evento activo con ese nombre en este campus.');
SELECT pg_temp.assert_raises('g: a semanal event with dates (B2)',
  pg_temp.guardar(1, 'nada', 'ZZ Ev B2 a', 'semanal', 3, DATE '2099-07-06', NULL), '22023', 'fechas_invalidas',
  'Un evento semanal no lleva fechas: se repite cada semana en su día.');
SELECT pg_temp.assert_raises('g: a diario event with a weekday (B2)',
  pg_temp.guardar(1, 'nada', 'ZZ Ev B2 b', 'diario', 3, DATE '2099-07-06', DATE '2099-07-08'), '22023', 'dia_invalido',
  'Un evento diario o de un solo día no lleva día de la semana.');
SELECT pg_temp.assert_raises('g: a unico event with a weekday (B2)',
  pg_temp.guardar(1, 'nada', 'ZZ Ev B2 c', 'unico', 3, DATE '2099-07-06', NULL), '22023', 'dia_invalido');
SELECT pg_temp.assert_eq('g: the refused saves wrote no event',
  $q$SELECT count(*)::text FROM public.ninos_eventos WHERE nombre LIKE 'ZZ Ev B2%'$q$, '0');
SELECT pg_temp.run('g: create a diario camp and a unico night', $q$
  INSERT INTO t_ev_ctx (k, v) VALUES
    ('camp', public.ninos_evento_guardar(pg_temp.id('ca', 1), NULL, 'ZZ Ev Campamento', 'diario', NULL,
                                         DATE '2099-07-06', DATE '2099-07-08', NULL, NULL, true, NULL,
                                         ' Trae protector solar. ', NULL)::text),
    ('noche', public.ninos_evento_guardar(pg_temp.id('ca', 1), NULL, 'ZZ Ev Noche de padres', 'unico', NULL,
                                          DATE '2099-12-24', NULL, false, NULL, NULL, NULL, NULL, NULL)::text)$q$);
SELECT pg_temp.assert_eq('g: the camp is stored with its options',
  format($q$SELECT concat_ws(',', tipo, fecha_inicio, fecha_fin, coalesce(dia_semana::text, 'null'), precheck_app,
                             visitante_una_vez, anuncio_mesa, activo)
              FROM public.ninos_eventos WHERE id = %L::uuid$q$, pg_temp.ctx('camp')),
  'diario,2099-07-06,2099-07-08,null,t,t,Trae protector solar.,t');
SELECT pg_temp.run('g: save the camp without anuncio (NULL)',
  pg_temp.guardar(1, 'camp', 'ZZ Ev Campamento', 'diario', NULL, DATE '2099-07-06', DATE '2099-07-08', NULL));
SELECT pg_temp.assert_eq('g: anuncio NULL keeps the current notice',
  format('SELECT anuncio_mesa FROM public.ninos_eventos WHERE id = %L::uuid', pg_temp.ctx('camp')),
  'Trae protector solar.');
SELECT pg_temp.run('g: save the camp with an empty anuncio',
  pg_temp.guardar(1, 'camp', 'ZZ Ev Campamento', 'diario', NULL, DATE '2099-07-06', DATE '2099-07-08', ''));
SELECT pg_temp.assert_eq('g: an empty anuncio clears the notice',
  format($q$SELECT coalesce(anuncio_mesa, 'null') FROM public.ninos_eventos WHERE id = %L::uuid$q$, pg_temp.ctx('camp')),
  'null');
SELECT pg_temp.assert_eq('g: the unico night keeps fecha_fin empty',
  format($q$SELECT concat_ws(',', tipo, fecha_inicio, coalesce(fecha_fin::text, 'null'), precheck_app)
              FROM public.ninos_eventos WHERE id = %L::uuid$q$, pg_temp.ctx('noche')),
  'unico,2099-12-24,null,f');
SELECT pg_temp.assert_raises('g: an event of another campus is not found',
  format($q$SELECT public.ninos_evento_guardar(%L::uuid, %L::uuid, 'ZZ Ev X', 'semanal', 3::smallint)$q$,
         pg_temp.id('ca', 2), pg_temp.ctx('camp')), '22023', 'evento_no_encontrado');

-- ── h. horarios ──────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('h: a Saturday turno on a Sunday event',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 4)),
  '22023', 'turno_invalido', 'El turno no es un turno semanal activo de este campus en el día del evento.');
SELECT pg_temp.assert_raises('h: a dated turno on a weekly event',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 3)),
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('h: an inactive turno',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 5)),
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('h: a turno of another campus',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 6)),
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('h: a turno already linked',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('domingo'), pg_temp.id('tu', 1)),
  '23505', 'turno_ya_vinculado', 'Ese turno ya es un horario de un evento de Niños.');
SELECT pg_temp.assert_raises('h: a new turno needs its hour',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, NULL, 'ZZ Ev Tarde')$q$, pg_temp.ctx('domingo')),
  '22023', 'hora_requerida', 'Indica la hora del servicio.');
SELECT pg_temp.assert_raises('h: an existing turno on a dated event',
  format('SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid)', pg_temp.ctx('camp'), pg_temp.id('tu', 4)),
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('h: a window over 240 minutes',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, NULL, 'ZZ Ev Tarde', TIME '17:00', 300, 120)$q$,
         pg_temp.ctx('domingo')), '22023', 'ventana_invalida', 'La apertura y el cierre van de 0 a 240 minutos.');
SELECT pg_temp.run('h: a new weekly turno for the Sunday event', $q$
  INSERT INTO t_ev_ctx (k, v)
  VALUES ('h_tarde', public.ninos_horario_agregar(pg_temp.ctx('domingo')::uuid, NULL, 'ZZ Ev Domingo 17',
                                                  TIME '17:00', 60, 45)::text)$q$);
SELECT pg_temp.assert_eq('h: the weekly turno is created on the event''s weekday',
  format($q$SELECT concat_ws(',', t.nombre, t.tipo, t.dia_semana, to_char(t.hora, 'HH24:MI'), t.activo,
                             h.abre_min_antes, h.cierra_min_despues, h.turno_creado,
                             (SELECT count(*) FROM public.dream_team_equipo_turnos et WHERE et.turno_id = t.id))
              FROM public.ninos_evento_horarios h JOIN public.dream_team_turnos t ON t.id = h.turno_id
             WHERE h.id = %L::uuid$q$, pg_temp.ctx('h_tarde')),
  'ZZ Ev Domingo 17,semanal,0,17:00,t,60,45,t,0');
SELECT pg_temp.assert_raises('h: a turno name already used in the campus',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, NULL, 'ZZ Ev Domingo 17', TIME '18:00')$q$,
         pg_temp.ctx('domingo')), '23505', 'turno_duplicado', 'Ya hay un turno de Dream Team con ese nombre en el campus.');
SELECT pg_temp.assert_raises('h: an existing turno together with a name (B2)',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid, 'ZZ Ev Otro nombre')$q$,
         pg_temp.ctx('domingo'), pg_temp.id('tu', 4)), '22023', 'turno_invalido',
  'Elige un turno existente o indica nombre y hora para uno nuevo, no ambos.');
SELECT pg_temp.assert_raises('h: an existing turno together with an hour (B2)',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, %L::uuid, NULL, TIME '10:00')$q$,
         pg_temp.ctx('domingo'), pg_temp.id('tu', 4)), '22023', 'turno_invalido');
SELECT pg_temp.assert_eq('h: the refused horarios (and turno_duplicado) wrote no horario and only the Domingo 17 turno',
  format($q$SELECT (SELECT count(*) FROM public.ninos_evento_horarios WHERE turno_id = %L::uuid) || ','
                || ((SELECT count(*) FROM public.dream_team_turnos WHERE campus_id = %L::uuid) - %s)$q$,
         pg_temp.id('tu', 4), pg_temp.id('ca', 1), pg_temp.ctx('turnos_c1')),
  '0,1');
SELECT pg_temp.run('h: the camp gets its turno por fechas', $q$
  INSERT INTO t_ev_ctx (k, v)
  VALUES ('h_camp', public.ninos_horario_agregar(pg_temp.ctx('camp')::uuid, NULL, 'ZZ Ev Jornada', TIME '08:30')::text)$q$);
SELECT pg_temp.run('h: keep the camp turno', $q$
  INSERT INTO t_ev_ctx (k, v)
  SELECT 'tu_camp', h.turno_id::text FROM public.ninos_evento_horarios h WHERE h.id = pg_temp.ctx('h_camp')::uuid$q$);
SELECT pg_temp.assert_eq('h: the camp turno is a dated Dream Team turno',
  format($q$SELECT concat_ws(',', t.nombre, t.tipo, to_char(t.hora, 'HH24:MI'), t.activo, t.campus_id = %L::uuid)
              FROM public.dream_team_turnos t WHERE t.id = %L::uuid$q$, pg_temp.id('ca', 1), pg_temp.ctx('tu_camp')),
  'ZZ Ev Jornada,fechas,08:30,t,t');
SELECT pg_temp.assert_eq('h: one planned date per day of the camp',
  format($q$SELECT string_agg(f.fecha::text, ',' ORDER BY f.fecha) FROM public.dream_team_turno_fechas f
             WHERE f.turno_id = %L::uuid$q$, pg_temp.ctx('tu_camp')),
  '2099-07-06,2099-07-07,2099-07-08');
SELECT pg_temp.assert_eq('h: the dated turno is listed for the equipos of the campus''s salones',
  format($q$SELECT string_agg(e.label, ',' ORDER BY e.label) FROM public.dream_team_equipo_turnos et
              JOIN public.dream_team_equipos e ON e.id = et.equipo_id WHERE et.turno_id = %L::uuid$q$, pg_temp.ctx('tu_camp')),
  'ZZ Ev U1,ZZ Ev W1');
SELECT pg_temp.assert_eq('h: the camp turno happens on its days only',
  format($q$SELECT public.dream_team_turno_activo_en(%L::uuid, DATE '2099-07-07')::text || ','
                || public.dream_team_turno_activo_en(%L::uuid, DATE '2099-07-09')::text$q$,
         pg_temp.ctx('tu_camp'), pg_temp.ctx('tu_camp')),
  'true,false');
SELECT pg_temp.assert_eq('h: moving the camp keeps its id',
  format($q$SELECT (public.ninos_evento_guardar(%L::uuid, %L::uuid, 'ZZ Ev Campamento', 'diario', NULL,
                                                DATE '2099-07-07', DATE '2099-07-10')::text = %L)::text$q$,
         pg_temp.id('ca', 1), pg_temp.ctx('camp'), pg_temp.ctx('camp')),
  'true');
SELECT pg_temp.assert_eq('h: moving the camp re-syncs its planned dates',
  format($q$SELECT string_agg(f.fecha::text, ',' ORDER BY f.fecha) FROM public.dream_team_turno_fechas f
             WHERE f.turno_id = %L::uuid$q$, pg_temp.ctx('tu_camp')),
  '2099-07-07,2099-07-08,2099-07-09,2099-07-10');
RESET ROLE;
SELECT pg_temp.run('h: a past planned date and a check-in on 7 Jul for the camp turno', format($q$
  INSERT INTO public.dream_team_turno_fechas (turno_id, fecha) VALUES (%L::uuid, DATE '2020-01-05');
  INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo)
  VALUES (%L::uuid, %L::uuid, %L::uuid, %L::uuid, DATE '2099-07-07', gen_random_uuid(), '4321')$q$,
  pg_temp.ctx('tu_camp'), pg_temp.id('us', 11), pg_temp.id('sa', 1), pg_temp.ctx('tu_camp'), pg_temp.id('ca', 1)));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.run('h: move the camp to 8–11 Jul',
  pg_temp.guardar(1, 'camp', 'ZZ Ev Campamento', 'diario', NULL, DATE '2099-07-08', DATE '2099-07-11'));
SELECT pg_temp.assert_eq('h: re-syncing keeps the past date and the date with check-ins',
  format($q$SELECT string_agg(f.fecha::text, ',' ORDER BY f.fecha) FROM public.dream_team_turno_fechas f
             WHERE f.turno_id = %L::uuid$q$, pg_temp.ctx('tu_camp')),
  '2020-01-05,2099-07-07,2099-07-08,2099-07-09,2099-07-10,2099-07-11');
SELECT pg_temp.assert_raises('h: a dated event with horarios cannot become weekly',
  format($q$SELECT public.ninos_evento_guardar(%L::uuid, %L::uuid, 'ZZ Ev Campamento', 'semanal', 3::smallint)$q$,
         pg_temp.id('ca', 1), pg_temp.ctx('camp')), '22023', 'evento_con_horarios',
  'Quita los horarios antes de cambiar el tipo o el día del evento.');
SELECT pg_temp.assert_raises('h: a weekly event with horarios keeps its weekday',
  format($q$SELECT public.ninos_evento_guardar(%L::uuid, %L::uuid, 'Domingo semanal', 'semanal', 1::smallint)$q$,
         pg_temp.id('ca', 1), pg_temp.ctx('domingo')), '22023', 'evento_con_horarios');
SELECT pg_temp.run('h: the night gets its turno por fechas', $q$
  INSERT INTO t_ev_ctx (k, v)
  VALUES ('h_noche', public.ninos_horario_agregar(pg_temp.ctx('noche')::uuid, NULL, NULL, TIME '19:00')::text)$q$);
SELECT pg_temp.assert_eq('h: the night turno takes the event name and one date',
  format($q$SELECT t.nombre || ':' || t.tipo || ':' || (SELECT string_agg(f.fecha::text, ',') FROM public.dream_team_turno_fechas f
                                                     WHERE f.turno_id = t.id)
              FROM public.ninos_evento_horarios h JOIN public.dream_team_turnos t ON t.id = h.turno_id
             WHERE h.id = %L::uuid$q$, pg_temp.ctx('h_noche')),
  'ZZ Ev Noche de padres 19:00:fechas:2099-12-24');
SELECT pg_temp.assert_eq('h: the window of a horario changes',
  format($q$SELECT public.ninos_horario_ventana_guardar(%L::uuid, 30, 90)::text = %L$q$, pg_temp.ctx('h_t1'), pg_temp.ctx('h_t1')),
  'true');
SELECT pg_temp.assert_raises('h: a window over 240 minutes is refused',
  format('SELECT public.ninos_horario_ventana_guardar(%L::uuid, 241, 90)', pg_temp.ctx('h_t1')), '22023', 'ventana_invalida');
SELECT pg_temp.assert_raises('h: a negative window is refused',
  format('SELECT public.ninos_horario_ventana_guardar(%L::uuid, 30, -5)', pg_temp.ctx('h_t1')), '22023', 'ventana_invalida');

-- ── j. ninos_horario_de_turno ────────────────────────────────────────

SELECT pg_temp.assert_eq('j: a linked turno reads its horario''s window',
  format($q$SELECT abre_min_antes || '/' || cierra_min_despues FROM public.ninos_horario_de_turno(%L::uuid)$q$,
         pg_temp.id('tu', 1)), '30/90');
SELECT pg_temp.assert_eq('j: a turno without horario falls back to 120/120',
  format($q$SELECT abre_min_antes || '/' || cierra_min_despues FROM public.ninos_horario_de_turno(%L::uuid)$q$,
         pg_temp.id('tu', 4)), '120/120');
SELECT pg_temp.assert_eq('j: an unknown turno falls back to 120/120',
  format($q$SELECT abre_min_antes || '/' || cierra_min_despues FROM public.ninos_horario_de_turno(%L::uuid)$q$,
         pg_temp.id('tu', 99)), '120/120');

-- ── i. removing horarios ─────────────────────────────────────────────

-- The camp turno has a check-in on 7 Jul (section h).
SELECT pg_temp.as_persona(5);
SELECT pg_temp.run('i: a unico workshop with its dated turno', $q$
  INSERT INTO t_ev_ctx (k, v)
  VALUES ('taller', public.ninos_evento_guardar(pg_temp.id('ca', 1), NULL, 'ZZ Ev Taller', 'unico', NULL,
                                                DATE '2099-11-01')::text)$q$);
SELECT pg_temp.run('i: the workshop horario', $q$
  INSERT INTO t_ev_ctx (k, v)
  VALUES ('h_taller', public.ninos_horario_agregar(pg_temp.ctx('taller')::uuid, NULL, 'ZZ Ev Taller 10', TIME '10:00')::text)$q$);
RESET ROLE;
SELECT pg_temp.run('i: assign the anfitrión''s servicio to the workshop turno', format($q$
  INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id)
  SELECT s.id, h.turno_id FROM public.dream_team_servicios s, public.ninos_evento_horarios h
   WHERE s.persona_id = %L::uuid AND h.id = %L::uuid$q$, pg_temp.id('us', 2), pg_temp.ctx('h_taller')));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('i: removing the workshop horario keeps its turno (a volunteer is assigned, B1)',
  format($q$SELECT public.ninos_horario_quitar(%L::uuid) ->> 'turno_borrado'$q$, pg_temp.ctx('h_taller')), 'false');
RESET ROLE;
SELECT pg_temp.assert_eq('i: the workshop turno, its assignment and its date survive; the horario is gone',
  format($q$SELECT concat_ws(',',
              (SELECT count(*) FROM public.dream_team_turnos WHERE nombre = 'ZZ Ev Taller 10'),
              (SELECT count(*) FROM public.dream_team_servicio_turnos st JOIN public.dream_team_turnos t ON t.id = st.turno_id
                WHERE t.nombre = 'ZZ Ev Taller 10'),
              (SELECT count(*) FROM public.dream_team_turno_fechas f JOIN public.dream_team_turnos t ON t.id = f.turno_id
                WHERE t.nombre = 'ZZ Ev Taller 10'),
              (SELECT count(*) FROM public.ninos_evento_horarios WHERE id = %L::uuid))$q$, pg_temp.ctx('h_taller')),
  '1,1,1,0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('i: removing the camp horario keeps its turno (it has check-ins)',
  format($q$SELECT public.ninos_horario_quitar(%L::uuid) ->> 'turno_borrado'$q$, pg_temp.ctx('h_camp')), 'false');
SELECT pg_temp.assert_eq('i: removing the night horario deletes its unused dated turno',
  format($q$SELECT public.ninos_horario_quitar(%L::uuid) ->> 'turno_borrado'$q$, pg_temp.ctx('h_noche')), 'true');
SELECT pg_temp.assert_eq('i: removing a backfilled weekly horario keeps the turno',
  format($q$SELECT public.ninos_horario_quitar(%L::uuid) ->> 'turno_borrado'$q$, pg_temp.ctx('h_t1')), 'false');
SELECT pg_temp.assert_eq('i: removing a weekly turno Niños created keeps it',
  format($q$SELECT public.ninos_horario_quitar(%L::uuid) ->> 'turno_borrado'$q$, pg_temp.ctx('h_tarde')), 'false');
RESET ROLE;
SELECT pg_temp.assert_eq('i: the turnos left: camp yes, night no, T1 yes and active, Domingo 17 yes',
  format($q$SELECT concat_ws(',',
              (SELECT count(*) FROM public.dream_team_turnos WHERE id = %L::uuid),
              (SELECT count(*) FROM public.dream_team_turnos WHERE nombre = 'ZZ Ev Noche de padres 19:00'),
              (SELECT activo FROM public.dream_team_turnos WHERE id = %L::uuid),
              (SELECT count(*) FROM public.dream_team_turnos WHERE nombre = 'ZZ Ev Domingo 17'),
              (SELECT count(*) FROM public.ninos_checkins WHERE turno_id = %L::uuid),
              (SELECT count(*) FROM public.ninos_evento_horarios WHERE id IN (%L::uuid, %L::uuid, %L::uuid, %L::uuid)))$q$,
         pg_temp.ctx('tu_camp'), pg_temp.id('tu', 1), pg_temp.ctx('tu_camp'),
         pg_temp.ctx('h_camp'), pg_temp.ctx('h_noche'), pg_temp.ctx('h_t1'), pg_temp.ctx('h_tarde')),
  '1,0,t,1,1,0');
SELECT pg_temp.assert_eq('j: a removed horario''s turno falls back to 120/120',
  format($q$SELECT abre_min_antes || '/' || cierra_min_despues FROM public.ninos_horario_de_turno(%L::uuid)$q$,
         pg_temp.id('tu', 1)), '120/120');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('i: an unknown horario',
  format('SELECT public.ninos_horario_quitar(%L::uuid)', pg_temp.id('tu', 99)), '22023', 'horario_no_encontrado');

-- Archive and restore.
SELECT pg_temp.assert_eq('i: archiving the camp answers false',
  format($q$SELECT public.ninos_evento_archivar(%L::uuid)::text$q$, pg_temp.ctx('camp')), 'false');
SELECT pg_temp.assert_eq('i: the archived camp reads activo false',
  format($q$SELECT activo::text FROM public.ninos_eventos WHERE id = %L::uuid$q$, pg_temp.ctx('camp')), 'false');
SELECT pg_temp.assert_raises('i: an archived event takes no horario',
  format($q$SELECT public.ninos_horario_agregar(%L::uuid, NULL, NULL, TIME '10:00')$q$, pg_temp.ctx('camp')),
  '22023', 'evento_archivado');
SELECT pg_temp.assert_eq('i: restoring the camp',
  format($q$SELECT public.ninos_evento_archivar(%L::uuid, true)::text$q$, pg_temp.ctx('camp')), 'true');

-- ── k. ninos_es_visitante (S8.3) ─────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('k: 2 prior fechas (one with two turnos) → visitante',
  format($q$SELECT public.ninos_es_visitante(%L::uuid, DATE '2026-03-22')::text$q$, pg_temp.id('us', 12)), 'true');
SELECT pg_temp.assert_eq('k: 3 prior fechas → regular',
  format($q$SELECT public.ninos_es_visitante(%L::uuid, DATE '2026-03-22')::text$q$, pg_temp.id('us', 11)), 'false');
SELECT pg_temp.assert_eq('k: only fechas before the date count (3rd visit is still visitante)',
  format($q$SELECT public.ninos_es_visitante(%L::uuid, DATE '2026-03-15')::text$q$, pg_temp.id('us', 11)), 'true');
SELECT pg_temp.assert_eq('k: a child of the campus never checked in → visitante',
  format($q$SELECT public.ninos_es_visitante(%L::uuid, DATE '2026-03-22')::text$q$, pg_temp.id('us', 14)), 'true');
SELECT pg_temp.assert_raises('k: a child outside the caller''s campuses is refused',
  format($q$SELECT public.ninos_es_visitante(%L::uuid, DATE '2026-03-22')$q$, pg_temp.id('us', 13)), '42501', 'sin_autoridad',
  'Ese niño no es de un campus donde operas Niños.');

-- ── l. salón rules and carpetas ──────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('l: a negative visitor quota', pg_temp.reglas(1, -1, 8, 2), '22023', 'cupo_invalido',
  'El cupo de visitantes va de 0 a 500.');
SELECT pg_temp.assert_raises('l: zero children per volunteer', pg_temp.reglas(1, 2, 0, 2), '22023', 'voluntarios_invalidos',
  'Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.');
SELECT pg_temp.assert_raises('l: 30 Feb as cut-off', pg_temp.reglas(1, 2, 8, 2, 2, 30), '22023', 'corte_invalido',
  'La fecha de corte necesita un día y un mes válidos.');
SELECT pg_temp.assert_raises('l: a cut-off month without day', pg_temp.reglas(1, 2, 8, 2, 12, NULL), '22023', 'corte_invalido');
SELECT pg_temp.assert_raises('l: month 13 as promotion', pg_temp.reglas(1, 2, 8, 2, 12, 1, 13, 1), '22023',
  'promocion_invalida', 'La fecha de promoción necesita un día y un mes válidos.');
SELECT pg_temp.assert_raises('l: the Waumba-only coordinator cannot save an UpStreet salón', pg_temp.reglas(2, 2, 8, 2),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('l: an unknown salón',
  format($q$SELECT public.ninos_salon_reglas_guardar(%L::uuid, 0, NULL, 0, true, false, false)$q$, pg_temp.id('sa', 99)),
  '22023', 'salon_no_encontrado');
SELECT pg_temp.run('l: the Waumba-only coordinator saves the rules of S1 (Waumba)', pg_temp.reglas(1, 2, 8, 2, 12, 1, 8, 1));
SELECT pg_temp.assert_eq('l: S1 reads its rules; capacidad unchanged',
  format($q$SELECT concat_ws(',', capacidad, cupo_visitantes, ninos_por_voluntario, min_voluntarios, abierto, opcion_panal,
                             opcion_merienda, corte_mes, corte_dia, promocion_mes, promocion_dia)
              FROM public.ninos_salones WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)),
  '20,2,8,2,f,t,t,12,1,8,1');
SELECT pg_temp.run('l: clear the optional rules of S1',
  format($q$SELECT public.ninos_salon_reglas_guardar(%L::uuid, 0, NULL, 0, true, false, false)$q$, pg_temp.id('sa', 1)));
SELECT pg_temp.assert_eq('l: S1 back to no rule',
  format($q$SELECT concat_ws(',', cupo_visitantes, coalesce(ninos_por_voluntario::text, 'null'), abierto,
                             coalesce(corte_mes::text, 'null'), coalesce(promocion_dia::text, 'null'))
              FROM public.ninos_salones WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)),
  '0,null,t,null,null');

SELECT pg_temp.assert_raises('l: an unknown area',
  format($q$SELECT public.ninos_carpeta_guardar(%L::uuid, 'adultos', 'equilibrada', false)$q$, pg_temp.id('ca', 1)),
  '22023', 'area_invalida', 'El área es Waumba Land o UpStreet.');
SELECT pg_temp.assert_raises('l: an unknown distribution',
  format($q$SELECT public.ninos_carpeta_guardar(%L::uuid, 'waumba', 'azar', false)$q$, pg_temp.id('ca', 1)),
  '22023', 'distribucion_invalida', 'La distribución es en orden o equilibrada.');
SELECT pg_temp.assert_raises('l: the Waumba-only coordinator cannot save the UpStreet carpeta',
  format($q$SELECT public.ninos_carpeta_guardar(%L::uuid, 'upstreet', 'equilibrada', false)$q$, pg_temp.id('ca', 1)),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('l: the Waumba-only coordinator saves the Waumba carpeta',
  format($q$SELECT (public.ninos_carpeta_guardar(%L::uuid, 'waumba', 'equilibrada', false) IS NOT NULL)::text$q$,
         pg_temp.id('ca', 1)), 'true');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('l: the Dirección saves the UpStreet carpeta',
  format($q$SELECT (public.ninos_carpeta_guardar(%L::uuid, 'upstreet', 'equilibrada', true) IS NOT NULL)::text$q$,
         pg_temp.id('ca', 1)), 'true');
SELECT pg_temp.assert_eq('l: the Dirección saves the rules of the UpStreet salón',
  format($q$SELECT (public.ninos_salon_reglas_guardar(%L::uuid, 0, NULL, 0, true, false, false) = %L::uuid)::text$q$,
         pg_temp.id('sa', 2), pg_temp.id('sa', 2)), 'true');

-- ── m. RLS ───────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_denied('m: no direct insert of an event',
  format($q$INSERT INTO public.ninos_eventos (campus_id, nombre, tipo, dia_semana) VALUES (%L::uuid, 'ZZ Ev m', 'semanal', 2)$q$,
         pg_temp.id('ca', 1)));
SELECT pg_temp.assert_denied('m: no direct update of an event',
  format($q$UPDATE public.ninos_eventos SET nombre = 'ZZ Ev m' WHERE id = %L::uuid$q$, pg_temp.ctx('domingo')));
SELECT pg_temp.assert_denied('m: no direct update of a horario window',
  format($q$UPDATE public.ninos_evento_horarios SET abre_min_antes = 10 WHERE evento_id = %L::uuid$q$, pg_temp.ctx('domingo')));
SELECT pg_temp.assert_denied('m: no direct delete of a horario',
  format($q$DELETE FROM public.ninos_evento_horarios WHERE evento_id = %L::uuid$q$, pg_temp.ctx('domingo')));
SELECT pg_temp.assert_denied('m: no direct write of a carpeta',
  format($q$UPDATE public.ninos_carpetas SET distribucion = 'en_orden' WHERE campus_id = %L::uuid$q$, pg_temp.id('ca', 1)));
SELECT pg_temp.assert_denied('m: no direct update of the new salón columns',
  format($q$UPDATE public.ninos_salones SET cupo_visitantes = 5 WHERE id = %L::uuid$q$, pg_temp.id('sa', 1)));
SELECT pg_temp.assert_eq('m: the coordinator reads the campus 1 events and carpetas, not campus 2''s',
  format($q$SELECT (SELECT count(*) FROM public.ninos_eventos WHERE campus_id = %L::uuid) || ','
                || (SELECT count(*) FROM public.ninos_eventos WHERE campus_id = %L::uuid) || ','
                || (SELECT count(*) FROM public.ninos_carpetas WHERE campus_id = %L::uuid) || ','
                || (SELECT count(*) FROM public.ninos_evento_horarios h JOIN public.ninos_eventos e ON e.id = h.evento_id
                     WHERE e.campus_id = %L::uuid)$q$,
         pg_temp.id('ca', 1), pg_temp.id('ca', 2), pg_temp.id('ca', 1), pg_temp.id('ca', 1)),
  '4,0,2,1');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('m: a user without Niños rights reads none',
  format($q$SELECT (SELECT count(*) FROM public.ninos_eventos WHERE campus_id = %L::uuid) || ','
                || (SELECT count(*) FROM public.ninos_carpetas WHERE campus_id = %L::uuid)$q$,
         pg_temp.id('ca', 1), pg_temp.id('ca', 1)),
  '0,0');
RESET ROLE;

-- ── b. (end) the pre-existing salones did not change ─────────────────

SELECT pg_temp.assert_eq('b: the pre-existing salones are unchanged at the end',
  $q$SELECT (pg_temp.salones_md5() = pg_temp.ctx('md5_antes'))::text$q$, 'true');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ev_failures;

ROLLBACK;
