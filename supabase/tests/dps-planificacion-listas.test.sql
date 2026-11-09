-- S12 (odd/tasks/dps-asistencia-pco.md, L56, L57, S12.2 as amended by L59;
-- T14a, T14b) and T13c (L55) — Global Music sub-equipos, the Productores
-- sub-equipo of Producción Creativa, lists by position, several people per cell and
-- the unified horarios / order checks (20261109200000_dps_listas_posicion.sql).
-- Needs the earlier DPS migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_listas_personas and dps_plan_personas
--      have RLS on, no policies and no privilege for authenticated; the new
--      functions are SECURITY DEFINER with search_path ''; authenticated
--      executes exactly dps_lista_leer / _agregar / _quitar / _puede_editar,
--      not the internal helpers; anon executes no dps_* function.
--   g. T14a (S12.1): the real Global Music node has the active sub-equipos
--      Cantantes, Piano, Bajo, Batería and Guitarra eléctrica with its
--      experiencia and the roles coordinador / entrenador / voluntario (with
--      their nivel); «Líder de alabanza» is in Cantantes, each instrument in
--      its sub-equipo, «Líder de banda» and «Asistente técnico» stay on Global
--      Music, nothing of those names is left active on Global Music.
--   t. Transition (S12.1): someone still on the Global Music node is a
--      candidate for, is convocado in and is copied into a puesto of a
--      sub-equipo; someone of the Bajo sub-equipo is not for Piano; someone
--      on Global Music is not for a DPS puesto; a servicio on a DPS parent is
--      still not for a puesto of its child (the rule is only inside Global
--      Music); Líder de banda still takes the Global Music servidor.
--   p. L59 (S12.2 amended): Producción Creativa has the active sub-equipo
--      Productores with its experiencia and the roles coordinador /
--      entrenador / voluntario; dps_equipo_productores finds it.
--   l. Lists (S12.2, L59): who edits each (admin, DPS director: hosts and
--      comunicadores; the Producción Creativa director, an added planner and
--      a servidor: none; productores and cantantes: nobody through the RPCs);
--      dps_lista_leer for whoever sees DPS (names by nombre, iniciales,
--      puede_editar), not for a random user; productores = the active
--      servicios of Productores and below (not a paused one, not someone
--      only on Producción Creativa), cantantes = the same for Cantantes (not
--      someone on Global Music); agregar is idempotent, quitar removes;
--      lista_invalida (also agregar / quitar productores and cantantes),
--      persona_invalida, sin_autoridad.
--   c. Cells (S12.3, S12.4): several people (list members and written
--      names) in order, the old key keeps the first; the limits 3 and 8
--      (demasiadas_personas); a persona off the list is
--      persona_fuera_de_lista (also a paused productor), a written name is
--      always fine; someone already in the cell stays after their Productores
--      servicio is paused; repeats kept once;
--      [] and null clear (old columns too); Cantantes from the Cantantes
--      servicios, the plain string still works, campos.cantantes follows
--      the names; shape errors; a rejected write leaves the cell as it was.
--   e. Existing values (S12.4): on the target database every plan's old
--      productor / host / comunicador is the first entry of its cell, and a
--      text in campos.cantantes has its entry.
--   h. T13c: dps_plan_campo('horarios') and dps_config_guardar take 1 to 4
--      services and refuse a llegada after the first; dps_plan_campo('llegada')
--      too; dps_orden_item_guardar and dps_orden_mover read the row again
--      after the plan lock (checked on their source; the race itself is two
--      sessions).
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id. No Sunday plan is
-- created: the plans are 'especial' ones in 2096.
--
-- Identities (usuario n = auth n for 1..10, all fictitious «ZZ Dlx…»):
--   1 ADMIN    rol admin
--   2 DIR      dream_team.direct on the DPS root
--   3 PC       dream_team.direct on Producción Creativa
--   4 PLAN     a row in dps_planificadores, no grant
--   5 RANDOM   nothing
--   6 GM       active servicio on the Global Music node itself
--   7 BAJO     active servicio in Bajo
--   8 CANT     active servicio in Cantantes
--   9 CORO     active servicio in ZZ Dlx Coro (child of Cantantes)
--   10 PAUSA   servicio en_pausa in Cantantes
--   11 PROD1, 12 PROD2 (active in Productores), 13 HOST1, 14 COMU1, 15 FUERA
--      (no list), 16 PADRE (active servicio on ZZ Dlx Padre, a DPS equipo),
--      17..24 active in Cantantes (with 8 and 9: ten cantantes), 25 PPAUSA
--      (servicio en_pausa in Productores), 26 PHIJA (active in ZZ Dlx
--      Productora, child of Productores), 27 PCSERV (active servicio on
--      Producción Creativa itself).
-- Equipos: 1 ZZ Dlx Padre (dps, under DPS) › 2 ZZ Dlx Hijo; 3 ZZ Dlx Coro
-- (global_music, under Cantantes); 4 ZZ Dlx Productora (dps, under
-- Productores).

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dl_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dl_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dl_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dl_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dl_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9e00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd9e1' WHEN 'us' THEN 'd9e2' WHEN 'eq' THEN 'd9e3'
                       WHEN 'ro' THEN 'd9e4' WHEN 'se' THEN 'd9e5' END,
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

