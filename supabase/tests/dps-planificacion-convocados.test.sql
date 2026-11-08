-- T8b (odd/tasks/dps-asistencia-pco.md, S6.1, S6.2, S7.4, S2, S5) — DPS
-- convocados and attendance (20261108202000_dps_planificacion_convocados.sql).
-- Needs both T8a migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Privileges: dps_convocados and dps_asistencias have RLS on, no
--      policies and are not readable or writable by authenticated; the new
--      functions are SECURITY DEFINER with search_path ''; authenticated
--      executes exactly the public ones; anon none; the internal helpers are
--      closed.
--   b. dps_convocar: only planners; a person in two puestos of the same plan
--      (S7.4), a Cámaras servicio in a Producción Técnica puesto; idempotent;
--      servicio outside the puesto's subtree, of another experiencia, unknown
--      or not activo; unknown plan; unknown or inactive puesto; persona_id is
--      the servicio's; the table refuses a duplicate.
--   c. dps_plan_equipos: equipos -> puestos with cantidad, convocados, falta
--      (never below 0), an inactive puesto that still has convocados, per
--      equipo counts, totals, puede_editar; permissions.
--   d. dps_candidatos_puesto: the active servicios of the puesto's subtree,
--      ya_convocado_en_plan / en_este_puesto first-unconvocated order, puestos
--      already held that day (also in another plan of the same date),
--      busqueda (wildcards escaped, too long), permissions.
--   e. dps_plan_anterior: the previous plan of the same tipo.
--   f. dps_copiar_plan: copies, skips inactive puestos and servicios no
--      longer activo, destino_con_convocados, reemplazar, same/unknown plan,
--      permissions; dps_desconvocar.
--   h. dps_asistencia_planilla: Cámaras coordinator only Cámaras (and not
--      another equipo through p_equipo), coordinator of a disabled equipo
--      nothing, planner all of DPS; equipo filter = subtree; one row per
--      person with their puestos; otros; counts; editable window.
--   i. dps_asistencia_marcar: one row per person per plan however many puestos
--      (S6.1), authority per equipo, vino sin convocar ('llego' only, active
--      DPS servicio), persona_invalida, estado_invalido, demasiados,
--      fecha_invalida (future, more than 14 days), the -14 edge,
--      solo_sin_marcar, re-mark no-op, clear, empty list.
--   j. convocado follows convocar/desconvocar; an aviso of someone no longer
--      convocado is dropped.
--   k. dps_asistencia_marcar_equipo: marks only the unmarked convocados of
--      that equipo, NULL clears, permissions and validations.
--   l. dps_historial_persona: llego / aviso_no_viene / no_vino / pendiente /
--      vino_sin_convocar, resumen; the person themself and planners only.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Dc"):
--   1 ADMIN   system admin
--   2 DIR     dream_team.direct on the DPS node (plans)
--   3 CAM     dream_team.coordinate on ZZ Dc Camaras
--   4 MED     dream_team.coordinate on ZZ Dc Media (attendance disabled there)
--   5 A       active servicio in Camaras (two puestos in the same plan)
--   6 B       active servicio in Camaras
--   7 C       active servicio in Media
--   8 D       active servicio in Camaras, paused before copying
--   9 E       active servicio in Camaras, comes without being convocado
--   10 F      active servicio in Sonido
--   11 RANDOM nothing
--   12 NINOS  active servicio in ZZ Dc Ninos (another experiencia)
-- Equipos: 1 ZZ Dc PT (dps, under DPS) › 2 ZZ Dc Camaras, 3 ZZ Dc Sonido;
-- 4 ZZ Dc Media (dps, under DPS); 5 ZZ Dc Ninos (ninos, root).
-- Plans: dom(k) = the k-th Sunday of 2097 (pl_d1..pl_d3, pl_esp on dom(1),
-- pl_cena on dom(1) + 2); 'especial' plans relative to ninos_hoy(): pl_hoy,
-- pl_14 (-14), pl_15 (-15), pl_fut (+1).

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dc_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dc_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9600000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd961' WHEN 'us' THEN 'd962' WHEN 'eq' THEN 'd963'
                       WHEN 'ro' THEN 'd964' WHEN 'se' THEN 'd965' END,
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

-- The k-th Sunday of 2097.
CREATE OR REPLACE FUNCTION pg_temp.dom(p_k int) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT DATE '2097-01-01' + ((7 - extract(dow FROM DATE '2097-01-01')::int) % 7) + 7 * (p_k - 1);
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.hoy() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('hoy')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.personas(p_ns int[]) RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY(SELECT pg_temp.id('us', n) FROM unnest(p_ns) AS n);
$$;

-- dps_convocar with keys: plan key, puesto key, servicio n.
CREATE OR REPLACE FUNCTION pg_temp.convocar(p_plan text, p_puesto text, p_servicio int) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dps_convocar(pg_temp.plan(p_plan), pg_temp.ctx(p_puesto)::uuid, pg_temp.id('se', p_servicio));
END;
$$;

