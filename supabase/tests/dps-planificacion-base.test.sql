-- T8a (odd/tasks/dps-asistencia-pco.md, S6, S7.1-S7.3) — DPS planning schema,
-- authority and RPCs (20261108200000_dps_planificacion_base.sql and
-- 20261108201000_dps_planificacion_rpcs.sql).
--
-- Covers:
--   a. Privileges: the six tables are not readable by authenticated; anon
--      executes no dps_* function; authenticated cannot execute the internal
--      helpers; every dps_* function is SECURITY DEFINER with search_path '';
--      the dps-series bucket exists and is public; the config row exists.
--   b. Flags: dps_puede_planificar (admin, DPS director yes; sub-director,
--      coordinator, servidor, random no), dps_puede_ver (also sub-director,
--      coordinator and DPS servidor; not a Niños servidor nor random),
--      dps_puede_pasar_asistencia (sub-director and coordinator only in their
--      own subtree; not for an equipo outside DPS, including Próximo Paso-like
--      nodes of another experiencia under DPS and inactive ones). Without a
--      session everything is false and writes are sin_autoridad.
--   c. Planificadores: only a planner adds or removes; idempotent; unknown
--      persona; an added planner plans, a removed one no longer does.
--   d. Pasan asistencia: disabling an equipo disables its subtree, a child
--      row overrides it, NULL inherits again; planners are not affected; only
--      planners write; equipo outside DPS rejected.
--   e. Puestos: create with automatic orden, duplicate name (case and spaces)
--      in the same equipo rejected, same name in another equipo allowed,
--      validations, edit, edit into a duplicate, deactivate (name reusable),
--      list by subtree, list permissions, writes only by planners.
--   f. Config: read defaults, save normalizes horarios, invalid horarios,
--      read lists planners and per-equipo attendance, only planners.
--   g. Plans: create takes horarios and llegada from config; tipo and fecha
--      validations; one domingo per date; other tipos unique per titulo.
--   h. Series: create makes N Sunday plans one week apart and attaches an
--      existing Sunday plan instead of duplicating; validations; a Sunday of
--      another series rejects the whole creation; update grows (new Sundays)
--      and shrinks (trailing plans detached, kept); cover path rules.
--   i. dps_plan_campo: persona or text (S7.3, also enforced by the table),
--      creative campos, canciones, titulo, llegada, horarios, whitelist,
--      unknown plan, only planners; updated_by is the caller.
--   j. Reads: dps_planes_rango (order, range limits, permissions) and
--      dps_plan_leer (puede_editar, unknown plan, permissions).
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id.
--
-- The fixture hangs its equipos from the real DPS node (label 'DPS' under
-- 'Dirección de Experiencia'), so the suite also checks that dps_raiz()
-- resolves it on the target database.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Dp"):
--   1 ADMIN   system admin
--   2 DIR     dream_team.direct on the DPS node
--   3 PT      dream_team.direct on ZZ Dp PT (sub-director)
--   4 COORD   dream_team.coordinate on ZZ Dp Camaras (child of PT)
--   5 PLAN    no grant; added to dps_planificadores in c
--   6 SERV    active Voluntario servicio in ZZ Dp Media
--   7 RANDOM  nothing
--   8 NINOS   active Voluntario servicio in ZZ Dp Ninos (another experiencia)
--   9, 10     people without an account (productor / host)
-- Equipos: 1 ZZ Dp PT (dps, under DPS) › 2 ZZ Dp Camaras; 3 ZZ Dp Media (dps,
-- under DPS); 4 ZZ Dp Inactivo (dps, under DPS, inactive); 5 ZZ Dp Ninos
-- (ninos, root); 6 ZZ Dp Otro (talleres_crecimiento, under DPS).
-- Sundays: dom(k) = the k-th Sunday of 2098.

BEGIN;

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dp_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dp_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dp_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dp_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dp_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9500000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd951' WHEN 'us' THEN 'd952' WHEN 'eq' THEN 'd953'
                       WHEN 'ro' THEN 'd954' WHEN 'se' THEN 'd955' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
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

-- The k-th Sunday of 2098.
CREATE OR REPLACE FUNCTION pg_temp.dom(p_k int) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT DATE '2098-01-01' + ((7 - extract(dow FROM DATE '2098-01-01')::int) % 7) + 7 * (p_k - 1);
$$;

-- The puestos the caller lists under p_equipo (NULL = all) as 'nombre:cantidad:orden', fixture ones only.
CREATE OR REPLACE FUNCTION pg_temp.puestos(p_equipo uuid) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(l.nombre || ':' || l.cantidad || ':' || l.orden, ',' ORDER BY l.ruta, l.orden, l.nombre), '')
            FROM public.dps_puestos_listar(p_equipo) l WHERE l.equipo LIKE 'ZZ Dp %');
END;
$$;

-- The plans of dom(1)..dom(8) as 'fecha-index:tipo:semana', read through the RPC.
CREATE OR REPLACE FUNCTION pg_temp.domingos() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(((p ->> 'fecha')::date - pg_temp.dom(1)) / 7 + 1 || ':' || (p ->> 'tipo') || ':'
                                     || coalesce(p ->> 'semana', '-'), ',' ORDER BY p ->> 'fecha', p ->> 'tipo'), '')
            FROM jsonb_array_elements(public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(8))) p
           WHERE extract(dow FROM (p ->> 'fecha')::date) = 0);
END;
$$;