CREATE OR REPLACE FUNCTION pg_temp.campo(p_plan text, p_campo text, p_valor jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dps_plan_campo(pg_temp.ctx(p_plan)::uuid, p_campo, p_valor);
END;
$$;

-- A cell of the plan as 'nombre' / 'nombre*' (written name), comma separated.
CREATE OR REPLACE FUNCTION pg_temp.celda(p_plan jsonb, p_columna text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg((e ->> 'nombre') || CASE WHEN e ->> 'persona_id' IS NULL THEN '*' ELSE '' END, ',' ORDER BY o), '')
    FROM jsonb_array_elements(p_plan -> 'personas' -> p_columna) WITH ORDINALITY AS t(e, o);
$$;

-- The fixture people of a list as their names, comma separated, in order.
CREATE OR REPLACE FUNCTION pg_temp.lista(p_lista text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(p ->> 'nombre', ',' ORDER BY o), '')
            FROM jsonb_array_elements(public.dps_lista_leer(p_lista) -> 'personas') WITH ORDINALITY AS t(p, o)
           WHERE p ->> 'persona_id' LIKE 'd9e00000-%');
END;
$$;

-- dps_lista_puede_editar for productores, hosts, comunicadores, cantantes.
CREATE OR REPLACE FUNCTION pg_temp.editables() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(public.dps_lista_puede_editar(l)::text, ',' ORDER BY o)
            FROM unnest(ARRAY['productores', 'hosts', 'comunicadores', 'cantantes']) WITH ORDINALITY AS t(l, o));
END;
$$;

-- The fixture candidates of a puesto in a plan.
CREATE OR REPLACE FUNCTION pg_temp.candidatos(p_puesto text, p_plan text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(c.apellido, ',' ORDER BY c.apellido), '')
            FROM public.dps_candidatos_puesto(pg_temp.ctx(p_puesto)::uuid, pg_temp.ctx(p_plan)::uuid, 'ZZ Dlx') c
           WHERE c.persona_id::text LIKE 'd9e00000-%');
END;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dl_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_dl_ctx (k, v)
SELECT 'musica', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'Global Music' AND d.experiencia = 'global_music' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_dl_ctx (k, v)
SELECT 'pc', e.id::text FROM public.dream_team_equipos e
 WHERE e.parent_equipo_id = pg_temp.ctx('raiz')::uuid AND e.label = 'Producción Creativa' AND e.activo
 ORDER BY e.created_at, e.id LIMIT 1;
-- The sub-equipos read directly (NULL in the RED run).
INSERT INTO t_dl_ctx (k, v)
SELECT 'sub_productores', e.id::text FROM public.dream_team_equipos e
 WHERE e.parent_equipo_id = pg_temp.ctx('pc')::uuid AND e.label = 'Productores' AND e.activo
 ORDER BY e.created_at, e.id LIMIT 1;
INSERT INTO t_dl_ctx (k, v)
SELECT 'sub_' || lower(translate(e.label, 'íé ', 'ie_')), e.id::text
  FROM public.dream_team_equipos e
 WHERE e.parent_equipo_id = pg_temp.ctx('musica')::uuid AND e.activo
   AND e.label IN ('Cantantes', 'Piano', 'Bajo', 'Batería', 'Guitarra eléctrica');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dl-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 10) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), CASE WHEN n <= 10 THEN pg_temp.id('au', n) END, 'ZZ Dlx', 'U' || lpad(n::text, 2, '0'),
       'dl-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 27) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9e00000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);
INSERT INTO public.dps_planificadores (persona_id, agregado_por) VALUES (pg_temp.id('us', 4), pg_temp.id('us', 1));

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Dlx Padre', true),
  (pg_temp.id('eq', 2), 'dps', pg_temp.id('eq', 1),       'ZZ Dlx Hijo',  true);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', 3), 'global_music', pg_temp.ctx('sub_cantantes')::uuid, 'ZZ Dlx Coro', true
 WHERE pg_temp.ctx('sub_cantantes') IS NOT NULL;
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', 4), 'dps', pg_temp.ctx('sub_productores')::uuid, 'ZZ Dlx Productora', true
 WHERE pg_temp.ctx('sub_productores') IS NOT NULL;
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.ctx('musica')::uuid, 'ZZ Dlx voluntario', 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'ZZ Dlx voluntario', 'voluntario', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', 3), pg_temp.id('eq', 3), 'ZZ Dlx voluntario', 'voluntario', true
 WHERE pg_temp.ctx('sub_cantantes') IS NOT NULL;
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', 4), pg_temp.id('eq', 4), 'ZZ Dlx voluntario', 'voluntario', true
 WHERE pg_temp.ctx('sub_productores') IS NOT NULL;
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 5), pg_temp.ctx('pc')::uuid, 'ZZ Dlx voluntario', 'voluntario', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 6), pg_temp.id('us', 6), pg_temp.ctx('musica')::uuid, pg_temp.id('ro', 1), 'activo', now() - interval '30 days', 'admin_asignacion'),
  (pg_temp.id('se', 16), pg_temp.id('us', 16), pg_temp.id('eq', 1), pg_temp.id('ro', 2), 'activo', now() - interval '30 days', 'admin_asignacion');
