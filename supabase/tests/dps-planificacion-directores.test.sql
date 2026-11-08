-- S8 (odd/tasks/dps-asistencia-pco.md, L36-L38) — DPS directors assigned on
-- their own (20261108204000_dps_directores_automaticos.sql). Needs the four
-- earlier DPS migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_puestos.direccion_equipo_id (nullable,
--      FK to dream_team_equipos, one active puesto per dirección),
--      dps_convocados.automatico (NOT NULL DEFAULT false); the new internal
--      functions are SECURITY DEFINER with search_path '' and closed to
--      authenticated and anon; dps_plan_equipos and dps_asistencia_planilla
--      are VOLATILE and still executable by authenticated; after the
--      migration the real DPS root has «Director de DPS», one director
--      puesto per active direct child, and no seeded «Director de …» puesto
--      without convocados is left active.
--   b. Puestos follow the tree: one «Director de <label>» (cantidad 1) on the
--      DPS root per active direct child, whatever its experiencia (a
--      Próximo Paso-like node included); none for a grandchild or an
--      inactive child; first in the DPS column; renamed with the label;
--      deactivated with the child and reactivated (same puesto) with it; an
--      active root puesto with that name is adopted; the index refuses a
--      second active puesto for a dirección; a read in sync writes nothing.
--   c. The six seeded puestos: dps_directores_retirar_sembrados deactivates
--      one without convocados and keeps one that has them.
--   d. Convocados: the person with an ACTIVE servicio and a director-level rol
--      on exactly that equipo is convocado automatico (servicio_id = that
--      servicio); no inheritance (a director of a grandchild or a coordinator
--      fills nothing: «Falta 1»); a manual row of the director stays manual
--      and is not duplicated; a manual extra person stays; a servicio paused
--      or a rol changed removes the automatic row (and drops their aviso),
--      never a manual one; plans before ninos_hoy() - 14 are not rewritten;
--      the attendance sheet syncs too.
--   e. dps_desconvocar refuses an automatic row ('convocado_automatico').
--   f. dps_copiar_plan skips automatic rows, ignores them in the destino
--      check and keeps them when replacing.
--   g. dps_plan_equipos gives every convocado a boolean `automatico`.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Reads that need a session set request.jwt.claim.sub to the fixture
-- auth id; the privilege cases run under SET LOCAL ROLE authenticated.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Dd"):
--   1 ADMIN   system admin
--   2 PLAN    dream_team.direct on the DPS root (plans)
--   3 DA      Director servicio in ZZ Dd Alfa
--   4 DH      Director servicio in ZZ Dd Beta Hijo (grandchild of the root)
--   5 VA      Voluntario servicio in ZZ Dd Alfa
--   6 CB      Coordinador servicio in ZZ Dd Beta (promoted to Director in d)
--   7 DG      Director servicio in ZZ Dd Gamma (talleres_crecimiento)
--   8 DR      Director servicio on the DPS root itself
--   9 RANDOM  nothing
-- Equipos under the real DPS root: 1 ZZ Dd Alfa, 2 ZZ Dd Beta › 3 ZZ Dd Beta
-- Hijo, 4 ZZ Dd Gamma (talleres_crecimiento), 5 ZZ Dd Delta (inactive), 6 ZZ
-- Dd Epsilon (added in b). Plans: pl_1, pl_2 = the 1st and 2nd Sundays of
-- 2096; pl_14 / pl_15 'especial' plans at ninos_hoy() - 14 / - 15.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_dd_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dd_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dd_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_dd_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_dd_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9800000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd981' WHEN 'us' THEN 'd982' WHEN 'eq' THEN 'd983'
                       WHEN 'ro' THEN 'd984' WHEN 'se' THEN 'd985' END,
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

-- The k-th Sunday of 2096.
CREATE OR REPLACE FUNCTION pg_temp.dom(p_k int) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT DATE '2096-01-01' + ((7 - extract(dow FROM DATE '2096-01-01')::int) % 7) + 7 * (p_k - 1);
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.raiz() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('raiz')::uuid;
$$;

