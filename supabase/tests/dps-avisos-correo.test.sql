-- S14 (odd/tasks/dps-asistencia-pco.md, T16b; S14.1, S14.2, S14.4, S14.5;
-- L70-L73) — DPS service notices by e-mail
-- (20261114100000_dps_avisos_correo.sql). Needs the earlier DPS migrations
-- and 20261109210000_dps_avisos.sql; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_avisos_correos and dps_avisos_tokens
--      have RLS on, no policies, no privilege for anon or authenticated; the
--      new and replaced functions are SECURITY DEFINER with search_path '';
--      anon executes none of them; authenticated only dps_avisos_pendientes
--      and dps_avisos_enviar; service_role the outbox and token RPCs; the
--      trigger dps_avisos_no_puede exists.
--   n. The review: tiene_correo per person (a valid e-mail; NULL or not an
--      address is panel only), por_correo + solo_panel = total, remitente.
--   e. Sending: ONE outbox row per person and send grouping every notice of
--      it (two plans → one row with two blocks, by fecha, version 1,
--      confirmar); without an e-mail a sin_correo row (panel only);
--      responder_* = the planner; the blocks carry no other person's name;
--      por_correo + solo_panel = enviados; a second send queues nothing.
--   t. Confirm links: register (idempotent; unknown aviso and bad hash
--      ignored); read shows puesto and fecha, no name, and confirms nothing;
--      a wrong token and a malformed one are invalido and leave the rows
--      unchanged; confirm → confirmado, again → ya_confirmado (respondido_at
--      kept); an old version after a change of puesto → cambio, nothing
--      confirmed, the new version confirms; quitado → quitado; no_puede is
--      never undone; a past plan → vencido; anon and authenticated cannot
--      execute the token RPCs, service_role can.
--   p. The planner's «No puedo» e-mail: queued once per answer by the
--      trigger, to the planner, Reply-To the person, with the motivo and
--      «Cómo queda el puesto»; a new motivo for the same no_puede queues
--      nothing; confirmo then no_puede again is a new answer (a new row).
--   o. The outbox: the lease takes the no_puede rows first, never sin_correo
--      rows; enviado once; a failure goes back with a wait; a second lease
--      takes nothing already leased or sent (no e-mail twice); an expired
--      row is fallido 'vencido'; a bad limit is limite_invalido.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Planner and person calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id; the service RPCs run as
-- the connection (postgres) except the grant probes. No Sunday plan is
-- created: the plans are 'especial' ones in 2096 (and one in 2001). The real
-- DPS directors are synced into those plans too (their rows are left out by
-- the fixture filters).
--
-- Identities (usuario n = auth n, all fictitious «ZZ Dac U..»):
--   1 PLAN   dream_team.direct on the DPS root (plans; e-mail dac-1@)
--   2 VALE   voluntario, e-mail dac-2@
--   3 SINC   voluntario, no e-mail
--   4 OSCAR  voluntario, e-mail dac-4@
--   5 OTRO   voluntario, e-mail 'no-es-correo' (not an address)
-- Equipos: 2 ZZ Dac Dirección (child of the DPS root) › 1 ZZ Dac Equipo.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dac_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dac_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dac_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dac_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dac_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.j(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT v::jsonb FROM t_dac_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('dacc0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'dac1' WHEN 'us' THEN 'dac2' WHEN 'eq' THEN 'dac3'
                       WHEN 'ro' THEN 'dac4' WHEN 'se' THEN 'dac5' END,
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

CREATE OR REPLACE FUNCTION pg_temp.arr(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END;
$$;

-- The fixture people of an array of review items as code:tiene_correo, by name and fecha.
CREATE OR REPLACE FUNCTION pg_temp.canales(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(e ->> 'nombre', 3) || ':' || (e ->> 'tiene_correo'), ',' ORDER BY e ->> 'nombre', e ->> 'fecha'), '')
    FROM jsonb_array_elements(pg_temp.arr(p)) e
   WHERE e ->> 'persona_id' LIKE 'dacc0000-%';
$$;

-- A confirm token of the fixture (43 characters of [A-Za-z0-9_-]).
CREATE OR REPLACE FUNCTION pg_temp.tok(p_n int, p_plan text, p_version int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT rpad(format('ZZDac%s%s%s', p_n, replace(p_plan, '_', ''), p_version), 43, 'x');
$$;

CREATE OR REPLACE FUNCTION pg_temp.hash(p_token text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- The fixture notice of person n in a plan (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.aviso(p_n int, p_plan text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT to_jsonb(v) FROM public.dps_avisos v WHERE v.persona_id = pg_temp.id('us', p_n) AND v.plan_id = pg_temp.plan(p_plan);
$$;

-- Registers the token of person n's notice in a plan at its current version (as postgres): the new rows.
CREATE OR REPLACE FUNCTION pg_temp.registrar(p_n int, p_plan text) RETURNS int LANGUAGE sql AS $$
  SELECT public.dps_avisos_tokens_registrar(jsonb_build_array(jsonb_build_object(
           'hash', pg_temp.hash(pg_temp.tok(p_n, p_plan, (pg_temp.aviso(p_n, p_plan) ->> 'version')::int)),
           'aviso_id', pg_temp.aviso(p_n, p_plan) ->> 'id',
           'version', (pg_temp.aviso(p_n, p_plan) ->> 'version')::int)));
$$;

-- The fixture notices (as postgres): code:plan:estado:motivo:quitado:cambio:version:respondido, by code and plan.
CREATE OR REPLACE FUNCTION pg_temp.snap() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(':', u.apellido, p.titulo, v.estado, coalesce(v.motivo, '-'), v.quitado, v.cambio, v.version,
                                       coalesce(v.respondido_at::text, '-')),
                             ',' ORDER BY u.apellido, p.titulo), '')
    FROM public.dps_avisos v
    JOIN public.usuarios u ON u.id = v.persona_id
    JOIN public.dps_planes p ON p.id = v.plan_id
   WHERE u.id::text LIKE 'dacc0000-%';
$$;

-- The fixture outbox rows (as postgres): recipient code:tipo:estado:notices, by code, tipo and creation.
CREATE OR REPLACE FUNCTION pg_temp.correos() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(':', u.apellido, c.tipo, c.estado, coalesce(c.datos ->> 'avisos', '-')),
                             ',' ORDER BY u.apellido, c.tipo, c.created_at, c.clave), '')
    FROM public.dps_avisos_correos c
    JOIN public.usuarios u ON u.id = c.persona_id
   WHERE u.id::text LIKE 'dacc0000-%';
$$;

-- The blocks of the outbox rows of person n, in order: plan/aviso/version/confirmar per row, rows by creation.
CREATE OR REPLACE FUNCTION pg_temp.bloques(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((SELECT string_agg(p.titulo || '/' || (b ->> 'aviso') || '/' || (b ->> 'version') || '/' || (b ->> 'confirmar'), '+' ORDER BY o)
                                FROM jsonb_array_elements(c.datos -> 'bloques') WITH ORDINALITY AS t(b, o)
                                JOIN public.dps_planes p ON p.id = (b ->> 'plan_id')::uuid),
                             ',' ORDER BY c.created_at, c.clave), '')
    FROM public.dps_avisos_correos c
   WHERE c.persona_id = pg_temp.id('us', p_n) AND c.tipo = 'avisos';
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dac_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dac-auth-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Dac', 'U01', 'dac-1@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Dac', 'U02', 'dac-2@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 3), pg_temp.id('au', 3), 'ZZ Dac', 'U03', NULL, 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 4), pg_temp.id('au', 4), 'ZZ Dac', 'U04', 'dac-4@example.test', 'Soltero', 'Femenino');
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 5), pg_temp.id('au', 5), 'ZZ Dac', 'U05', 'no-es-correo', 'Soltero', 'Femenino');
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'dacc0000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 2), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Dac Dirección', true);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.id('eq', 2), 'ZZ Dac Equipo', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'ZZ Dac voluntario', 'voluntario', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM unnest(ARRAY[2, 3, 4, 5]) AS n;

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 5) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.ctx('raiz'), 'zz-test');

