-- T8 (odd/tasks/proximo-paso.md, L24.3) — RED->GREEN for
-- 20261111120000_proximo_paso_ediciones_detalle.sql: the public read of
-- /proximo-paso also returns hora, lugar and indicaciones of each open
-- edición, and nothing else changes. Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under this
-- file's own c7d00000-... namespace. Próximo Paso is looked up by slug.
--
-- Fixtures:
--   director (c7d…30/31) — director.write + read on Próximo Paso's node.
--   Próximo Paso: one plantilla grupo (capacidad 12, only in this
--     transaction) and 2 ediciones created by talleres_crear_edicion from
--     2031-06-01 (Jun, Jul), both abierto. Jun gets lugar 'Auditorio
--     principal' and recurrence_rule start_time 10:00:00; Jul gets neither.
--
-- Cases:
--   (a) the result shape is the six old columns plus hora, lugar,
--       indicaciones (pg_get_function_result).
--   (b) anon, Jun: hora '10:00', lugar 'Auditorio principal', and the old
--       columns as before (nombre, fechas, cupo 12, 4 named clases).
--   (c) anon, Jul: hora, lugar and indicaciones are NULL.
--   (d) a clase time on a live sesión of Jun wins over the start_time:
--       meeting_time_override 09:30 on clase 1 → hora '09:30'.
--   (e) indicaciones: NULL while taller_ediciones has no such column; when
--       it exists, the value set on Jun.
--   structural: SECURITY DEFINER, search_path pinned, EXECUTE for anon,
--     authenticated and service_role, none for PUBLIC.
--
-- Note: case (b) of proximo-paso-registro.test.sql pins the old six-column
-- shape and reads RED once 20261111120000 is applied; this file replaces it.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pd_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pd_failures TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pd_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_pd_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

