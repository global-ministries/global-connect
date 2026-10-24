-- T10 (odd/tasks/uno-a-uno.md) — a couple leads together only when both hold
-- the role (migration 20261024160000_uno_a_uno_regla_pareja.sql).
--
-- Covers:
--   S10.1 HL leads the Hombres group GH; HW, his wife, holds no role there and
--         leads nobody. MA and MB, both Líder of the Matrimonios group GM, lead
--         its members together. Nobody leads their own spouse.
--   S10.2 HL schedules a 1:1 with HM: only HL and HM take part (neither wife).
--         MA schedules one with MX: MA and MB on the leader side, MX and MY on
--         the dirigido side.
--   S10.3 mis_dirigidos: HM has no conyuge_id for HL; MX has MY for MA.
--   S10.4 uno_a_uno_relaciones and uno_a_uno_ubicaciones give HW nothing, and
--         relaciones still equals uno_a_uno_dirigidos_de for every usuario.
--
-- Run against STAGING inside BEGIN…ROLLBACK, as in the other uno-a-uno tests;
-- the last statement is a SELECT of the failing cases (0 = all ok).
--
-- Identities (usuario n = auth n, apellido = label):
--   1 HL  Líder of GH (Hombres), married to 2 HW (no role anywhere)
--   3 HM  Miembro of GH, married to 4 HMW (no group)
--   5 MA, 6 MB  married, both Líder of GM (Matrimonios)
--   7 MX, 8 MY  married, both Miembro of GM

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_u10_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_u10_labels (id uuid PRIMARY KEY, label text NOT NULL, auth_id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE t_u10_ids (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_u10_failures TO authenticated;
GRANT SELECT ON t_u10_labels TO authenticated;
GRANT INSERT, SELECT ON t_u10_ids TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_u10_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  EXECUTE p_sql INTO v_id;
  INSERT INTO t_u10_ids (k, id) VALUES (p_key, v_id);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected an id, got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d3b00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '8001' WHEN 'us' THEN '8002' WHEN 'sg' THEN '8003'
                       WHEN 'gr' THEN '8005' WHEN 'te' THEN '8006' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM t_u10_labels WHERE label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_label text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_u10_labels WHERE label = p_label;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Labels of the fixtures a uuid list names, sorted, joined by '+'.
CREATE OR REPLACE FUNCTION pg_temp.labels(p uuid[]) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(l.label, '+' ORDER BY l.label COLLATE "C"), '')
    FROM t_u10_labels l WHERE l.id = ANY (p);
$$;

-- `lado:LABEL+LABEL|…` of the people of one fixture 1:1, read as postgres.
CREATE OR REPLACE FUNCTION pg_temp.personas(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(x.lado || ':' || x.quienes, '|' ORDER BY x.lado), '')
    FROM (SELECT p.lado, pg_temp.labels(array_agg(p.usuario_id)) AS quienes
            FROM public.uno_a_uno_personas p WHERE p.uno_a_uno_id = p_id GROUP BY p.lado) x;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Fixtures (as postgres) ----------------------------------------------------

INSERT INTO t_u10_labels (id, label, auth_id)
SELECT pg_temp.id('us', n::int), l, pg_temp.id('au', n::int)
  FROM unnest(ARRAY['HL', 'HW', 'HM', 'HMW', 'MA', 'MB', 'MX', 'MY']) WITH ORDINALITY AS t(l, n);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'u10-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT l.id, pg_temp.id('au', n), 'ZZ U10', l.label, 'u10-' || n || '@example.test', 'Casado', 'Otro'
  FROM generate_series(1, 8) AS n
  JOIN t_u10_labels l ON l.id = pg_temp.id('us', n);

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  (pg_temp.id('us', 1), pg_temp.id('us', 2), 'conyuge'),
  (pg_temp.id('us', 3), pg_temp.id('us', 4), 'conyuge'),
  (pg_temp.id('us', 5), pg_temp.id('us', 6), 'conyuge'),
  (pg_temp.id('us', 8), pg_temp.id('us', 7), 'conyuge');

INSERT INTO public.segmentos (id, nombre) VALUES
  (pg_temp.id('sg', 1), 'ZZ U10 Hombres'),
  (pg_temp.id('sg', 2), 'ZZ U10 Matrimonios');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  (pg_temp.id('te', 1), 'ZZ U10 activa', '2026-01-01', '2026-12-31', true, 'activa');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_aprobacion, eliminado) VALUES
  (pg_temp.id('gr', 1), 'ZZ U10 GH', pg_temp.id('te', 1), pg_temp.id('sg', 1), true, 'aprobado', false),
  (pg_temp.id('gr', 2), 'ZZ U10 GM', pg_temp.id('te', 1), pg_temp.id('sg', 2), true, 'aprobado', false);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida, estado) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 1), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 3), 'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 5), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 6), 'Líder',   NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 7), 'Miembro', NULL, 'activo'),
  (pg_temp.id('gr', 2), pg_temp.id('us', 8), 'Miembro', NULL, 'activo');

