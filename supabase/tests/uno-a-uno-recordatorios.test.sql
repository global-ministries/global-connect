-- T5 (odd/tasks/uno-a-uno.md) — the 1:1 reminder queue
-- (migrations 20261024220000_uno_a_uno_recordatorios.sql and, for T5.2,
-- 20261024240000_uno_a_uno_recordatorios_lote.sql).
--
-- Covers:
--   S5.1 encolar at 2026-11-10 08:00 Caracas queues tomorrow's (Nov 11, Caracas)
--        agendado 1:1s: one row per person with an email, both sides; the
--        Caracas date decides (22:00 Caracas on the 11th is the 12th in UTC
--        and still counts; 23:00 Caracas on the 10th does not). Cancelled and
--        later 1:1s are left out. Queuing again adds nothing.
--   S5.6 the queued 1:1s are marked (recordatorio_enviado_en); others are not.
--   S5.4 a reprogrammed 1:1 is queued again for its new time, and reclamar
--        discards the rows of the old time instead of returning them.
--   S5.3 reclamar returns what the email needs (lado, con_quien, lugar) and
--        leases the rows: a second reclamar gets none. p_limite outside 1..100
--        is refused.
--   S5.2 resultado: ok → enviado; a failure goes back to pendiente later; the
--        fifth failed attempt is fallido.
--   T5.2 reclamar leases whole people (all their rows) up to p_personas, keeps
--        within p_tope_diario emails per UTC day, and discards rows whose 1:1
--        already started (S5.8-S5.11).
--   P    authenticated can neither read the queue nor call the functions.
--
-- Run against STAGING inside BEGIN…ROLLBACK; the last statement is a SELECT
-- of the failing cases (0 = all ok). Before the migration every case fails.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_u5_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_u5_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_u5_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_u5_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.k(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u5_ids WHERE k = p_key;
$$;

-- `KEY:LABEL:estado` of the fixture queue rows, sorted (plpgsql: loads before the migration).
CREATE OR REPLACE FUNCTION pg_temp.cola_txt() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT coalesce(string_agg(i.k || ':' || u.apellido || ':' || r.estado, ', '
                             ORDER BY i.k, u.apellido, r.fecha_hora), '')
    INTO v
    FROM public.uno_a_uno_recordatorios r
    JOIN t_u5_ids i ON i.id = r.uno_a_uno_id
    JOIN public.usuarios u ON u.id = r.usuario_id;
  RETURN v;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Fixtures (as postgres) ----------------------------------------------------
-- L leads; D and N are dirigidos (N has no email).

INSERT INTO public.usuarios (id, nombre, apellido, email, estado_civil, genero) VALUES
  ('d3c50000-0000-4000-8002-000000000001', 'ZZ U5', 'L', 'u5-l@example.test', 'Soltero', 'Otro'),
  ('d3c50000-0000-4000-8002-000000000002', 'ZZ U5', 'D', 'u5-d@example.test', 'Soltero', 'Otro'),
  ('d3c50000-0000-4000-8002-000000000003', 'ZZ U5', 'N', NULL,                'Soltero', 'Otro');

INSERT INTO t_u5_ids (k, id) VALUES
  ('a', 'd3c50000-0000-4000-800a-00000000000a'),
  ('b', 'd3c50000-0000-4000-800a-00000000000b'),
  ('c', 'd3c50000-0000-4000-800a-00000000000c'),
  ('d', 'd3c50000-0000-4000-800a-00000000000d'),
  ('e', 'd3c50000-0000-4000-800a-00000000000e');

-- a: 19:00 Caracas on the 11th           → tomorrow
-- b: 22:00 Caracas on the 11th (02:00 UTC on the 12th), with N → tomorrow, only L
-- c: 23:00 Caracas on the 10th (03:00 UTC on the 11th) → today, not queued
-- d: the 11th but cancelled              → not queued
-- e: 11:00 Caracas on the 12th           → the day after, not queued
INSERT INTO public.uno_a_uno (id, estado, fecha_hora, lugar, cancelado_en) VALUES
  (pg_temp.k('a'), 'agendado',  '2026-11-11 23:00:00+00', 'Café Centro', NULL),
  (pg_temp.k('b'), 'agendado',  '2026-11-12 02:00:00+00', NULL,          NULL),
  (pg_temp.k('c'), 'agendado',  '2026-11-11 03:00:00+00', NULL,          NULL),
  (pg_temp.k('d'), 'cancelado', '2026-11-11 23:00:00+00', NULL,          now()),
  (pg_temp.k('e'), 'agendado',  '2026-11-12 15:00:00+00', NULL,          NULL);

INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado)
SELECT i.id, x.u::uuid, x.lado
  FROM t_u5_ids i
 CROSS JOIN LATERAL (VALUES ('d3c50000-0000-4000-8002-000000000001', 'lider'),
                            (CASE WHEN i.k = 'b' THEN 'd3c50000-0000-4000-8002-000000000003'
                                  ELSE 'd3c50000-0000-4000-8002-000000000002' END, 'dirigido')) AS x(u, lado);