-- The active director puesto of a fixture equipo (read as postgres).
CREATE OR REPLACE FUNCTION pg_temp.puesto_dir(p_eq int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT p.id FROM public.dps_puestos p WHERE p.activo AND p.direccion_equipo_id = pg_temp.id('eq', p_eq);
$$;

-- The fixture director puestos of the DPS column of dps_plan_equipos, as
-- 'Label:falta:apellido+mark(a automatico, m manual),...' in column order.
CREATE OR REPLACE FUNCTION pg_temp.directores(p_plan text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(replace(p ->> 'nombre', 'Director de ZZ Dd ', '') || ':' || (p ->> 'falta') || ':'
                                     || coalesce((SELECT string_agg(split_part(c ->> 'nombre', ' ', 3)
                                                                    || CASE WHEN (c ->> 'automatico')::boolean THEN 'a' ELSE 'm' END,
                                                                    '+' ORDER BY co)
                                                    FROM jsonb_array_elements(p -> 'convocados') WITH ORDINALITY AS w(c, co)), ''),
                                     ',' ORDER BY po), '')
            FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan(p_plan)) -> 'equipos') e,
                 jsonb_array_elements(e -> 'puestos') WITH ORDINALITY AS y(p, po)
           WHERE e ->> 'equipo_id' = pg_temp.ctx('raiz') AND p ->> 'nombre' LIKE 'Director de ZZ Dd %'
             AND (p ->> 'activo')::boolean);
END;
$$;

-- The fixture people of «Director de DPS» in that plan, as 'apellido+mark'.
CREATE OR REPLACE FUNCTION pg_temp.director_dps(p_plan text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(split_part(c ->> 'nombre', ' ', 3)
                                     || CASE WHEN (c ->> 'automatico')::boolean THEN 'a' ELSE 'm' END, '+' ORDER BY c ->> 'nombre'), '')
            FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan(p_plan)) -> 'equipos') e,
                 jsonb_array_elements(e -> 'puestos') p,
                 jsonb_array_elements(p -> 'convocados') c
           WHERE e ->> 'equipo_id' = pg_temp.ctx('raiz') AND p ->> 'nombre' = 'Director de DPS'
             AND c ->> 'nombre' LIKE 'ZZ Dd %');
END;
$$;

-- Physical versions of the director puestos: an UPDATE gives a row a new ctid.
CREATE OR REPLACE FUNCTION pg_temp.huella_puestos() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(p.id || '@' || p.ctid::text, ',' ORDER BY p.id) FROM public.dps_puestos p WHERE p.direccion_equipo_id IS NOT NULL;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_dd_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_dd_ctx (k, v) VALUES ('hoy', public.ninos_hoy()::text);

-- a7 and a8 look at the real tree, before the fixture touches it.
SELECT pg_temp.assert_eq('a7: no seeded «Director de …» puesto without convocados is left active on the DPS root',
  $q$SELECT count(*)::text FROM public.dps_puestos p
      WHERE p.activo AND p.equipo_id = pg_temp.raiz() AND p.direccion_equipo_id IS NULL
        AND lower(p.nombre) IN ('director de programación', 'director de atención al invitado', 'director de media',
                                'director de producción técnica', 'director de social media', 'director de producción creativa')
        AND NOT EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.puesto_id = p.id)$q$, '0');