-- dps_puede_pasar_asistencia on equipos 1 PT, 2 Camaras, 3 Media, 4 Inactivo, 5 Ninos, 6 Otro.
CREATE OR REPLACE FUNCTION pg_temp.asistencia() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(public.dps_puede_pasar_asistencia(pg_temp.id('eq', n))::text, ',' ORDER BY n) FROM generate_series(1, 6) n);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.campo(p_plan text, p_campo text, p_valor jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dps_plan_campo(pg_temp.ctx(p_plan)::uuid, p_campo, p_valor);
END;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

-- The DPS node read directly, so the RED run (no dps_raiz) still builds the fixture; a1 compares.
INSERT INTO t_dp_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dp-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 8) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), CASE WHEN n <= 8 THEN pg_temp.id('au', n) END, 'ZZ Dp', 'U' || n,
       CASE WHEN n <= 8 THEN 'dp-' || n || '@example.test' END, 'Soltero', 'Femenino'
  FROM generate_series(1, 10) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9500000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps',                  pg_temp.ctx('raiz')::uuid, 'ZZ Dp PT',       true),
  (pg_temp.id('eq', 2), 'dps',                  pg_temp.id('eq', 1),       'ZZ Dp Camaras',  true),
  (pg_temp.id('eq', 3), 'dps',                  pg_temp.ctx('raiz')::uuid, 'ZZ Dp Media',    true),
  (pg_temp.id('eq', 4), 'dps',                  pg_temp.ctx('raiz')::uuid, 'ZZ Dp Inactivo', false),
  (pg_temp.id('eq', 5), 'ninos',                NULL,                      'ZZ Dp Ninos',    true),
  (pg_temp.id('eq', 6), 'talleres_crecimiento', pg_temp.ctx('raiz')::uuid, 'ZZ Dp Otro',     true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 3), pg_temp.id('eq', 3), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 5), 'Voluntario', 'voluntario', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 6), pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 3), 'activo', now() - interval '30 days', 'admin_asignacion'),
  (pg_temp.id('se', 8), pg_temp.id('us', 8), pg_temp.id('eq', 5), pg_temp.id('ro', 5), 'activo', now() - interval '30 days', 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 10) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 2), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.ctx('raiz'),          'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 1)::text,    'zz-test'),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text,    'zz-test'),
  (pg_temp.id('us', 6), 'dream_team.serve',      'dream_team', 'equipo', pg_temp.id('eq', 3)::text,    'zz-test'),
  (pg_temp.id('us', 8), 'dream_team.serve',      'dream_team', 'equipo', pg_temp.id('eq', 5)::text,    'zz-test');

GRANT INSERT, SELECT, UPDATE ON t_dp_failures, t_dp_ctx TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

-- ── a. privileges and structure ──────────────────────────────────────

SELECT pg_temp.assert_eq('a1: the DPS node exists and dps_raiz resolves it',
  $q$SELECT (pg_temp.ctx('raiz') IS NOT NULL AND public.dps_raiz()::text = pg_temp.ctx('raiz'))::text$q$, 'true');
SELECT pg_temp.assert_eq('a2: the dps-series bucket exists and is public',
  $q$SELECT public::text FROM storage.buckets WHERE id = 'dps-series'$q$, 'true');
SELECT pg_temp.assert_eq('a3: the config row exists with the defaults',
  $q$SELECT horarios::text || '|' || llegada::text FROM public.dps_config$q$, '["09:15", "11:15"]|07:00:00');
