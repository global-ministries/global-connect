-- S14.3 (odd/tasks/dps-asistencia-pco.md, T16c; S14.3, S14.5; L71, L73) —
-- the automatic service reminder by e-mail
-- (20261114110000_dps_avisos_recordatorio.sql). Needs the earlier DPS
-- migrations, 20261109210000_dps_avisos.sql and
-- 20261114100000_dps_avisos_correo.sql; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: the new functions are SECURITY DEFINER with
--      search_path ''; anon executes none; authenticated only
--      dps_recordatorio_guardar (and dps_config_leer, as before);
--      service_role dps_recordatorios_encolar; the config columns default to
--      on and 2 days, 1-7; the outbox takes tipo 'recordatorio'.
--   c. Configuration: dps_config_leer carries `recordatorio` as the row
--      says; 0, 8, NULL days and a NULL switch are refused (22023) and leave
--      the row unchanged; a planner who does not configure gets 42501 and
--      nothing changes; the configurator saves; puede_editar per caller;
--      switched off, there is no proximo and the job queues nothing.
--   r. Recipients of one date: confirmo and pendiente, never no_puede,
--      quitado or without an e-mail, nor another date; two plans the same
--      day are ONE row with two blocks; the buttons only for pendiente; a
--      person with no_puede in one plan and confirmo in the other gets only
--      the confirmed one; Reply-To the planner; vence the date; dias; the
--      team counts carry no name.
--   i. Idempotency: running it again queues nothing and changes nothing.
--   d. T16d: the director changes the days from 2 to 1 between two runs:
--      the run for the same date with 1 day queues no second reminder for
--      anyone and leaves the first ones as they were.
--   p. The preview: dps_recordatorio_resumen counts what the job queues
--      (personas, con_botones) plus no_pueden and sin_correo; proximo of
--      dps_config_leer is the next plan date with sale = fecha - dias, never
--      in the past.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases). Planner and person calls run
-- under SET LOCAL ROLE authenticated with request.jwt.claim.sub set to the
-- fixture auth id; the internal functions run as the connection (postgres).
-- No Sunday plan is created: the plans are 'especial' ones in 2096. The real
-- DPS directors are synced into those plans too (the fixture filters leave
-- them out; the counts compare against what the job queued).
--
-- Identities (usuario n = auth n, all fictitious «ZZ Dar U..»):
--   1 PLAN   dream_team.direct on the DPS root (plans and configures; dar-1@)
--   2 CONF   confirms A                                     dar-2@
--   3 PEND   pendiente in A and A2 (two plans, same day)    dar-3@
--   4 NOPU   no_puede in A                                  dar-4@
--   5 SINC   pendiente in A, no e-mail
--   6 QUIT   notified in A, then taken out and sent         dar-6@
--   7 MIX    no_puede in A, confirmo in A2                  dar-7@
--   8 OTRA   only in B (another date)                       dar-8@
--   9 ARMA   added to dps_planificadores: plans, does not configure
-- Plans: A and A2 on 2096-07-04, B on 2096-07-11. Equipos: 2 ZZ Dar
-- Dirección (child of the DPS root) › 1 ZZ Dar Equipo.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dar_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dar_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dar_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs p_sql, keeps its single value under p_k (a failure is recorded).
CREATE OR REPLACE FUNCTION pg_temp.put(p_k text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_dar_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dar_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.j(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT v::jsonb FROM t_dar_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('dadd0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'dad1' WHEN 'us' THEN 'dad2' WHEN 'eq' THEN 'dad3'
                       WHEN 'ro' THEN 'dad4' WHEN 'se' THEN 'dad5' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.planes(VARIADIC p_ks text[]) RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT array_agg(pg_temp.ctx(k)::uuid ORDER BY o) FROM unnest(p_ks) WITH ORDINALITY AS t(k, o);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The configuration row (as postgres): activo:dias (::text: concat_ws alone renders a boolean as 't').
CREATE OR REPLACE FUNCTION pg_temp.cfg() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(':', c.recordatorio_activo::text, c.recordatorio_dias) FROM public.dps_config c WHERE c.id;
$$;

-- The fixture reminder rows (as postgres): code:estado:vence:avisos:dias, by code.
CREATE OR REPLACE FUNCTION pg_temp.recordatorios() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(':', u.apellido, c.estado, c.vence, c.datos ->> 'avisos', c.datos ->> 'dias'),
                             ',' ORDER BY u.apellido), '')
    FROM public.dps_avisos_correos c
    JOIN public.usuarios u ON u.id = c.persona_id
   WHERE c.tipo = 'recordatorio' AND u.id::text LIKE 'dadd0000-%';
$$;

-- The blocks of person n's reminder, in order: plan/estado/confirmar/version.
CREATE OR REPLACE FUNCTION pg_temp.bloques(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((SELECT string_agg(p.titulo || '/' || (b ->> 'estado') || '/' || (b ->> 'confirmar') || '/' || (b ->> 'version'),
                                                '+' ORDER BY o)
                                FROM jsonb_array_elements(c.datos -> 'bloques') WITH ORDINALITY AS t(b, o)
                                JOIN public.dps_planes p ON p.id = (b ->> 'plan_id')::uuid),
                             ',' ORDER BY c.created_at, c.clave), '')
    FROM public.dps_avisos_correos c
   WHERE c.persona_id = pg_temp.id('us', p_n) AND c.tipo = 'recordatorio';
$$;

-- Every reminder row of a date (fixture and real directors), as postgres.
CREATE OR REPLACE FUNCTION pg_temp.filas_fecha(p_fecha date) RETURNS text LANGUAGE sql AS $$
  SELECT count(*) || '|' || count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(c.datos -> 'bloques') b
                                                              WHERE (b ->> 'confirmar')::boolean))
    FROM public.dps_avisos_correos c
   WHERE c.tipo = 'recordatorio' AND c.clave LIKE 'recordatorio:%:' || p_fecha::text;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dar_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dar-auth-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 9) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Dar', 'U01', 'dar-1@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Dar', 'U02', 'dar-2@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 3), pg_temp.id('au', 3), 'ZZ Dar', 'U03', 'dar-3@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 4), pg_temp.id('au', 4), 'ZZ Dar', 'U04', 'dar-4@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Dar', 'U05', NULL, 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Dar', 'U06', 'dar-6@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 7), pg_temp.id('au', 7), 'ZZ Dar', 'U07', 'dar-7@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 8), pg_temp.id('au', 8), 'ZZ Dar', 'U08', 'dar-8@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 9), pg_temp.id('au', 9), 'ZZ Dar', 'U09', 'dar-9@example.test', 'Soltero', 'Femenino');
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'dadd0000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 2), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Dar Dirección', true);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.id('eq', 2), 'ZZ Dar Equipo', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'ZZ Dar voluntario', 'voluntario', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM generate_series(2, 8) AS n;

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 9) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.ctx('raiz'), 'zz-test');
INSERT INTO public.dps_planificadores (persona_id, agregado_por) -- noqa: insert-into
VALUES (pg_temp.id('us', 9), pg_temp.id('us', 1));