-- The sub-equipos' own «voluntario» rol (created by the migration).
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', x.n), pg_temp.id('us', x.n), x.equipo, r.id, x.estado::public.dream_team_estado, now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (7, pg_temp.ctx('sub_bajo')::uuid, 'activo'), (8, pg_temp.ctx('sub_cantantes')::uuid, 'activo'),
               (10, pg_temp.ctx('sub_cantantes')::uuid, 'en_pausa'), (11, pg_temp.ctx('sub_productores')::uuid, 'activo'),
               (12, pg_temp.ctx('sub_productores')::uuid, 'activo'), (25, pg_temp.ctx('sub_productores')::uuid, 'en_pausa'))
       AS x(n, equipo, estado)
  JOIN public.dream_team_roles r ON r.equipo_id = x.equipo AND r.label = 'voluntario';
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), r.equipo_id, r.id, 'activo', now() - interval '30 days', 'admin_asignacion'
  FROM generate_series(17, 24) AS n
  JOIN public.dream_team_roles r ON r.equipo_id = pg_temp.ctx('sub_cantantes')::uuid AND r.label = 'voluntario';
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', 9), pg_temp.id('us', 9), pg_temp.id('eq', 3), pg_temp.id('ro', 3), 'activo', now() - interval '30 days', 'admin_asignacion'
 WHERE pg_temp.ctx('sub_cantantes') IS NOT NULL;
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', 26), pg_temp.id('us', 26), pg_temp.id('eq', 4), pg_temp.id('ro', 4), 'activo', now() - interval '30 days', 'admin_asignacion'
 WHERE pg_temp.ctx('sub_productores') IS NOT NULL;
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 27), pg_temp.id('us', 27), pg_temp.ctx('pc')::uuid, pg_temp.id('ro', 5), 'activo', now() - interval '30 days', 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 27) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 2), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.ctx('raiz'), 'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.ctx('pc'),   'zz-test'),
  (pg_temp.id('us', 6), 'dream_team.serve',  'dream_team', 'equipo', pg_temp.ctx('musica'), 'zz-test');

-- The puestos the transition cases use.
INSERT INTO t_dl_ctx (k, v)
SELECT 'pu_piano', p.id::text FROM public.dps_puestos p
 WHERE p.activo AND p.equipo_id = pg_temp.ctx('sub_piano')::uuid AND lower(p.nombre) = 'piano';
INSERT INTO t_dl_ctx (k, v)
SELECT 'pu_banda', p.id::text FROM public.dps_puestos p
 WHERE p.activo AND p.equipo_id = pg_temp.ctx('musica')::uuid AND lower(p.nombre) = 'líder de banda';

GRANT INSERT, SELECT, UPDATE ON t_dl_failures, t_dl_ctx TO authenticated, anon;
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
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN ('dps_listas_personas', 'dps_plan_personas')$q$,
  'dps_listas_personas:true:0,dps_plan_personas:true:0');
SELECT pg_temp.assert_eq('a2: the new functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_es_configurador', 'dps_equipo_cantantes', 'dps_equipo_produccion_creativa', 'dps_equipo_productores',
        'dps_equipos_para_puesto', 'dps_lista_equipo', 'dps_lista_tiene', 'dps_lista_puede_editar', 'dps_lista_leer',
        'dps_lista_agregar', 'dps_lista_quitar')$q$, '11|0');
SELECT pg_temp.assert_eq('a3: authenticated executes exactly the public new functions',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND p.proname IN (
        'dps_es_configurador', 'dps_equipo_cantantes', 'dps_equipo_produccion_creativa', 'dps_equipo_productores',
        'dps_equipos_para_puesto', 'dps_lista_equipo', 'dps_lista_tiene', 'dps_lista_puede_editar', 'dps_lista_leer',
        'dps_lista_agregar', 'dps_lista_quitar')$q$,
  'dps_lista_agregar,dps_lista_leer,dps_lista_puede_editar,dps_lista_quitar');
