-- S13 (odd/tasks/dps-asistencia-pco.md, T15a; S13.2-S13.4, S13.6; L62-L65) —
-- DPS service notices in the app panel and the dates a person cannot serve
-- (20261109210000_dps_avisos.sql). Needs the earlier DPS migrations; the
-- fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_avisos and dream_team_fechas_bloqueadas
--      have RLS on, no policies and no privilege for authenticated; the new
--      functions are SECURITY DEFINER with search_path ''; authenticated
--      executes exactly the public ones, not the internal helpers; anon
--      executes no dps_* function.
--   n. Pending notices: Juan -> Pedro -> Pedro2 before sending leaves only
--      Pedro2; puestos, the Host column and the automatic director are
--      nuevas with their roles (origen, nombre, equipo, dirección,
--      automático); a written name never appears (only under sin_cuenta);
--      a past plan is ignored; tiene_cuenta; the plan state says sin_avisar
--      and how many are pending; past plans show no sin_avisar; only
--      planners ('sin_autoridad'); more than 400 plans is 'demasiados'.
--   e. Sending: everything at once, with enviado_por; a second send sends 0
--      and changes nothing; afterwards nothing is pending and everyone is
--      pendiente.
--   s. The person: Mis servicios, confirmo (motivo ignored) and no_puede
--      (motivo trimmed); motivo_invalido, respuesta_invalida, another
--      person or someone never notified ('sin_autoridad'), and a past plan
--      ('plan_pasado') leave the rows as they were; the detail only for
--      someone notified, with the companions as confirmó or not (another
--      person's no_puede and motivo never leave the database) and the order;
--      the planner sees the no_puede and its motivo.
--   c. Changes: taking someone out and back before sending leaves nothing;
--      another puesto asks again (pendiente, roles_antes); hours only keep
--      the answer (cambio, horarios_antes); taken out after the notice ->
--      quitado; a no_puede taken out closes silently (ya_respondieron); a
--      replacement says whom it replaces; the person sees «Cambió tu
--      servicio» / «Ya no estás programado» until visto; quitado cannot open
--      or answer the service; back in after quitado is a new invitation; an
--      answer clears cambio. A closure counts in total and por_enviar.
--   d. A closure alone (L67): a no_puede taken out is the only pending
--      change: total 1, por_enviar 1 (global and per plan), the send closes
--      it (cerrados 1, enviados 0), then nothing is pending and the person
--      no longer sees the service.
--   b. Blocked dates: add (trimmed nota), the conflicts are listed and
--      nothing is answered (S13.6); fecha_invalida, rango_invalido (also 367
--      days; 366 is fine), fecha_pasada, nota_invalida leave nothing; the same
--      range updates its nota; each person sees and removes only their own
--      ('bloqueo_invalido'); the planner sees who blocked a plan's date;
--      without a session 'sin_autoridad'.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id. No Sunday plan is
-- created: the plans are 'especial' ones in 2096 (and one in 2001). The real
-- DPS directors are synced into those plans too (automatic rows): counts that
-- include them add 'extra_a', the real people assigned to pl_a.
--
-- Identities (usuario n = auth n except 13, all fictitious «ZZ Dav U..»):
--   1 PLAN    dream_team.direct on the DPS root (plans, edits the hosts list)
--   2 JUAN, 3 PEDRO, 4 PEDRO2, 5 ANA, 6 LUIS, 7 HUGO, 8 OSCAR, 12 BLOQ,
--     14 IRENE   voluntario in ZZ Dav Equipo
--   9 OTRO    nothing
--   10 HOST   on the hosts list
--   11 DIRE   Director (nivel director) of ZZ Dav Dirección: automatic
--   13 SINAU  voluntario without an auth account
-- Equipos: 2 ZZ Dav Dirección (child of the DPS root) › 1 ZZ Dav Equipo.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dav_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dav_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dav_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dav_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dav_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.j(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT v::jsonb FROM t_dav_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.n(p_k text) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT v::int FROM t_dav_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('da5e0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'da51' WHEN 'us' THEN 'da52' WHEN 'eq' THEN 'da53'
                       WHEN 'ro' THEN 'da54' WHEN 'se' THEN 'da55' END,
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

CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.arr(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END;
$$;

-- The fixture people of an array of items as their codes (U04,U05…), by name.
CREATE OR REPLACE FUNCTION pg_temp.quienes(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(e ->> 'nombre', 3), ',' ORDER BY e ->> 'nombre'), '')
    FROM jsonb_array_elements(pg_temp.arr(p)) e
   WHERE e ->> 'persona_id' LIKE 'da5e0000-%';
$$;

-- The item of fixture person n in an array of items.
CREATE OR REPLACE FUNCTION pg_temp.de(p jsonb, p_n int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(pg_temp.arr(p)) e WHERE e ->> 'persona_id' = pg_temp.id('us', p_n)::text LIMIT 1;
$$;

-- Roles as origen:nombre:equipo:direccion:automatico, in order.
CREATE OR REPLACE FUNCTION pg_temp.roles(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(':', r ->> 'origen', r ->> 'nombre', r ->> 'equipo', r ->> 'direccion', r ->> 'automatico'), ',' ORDER BY o), '-')
    FROM jsonb_array_elements(pg_temp.arr(p)) WITH ORDINALITY AS t(r, o);
$$;

-- The fixture people of a plan in dps_avisos_estado as code:estado, by name.
CREATE OR REPLACE FUNCTION pg_temp.estados(p jsonb, p_plan text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(e ->> 'nombre', 3) || ':' || (e ->> 'estado'), ',' ORDER BY e ->> 'nombre'), '')
    FROM jsonb_array_elements(pg_temp.arr(p -> 'planes')) pl,
         jsonb_array_elements(pg_temp.arr(pl -> 'personas')) e
   WHERE pl ->> 'plan_id' = pg_temp.ctx(p_plan) AND e ->> 'persona_id' LIKE 'da5e0000-%';
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan_estado(p jsonb, p_plan text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pl FROM jsonb_array_elements(pg_temp.arr(p -> 'planes')) pl WHERE pl ->> 'plan_id' = pg_temp.ctx(p_plan) LIMIT 1;
$$;

-- The plans of an array of services / notices, as ctx keys (pl_a, pl_b, pl_p).
CREATE OR REPLACE FUNCTION pg_temp.de_planes(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(coalesce((SELECT c.k FROM t_dav_ctx c WHERE c.k LIKE 'pl\_%' AND c.v = e ->> 'plan_id'), '?'), ',' ORDER BY o), '')
    FROM jsonb_array_elements(pg_temp.arr(p)) WITH ORDINALITY AS t(e, o);
$$;

-- The fixture notices (as postgres): code:plan:estado:motivo:quitado:cambio:visto, by code and plan.
CREATE OR REPLACE FUNCTION pg_temp.snap() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(':', u.apellido, p.titulo, v.estado, coalesce(v.motivo, '-'), v.quitado, v.cambio,
                                       v.visto_at IS NULL, v.respondido_at IS NULL, v.claves::text, v.horarios::text),
                             ',' ORDER BY u.apellido, p.titulo), '')
    FROM public.dps_avisos v
    JOIN public.usuarios u ON u.id = v.persona_id
    JOIN public.dps_planes p ON p.id = v.plan_id
   WHERE u.id::text LIKE 'da5e0000-%';
$$;

-- One fixture notice (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.aviso(p_n int, p_plan text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT to_jsonb(v) FROM public.dps_avisos v WHERE v.persona_id = pg_temp.id('us', p_n) AND v.plan_id = pg_temp.ctx(p_plan)::uuid;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dav_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_dav_ctx (k, v)
SELECT 'pc_label', coalesce((SELECT e.label FROM public.dream_team_equipos e
                              WHERE e.parent_equipo_id = pg_temp.ctx('raiz')::uuid AND e.label = 'Producción Creativa' AND e.activo
                              LIMIT 1), 'Producción Creativa');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dav-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 14) AS n
 WHERE n <> 13;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), CASE WHEN n <> 13 THEN pg_temp.id('au', n) END, 'ZZ Dav', 'U' || lpad(n::text, 2, '0'),
       'dav-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 14) AS n;
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'da5e0000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 2), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Dav Dirección', true);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.id('eq', 2), 'ZZ Dav Equipo', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'ZZ Dav voluntario', 'voluntario', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 2), pg_temp.id('eq', 2), 'ZZ Dav Director', 'director', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM unnest(ARRAY[2, 3, 4, 5, 6, 7, 8, 12, 13, 14]) AS n;
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 11), pg_temp.id('us', 11), pg_temp.id('eq', 2), pg_temp.id('ro', 2), 'activo',
   now() - interval '30 days', 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 14) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.ctx('raiz'), 'zz-test');