INSERT INTO t_dar_ctx (k, v) VALUES ('cfg0', pg_temp.cfg());

GRANT INSERT, SELECT, UPDATE ON t_dar_failures, t_dar_ctx TO authenticated, anon, service_role;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon, service_role', v_f);
  END LOOP;
END;
$$;

-- ── a. structure and privileges ──────────────────────────────────────

SELECT pg_temp.assert_eq('a1: the new functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_recordatorio_destinatarios', 'dps_recordatorio_equipo', 'dps_recordatorio_resumen', 'dps_recordatorio_json',
        'dps_recordatorios_encolar_fecha', 'dps_config_leer', 'dps_recordatorio_guardar', 'dps_recordatorios_encolar')$q$, '8|0');
SELECT pg_temp.assert_eq('a2: anon executes none; authenticated only the read and the save',
  $q$SELECT coalesce(string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE') || ':'
                                || has_function_privilege('authenticated', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
                       FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')), '-')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_recordatorio_destinatarios', 'dps_recordatorio_equipo', 'dps_recordatorio_resumen', 'dps_recordatorio_json',
        'dps_recordatorios_encolar_fecha', 'dps_config_leer', 'dps_recordatorio_guardar', 'dps_recordatorios_encolar')$q$,
  'dps_config_leer:false:true,dps_recordatorio_guardar:false:true');
SELECT pg_temp.assert_eq('a3: service_role executes the job, not the internal helpers',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('service_role', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_recordatorios_encolar', 'dps_recordatorios_encolar_fecha')$q$,
  'dps_recordatorios_encolar:true,dps_recordatorios_encolar_fecha:false');
SELECT pg_temp.assert_eq('a4: the config columns default to on and 2 days',
  $q$SELECT string_agg(column_name || '=' || column_default || ':' || is_nullable, ',' ORDER BY column_name)
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dps_config' AND column_name IN ('recordatorio_activo', 'recordatorio_dias')$q$,
  'recordatorio_activo=true:NO,recordatorio_dias=2:NO');
SELECT pg_temp.assert_raises('a5: the table refuses 0 days',
  $q$UPDATE public.dps_config SET recordatorio_dias = 0 WHERE id$q$, '23514');
SELECT pg_temp.assert_raises('a5: and 8 days',
  $q$UPDATE public.dps_config SET recordatorio_dias = 8 WHERE id$q$, '23514');
SELECT pg_temp.assert_eq('a6: the outbox takes a recordatorio row (and still refuses another tipo)',
  $q$SELECT pg_get_constraintdef(c.oid) LIKE '%''recordatorio''%' FROM pg_constraint c
      WHERE c.conname = 'dps_avisos_correos_forma_check'$q$, 'true');

-- ── c. configuration ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('leer1', $q$SELECT public.dps_config_leer()::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c1: dps_config_leer carries the reminder as the row says, the hour fixed, editable for the configurator',
  $q$SELECT (concat_ws(':', pg_temp.j('leer1') -> 'recordatorio' ->> 'activo', pg_temp.j('leer1') -> 'recordatorio' ->> 'dias')
             = pg_temp.ctx('cfg0'))::text || '|' || (pg_temp.j('leer1') -> 'recordatorio' ->> 'hora') || '|'
            || (pg_temp.j('leer1') -> 'recordatorio' ->> 'puede_editar')$q$, 'true|10:00|true');
SELECT pg_temp.assert_eq('c1: the old keys are still there',
  $q$SELECT (pg_temp.j('leer1') ?& ARRAY['horarios', 'llegada', 'planificadores', 'pasan_asistencia'])::text$q$, 'true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('c2: 0 days is dias_invalidos',
  $q$SELECT public.dps_recordatorio_guardar(true, 0)$q$, '22023', 'dias_invalidos');
SELECT pg_temp.assert_raises('c2: 8 days is dias_invalidos',
  $q$SELECT public.dps_recordatorio_guardar(true, 8)$q$, '22023', 'dias_invalidos');
SELECT pg_temp.assert_raises('c2: no days is dias_invalidos',
  $q$SELECT public.dps_recordatorio_guardar(true, NULL)$q$, '22023', 'dias_invalidos');
SELECT pg_temp.assert_raises('c2: no switch is valor_invalido',
  $q$SELECT public.dps_recordatorio_guardar(NULL, 3)$q$, '22023', 'valor_invalido');
RESET ROLE;
SELECT pg_temp.assert_eq('c2: the refusals leave the row unchanged', $q$SELECT pg_temp.cfg()$q$, pg_temp.ctx('cfg0'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('c3: a planner who does not configure cannot save',
  $q$SELECT public.dps_recordatorio_guardar(false, 3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.put('leer9', $q$SELECT public.dps_config_leer()::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c3: nothing changed', $q$SELECT pg_temp.cfg()$q$, pg_temp.ctx('cfg0'));
SELECT pg_temp.assert_eq('c3: and reads it without puede_editar',
  $q$SELECT pg_temp.j('leer9') -> 'recordatorio' ->> 'puede_editar'$q$, 'false');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_raises('c3: a person who does not plan cannot save either',
  $q$SELECT public.dps_recordatorio_guardar(true, 2)$q$, '42501', 'sin_autoridad');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('g1', $q$SELECT public.dps_recordatorio_guardar(false, 3)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c4: the configurator switches it off with 3 days; the answer says so, without proximo',
  $q$SELECT concat_ws('|', pg_temp.j('g1') ->> 'activo', pg_temp.j('g1') ->> 'dias', pg_temp.j('g1') ->> 'puede_editar',
                      jsonb_typeof(pg_temp.j('g1') -> 'proximo'))$q$, 'false|3|true|null');
SELECT pg_temp.assert_eq('c4: the row is saved', $q$SELECT pg_temp.cfg()$q$, 'false:3');
SET LOCAL ROLE service_role;
SELECT pg_temp.put('off1', $q$SELECT public.dps_recordatorios_encolar()::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c5: switched off, the job queues nothing',
  $q$SELECT concat_ws('|', pg_temp.j('off1') ->> 'activo', pg_temp.j('off1') ->> 'encolados')$q$, 'false|0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('g2', $q$SELECT public.dps_recordatorio_guardar(true, 2)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c6: back on with 2 days', $q$SELECT pg_temp.cfg()$q$, 'true:2');

-- ── the plans, assignments and answers ───────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('pl_a', $q$SELECT public.dps_plan_crear(DATE '2096-07-04', 'especial', 'ZZ Dar A')::text$q$);
SELECT pg_temp.put('pl_a2', $q$SELECT public.dps_plan_crear(DATE '2096-07-04', 'especial', 'ZZ Dar A2')::text$q$);
SELECT pg_temp.put('pl_b', $q$SELECT public.dps_plan_crear(DATE '2096-07-11', 'especial', 'ZZ Dar B')::text$q$);
SELECT pg_temp.put('pu', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Dar Cámara', 9, NULL)::text$q$);
SELECT pg_temp.put('x' || n, format($q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu'), pg_temp.id('se', %s))::text$q$, n))
  FROM unnest(ARRAY[2, 3, 4, 5, 6, 7]) AS n;
SELECT pg_temp.put('y3', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a2'), pg_temp.plan('pu'), pg_temp.id('se', 3))::text$q$);
SELECT pg_temp.put('y7', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a2'), pg_temp.plan('pu'), pg_temp.id('se', 7))::text$q$);
SELECT pg_temp.put('z8', $q$SELECT public.dps_convocar(pg_temp.plan('pl_b'), pg_temp.plan('pu'), pg_temp.id('se', 8))::text$q$);
SELECT pg_temp.put('env1', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a', 'pl_a2', 'pl_b'))::text$q$);
SELECT pg_temp.put('q6', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu'), pg_temp.id('us', 6))::text$q$);
SELECT pg_temp.put('env2', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('r2', $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'confirmo', NULL)::text$q$);
SELECT pg_temp.as_persona(4);
SELECT pg_temp.put('r4', $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'no_puede', 'ZZ Dar viaje')::text$q$);
SELECT pg_temp.as_persona(7);
SELECT pg_temp.put('r7a', $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'no_puede', NULL)::text$q$);
SELECT pg_temp.put('r7b', $q$SELECT public.dps_responder(pg_temp.plan('pl_a2'), 'confirmo', NULL)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f1: the fixture notices as set up',
  $q$SELECT string_agg(concat_ws(':', u.apellido, p.titulo, v.estado, v.quitado::text), ',' ORDER BY u.apellido, p.titulo)
       FROM public.dps_avisos v JOIN public.usuarios u ON u.id = v.persona_id JOIN public.dps_planes p ON p.id = v.plan_id
      WHERE u.id::text LIKE 'dadd0000-%'$q$,
  'U02:ZZ Dar A:confirmo:false,U03:ZZ Dar A:pendiente:false,U03:ZZ Dar A2:pendiente:false,U04:ZZ Dar A:no_puede:false,'
  || 'U05:ZZ Dar A:pendiente:false,U06:ZZ Dar A:pendiente:true,U07:ZZ Dar A:no_puede:false,U07:ZZ Dar A2:confirmo:false,'
  || 'U08:ZZ Dar B:pendiente:false');

-- ── r. recipients of one date ────────────────────────────────────────

SELECT pg_temp.assert_eq('r0: nothing queued yet', $q$SELECT pg_temp.recordatorios()$q$, '');
SELECT pg_temp.put('enc1', $q$SELECT public.dps_recordatorios_encolar_fecha(DATE '2096-07-04', 2)::text$q$);
SELECT pg_temp.assert_eq('r1: confirmo and pendiente with e-mail, one row each; never no_puede, quitado, without e-mail or another date',
  $q$SELECT pg_temp.recordatorios()$q$,
  'U02:pendiente:2096-07-04:1:2,U03:pendiente:2096-07-04:2:2,U07:pendiente:2096-07-04:1:2');
SELECT pg_temp.assert_eq('r2: two plans the same day are one e-mail with two blocks, both asking to confirm',
  $q$SELECT pg_temp.bloques(3)$q$, 'ZZ Dar A/pendiente/true/1+ZZ Dar A2/pendiente/true/1');
SELECT pg_temp.assert_eq('r3: the confirmed one has no buttons',
  $q$SELECT pg_temp.bloques(2)$q$, 'ZZ Dar A/confirmo/false/1');
SELECT pg_temp.assert_eq('r4: no_puede in one plan, confirmo in the other: only the confirmed block',
  $q$SELECT pg_temp.bloques(7)$q$, 'ZZ Dar A2/confirmo/false/1');
SELECT pg_temp.assert_eq('r5: to the person, Reply-To the planner who sent it, the clave per person and date',
  $q$SELECT concat_ws('|', c.email, c.nombre, c.responder_nombre, c.responder_email,
                      c.clave = 'recordatorio:' || pg_temp.id('us', 3) || ':2096-07-04')
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 3) AND c.tipo = 'recordatorio'$q$,
  'dar-3@example.test|ZZ|ZZ Dar U01|dar-1@example.test|t');
SELECT pg_temp.assert_eq('r6: each block carries its aviso and the team counts (no name of the others)',
  $q$SELECT concat_ws('|', b ->> 'aviso_id' = (SELECT v.id::text FROM public.dps_avisos v
                                               WHERE v.persona_id = pg_temp.id('us', 2) AND v.plan_id = pg_temp.plan('pl_a')),
                      jsonb_typeof(b -> 'orden'), (b -> 'equipo' ->> 'personas')::int >= 3,
                      (b -> 'equipo' ->> 'confirmaron')::int >= 1,
                      (b -> 'equipo')::text LIKE '%ZZ Dar U%')
       FROM public.dps_avisos_correos c, jsonb_array_elements(c.datos -> 'bloques') b
      WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'recordatorio'$q$, 't|array|t|t|f');
SELECT pg_temp.assert_eq('r7: the fixture direction counts who still serves in A (CONF, PEND, SINC)',
  $q$SELECT (SELECT d ->> 'personas' FROM jsonb_array_elements(b -> 'equipo' -> 'direcciones') d WHERE d ->> 'nombre' = 'ZZ Dar Dirección')
       FROM public.dps_avisos_correos c, jsonb_array_elements(c.datos -> 'bloques') b
      WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'recordatorio'$q$, '3');
SELECT pg_temp.assert_eq('r8: the other date was not touched',
  $q$SELECT count(*)::text FROM public.dps_avisos_correos c WHERE c.tipo = 'recordatorio' AND c.persona_id = pg_temp.id('us', 8)$q$, '0');

-- ── i. idempotency ───────────────────────────────────────────────────

INSERT INTO t_dar_ctx (k, v) VALUES ('rows1', (SELECT string_agg(c.id::text || c.datos::text, ',' ORDER BY c.id)
                                                FROM public.dps_avisos_correos c WHERE c.tipo = 'recordatorio'));
SELECT pg_temp.put('enc2', $q$SELECT public.dps_recordatorios_encolar_fecha(DATE '2096-07-04', 2)::text$q$);
SELECT pg_temp.assert_eq('i1: running it again queues nothing new',
  $q$SELECT concat_ws('|', pg_temp.j('enc2') ->> 'encolados', pg_temp.j('enc2') ->> 'personas' = pg_temp.j('enc1') ->> 'personas')$q$, '0|t');
SELECT pg_temp.assert_eq('i1: and changes no row',
  $q$SELECT ((SELECT string_agg(c.id::text || c.datos::text, ',' ORDER BY c.id)
                FROM public.dps_avisos_correos c WHERE c.tipo = 'recordatorio') = pg_temp.ctx('rows1'))::text$q$, 'true');
SELECT pg_temp.assert_eq('i2: the first run counted every row it queued',
  $q$SELECT ((pg_temp.j('enc1') ->> 'encolados')::int = split_part(pg_temp.filas_fecha(DATE '2096-07-04'), '|', 1)::int)::text$q$, 'true');
SELECT pg_temp.assert_raises('i3: a bad day count is refused',
  $q$SELECT public.dps_recordatorios_encolar_fecha(DATE '2096-07-04', 0)$q$, '22023', 'dias_invalidos');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('i4: authenticated cannot run the job', $q$SELECT public.dps_recordatorios_encolar()$q$, '42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('i4: nor anon', $q$SELECT public.dps_recordatorios_encolar()$q$, '42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.put('job1', $q$SELECT public.dps_recordatorios_encolar()::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('i5: service_role runs it for today + dias',
  $q$SELECT concat_ws('|', pg_temp.j('job1') ->> 'activo', pg_temp.j('job1') ->> 'fecha' = (public.ninos_hoy() + 2)::text,
                      pg_temp.j('job1') ->> 'dias')$q$, 'true|t|2');

-- ── p. the preview ───────────────────────────────────────────────────

SELECT pg_temp.put('res1', $q$SELECT public.dps_recordatorio_resumen(DATE '2096-07-04')::text$q$);
SELECT pg_temp.assert_eq('p1: personas and con_botones are what the job queued',
  $q$SELECT (pg_temp.j('res1') ->> 'personas') || '|' || (pg_temp.j('res1') ->> 'con_botones')$q$,
  pg_temp.filas_fecha(DATE '2096-07-04'));
SELECT pg_temp.assert_eq('p2: no_pueden counts NOPU (MIX still serves) and sin_correo counts SINC',
  $q$SELECT ((pg_temp.j('res1') ->> 'no_pueden')::int >= 1)::text || '|' || ((pg_temp.j('res1') ->> 'sin_correo')::int >= 1)::text$q$,
  'true|true');
SELECT pg_temp.assert_eq('p2: the fixture part is exact (as postgres)',
  $q$SELECT concat_ws('|',
           (SELECT count(DISTINCT x.persona_id) FROM public.dps_recordatorio_destinatarios(DATE '2096-07-04') x
             WHERE x.persona_id::text LIKE 'dadd0000-%' AND x.email IS NOT NULL),
           (SELECT count(DISTINCT x.persona_id) FROM public.dps_recordatorio_destinatarios(DATE '2096-07-04') x
             WHERE x.persona_id::text LIKE 'dadd0000-%' AND x.email IS NULL))$q$, '3|1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(9);
SELECT pg_temp.put('leer2', $q$SELECT public.dps_config_leer()::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p3: proximo is a plan date, at least dias ahead, leaving dias before, never in the past',
  $q$SELECT concat_ws('|',
           EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.fecha = (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'fecha')::date),
           (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'fecha')::date >= public.ninos_hoy() + 2,
           (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'sale')::date
             = (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'fecha')::date - 2,
           (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'sale')::date >= public.ninos_hoy())$q$, 't|t|t|t');
SELECT pg_temp.assert_eq('p4: its count is the summary of that date',
  $q$SELECT ((pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'personas')
             = (public.dps_recordatorio_resumen((pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'fecha')::date) ->> 'personas'))::text$q$,
  'true');
SELECT pg_temp.assert_eq('p5: no earlier plan was skipped (the next one whose send day has not passed)',
  $q$SELECT (NOT EXISTS (SELECT 1 FROM public.dps_planes p
                         WHERE p.fecha < (pg_temp.j('leer2') -> 'recordatorio' -> 'proximo' ->> 'fecha')::date
                           AND p.fecha - 2 > public.ninos_hoy()))::text$q$, 'true');
SELECT pg_temp.assert_eq('p6: ultimo is today''s reminder day (the rows above)',
  $q$SELECT (pg_temp.j('leer2') -> 'recordatorio' -> 'ultimo' ->> 'fecha') = public.ninos_hoy()::text$q$, 'true');

-- ── d. changing the days between two runs (T16d) ────────────────────

-- Run 1 (above) was 2 days before 2096-07-04; the director switches to 1 day
-- and the next day's run lands on the same date.
INSERT INTO t_dar_ctx (k, v) VALUES ('rows_d', (SELECT string_agg(c.id::text || c.datos::text, ',' ORDER BY c.id)
                                                 FROM public.dps_avisos_correos c
                                                WHERE c.tipo = 'recordatorio' AND c.clave LIKE 'recordatorio:%:2096-07-04'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('g3', $q$SELECT public.dps_recordatorio_guardar(true, 1)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('d1: the configuration is now 1 day', $q$SELECT pg_temp.cfg()$q$, 'true:1');
SELECT pg_temp.put('enc3', $q$SELECT public.dps_recordatorios_encolar_fecha(DATE '2096-07-04', 1)::text$q$);
SELECT pg_temp.assert_eq('d2: the run with 1 day for the same date queues nothing',
  $q$SELECT concat_ws('|', pg_temp.j('enc3') ->> 'dias', pg_temp.j('enc3') ->> 'encolados',
                      pg_temp.j('enc3') ->> 'personas' = pg_temp.j('enc1') ->> 'personas')$q$, '1|0|t');
SELECT pg_temp.assert_eq('d3: still one reminder per fixture person for that date, as first queued (2 days)',
  $q$SELECT pg_temp.recordatorios()$q$,
  'U02:pendiente:2096-07-04:1:2,U03:pendiente:2096-07-04:2:2,U07:pendiente:2096-07-04:1:2');
SELECT pg_temp.assert_eq('d3: and no row of that date changed',
  $q$SELECT ((SELECT string_agg(c.id::text || c.datos::text, ',' ORDER BY c.id)
                FROM public.dps_avisos_correos c
               WHERE c.tipo = 'recordatorio' AND c.clave LIKE 'recordatorio:%:2096-07-04') = pg_temp.ctx('rows_d'))::text$q$, 'true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dar_failures);
END;
$$;