-- ── S5.1 / S5.6 encolar ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('S5.1: encolar at 08:00 Caracas on the 10th queues 3 rows', $q$
  SELECT public.uno_a_uno_recordatorios_encolar('2026-11-10 12:00:00+00')::text$q$, '3');
SELECT pg_temp.assert_eq('S5.1: both sides of a, only L of b (N has no email)', $q$SELECT pg_temp.cola_txt()$q$,
  'a:D:pendiente, a:L:pendiente, b:L:pendiente');
SELECT pg_temp.assert_eq('S5.1: queuing again adds nothing', $q$
  SELECT public.uno_a_uno_recordatorios_encolar('2026-11-10 12:30:00+00')::text$q$, '0');
SELECT pg_temp.assert_eq('S5.6: the queued 1:1s are marked, the others are not', $q$
  SELECT string_agg(i.k || '=' || (o.recordatorio_enviado_en IS NOT NULL)::text, ',' ORDER BY i.k)
    FROM t_u5_ids i JOIN public.uno_a_uno o ON o.id = i.id$q$, 'a=true,b=true,c=false,d=false,e=false');

-- ── S5.4 reprogramar re-queues ──────────────────────────────────────

UPDATE public.uno_a_uno SET fecha_hora = '2026-11-11 22:00:00+00', recordatorio_enviado_en = NULL WHERE id = pg_temp.k('a');
SELECT pg_temp.assert_eq('S5.4: a reprogrammed 1:1 is queued again for its new time', $q$
  SELECT public.uno_a_uno_recordatorios_encolar('2026-11-10 13:00:00+00')::text$q$, '2');

-- Make the fixture rows due now (the queue keeps p_ahora as disponible_en).
UPDATE public.uno_a_uno_recordatorios SET disponible_en = now() - interval '1 minute'
 WHERE uno_a_uno_id IN (SELECT id FROM t_u5_ids);

-- ── S5.3 reclamar ───────────────────────────────────────────────────

CREATE TEMP TABLE t_u5_lote ON COMMIT DROP AS
SELECT * FROM public.uno_a_uno_recordatorios_reclamar(100, 60) r WHERE r.uno_a_uno_id IN (SELECT id FROM t_u5_ids);

SELECT pg_temp.assert_eq('S5.4: the rows of the old time are discarded, not returned', $q$SELECT pg_temp.cola_txt()$q$,
  -- Sorted by time within a person: the new time (22:00 UTC) before the old one (23:00 UTC).
  'a:D:pendiente, a:D:descartado, a:L:pendiente, a:L:descartado, b:L:pendiente');
SELECT pg_temp.assert_eq('S5.3: reclamar returns the new a rows and b, with what the email needs', $q$
  SELECT string_agg(i.k || ':' || r.lado || ':' || r.nombre || ':' || coalesce(r.lugar, '-') || ':'
                    || (SELECT string_agg(e ->> 'apellido', '+') FROM jsonb_array_elements(r.con_quien) e) || ':' || r.intentos,
                    ', ' ORDER BY i.k, r.lado)
    FROM t_u5_lote r JOIN t_u5_ids i ON i.id = r.uno_a_uno_id$q$,
  'a:dirigido:ZZ U5:Café Centro:L:1, a:lider:ZZ U5:Café Centro:D:1, b:lider:ZZ U5:-:N:1');