GRANT INSERT, SELECT, UPDATE ON t_dac_failures, t_dac_ctx TO authenticated, anon, service_role;
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

SELECT pg_temp.assert_eq('a1: the two tables have RLS on and no policies',
  $q$SELECT string_agg(c.relname || ':' || c.relrowsecurity || ':' || (SELECT count(*) FROM pg_policy po WHERE po.polrelid = c.oid),
                       ',' ORDER BY c.relname COLLATE "C")
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN ('dps_avisos_correos', 'dps_avisos_tokens')$q$,
  'dps_avisos_correos:true:0,dps_avisos_tokens:true:0');
SELECT pg_temp.assert_eq('a1: no table privilege for anon or authenticated',
  $q$SELECT string_agg(t || ':' || r || ':' || has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE'), ',' ORDER BY t, r)
       FROM unnest(ARRAY['dps_avisos_correos', 'dps_avisos_tokens']) t, unnest(ARRAY['anon', 'authenticated']) r$q$,
  'dps_avisos_correos:anon:false,dps_avisos_correos:authenticated:false,dps_avisos_tokens:anon:false,dps_avisos_tokens:authenticated:false');
SELECT pg_temp.assert_eq('a2: the new and replaced functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_correo_valido', 'dps_avisos_correos_encolar', 'dps_avisos_no_puede_encolar', 'dps_avisos_no_puede_trg',
        'dps_aviso_token_vista', 'dps_avisos_correos_reclamar', 'dps_avisos_correos_resultado', 'dps_avisos_tokens_registrar',
        'dps_aviso_token_leer', 'dps_aviso_token_confirmar', 'dps_avisos_pendientes', 'dps_avisos_enviar')$q$, '12|0');