CREATE TEMP TABLE t_pd_fixture (clave text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_pd_fixture TO authenticated, anon;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c7d00000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'pd-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, fecha_nacimiento, estado_civil, genero) VALUES
  ('c7d00000-0000-4000-8000-000000000031', 'c7d00000-0000-4000-8000-000000000030', 'ZZ PD', 'Director', 'pd-fixture-director@example.test', '1980-01-01', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO t_pd_fixture (clave, id)
SELECT 'pp_taller', id FROM public.talleres WHERE slug = 'proximo-paso';
INSERT INTO t_pd_fixture (clave, id)
SELECT 'pp_equipo', dream_team_equipo_id FROM public.talleres WHERE slug = 'proximo-paso';

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT 'c7d00000-0000-4000-8000-000000000031', k.capability_key, 'talleres_crecimiento', 'taller', f.id
FROM t_pd_fixture f
CROSS JOIN (VALUES ('talleres_crecimiento.director.write'), ('talleres_crecimiento.director.read')) AS k(capability_key)
WHERE f.clave = 'pp_equipo';

INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
SELECT id, 'ZZ PD Grupo Detalle', 999, 12 FROM t_pd_fixture WHERE clave = 'pp_taller';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7d00000-0000-4000-8000-000000000030');

DO $crear$
DECLARE
  v_pp jsonb;
BEGIN
  v_pp := public.talleres_crear_edicion(
    (SELECT id FROM t_pd_fixture WHERE clave = 'pp_taller'), DATE '2031-06-01', NULL, 1
  );
  INSERT INTO t_pd_fixture (clave, id) VALUES
    ('pp_jun', (v_pp -> 'ediciones' -> 0 ->> 'edicion_id')::uuid),
    ('pp_jul', (v_pp -> 'ediciones' -> 1 ->> 'edicion_id')::uuid);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: talleres_crear_edicion', SQLSTATE || ' ' || SQLERRM);
END;
$crear$;

RESET ROLE;

-- Estados, lugar and start_time set as postgres: a fixture, not the behavior under test.
UPDATE public.taller_ediciones SET estado = 'abierto'
 WHERE id IN (SELECT id FROM t_pd_fixture WHERE clave IN ('pp_jun', 'pp_jul'));
UPDATE public.taller_ediciones
   SET lugar = 'Auditorio principal',
       recurrence_rule = coalesce(recurrence_rule, '{}'::jsonb) || '{"start_time": "10:00:00"}'::jsonb
 WHERE id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun');
UPDATE public.taller_ediciones
   SET lugar = NULL,
       recurrence_rule = coalesce(recurrence_rule, '{}'::jsonb) - 'start_time'
 WHERE id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jul');
UPDATE public.taller_sesiones ts SET meeting_time_override = NULL
  FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
 WHERE g.id = ts.grupo_id AND c.id = g.cohorte_id
   AND c.taller_id IN (SELECT id FROM t_pd_fixture WHERE clave IN ('pp_jun', 'pp_jul'));

-- (e) fixture: indicaciones on Jun only when the column exists (after 20261111130000).
DO $ind$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'taller_ediciones' AND column_name = 'indicaciones') THEN
    EXECUTE $u$UPDATE public.taller_ediciones SET indicaciones = 'Entra por la puerta lateral.'
                WHERE id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun')$u$;
  END IF;
END;
$ind$;

-- ══ (a) shape (as postgres) ══

SELECT pg_temp.assert_rows('(a) the six old columns plus hora, lugar, indicaciones',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND pg_get_function_result(p.oid) = 'TABLE(edicion_id uuid, nombre text, fecha_inicio date, fecha_fin date, cupo_restante integer, clases jsonb, hora text, lugar text, indicaciones text)'$$, 1);

-- ══ (b), (c), (e) as anon ══

-- cupo is the sum of the live plantilla grupos (staging may hold real ones): measured as postgres.
CREATE TEMP TABLE t_pd_cupo ON COMMIT DROP AS
SELECT greatest(k.cupo - k.ocupados, 0) AS base
  FROM t_pd_fixture f, public.talleres_cupo_edicion_calculo(f.id) k
 WHERE f.clave = 'pp_jun';
GRANT SELECT ON t_pd_cupo TO anon, authenticated;

SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();

SELECT pg_temp.assert_rows('(b) Jun: hora 10:00, lugar, and the old columns unchanged',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun')
       AND e.nombre = 'Junio 2031'
       AND e.fecha_inicio = DATE '2031-06-01'
       AND e.fecha_fin = DATE '2031-06-22'
       AND e.cupo_restante = (SELECT base FROM t_pd_cupo)
       AND jsonb_array_length(e.clases) = 4
       AND (SELECT string_agg(c ->> 'tema', ' | ' ORDER BY (c ->> 'numero')::int) FROM jsonb_array_elements(e.clases) c)
           = 'Sígueme | Intimidad con Dios | Compañerismo | Influencia'
       AND e.hora = '10:00'
       AND e.lugar = 'Auditorio principal'$$, 1);

SELECT pg_temp.assert_rows('(c) Jul: no hora, no lugar, no indicaciones',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jul')
       AND e.hora IS NULL AND e.lugar IS NULL AND e.indicaciones IS NULL$$, 1);

SELECT pg_temp.assert_rows('(e) Jun indicaciones: NULL without the column, the value with it',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun')
       AND e.indicaciones IS NOT DISTINCT FROM (
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'taller_ediciones' AND column_name = 'indicaciones')
              THEN 'Entra por la puerta lateral.' END)$$, 1);

RESET ROLE;

-- ══ (d) the clase time wins ══

SELECT pg_temp.assert_rows('fixture: Jun has a live clase 1',
  $$SELECT 1 FROM public.taller_sesiones ts
      JOIN public.taller_grupos g ON g.id = ts.grupo_id
      JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
     WHERE c.taller_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun') AND ts.numero = 1
     LIMIT 1$$, 1);

UPDATE public.taller_sesiones ts SET meeting_time_override = TIME '09:30'
  FROM public.taller_grupos g, public.talleres_crecimiento_cohortes c
 WHERE g.id = ts.grupo_id AND c.id = g.cohorte_id AND ts.numero = 1
   AND c.taller_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun');

SET LOCAL ROLE anon;
SELECT pg_temp.as_anon();
SELECT pg_temp.assert_rows('(d) meeting_time_override of the first clase wins: 09:30',
  $$SELECT 1 FROM public.proximo_paso_ediciones_abiertas() e
     WHERE e.edicion_id = (SELECT id FROM t_pd_fixture WHERE clave = 'pp_jun') AND e.hora = '09:30'$$, 1);
RESET ROLE;

-- ══ structural ══

SELECT pg_temp.assert_rows('structural: SECURITY DEFINER with search_path pinned',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public']$$, 1);
SELECT pg_temp.assert_rows('structural: EXECUTE for anon, authenticated and service_role, none for PUBLIC',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'proximo_paso_ediciones_abiertas'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND has_function_privilege('service_role', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)$$, 1);

SELECT pg_temp.report();

ROLLBACK;