SELECT pg_temp.assert_eq('a8: the migration left «Director de DPS» and one director puesto per active direct child of the root',
  $q$SELECT (SELECT p.nombre || ':' || p.cantidad FROM public.dps_puestos p
               WHERE p.activo AND p.direccion_equipo_id = pg_temp.raiz() AND p.equipo_id = pg_temp.raiz())
            || '|' || (SELECT count(*) FROM public.dream_team_equipos e
                        WHERE e.parent_equipo_id = pg_temp.raiz() AND e.activo
                          AND NOT EXISTS (SELECT 1 FROM public.dps_puestos p
                                           WHERE p.activo AND p.direccion_equipo_id = e.id AND p.equipo_id = pg_temp.raiz()
                                             AND p.nombre = left('Director de ' || btrim(e.label), 80)))$q$,
  'Director de DPS:1|0');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dd-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 9) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Dd', 'U' || n, 'dd-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 9) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 1), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9800000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps',                  pg_temp.raiz(),       'ZZ Dd Alfa',      true),
  (pg_temp.id('eq', 2), 'dps',                  pg_temp.raiz(),       'ZZ Dd Beta',      true),
  (pg_temp.id('eq', 3), 'dps',                  pg_temp.id('eq', 2),  'ZZ Dd Beta Hijo', true),
  (pg_temp.id('eq', 4), 'talleres_crecimiento', pg_temp.raiz(),       'ZZ Dd Gamma',     true),
  (pg_temp.id('eq', 5), 'dps',                  pg_temp.raiz(),       'ZZ Dd Delta',     false);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'Director',    'director',    true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'Voluntario',  'voluntario',  true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 2), 'Coordinador', 'coordinador', true),
  (pg_temp.id('ro', 4), pg_temp.id('eq', 2), 'Director',    'director',    true),
  (pg_temp.id('ro', 5), pg_temp.id('eq', 3), 'Director',    'director',    true),
  (pg_temp.id('ro', 6), pg_temp.id('eq', 4), 'Director',    'director',    true),
  (pg_temp.id('ro', 7), pg_temp.id('eq', 4), 'Voluntario',  'voluntario',  true),
  (pg_temp.id('ro', 8), pg_temp.raiz(),      'ZZ Dd Director', 'director', true);

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', x.n), pg_temp.id('us', x.n), x.eq, pg_temp.id('ro', x.ro), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (3, pg_temp.id('eq', 1), 1), (4, pg_temp.id('eq', 3), 5), (5, pg_temp.id('eq', 1), 2),
               (6, pg_temp.id('eq', 2), 3), (7, pg_temp.id('eq', 4), 6), (8, pg_temp.raiz(), 8)) AS x(n, eq, ro);

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 9) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT pg_temp.id('us', x.n), x.cap, 'dream_team', 'equipo', x.scope, 'zz-test'
  FROM (VALUES (2, 'dream_team.direct', pg_temp.ctx('raiz')),
               (5, 'dream_team.serve', pg_temp.id('eq', 1)::text)) AS x(n, cap, scope);

GRANT INSERT, SELECT, UPDATE ON t_dd_failures, t_dd_ctx TO authenticated, anon;
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

SELECT pg_temp.assert_eq('a1: the two new columns',
  $q$SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
                       || coalesce(pg_get_expr(d.adbin, d.adrelid), '-'), ',' ORDER BY a.attname)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE (a.attrelid = 'public.dps_puestos'::regclass AND a.attname = 'direccion_equipo_id')
         OR (a.attrelid = 'public.dps_convocados'::regclass AND a.attname = 'automatico')$q$,
  'automatico:boolean:true:false,direccion_equipo_id:uuid:false:-');
SELECT pg_temp.assert_eq('a2: direccion_equipo_id references dream_team_equipos',
  $q$SELECT c.confrelid::regclass::text FROM pg_constraint c
      WHERE c.conrelid = 'public.dps_puestos'::regclass AND c.contype = 'f'
        AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                               WHERE a.attrelid = 'public.dps_puestos'::regclass AND a.attname = 'direccion_equipo_id')]$q$,
  'dream_team_equipos');
SELECT pg_temp.assert_eq('a3: the new functions are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_directores_direcciones', 'dps_directores_puestos_sincronizar',
                                                   'dps_directores_deseados', 'dps_directores_sincronizar',
                                                   'dps_directores_retirar_sembrados')$q$, '5|0');
SELECT pg_temp.assert_eq('a4: nobody but the owner executes them',
  $q$SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'dps\_directores\_%'
        AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('public', p.oid, 'EXECUTE'))$q$, '0');