SELECT pg_temp.assert_eq('a3: anon executes none of them; authenticated only the review and the send',
  $q$SELECT coalesce(string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE') || ':'
                                || has_function_privilege('authenticated', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
                       FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')), '-')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_correo_valido', 'dps_avisos_correos_encolar', 'dps_avisos_no_puede_encolar', 'dps_avisos_no_puede_trg',
        'dps_aviso_token_vista', 'dps_avisos_correos_reclamar', 'dps_avisos_correos_resultado', 'dps_avisos_tokens_registrar',
        'dps_aviso_token_leer', 'dps_aviso_token_confirmar', 'dps_avisos_pendientes', 'dps_avisos_enviar')$q$,
  'dps_avisos_enviar:false:true,dps_avisos_pendientes:false:true');
SELECT pg_temp.assert_eq('a4: service_role executes the outbox and token RPCs',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('service_role', p.oid, 'EXECUTE'), ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_avisos_correos_reclamar', 'dps_avisos_correos_resultado',
        'dps_avisos_tokens_registrar', 'dps_aviso_token_leer', 'dps_aviso_token_confirmar')$q$,
  'dps_aviso_token_confirmar:true,dps_aviso_token_leer:true,dps_avisos_correos_reclamar:true,dps_avisos_correos_resultado:true,'
  || 'dps_avisos_tokens_registrar:true');
SELECT pg_temp.assert_eq('a5: the trigger is on dps_avisos, after update of estado',
  $q$SELECT t.tgrelid::regclass::text || ':' || (pg_get_triggerdef(t.oid) LIKE '%AFTER UPDATE OF estado ON %dps_avisos FOR EACH ROW%')
       FROM pg_trigger t WHERE t.tgname = 'dps_avisos_no_puede' AND NOT t.tgisinternal$q$, 'dps_avisos:true');