-- dps_asistencia_marcar as 'personas/cambiados'.
CREATE OR REPLACE FUNCTION pg_temp.marcar(p_plan text, p_ns int[], p_estado text, p_solo boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  v := public.dps_asistencia_marcar(pg_temp.plan(p_plan), pg_temp.personas(p_ns), p_estado, p_solo);
  RETURN (v ->> 'personas') || '/' || (v ->> 'cambiados');
END;
$$;

-- dps_plan_equipos, fixture equipos only, as
-- 'Equipo(convocados/falta)[puesto:cantidad:falta:apellidos(+)(! inactive),...] ...'.
CREATE OR REPLACE FUNCTION pg_temp.equipos(p_plan text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(
            replace(e ->> 'equipo', 'ZZ Dc ', '') || '(' || (e ->> 'convocados') || '/' || (e ->> 'falta') || ')['
            || (SELECT string_agg((p ->> 'nombre') || ':' || (p ->> 'cantidad') || ':' || (p ->> 'falta') || ':'
                                  || coalesce((SELECT string_agg(split_part(c ->> 'nombre', ' ', 3), '+' ORDER BY co)
                                                 FROM jsonb_array_elements(p -> 'convocados') WITH ORDINALITY AS w(c, co)), '')
                                  || CASE WHEN (p ->> 'activo')::boolean THEN '' ELSE '!' END, ',' ORDER BY po)
                  FROM jsonb_array_elements(e -> 'puestos') WITH ORDINALITY AS y(p, po)) || ']', ' ' ORDER BY eo), '')
            FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan(p_plan)) -> 'equipos') WITH ORDINALITY AS z(e, eo)
           WHERE e ->> 'equipo' LIKE 'ZZ Dc %');
END;
$$;

-- dps_asistencia_planilla, fixture equipos only, as
-- 'Equipo(llegaron/por_llegar/aviso):apellido+mark(L llego, A aviso, - none)(* sin convocar),... +otros | ...'.
CREATE OR REPLACE FUNCTION pg_temp.planilla(p_plan text, p_equipo uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(
            replace(e ->> 'equipo', 'ZZ Dc ', '') || '(' || (e ->> 'llegaron') || '/' || (e ->> 'por_llegar') || '/' || (e ->> 'aviso') || '):'
            || coalesce((SELECT string_agg((p ->> 'apellido')
                                           || CASE p ->> 'estado' WHEN 'llego' THEN 'L' WHEN 'aviso_no_viene' THEN 'A' ELSE '-' END
                                           || CASE WHEN (p ->> 'convocado')::boolean THEN '' ELSE '*' END, ',' ORDER BY po)
                           FROM jsonb_array_elements(e -> 'personas') WITH ORDINALITY AS x(p, po)), '')
            || coalesce(' +' || (SELECT string_agg(q ->> 'apellido', ',' ORDER BY qo)
                                   FROM jsonb_array_elements(e -> 'otros') WITH ORDINALITY AS y(q, qo)), ''),
            ' | ' ORDER BY eo), '')
            FROM jsonb_array_elements(public.dps_asistencia_planilla(pg_temp.plan(p_plan), p_equipo) -> 'equipos')
                 WITH ORDINALITY AS z(e, eo)
           WHERE e ->> 'equipo' LIKE 'ZZ Dc %');
END;
$$;

-- dps_candidatos_puesto, fixture people only, as
-- 'apellido:ya_convocado_en_plan en_este_puesto:puestos del dia:de otro plan,...'.
CREATE OR REPLACE FUNCTION pg_temp.candidatos(p_puesto text, p_plan text, p_busqueda text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(c.apellido || ':' || c.ya_convocado_en_plan::int || c.en_este_puesto::int || ':'
                                     || jsonb_array_length(c.puestos_del_dia) || ':'
                                     || (SELECT count(*) FROM jsonb_array_elements(c.puestos_del_dia) d
                                          WHERE NOT (d ->> 'mismo_plan')::boolean), ',' ORDER BY c.ordinality), '')
            FROM public.dps_candidatos_puesto(pg_temp.ctx(p_puesto)::uuid, pg_temp.plan(p_plan), p_busqueda) WITH ORDINALITY c
           WHERE c.nombre = 'ZZ Dc');
END;
$$;

-- dps_historial_persona as 'titulo-or-tipo:estado:puestos(+),...'.
CREATE OR REPLACE FUNCTION pg_temp.historial(p_n int, p_desde date, p_hasta date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(coalesce(p ->> 'titulo', p ->> 'tipo') || ':' || (p ->> 'estado') || ':'
                                     || coalesce((SELECT string_agg(x ->> 'puesto', '+' ORDER BY xo)
                                                    FROM jsonb_array_elements(p -> 'puestos') WITH ORDINALITY AS y(x, xo)), ''),
                                     ',' ORDER BY po), '')
            FROM jsonb_array_elements(public.dps_historial_persona(pg_temp.id('us', p_n), p_desde, p_hasta) -> 'planes')
                 WITH ORDINALITY AS z(p, po));
END;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dc_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_dc_ctx (k, v) VALUES ('hoy', public.ninos_hoy()::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 12) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Dc', 'U' || n, 'dc-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 12) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9600000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps',   pg_temp.ctx('raiz')::uuid, 'ZZ Dc PT',      true),
  (pg_temp.id('eq', 2), 'dps',   pg_temp.id('eq', 1),       'ZZ Dc Camaras', true),
  (pg_temp.id('eq', 3), 'dps',   pg_temp.id('eq', 1),       'ZZ Dc Sonido',  true),
  (pg_temp.id('eq', 4), 'dps',   pg_temp.ctx('raiz')::uuid, 'ZZ Dc Media',   true),
  (pg_temp.id('eq', 5), 'ninos', NULL,                      'ZZ Dc Ninos',   true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', n), 'Voluntario', 'voluntario', true FROM generate_series(1, 5) AS n;

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', x.n), pg_temp.id('us', x.n), pg_temp.id('eq', x.eq), pg_temp.id('ro', x.eq), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (5, 2), (6, 2), (7, 4), (8, 2), (9, 2), (10, 3), (12, 5)) AS x(n, eq);

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 12) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT pg_temp.id('us', x.n), x.cap, 'dream_team', 'equipo', x.scope, 'zz-test'
  FROM (VALUES (2, 'dream_team.direct', pg_temp.ctx('raiz')),
               (3, 'dream_team.coordinate', pg_temp.id('eq', 2)::text),
               (4, 'dream_team.coordinate', pg_temp.id('eq', 4)::text),
               (5, 'dream_team.serve', pg_temp.id('eq', 2)::text),
               (6, 'dream_team.serve', pg_temp.id('eq', 2)::text),
               (7, 'dream_team.serve', pg_temp.id('eq', 4)::text),
               (8, 'dream_team.serve', pg_temp.id('eq', 2)::text),
               (9, 'dream_team.serve', pg_temp.id('eq', 2)::text),
               (10, 'dream_team.serve', pg_temp.id('eq', 3)::text),
               (12, 'dream_team.serve', pg_temp.id('eq', 5)::text)) AS x(n, cap, scope);