GRANT INSERT, SELECT, UPDATE ON t_dav_failures, t_dav_ctx TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

-- ── a. structure and privileges ──────────────────────────────────────

SELECT pg_temp.assert_eq('a1: the two tables have RLS on and no policies',
  $q$SELECT string_agg(c.relname || ':' || c.relrowsecurity || ':' || (SELECT count(*) FROM pg_policy po WHERE po.polrelid = c.oid),
                       ',' ORDER BY c.relname COLLATE "C")
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN ('dps_avisos', 'dream_team_fechas_bloqueadas')$q$,
  'dps_avisos:true:0,dream_team_fechas_bloqueadas:true:0');
SELECT pg_temp.assert_eq('a2: the new functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_avisos_asignaciones', 'dps_avisos_diff', 'dps_avisos_preparar', 'dps_aviso_json', 'dps_fecha_bloqueada_json',
        'dps_avisos_pendientes', 'dps_avisos_enviar', 'dps_avisos_estado', 'dps_personas_bloqueadas', 'dps_mis_servicios',
        'dps_mi_servicio', 'dps_responder', 'dps_aviso_visto', 'dps_mis_fechas_bloqueadas', 'dps_fecha_bloqueada_agregar',
        'dps_fecha_bloqueada_quitar')$q$, '16|0');
SELECT pg_temp.assert_eq('a3: authenticated executes exactly the public new functions',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND p.proname IN (
        'dps_avisos_asignaciones', 'dps_avisos_diff', 'dps_avisos_preparar', 'dps_aviso_json', 'dps_fecha_bloqueada_json',
        'dps_avisos_pendientes', 'dps_avisos_enviar', 'dps_avisos_estado', 'dps_personas_bloqueadas', 'dps_mis_servicios',
        'dps_mi_servicio', 'dps_responder', 'dps_aviso_visto', 'dps_mis_fechas_bloqueadas', 'dps_fecha_bloqueada_agregar',
        'dps_fecha_bloqueada_quitar')$q$,
  'dps_aviso_visto,dps_avisos_enviar,dps_avisos_estado,dps_avisos_pendientes,dps_fecha_bloqueada_agregar,'
  || 'dps_fecha_bloqueada_quitar,dps_mi_servicio,dps_mis_fechas_bloqueadas,dps_mis_servicios,dps_personas_bloqueadas,dps_responder');
SELECT pg_temp.assert_eq('a4: anon executes no dps_* function',
  $q$SELECT coalesce(string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C"), '-') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$, '-');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a5: authenticated cannot read dps_avisos', $q$SELECT count(*) FROM public.dps_avisos$q$, '42501');
SELECT pg_temp.assert_raises('a5: authenticated cannot read dream_team_fechas_bloqueadas',
  $q$SELECT count(*) FROM public.dream_team_fechas_bloqueadas$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_avisos_diff',
  $q$SELECT count(*) FROM public.dps_avisos_diff(ARRAY[gen_random_uuid()])$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_aviso_json',
  $q$SELECT public.dps_aviso_json(gen_random_uuid())$q$, '42501');
RESET ROLE;

-- ── the plans and assignments (as PLAN) ──────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('pl_a', $q$SELECT public.dps_plan_crear(DATE '2096-05-06', 'especial', 'ZZ Dav A')::text$q$);
SELECT pg_temp.put('pl_b', $q$SELECT public.dps_plan_crear(DATE '2096-05-13', 'especial', 'ZZ Dav B')::text$q$);
SELECT pg_temp.put('pl_p', $q$SELECT public.dps_plan_crear(DATE '2001-05-06', 'especial', 'ZZ Dav Pasado')::text$q$);
SELECT pg_temp.put('pu_cam', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Dav Cámara', 3, NULL)::text$q$);
SELECT pg_temp.put('pu_aud', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Dav Audio', 2, NULL)::text$q$);
SELECT pg_temp.put('lista', $q$SELECT (public.dps_lista_agregar('hosts', pg_temp.id('us', 10)) IS NOT NULL)::text$q$);

-- Juan -> Pedro -> Pedro2 in Cámara, nothing sent yet.
SELECT pg_temp.put('x1', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('x2', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 2))::text$q$);
SELECT pg_temp.put('x3', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 3))::text$q$);
SELECT pg_temp.put('x4', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 3))::text$q$);
SELECT pg_temp.put('x5', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 4))::text$q$);
SELECT pg_temp.put('x6', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_aud'), pg_temp.id('se', 5))::text$q$);
SELECT pg_temp.put('x7', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_aud'), pg_temp.id('se', 6))::text$q$);
SELECT pg_temp.put('x8', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 7))::text$q$);
SELECT pg_temp.put('x9', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 8))::text$q$);
SELECT pg_temp.put('x10', $q$SELECT public.dps_plan_campo(pg_temp.plan('pl_a'), 'host',
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 10)), jsonb_build_object('texto', 'ZZ Dav Sin Cuenta')))::text$q$);
-- Juan in the past plan; SINAU in pl_b.
SELECT pg_temp.put('x11', $q$SELECT public.dps_convocar(pg_temp.plan('pl_p'), pg_temp.plan('pu_cam'), pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('x12', $q$SELECT public.dps_convocar(pg_temp.plan('pl_b'), pg_temp.plan('pu_aud'), pg_temp.id('se', 13))::text$q$);
SELECT pg_temp.put('orden', $q$SELECT public.dps_orden_agregar(pg_temp.plan('pl_a'), 'item', 'ZZ Dav Bienvenida', 300)::text$q$);
RESET ROLE;

INSERT INTO t_dav_ctx (k, v)
SELECT 'hor_a', p.horarios::text FROM public.dps_planes p WHERE p.id = pg_temp.plan('pl_a');
INSERT INTO t_dav_ctx (k, v)
SELECT 'lleg_a', to_char(p.llegada, 'HH24:MI') FROM public.dps_planes p WHERE p.id = pg_temp.plan('pl_a');

-- ── n. pending notices ───────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('pend1', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a', 'pl_p'))::text$q$);
RESET ROLE;
-- The real directors the sync added to pl_a.
INSERT INTO t_dav_ctx (k, v)
SELECT 'extra_a', count(DISTINCT c.persona_id)::text
  FROM public.dps_convocados c
 WHERE c.plan_id = pg_temp.plan('pl_a') AND c.persona_id::text NOT LIKE 'da5e0000-%';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('n1: Pedro2, Ana, Luis, Hugo, Oscar, the host and the automatic director are new invitations',
  $q$SELECT pg_temp.quienes(pg_temp.j('pend1') -> 'nuevas')$q$, 'U04,U05,U06,U07,U08,U10,U11');
SELECT pg_temp.assert_eq('n2: Juan and Pedro, changed before sending, get nothing anywhere',
  $q$SELECT (pg_temp.ctx('pend1') LIKE '%U02%' OR pg_temp.ctx('pend1') LIKE '%U03%')::text$q$, 'false');
SELECT pg_temp.assert_eq('n3: no changes and nobody taken out yet',
  $q$SELECT pg_temp.quienes(pg_temp.j('pend1') -> 'cambios') || '|' || pg_temp.quienes(pg_temp.j('pend1') -> 'quitados')
            || '|' || pg_temp.quienes(pg_temp.j('pend1') -> 'no_reciben' -> 'ya_respondieron')$q$, '||');
SELECT pg_temp.assert_eq('n4: a puesto: origen, nombre, equipo and dirección',
  $q$SELECT pg_temp.roles(pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) -> 'roles')$q$,
  'puesto:ZZ Dav Cámara:ZZ Dav Equipo:ZZ Dav Dirección:false');
SELECT pg_temp.assert_eq('n5: the Host column is a role too',
  $q$SELECT pg_temp.roles(pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 10) -> 'roles')$q$,
  'columna:Host:' || pg_temp.ctx('pc_label') || ':' || pg_temp.ctx('pc_label') || ':false');
SELECT pg_temp.assert_eq('n6: the automatic director is a normal assignment, marked automatico',
  $q$SELECT pg_temp.roles(pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 11) -> 'roles') || '|'
            || (pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 11) ->> 'automatico')$q$,
  'puesto:Director de ZZ Dav Dirección:DPS:ZZ Dav Dirección:true|true');