-- ── S10.1 who leads whom (internal rule, as postgres) ───────────────

SELECT pg_temp.assert_eq('S10.1: the Líder of a Hombres group leads its member only',
  format($q$SELECT pg_temp.labels(array_agg(d.usuario_id)) FROM public.uno_a_uno_dirigidos_de(%L) d$q$, pg_temp.u('HL')), 'HM');
SELECT pg_temp.assert_eq('S10.1: his wife, with no role, leads nobody',
  format($q$SELECT count(*)::text FROM public.uno_a_uno_dirigidos_de(%L)$q$, pg_temp.u('HW')), '0');
SELECT pg_temp.assert_eq('S10.1: both Matrimonios leaders lead the member couple',
  format($q$SELECT pg_temp.labels(array_agg(d.usuario_id)) || '/' ||
                  (SELECT pg_temp.labels(array_agg(e.usuario_id)) FROM public.uno_a_uno_dirigidos_de(%L) e)
             FROM public.uno_a_uno_dirigidos_de(%L) d$q$, pg_temp.u('MB'), pg_temp.u('MA')), 'MX+MY/MX+MY');

-- ── S10.4 the set-based rule and the places ─────────────────────────

SELECT pg_temp.assert_eq('S10.4: uno_a_uno_relaciones gives HW nothing',
  format($q$SELECT count(*)::text FROM public.uno_a_uno_relaciones() r WHERE r.lider_id = %L$q$, pg_temp.u('HW')), '0');
SELECT pg_temp.assert_eq('S10.4: uno_a_uno_ubicaciones places HW nowhere',
  format($q$SELECT count(*)::text FROM public.uno_a_uno_ubicaciones() u WHERE u.lider_id = %L$q$, pg_temp.u('HW')), '0');
SELECT pg_temp.assert_eq('S10.4: uno_a_uno_relaciones equals uno_a_uno_dirigidos_de for every usuario', $q$
  WITH rel AS MATERIALIZED (SELECT * FROM public.uno_a_uno_relaciones())
  SELECT count(*)::text
    FROM public.usuarios u
   WHERE (SELECT coalesce(string_agg(d.usuario_id::text || '[' || array_to_string(d.contextos, '|') || ']', ',' ORDER BY d.usuario_id), '')
            FROM public.uno_a_uno_dirigidos_de(u.id) d)
         IS DISTINCT FROM
         (SELECT coalesce(string_agg(x.d::text || '[' || x.c || ']', ',' ORDER BY x.d), '')
            FROM (SELECT r.dirigido_id AS d, array_to_string(array_agg(DISTINCT r.contexto ORDER BY r.contexto), '|') AS c
                    FROM rel r WHERE r.lider_id = u.id GROUP BY r.dirigido_id) x)
$q$, '0');

-- ── S10.2 / S10.3 as the leaders ────────────────────────────────────

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(pg_temp.a('HL'));
SELECT pg_temp.assert_eq('S10.3: a Hombres member comes without his wife',
  $q$SELECT string_agg(pg_temp.labels(ARRAY[d.usuario_id]) || '>' || coalesce(pg_temp.labels(ARRAY[d.conyuge_id]), '-'), ',')
       FROM public.mis_dirigidos() d$q$, 'HM>');
SELECT pg_temp.capture('fixture h1', 'h1', format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.u('HM')));

SELECT pg_temp.as_persona(pg_temp.a('MA'));
SELECT pg_temp.assert_eq('S10.3: a Matrimonios member comes with his wife',
  $q$SELECT string_agg(pg_temp.labels(ARRAY[d.usuario_id]) || '>' || coalesce(pg_temp.labels(ARRAY[d.conyuge_id]), '-'), ',' ORDER BY d.usuario_id)
       FROM public.mis_dirigidos() d$q$, 'MX>MY,MY>MX');
SELECT pg_temp.capture('fixture m1', 'm1', format($q$SELECT public.uno_a_uno_agendar(%L, now() + interval '2 days')$q$, pg_temp.u('MX')));

RESET ROLE;

SELECT pg_temp.assert_eq('S10.2: a Hombres 1:1 has neither wife',
  $q$SELECT pg_temp.personas((SELECT id FROM t_u10_ids WHERE k = 'h1'))$q$, 'dirigido:HM|lider:HL');
SELECT pg_temp.assert_eq('S10.2: a Matrimonios 1:1 has both couples',
  $q$SELECT pg_temp.personas((SELECT id FROM t_u10_ids WHERE k = 'm1'))$q$, 'dirigido:MX+MY|lider:MA+MB');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_u10_failures;

ROLLBACK;