GRANT INSERT, SELECT, UPDATE ON t_dc_failures, t_dc_ctx TO authenticated, anon;
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

SELECT pg_temp.assert_eq('a1: the two tables have RLS on and no policies',
  $q$SELECT string_agg(c.relname || ':' || c.relrowsecurity || ':' || (SELECT count(*) FROM pg_policy po WHERE po.polrelid = c.oid),
                       ',' ORDER BY c.relname COLLATE "C")
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN ('dps_convocados', 'dps_asistencias')$q$,
  'dps_asistencias:true:0,dps_convocados:true:0');
SELECT pg_temp.assert_eq('a2: the new functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'dps_subarbol', 'dps_en_subarbol', 'dps_equipos_asistibles', 'dps_iniciales', 'dps_asistencia_resincronizar',
        'dps_asistencia_escribir', 'dps_convocar', 'dps_desconvocar', 'dps_copiar_plan', 'dps_plan_anterior',
        'dps_candidatos_puesto', 'dps_plan_equipos', 'dps_asistencia_planilla', 'dps_asistencia_marcar',
        'dps_asistencia_marcar_equipo', 'dps_historial_persona')$q$, '16|0');
SELECT pg_temp.assert_eq('a3: authenticated executes exactly the public new functions',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND p.proname IN (
        'dps_subarbol', 'dps_en_subarbol', 'dps_equipos_asistibles', 'dps_iniciales', 'dps_asistencia_resincronizar',
        'dps_asistencia_escribir', 'dps_convocar', 'dps_desconvocar', 'dps_copiar_plan', 'dps_plan_anterior',
        'dps_candidatos_puesto', 'dps_plan_equipos', 'dps_asistencia_planilla', 'dps_asistencia_marcar',
        'dps_asistencia_marcar_equipo', 'dps_historial_persona')$q$,
  'dps_asistencia_marcar,dps_asistencia_marcar_equipo,dps_asistencia_planilla,dps_candidatos_puesto,dps_convocar,'
  || 'dps_copiar_plan,dps_desconvocar,dps_historial_persona,dps_plan_anterior,dps_plan_equipos');