SELECT pg_temp.assert_eq('a5: the two reads write now (VOLATILE) and stay open to authenticated',
  $q$SELECT string_agg(p.proname || ':' || p.provolatile::text || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                       ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_plan_equipos', 'dps_asistencia_planilla')$q$,
  'dps_asistencia_planilla:v:true,dps_plan_equipos:v:true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_directores_sincronizar',
  $q$SELECT public.dps_directores_sincronizar(gen_random_uuid())$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_directores_puestos_sincronizar',
  $q$SELECT public.dps_directores_puestos_sincronizar()$q$, '42501');
SELECT pg_temp.assert_raises('a6: authenticated cannot execute dps_directores_retirar_sembrados',
  $q$SELECT public.dps_directores_retirar_sembrados()$q$, '42501');
RESET ROLE;

-- ── setup (as the DPS planner) ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.put('pu_manual', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.raiz(), 'ZZ Dd Manual', 1, NULL)::text$q$);
SELECT pg_temp.put('pl_1', $q$SELECT public.dps_plan_crear(pg_temp.dom(1), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('pl_2', $q$SELECT public.dps_plan_crear(pg_temp.dom(2), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('pl_14', $q$SELECT public.dps_plan_crear(pg_temp.ctx('hoy')::date - 14, 'especial', 'ZZ Dd 14')::text$q$);
SELECT pg_temp.put('pl_15', $q$SELECT public.dps_plan_crear(pg_temp.ctx('hoy')::date - 15, 'especial', 'ZZ Dd 15')::text$q$);

-- ── b. puestos follow the tree ───────────────────────────────────────

-- The first read comes from a servidor: the sync runs with definer rights.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b0: a servidor reads the plan', $q$SELECT (public.dps_plan_equipos(pg_temp.plan('pl_1')) ->> 'plan_id' IS NOT NULL)::text$q$, 'true');
RESET ROLE;
SELECT pg_temp.assert_eq('b1: one «Director de <label>» on the root per active direct child, cantidad 1; none for a grandchild nor an inactive child',
  $q$SELECT string_agg(p.nombre || ':' || p.cantidad || ':' || (p.equipo_id = pg_temp.raiz()), ',' ORDER BY p.nombre)
       FROM public.dps_puestos p
      WHERE p.activo AND p.direccion_equipo_id IN (SELECT pg_temp.id('eq', n) FROM generate_series(1, 5) n)$q$,
  'Director de ZZ Dd Alfa:1:true,Director de ZZ Dd Beta:1:true,Director de ZZ Dd Gamma:1:true');
SELECT pg_temp.put('dir_ids', $q$SELECT string_agg(p.id::text, ',') FROM public.dps_puestos p WHERE p.activo AND p.direccion_equipo_id IS NOT NULL$q$);
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('b2: «Director de DPS» opens the DPS column and every director puesto comes before the others',
  $q$WITH col AS (
       SELECT p ->> 'puesto_id' AS id, p ->> 'nombre' AS nombre, po
         FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan('pl_1')) -> 'equipos') e,
              jsonb_array_elements(e -> 'puestos') WITH ORDINALITY AS y(p, po)
        WHERE e ->> 'equipo_id' = pg_temp.ctx('raiz'))
     SELECT (SELECT c.nombre FROM col c ORDER BY c.po LIMIT 1) || '|'
            || ((SELECT max(c.po) FROM col c WHERE c.id = ANY (string_to_array(pg_temp.ctx('dir_ids'), ',')))
                < (SELECT min(c.po) FROM col c WHERE c.id <> ALL (string_to_array(pg_temp.ctx('dir_ids'), ','))))$q$,
  'Director de DPS|true');
SELECT pg_temp.assert_eq('b3: the column, before anyone is synced in by hand',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U3a,Beta:1:,Gamma:0:U7a');

SELECT pg_temp.put('pu_alfa', $q$SELECT pg_temp.puesto_dir(1)::text$q$);
UPDATE public.dream_team_equipos SET label = 'ZZ Dd Alfa Dos' WHERE id = pg_temp.id('eq', 1);
SELECT pg_temp.assert_eq('b4: a label change renames the director puesto',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa Dos:0:U3a,Beta:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('b4b: the same puesto', $q$SELECT (pg_temp.puesto_dir(1) = pg_temp.ctx('pu_alfa')::uuid)::text$q$, 'true');
UPDATE public.dream_team_equipos SET label = 'ZZ Dd Alfa' WHERE id = pg_temp.id('eq', 1);
SELECT pg_temp.put('pu_beta', $q$SELECT pg_temp.puesto_dir(2)::text$q$);
UPDATE public.dream_team_equipos SET activo = false WHERE id = pg_temp.id('eq', 2);
-- A read's writes show to the next statement, so the checks are separate.
SELECT pg_temp.assert_eq('b5: an inactive dirección loses its puesto',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U3a,Gamma:0:U7a');
SELECT pg_temp.assert_eq('b5b: deactivated',
  $q$SELECT p.activo::text FROM public.dps_puestos p WHERE p.id = pg_temp.ctx('pu_beta')::uuid$q$, 'false');
UPDATE public.dream_team_equipos SET activo = true WHERE id = pg_temp.id('eq', 2);
SELECT pg_temp.assert_eq('b6: reactivated, the puesto comes back',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U3a,Beta:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('b6b: the same puesto', $q$SELECT (pg_temp.puesto_dir(2) = pg_temp.ctx('pu_beta')::uuid)::text$q$, 'true');
SELECT pg_temp.put('pu_eps', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.raiz(), 'director de zz dd epsilon', 1, NULL)::text$q$);
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
VALUES (pg_temp.id('eq', 6), 'dps', pg_temp.raiz(), 'ZZ Dd Epsilon', true);
SELECT pg_temp.assert_eq('b7: a new dirección gets its puesto, named after the label',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U3a,Beta:1:,Epsilon:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('b7b: adopting the active root puesto that had its name',
  $q$SELECT (pg_temp.puesto_dir(6) = pg_temp.ctx('pu_eps')::uuid)::text$q$, 'true');
SELECT pg_temp.assert_raises('b8: a second active puesto for the same dirección is refused',
  $q$INSERT INTO public.dps_puestos (equipo_id, nombre, direccion_equipo_id) VALUES (pg_temp.raiz(), 'ZZ Dd Otro', pg_temp.id('eq', 1))$q$,
  '23505');
SELECT pg_temp.put('huella', $q$SELECT pg_temp.huella_puestos()$q$);
SELECT pg_temp.assert_eq('b9: a read in sync rewrites no puesto',
  $q$SELECT (length(pg_temp.directores('pl_1')) > 0 AND pg_temp.huella_puestos() = pg_temp.ctx('huella'))::text$q$, 'true');

-- ── c. the six seeded puestos ────────────────────────────────────────

INSERT INTO public.dps_puestos (equipo_id, nombre, cantidad, orden)
SELECT pg_temp.raiz(), x.nombre, 1, 0
  FROM (VALUES ('Director de programación'), ('Director de social media')) AS x(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM public.dps_puestos p
                    WHERE p.activo AND p.equipo_id = pg_temp.raiz() AND lower(p.nombre) = lower(x.nombre));
INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id) -- noqa: insert-into
SELECT pg_temp.plan('pl_15'), p.id, pg_temp.id('se', 5), pg_temp.id('us', 5)
  FROM public.dps_puestos p WHERE p.activo AND p.equipo_id = pg_temp.raiz() AND p.nombre = 'Director de social media';
SELECT pg_temp.assert_eq('c1: retiring the seeded puestos keeps the one with convocados',
  $q$SELECT 'ok' FROM public.dps_directores_retirar_sembrados()$q$, 'ok');
SELECT pg_temp.assert_eq('c2: programación (no convocados) inactive, social media (convocados) active',
  $q$SELECT string_agg(x.nombre || ':' || EXISTS (SELECT 1 FROM public.dps_puestos p
                                                    WHERE p.activo AND p.equipo_id = pg_temp.raiz() AND p.nombre = x.nombre),
                       ',' ORDER BY x.nombre)
       FROM (VALUES ('Director de programación'), ('Director de social media')) AS x(nombre)$q$,
  'Director de programación:false,Director de social media:true');

-- ── d. convocados ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('d1: the root''s own director is in «Director de DPS»', $q$SELECT pg_temp.director_dps('pl_1')$q$, 'U8a');
SELECT pg_temp.assert_eq('d2: no inheritance: neither the grandchild''s director nor the coordinator is convocado',
  $q$SELECT count(*)::text FROM public.dps_convocados c
      WHERE c.plan_id = pg_temp.plan('pl_1') AND c.persona_id IN (pg_temp.id('us', 4), pg_temp.id('us', 6))$q$, '0');
SELECT pg_temp.assert_eq('d3: stored rows: automatico, the director servicio of that equipo, no created_by',
  $q$SELECT string_agg(u.apellido || ':' || c.automatico || ':' || (s.equipo_id = pu.direccion_equipo_id) || ':'
                       || (r.nivel = 'director') || ':' || (c.created_by IS NULL), ',' ORDER BY u.apellido)
       FROM public.dps_convocados c
       JOIN public.usuarios u ON u.id = c.persona_id
       JOIN public.dps_puestos pu ON pu.id = c.puesto_id
       JOIN public.dream_team_servicios s ON s.id = c.servicio_id
       JOIN public.dream_team_roles r ON r.id = s.rol_id
      WHERE c.plan_id = pg_temp.plan('pl_1') AND u.nombre = 'ZZ Dd'$q$,
  'U3:true:true:true:true,U7:true:true:true:true,U8:true:true:true:true');
SELECT pg_temp.assert_eq('d4: the attendance sheet syncs its plan too and lists the director in DPS',
  $q$SELECT (p -> 'puestos' -> 0 ->> 'nombre') || '|' || (p ->> 'convocado')
       FROM jsonb_array_elements(public.dps_asistencia_planilla(pg_temp.plan('pl_14'), NULL) -> 'equipos') e,
            jsonb_array_elements(e -> 'personas') p
      WHERE e ->> 'equipo_id' = pg_temp.ctx('raiz') AND p ->> 'apellido' = 'U3'$q$, 'Director de ZZ Dd Alfa|true');
SELECT pg_temp.assert_eq('d5: a plan before hoy - 14 is not synced',
  $q$SELECT pg_temp.directores('pl_15') || '|' || (SELECT count(*) FROM public.dps_convocados c
                                                     WHERE c.plan_id = pg_temp.plan('pl_15') AND c.automatico)$q$,
  'Alfa:1:,Beta:1:,Epsilon:1:,Gamma:1:|0');
-- An automatic row written back when pl_15 was still in the window
-- (through put: before the migration the column does not exist).
SELECT pg_temp.put('cv_hist', $q$INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, automatico)
  VALUES (pg_temp.plan('pl_15'), pg_temp.puesto_dir(1), pg_temp.id('se', 3), pg_temp.id('us', 3), true) RETURNING id::text$q$);

SELECT pg_temp.assert_eq('d6: a manual extra person in a director puesto',
  $q$SELECT (public.dps_convocar(pg_temp.plan('pl_1'), pg_temp.puesto_dir(1), pg_temp.id('se', 5)) IS NOT NULL) || '|' || pg_temp.directores('pl_1')$q$,
  'true|Alfa:0:U3a+U5m,Beta:1:,Epsilon:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('d7: the coordinator convocado by hand in Beta''s director puesto',
  $q$SELECT (public.dps_convocar(pg_temp.plan('pl_1'), pg_temp.puesto_dir(2), pg_temp.id('se', 6)) IS NOT NULL) || '|' || pg_temp.directores('pl_1')$q$,
  'true|Alfa:0:U3a+U5m,Beta:0:U6m,Epsilon:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('d8: the Alfa director also by hand in another puesto',
  $q$SELECT (public.dps_convocar(pg_temp.plan('pl_1'), pg_temp.ctx('pu_manual')::uuid, pg_temp.id('se', 3)) IS NOT NULL)::text$q$, 'true');
UPDATE public.dream_team_servicios SET rol_id = pg_temp.id('ro', 4) WHERE id = pg_temp.id('se', 6);
SELECT pg_temp.assert_eq('d9: promoted to director, the manual row stays manual and is not duplicated; another plan gets him automatic',
  $q$SELECT pg_temp.directores('pl_1') || '|' || pg_temp.directores('pl_2')$q$,
  'Alfa:0:U3a+U5m,Beta:0:U6m,Epsilon:1:,Gamma:0:U7a|Alfa:0:U3a,Beta:0:U6a,Epsilon:1:,Gamma:0:U7a');
SELECT pg_temp.assert_eq('d10: the Alfa director warns he will not come on pl_14',
  $q$SELECT public.dps_asistencia_marcar(pg_temp.plan('pl_14'), ARRAY[pg_temp.id('us', 3)], 'aviso_no_viene') ->> 'cambiados'$q$, '1');
UPDATE public.dream_team_servicios SET estado = 'en_pausa', motivo_actual = 'admin_pausa' WHERE id = pg_temp.id('se', 3);
SELECT pg_temp.assert_eq('d11: a paused servicio removes the automatic row only; the manual ones stay',
  $q$SELECT pg_temp.directores('pl_1') || '|' || (SELECT count(*) FROM public.dps_convocados c
                                                    WHERE c.plan_id = pg_temp.plan('pl_1') AND c.persona_id = pg_temp.id('us', 3)
                                                      AND NOT c.automatico)$q$,
  'Alfa:0:U5m,Beta:0:U6m,Epsilon:1:,Gamma:0:U7a|1');
SELECT pg_temp.assert_eq('d12: on pl_14 the sheet drops him',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.dps_asistencia_planilla(pg_temp.plan('pl_14'), NULL) -> 'equipos') e,
                               jsonb_array_elements(e -> 'personas') p
      WHERE p ->> 'apellido' = 'U3'$q$, '0');
SELECT pg_temp.assert_eq('d12b: and his aviso',
  $q$SELECT count(*)::text FROM public.dps_asistencias a WHERE a.plan_id = pg_temp.plan('pl_14') AND a.persona_id = pg_temp.id('us', 3)$q$, '0');
SELECT pg_temp.assert_eq('d13: the history keeps its automatic row',
  $q$SELECT pg_temp.directores('pl_15')$q$, 'Alfa:0:U3a,Beta:1:,Epsilon:1:,Gamma:1:');
UPDATE public.dream_team_servicios SET rol_id = pg_temp.id('ro', 7) WHERE id = pg_temp.id('se', 7);
SELECT pg_temp.assert_eq('d14: a rol that is no longer director removes him: «Falta 1»',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U5m,Beta:0:U6m,Epsilon:1:,Gamma:1:');
UPDATE public.dream_team_servicios SET estado = 'activo', motivo_actual = 'admin_reactivacion' WHERE id = pg_temp.id('se', 3);
SELECT pg_temp.assert_eq('d15: reactivated, he is back',
  $q$SELECT pg_temp.directores('pl_1')$q$, 'Alfa:0:U3a+U5m,Beta:0:U6m,Epsilon:1:,Gamma:1:');

-- ── e. desconvocar ───────────────────────────────────────────────────

SELECT pg_temp.assert_raises('e1: an automatic row cannot be removed by hand',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_1'), pg_temp.puesto_dir(1), pg_temp.id('us', 3))$q$, '22023', 'convocado_automatico');
SELECT pg_temp.assert_eq('e2: it is still there; the manual one beside it is removed',
  $q$SELECT public.dps_desconvocar(pg_temp.plan('pl_1'), pg_temp.puesto_dir(1), pg_temp.id('us', 5)) || '|' || pg_temp.directores('pl_1')$q$,
  'true|Alfa:0:U3a,Beta:0:U6m,Epsilon:1:,Gamma:1:');

-- ── f. copiar ────────────────────────────────────────────────────────

-- pl_1 has two manual rows (U6 in Beta, U3 in ZZ Dd Manual) besides the
-- automatic ones; pl_2 has only automatic ones (U6 already in Beta, and a
-- stale U7 in Gamma that the copy's own sync removes); pl_14 has no manual
-- row.
SELECT pg_temp.assert_eq('f1: copying skips the automatic rows and ignores them in the destino check',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_1'), pg_temp.plan('pl_2'), false)::text$q$, '{"copiados": 1, "omitidos": 1}');
SELECT pg_temp.assert_eq('f2: in pl_2 only the copied row is manual',
  $q$SELECT string_agg(u.apellido || ':' || c.automatico, ',' ORDER BY c.automatico, u.apellido)
       FROM public.dps_convocados c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE c.plan_id = pg_temp.plan('pl_2') AND u.nombre = 'ZZ Dd'$q$,
  'U3:false,U3:true,U6:true,U8:true');
SELECT pg_temp.assert_raises('f3: now pl_2 has manual rows',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_1'), pg_temp.plan('pl_2'), false)$q$, '22023', 'destino_con_convocados');
SELECT pg_temp.assert_eq('f4: replacing with a plan without manual rows',
  $q$SELECT public.dps_copiar_plan(pg_temp.plan('pl_14'), pg_temp.plan('pl_2'), true)::text$q$, '{"copiados": 0, "omitidos": 0}');
SELECT pg_temp.assert_eq('f4b: removes the manual rows and keeps the automatic ones',
  $q$SELECT string_agg(u.apellido || ':' || c.automatico, ',' ORDER BY c.automatico, u.apellido)
       FROM public.dps_convocados c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE c.plan_id = pg_temp.plan('pl_2') AND u.nombre = 'ZZ Dd'$q$,
  'U3:true,U6:true,U8:true');

-- ── g. the Equipos tab ───────────────────────────────────────────────

SELECT pg_temp.assert_eq('g1: every convocado carries a boolean automatico',
  $q$SELECT count(*) FILTER (WHERE jsonb_typeof(c -> 'automatico') <> 'boolean' OR c -> 'automatico' IS NULL)
            || '|' || (count(*) > 0)
       FROM jsonb_array_elements(public.dps_plan_equipos(pg_temp.plan('pl_1')) -> 'equipos') e,
            jsonb_array_elements(e -> 'puestos') p, jsonb_array_elements(p -> 'convocados') c$q$, '0|true');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('g2: a random user still cannot read it',
  $q$SELECT public.dps_plan_equipos(pg_temp.plan('pl_1'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_dd_failures);
END;
$$;