SELECT pg_temp.assert_eq('a6: dps_avisos has a version column, 1 by default',
  $q$SELECT column_default || ':' || is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dps_avisos' AND column_name = 'version'$q$, '1:NO');

-- ── the plans and assignments (as PLAN) ──────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('pl_a', $q$SELECT public.dps_plan_crear(DATE '2096-06-03', 'especial', 'ZZ Dac A')::text$q$);
SELECT pg_temp.put('pl_b', $q$SELECT public.dps_plan_crear(DATE '2096-06-10', 'especial', 'ZZ Dac B')::text$q$);
SELECT pg_temp.put('pl_p', $q$SELECT public.dps_plan_crear(DATE '2001-06-03', 'especial', 'ZZ Dac Pasado')::text$q$);
SELECT pg_temp.put('pu_cam', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Dac Cámara', 3, NULL)::text$q$);
SELECT pg_temp.put('pu_aud', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Dac Audio', 2, NULL)::text$q$);
SELECT pg_temp.put('x1', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('x2', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 3))::text$q$);
SELECT pg_temp.put('x3', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 4))::text$q$);
SELECT pg_temp.put('x4', $q$SELECT public.dps_convocar(pg_temp.plan('pl_b'), pg_temp.plan('pu_cam'), pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('x5', $q$SELECT public.dps_convocar(pg_temp.plan('pl_b'), pg_temp.plan('pu_cam'), pg_temp.id('se', 5))::text$q$);

-- ── n. the review ────────────────────────────────────────────────────

SELECT pg_temp.put('pend1', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a', 'pl_b'))::text$q$);
SELECT pg_temp.assert_eq('n1: tiene_correo: a valid e-mail; none or not an address is panel only',
  $q$SELECT pg_temp.canales(pg_temp.j('pend1') -> 'nuevas')$q$, 'U02:true,U02:true,U03:false,U04:true,U05:false');
SELECT pg_temp.assert_eq('n2: por_correo + solo_panel = total; at least the two fixture people are panel only',
  $q$SELECT concat_ws('|', ((pg_temp.j('pend1') ->> 'por_correo')::int + (pg_temp.j('pend1') ->> 'solo_panel')::int
                            = (pg_temp.j('pend1') ->> 'total')::int), (pg_temp.j('pend1') ->> 'solo_panel')::int >= 2)$q$, 't|t');
SELECT pg_temp.assert_eq('n3: remitente is the caller (replies reach them)',
  $q$SELECT pg_temp.j('pend1') -> 'remitente' ->> 'nombre' || '|' || (pg_temp.j('pend1') -> 'remitente' ->> 'email')$q$,
  'ZZ Dac U01|dac-1@example.test');
RESET ROLE;
SELECT pg_temp.assert_eq('n4: the review queued no e-mail',
  $q$SELECT pg_temp.correos()$q$, '');

-- ── e. sending ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('env1', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a', 'pl_b'))::text$q$);
SELECT pg_temp.assert_eq('e1: por_correo + solo_panel = enviados = nuevas',
  $q$SELECT concat_ws('|', (pg_temp.j('env1') ->> 'por_correo')::int + (pg_temp.j('env1') ->> 'solo_panel')::int
                           = (pg_temp.j('env1') ->> 'enviados')::int,
                      pg_temp.j('env1') ->> 'enviados' = pg_temp.j('env1') ->> 'nuevas')$q$, 't|t');
RESET ROLE;
SELECT pg_temp.assert_eq('e2: one row per person and send; without an e-mail a sin_correo row',
  $q$SELECT pg_temp.correos()$q$, 'U02:avisos:pendiente:2,U03:avisos:sin_correo:1,U04:avisos:pendiente:1,U05:avisos:sin_correo:1');
SELECT pg_temp.assert_eq('e3: the two Sundays of VALE in one row, by fecha, version 1, asking to confirm',
  $q$SELECT pg_temp.bloques(2)$q$, 'ZZ Dac A/nueva/1/true+ZZ Dac B/nueva/1/true');
SELECT pg_temp.assert_eq('e4: VALE''s row: to her, Reply-To the planner',
  $q$SELECT concat_ws('|', c.email, c.nombre, c.responder_nombre, c.responder_email, c.vence)
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'avisos'$q$,
  'dac-2@example.test|ZZ|ZZ Dac U01|dac-1@example.test|2096-06-10');
SELECT pg_temp.assert_eq('e5: the panel-only rows have no address and are never pending',
  $q$SELECT string_agg(concat_ws(':', u.apellido, coalesce(c.email, '-'), c.estado), ',' ORDER BY u.apellido)
       FROM public.dps_avisos_correos c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE u.id::text LIKE 'dacc0000-%' AND c.email IS NULL$q$, 'U03:-:sin_correo,U05:-:sin_correo');
SELECT pg_temp.assert_eq('e6: a person''s e-mail carries no other fixture person''s name',
  $q$SELECT (c.datos::text LIKE '%U03%' OR c.datos::text LIKE '%U04%' OR c.datos::text LIKE '%U05%')::text
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'avisos'$q$, 'false');
SELECT pg_temp.assert_eq('e7: every fixture notice starts at version 1',
  $q$SELECT string_agg(DISTINCT v.version::text, ',') FROM public.dps_avisos v WHERE v.persona_id::text LIKE 'dacc0000-%'$q$, '1');
INSERT INTO t_dac_ctx (k, v) VALUES ('snap_e', pg_temp.snap());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('env1b', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a', 'pl_b'))::text$q$);
SELECT pg_temp.assert_eq('e8: a second send sends nothing',
  $q$SELECT concat_ws('|', pg_temp.j('env1b') ->> 'enviados', pg_temp.j('env1b') ->> 'por_correo', pg_temp.j('env1b') ->> 'solo_panel')$q$, '0|0|0');
RESET ROLE;
SELECT pg_temp.assert_eq('e9: and queues nothing; the notices are as they were',
  $q$SELECT pg_temp.correos() || '#' || (pg_temp.snap() = pg_temp.ctx('snap_e'))$q$,
  'U02:avisos:pendiente:2,U03:avisos:sin_correo:1,U04:avisos:pendiente:1,U05:avisos:sin_correo:1#true');

-- ── t. confirm links ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('t1: registering a token', $q$SELECT pg_temp.registrar(2, 'pl_a')::text$q$, '1');
SELECT pg_temp.assert_eq('t1: is idempotent', $q$SELECT pg_temp.registrar(2, 'pl_a')::text$q$, '0');
SELECT pg_temp.assert_eq('t1: an unknown aviso and a bad hash are ignored',
  $q$SELECT public.dps_avisos_tokens_registrar(jsonb_build_array(
             jsonb_build_object('hash', pg_temp.hash('ZZDacNadie'), 'aviso_id', gen_random_uuid(), 'version', 1),
             jsonb_build_object('hash', 'no-es-hash', 'aviso_id', pg_temp.aviso(2, 'pl_a') ->> 'id', 'version', 1)))::text$q$, '0');
SELECT pg_temp.assert_raises('t1: more than 200 tokens is demasiados',
  $q$SELECT public.dps_avisos_tokens_registrar((SELECT jsonb_agg(jsonb_build_object('hash', pg_temp.hash(g::text), 'aviso_id', gen_random_uuid(), 'version', 1))
                                                 FROM generate_series(1, 201) g))$q$, '22023', 'demasiados');
SET LOCAL ROLE service_role;
SELECT pg_temp.put('leer1', $q$SELECT public.dps_aviso_token_leer(pg_temp.tok(2, 'pl_a', 1))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('t2: reading (as service_role) shows puesto, fecha and hours; no name',
  $q$SELECT concat_ws('|', pg_temp.j('leer1') ->> 'estado', pg_temp.j('leer1') ->> 'fecha', pg_temp.j('leer1') ->> 'tipo',
                      pg_temp.j('leer1') ->> 'titulo', (pg_temp.j('leer1') -> 'roles')::text,
                      pg_temp.j('leer1') ->> 'plan_id' = pg_temp.ctx('pl_a'), jsonb_typeof(pg_temp.j('leer1') -> 'horarios'),
                      pg_temp.j('leer1') ? 'llegada', pg_temp.ctx('leer1') LIKE '%ZZ Dac U%')$q$,
  'por_confirmar|2096-06-03|especial|ZZ Dac A|[{"equipo": "ZZ Dac Equipo", "nombre": "ZZ Dac Cámara"}]|t|array|t|f');
SELECT pg_temp.assert_eq('t2: reading confirms nothing',
  $q$SELECT (pg_temp.snap() = pg_temp.ctx('snap_e'))::text$q$, 'true');
SELECT pg_temp.assert_eq('t3: a wrong token is invalido, with nothing else',
  $q$SELECT public.dps_aviso_token_confirmar(rpad('ZZDacOtro', 43, 'x'))::text$q$, '{"estado": "invalido"}');
SELECT pg_temp.assert_eq('t3: a malformed or missing token is invalido',
  $q$SELECT (public.dps_aviso_token_confirmar('ZZDac') ->> 'estado') || '|' || (public.dps_aviso_token_leer(NULL) ->> 'estado')
            || '|' || (public.dps_aviso_token_confirmar(pg_temp.tok(2, 'pl_a', 1) || '/') ->> 'estado')$q$, 'invalido|invalido|invalido');
SELECT pg_temp.assert_eq('t3: and they leave the notices unchanged',
  $q$SELECT (pg_temp.snap() = pg_temp.ctx('snap_e'))::text$q$, 'true');
SELECT pg_temp.put('conf1', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(2, 'pl_a', 1))::text$q$);
SELECT pg_temp.assert_eq('t4: «Confirmar» confirms',
  $q$SELECT concat_ws('|', pg_temp.j('conf1') ->> 'estado', pg_temp.j('conf1') ->> 'respondido_at' IS NOT NULL)$q$, 'confirmado|t');
SELECT pg_temp.assert_eq('t4: the notice is confirmo, answered, cambio cleared; only VALE''s A changed',
  $q$SELECT concat_ws('|', pg_temp.aviso(2, 'pl_a') ->> 'estado', pg_temp.aviso(2, 'pl_a') ->> 'respondido_at' IS NOT NULL,
                      pg_temp.aviso(2, 'pl_a') ->> 'cambio', pg_temp.aviso(2, 'pl_b') ->> 'estado', pg_temp.aviso(4, 'pl_a') ->> 'estado')$q$,
  'confirmo|t|false|pendiente|pendiente');
INSERT INTO t_dac_ctx (k, v) VALUES ('resp_vale', pg_temp.aviso(2, 'pl_a') ->> 'respondido_at');
SELECT pg_temp.put('conf2', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(2, 'pl_a', 1))::text$q$);
SELECT pg_temp.assert_eq('t5: again: ya_confirmado, the first answer kept',
  $q$SELECT concat_ws('|', pg_temp.j('conf2') ->> 'estado', (pg_temp.aviso(2, 'pl_a') ->> 'respondido_at') = pg_temp.ctx('resp_vale'))$q$,
  'ya_confirmado|t');

-- OSCAR: his link of version 1, then another puesto is sent (version 2).
SELECT pg_temp.assert_eq('t6: OSCAR''s link of version 1', $q$SELECT pg_temp.registrar(4, 'pl_a')::text$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('x6', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 4))::text$q$);
SELECT pg_temp.put('x7', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_aud'), pg_temp.id('se', 4))::text$q$);
SELECT pg_temp.put('env2', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a'))::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('t6: another puesto: version 2, pendiente again',
  $q$SELECT concat_ws('|', pg_temp.aviso(4, 'pl_a') ->> 'version', pg_temp.aviso(4, 'pl_a') ->> 'estado')$q$, '2|pendiente');
SELECT pg_temp.assert_eq('t6: the change queued OSCAR a second e-mail with the cambio asking again',
  $q$SELECT pg_temp.bloques(4)$q$, 'ZZ Dac A/nueva/1/true,ZZ Dac A/cambio/2/true');
SELECT pg_temp.put('conf3', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(4, 'pl_a', 1))::text$q$);
SELECT pg_temp.assert_eq('t7: the old link never confirms the changed notice: cambio, with what changed',
  $q$SELECT concat_ws('|', pg_temp.j('conf3') ->> 'estado', pg_temp.j('conf3') -> 'antes' -> 'roles' -> 0 ->> 'nombre',
                      pg_temp.j('conf3') -> 'roles' -> 0 ->> 'nombre', pg_temp.aviso(4, 'pl_a') ->> 'estado',
                      pg_temp.aviso(4, 'pl_a') ->> 'respondido_at' IS NULL)$q$,
  'cambio|ZZ Dac Cámara|ZZ Dac Audio|pendiente|t');
SELECT pg_temp.assert_eq('t8: the link of version 2', $q$SELECT pg_temp.registrar(4, 'pl_a')::text$q$, '1');
SELECT pg_temp.assert_eq('t8: confirms',
  $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(4, 'pl_a', 2)) ->> 'estado'$q$, 'confirmado');

-- SINC: taken out after the notice.
SELECT pg_temp.assert_eq('t9: SINC''s link', $q$SELECT pg_temp.registrar(3, 'pl_a')::text$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('x8', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 3))::text$q$);
SELECT pg_temp.put('env3', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a'))::text$q$);
RESET ROLE;
SELECT pg_temp.put('conf4', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(3, 'pl_a', 1))::text$q$);
SELECT pg_temp.assert_eq('t9: taken out: quitado, nothing confirmed',
  $q$SELECT concat_ws('|', pg_temp.j('conf4') ->> 'estado', pg_temp.aviso(3, 'pl_a') ->> 'quitado', pg_temp.aviso(3, 'pl_a') ->> 'estado',
                      pg_temp.aviso(3, 'pl_a') ->> 'version')$q$, 'quitado|true|pendiente|2');
SELECT pg_temp.assert_eq('t9: «Ya no estás programado» is a panel-only row for SINC',
  $q$SELECT pg_temp.bloques(3) || '#' || (SELECT string_agg(c.estado, ',' ORDER BY c.created_at, c.clave)
                                            FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 3))$q$,
  'ZZ Dac A/nueva/1/true,ZZ Dac A/quitado/2/false#sin_correo,sin_correo');