SELECT pg_temp.assert_eq('a4: anon executes no dps_* function',
  $q$SELECT coalesce(string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C"), '-') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_%'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$, '-');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a5: authenticated cannot read dps_convocados', $q$SELECT count(*) FROM public.dps_convocados$q$, '42501');
SELECT pg_temp.assert_raises('a5: authenticated cannot read dps_asistencias', $q$SELECT count(*) FROM public.dps_asistencias$q$, '42501');
SELECT pg_temp.assert_raises('a5: authenticated cannot write dps_asistencias',
  $q$INSERT INTO public.dps_asistencias (plan_id, persona_id, estado, convocado) VALUES (gen_random_uuid(), gen_random_uuid(), 'llego', false)$q$,
  '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_asistencia_escribir',
  $q$SELECT public.dps_asistencia_escribir(gen_random_uuid(), NULL, ARRAY[]::uuid[], ARRAY[]::boolean[], NULL, false)$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_equipos_asistibles',
  $q$SELECT count(*) FROM public.dps_equipos_asistibles()$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_asistencia_resincronizar',
  $q$SELECT public.dps_asistencia_resincronizar(gen_random_uuid(), NULL)$q$, '42501');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('a7: anon cannot execute dps_asistencia_planilla',
  $q$SELECT public.dps_asistencia_planilla(gen_random_uuid(), NULL)$q$, '42501');
SELECT pg_temp.assert_raises('a7: anon cannot execute dps_convocar',
  $q$SELECT public.dps_convocar(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$q$, '42501');
RESET ROLE;

-- ── setup (as the DPS director) ──────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('pu_cam', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Camara', 3, NULL)::text$q$);
SELECT pg_temp.put('pu_sw', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Switcher', 1, NULL)::text$q$);
SELECT pg_temp.put('pu_viejo', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 2), 'Viejo', 1, NULL)::text$q$);
SELECT pg_temp.put('pu_pt', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'Jefe PT', 1, NULL)::text$q$);
SELECT pg_temp.put('pu_proy', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 4), 'Proyeccion', 1, NULL)::text$q$);
SELECT pg_temp.put('ok_media', $q$SELECT 'ok' FROM public.dps_pasan_asistencia_guardar(pg_temp.id('eq', 4), false)$q$);
SELECT pg_temp.put('pl_d1', $q$SELECT public.dps_plan_crear(pg_temp.dom(1), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('pl_d2', $q$SELECT public.dps_plan_crear(pg_temp.dom(2), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('pl_d3', $q$SELECT public.dps_plan_crear(pg_temp.dom(3), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('pl_cena', $q$SELECT public.dps_plan_crear(pg_temp.dom(1) + 2, 'cena_del_senor', 'ZZ Dc cena')::text$q$);
SELECT pg_temp.put('pl_esp', $q$SELECT public.dps_plan_crear(pg_temp.dom(1), 'especial', 'ZZ Dc especial')::text$q$);
SELECT pg_temp.put('pl_hoy', $q$SELECT public.dps_plan_crear(pg_temp.hoy(), 'especial', 'ZZ Dc hoy')::text$q$);
SELECT pg_temp.put('pl_14', $q$SELECT public.dps_plan_crear(pg_temp.hoy() - 14, 'especial', 'ZZ Dc 14')::text$q$);
SELECT pg_temp.put('pl_15', $q$SELECT public.dps_plan_crear(pg_temp.hoy() - 15, 'especial', 'ZZ Dc 15')::text$q$);
SELECT pg_temp.put('pl_fut', $q$SELECT public.dps_plan_crear(pg_temp.hoy() + 1, 'especial', 'ZZ Dc fut')::text$q$);

-- ── b. convocar ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('b1: a coordinator cannot convocar',
  $q$SELECT pg_temp.convocar('pl_d1', 'pu_cam', 5)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('cv_a_cam', $q$SELECT pg_temp.convocar('pl_d1', 'pu_cam', 5)::text$q$);
SELECT pg_temp.assert_eq('b2: the same person in a second puesto of the same plan, a Camaras servicio in a PT puesto (S7.4)',
  $q$SELECT (pg_temp.convocar('pl_d1', 'pu_pt', 5) IS DISTINCT FROM pg_temp.ctx('cv_a_cam')::uuid)::text$q$, 'true');
SELECT pg_temp.put('cv_b_cam', $q$SELECT pg_temp.convocar('pl_d1', 'pu_cam', 6)::text$q$);
SELECT pg_temp.put('cv_d_sw', $q$SELECT pg_temp.convocar('pl_d1', 'pu_sw', 8)::text$q$);
SELECT pg_temp.put('cv_c_proy', $q$SELECT pg_temp.convocar('pl_d1', 'pu_proy', 7)::text$q$);
SELECT pg_temp.put('cv_f_pt', $q$SELECT pg_temp.convocar('pl_d1', 'pu_pt', 10)::text$q$);
SELECT pg_temp.put('cv_b_viejo', $q$SELECT pg_temp.convocar('pl_d1', 'pu_viejo', 6)::text$q$);
SELECT pg_temp.assert_eq('b3: convocar again is idempotent (same id)',
  $q$SELECT (pg_temp.convocar('pl_d1', 'pu_cam', 5) = pg_temp.ctx('cv_a_cam')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_raises('b4: a Sonido servicio in a Camaras puesto is servicio_invalido',
  $q$SELECT pg_temp.convocar('pl_d1', 'pu_cam', 10)$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('b5: a servicio of another experiencia is servicio_invalido',
  $q$SELECT pg_temp.convocar('pl_d1', 'pu_pt', 12)$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('b6: an unknown servicio is servicio_invalido',
  $q$SELECT public.dps_convocar(pg_temp.plan('pl_d1'), pg_temp.ctx('pu_cam')::uuid, gen_random_uuid())$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('b7: an unknown plan is plan_invalido',
  $q$SELECT public.dps_convocar(gen_random_uuid(), pg_temp.ctx('pu_cam')::uuid, pg_temp.id('se', 5))$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_raises('b8: an unknown puesto is puesto_invalido',
  $q$SELECT public.dps_convocar(pg_temp.plan('pl_d1'), gen_random_uuid(), pg_temp.id('se', 5))$q$, '22023', 'puesto_invalido');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('b9: without a session convocar is sin_autoridad',
  $q$SELECT pg_temp.convocar('pl_d1', 'pu_cam', 9)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
RESET ROLE;
SELECT pg_temp.assert_eq('b10: stored rows: persona_id is the servicio''s, A holds two puestos, created_by the director',
  $q$SELECT count(*) || '|' || bool_and(c.persona_id = s.persona_id) || '|' || count(*) FILTER (WHERE c.persona_id = pg_temp.id('us', 5))
            || '|' || bool_and(c.created_by = pg_temp.id('us', 2))
       FROM public.dps_convocados c JOIN public.dream_team_servicios s ON s.id = c.servicio_id
      WHERE c.plan_id = pg_temp.plan('pl_d1')$q$, '7|true|2|true');
SELECT pg_temp.assert_raises('b11: the table refuses the same person twice in the same puesto and plan',
  $q$INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id)
     VALUES (pg_temp.plan('pl_d1'), pg_temp.ctx('pu_cam')::uuid, pg_temp.id('se', 5), pg_temp.id('us', 5))$q$, '23505');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_eq('b12: deactivating Viejo', $q$SELECT 'ok' FROM public.dps_puesto_desactivar(pg_temp.ctx('pu_viejo')::uuid)$q$, 'ok');
SELECT pg_temp.assert_raises('b13: an inactive puesto is puesto_invalido',
  $q$SELECT pg_temp.convocar('pl_d1', 'pu_viejo', 9)$q$, '22023', 'puesto_invalido');

-- ── c. plan equipos ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('c1: a servidor reads the Equipos tab: puestos, convocados, falta, the inactive puesto with convocados',
  $q$SELECT pg_temp.equipos('pl_d1')$q$,
  'Media(1/0)[Proyeccion:1:0:U7] PT(2/0)[Jefe PT:1:0:U10+U5] Camaras(3/1)[Camara:3:1:U5+U6,Switcher:1:0:U8,Viejo:1:0:U6!]');
SELECT pg_temp.assert_eq('c2: a servidor cannot edit; totals count each person once',
  $q$SELECT (v ->> 'puede_editar') || '|' || (v ->> 'convocados') FROM public.dps_plan_equipos(pg_temp.plan('pl_d1')) v$q$, 'false|5');
SELECT pg_temp.assert_eq('c3: a convocado carries name and initials',
  $q$SELECT c ->> 'nombre' || '|' || (c ->> 'iniciales')
       FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan('pl_d1')) -> 'equipos') e,
            jsonb_array_elements(e -> 'puestos') p, jsonb_array_elements(p -> 'convocados') c
      WHERE p ->> 'nombre' = 'Proyeccion' AND e ->> 'equipo' = 'ZZ Dc Media'$q$, 'ZZ Dc U7|ZU');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c4: the director can edit', $q$SELECT public.dps_plan_equipos(pg_temp.plan('pl_d1')) ->> 'puede_editar'$q$, 'true');
SELECT pg_temp.assert_raises('c5: an unknown plan is plan_invalido',
  $q$SELECT public.dps_plan_equipos(gen_random_uuid())$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_raises('c6: a random user cannot read it', $q$SELECT pg_temp.equipos('pl_d1')$q$, '42501', 'sin_autoridad');

-- ── d. candidatos ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
-- E is convocado in another plan of the same day.
SELECT pg_temp.put('cv_e_esp', $q$SELECT pg_temp.convocar('pl_esp', 'pu_sw', 9)::text$q$);
SELECT pg_temp.assert_eq('d1: Camaras candidates: unconvocated first, flags and the puestos of the day',
  $q$SELECT pg_temp.candidatos('pu_cam', 'pl_d1')$q$, 'U9:00:1:1,U5:11:2:0,U6:11:2:0,U8:10:1:0');
SELECT pg_temp.assert_eq('d2: a PT puesto takes the whole PT subtree (Camaras and Sonido)',
  $q$SELECT pg_temp.candidatos('pu_pt', 'pl_d1')$q$, 'U9:00:1:1,U10:11:1:0,U5:11:2:0,U6:10:2:0,U8:10:1:0');
SELECT pg_temp.assert_eq('d3: busqueda by name, case-insensitive', $q$SELECT pg_temp.candidatos('pu_cam', 'pl_d1', ' u9 ')$q$, 'U9:00:1:1');
SELECT pg_temp.assert_eq('d4: wildcards in busqueda are literal', $q$SELECT pg_temp.candidatos('pu_cam', 'pl_d1', '%')$q$, '');
SELECT pg_temp.assert_eq('d5: a puesto of the day carries its plan and puesto',
  $q$SELECT (c.puestos_del_dia -> 0 ->> 'puesto') || '|' || (c.puestos_del_dia -> 0 ->> 'titulo') || '|' || (c.puestos_del_dia -> 0 ->> 'mismo_plan')
       FROM public.dps_candidatos_puesto(pg_temp.ctx('pu_cam')::uuid, pg_temp.plan('pl_d1'), 'U9') c$q$, 'Switcher|ZZ Dc especial|false');
SELECT pg_temp.assert_raises('d6: a busqueda over 100 characters is busqueda_invalida',
  $q$SELECT pg_temp.candidatos('pu_cam', 'pl_d1', repeat('x', 101))$q$, '22023', 'busqueda_invalida');
SELECT pg_temp.assert_raises('d7: an inactive puesto is puesto_invalido',
  $q$SELECT pg_temp.candidatos('pu_viejo', 'pl_d1')$q$, '22023', 'puesto_invalido');
SELECT pg_temp.assert_raises('d8: an unknown plan is plan_invalido',
  $q$SELECT count(*) FROM public.dps_candidatos_puesto(pg_temp.ctx('pu_cam')::uuid, gen_random_uuid(), NULL)$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d9: a coordinator cannot list candidates',
  $q$SELECT pg_temp.candidatos('pu_cam', 'pl_d1')$q$, '42501', 'sin_autoridad');

-- ── e. plan anterior ─────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e1: the previous Sunday, skipping a Cena del Señor in between',
  $q$SELECT (public.dps_plan_anterior(pg_temp.plan('pl_d2')) = pg_temp.plan('pl_d1'))::text$q$, 'true');
SELECT pg_temp.assert_eq('e2: the one before pl_d3 is pl_d2',
  $q$SELECT (public.dps_plan_anterior(pg_temp.plan('pl_d3')) = pg_temp.plan('pl_d2'))::text$q$, 'true');
SELECT pg_temp.assert_raises('e3: an unknown plan is plan_invalido',
  $q$SELECT public.dps_plan_anterior(gen_random_uuid())$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_raises('e4: a random user cannot ask', $q$SELECT public.dps_plan_anterior(pg_temp.plan('pl_d2'))$q$, '42501', 'sin_autoridad');

-- ── f. copiar and desconvocar ────────────────────────────────────────

RESET ROLE;
UPDATE public.dream_team_servicios SET estado = 'en_pausa', motivo_actual = 'admin_pausa' WHERE id = pg_temp.id('se', 8);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('f1: a coordinator cannot copy',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d1'), pg_temp.plan('pl_d2'), false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f2: copying skips the paused servicio and the inactive puesto',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d1'), pg_temp.plan('pl_d2'))::text$q$, '{"copiados": 5, "omitidos": 2}');
SELECT pg_temp.assert_eq('f3: the copy', $q$SELECT pg_temp.equipos('pl_d2')$q$,
  'Media(1/0)[Proyeccion:1:0:U7] PT(2/0)[Jefe PT:1:0:U10+U5] Camaras(2/2)[Camara:3:1:U5+U6,Switcher:1:1:]');
SELECT pg_temp.assert_raises('f4: a destino with convocados is destino_con_convocados',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d1'), pg_temp.plan('pl_d2'), false)$q$, '22023', 'destino_con_convocados');
SELECT pg_temp.assert_eq('f5: desconvocar', $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_d2'), pg_temp.ctx('pu_proy')::uuid, pg_temp.id('us', 7))::text$q$, 'true');
SELECT pg_temp.assert_eq('f6: desconvocar again is false',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_d2'), pg_temp.ctx('pu_proy')::uuid, pg_temp.id('us', 7))::text$q$, 'false');
SELECT pg_temp.put('cv_e_d2', $q$SELECT pg_temp.convocar('pl_d2', 'pu_sw', 9)::text$q$);
SELECT pg_temp.assert_eq('f7: after the edits', $q$SELECT pg_temp.equipos('pl_d2')$q$,
  'Media(0/1)[Proyeccion:1:1:] PT(2/0)[Jefe PT:1:0:U10+U5] Camaras(3/1)[Camara:3:1:U5+U6,Switcher:1:0:U9]');
SELECT pg_temp.assert_eq('f8: reemplazar replaces the destino',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d1'), pg_temp.plan('pl_d2'), true)::text || '|' || pg_temp.equipos('pl_d2')$q$,
  '{"copiados": 5, "omitidos": 2}|Media(1/0)[Proyeccion:1:0:U7] PT(2/0)[Jefe PT:1:0:U10+U5] Camaras(2/2)[Camara:3:1:U5+U6,Switcher:1:1:]');
SELECT pg_temp.assert_raises('f9: copying a plan onto itself is plan_invalido',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d1'), pg_temp.plan('pl_d1'), true)$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_raises('f10: an unknown origen is plan_invalido',
  $q$SELECT public.dps_copiar_plan(gen_random_uuid(), pg_temp.plan('pl_d3'))$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_eq('f11: replacing with an empty origen copies nothing',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_d3'), pg_temp.plan('pl_d2'), true)::text$q$, '{"copiados": 0, "omitidos": 0}');
SELECT pg_temp.assert_eq('f11b: and leaves the destino empty',
  $q$SELECT public.dps_plan_equipos(pg_temp.plan('pl_d2')) ->> 'convocados'$q$, '0');
SELECT pg_temp.assert_raises('f12: desconvocar in an unknown plan is plan_invalido',
  $q$SELECT public.dps_desconvocar(gen_random_uuid(), pg_temp.ctx('pu_proy')::uuid, pg_temp.id('us', 7))$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('f13: a coordinator cannot desconvocar',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_d1'), pg_temp.ctx('pu_cam')::uuid, pg_temp.id('us', 5))$q$, '42501', 'sin_autoridad');

-- ── h. planilla ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('h_a1', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_cam', 5)::text$q$);
SELECT pg_temp.put('h_a2', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_pt', 5)::text$q$);
SELECT pg_temp.put('h_b', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_cam', 6)::text$q$);
SELECT pg_temp.put('h_c', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_proy', 7)::text$q$);
SELECT pg_temp.put('h_f', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_pt', 10)::text$q$);
SELECT pg_temp.assert_raises('h0: a paused servicio cannot be convocado',
  $q$SELECT pg_temp.convocar('pl_hoy', 'pu_sw', 8)$q$, '22023', 'servicio_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('h1: the Camaras coordinator sees only Camaras; the paused D is not among otros',
  $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Camaras(0/2/0):U5-,U6- +U9');
SELECT pg_temp.assert_eq('h2: nothing outside Camaras, not even other DPS equipos',
  $q$SELECT jsonb_array_length(public.dps_asistencia_planilla(pg_temp.plan('pl_hoy'), NULL) -> 'equipos')::text$q$, '1');
SELECT pg_temp.assert_eq('h3: one row per person with their puestos here and elsewhere',
  $q$SELECT (p -> 'puestos' -> 0 ->> 'nombre') || '|' || (p -> 'otros_puestos')::text
       FROM jsonb_array_elements(public.dps_asistencia_planilla(pg_temp.plan('pl_hoy'), NULL) -> 'equipos' -> 0 -> 'personas') p
      WHERE p ->> 'apellido' = 'U5'$q$, 'Camara|["Jefe PT"]');
SELECT pg_temp.assert_raises('h4: the coordinator cannot ask for Media',
  $q$SELECT pg_temp.planilla('pl_hoy', pg_temp.id('eq', 4))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('h5: an equipo outside DPS is equipo_invalido',
  $q$SELECT pg_temp.planilla('pl_hoy', pg_temp.id('eq', 5))$q$, '22023', 'equipo_invalido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('h6: the coordinator of a disabled equipo gets nothing',
  $q$SELECT pg_temp.planilla('pl_hoy')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('h7: the planner sees all of DPS',
  $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Media(0/1/0):U7- | PT(0/2/0):U10-,U5- | Camaras(0/2/0):U5-,U6- +U9');
SELECT pg_temp.assert_eq('h8: the equipo filter is its subtree',
  $q$SELECT pg_temp.planilla('pl_hoy', pg_temp.id('eq', 1))$q$, 'PT(0/2/0):U10-,U5- | Camaras(0/2/0):U5-,U6- +U9');
SELECT pg_temp.assert_eq('h9: editable today and 14 days back, not 15 nor tomorrow',
  $q$SELECT string_agg(public.dps_asistencia_planilla(pg_temp.plan(k), NULL) ->> 'editable', ',' ORDER BY o)
       FROM unnest(ARRAY['pl_hoy', 'pl_14', 'pl_15', 'pl_fut']) WITH ORDINALITY AS x(k, o)$q$, 'true,true,false,false');
SELECT pg_temp.assert_eq('h10: totals count A once',
  $q$SELECT (public.dps_asistencia_planilla(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 1)) -> 'totales')::text$q$,
  '{"aviso": 0, "llegaron": 0, "convocados": 3, "por_llegar": 3, "sin_convocar": 0}');
SELECT pg_temp.assert_raises('h11: an unknown plan is plan_invalido',
  $q$SELECT pg_temp.planilla('ZZ none')$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(11);
SELECT pg_temp.assert_raises('h12: a random user gets nothing', $q$SELECT pg_temp.planilla('pl_hoy')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('h13: without a session sin_autoridad', $q$SELECT pg_temp.planilla('pl_hoy')$q$, '42501', 'sin_autoridad');

-- ── i. marcar ────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('i1: the Camaras coordinator marks A and B', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5, 6], 'llego')$q$, '2/2');
RESET ROLE;
SELECT pg_temp.assert_eq('i2: A has one row for the plan despite two puestos (S6.1), convocado, marked by the coordinator',
  $q$SELECT count(*) || '|' || bool_and(convocado) || '|' || bool_and(marcado_por = pg_temp.id('us', 3))
       FROM public.dps_asistencias WHERE plan_id = pg_temp.plan('pl_hoy') AND persona_id = pg_temp.id('us', 5)$q$, '1|true|true');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('i3: the mark shows in every equipo of the person',
  $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Media(0/1/0):U7- | PT(1/1/0):U10-,U5L | Camaras(2/0/0):U5L,U6L +U9');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('i4: someone convocado only in Media is sin_autoridad',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[7], 'llego')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i5: someone convocado in PT with a Sonido servicio is sin_autoridad',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5, 10], 'llego')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('i6: aviso for someone not convocado is persona_invalida',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[9], 'aviso_no_viene')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_eq('i7: vino sin convocar (active Camaras servicio)', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[9], 'llego')$q$, '1/1');
RESET ROLE;
SELECT pg_temp.assert_eq('i8: stored as llego, not convocado',
  $q$SELECT estado || '|' || convocado FROM public.dps_asistencias WHERE plan_id = pg_temp.plan('pl_hoy') AND persona_id = pg_temp.id('us', 9)$q$,
  'llego|false');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('i9: E moves from otros to the list', $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Camaras(3/0/0):U5L,U6L,U9L*');
SELECT pg_temp.assert_raises('i10: a random person is persona_invalida',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[11], 'llego')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('i11: a servidor of another experiencia is persona_invalida',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[12], 'llego')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('i12: a paused, unconvocated servidor is persona_invalida',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[8], 'llego')$q$, '22023', 'persona_invalida');
SELECT pg_temp.assert_raises('i13: an unknown estado is estado_invalido',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5], 'presente')$q$, '22023', 'estado_invalido');
SELECT pg_temp.assert_raises('i14: more than 300 ids is demasiados',
  $q$SELECT public.dps_asistencia_marcar(pg_temp.plan('pl_hoy'), ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 301)), 'llego')$q$,
  '22023', 'demasiados');
SELECT pg_temp.assert_raises('i15: 15 days back is fecha_invalida',
  $q$SELECT pg_temp.marcar('pl_15', ARRAY[5], 'llego')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('i16: a future plan is fecha_invalida',
  $q$SELECT pg_temp.marcar('pl_fut', ARRAY[5], 'llego')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('h_b14', $q$SELECT pg_temp.convocar('pl_14', 'pu_cam', 6)::text$q$);
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('i17: 14 days back can still be marked', $q$SELECT pg_temp.marcar('pl_14', ARRAY[6], 'llego')$q$, '1/1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('i18: solo_sin_marcar leaves the existing marks',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5, 6, 7, 10], 'aviso_no_viene', true)$q$, '4/2');
SELECT pg_temp.assert_eq('i19: after solo_sin_marcar',
  $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Media(0/0/1):U7A | PT(1/0/1):U10A,U5L | Camaras(3/0/0):U5L,U6L,U9L*');
SELECT pg_temp.assert_eq('i20: re-marking the same estado changes nothing', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5], 'llego')$q$, '1/0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('i21: NULL clears', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[9], NULL)$q$, '1/1');
SELECT pg_temp.assert_eq('i22: E back among otros', $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Camaras(2/0/0):U5L,U6L +U9');
SELECT pg_temp.assert_eq('i23: an empty or NULL list is a no-op',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[]::int[], 'llego') || ',' || (public.dps_asistencia_marcar(pg_temp.plan('pl_hoy'), NULL, 'llego') ->> 'cambiados')$q$,
  '0/0,0');
SELECT pg_temp.assert_raises('i24: an unknown plan is plan_invalido',
  $q$SELECT public.dps_asistencia_marcar(gen_random_uuid(), pg_temp.personas(ARRAY[5]), 'llego')$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('i25: the coordinator of a disabled equipo cannot mark',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[7], NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('i26: without a session sin_autoridad',
  $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5], 'llego')$q$, '42501', 'sin_autoridad');

-- ── j. convocado follows the convocados ──────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('j1: E comes again without being convocado', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[9], 'llego')$q$, '1/1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('h_e', $q$SELECT pg_temp.convocar('pl_hoy', 'pu_sw', 9)::text$q$);
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('j2: convocado afterwards, the mark becomes convocado', $q$SELECT pg_temp.planilla('pl_hoy')$q$, 'Camaras(3/0/0):U5L,U6L,U9L');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('j3: desconvocado, the llego stays as sin convocar',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_hoy'), pg_temp.ctx('pu_sw')::uuid, pg_temp.id('us', 9)) || '|' || pg_temp.planilla('pl_hoy', pg_temp.id('eq', 2))$q$,
  'true|Camaras(3/0/0):U5L,U6L,U9L*');
SELECT pg_temp.assert_eq('j4: desconvocar C drops their aviso; C goes to otros',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_hoy'), pg_temp.ctx('pu_proy')::uuid, pg_temp.id('us', 7)) || '|' || pg_temp.planilla('pl_hoy', pg_temp.id('eq', 4))$q$,
  'true|Media(0/0/0): +U7');
RESET ROLE;
SELECT pg_temp.assert_eq('j5: no row left for C',
  $q$SELECT count(*)::text FROM public.dps_asistencias WHERE plan_id = pg_temp.plan('pl_hoy') AND persona_id = pg_temp.id('us', 7)$q$, '0');
SET LOCAL ROLE authenticated;

-- ── k. marcar equipo ─────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('k1: clearing A and B', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5, 6], NULL)$q$, '2/2');
SELECT pg_temp.assert_eq('k2: marking all of Camaras', $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 2), 'llego')::text$q$, '2');
SELECT pg_temp.assert_eq('k3: again changes nothing', $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 2), 'llego')::text$q$, '0');
SELECT pg_temp.assert_raises('k4: the Camaras coordinator cannot mark PT',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 1), 'llego')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('k5: PT: A already llego and F avisó, nothing is overwritten',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 1), 'llego') || '|' || pg_temp.planilla('pl_hoy', pg_temp.id('eq', 1))$q$,
  '0|PT(1/0/1):U10A,U5L | Camaras(3/0/0):U5L,U6L,U9L*');
SELECT pg_temp.assert_eq('k6: NULL clears the convocados of PT',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 1), NULL) || '|' || pg_temp.planilla('pl_hoy')$q$,
  '2|Media(0/0/0): +U7 | PT(0/2/0):U10-,U5- | Camaras(2/1/0):U5-,U6L,U9L*');
SELECT pg_temp.assert_eq('k7: an equipo without convocados is 0',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 3), 'llego')::text$q$, '0');
SELECT pg_temp.assert_raises('k8: an equipo outside DPS is equipo_invalido',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 5), 'llego')$q$, '22023', 'equipo_invalido');
SELECT pg_temp.assert_raises('k9: an unknown estado is estado_invalido',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 2), 'x')$q$, '22023', 'estado_invalido');
SELECT pg_temp.assert_raises('k10: 15 days back is fecha_invalida',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_15'), pg_temp.id('eq', 2), 'llego')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('k11: an unknown plan is plan_invalido',
  $q$SELECT public.dps_asistencia_marcar_equipo(gen_random_uuid(), pg_temp.id('eq', 2), 'llego')$q$, '22023', 'plan_invalido');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('k12: the coordinator of a disabled equipo cannot',
  $q$SELECT public.dps_asistencia_marcar_equipo(pg_temp.plan('pl_hoy'), pg_temp.id('eq', 4), 'llego')$q$, '42501', 'sin_autoridad');

-- ── l. historial ─────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('l0: A llegó today', $q$SELECT pg_temp.marcar('pl_hoy', ARRAY[5], 'llego')$q$, '1/1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('l_a14', $q$SELECT pg_temp.convocar('pl_14', 'pu_cam', 5)::text$q$);
SELECT pg_temp.put('l_a15', $q$SELECT pg_temp.convocar('pl_15', 'pu_cam', 5)::text$q$);
SELECT pg_temp.put('l_afut', $q$SELECT pg_temp.convocar('pl_fut', 'pu_cam', 5)::text$q$);
SELECT pg_temp.assert_eq('l1: the director marks A avisó on pl_14', $q$SELECT pg_temp.marcar('pl_14', ARRAY[5], 'aviso_no_viene')$q$, '1/1');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('l2: A reads their own history, most recent first',
  $q$SELECT pg_temp.historial(5, pg_temp.hoy() - 20, pg_temp.hoy() + 1)$q$,
  'ZZ Dc fut:pendiente:Camara,ZZ Dc hoy:llego:Camara+Jefe PT,ZZ Dc 14:aviso_no_viene:Camara,ZZ Dc 15:no_vino:Camara');
SELECT pg_temp.assert_eq('l3: the resumen',
  $q$SELECT string_agg(k || '=' || (v -> 'resumen' ->> k), ',' ORDER BY k)
       FROM public.dps_historial_persona(pg_temp.id('us', 5), pg_temp.hoy() - 20, pg_temp.hoy() + 1) v,
            unnest(ARRAY['llego', 'aviso_no_viene', 'no_vino', 'pendiente', 'vino_sin_convocar']) k$q$,
  'aviso_no_viene=1,llego=1,no_vino=1,pendiente=1,vino_sin_convocar=0');
SELECT pg_temp.assert_raises('l4: A cannot read somebody else',
  $q$SELECT pg_temp.historial(9, pg_temp.hoy() - 20, pg_temp.hoy())$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('l5: E: vino sin convocar', $q$SELECT pg_temp.historial(9, pg_temp.hoy() - 20, pg_temp.hoy())$q$, 'ZZ Dc hoy:vino_sin_convocar:');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('l6: a coordinator cannot read a history',
  $q$SELECT pg_temp.historial(5, pg_temp.hoy() - 20, pg_temp.hoy())$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('l7: the director reads anyone; a Sunday without titulo shows its tipo',
  $q$SELECT pg_temp.historial(5, pg_temp.dom(1), pg_temp.dom(8))$q$, 'domingo:pendiente:Camara+Jefe PT');
SELECT pg_temp.assert_raises('l8: more than 400 days is rango_invalido',
  $q$SELECT pg_temp.historial(5, pg_temp.hoy() - 401, pg_temp.hoy())$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('l9: an inverted range is rango_invalido',
  $q$SELECT pg_temp.historial(5, pg_temp.hoy(), pg_temp.hoy() - 1)$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('l10: an unknown persona is persona_invalida',
  $q$SELECT public.dps_historial_persona(gen_random_uuid(), pg_temp.hoy() - 1, pg_temp.hoy())$q$, '22023', 'persona_invalida');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('l11: without a session sin_autoridad',
  $q$SELECT pg_temp.historial(5, pg_temp.hoy() - 1, pg_temp.hoy())$q$, '42501', 'sin_autoridad');
RESET ROLE;

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dc_failures);
END;
$$;