SELECT pg_temp.assert_eq('S5.3: the batch is leased: a second reclamar gets none of it', $q$
  SELECT count(*)::text FROM public.uno_a_uno_recordatorios_reclamar(100, 60) r WHERE r.uno_a_uno_id IN (SELECT id FROM t_u5_ids)$q$, '0');
SELECT pg_temp.assert_raises('S5.3: p_personas 0 is refused', $q$SELECT count(*) FROM public.uno_a_uno_recordatorios_reclamar(0, 60)$q$, '22023');
SELECT pg_temp.assert_raises('S5.3: p_personas 101 is refused', $q$SELECT count(*) FROM public.uno_a_uno_recordatorios_reclamar(101, 60)$q$, '22023');
SELECT pg_temp.assert_raises('S5.11: a negative daily cap is refused', $q$SELECT count(*) FROM public.uno_a_uno_recordatorios_reclamar(1, -1)$q$, '22023');

-- ── S5.2 resultado ──────────────────────────────────────────────────

SELECT public.uno_a_uno_recordatorios_resultado(r.id, true) FROM t_u5_lote r WHERE r.lado = 'lider' AND r.uno_a_uno_id = pg_temp.k('a');
SELECT public.uno_a_uno_recordatorios_resultado(r.id, false, 'Resend 429') FROM t_u5_lote r WHERE r.lado = 'dirigido';
SELECT pg_temp.assert_eq('S5.2: ok → enviado; a failure goes back to pendiente, later, with the error', $q$
  SELECT string_agg(i.k || ':' || r.estado || ':' || (r.enviado_en IS NOT NULL)::text || ':' || coalesce(r.error, '-') || ':'
                    || (r.disponible_en > now())::text, ', ' ORDER BY i.k, r.estado)
    FROM public.uno_a_uno_recordatorios r JOIN t_u5_ids i ON i.id = r.uno_a_uno_id
   WHERE r.id IN (SELECT id FROM t_u5_lote WHERE uno_a_uno_id = pg_temp.k('a'))$q$,
  'a:enviado:true:-:true, a:pendiente:false:Resend 429:true');
UPDATE public.uno_a_uno_recordatorios SET intentos = 5 WHERE id IN (SELECT id FROM t_u5_lote WHERE uno_a_uno_id = pg_temp.k('b'));
SELECT public.uno_a_uno_recordatorios_resultado(r.id, false, 'Resend 500') FROM t_u5_lote r WHERE r.uno_a_uno_id = pg_temp.k('b');
SELECT pg_temp.assert_eq('S5.2: the fifth failed attempt is fallido', $q$
  SELECT estado FROM public.uno_a_uno_recordatorios WHERE id IN (SELECT id FROM t_u5_lote WHERE uno_a_uno_id = pg_temp.k('b'))$q$, 'fallido');
SELECT pg_temp.assert_raises('S5.2: an unknown id → P0002',
  $q$SELECT public.uno_a_uno_recordatorios_resultado('d3c50000-0000-4000-800a-0000000000ff', true)$q$, 'P0002');

-- ── T5.2 batches: whole people, the daily cap, 1:1s already started ─

-- S5.11: L got one email today (a, lider). D's failed row is due again; with a
-- cap of 1 email a day nothing more goes out, with a cap of 2 D does.
UPDATE public.uno_a_uno_recordatorios SET disponible_en = now() - interval '1 minute'
 WHERE id IN (SELECT id FROM t_u5_lote WHERE lado = 'dirigido');
SELECT pg_temp.assert_eq('S5.11: the daily cap holds back what does not fit', $q$
  SELECT count(*)::text FROM public.uno_a_uno_recordatorios_reclamar(100, 1) r WHERE r.uno_a_uno_id IN (SELECT id FROM t_u5_ids)$q$, '0');
SELECT pg_temp.assert_eq('S5.11: room for one more email sends D', $q$
  SELECT string_agg(r.email, ',') FROM public.uno_a_uno_recordatorios_reclamar(100, 2) r WHERE r.uno_a_uno_id IN (SELECT id FROM t_u5_ids)$q$,
  'u5-d@example.test');