SELECT pg_temp.assert_eq('a4: every dps_* function is SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%'
        AND NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""'])$q$, '0');
SELECT pg_temp.assert_eq('a5: anon executes no dps_* function',
  $q$SELECT coalesce(string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C"), '-') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$, '-');
SELECT pg_temp.assert_eq('a6: authenticated executes exactly the public dps_* functions',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        -- T8b (20261108202000) functions are checked by its own suite.
        AND p.proname NOT IN ('dps_convocar', 'dps_desconvocar', 'dps_copiar_plan', 'dps_plan_anterior', 'dps_candidatos_puesto',
                              'dps_plan_equipos', 'dps_asistencia_planilla', 'dps_asistencia_marcar',
                              'dps_asistencia_marcar_equipo', 'dps_historial_persona',
                              -- T11b (20261108206000), in dps-planificacion-eventos.test.sql.
                              'dps_evento_crear', 'dps_plan_mover', 'dps_plan_eliminar',
                              -- T13 (20261108208000), in dps-planificacion-orden.test.sql.
                              'dps_plan_horarios_guardar', 'dps_orden_leer', 'dps_orden_plantilla', 'dps_orden_agregar',
                              'dps_orden_item_guardar', 'dps_orden_mover', 'dps_orden_eliminar', 'dps_orden_copiar')$q$,
  'dps_config_guardar,dps_config_leer,dps_pasan_asistencia_guardar,dps_plan_campo,dps_plan_crear,dps_plan_leer,'
  || 'dps_planes_rango,dps_planificador_agregar,dps_planificador_quitar,dps_puede_pasar_asistencia,dps_puede_planificar,'
  || 'dps_puede_ver,dps_puesto_desactivar,dps_puesto_guardar,dps_puestos_listar,dps_serie_actualizar,dps_serie_crear,'
  || 'dps_serie_imagen');
SELECT pg_temp.assert_eq('a7: the tables have RLS on and no policies',
  $q$SELECT string_agg(c.relname || ':' || c.relrowsecurity || ':' || (SELECT count(*) FROM pg_policy po WHERE po.polrelid = c.oid),
                       ',' ORDER BY c.relname COLLATE "C")
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'dps\_%'
        AND c.relname NOT IN ('dps_convocados', 'dps_asistencias', 'dps_orden_items')$q$,
  'dps_config:true:0,dps_pasan_asistencia:true:0,dps_planes:true:0,dps_planificadores:true:0,dps_puestos:true:0,dps_series:true:0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_puestos', $q$SELECT count(*) FROM public.dps_puestos$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_series', $q$SELECT count(*) FROM public.dps_series$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_planes', $q$SELECT count(*) FROM public.dps_planes$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_config', $q$SELECT count(*) FROM public.dps_config$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_planificadores', $q$SELECT count(*) FROM public.dps_planificadores$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot read dps_pasan_asistencia', $q$SELECT count(*) FROM public.dps_pasan_asistencia$q$, '42501');
SELECT pg_temp.assert_raises('a8: authenticated cannot write dps_planes',
  $q$INSERT INTO public.dps_planes (fecha, tipo, horarios, llegada) VALUES (pg_temp.dom(1), 'domingo', '[]', '07:00')$q$, '42501');
SELECT pg_temp.assert_raises('a9: authenticated cannot execute dps_raiz', $q$SELECT public.dps_raiz()$q$, '42501');
SELECT pg_temp.assert_raises('a9: authenticated cannot execute dps_equipos', $q$SELECT count(*) FROM public.dps_equipos()$q$, '42501');
SELECT pg_temp.assert_raises('a9: authenticated cannot execute dps_serie_semanas',
  $q$SELECT public.dps_serie_semanas(gen_random_uuid(), 1, 1, NULL)$q$, '42501');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('a10: anon cannot execute dps_puede_ver', $q$SELECT public.dps_puede_ver()$q$, '42501');
SELECT pg_temp.assert_raises('a10: anon cannot execute dps_planes_rango',
  $q$SELECT public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(2))$q$, '42501');
SELECT pg_temp.assert_raises('a10: anon cannot execute dps_plan_crear',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(1), 'domingo', NULL)$q$, '42501');
RESET ROLE;

-- ── b. flags ─────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b1: admin plans and sees', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'true|true');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b2: the DPS director plans and sees', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'true|true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b3: the sub-director sees, does not plan', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|true');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b4: the coordinator sees, does not plan', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|true');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b5: the future planner, before being added, nothing', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('b6: a DPS servidor sees, does not plan', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|true');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('b7: a random user nothing', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|false');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('b8: a Niños servidor nothing', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'false|false');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b9: the DPS director passes attendance in every DPS equipo, never outside',
  $q$SELECT pg_temp.asistencia() || '|' || public.dps_puede_pasar_asistencia(pg_temp.ctx('raiz')::uuid)$q$,
  'true,true,true,false,false,false|true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b10: the sub-director only in their subtree', $q$SELECT pg_temp.asistencia()$q$, 'true,true,false,false,false,false');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b11: the coordinator only in their equipo', $q$SELECT pg_temp.asistencia()$q$, 'false,true,false,false,false,false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('b12: a servidor nowhere', $q$SELECT pg_temp.asistencia()$q$, 'false,false,false,false,false,false');
SELECT pg_temp.assert_eq('b13: a NULL equipo is false', $q$SELECT public.dps_puede_pasar_asistencia(NULL)::text$q$, 'false');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_eq('b14: without a session everything is false',
  $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver() || '|' || pg_temp.asistencia()$q$,
  'false|false|false,false,false,false,false,false');
SELECT pg_temp.assert_raises('b15: without a session a write is sin_autoridad',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(1), 'domingo', NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b16: without a session a read is sin_autoridad',
  $q$SELECT public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(2))$q$, '42501', 'sin_autoridad');

-- ── c. planificadores ────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('c1: the sub-director cannot add a planner',
  $q$SELECT public.dps_planificador_agregar(pg_temp.id('us', 5))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c2: the DPS director adds a planner',
  $q$SELECT 'ok' FROM public.dps_planificador_agregar(pg_temp.id('us', 5))$q$, 'ok');
SELECT pg_temp.assert_eq('c3: adding again is a no-op',
  $q$SELECT 'ok' FROM public.dps_planificador_agregar(pg_temp.id('us', 5))$q$, 'ok');
SELECT pg_temp.assert_raises('c4: an unknown persona is persona_invalida',
  $q$SELECT public.dps_planificador_agregar(gen_random_uuid())$q$, '22023', 'persona_invalida');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('c5: the added planner plans and sees', $q$SELECT public.dps_puede_planificar() || '|' || public.dps_puede_ver()$q$, 'true|true');
SELECT pg_temp.assert_raises('c5b: an added planner cannot add other planners',
  $q$SELECT public.dps_planificador_agregar(pg_temp.id('us', 6))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c5c: an added planner cannot save the config',
  $q$SELECT public.dps_config_guardar('["09:15"]'::jsonb, '07:00')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c5d: an added planner cannot change who passes attendance',
  $q$SELECT public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 1), false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c6: removing', $q$SELECT 'ok' FROM public.dps_planificador_quitar(pg_temp.id('us', 5))$q$, 'ok');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('c7: the removed planner no longer plans', $q$SELECT public.dps_puede_planificar()::text$q$, 'false');
SELECT pg_temp.assert_raises('c8: the removed planner cannot write',
  $q$SELECT public.dps_planificador_agregar(pg_temp.id('us', 5))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c9: the admin adds the planner back',
  $q$SELECT 'ok' FROM public.dps_planificador_agregar(pg_temp.id('us', 5))$q$, 'ok');
RESET ROLE;
SELECT pg_temp.assert_eq('c10: stored once, with who added it',
  $q$SELECT count(*) || '|' || bool_and(agregado_por = pg_temp.id('us', 1)) FROM public.dps_planificadores WHERE persona_id = pg_temp.id('us', 5)$q$,
  '1|true');
SET LOCAL ROLE authenticated;