SELECT pg_temp.assert_eq('n7: the written name is never a notice, only under sin_cuenta',
  $q$SELECT (SELECT count(*) FROM jsonb_array_elements(pg_temp.j('pend1') -> 'nuevas') e WHERE e ->> 'nombre' = 'ZZ Dav Sin Cuenta')
            || '|' || (SELECT string_agg((e ->> 'columna') || ':' || (e ->> 'nombre'), ',')
                         FROM jsonb_array_elements(pg_temp.j('pend1') -> 'no_reciben' -> 'sin_cuenta') e
                        WHERE e ->> 'plan_id' = pg_temp.ctx('pl_a'))$q$, '0|host:ZZ Dav Sin Cuenta');
SELECT pg_temp.assert_eq('n8: the past plan is ignored',
  $q$SELECT count(*)::text FROM jsonb_array_elements(pg_temp.j('pend1') -> 'nuevas') e WHERE e ->> 'plan_id' = pg_temp.ctx('pl_p')$q$, '0');
SELECT pg_temp.assert_eq('n9: total and nuevas count every pending notice (with the real directors)',
  $q$SELECT (pg_temp.j('pend1') ->> 'total') || '|' || jsonb_array_length(pg_temp.j('pend1') -> 'nuevas')$q$,
  (7 + pg_temp.n('extra_a')) || '|' || (7 + pg_temp.n('extra_a')));
SELECT pg_temp.assert_eq('n10: an item carries the plan, the name, tiene_cuenta and nobody to replace',
  $q$SELECT concat_ws('|', pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'fecha', pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'titulo',
                      pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'nombre', pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'iniciales',
                      pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'tiene_cuenta', pg_temp.de(pg_temp.j('pend1') -> 'nuevas', 4) ->> 'reemplaza')$q$,
  '2096-05-06|ZZ Dav A|ZZ Dav U04|ZU|true|[]');
SELECT pg_temp.assert_eq('n11: someone without an auth account is still a notice, tiene_cuenta false',
  $q$SELECT pg_temp.de(public.dps_avisos_pendientes(pg_temp.planes('pl_b')) -> 'nuevas', 13) ->> 'tiene_cuenta'$q$, 'false');