-- VALE says «No puedo» to B in the app; her e-mail link must not undo it.
SELECT pg_temp.assert_eq('t10: VALE''s link of B', $q$SELECT pg_temp.registrar(2, 'pl_b')::text$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('np1', $q$SELECT public.dps_responder(pg_temp.plan('pl_b'), 'no_puede', '  ZZ Dac viaje  ')::text$q$);
RESET ROLE;
SELECT pg_temp.put('conf5', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(2, 'pl_b', 1))::text$q$);
SELECT pg_temp.assert_eq('t10: the link never undoes a «No puedo»',
  $q$SELECT concat_ws('|', pg_temp.j('conf5') ->> 'estado', pg_temp.j('conf5') ->> 'respondido_at' IS NOT NULL,
                      pg_temp.aviso(2, 'pl_b') ->> 'estado', pg_temp.aviso(2, 'pl_b') ->> 'motivo')$q$,
  'no_puede|t|no_puede|ZZ Dac viaje');

-- A notice of a past plan (written directly: a send ignores past plans).
INSERT INTO public.dps_avisos (plan_id, persona_id, claves, roles, fecha, horarios, llegada) -- noqa: insert-into
SELECT pg_temp.plan('pl_p'), pg_temp.id('us', 5), ARRAY['p:' || pg_temp.ctx('pu_cam')],
       jsonb_build_array(jsonb_build_object('origen', 'puesto', 'puesto_id', pg_temp.ctx('pu_cam'), 'nombre', 'ZZ Dac Cámara', 'equipo', 'ZZ Dac Equipo')),
       DATE '2001-06-03', '["09:00"]'::jsonb, TIME '07:00';