-- ── d. pasan asistencia ──────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d1: the sub-director cannot change who passes attendance',
  $q$SELECT public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 1), false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d2: disabling PT', $q$SELECT 'ok' FROM public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 1), false)$q$, 'ok');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d3: the sub-director of a disabled PT passes nowhere', $q$SELECT pg_temp.asistencia()$q$, 'false,false,false,false,false,false');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('d4: the Camaras coordinator inherits the disable', $q$SELECT pg_temp.asistencia()$q$, 'false,false,false,false,false,false');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('d5: a planner is not affected', $q$SELECT pg_temp.asistencia()$q$, 'true,true,true,false,false,false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d6: enabling Camaras explicitly', $q$SELECT 'ok' FROM public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 2), true)$q$, 'ok');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('d7: the child row overrides the parent', $q$SELECT pg_temp.asistencia()$q$, 'false,true,false,false,false,false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d8: PT back to inherit', $q$SELECT 'ok' FROM public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 1), NULL)$q$, 'ok');
SELECT pg_temp.assert_raises('d9: an equipo outside DPS is equipo_invalido',
  $q$SELECT public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 5), false)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_raises('d10: another experiencia under DPS is equipo_invalido',
  $q$SELECT public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 6), false)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d11: inheriting again, the sub-director passes in their subtree', $q$SELECT pg_temp.asistencia()$q$, 'true,true,false,false,false,false');

-- ── e. puestos ───────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('e1: the sub-director cannot create puestos',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'Director tecnico', 1, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('pu_dt', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), '  Director tecnico ', 1, NULL)::text$q$);
SELECT pg_temp.put('pu_cam', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Camara', 3, NULL)::text$q$);
SELECT pg_temp.put('pu_cam2', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Switcher', 1, NULL)::text$q$);
SELECT pg_temp.put('pu_media', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 3), 'Camara', 1, 5)::text$q$);
SELECT pg_temp.assert_eq('e2: list all: trimmed names, automatic orden per equipo, explicit orden kept',
  $q$SELECT pg_temp.puestos(NULL)$q$, 'Camara:1:5,Director tecnico:1:0,Camara:3:0,Switcher:1:1');
SELECT pg_temp.assert_eq('e3: list PT: its subtree, not Media',
  $q$SELECT pg_temp.puestos(pg_temp.id('eq', 1))$q$, 'Director tecnico:1:0,Camara:3:0,Switcher:1:1');
SELECT pg_temp.assert_eq('e4: list Camaras', $q$SELECT pg_temp.puestos(pg_temp.id('eq', 2))$q$, 'Camara:3:0,Switcher:1:1');
SELECT pg_temp.assert_raises('e5: the same name in the same equipo (case and spaces) is puesto_duplicado',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), ' CAMARA ', 1, NULL)$q$, '22023', 'puesto_duplicado');
SELECT pg_temp.assert_raises('e6: cantidad 0 is cantidad_invalida',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Grua', 0, NULL)$q$, '22023', 'cantidad_invalida');
SELECT pg_temp.assert_raises('e7: an empty name is nombre_invalido',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), '   ', 1, NULL)$q$, '22023', 'nombre_invalido');
SELECT pg_temp.assert_raises('e8: an equipo outside DPS is equipo_invalido',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 5), 'Grua', 1, NULL)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_raises('e9: an inactive DPS equipo is equipo_invalido',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 4), 'Grua', 1, NULL)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_raises('e10: another experiencia under DPS is equipo_invalido',
  $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 6), 'Grua', 1, NULL)$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_eq('e11: editing name, cantidad and orden',
  $q$SELECT (public.dps_puesto_guardar(pg_temp.ctx('pu_cam')::uuid, pg_temp.id('eq', 2), 'Camara fija', 2, 3) = pg_temp.ctx('pu_cam')::uuid)::text
            || '|' || pg_temp.puestos(pg_temp.id('eq', 2))$q$, 'true|Switcher:1:1,Camara fija:2:3');
SELECT pg_temp.assert_raises('e12: editing into a duplicate is puesto_duplicado',
  $q$SELECT public.dps_puesto_guardar(pg_temp.ctx('pu_cam2')::uuid, pg_temp.id('eq', 2), 'camara FIJA', 1, NULL)$q$, '22023', 'puesto_duplicado');
SELECT pg_temp.assert_raises('e13: editing an unknown puesto is puesto_invalido',
  $q$SELECT public.dps_puesto_guardar(gen_random_uuid(), pg_temp.id('eq', 2), 'Grua', 1, NULL)$q$, '22023', 'puesto_invalido');
SELECT pg_temp.assert_eq('e14: deactivating', $q$SELECT 'ok' FROM public.dps_puesto_desactivar(pg_temp.ctx('pu_cam')::uuid)$q$, 'ok');
SELECT pg_temp.assert_eq('e15: deactivating again is a no-op', $q$SELECT 'ok' FROM public.dps_puesto_desactivar(pg_temp.ctx('pu_cam')::uuid)$q$, 'ok');
SELECT pg_temp.assert_raises('e16: deactivating an unknown puesto is puesto_invalido',
  $q$SELECT public.dps_puesto_desactivar(gen_random_uuid())$q$, '22023', 'puesto_invalido');
SELECT pg_temp.assert_raises('e17: a deactivated puesto cannot be edited',
  $q$SELECT public.dps_puesto_guardar(pg_temp.ctx('pu_cam')::uuid, pg_temp.id('eq', 2), 'Camara fija', 2, 3)$q$, '22023', 'puesto_invalido');