SELECT pg_temp.put('est1', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a', 'pl_p'))::text$q$);
SELECT pg_temp.assert_eq('n12: the plan state: everyone sin_avisar',
  $q$SELECT pg_temp.estados(pg_temp.j('est1'), 'pl_a')$q$,
  'U04:sin_avisar,U05:sin_avisar,U06:sin_avisar,U07:sin_avisar,U08:sin_avisar,U10:sin_avisar,U11:sin_avisar');
SELECT pg_temp.assert_eq('n13: N sin avisar, sin_cuenta 1, nothing confirmed',
  $q$SELECT concat_ws('|', pg_temp.plan_estado(pg_temp.j('est1'), 'pl_a') ->> 'por_enviar',
                      pg_temp.plan_estado(pg_temp.j('est1'), 'pl_a') -> 'resumen' ->> 'sin_avisar',
                      pg_temp.plan_estado(pg_temp.j('est1'), 'pl_a') -> 'resumen' ->> 'sin_cuenta',
                      pg_temp.plan_estado(pg_temp.j('est1'), 'pl_a') -> 'resumen' ->> 'confirmo')$q$,
  (7 + pg_temp.n('extra_a')) || '|' || (7 + pg_temp.n('extra_a')) || '|1|0');
SELECT pg_temp.assert_eq('n14: the past plan is pasado with nobody sin_avisar',
  $q$SELECT (pg_temp.plan_estado(pg_temp.j('est1'), 'pl_p') ->> 'pasado') || '|' || pg_temp.estados(pg_temp.j('est1'), 'pl_p')
            || '|' || (pg_temp.plan_estado(pg_temp.j('est1'), 'pl_p') ->> 'por_enviar')$q$, 'true||0');
SELECT pg_temp.assert_raises('n15: more than 400 plans is demasiados',
  $q$SELECT public.dps_avisos_pendientes(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 401)))$q$, '22023', 'demasiados');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('n16: a non-planner cannot read the pending notices',
  $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('n16: nor send them',
  $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('n16: nor read the states',
  $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('n16: nor who blocked a date',
  $q$SELECT count(*) FROM public.dps_personas_bloqueadas(pg_temp.plan('pl_a'))$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('n17: nothing was written by the reads and the refusals',
  $q$SELECT count(*)::text FROM public.dps_avisos v WHERE v.plan_id IN (pg_temp.plan('pl_a'), pg_temp.plan('pl_b'), pg_temp.plan('pl_p'))$q$, '0');

-- ── e. sending ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('env1', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a', 'pl_p'))::text$q$);
SELECT pg_temp.assert_eq('e1: every new invitation goes at once',
  $q$SELECT concat_ws('|', pg_temp.j('env1') ->> 'enviados', pg_temp.j('env1') ->> 'nuevas', pg_temp.j('env1') ->> 'cambios',
                      pg_temp.j('env1') ->> 'quitados', pg_temp.j('env1') ->> 'cerrados')$q$,
  (7 + pg_temp.n('extra_a')) || '|' || (7 + pg_temp.n('extra_a')) || '|0|0|0');
RESET ROLE;
SELECT pg_temp.assert_eq('e2: one pendiente notice per person in pl_a, sent by PLAN; none in the past plan, none for Juan or Pedro',
  $q$SELECT string_agg(u.apellido || ':' || v.estado || ':' || (v.enviado_por = pg_temp.id('us', 1)) || ':' || v.quitado || ':' || v.cambio,
                       ',' ORDER BY u.apellido)
            || '|' || (SELECT count(*) FROM public.dps_avisos x WHERE x.plan_id = pg_temp.plan('pl_p'))
       FROM public.dps_avisos v JOIN public.usuarios u ON u.id = v.persona_id
      WHERE v.plan_id = pg_temp.plan('pl_a') AND u.id::text LIKE 'da5e0000-%'$q$,
  'U04:pendiente:true:false:false,U05:pendiente:true:false:false,U06:pendiente:true:false:false,U07:pendiente:true:false:false,'
  || 'U08:pendiente:true:false:false,U10:pendiente:true:false:false,U11:pendiente:true:false:false|0');
SELECT pg_temp.assert_eq('e3: the snapshot keeps the fecha, horarios, llegada and sorted claves',
  $q$SELECT concat_ws('|', v.fecha, v.horarios::text = pg_temp.ctx('hor_a'), to_char(v.llegada, 'HH24:MI') = pg_temp.ctx('lleg_a'),
                      v.claves::text = '{p:' || pg_temp.ctx('pu_cam') || '}')
       FROM public.dps_avisos v WHERE v.persona_id = pg_temp.id('us', 4) AND v.plan_id = pg_temp.plan('pl_a')$q$,
  '2096-05-06|t|t|t');
INSERT INTO t_dav_ctx (k, v) VALUES ('snap_e', pg_temp.snap());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e4: a second send sends nothing',
  $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a', 'pl_p')) ->> 'enviados'$q$, '0');
SELECT pg_temp.put('pend2', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('e5: nothing pending; everyone is sin_cambios',
  $q$SELECT concat_ws('|', pg_temp.j('pend2') ->> 'total', pg_temp.quienes(pg_temp.j('pend2') -> 'nuevas'),
                      pg_temp.j('pend2') -> 'no_reciben' ->> 'sin_cambios')$q$,
  '0||' || (7 + pg_temp.n('extra_a')));
SELECT pg_temp.put('est2', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('e6: the plan state: everyone pendiente, nothing to send',
  $q$SELECT pg_temp.estados(pg_temp.j('est2'), 'pl_a') || '|' || (pg_temp.j('est2') ->> 'por_enviar')$q$,
  'U04:pendiente,U05:pendiente,U06:pendiente,U07:pendiente,U08:pendiente,U10:pendiente,U11:pendiente|0');
RESET ROLE;
SELECT pg_temp.assert_eq('e7: the second send changed no row', $q$SELECT (pg_temp.snap() = pg_temp.ctx('snap_e'))::text$q$, 'true');

-- ── s. the person ────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.put('mis1', $q$SELECT public.dps_mis_servicios()::text$q$);
SELECT pg_temp.assert_eq('s1: Ana sees her service: plan, roles, estado, who sent it; one to answer; no notices',
  $q$SELECT concat_ws('|', pg_temp.de_planes(pg_temp.j('mis1') -> 'servicios'),
                      pg_temp.roles(pg_temp.j('mis1') -> 'servicios' -> 0 -> 'roles'),
                      pg_temp.j('mis1') -> 'servicios' -> 0 ->> 'estado', pg_temp.j('mis1') -> 'servicios' -> 0 ->> 'enviado_por',
                      pg_temp.j('mis1') -> 'servicios' -> 0 ->> 'titulo', pg_temp.j('mis1') ->> 'por_responder',
                      jsonb_array_length(pg_temp.j('mis1') -> 'avisos'), pg_temp.j('mis1') ->> 'fechas_bloqueadas')$q$,
  'pl_a|puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false|pendiente|ZZ Dav U01|ZZ Dav A|1|0|0');
SELECT pg_temp.assert_eq('s2: Ana confirms; a motivo with confirmo is dropped',
  $q$SELECT concat_ws('|', r ->> 'estado', coalesce(r ->> 'motivo', '-'), r ->> 'respondido_at' IS NOT NULL, r ->> 'cambio')
       FROM public.dps_responder(pg_temp.plan('pl_a'), 'confirmo', 'no importa') r$q$, 'confirmo|-|t|false');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('s3: Oscar cannot: the motivo is trimmed',
  $q$SELECT concat_ws('|', r ->> 'estado', r ->> 'motivo')
       FROM public.dps_responder(pg_temp.plan('pl_a'), 'no_puede', '  Viaje a Carora  ') r$q$, 'no_puede|Viaje a Carora');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('s4: Luis confirms',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'confirmo') ->> 'estado'$q$, 'confirmo');
RESET ROLE;
INSERT INTO t_dav_ctx (k, v) VALUES ('snap_s', pg_temp.snap());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('s5: a motivo over 300 is motivo_invalido',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'no_puede', repeat('x', 301))$q$, '22023', 'motivo_invalido');
SELECT pg_temp.assert_raises('s5: an unknown answer is respuesta_invalida',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'tal_vez')$q$, '22023', 'respuesta_invalida');
SELECT pg_temp.assert_raises('s5: a null answer is respuesta_invalida',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), NULL)$q$, '22023', 'respuesta_invalida');
SELECT pg_temp.assert_raises('s5: Ana has no notice in pl_b',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_b'), 'confirmo')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('s6: someone else cannot answer in the plan',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'no_puede', 'x')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('s6: nor open it',
  $q$SELECT public.dps_mi_servicio(pg_temp.plan('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('s6: nor see it among their services',
  $q$SELECT jsonb_array_length(public.dps_mis_servicios() -> 'servicios')::text$q$, '0');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('s7: Juan, assigned and replaced before any notice, cannot answer',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'confirmo')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('s7: nor open the plan',
  $q$SELECT public.dps_mi_servicio(pg_temp.plan('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('s8: without a session',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'confirmo')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('s8: without a session, no services',
  $q$SELECT public.dps_mis_servicios()$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('s9: the refused answers changed nothing and created no notice',
  $q$SELECT (pg_temp.snap() = pg_temp.ctx('snap_s'))::text || '|'
            || (SELECT count(*) FROM public.dps_avisos v WHERE v.persona_id IN (pg_temp.id('us', 2), pg_temp.id('us', 9)))$q$, 'true|0');
SELECT pg_temp.assert_eq('s10: the answers are stored',
  $q$SELECT concat_ws('|', (pg_temp.aviso(5, 'pl_a') ->> 'estado'), coalesce((pg_temp.aviso(5, 'pl_a') ->> 'motivo'), '-'),
                      (pg_temp.aviso(8, 'pl_a') ->> 'estado'), (pg_temp.aviso(8, 'pl_a') ->> 'motivo'),
                      (pg_temp.aviso(8, 'pl_a') ->> 'respondido_at') IS NOT NULL)$q$, 'confirmo|-|no_puede|Viaje a Carora|t');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.put('det1', $q$SELECT public.dps_mi_servicio(pg_temp.plan('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('s11: the companions: notified people, only confirmó or not, «yo» for Ana',
  $q$SELECT string_agg(right(e ->> 'nombre', 3) || ':' || (e ->> 'confirmo') || ':' || (e ->> 'yo'), ',' ORDER BY e ->> 'nombre')
       FROM jsonb_array_elements(pg_temp.j('det1') -> 'companeros') e WHERE e ->> 'persona_id' LIKE 'da5e0000-%'$q$,
  'U04:false:false,U05:true:true,U06:true:false,U07:false:false,U08:false:false,U10:false:false,U11:false:false');
SELECT pg_temp.assert_eq('s12: another person''s no_puede and motivo never leave the database',
  $q$SELECT (pg_temp.ctx('det1') LIKE '%no_puede%' OR pg_temp.ctx('det1') LIKE '%Carora%' OR pg_temp.ctx('det1') LIKE '%motivo":"V%')::text
            || '|' || (SELECT count(*) FROM jsonb_array_elements(pg_temp.j('det1') -> 'companeros') e
                        WHERE e ? 'estado' OR e ? 'motivo')$q$, 'false|0');
SELECT pg_temp.assert_eq('s13: counts, her own service, the order, not past',
  $q$SELECT concat_ws('|', pg_temp.j('det1') ->> 'personas', pg_temp.j('det1') ->> 'confirmaron',
                      pg_temp.j('det1') -> 'servicio' ->> 'estado', pg_temp.j('det1') ->> 'pasado',
                      (SELECT string_agg(o ->> 'titulo', ',') FROM jsonb_array_elements(pg_temp.j('det1') -> 'orden') o))$q$,
  (7 + pg_temp.n('extra_a')) || '|2|confirmo|false|ZZ Dav Bienvenida');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('est3', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('s14: the planner sees confirmó, no puede and its motivo',
  $q$SELECT pg_temp.estados(pg_temp.j('est3'), 'pl_a') || '|'
            || (pg_temp.de(pg_temp.plan_estado(pg_temp.j('est3'), 'pl_a') -> 'personas', 8) ->> 'motivo')$q$,
  'U04:pendiente,U05:confirmo,U06:confirmo,U07:pendiente,U08:no_puede,U10:pendiente,U11:pendiente|Viaje a Carora');
RESET ROLE;

-- A notice of a past plan (written directly: the send ignores past plans).
INSERT INTO public.dps_avisos (plan_id, persona_id, claves, roles, fecha, horarios, llegada)
VALUES (pg_temp.plan('pl_p'), pg_temp.id('us', 5), ARRAY['p:' || pg_temp.ctx('pu_cam')], '[]'::jsonb, DATE '2001-05-06',
        '["09:15"]'::jsonb, '07:00');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('s15: a past plan cannot be answered',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_p'), 'confirmo')$q$, '22023', 'plan_pasado');
SELECT pg_temp.assert_eq('s16: Mis servicios leaves the past plan out; its detail still opens, pasado',
  $q$SELECT pg_temp.de_planes(public.dps_mis_servicios() -> 'servicios') || '|'
            || (public.dps_mi_servicio(pg_temp.plan('pl_p')) ->> 'pasado')$q$, 'pl_a|true');
RESET ROLE;
SELECT pg_temp.assert_eq('s17: the past notice is still pendiente',
  $q$SELECT (pg_temp.aviso(5, 'pl_p') ->> 'estado')$q$, 'pendiente');

-- ── c. changes after the notice ──────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
-- Pedro2 out and back before sending: nothing.
SELECT pg_temp.put('y1', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 4))::text$q$);
SELECT pg_temp.put('y2', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 4))::text$q$);
-- Luis from Audio to Cámara; Hugo (pendiente) and Oscar (no_puede) out.
SELECT pg_temp.put('y3', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_aud'), pg_temp.id('us', 6))::text$q$);
SELECT pg_temp.put('y4', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 6))::text$q$);
SELECT pg_temp.put('y5', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 7))::text$q$);
SELECT pg_temp.put('y6', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('us', 8))::text$q$);
SELECT pg_temp.put('pend3', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a'))::text$q$);
-- total counts Oscar's closure too (L67): 2 notices + 1 closure.
SELECT pg_temp.assert_eq('c1: out and back before sending leaves nothing; Luis is a change, Hugo taken out, Oscar closes silently',
  $q$SELECT concat_ws('|', pg_temp.quienes(pg_temp.j('pend3') -> 'nuevas'), pg_temp.quienes(pg_temp.j('pend3') -> 'cambios'),
                      pg_temp.quienes(pg_temp.j('pend3') -> 'quitados'),
                      pg_temp.quienes(pg_temp.j('pend3') -> 'no_reciben' -> 'ya_respondieron'), pg_temp.j('pend3') ->> 'total')$q$,
  '|U06|U07|U08|3');
SELECT pg_temp.assert_eq('c2: Luis: before and now, asks again; Hugo: the role he had',
  $q$SELECT concat_ws('|', pg_temp.roles(pg_temp.de(pg_temp.j('pend3') -> 'cambios', 6) -> 'roles_antes'),
                      pg_temp.roles(pg_temp.de(pg_temp.j('pend3') -> 'cambios', 6) -> 'roles'),
                      pg_temp.de(pg_temp.j('pend3') -> 'cambios', 6) ->> 'reinicia', pg_temp.de(pg_temp.j('pend3') -> 'cambios', 6) ->> 'estado',
                      coalesce(pg_temp.de(pg_temp.j('pend3') -> 'cambios', 6) ->> 'horarios_antes', '-'),
                      pg_temp.roles(pg_temp.de(pg_temp.j('pend3') -> 'quitados', 7) -> 'roles'))$q$,
  'puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false|puesto:ZZ Dav Cámara:ZZ Dav Equipo:ZZ Dav Dirección:false|true|confirmo|-|'
  || 'puesto:ZZ Dav Cámara:ZZ Dav Equipo:ZZ Dav Dirección:false');
SELECT pg_temp.put('est4', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('c3: the plan state before sending: Luis sin_avisar (was confirmo, roles_antes), Hugo quitado, Oscar gone but counted',
  $q$SELECT pg_temp.estados(pg_temp.j('est4'), 'pl_a') || '|'
            || (pg_temp.de(pg_temp.plan_estado(pg_temp.j('est4'), 'pl_a') -> 'personas', 6) ->> 'estado_aviso') || '|'
            || pg_temp.roles(pg_temp.de(pg_temp.plan_estado(pg_temp.j('est4'), 'pl_a') -> 'personas', 6) -> 'roles_antes') || '|'
            || (pg_temp.plan_estado(pg_temp.j('est4'), 'pl_a') ->> 'por_enviar')$q$,
  'U04:pendiente,U05:confirmo,U06:sin_avisar,U07:quitado,U10:pendiente,U11:pendiente|confirmo|'
  || 'puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false|3');

-- Irene replaces Oscar in Cámara; the hours change for everyone.
SELECT pg_temp.put('y7', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_cam'), pg_temp.id('se', 14))::text$q$);
SELECT pg_temp.put('y8', $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('pl_a'), '["10:07"]'::jsonb, '08:07')::text$q$);
SELECT pg_temp.put('pend4', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('c4: Irene is new and replaces Oscar; every notified one still assigned has a change',
  $q$SELECT concat_ws('|', pg_temp.quienes(pg_temp.j('pend4') -> 'nuevas'),
                      pg_temp.de(pg_temp.j('pend4') -> 'nuevas', 14) ->> 'reemplaza',
                      pg_temp.quienes(pg_temp.j('pend4') -> 'cambios'))$q$,
  'U14|["ZZ Dav U08"]|U04,U05,U06,U10,U11');
SELECT pg_temp.assert_eq('c5: only Luis asks again; Ana keeps confirmo with the hours before and now',
  $q$SELECT (SELECT string_agg(right(e ->> 'nombre', 3) || ':' || (e ->> 'reinicia'), ',' ORDER BY e ->> 'nombre')
               FROM jsonb_array_elements(pg_temp.j('pend4') -> 'cambios') e WHERE e ->> 'persona_id' LIKE 'da5e0000-%')
            || '|' || concat_ws('|', pg_temp.de(pg_temp.j('pend4') -> 'cambios', 5) ->> 'estado',
                                (pg_temp.de(pg_temp.j('pend4') -> 'cambios', 5) -> 'horarios_antes')::text = pg_temp.ctx('hor_a'),
                                pg_temp.de(pg_temp.j('pend4') -> 'cambios', 5) ->> 'horarios',
                                pg_temp.de(pg_temp.j('pend4') -> 'cambios', 5) ->> 'llegada',
                                coalesce(pg_temp.de(pg_temp.j('pend4') -> 'cambios', 5) ->> 'roles_antes', '-'))$q$,
  'U04:false,U05:false,U06:true,U10:false,U11:false|confirmo|t|["10:07"]|08:07|-');
SELECT pg_temp.put('env2', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('c6: sent: 1 new, the changes, 1 taken out, 1 closed silently',
  $q$SELECT concat_ws('|', pg_temp.j('env2') ->> 'nuevas', pg_temp.j('env2') ->> 'cambios', pg_temp.j('env2') ->> 'quitados',
                      pg_temp.j('env2') ->> 'cerrados', pg_temp.j('env2') ->> 'enviados')$q$,
  '1|' || (5 + pg_temp.n('extra_a')) || '|1|1|' || (7 + pg_temp.n('extra_a')));
SELECT pg_temp.assert_eq('c7: a second send sends nothing',
  $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a')) ->> 'enviados'$q$, '0');
RESET ROLE;
SELECT pg_temp.assert_eq('c8: Ana: hours only, still confirmo, cambio, unseen, with the hours before',
  $q$SELECT concat_ws('|', (pg_temp.aviso(5, 'pl_a') ->> 'estado'), (pg_temp.aviso(5, 'pl_a') ->> 'respondido_at') IS NOT NULL,
                      (pg_temp.aviso(5, 'pl_a') ->> 'cambio'), (pg_temp.aviso(5, 'pl_a') ->> 'visto_at') IS NULL,
                      (pg_temp.aviso(5, 'pl_a') ->> 'horarios')::text, (pg_temp.aviso(5, 'pl_a') ->> 'horarios_antes')::text = pg_temp.ctx('hor_a'),
                      left(pg_temp.aviso(5, 'pl_a') ->> 'llegada_antes', 5) = pg_temp.ctx('lleg_a'),
                      coalesce((pg_temp.aviso(5, 'pl_a') ->> 'roles_antes')::text, '-'))$q$,
  'confirmo|t|true|t|["10:07"]|t|t|-');
SELECT pg_temp.assert_eq('c9: Luis: another puesto, back to pendiente, answer cleared, roles before kept',
  $q$SELECT concat_ws('|', (pg_temp.aviso(6, 'pl_a') ->> 'estado'), (pg_temp.aviso(6, 'pl_a') ->> 'respondido_at') IS NULL,
                      (pg_temp.aviso(6, 'pl_a') ->> 'cambio'), pg_temp.roles(pg_temp.aviso(6, 'pl_a') -> 'roles'),
                      pg_temp.roles(pg_temp.aviso(6, 'pl_a') -> 'roles_antes'))$q$,
  'pendiente|t|true|puesto:ZZ Dav Cámara:ZZ Dav Equipo:ZZ Dav Dirección:false|puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false');
SELECT pg_temp.assert_eq('c10: Hugo quitado and unseen; Oscar quitado, already seen, his answer kept; Irene pendiente',
  $q$SELECT concat_ws('|', (pg_temp.aviso(7, 'pl_a') ->> 'quitado'), (pg_temp.aviso(7, 'pl_a') ->> 'visto_at') IS NULL,
                      (pg_temp.aviso(8, 'pl_a') ->> 'quitado'), (pg_temp.aviso(8, 'pl_a') ->> 'visto_at') IS NOT NULL,
                      (pg_temp.aviso(8, 'pl_a') ->> 'estado'), (pg_temp.aviso(8, 'pl_a') ->> 'motivo'), (pg_temp.aviso(14, 'pl_a') ->> 'estado'))$q$,
  'true|t|true|t|no_puede|Viaje a Carora|pendiente');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.put('mis2', $q$SELECT public.dps_mis_servicios()::text$q$);
SELECT pg_temp.assert_eq('c11: Ana sees «Cambió tu servicio»: the hours now and before, still confirmo',
  $q$SELECT concat_ws('|', pg_temp.de_planes(pg_temp.j('mis2') -> 'avisos'), pg_temp.j('mis2') -> 'avisos' -> 0 ->> 'estado',
                      pg_temp.j('mis2') -> 'avisos' -> 0 ->> 'horarios',
                      (pg_temp.j('mis2') -> 'avisos' -> 0 -> 'antes' -> 'horarios')::text = pg_temp.ctx('hor_a'),
                      pg_temp.j('mis2') -> 'avisos' -> 0 ->> 'cambio', pg_temp.j('mis2') ->> 'por_responder')$q$,
  'pl_a|confirmo|["10:07"]|t|true|0');
SELECT pg_temp.assert_eq('c12: «Entendido» dismisses it',
  $q$SELECT public.dps_aviso_visto(pg_temp.plan('pl_a'))::text$q$, 'true');
SELECT pg_temp.assert_eq('c12: the notice is gone; the service stays confirmed',
  $q$SELECT jsonb_array_length(public.dps_mis_servicios() -> 'avisos')
            || '|' || (public.dps_mis_servicios() -> 'servicios' -> 0 ->> 'estado')$q$, '0|confirmo');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('c13: Luis gets a card to answer again (no separate notice), with the puesto before',
  $q$SELECT concat_ws('|', jsonb_array_length(public.dps_mis_servicios() -> 'avisos'), public.dps_mis_servicios() ->> 'por_responder',
                      pg_temp.roles(public.dps_mis_servicios() -> 'servicios' -> 0 -> 'antes' -> 'roles'))$q$,
  '0|1|puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false');
SELECT pg_temp.assert_eq('c14: an answer clears cambio',
  $q$SELECT (public.dps_responder(pg_temp.plan('pl_a'), 'confirmo') ->> 'cambio')$q$, 'false');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.put('mis3', $q$SELECT public.dps_mis_servicios()::text$q$);
SELECT pg_temp.assert_eq('c15: Hugo: no service, «Ya no estás programado» with the role he had',
  $q$SELECT concat_ws('|', jsonb_array_length(pg_temp.j('mis3') -> 'servicios'), pg_temp.de_planes(pg_temp.j('mis3') -> 'avisos'),
                      pg_temp.j('mis3') -> 'avisos' -> 0 ->> 'quitado', pg_temp.roles(pg_temp.j('mis3') -> 'avisos' -> 0 -> 'roles'))$q$,
  '0|pl_a|true|puesto:ZZ Dav Cámara:ZZ Dav Equipo:ZZ Dav Dirección:false');
SELECT pg_temp.assert_raises('c16: Hugo, taken out, cannot open the plan',
  $q$SELECT public.dps_mi_servicio(pg_temp.plan('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c16: nor answer it',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_a'), 'confirmo')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('c17: «Entendido» dismisses it',
  $q$SELECT public.dps_aviso_visto(pg_temp.plan('pl_a'))::text$q$, 'true');
SELECT pg_temp.assert_eq('c17: the notice is gone',
  $q$SELECT jsonb_array_length(public.dps_mis_servicios() -> 'avisos')::text$q$, '0');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('c18: Oscar (said no) gets no notice',
  $q$SELECT jsonb_array_length(public.dps_mis_servicios() -> 'avisos') || '|' || jsonb_array_length(public.dps_mis_servicios() -> 'servicios')$q$,
  '0|0');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('c19: someone without a notice cannot dismiss one',
  $q$SELECT public.dps_aviso_visto(pg_temp.plan('pl_a'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('y9', $q$SELECT public.dps_convocar(pg_temp.plan('pl_a'), pg_temp.plan('pu_aud'), pg_temp.id('se', 7))::text$q$);
SELECT pg_temp.assert_eq('c20: Hugo back in after quitado is a new invitation',
  $q$SELECT pg_temp.quienes(public.dps_avisos_pendientes(pg_temp.planes('pl_a')) -> 'nuevas')$q$, 'U07');
SELECT pg_temp.assert_eq('c20: sent',
  $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_a')) ->> 'nuevas'$q$, '1');
SELECT pg_temp.put('est5', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_a'))::text$q$);
SELECT pg_temp.assert_eq('c21: the plan state after: Oscar is gone, Hugo pendiente again, nothing to send',
  $q$SELECT pg_temp.estados(pg_temp.j('est5'), 'pl_a') || '|' || (pg_temp.j('est5') ->> 'por_enviar')$q$,
  'U04:pendiente,U05:confirmo,U06:confirmo,U07:pendiente,U10:pendiente,U11:pendiente,U14:pendiente|0');
RESET ROLE;
SELECT pg_temp.assert_eq('c22: Hugo''s notice starts over',
  $q$SELECT concat_ws('|', (pg_temp.aviso(7, 'pl_a') ->> 'quitado'), (pg_temp.aviso(7, 'pl_a') ->> 'estado'), (pg_temp.aviso(7, 'pl_a') ->> 'visto_at') IS NULL,
                      (pg_temp.aviso(7, 'pl_a') ->> 'cambio'), pg_temp.roles(pg_temp.aviso(7, 'pl_a') -> 'roles'))$q$,
  'false|pendiente|t|false|puesto:ZZ Dav Audio:ZZ Dav Equipo:ZZ Dav Dirección:false');

-- ── d. a closure alone (L67) ─────────────────────────────────────────
-- Juan is notified in pl_c, says no_puede and is taken out: closing his
-- notice is the only pending change, and it must still be sent.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('pl_c', $q$SELECT public.dps_plan_crear(DATE '2096-05-20', 'especial', 'ZZ Dav C')::text$q$);
SELECT pg_temp.put('z1', $q$SELECT public.dps_convocar(pg_temp.plan('pl_c'), pg_temp.plan('pu_aud'), pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('z2', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_c')) ->> 'nuevas'$q$);
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d1: Juan says no_puede in pl_c',
  $q$SELECT public.dps_responder(pg_temp.plan('pl_c'), 'no_puede', 'ZZ Dav Viaje') ->> 'estado'$q$, 'no_puede');
SELECT pg_temp.assert_eq('d1: Juan still sees pl_c among his services',
  $q$SELECT pg_temp.de_planes(public.dps_mis_servicios() -> 'servicios')$q$, 'pl_c');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('z3', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_c'), pg_temp.plan('pu_aud'), pg_temp.id('us', 2))::text$q$);
SELECT pg_temp.put('pend_d', $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_c'))::text$q$);
SELECT pg_temp.assert_eq('d2: the closure is the only pending change and counts in total',
  $q$SELECT concat_ws('|', pg_temp.j('pend_d') ->> 'total', pg_temp.quienes(pg_temp.j('pend_d') -> 'nuevas'),
                      pg_temp.quienes(pg_temp.j('pend_d') -> 'cambios'), pg_temp.quienes(pg_temp.j('pend_d') -> 'quitados'),
                      pg_temp.quienes(pg_temp.j('pend_d') -> 'no_reciben' -> 'ya_respondieron'))$q$, '1||||U02');
SELECT pg_temp.put('est_d', $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_c'))::text$q$);
SELECT pg_temp.assert_eq('d3: por_enviar counts it (global and per plan); Juan is not a row of the plan',
  $q$SELECT concat_ws('|', pg_temp.j('est_d') ->> 'por_enviar', pg_temp.plan_estado(pg_temp.j('est_d'), 'pl_c') ->> 'por_enviar',
                      pg_temp.estados(pg_temp.j('est_d'), 'pl_c'))$q$, '1|1|U11:pendiente');
SELECT pg_temp.put('env_d', $q$SELECT public.dps_avisos_enviar(pg_temp.planes('pl_c'))::text$q$);
SELECT pg_temp.assert_eq('d4: sending closes it: cerrados 1, enviados 0',
  $q$SELECT concat_ws('|', pg_temp.j('env_d') ->> 'cerrados', pg_temp.j('env_d') ->> 'enviados', pg_temp.j('env_d') ->> 'nuevas',
                      pg_temp.j('env_d') ->> 'cambios', pg_temp.j('env_d') ->> 'quitados')$q$, '1|0|0|0|0');
SELECT pg_temp.assert_eq('d5: afterwards nothing is pending',
  $q$SELECT public.dps_avisos_pendientes(pg_temp.planes('pl_c')) ->> 'total'$q$, '0');
SELECT pg_temp.assert_eq('d5: nor in the plan state',
  $q$SELECT public.dps_avisos_estado(pg_temp.planes('pl_c')) ->> 'por_enviar'$q$, '0');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d6: Juan no longer sees pl_c, and gets no «Ya no estás programado»',
  $q$SELECT pg_temp.de_planes(public.dps_mis_servicios() -> 'servicios') || '|' || pg_temp.de_planes(public.dps_mis_servicios() -> 'avisos')$q$, '|');
RESET ROLE;
SELECT pg_temp.assert_eq('d7: his notice is quitado, seen, with his answer kept',
  $q$SELECT concat_ws('|', (pg_temp.aviso(2, 'pl_c') ->> 'quitado'), (pg_temp.aviso(2, 'pl_c') ->> 'visto_at') IS NOT NULL,
                      (pg_temp.aviso(2, 'pl_c') ->> 'estado'), (pg_temp.aviso(2, 'pl_c') ->> 'motivo'))$q$, 'true|t|no_puede|ZZ Dav Viaje');

-- ── b. blocked dates ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(12);
SELECT pg_temp.put('bl_bloq', $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-05-01', DATE '2096-05-10', '  ZZ Dav Viaje  ')::text$q$);
SELECT pg_temp.assert_eq('b1: a range with its nota trimmed; no conflicts for someone not notified',
  $q$SELECT concat_ws('|', pg_temp.j('bl_bloq') ->> 'desde', pg_temp.j('bl_bloq') ->> 'hasta', pg_temp.j('bl_bloq') ->> 'nota',
                      jsonb_array_length(pg_temp.j('bl_bloq') -> 'conflictos'))$q$, '2096-05-01|2096-05-10|ZZ Dav Viaje|0');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.put('bl_ana', $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-05-06', DATE '2096-05-06', NULL)::text$q$);
SELECT pg_temp.assert_eq('b2: Ana blocks a date where she serves: the conflict is listed, as confirmo',
  $q$SELECT concat_ws('|', pg_temp.de_planes(pg_temp.j('bl_ana') -> 'conflictos'), pg_temp.j('bl_ana') -> 'conflictos' -> 0 ->> 'estado',
                      coalesce(pg_temp.j('bl_ana') ->> 'nota', '-'))$q$, 'pl_a|confirmo|-');
RESET ROLE;
SELECT pg_temp.assert_eq('b3: S13.6: nothing was answered for her',
  $q$SELECT (pg_temp.aviso(5, 'pl_a') ->> 'estado') || '|' || coalesce((pg_temp.aviso(5, 'pl_a') ->> 'motivo'), '-')$q$, 'confirmo|-');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('b4: desde after hasta is rango_invalido',
  $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-05-10', DATE '2096-05-01', NULL)$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('b4: 367 days is rango_invalido',
  $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-01-01', DATE '2097-01-02', NULL)$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('b4: a range that ended is fecha_pasada',
  $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2001-01-01', DATE '2001-01-02', NULL)$q$, '22023', 'fecha_pasada');
SELECT pg_temp.assert_raises('b4: a missing date is fecha_invalida',
  $q$SELECT public.dps_fecha_bloqueada_agregar(NULL, DATE '2096-01-02', NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('b4: a nota over 200 is nota_invalida',
  $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-07-01', DATE '2096-07-01', repeat('x', 201))$q$, '22023', 'nota_invalida');
SELECT pg_temp.assert_eq('b5: the refused ones added nothing',
  $q$SELECT jsonb_array_length(public.dps_mis_fechas_bloqueadas())::text$q$, '1');
SELECT pg_temp.put('bl_366', $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-01-01', DATE '2097-01-01', NULL) ->> 'id'$q$);
SELECT pg_temp.assert_eq('b6: 366 days is fine (and removable)',
  $q$SELECT public.dps_fecha_bloqueada_quitar(pg_temp.ctx('bl_366')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_eq('b7: the same range again updates its nota, same row',
  $q$SELECT concat_ws('|', r ->> 'id' = pg_temp.j('bl_ana') ->> 'id', r ->> 'nota', jsonb_array_length(public.dps_mis_fechas_bloqueadas()))
       FROM public.dps_fecha_bloqueada_agregar(DATE '2096-05-06', DATE '2096-05-06', 'ZZ Dav Boda') r$q$, 't|ZZ Dav Boda|1');
SELECT pg_temp.assert_eq('b8: Mis fechas: only her own, with the conflict; Mis servicios counts it',
  $q$SELECT concat_ws('|', (SELECT string_agg((b ->> 'desde') || ':' || (b ->> 'nota'), ',') FROM jsonb_array_elements(public.dps_mis_fechas_bloqueadas()) b),
                      pg_temp.de_planes(public.dps_mis_fechas_bloqueadas() -> 0 -> 'conflictos'),
                      public.dps_mis_servicios() ->> 'fechas_bloqueadas')$q$, '2096-05-06:ZZ Dav Boda|pl_a|1');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b9: the planner sees who blocked the plan''s date (and may still pick them)',
  $q$SELECT string_agg(right(u.apellido, 3) || ':' || coalesce(b.nota, '-'), ',' ORDER BY u.apellido)
       FROM public.dps_personas_bloqueadas(pg_temp.plan('pl_a')) b
       JOIN (SELECT pg_temp.id('us', n) AS id, 'U' || lpad(n::text, 2, '0') AS apellido FROM generate_series(1, 14) n) u ON u.id = b.persona_id$q$,
  'U05:ZZ Dav Boda,U12:ZZ Dav Viaje');
SELECT pg_temp.assert_eq('b9: nobody of the fixture blocked pl_b',
  $q$SELECT count(*)::text FROM public.dps_personas_bloqueadas(pg_temp.plan('pl_b')) b WHERE b.persona_id::text LIKE 'da5e0000-%'$q$, '0');
SELECT pg_temp.assert_raises('b9: an unknown plan is plan_invalido',
  $q$SELECT count(*) FROM public.dps_personas_bloqueadas(gen_random_uuid())$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('b10: Ana cannot remove BLOQ''s range',
  $q$SELECT public.dps_fecha_bloqueada_quitar((pg_temp.j('bl_bloq') ->> 'id')::uuid)$q$, '22023', 'bloqueo_invalido');
SELECT pg_temp.assert_eq('b11: Ana removes her own',
  $q$SELECT public.dps_fecha_bloqueada_quitar((pg_temp.j('bl_ana') ->> 'id')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_eq('b11: and it is gone',
  $q$SELECT jsonb_array_length(public.dps_mis_fechas_bloqueadas())::text$q$, '0');
SELECT pg_temp.assert_raises('b11: removing it twice is bloqueo_invalido',
  $q$SELECT public.dps_fecha_bloqueada_quitar((pg_temp.j('bl_ana') ->> 'id')::uuid)$q$, '22023', 'bloqueo_invalido');
SELECT pg_temp.as_persona(12);
SELECT pg_temp.assert_eq('b12: BLOQ still has hers',
  $q$SELECT string_agg((b ->> 'desde') || ':' || (b ->> 'nota'), ',') FROM jsonb_array_elements(public.dps_mis_fechas_bloqueadas()) b$q$,
  '2096-05-01:ZZ Dav Viaje');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('b13: without a session',
  $q$SELECT public.dps_mis_fechas_bloqueadas()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b13: without a session, no adding',
  $q$SELECT public.dps_fecha_bloqueada_agregar(DATE '2096-07-01', DATE '2096-07-01', NULL)$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('b14: the rows left: only BLOQ''s',
  $q$SELECT string_agg(u.apellido || ':' || b.desde || ':' || b.hasta, ',' ORDER BY u.apellido)
       FROM public.dream_team_fechas_bloqueadas b JOIN public.usuarios u ON u.id = b.persona_id
      WHERE u.id::text LIKE 'da5e0000-%'$q$, 'U12:2096-05-01:2096-05-10');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dav_failures);
END;
$$;