SELECT pg_temp.assert_eq('a4: anon executes no dps_* function',
  $q$SELECT coalesce(string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C"), '-') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$, '-');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a5: authenticated cannot read dps_listas_personas', $q$SELECT count(*) FROM public.dps_listas_personas$q$, '42501');
SELECT pg_temp.assert_raises('a5: authenticated cannot read dps_plan_personas', $q$SELECT count(*) FROM public.dps_plan_personas$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_equipos_para_puesto',
  $q$SELECT count(*) FROM public.dps_equipos_para_puesto(gen_random_uuid())$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_equipo_productores',
  $q$SELECT public.dps_equipo_productores()$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_lista_equipo',
  $q$SELECT public.dps_lista_equipo('productores')$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_lista_tiene',
  $q$SELECT public.dps_lista_tiene('hosts', gen_random_uuid())$q$, '42501');
RESET ROLE;

-- ── g. Global Music sub-equipos and puestos (T14a) ───────────────────

SELECT pg_temp.assert_eq('g1: the five active sub-equipos of Global Music, with its experiencia',
  $q$SELECT string_agg(e.label || ':' || (e.experiencia = m.experiencia), ',' ORDER BY e.label)
       FROM public.dream_team_equipos e JOIN public.dream_team_equipos m ON m.id = e.parent_equipo_id
      WHERE m.id = pg_temp.ctx('musica')::uuid AND e.activo
        AND e.label IN ('Cantantes', 'Piano', 'Bajo', 'Batería', 'Guitarra eléctrica')$q$,
  'Bajo:true,Batería:true,Cantantes:true,Guitarra eléctrica:true,Piano:true');
SELECT pg_temp.assert_eq('g2: each has coordinador, entrenador and voluntario with their nivel',
  $q$SELECT count(DISTINCT e.id) || '|' || string_agg(DISTINCT r.label || ':' || r.nivel, ',')
       FROM public.dream_team_equipos e JOIN public.dream_team_roles r ON r.equipo_id = e.id AND r.activo
      WHERE e.parent_equipo_id = pg_temp.ctx('musica')::uuid
        AND e.label IN ('Cantantes', 'Piano', 'Bajo', 'Batería', 'Guitarra eléctrica')
        AND r.label IN ('coordinador', 'entrenador', 'voluntario')
     HAVING count(*) = 15$q$,
  '5|coordinador:coordinador,entrenador:lider,voluntario:voluntario');
SELECT pg_temp.assert_eq('g3: the puestos sit in their sub-equipos; Líder de banda and Asistente técnico stay on Global Music',
  $q$SELECT string_agg(d.ruta || ':' || p.nombre, ',' ORDER BY d.ruta, p.nombre)
       FROM public.dps_puestos p JOIN public.dps_equipos() d ON d.equipo_id = p.equipo_id
      WHERE p.activo AND lower(p.nombre) IN ('líder de alabanza', 'líder de banda', 'piano', 'bajo', 'batería',
                                             'guitarra eléctrica', 'asistente técnico')$q$,
  'Global Music:Asistente técnico,Global Music:Líder de banda,Global Music › Bajo:Bajo,Global Music › Batería:Batería,'
  || 'Global Music › Cantantes:Líder de alabanza,Global Music › Guitarra eléctrica:Guitarra eléctrica,Global Music › Piano:Piano');
SELECT pg_temp.assert_eq('g4: dps_equipo_cantantes and dps_equipo_produccion_creativa find them',
  $q$SELECT (public.dps_equipo_cantantes()::text = pg_temp.ctx('sub_cantantes')) || '|' || (public.dps_equipo_produccion_creativa()::text = pg_temp.ctx('pc'))$q$,
  'true|true');

-- ── p. the Productores sub-equipo (L59) ──────────────────────────────

SELECT pg_temp.assert_eq('p1: Producción Creativa has one active Productores sub-equipo with its experiencia',
  $q$SELECT count(*) || '|' || bool_and(e.experiencia = pc.experiencia)
       FROM public.dream_team_equipos e JOIN public.dream_team_equipos pc ON pc.id = e.parent_equipo_id
      WHERE pc.id = pg_temp.ctx('pc')::uuid AND e.label = 'Productores' AND e.activo$q$, '1|true');
SELECT pg_temp.assert_eq('p2: it has coordinador, entrenador and voluntario with their nivel',
  $q$SELECT string_agg(r.label || ':' || r.nivel, ',' ORDER BY r.label)
       FROM public.dream_team_roles r
      WHERE r.equipo_id = pg_temp.ctx('sub_productores')::uuid AND r.activo
        AND r.label IN ('coordinador', 'entrenador', 'voluntario')$q$,
  'coordinador:coordinador,entrenador:lider,voluntario:voluntario');
SELECT pg_temp.assert_eq('p3: dps_equipo_productores finds it',
  $q$SELECT (public.dps_equipo_productores()::text = pg_temp.ctx('sub_productores'))::text$q$, 'true');
SELECT pg_temp.assert_eq('p4: it is a DPS equipo (dps_equipos), so its people serve in DPS',
  $q$SELECT d.ruta FROM public.dps_equipos() d WHERE d.equipo_id = pg_temp.ctx('sub_productores')::uuid$q$,
  'DPS › Producción Creativa › Productores');

-- ── t. the transition (S12.1) ────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SET LOCAL ROLE authenticated;
SELECT pg_temp.put('pl_a', $q$SELECT public.dps_plan_crear(DATE '2096-03-04', 'especial', 'ZZ Dlx A')::text$q$);
SELECT pg_temp.put('pl_b', $q$SELECT public.dps_plan_crear(DATE '2096-03-11', 'especial', 'ZZ Dlx B')::text$q$);
SELECT pg_temp.put('pu_hijo', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'ZZ Dlx Puesto', 1, NULL)::text$q$);
SELECT pg_temp.assert_eq('t1: someone on Global Music is a candidate for Piano; Bajo is not',
  $q$SELECT pg_temp.candidatos('pu_piano', 'pl_a')$q$, 'U06');
SELECT pg_temp.assert_eq('t2: and is convocado in Piano',
  $q$SELECT (public.dps_convocar(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pu_piano')::uuid, pg_temp.id('se', 6)) IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('t3: the plan shows them under Piano',
  $q$SELECT string_agg(e ->> 'ruta' || ':' || (pu ->> 'nombre') || ':' || (c ->> 'nombre'), ',')
       FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.ctx('pl_a')::uuid) -> 'equipos') e,
            jsonb_array_elements(e -> 'puestos') pu, jsonb_array_elements(pu -> 'convocados') c
      WHERE c ->> 'persona_id' LIKE 'd9e00000-%'$q$, 'Global Music › Piano:Piano:ZZ Dlx U06');
SELECT pg_temp.assert_eq('t4: copying the plan keeps them',
  $q$SELECT (public.dps_copiar_plan(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pl_b')::uuid, false) ->> 'omitidos')
            || '|' || (SELECT count(*) FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.ctx('pl_b')::uuid) -> 'equipos') e,
                              jsonb_array_elements(e -> 'puestos') pu, jsonb_array_elements(pu -> 'convocados') c
                        WHERE c ->> 'persona_id' = pg_temp.id('us', 6)::text)$q$, '0|1');
SELECT pg_temp.assert_raises('t5: someone of Bajo is not for Piano',
  $q$SELECT public.dps_convocar(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pu_piano')::uuid, pg_temp.id('se', 7))$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('t6: someone on Global Music is not for a DPS puesto',
  $q$SELECT public.dps_convocar(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pu_hijo')::uuid, pg_temp.id('se', 6))$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('t7: outside Global Music a servicio on the parent is still not for the child''s puesto',
  $q$SELECT public.dps_convocar(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pu_hijo')::uuid, pg_temp.id('se', 16))$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_eq('t7: nor a candidate there', $q$SELECT pg_temp.candidatos('pu_hijo', 'pl_a')$q$, '');
SELECT pg_temp.assert_eq('t8: Líder de banda still takes the Global Music servidor',
  $q$SELECT (public.dps_convocar(pg_temp.ctx('pl_a')::uuid, pg_temp.ctx('pu_banda')::uuid, pg_temp.id('se', 6)) IS NOT NULL)::text$q$, 'true');
RESET ROLE;

-- ── l. lists (S12.2) ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('l1: the admin edits hosts and comunicadores, not productores nor cantantes',
  $q$SELECT pg_temp.editables()$q$, 'false,true,true,false');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('l2: the DPS director edits hosts and comunicadores', $q$SELECT pg_temp.editables()$q$, 'false,true,true,false');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('l3: the Producción Creativa director edits none (productores are placed in Dream Team)',
  $q$SELECT pg_temp.editables()$q$, 'false,false,false,false');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('l4: an added planner edits none', $q$SELECT pg_temp.editables()$q$, 'false,false,false,false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('l5: a servidor edits none', $q$SELECT pg_temp.editables()$q$, 'false,false,false,false');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_eq('l6: without a session, none', $q$SELECT pg_temp.editables()$q$, 'false,false,false,false');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('l7: agregar returns the list with the person',
  $q$SELECT (SELECT p ->> 'nombre' || ':' || (p ->> 'iniciales') FROM jsonb_array_elements(r -> 'personas') p
              WHERE p ->> 'persona_id' = pg_temp.id('us', 13)::text) || '|' || (r ->> 'lista') || '|' || (r ->> 'puede_editar')
       FROM public.dps_lista_agregar('hosts', pg_temp.id('us', 13)) r$q$, 'ZZ Dlx U13:ZU|hosts|true');
SELECT pg_temp.assert_eq('l8: twice is the same row',
  $q$SELECT pg_temp.lista('hosts') || '|' || pg_temp.lista('hosts')
       FROM public.dps_lista_agregar('hosts', pg_temp.id('us', 13)) r$q$, 'ZZ Dlx U13|ZZ Dlx U13');
SELECT pg_temp.assert_eq('l9: comunicadores, sorted by name',
  $q$SELECT (public.dps_lista_agregar('comunicadores', pg_temp.id('us', 14)) ->> 'lista') || '|'
            || (public.dps_lista_agregar('comunicadores', pg_temp.id('us', 15)) IS NOT NULL) || '|' || pg_temp.lista('comunicadores')$q$,
  'comunicadores|true|ZZ Dlx U14,ZZ Dlx U15');
SELECT pg_temp.assert_eq('l9: quitar removes',
  $q$SELECT pg_temp.lista('comunicadores') FROM public.dps_lista_quitar('comunicadores', pg_temp.id('us', 15)) r$q$, 'ZZ Dlx U14');
SELECT pg_temp.assert_eq('l10: productores = the active servicios of Productores and below, not paused, not only on Producción Creativa',
  $q$SELECT pg_temp.lista('productores') || '|' || (public.dps_lista_leer('productores') ->> 'puede_editar')$q$,
  'ZZ Dlx U11,ZZ Dlx U12,ZZ Dlx U26|false');
SELECT pg_temp.assert_raises('l10: productores are not added here',
  $q$SELECT public.dps_lista_agregar('productores', pg_temp.id('us', 15))$q$, '22023', 'lista_invalida');
SELECT pg_temp.assert_raises('l10: nor removed',
  $q$SELECT public.dps_lista_quitar('productores', pg_temp.id('us', 11))$q$, '22023', 'lista_invalida');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('l10: not even by the admin',
  $q$SELECT public.dps_lista_agregar('productores', pg_temp.id('us', 15))$q$, '22023', 'lista_invalida');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('l11: the Producción Creativa director cannot add a host',
  $q$SELECT public.dps_lista_agregar('hosts', pg_temp.id('us', 15))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('l11: nor remove a comunicador',
  $q$SELECT public.dps_lista_quitar('comunicadores', pg_temp.id('us', 14))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('l11: nor add a productor',
  $q$SELECT public.dps_lista_agregar('productores', pg_temp.id('us', 15))$q$, '22023', 'lista_invalida');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('l12: an added planner cannot add',
  $q$SELECT public.dps_lista_agregar('hosts', pg_temp.id('us', 15))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('l13: but reads the lists, not editable',
  $q$SELECT pg_temp.lista('hosts') || '|' || (public.dps_lista_leer('hosts') ->> 'puede_editar')$q$, 'ZZ Dlx U13|false');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('l14: a random user cannot read a list', $q$SELECT public.dps_lista_leer('hosts')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('l15: nor add without a session',
  $q$SELECT public.dps_lista_agregar('hosts', pg_temp.id('us', 15))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('l16: an unknown list is lista_invalida', $q$SELECT public.dps_lista_leer('bajistas')$q$, '22023', 'lista_invalida');
SELECT pg_temp.assert_raises('l16: cantantes are not added here',
  $q$SELECT public.dps_lista_agregar('cantantes', pg_temp.id('us', 15))$q$, '22023', 'lista_invalida');
SELECT pg_temp.assert_raises('l16: nor removed',
  $q$SELECT public.dps_lista_quitar('cantantes', pg_temp.id('us', 8))$q$, '22023', 'lista_invalida');
SELECT pg_temp.assert_raises('l17: an unknown persona is persona_invalida',
  $q$SELECT public.dps_lista_agregar('hosts', gen_random_uuid())$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_eq('l18: cantantes = the active servicios of Cantantes and below, not paused, not Global Music',
  $q$SELECT pg_temp.lista('cantantes') || '|' || (public.dps_lista_leer('cantantes') ->> 'puede_editar')$q$,
  'ZZ Dlx U08,ZZ Dlx U09,ZZ Dlx U17,ZZ Dlx U18,ZZ Dlx U19,ZZ Dlx U20,ZZ Dlx U21,ZZ Dlx U22,ZZ Dlx U23,ZZ Dlx U24|false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('l19: a servidor reads a list', $q$SELECT pg_temp.lista('comunicadores')$q$, 'ZZ Dlx U14');
RESET ROLE;
SELECT pg_temp.assert_raises('l21: the table only takes hosts and comunicadores',
  $q$INSERT INTO public.dps_listas_personas (lista, persona_id) VALUES ('productores', pg_temp.id('us', 15))$q$, '23514');
SET LOCAL ROLE authenticated;

-- ── c. cells (S12.3, S12.4) ──────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('c1: two productores and a written name, in order; the old key keeps the first',
  $q$SELECT pg_temp.celda(p, 'productor') || '|' || (p -> 'productor' ->> 'nombre') || '|' || (p -> 'productor' ->> 'persona_id' = pg_temp.id('us', 12)::text)
       FROM pg_temp.campo('pl_a', 'productor', jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 12)),
                                                                jsonb_build_object('texto', ' Invitada Ana '),
                                                                jsonb_build_object('persona_id', pg_temp.id('us', 11)))) p$q$,
  'ZZ Dlx U12,Invitada Ana*,ZZ Dlx U11|ZZ Dlx U12|true');
SELECT pg_temp.assert_raises('c2: four productores is demasiadas_personas',
  $q$SELECT pg_temp.campo('pl_a', 'productor', '[{"texto": "A"}, {"texto": "B"}, {"texto": "C"}, {"texto": "D"}]')$q$, '22023', 'demasiadas_personas');
SELECT pg_temp.assert_raises('c3: a persona off the productores list is persona_fuera_de_lista',
  $q$SELECT pg_temp.campo('pl_a', 'productor', jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 15))))$q$,
  '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_raises('c3: a paused productor is off the list',
  $q$SELECT pg_temp.campo('pl_a', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 25)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_raises('c3: someone only on Producción Creativa is not a productor',
  $q$SELECT pg_temp.campo('pl_a', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 27)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_eq('c3: someone below Productores is',
  $q$SELECT pg_temp.celda(pg_temp.campo('pl_b', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 26))), 'productor')$q$, 'ZZ Dlx U26');
SELECT pg_temp.assert_raises('c3: a host is not a productor',
  $q$SELECT pg_temp.campo('pl_a', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 13)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_eq('c4: the rejected writes left the cell as it was',
  $q$SELECT pg_temp.celda(public.dps_plan_leer(pg_temp.ctx('pl_a')::uuid), 'productor')$q$, 'ZZ Dlx U12,Invitada Ana*,ZZ Dlx U11');
SELECT pg_temp.assert_eq('c5: repeats are kept once (the same persona, the same name in other case)',
  $q$SELECT pg_temp.celda(pg_temp.campo('pl_a', 'host', jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 13)),
                                                                        jsonb_build_object('persona_id', pg_temp.id('us', 13)),
                                                                        jsonb_build_object('texto', 'Pedro'),
                                                                        jsonb_build_object('texto', 'pedro'))), 'host')$q$,
  'ZZ Dlx U13,Pedro*');
SELECT pg_temp.assert_eq('c6: a written name is always fine (no list needed), one object as before',
  $q$SELECT pg_temp.celda(p, 'comunicador') || '|' || (p -> 'comunicador' ->> 'texto')
       FROM pg_temp.campo('pl_a', 'comunicador', '{"texto": "Pastor invitado"}') p$q$, 'Pastor invitado*|Pastor invitado');
RESET ROLE;
UPDATE public.dream_team_servicios SET estado = 'en_pausa' WHERE id = pg_temp.id('se', 11);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_eq('l20: pausing U11 in Productores takes them off the list',
  $q$SELECT pg_temp.lista('productores')$q$, 'ZZ Dlx U12,ZZ Dlx U26');
SELECT pg_temp.assert_eq('c7: someone already in the cell stays after leaving the list',
  $q$SELECT pg_temp.celda(pg_temp.campo('pl_a', 'productor', jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 11)),
                                                                            jsonb_build_object('persona_id', pg_temp.id('us', 12)))), 'productor')$q$,
  'ZZ Dlx U11,ZZ Dlx U12');
SELECT pg_temp.assert_raises('c8: but cannot be added to another plan',
  $q$SELECT pg_temp.campo('pl_b', 'productor', jsonb_build_object('persona_id', pg_temp.id('us', 11)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_eq('c9: [] clears the cell and the old columns',
  $q$SELECT pg_temp.celda(p, 'productor') || '|' || coalesce(p ->> 'productor', '-')
       FROM pg_temp.campo('pl_a', 'productor', '[]') p$q$, '|-');
SELECT pg_temp.assert_eq('c10: null clears too',
  $q$SELECT pg_temp.celda(p, 'host') || '|' || coalesce(p ->> 'host', '-') FROM pg_temp.campo('pl_a', 'host', 'null') p$q$, '|-');
SELECT pg_temp.assert_eq('c11: eight cantantes of the Cantantes sub-equipo; campos.cantantes follows the names',
  $q$SELECT jsonb_array_length(p -> 'personas' -> 'cantantes') || '|' || (p -> 'campos' ->> 'cantantes')
       FROM pg_temp.campo('pl_a', 'cantantes', (SELECT jsonb_agg(jsonb_build_object('persona_id', pg_temp.id('us', n)) ORDER BY n)
                                                FROM unnest(ARRAY[8, 9, 17, 18, 19, 20, 21]) n) || '[{"texto": "Coro invitado"}]') p$q$,
  '8|ZZ Dlx U08, ZZ Dlx U09, ZZ Dlx U17, ZZ Dlx U18, ZZ Dlx U19, ZZ Dlx U20, ZZ Dlx U21, Coro invitado');
SELECT pg_temp.assert_raises('c12: nine cantantes is demasiadas_personas',
  $q$SELECT pg_temp.campo('pl_a', 'cantantes', (SELECT jsonb_agg(jsonb_build_object('persona_id', pg_temp.id('us', n)))
                                                FROM unnest(ARRAY[8, 9, 17, 18, 19, 20, 21, 22, 23]) n))$q$, '22023', 'demasiadas_personas');
SELECT pg_temp.assert_raises('c13: a paused cantante is off the list',
  $q$SELECT pg_temp.campo('pl_b', 'cantantes', jsonb_build_object('persona_id', pg_temp.id('us', 10)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_raises('c13: someone on Global Music is not a cantante',
  $q$SELECT pg_temp.campo('pl_b', 'cantantes', jsonb_build_object('persona_id', pg_temp.id('us', 6)))$q$, '22023', 'persona_fuera_de_lista');
SELECT pg_temp.assert_eq('c14: cantantes still take a plain string (one written name)',
  $q$SELECT pg_temp.celda(p, 'cantantes') || '|' || (p -> 'campos' ->> 'cantantes')
       FROM pg_temp.campo('pl_b', 'cantantes', '" Ana y Luis "') p$q$, 'Ana y Luis*|Ana y Luis');
SELECT pg_temp.assert_eq('c15: an empty string clears them and the campo',
  $q$SELECT pg_temp.celda(p, 'cantantes') || '|' || (p -> 'campos' ? 'cantantes') FROM pg_temp.campo('pl_b', 'cantantes', '""') p$q$, '|false');
SELECT pg_temp.assert_raises('c16: a written productor over 120 characters is valor_invalido',
  $q$SELECT pg_temp.campo('pl_b', 'productor', jsonb_build_array(jsonb_build_object('texto', repeat('a', 121))))$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('c17: an element that is not an object is valor_invalido',
  $q$SELECT pg_temp.campo('pl_b', 'host', '["Ana"]')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('c18: a plain string for host is valor_invalido',
  $q$SELECT pg_temp.campo('pl_b', 'host', '"Ana"')$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('c19: persona and text in one element is persona_o_texto',
  $q$SELECT pg_temp.campo('pl_b', 'host', jsonb_build_array(jsonb_build_object('persona_id', pg_temp.id('us', 13), 'texto', 'X')))$q$,
  '22023', 'persona_o_texto');
SELECT pg_temp.assert_raises('c20: an unknown persona is persona_invalida (before the list)',
  $q$SELECT pg_temp.campo('pl_b', 'host', jsonb_build_array(jsonb_build_object('persona_id', gen_random_uuid())))$q$, '22023', 'persona_invalida');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('c21: editing a list does not let someone who does not plan edit the sheet',
  $q$SELECT pg_temp.campo('pl_b', 'productor', '{"texto": "X"}')$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_raises('c22: the table refuses persona and text together',
  $q$INSERT INTO public.dps_plan_personas (plan_id, columna, posicion, persona_id, texto)
     VALUES (pg_temp.ctx('pl_b')::uuid, 'host', 0, pg_temp.id('us', 13), 'X')$q$, '23514');
SELECT pg_temp.assert_eq('c23: the stored cells of the plan: one comunicador and eight cantantes',
  $q$SELECT string_agg(columna || ':' || n, ',' ORDER BY columna)
       FROM (SELECT columna, count(*) AS n FROM public.dps_plan_personas WHERE plan_id = pg_temp.ctx('pl_a')::uuid GROUP BY columna) x$q$,
  'cantantes:8,comunicador:1');

-- ── e. existing values (S12.4), over the real plans ──────────────────

SELECT pg_temp.assert_eq('e1: every plan''s old productor, host and comunicador is the first entry of its cell',
  $q$SELECT count(*)::text
       FROM public.dps_planes p
      CROSS JOIN LATERAL (VALUES ('productor', p.productor_persona_id, p.productor_texto), ('host', p.host_persona_id, p.host_texto),
                                 ('comunicador', p.comunicador_persona_id, p.comunicador_texto)) AS c(columna, persona_id, texto)
      WHERE ROW(c.persona_id, c.texto) IS DISTINCT FROM (
              SELECT ROW(pp.persona_id, pp.texto) FROM public.dps_plan_personas pp
               WHERE pp.plan_id = p.id AND pp.columna = c.columna ORDER BY pp.posicion LIMIT 1)
        AND num_nonnulls(c.persona_id, c.texto) = 1$q$, '0');
SELECT pg_temp.assert_eq('e2: a text in campos.cantantes has its cell',
  $q$SELECT count(*)::text FROM public.dps_planes p
      WHERE nullif(btrim(p.campos ->> 'cantantes'), '') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.dps_plan_personas pp WHERE pp.plan_id = p.id AND pp.columna = 'cantantes')$q$, '0');

-- ── h. T13c ──────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('h1: four services are fine (sorted, without repeats)',
  $q$SELECT (pg_temp.campo('pl_b', 'horarios', '["12:00", "08:00", "10:00", "18:30", "10:00"]') -> 'horarios')::text$q$,
  '["08:00", "10:00", "12:00", "18:30"]');
SELECT pg_temp.assert_raises('h2: five are horarios_invalidos',
  $q$SELECT pg_temp.campo('pl_b', 'horarios', '["08:00", "10:00", "12:00", "14:00", "18:30"]')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('h3: a first service before the llegada is llegada_invalida',
  $q$SELECT pg_temp.campo('pl_b', 'horarios', '["06:30"]')$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_raises('h4: a llegada after the first service is llegada_invalida',
  $q$SELECT pg_temp.campo('pl_b', 'llegada', '"08:01"')$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_eq('h5: a llegada at the first service is fine',
  $q$SELECT pg_temp.campo('pl_b', 'llegada', '"08:00"') ->> 'llegada'$q$, '08:00');
SELECT pg_temp.assert_raises('h6: dps_config_guardar refuses five services',
  $q$SELECT public.dps_config_guardar('["08:00", "10:00", "12:00", "14:00", "18:30"]'::jsonb, '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('h7: and a llegada after the first service',
  $q$SELECT public.dps_config_guardar('["09:15", "11:15"]'::jsonb, '09:16')$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_eq('h8: four services with the llegada at the first are fine',
  $q$SELECT public.dps_config_guardar('["18:30", "08:00", "10:00", "12:00"]'::jsonb, '08:00')::text$q$,
  '{"llegada": "08:00", "horarios": ["08:00", "10:00", "12:00", "18:30"]}');
RESET ROLE;
SELECT pg_temp.assert_eq('h9: dps_orden_item_guardar and dps_orden_mover check the row again after the plan lock',
  $q$SELECT string_agg(p.proname || ':' || (regexp_count(p.prosrc, 'item_invalido') >= 2
                                            AND p.prosrc ~ 'FOR UPDATE;[^;]*\n[^;]*SELECT o\.[^;]*FROM public\.dps_orden_items o WHERE o\.id = p_item_id;\s*IF NOT FOUND'), ','
                       ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_orden_item_guardar', 'dps_orden_mover')$q$,
  'dps_orden_item_guardar:true,dps_orden_mover:true');

-- Last: the plan with cells goes.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c24: deleting a plan takes its cells',
  $q$SELECT public.dps_plan_eliminar(pg_temp.ctx('pl_a')::uuid, false)::text$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('c24: no cell of it is left',
  $q$SELECT count(*)::text FROM public.dps_plan_personas WHERE plan_id = pg_temp.ctx('pl_a')::uuid$q$, '0');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dl_failures);
END;
$$;