SELECT pg_temp.assert_eq('e18: the deactivated name is free again and hidden from the list',
  $q$SELECT (public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Camara fija', 2, NULL) IS NOT NULL)::text
            || '|' || pg_temp.puestos(pg_temp.id('eq', 2))$q$, 'true|Switcher:1:1,Camara fija:2:2');
SELECT pg_temp.assert_raises('e19: listing an equipo outside DPS is equipo_invalido',
  $q$SELECT pg_temp.puestos(pg_temp.id('eq', 5))$q$, '22023', 'equipo_invalido');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('e20: a DPS servidor lists', $q$SELECT pg_temp.puestos(pg_temp.id('eq', 3))$q$, 'Camara:1:5');
SELECT pg_temp.assert_raises('e21: a DPS servidor cannot deactivate',
  $q$SELECT public.dps_puesto_desactivar(pg_temp.ctx('pu_media')::uuid)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('e22: a random user cannot list', $q$SELECT pg_temp.puestos(NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e23: the added planner creates puestos',
  $q$SELECT (public.dps_puesto_guardar(NULL, pg_temp.id('eq', 3), 'Streaming', 2, NULL) IS NOT NULL)::text$q$, 'true');

-- ── f. config ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f1: read the defaults', $q$SELECT (c -> 'horarios')::text || '|' || (c ->> 'llegada') FROM public.dps_config_leer() c$q$,
  '["09:15", "11:15"]|07:00');
SELECT pg_temp.assert_eq('f2: saving normalizes (sorted, distinct)',
  $q$SELECT public.dps_config_guardar('["11:15", "09:15", "09:15"]'::jsonb, '07:30')::text$q$,
  '{"llegada": "07:30", "horarios": ["09:15", "11:15"]}');
SELECT pg_temp.assert_raises('f3: an invalid hour is horarios_invalidos',
  $q$SELECT public.dps_config_guardar('["25:00"]'::jsonb, '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('f4: no hours is horarios_invalidos',
  $q$SELECT public.dps_config_guardar('[]'::jsonb, '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('f5: not an array is horarios_invalidos',
  $q$SELECT public.dps_config_guardar('"09:15"'::jsonb, '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('f6: no llegada is llegada_invalida',
  $q$SELECT public.dps_config_guardar('["09:15"]'::jsonb, NULL)$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_eq('f7: read lists the planner and the per-equipo attendance',
  $q$SELECT (SELECT string_agg(p ->> 'nombre', ',') FROM jsonb_array_elements(c -> 'planificadores') p WHERE p ->> 'nombre' LIKE 'ZZ Dp %')
            || '|' || (SELECT string_agg((a ->> 'equipo') || ':' || (a ->> 'habilitado') || ':' || coalesce(a ->> 'explicito', '-'), ',' ORDER BY a ->> 'ruta')
                         FROM jsonb_array_elements(c -> 'pasan_asistencia') a WHERE a ->> 'equipo' LIKE 'ZZ Dp %')
            || '|' || (c ->> 'llegada')
       FROM public.dps_config_leer() c$q$,
  'ZZ Dp U5|ZZ Dp Media:true:-,ZZ Dp PT:true:-,ZZ Dp Camaras:true:true|07:30');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('f8: the sub-director cannot read the config', $q$SELECT public.dps_config_leer()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('f9: a servidor cannot save the config',
  $q$SELECT public.dps_config_guardar('["09:15"]'::jsonb, '07:00')$q$, '42501', 'sin_autoridad');

-- ── g. plans ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('pl_d3', $q$SELECT public.dps_plan_crear(pg_temp.dom(3), 'domingo', NULL)::text$q$);
SELECT pg_temp.assert_eq('g1: a new plan takes horarios and llegada from the config',
  $q$SELECT (p -> 'horarios')::text || '|' || (p ->> 'llegada') || '|' || (p ->> 'tipo') || '|' || coalesce(p ->> 'serie', '-')
       FROM public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) p$q$, '["09:15", "11:15"]|07:30|domingo|-');
SELECT pg_temp.assert_raises('g2: a domingo plan on another weekday is fecha_invalida',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(3) + 2, 'domingo', NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('g3: no fecha is fecha_invalida',
  $q$SELECT public.dps_plan_crear(NULL, 'especial', NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('g4: an unknown tipo is tipo_invalido',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(3), 'bautizo', NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('g5: a second domingo on the same date (another titulo) is plan_duplicado',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(3), 'domingo', 'Otro')$q$, '22023', 'plan_duplicado');
SELECT pg_temp.put('pl_cena', $q$SELECT public.dps_plan_crear(pg_temp.dom(3) + 2, 'cena_del_senor', 'Cena del Senor')::text$q$);
SELECT pg_temp.assert_raises('g6: the same tipo, date and titulo (case-insensitive) is plan_duplicado',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(3) + 2, 'cena_del_senor', ' CENA DEL SENOR ')$q$, '22023', 'plan_duplicado');
SELECT pg_temp.assert_eq('g7: another tipo on a Sunday that has a domingo plan is allowed',
  $q$SELECT (public.dps_plan_crear(pg_temp.dom(3), 'especial', 'Bautizos') IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('g8: the sub-director cannot create plans',
  $q$SELECT public.dps_plan_crear(pg_temp.dom(4), 'domingo', NULL)$q$, '42501', 'sin_autoridad');

-- ── h. series ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('se_1', $q$SELECT r::text FROM public.dps_serie_crear('ZZ Dp Serie', 'chart-2', 4, pg_temp.dom(1), ' Sinopsis ', 'https://x.test/r') r$q$);
INSERT INTO t_dp_ctx (k, v) SELECT 'serie', (pg_temp.ctx('se_1')::jsonb ->> 'serie_id');
SELECT pg_temp.assert_eq('h1: creating returns its four Sundays, the third one attached',
  $q$SELECT string_agg(((p ->> 'fecha')::date - pg_temp.dom(1)) / 7 + 1 || ':' || (p ->> 'semana') || ':' || (p ->> 'existente'), ',' ORDER BY p ->> 'semana')
       FROM jsonb_array_elements(pg_temp.ctx('se_1')::jsonb -> 'planes') p$q$, '1:1:false,2:2:false,3:3:true,4:4:false');
SELECT pg_temp.assert_eq('h2: the existing plan was attached, not duplicated',
  $q$SELECT ((pg_temp.ctx('se_1')::jsonb -> 'planes' -> 2 ->> 'id') = pg_temp.ctx('pl_d3'))::text || '|' || pg_temp.domingos()$q$,
  'true|1:domingo:1,2:domingo:2,3:domingo:3,3:especial:-,4:domingo:4');
SELECT pg_temp.assert_eq('h3: the plan carries the series',
  $q$SELECT concat_ws('|', p -> 'serie' ->> 'nombre', p -> 'serie' ->> 'color', p -> 'serie' ->> 'semanas', p -> 'serie' ->> 'sinopsis',
                      p -> 'serie' ->> 'enlace_recurso', p ->> 'semana', p ->> 'llegada')
       FROM public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) p$q$, 'ZZ Dp Serie|chart-2|4|Sinopsis|https://x.test/r|3|07:30');
SELECT pg_temp.assert_raises('h4: an unknown color is color_invalido',
  $q$SELECT public.dps_serie_crear('ZZ Dp X', 'red', 2, pg_temp.dom(10), NULL, NULL)$q$, '22023', 'color_invalido');
SELECT pg_temp.assert_raises('h5: zero semanas is semanas_invalidas',
  $q$SELECT public.dps_serie_crear('ZZ Dp X', 'chart-1', 0, pg_temp.dom(10), NULL, NULL)$q$, '22023', 'semanas_invalidas');
SELECT pg_temp.assert_raises('h6: a first day that is not Sunday is fecha_invalida',
  $q$SELECT public.dps_serie_crear('ZZ Dp X', 'chart-1', 2, pg_temp.dom(10) + 1, NULL, NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('h7: a link that is not http(s) is enlace_invalido',
  $q$SELECT public.dps_serie_crear('ZZ Dp X', 'chart-1', 2, pg_temp.dom(10), NULL, 'ftp://x.test')$q$, '22023', 'enlace_invalido');
SELECT pg_temp.assert_raises('h8: an empty name is nombre_invalido',
  $q$SELECT public.dps_serie_crear(' ', 'chart-1', 2, pg_temp.dom(10), NULL, NULL)$q$, '22023', 'nombre_invalido');
SELECT pg_temp.assert_raises('h9: a Sunday of another series is domingo_ocupado',
  $q$SELECT public.dps_serie_crear('ZZ Dp Otra', 'chart-3', 3, pg_temp.dom(4), NULL, NULL)$q$, '22023', 'domingo_ocupado');
SELECT pg_temp.assert_eq('h10: the rejected creation wrote nothing',
  $q$SELECT pg_temp.domingos()$q$, '1:domingo:1,2:domingo:2,3:domingo:3,3:especial:-,4:domingo:4');
SELECT pg_temp.assert_eq('h11: growing to 6 creates the two new Sundays',
  $q$SELECT jsonb_array_length(public.dps_serie_actualizar(pg_temp.ctx('serie')::uuid, 'ZZ Dp Serie 2', 'chart-4', 6, NULL, NULL) -> 'planes')
            || '|' || pg_temp.domingos()$q$,
  '2|1:domingo:1,2:domingo:2,3:domingo:3,3:especial:-,4:domingo:4,5:domingo:5,6:domingo:6');
SELECT pg_temp.assert_eq('h12: the update shows in the plan',
  $q$SELECT concat_ws('|', p -> 'serie' ->> 'nombre', p -> 'serie' ->> 'color', p -> 'serie' ->> 'semanas', coalesce(p -> 'serie' ->> 'sinopsis', '-'))
       FROM public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) p$q$, 'ZZ Dp Serie 2|chart-4|6|-');
SELECT pg_temp.assert_eq('h13: shrinking to 2 detaches the trailing plans and keeps them',
  $q$SELECT jsonb_array_length(public.dps_serie_actualizar(pg_temp.ctx('serie')::uuid, 'ZZ Dp Serie 2', 'chart-4', 2, NULL, NULL) -> 'planes')
            || '|' || pg_temp.domingos()$q$,
  '0|1:domingo:1,2:domingo:2,3:domingo:-,3:especial:-,4:domingo:-,5:domingo:-,6:domingo:-');
SELECT pg_temp.assert_eq('h14: growing back attaches the kept plans',
  $q$SELECT (SELECT string_agg(p ->> 'existente', ',' ORDER BY p ->> 'semana')
               FROM jsonb_array_elements(public.dps_serie_actualizar(pg_temp.ctx('serie')::uuid, 'ZZ Dp Serie 2', 'chart-4', 3, NULL, NULL) -> 'planes') p)
            || '|' || pg_temp.domingos()$q$,
  'true|1:domingo:1,2:domingo:2,3:domingo:3,3:especial:-,4:domingo:-,5:domingo:-,6:domingo:-');
SELECT pg_temp.assert_raises('h15: updating an unknown series is serie_invalida',
  $q$SELECT public.dps_serie_actualizar(gen_random_uuid(), 'X', 'chart-1', 2, NULL, NULL)$q$, '22023', 'serie_invalida');
-- Each write gets its own statement: a STABLE read in the same statement sees the previous snapshot.
SELECT pg_temp.assert_eq('h16: the cover path is stored',
  $q$SELECT 'ok' FROM public.dps_serie_imagen(pg_temp.ctx('serie')::uuid, pg_temp.ctx('serie') || '/portada.webp')$q$, 'ok');
SELECT pg_temp.assert_eq('h16b: and shown in the plan',
  $q$SELECT (public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) -> 'serie' ->> 'imagen_path' = pg_temp.ctx('serie') || '/portada.webp')::text$q$,
  'true');
SELECT pg_temp.assert_raises('h17: a path outside the series folder is imagen_invalida',
  $q$SELECT public.dps_serie_imagen(pg_temp.ctx('serie')::uuid, gen_random_uuid() || '/portada.webp')$q$, '22023', 'imagen_invalida');
SELECT pg_temp.assert_raises('h18: a path with .. is imagen_invalida',
  $q$SELECT public.dps_serie_imagen(pg_temp.ctx('serie')::uuid, pg_temp.ctx('serie') || '/../x.png')$q$, '22023', 'imagen_invalida');
SELECT pg_temp.assert_eq('h19: NULL clears the cover',
  $q$SELECT 'ok' FROM public.dps_serie_imagen(pg_temp.ctx('serie')::uuid, NULL)$q$, 'ok');
SELECT pg_temp.assert_eq('h19b: the plan shows no cover',
  $q$SELECT coalesce(public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) -> 'serie' ->> 'imagen_path', '-')$q$, '-');
SELECT pg_temp.assert_raises('h20: the cover of an unknown series is serie_invalida',
  $q$SELECT public.dps_serie_imagen(gen_random_uuid(), NULL)$q$, '22023', 'serie_invalida');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('h21: the sub-director cannot create series',
  $q$SELECT public.dps_serie_crear('ZZ Dp X', 'chart-1', 2, pg_temp.dom(10), NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('h22: the sub-director cannot update series',
  $q$SELECT public.dps_serie_actualizar(pg_temp.ctx('serie')::uuid, 'X', 'chart-1', 2, NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('h23: the sub-director cannot set the cover',
  $q$SELECT public.dps_serie_imagen(pg_temp.ctx('serie')::uuid, NULL)$q$, '42501', 'sin_autoridad');

-- ── i. dps_plan_campo ────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('i1: productor as a persona of the system',
  $q$SELECT concat_ws('|', (p -> 'productor' ->> 'persona_id' = pg_temp.id('us', 9)::text)::text, p -> 'productor' ->> 'nombre', coalesce(p -> 'productor' ->> 'texto', '-'))
       FROM pg_temp.campo('pl_d3', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 9))) p$q$, 'true|ZZ Dp U9|-');
SELECT pg_temp.assert_eq('i2: host as written text',
  $q$SELECT concat_ws('|', coalesce(p -> 'host' ->> 'persona_id', '-'), p -> 'host' ->> 'texto', p -> 'host' ->> 'nombre')
       FROM pg_temp.campo('pl_d3', 'host', '{"texto": " Invitado X "}') p$q$, '-|Invitado X|Invitado X');
SELECT pg_temp.assert_eq('i3: switching productor to text drops the persona',
  $q$SELECT concat_ws('|', coalesce(p -> 'productor' ->> 'persona_id', '-'), p -> 'productor' ->> 'texto')
       FROM pg_temp.campo('pl_d3', 'productor', '{"texto": "Productor invitado"}') p$q$, '-|Productor invitado');
SELECT pg_temp.assert_eq('i4: comunicador as persona, then null clears it',
  $q$SELECT (pg_temp.campo('pl_d3', 'comunicador', jsonb_build_object('persona_id', pg_temp.id('us', 10))) -> 'comunicador' ->> 'nombre')
            || '|' || coalesce(pg_temp.campo('pl_d3', 'comunicador', 'null') ->> 'comunicador', '-')$q$, 'ZZ Dp U10|-');
SELECT pg_temp.assert_raises('i5: persona and text together is persona_o_texto',
  $q$SELECT pg_temp.campo('pl_d3', 'host', jsonb_build_object('persona_id', pg_temp.id('us', 9), 'texto', 'X'))$q$, '22023', 'persona_o_texto');
SELECT pg_temp.assert_raises('i6: neither is persona_o_texto',
  $q$SELECT pg_temp.campo('pl_d3', 'host', '{}')$q$, '22023', 'persona_o_texto');
SELECT pg_temp.assert_raises('i7: blank text is persona_o_texto',
  $q$SELECT pg_temp.campo('pl_d3', 'host', '{"texto": "  "}')$q$, '22023', 'persona_o_texto');
SELECT pg_temp.assert_raises('i8: an unknown persona is persona_invalida',
  $q$SELECT pg_temp.campo('pl_d3', 'host', jsonb_build_object('persona_id', gen_random_uuid()))$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('i9: a persona_id that is not a uuid is persona_invalida',
  $q$SELECT pg_temp.campo('pl_d3', 'host', '{"persona_id": "abc"}')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('i10: a plain string is valor_invalido',
  $q$SELECT pg_temp.campo('pl_d3', 'host', '"Invitado"')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_eq('i11: the rejected writes left host as it was',
  $q$SELECT public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) -> 'host' ->> 'texto'$q$, 'Invitado X');
SELECT pg_temp.assert_eq('i12: a creative campo is stored trimmed',
  $q$SELECT pg_temp.campo('pl_d3', 'opener', '" Video de apertura "') -> 'campos' ->> 'opener'$q$, 'Video de apertura');
SELECT pg_temp.assert_eq('i12b: notas stored', $q$SELECT pg_temp.campo('pl_d3', 'notas', '"Nota"') -> 'campos' ->> 'notas'$q$, 'Nota');
SELECT pg_temp.assert_eq('i12c: an empty string removes the key',
  $q$SELECT (pg_temp.campo('pl_d3', 'notas', '""') -> 'campos' ? 'notas')::text$q$, 'false');
SELECT pg_temp.assert_eq('i12d: null removes the key (absent is fine)',
  $q$SELECT (pg_temp.campo('pl_d3', 'historia_vida', 'null') -> 'campos' ? 'historia_vida')::text$q$, 'false');
SELECT pg_temp.assert_eq('i12e: canciones are stored trimmed, in order',
  $q$SELECT (pg_temp.campo('pl_d3', 'canciones', '["Cancion A", " Cancion B "]') -> 'campos')::text$q$,
  '{"opener": "Video de apertura", "canciones": ["Cancion A", "Cancion B"]}');
SELECT pg_temp.assert_eq('i13: an empty canciones array removes them',
  $q$SELECT (pg_temp.campo('pl_d3', 'canciones', '[]') -> 'campos')::text$q$, '{"opener": "Video de apertura"}');
SELECT pg_temp.assert_raises('i14: eleven canciones is valor_invalido',
  $q$SELECT pg_temp.campo('pl_d3', 'canciones', (SELECT jsonb_agg('c' || n) FROM generate_series(1, 11) n))$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('i15: canciones as a string is valor_invalido',
  $q$SELECT pg_temp.campo('pl_d3', 'canciones', '"A"')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('i16: a non-string cancion is valor_invalido',
  $q$SELECT pg_temp.campo('pl_d3', 'canciones', '[1]')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('i17: a number in a text campo is valor_invalido',
  $q$SELECT pg_temp.campo('pl_d3', 'opener', '123')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('i18: fecha is not editable (campo_invalido)',
  $q$SELECT pg_temp.campo('pl_d3', 'fecha', '"2098-01-01"')$q$, '22023', 'campo_invalido');
SELECT pg_temp.assert_raises('i19: tipo is not editable (campo_invalido)',
  $q$SELECT pg_temp.campo('pl_d3', 'tipo', '"libre"')$q$, '22023', 'campo_invalido');
SELECT pg_temp.assert_raises('i20: serie_id is not editable (campo_invalido)',
  $q$SELECT pg_temp.campo('pl_d3', 'serie_id', 'null')$q$, '22023', 'campo_invalido');
SELECT pg_temp.assert_raises('i21: productor_texto is not a campo (campo_invalido)',
  $q$SELECT pg_temp.campo('pl_d3', 'productor_texto', '"X"')$q$, '22023', 'campo_invalido');
SELECT pg_temp.assert_eq('i22: titulo is stored trimmed',
  $q$SELECT pg_temp.campo('pl_d3', 'titulo', '" Parte 3 "') ->> 'titulo'$q$, 'Parte 3');
SELECT pg_temp.assert_eq('i22b: null clears titulo',
  $q$SELECT coalesce(pg_temp.campo('pl_d3', 'titulo', 'null') ->> 'titulo', '-')$q$, '-');
SELECT pg_temp.assert_eq('i22c: llegada', $q$SELECT pg_temp.campo('pl_d3', 'llegada', '"08:00"') ->> 'llegada'$q$, '08:00');
SELECT pg_temp.assert_eq('i22d: horarios', $q$SELECT (pg_temp.campo('pl_d3', 'horarios', '["11:15"]') -> 'horarios')::text$q$, '["11:15"]');
SELECT pg_temp.assert_raises('i23: a bad llegada is llegada_invalida',
  $q$SELECT pg_temp.campo('pl_d3', 'llegada', '"8"')$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_raises('i24: bad horarios are horarios_invalidos',
  $q$SELECT pg_temp.campo('pl_d3', 'horarios', '["9:15"]')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.put('pl_cena2', $q$SELECT public.dps_plan_crear(pg_temp.dom(3) + 2, 'cena_del_senor', 'Cena 2')::text$q$);
SELECT pg_temp.assert_raises('i25: a titulo that collides with another plan of that date and tipo is plan_duplicado',
  $q$SELECT pg_temp.campo('pl_cena2', 'titulo', '"cena del senor"')$q$, '22023', 'plan_duplicado');
SELECT pg_temp.assert_raises('i26: an unknown plan is plan_invalido',
  $q$SELECT public.dps_plan_campo(gen_random_uuid(), 'notas', '"x"')$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('i27: the coordinator cannot edit a plan',
  $q$SELECT pg_temp.campo('pl_d3', 'notas', '"x"')$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('i28: updated_by is the planner who edited',
  $q$SELECT (updated_by = pg_temp.id('us', 5))::text FROM public.dps_planes WHERE id = pg_temp.ctx('pl_d3')::uuid$q$, 'true');
SELECT pg_temp.assert_raises('i29: the table refuses persona and text together (S7.3)',
  $q$UPDATE public.dps_planes SET productor_persona_id = pg_temp.id('us', 9), productor_texto = 'X' WHERE id = pg_temp.ctx('pl_d3')::uuid$q$, '23514');
SET LOCAL ROLE authenticated;

-- ── j. reads ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('j1: a DPS servidor reads the range in order',
  $q$SELECT string_agg(((p ->> 'fecha')::date - pg_temp.dom(1)) || ':' || (p ->> 'tipo'), ',')
       FROM jsonb_array_elements(public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(4))) p$q$,
  '0:domingo,7:domingo,14:domingo,14:especial,16:cena_del_senor,16:cena_del_senor,21:domingo');
SELECT pg_temp.assert_eq('j2: a servidor cannot edit', $q$SELECT public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) ->> 'puede_editar'$q$, 'false');
SELECT pg_temp.assert_raises('j3: a range over 400 days is rango_invalido',
  $q$SELECT public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(1) + 401)$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('j4: an inverted range is rango_invalido',
  $q$SELECT public.dps_planes_rango(pg_temp.dom(2), pg_temp.dom(1))$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('j5: an unknown plan is plan_invalido',
  $q$SELECT public.dps_plan_leer(gen_random_uuid())$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('j6: the director can edit', $q$SELECT public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid) ->> 'puede_editar'$q$, 'true');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('j7: a random user cannot read the range',
  $q$SELECT public.dps_planes_rango(pg_temp.dom(1), pg_temp.dom(4))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_raises('j8: a Niños servidor cannot read a plan',
  $q$SELECT public.dps_plan_leer(pg_temp.ctx('pl_d3')::uuid)$q$, '42501', 'sin_autoridad');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dp_failures);
END;
$$;