SELECT pg_temp.assert_eq('t11: OTRO''s link of the past plan', $q$SELECT pg_temp.registrar(5, 'pl_p')::text$q$, '1');
SELECT pg_temp.put('conf6', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(5, 'pl_p', 1))::text$q$);
SELECT pg_temp.assert_eq('t11: past the plan''s date the link is vencido (fecha only) and confirms nothing',
  $q$SELECT concat_ws('|', pg_temp.j('conf6') ->> 'estado', pg_temp.j('conf6') ->> 'fecha', pg_temp.j('conf6') ? 'roles',
                      pg_temp.aviso(5, 'pl_p') ->> 'estado')$q$, 'vencido|2001-06-03|f|pendiente');

INSERT INTO t_dac_ctx (k, v) VALUES ('snap_t', pg_temp.snap());
SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('t12: anon cannot confirm', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(2, 'pl_a', 1))$q$, '42501');
SELECT pg_temp.assert_raises('t12: nor read', $q$SELECT public.dps_aviso_token_leer(pg_temp.tok(2, 'pl_a', 1))$q$, '42501');
SELECT pg_temp.assert_raises('t12: nor register', $q$SELECT public.dps_avisos_tokens_registrar('[]'::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('t12: nor read the outbox', $q$SELECT count(*) FROM public.dps_avisos_correos$q$, '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('t13: authenticated cannot confirm', $q$SELECT public.dps_aviso_token_confirmar(pg_temp.tok(4, 'pl_a', 2))$q$, '42501');
SELECT pg_temp.assert_raises('t13: nor lease the outbox', $q$SELECT count(*) FROM public.dps_avisos_correos_reclamar(10, 10)$q$, '42501');
SELECT pg_temp.assert_raises('t13: nor read the tokens', $q$SELECT count(*) FROM public.dps_avisos_tokens$q$, '42501');
RESET ROLE;
SELECT pg_temp.assert_eq('t14: the refusals changed nothing',
  $q$SELECT (pg_temp.snap() = pg_temp.ctx('snap_t'))::text$q$, 'true');

-- ── p. the planner's «No puedo» e-mail ───────────────────────────────

SELECT pg_temp.assert_eq('p1: VALE''s «No puedo» queued one e-mail to the planner, Reply-To VALE',
  $q$SELECT string_agg(concat_ws('|', u.apellido, c.estado, c.email, c.nombre, c.responder_nombre, c.responder_email,
                                 c.datos ->> 'persona', c.datos ->> 'motivo', c.datos ->> 'estado', c.datos ->> 'plan_id' = pg_temp.ctx('pl_b'), c.vence),
                       ',')
       FROM public.dps_avisos_correos c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE c.tipo = 'no_puede' AND c.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'$q$,
  'U01|pendiente|dac-1@example.test|ZZ|ZZ Dac U02|dac-2@example.test|ZZ Dac U02|ZZ Dac viaje|no_puede|t|2096-06-10');
SELECT pg_temp.assert_eq('p2: «Cómo queda el puesto»: cupos, who still covers it and each state',
  $q$SELECT string_agg(concat_ws(':', x ->> 'nombre', x ->> 'equipo', x ->> 'cantidad', x ->> 'cubiertos',
                                 (SELECT string_agg((g ->> 'nombre') || '=' || (g ->> 'estado'), ',' ORDER BY g ->> 'nombre')
                                    FROM jsonb_array_elements(x -> 'personas') g WHERE g ->> 'nombre' LIKE 'ZZ Dac%')), '#')
       FROM public.dps_avisos_correos c, jsonb_array_elements(c.datos -> 'puestos') x
      WHERE c.tipo = 'no_puede' AND c.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'$q$,
  'ZZ Dac Cámara:ZZ Dac Equipo:3:1:ZZ Dac U02=no_puede,ZZ Dac U05=pendiente');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('np2', $q$SELECT public.dps_responder(pg_temp.plan('pl_b'), 'no_puede', 'ZZ Dac otro motivo')::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p3: the same «No puedo» with another motivo queues nothing more',
  $q$SELECT count(*)::text FROM public.dps_avisos_correos c WHERE c.tipo = 'no_puede' AND c.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('np3', $q$SELECT public.dps_responder(pg_temp.plan('pl_b'), 'confirmo', NULL)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p4: Confirmar queues nothing',
  $q$SELECT count(*)::text FROM public.dps_avisos_correos c WHERE c.tipo = 'no_puede' AND c.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('np4', $q$SELECT public.dps_responder(pg_temp.plan('pl_b'), 'no_puede', NULL)::text$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p5: a new «No puedo» after confirming is a new answer: a second e-mail, without motivo',
  $q$SELECT count(*) || '|' || coalesce((SELECT c2.datos ->> 'motivo' FROM public.dps_avisos_correos c2
                                           WHERE c2.tipo = 'no_puede' AND c2.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'
                                           ORDER BY c2.created_at DESC, c2.clave DESC LIMIT 1), '-')
       FROM public.dps_avisos_correos c WHERE c.tipo = 'no_puede' AND c.datos ->> 'aviso_id' = pg_temp.aviso(2, 'pl_b') ->> 'id'$q$, '2|-');

-- ── o. the outbox ────────────────────────────────────────────────────

SELECT pg_temp.put('lease1', $q$SELECT jsonb_agg(r.id ORDER BY o)::text FROM public.dps_avisos_correos_reclamar(100, 10000) WITH ORDINALITY AS r(id, tipo, email, nombre, responder_nombre, responder_email, datos, intentos, o)$q$);
SELECT pg_temp.assert_eq('o1: the lease takes the fixture rows with an e-mail, never sin_correo',
  $q$SELECT string_agg(u.apellido || ':' || c.tipo || ':' || c.intentos, ',' ORDER BY u.apellido, c.tipo, c.created_at, c.clave)
       FROM public.dps_avisos_correos c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE u.id::text LIKE 'dacc0000-%' AND pg_temp.j('lease1') ? c.id::text$q$,
  'U01:no_puede:1,U01:no_puede:1,U02:avisos:1,U04:avisos:1,U04:avisos:1');
SELECT pg_temp.assert_eq('o1: the planner''s «No puedo» comes first',
  $q$SELECT c.tipo FROM public.dps_avisos_correos c WHERE c.id = (pg_temp.j('lease1') ->> 0)::uuid$q$, 'no_puede');
SELECT pg_temp.assert_eq('o2: a sent row is enviado once',
  $q$SELECT public.dps_avisos_correos_resultado(c.id, true) || '|' || public.dps_avisos_correos_resultado(c.id, true)
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'avisos'$q$, 'true|false');
SELECT pg_temp.assert_eq('o2: enviado with its time',
  $q$SELECT c.estado || '|' || (c.enviado_en IS NOT NULL) FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 2) AND c.tipo = 'avisos'$q$,
  'enviado|true');
SELECT pg_temp.put('fallo1', $q$SELECT public.dps_avisos_correos_resultado(c.id, false, 'ZZ boom')::text
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 4) ORDER BY c.created_at, c.clave LIMIT 1$q$);
SELECT pg_temp.assert_eq('o3: a failure goes back to pendiente with a wait and the error',
  $q$SELECT concat_ws('|', pg_temp.ctx('fallo1'), c.estado, c.error, c.disponible_en > now() + interval '1 minute')
       FROM public.dps_avisos_correos c WHERE c.persona_id = pg_temp.id('us', 4) ORDER BY c.created_at, c.clave LIMIT 1$q$,
  'true|pendiente|ZZ boom|t');
SELECT pg_temp.put('lease2', $q$SELECT coalesce(jsonb_agg(r.id), '[]'::jsonb)::text FROM public.dps_avisos_correos_reclamar(100, 10000) r$q$);
SELECT pg_temp.assert_eq('o4: a second lease takes nothing leased, waiting or sent: no e-mail twice',
  $q$SELECT count(*)::text FROM public.dps_avisos_correos c
      WHERE c.persona_id::text LIKE 'dacc0000-%' AND pg_temp.j('lease2') ? c.id::text$q$, '0');
INSERT INTO public.dps_avisos_correos (clave, tipo, persona_id, email, datos, vence) -- noqa: insert-into
VALUES ('zz-dac-vencido', 'avisos', pg_temp.id('us', 2), 'dac-2@example.test', '{}'::jsonb, DATE '2001-06-03');
SELECT pg_temp.put('lease3', $q$SELECT coalesce(jsonb_agg(r.id), '[]'::jsonb)::text FROM public.dps_avisos_correos_reclamar(100, 10000) r$q$);
SELECT pg_temp.assert_eq('o5: an expired row is never sent: fallido vencido',
  $q$SELECT concat_ws('|', c.estado, c.error, pg_temp.j('lease3') ? c.id::text) FROM public.dps_avisos_correos c WHERE c.clave = 'zz-dac-vencido'$q$,
  'fallido|vencido|f');
SELECT pg_temp.assert_raises('o6: a bad limit',
  $q$SELECT count(*) FROM public.dps_avisos_correos_reclamar(0, 10)$q$, '22023', 'limite_invalido');
SELECT pg_temp.assert_raises('o6: a bad cap',
  $q$SELECT count(*) FROM public.dps_avisos_correos_reclamar(10, -1)$q$, '22023', 'tope_invalido');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dac_failures);
END;
$$;