-- S5.8/S5.9: a person is leased whole. f and g are two more 1:1s of tomorrow
-- between L and D; with room for one person, both of that person's rows come.
INSERT INTO t_u5_ids (k, id) VALUES
  ('f', 'd3c50000-0000-4000-800a-00000000000f'),
  ('g', 'd3c50000-0000-4000-800a-000000000010');
INSERT INTO public.uno_a_uno (id, estado, fecha_hora) VALUES
  (pg_temp.k('f'), 'agendado', '2026-11-11 13:00:00+00'),
  (pg_temp.k('g'), 'agendado', '2026-11-11 15:00:00+00');
INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado)
SELECT i.id, x.u::uuid, x.lado FROM t_u5_ids i
 CROSS JOIN LATERAL (VALUES ('d3c50000-0000-4000-8002-000000000001', 'lider'),
                            ('d3c50000-0000-4000-8002-000000000002', 'dirigido')) AS x(u, lado)
 WHERE i.k IN ('f', 'g');
SELECT pg_temp.assert_eq('S5.8: f and g are queued for both people', $q$
  SELECT public.uno_a_uno_recordatorios_encolar('2026-11-10 14:00:00+00')::text$q$, '4');
UPDATE public.uno_a_uno_recordatorios SET disponible_en = now() - interval '1 minute'
 WHERE uno_a_uno_id IN (pg_temp.k('f'), pg_temp.k('g'));
SELECT pg_temp.assert_eq('S5.9: one person per slot, with all of their 1:1s', $q$
  SELECT string_agg(i.k || ':' || r.lado, ',' ORDER BY r.fecha_hora)
    FROM public.uno_a_uno_recordatorios_reclamar(1, 100) r JOIN t_u5_ids i ON i.id = r.uno_a_uno_id$q$,
  'f:dirigido,g:dirigido');

-- S5.10: a reminder whose 1:1 already started is discarded, not sent.
INSERT INTO t_u5_ids (k, id) VALUES ('h', 'd3c50000-0000-4000-800a-000000000011');
INSERT INTO public.uno_a_uno (id, estado, fecha_hora) VALUES (pg_temp.k('h'), 'agendado', now() - interval '1 hour');
INSERT INTO public.uno_a_uno_personas (uno_a_uno_id, usuario_id, lado) VALUES
  (pg_temp.k('h'), 'd3c50000-0000-4000-8002-000000000001', 'lider');
INSERT INTO public.uno_a_uno_recordatorios (uno_a_uno_id, usuario_id, email, fecha_hora, disponible_en)
SELECT o.id, 'd3c50000-0000-4000-8002-000000000001', 'u5-l@example.test', o.fecha_hora, now() - interval '1 minute'
  FROM public.uno_a_uno o WHERE o.id = pg_temp.k('h');
SELECT count(*) FROM public.uno_a_uno_recordatorios_reclamar(100, 100);
SELECT pg_temp.assert_eq('S5.10: a 1:1 that already started is discarded', $q$
  SELECT estado || ':' || error FROM public.uno_a_uno_recordatorios WHERE uno_a_uno_id = pg_temp.k('h')$q$,
  'descartado:El 1 a 1 ya pasó.');

-- ── P privileges ────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises('P: authenticated cannot read the queue', $q$SELECT count(*) FROM public.uno_a_uno_recordatorios$q$, '42501');
SELECT pg_temp.assert_raises('P: authenticated cannot encolar', $q$SELECT public.uno_a_uno_recordatorios_encolar()$q$, '42501');
SELECT pg_temp.assert_raises('P: authenticated cannot reclamar', $q$SELECT count(*) FROM public.uno_a_uno_recordatorios_reclamar(1, 60)$q$, '42501');
SELECT pg_temp.assert_raises('P: authenticated cannot report a resultado',
  $q$SELECT public.uno_a_uno_recordatorios_resultado('d3c50000-0000-4000-800a-0000000000ff', true)$q$, '42501');
RESET ROLE;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_u5_failures;

ROLLBACK;
