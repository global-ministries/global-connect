-- S10 + T13 (odd/tasks/dps-asistencia-pco.md, L48, L9, L12) — the order of
-- the service and each plan's own horarios
-- (20261108208000_dps_orden_servicio.sql). Needs the earlier DPS
-- migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_orden_items (columns, FK to dps_planes
--      ON DELETE CASCADE, one posicion per plan) has RLS on, no policies and
--      no privilege for authenticated; the eight RPCs are SECURITY DEFINER
--      with search_path '', executable by authenticated, not by anon nor
--      PUBLIC; the internal helpers are not executable; anon cannot call
--      them.
--   b. dps_plan_horarios_guardar: one evening service (Cena del Señor at
--      19:00, llegada 18:00) and four services are saved and read back by
--      dps_plan_leer and dps_planes_rango; refused, leaving the plan as it
--      was: none or five services, an unsorted or repeated list, a bad
--      format, a non-string, a NULL list, a NULL llegada, a llegada after
--      the first service, an unknown plan. Plans created later still take
--      the defaults of dps_config.
--   c. dps_orden_leer / dps_orden_plantilla: an empty order; the template of
--      the PDF (Pre servicio and Ensayo general before the service, the
--      service sections, Post servicio after) only on an empty order.
--   d. dps_orden_agregar / dps_orden_item_guardar / dps_orden_mover /
--      dps_orden_eliminar: add at the end and at a position (the rest shift),
--      a header with its fase; edit título, duración, notas, responsable and
--      a header's fase; move up, down and past the end (clamped); delete;
--      posiciones stay 0..n-1. Refused: blank or long título, a negative or
--      too long duración, long notas or responsable, an unknown tipo or
--      fase, an unknown item, an unknown plan, a full order (150).
--   e. dps_orden_copiar: copies the items in order into an empty plan;
--      refuses a plan with an order unless reemplazar ('destino_con_orden'),
--      then replaces it; the same plan or an unknown one is 'plan_invalido'.
--      The order goes with its plan when it moves and disappears when the
--      plan is deleted.
--   f. Authority: a plain DPS servidor reads the order (puede_editar false)
--      but cannot change it nor the horarios; a random user and a caller
--      without a session get 42501 'sin_autoridad'; nothing changed.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Reads that need a session set request.jwt.claim.sub to the fixture
-- auth id; the anon case runs under SET LOCAL ROLE anon.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Or"):
--   1 PLAN    dream_team.direct on the DPS root (plans)
--   2 VOL     Voluntario servicio in ZZ Or Alfa (a plain servidor)
--   3 RANDOM  nothing
-- No Sunday plan is created: the fixture plans are Cena del Señor and
-- special events titled 'ZZ Or …' around H + 300 (H = ninos_hoy()), far
-- from real plans.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_do_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_do_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_do_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  INSERT INTO t_do_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_do_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9d00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd9d1' WHEN 'us' THEN 'd9d2' WHEN 'eq' THEN 'd9d3'
                       WHEN 'ro' THEN 'd9d4' WHEN 'se' THEN 'd9d5' END,
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

CREATE OR REPLACE FUNCTION pg_temp.h(p_n int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('hoy')::date + p_n;
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

-- The id of the item at posicion p_i (0-based) of a plan.
-- The helpers that read the table are VOLATILE, so each call sees the
-- changes made earlier in the same statement.
CREATE OR REPLACE FUNCTION pg_temp.item(p_plan uuid, p_i int) RETURNS uuid LANGUAGE sql AS $$
  SELECT o.id FROM public.dps_orden_items o WHERE o.plan_id = p_plan AND o.posicion = p_i;
$$;

-- The order of a plan read from the table: 'tipo-letter:título:duración' by
-- posicion (E = encabezado with its fase, I = item).
CREATE OR REPLACE FUNCTION pg_temp.orden(p_plan uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(CASE o.tipo WHEN 'encabezado' THEN 'E(' || o.fase || ')' ELSE 'I' END
                             || ':' || o.titulo || ':' || o.duracion_seg, ',' ORDER BY o.posicion), '-')
    FROM public.dps_orden_items o WHERE o.plan_id = p_plan;
$$;

-- posiciones are exactly 0..n-1.
CREATE OR REPLACE FUNCTION pg_temp.contiguo(p_plan uuid) RETURNS text LANGUAGE sql AS $$
  SELECT (count(*) = 0 OR (min(o.posicion) = 0 AND max(o.posicion) = count(*) - 1 AND count(DISTINCT o.posicion) = count(*)))::text
    FROM public.dps_orden_items o WHERE o.plan_id = p_plan;
$$;

CREATE OR REPLACE FUNCTION pg_temp.horarios(p_plan uuid) RETURNS text LANGUAGE sql AS $$
  SELECT p.horarios::text || '|' || to_char(p.llegada, 'HH24:MI') FROM public.dps_planes p WHERE p.id = p_plan;
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_do_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_do_ctx (k, v) VALUES ('hoy', public.ninos_hoy()::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'do-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Or', 'U' || n, 'do-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 3) AS n;
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9d00000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Or Alfa', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'Voluntario', 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 2), pg_temp.id('us', 2), pg_temp.id('eq', 1), pg_temp.id('ro', 1), 'activo',
        now() - interval '30 days', 'admin_asignacion');

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT pg_temp.id('us', x.n), x.cap, 'dream_team', 'equipo', x.scope, 'zz-test'
  FROM (VALUES (1, 'dream_team.direct', pg_temp.ctx('raiz')),
               (2, 'dream_team.serve', pg_temp.id('eq', 1)::text)) AS x(n, cap, scope);

GRANT INSERT, SELECT, UPDATE ON t_do_failures, t_do_ctx TO authenticated, anon;
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

SELECT pg_temp.assert_eq('a1: dps_orden_items columns',
  $q$SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' ORDER BY a.attname COLLATE "C")
       FROM pg_attribute a
      WHERE a.attrelid = 'public.dps_orden_items'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname IN ('id', 'plan_id', 'posicion', 'tipo', 'titulo', 'duracion_seg', 'notas', 'responsable', 'fase')$q$,
  'duracion_seg:integer:true,fase:text:false,id:uuid:true,notas:text:false,plan_id:uuid:true,posicion:integer:true,'
  || 'responsable:text:false,tipo:text:true,titulo:text:true');
SELECT pg_temp.assert_eq('a2: plan_id references dps_planes ON DELETE CASCADE',
  $q$SELECT string_agg(c.confrelid::regclass::text || ':' || c.confdeltype::text, ',')
       FROM pg_constraint c WHERE c.conrelid = 'public.dps_orden_items'::regclass AND c.contype = 'f'
        AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'plan_id')]$q$,
  'dps_planes:c');
SELECT pg_temp.assert_eq('a3: one posicion per plan',
  $q$SELECT count(*)::text FROM pg_constraint c
      WHERE c.conrelid = 'public.dps_orden_items'::regclass AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (plan_id, posicion)%'$q$, '1');
SELECT pg_temp.assert_eq('a4: RLS on, no policies, no privilege for anon or authenticated',
  $q$SELECT c.relrowsecurity || ':' || (SELECT count(*) FROM pg_policy po WHERE po.polrelid = c.oid) || ':'
            || has_table_privilege('authenticated', c.oid, 'SELECT') || ':' || has_table_privilege('authenticated', c.oid, 'INSERT')
            || ':' || has_table_privilege('anon', c.oid, 'SELECT')
       FROM pg_class c WHERE c.oid = 'public.dps_orden_items'::regclass$q$, 'true:0:false:false:false');
SELECT pg_temp.assert_eq('a5: the RPCs are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname LIKE 'dps\_orden\_%' OR p.proname = 'dps_plan_horarios_guardar')$q$, '9|0');
SELECT pg_temp.assert_eq('a6: authenticated executes the public ones; anon and PUBLIC none',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ':'
                       || has_function_privilege('anon', p.oid, 'EXECUTE') || ':'
                       || coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x WHERE x.privilege_type = 'EXECUTE'), false),
                       ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname LIKE 'dps\_orden\_%' OR p.proname = 'dps_plan_horarios_guardar')$q$,
  'dps_orden_agregar:true:false:false,dps_orden_copiar:true:false:false,dps_orden_eliminar:true:false:false,'
  || 'dps_orden_item_guardar:true:false:false,dps_orden_item_json:false:false:false,dps_orden_leer:true:false:false,'
  || 'dps_orden_mover:true:false:false,dps_orden_plantilla:true:false:false,dps_plan_horarios_guardar:true:false:false');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a7: authenticated cannot read dps_orden_items', $q$SELECT count(*) FROM public.dps_orden_items$q$, '42501');
SELECT pg_temp.assert_raises('a7: authenticated cannot write dps_orden_items',
  $q$INSERT INTO public.dps_orden_items (plan_id, posicion, tipo, titulo) VALUES (gen_random_uuid(), 0, 'item', 'X')$q$, '42501');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('a8: anon cannot read an order', $q$SELECT public.dps_orden_leer(gen_random_uuid())$q$, '42501');
SELECT pg_temp.assert_raises('a8: anon cannot save horarios',
  $q$SELECT public.dps_plan_horarios_guardar(gen_random_uuid(), '["19:00"]', '18:00')$q$, '42501');
RESET ROLE;

-- ── b. horarios ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('cena', $q$SELECT public.dps_plan_crear(pg_temp.h(300), 'cena_del_senor', 'ZZ Or Cena')::text$q$);
SELECT pg_temp.put('evento', $q$SELECT public.dps_evento_crear('especial', 'ZZ Or Conferencia', pg_temp.h(302), NULL) -> 'planes' -> 0 ->> 'id'$q$);
SELECT pg_temp.put('vacio', $q$SELECT public.dps_plan_crear(pg_temp.h(304), 'especial', 'ZZ Or Vacío')::text$q$);
SELECT pg_temp.assert_eq('b0: a new plan takes the horarios and llegada of dps_config',
  $q$SELECT (p.horarios = c.horarios AND p.llegada = c.llegada)::text FROM public.dps_planes p, public.dps_config c
      WHERE c.id AND p.id = pg_temp.plan('cena')$q$, 'true');

SELECT pg_temp.assert_eq('b1: one evening service for the Cena del Señor, returned as the plan JSON',
  $q$SELECT (r -> 'horarios')::text || '|' || (r ->> 'llegada') || '|' || (r ->> 'id' = pg_temp.ctx('cena'))
       FROM (SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["19:00"]', '18:00') AS r) x$q$,
  '["19:00"]|18:00|true');
SELECT pg_temp.assert_eq('b2: dps_plan_leer and dps_planes_rango read it back',
  $q$SELECT (public.dps_plan_leer(pg_temp.plan('cena')) -> 'horarios')::text || '|' || (public.dps_plan_leer(pg_temp.plan('cena')) ->> 'llegada')
            || '|' || (SELECT (p -> 'horarios')::text FROM jsonb_array_elements(public.dps_planes_rango(pg_temp.h(300), pg_temp.h(300))) p
                        WHERE p ->> 'id' = pg_temp.ctx('cena'))$q$,
  '["19:00"]|18:00|["19:00"]');
SELECT pg_temp.assert_eq('b3: four services',
  $q$SELECT (public.dps_plan_horarios_guardar(pg_temp.plan('evento'), '["08:00", "10:00", "12:00", "18:30"]', '06:30') -> 'horarios')::text$q$,
  '["08:00", "10:00", "12:00", "18:30"]');
SELECT pg_temp.assert_eq('b4: the llegada may be the first service itself',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('vacio'), '["10:00"]', '10:00') ->> 'llegada'$q$, '10:00');
SELECT pg_temp.assert_raises('b5: no service', $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '[]', '18:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: five services',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["08:00", "09:00", "10:00", "11:00", "12:00"]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: unsorted',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["11:15", "09:15"]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: repeated',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["09:15", "09:15"]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: bad format',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["9:15"]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: 24:00 is not a time',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["24:00"]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: a non-string',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '[915]', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: not an array',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '"19:00"', '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b5: a NULL list',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), NULL, '07:00')$q$, '22023', 'horarios_invalidos');
SELECT pg_temp.assert_raises('b6: a NULL llegada',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["19:00"]', NULL)$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_raises('b6: a llegada after the first service',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["19:00", "21:00"]', '19:30')$q$, '22023', 'llegada_invalida');
SELECT pg_temp.assert_raises('b7: an unknown plan',
  $q$SELECT public.dps_plan_horarios_guardar(gen_random_uuid(), '["19:00"]', '18:00')$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_eq('b8: the refused calls left the Cena as it was',
  $q$SELECT pg_temp.horarios(pg_temp.plan('cena'))$q$, '["19:00"]|18:00');
SELECT pg_temp.assert_eq('b9: dps_config keeps its defaults',
  $q$SELECT horarios::text || '|' || to_char(llegada, 'HH24:MI') FROM public.dps_config WHERE id$q$, '["09:15", "11:15"]|07:00');

-- ── c. read and template ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('c1: an empty order',
  $q$SELECT (r ->> 'plan_id' = pg_temp.ctx('cena')) || '|' || (r ->> 'puede_editar') || '|' || (r -> 'items')::text
       FROM (SELECT public.dps_orden_leer(pg_temp.plan('cena')) AS r) x$q$, 'true|true|[]');
SELECT pg_temp.assert_raises('c2: an unknown plan', $q$SELECT public.dps_orden_leer(gen_random_uuid())$q$, '22023', 'plan_invalido');

SELECT pg_temp.assert_eq('c3: the template of the PDF, returned as the order',
  $q$SELECT jsonb_array_length(public.dps_orden_plantilla(pg_temp.plan('cena')) -> 'items')::text$q$, '25');
SELECT pg_temp.assert_eq('c4: its headers and phases, in order',
  $q$SELECT string_agg(o.titulo || ':' || o.fase, ',' ORDER BY o.posicion) FROM public.dps_orden_items o
      WHERE o.plan_id = pg_temp.plan('cena') AND o.tipo = 'encabezado'$q$,
  'Pre servicio:pre,Ensayo general:pre,Ambiente:servicio,Opener:servicio,Bienvenida:servicio,Banda:servicio,Dar:servicio,'
  || 'Versintro:servicio,Mensaje:servicio,Recap:servicio,Post servicio:post');
SELECT pg_temp.assert_eq('c5: the pre servicio items of the PDF (Montaje 45 min, Reunión general 15, Ensayo general 60)',
  $q$SELECT string_agg(o.titulo || ':' || o.duracion_seg, ',' ORDER BY o.posicion) FROM public.dps_orden_items o
      WHERE o.plan_id = pg_temp.plan('cena') AND o.tipo = 'item' AND o.posicion < 5$q$,
  'Montaje:2700,Reunión general y oración:900,Ensayo general:3600');
SELECT pg_temp.assert_eq('c6: contiguous posiciones and every item read with its fields',
  $q$SELECT pg_temp.contiguo(pg_temp.plan('cena')) || '|'
            || (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.dps_orden_leer(pg_temp.plan('cena')) -> 'items' -> 1) k)$q$,
  'true|duracion_seg,fase,id,notas,posicion,responsable,tipo,titulo');
SELECT pg_temp.assert_raises('c7: the template only on an empty order',
  $q$SELECT public.dps_orden_plantilla(pg_temp.plan('cena'))$q$, '22023', 'destino_con_orden');
SELECT pg_temp.assert_raises('c8: the template of an unknown plan',
  $q$SELECT public.dps_orden_plantilla(gen_random_uuid())$q$, '22023', 'plan_invalido');

-- ── d. add, edit, move, delete ───────────────────────────────────────

SELECT pg_temp.put('d1', $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', '  Bienvenida  ', 240, NULL, NULL)::text$q$);
SELECT pg_temp.assert_eq('d1: add an item at the end (NULL posicion), returned with its id and posicion',
  $q$SELECT (r ->> 'tipo') || ':' || (r ->> 'titulo') || ':' || (r ->> 'duracion_seg') || ':' || (r ->> 'posicion') || ':'
            || coalesce(r ->> 'fase', '-') || ':' || (r ->> 'id' = pg_temp.item(pg_temp.plan('vacio'), 0)::text)
       FROM (SELECT pg_temp.ctx('d1')::jsonb AS r) x$q$,
  'item:Bienvenida:240:0:-:true');
SELECT pg_temp.put('x', $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', 'Mensaje', 2100, NULL, NULL) ->> 'id'$q$);
SELECT pg_temp.put('h', $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'encabezado', 'Pre servicio', NULL, 0, 'pre') ->> 'id'$q$);
SELECT pg_temp.assert_eq('d2: a header added at 0 shifts the rest; an item ignores fase',
  $q$SELECT pg_temp.orden(pg_temp.plan('vacio')) || '|' || pg_temp.contiguo(pg_temp.plan('vacio'))$q$,
  'E(pre):Pre servicio:0,I:Bienvenida:240,I:Mensaje:2100|true');
SELECT pg_temp.put('y', $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', 'Montaje', 2700, 1, 'post') ->> 'id'$q$);
SELECT pg_temp.assert_eq('d3: an item added at 1, its fase dropped',
  $q$SELECT pg_temp.orden(pg_temp.plan('vacio')) || '|' || coalesce((SELECT o.fase FROM public.dps_orden_items o WHERE o.id = pg_temp.plan('y')), '-')$q$,
  'E(pre):Pre servicio:0,I:Montaje:2700,I:Bienvenida:240,I:Mensaje:2100|-');
SELECT pg_temp.assert_eq('d4: a posicion past the end goes last; a negative one goes first',
  $q$SELECT (public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', 'Cierre', 60, 99, NULL) ->> 'posicion') || ','
            || (public.dps_orden_agregar(pg_temp.plan('vacio'), 'encabezado', 'Inicio', 0, -3, NULL) ->> 'posicion') || '|'
            || pg_temp.orden(pg_temp.plan('vacio')) || '|' || pg_temp.contiguo(pg_temp.plan('vacio'))$q$,
  '4,0|E(servicio):Inicio:0,E(pre):Pre servicio:0,I:Montaje:2700,I:Bienvenida:240,I:Mensaje:2100,I:Cierre:60|true');

SELECT pg_temp.put('y_notas', $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('y'), 'Montaje', 2700, 'Escenario', 'Stage', NULL)::text$q$);
SELECT pg_temp.assert_eq('d5: edit título, duración, notas and responsable (trimmed)',
  $q$SELECT (r ->> 'titulo') || ':' || (r ->> 'duracion_seg') || ':' || (r ->> 'notas') || ':' || (r ->> 'responsable')
       FROM (SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), ' Mensaje · Parte 3 ', 2160, ' Comunicador: P. O. ', ' Comunicador ', NULL) AS r) x$q$,
  'Mensaje · Parte 3:2160:Comunicador: P. O.:Comunicador');
SELECT pg_temp.assert_eq('d5b: blank notas and responsable clear them',
  $q$SELECT coalesce(r ->> 'notas', '-') || ':' || coalesce(r ->> 'responsable', '-')
       FROM (SELECT public.dps_orden_item_guardar(pg_temp.plan('y'), 'Montaje', 2700, '   ', '', NULL) AS r) x$q$, '-:-');
SELECT pg_temp.assert_eq('d5c: and so does the table',
  $q$SELECT coalesce(o.notas, '-') || ':' || coalesce(o.responsable, '-') FROM public.dps_orden_items o WHERE o.id = pg_temp.plan('y')$q$, '-:-');
SELECT pg_temp.assert_eq('d6: a header changes its fase and keeps duración 0',
  $q$SELECT (r ->> 'fase') || ':' || (r ->> 'duracion_seg')
       FROM (SELECT public.dps_orden_item_guardar(pg_temp.plan('h'), 'Antes', 500, NULL, NULL, 'post') AS r) x$q$, 'post:0');
SELECT pg_temp.assert_raises('d7: a blank título',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), '  ', 60, NULL, NULL, NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('d7: a long título',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), repeat('a', 121), 60, NULL, NULL, NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('d7: a negative duración',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), 'Mensaje', -1, NULL, NULL, NULL)$q$, '22023', 'duracion_invalida');
SELECT pg_temp.assert_raises('d7: more than 4 hours',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), 'Mensaje', 14401, NULL, NULL, NULL)$q$, '22023', 'duracion_invalida');
SELECT pg_temp.assert_raises('d7: a NULL duración for an item',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), 'Mensaje', NULL, NULL, NULL, NULL)$q$, '22023', 'duracion_invalida');
SELECT pg_temp.assert_raises('d7: long notas',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), 'Mensaje', 60, repeat('n', 501), NULL, NULL)$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('d7: a long responsable',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('x'), 'Mensaje', 60, NULL, repeat('r', 81), NULL)$q$, '22023', 'valor_invalido');
SELECT pg_temp.assert_raises('d7: an unknown fase for a header',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('h'), 'Antes', 0, NULL, NULL, 'durante')$q$, '22023', 'fase_invalida');
SELECT pg_temp.assert_raises('d7: an unknown item',
  $q$SELECT public.dps_orden_item_guardar(gen_random_uuid(), 'X', 60, NULL, NULL, NULL)$q$, '22023', 'item_invalido');
SELECT pg_temp.assert_raises('d8: add with an unknown tipo',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'nota', 'X', 60, NULL, NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('d8: add with a blank título',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', '', 60, NULL, NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('d8: add with a bad duración',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'item', 'X', 99999, NULL, NULL)$q$, '22023', 'duracion_invalida');
SELECT pg_temp.assert_raises('d8: add a header with an unknown fase',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('vacio'), 'encabezado', 'X', 0, NULL, 'luego')$q$, '22023', 'fase_invalida');
SELECT pg_temp.assert_raises('d8: add to an unknown plan',
  $q$SELECT public.dps_orden_agregar(gen_random_uuid(), 'item', 'X', 60, NULL, NULL)$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_eq('d9: the refused calls changed nothing',
  $q$SELECT pg_temp.orden(pg_temp.plan('vacio'))$q$,
  'E(servicio):Inicio:0,E(post):Antes:0,I:Montaje:2700,I:Bienvenida:240,I:Mensaje · Parte 3:2160,I:Cierre:60');

-- Moves: [Inicio, Antes, Montaje, Bienvenida, Mensaje, Cierre]
SELECT pg_temp.assert_eq('d10: move down (Montaje 2 -> 4)',
  $q$SELECT public.dps_orden_mover(pg_temp.plan('y'), 4)::text || '|' || pg_temp.orden(pg_temp.plan('vacio'))$q$,
  '4|E(servicio):Inicio:0,E(post):Antes:0,I:Bienvenida:240,I:Mensaje · Parte 3:2160,I:Montaje:2700,I:Cierre:60');
SELECT pg_temp.assert_eq('d11: move up (Montaje 4 -> 1)',
  $q$SELECT public.dps_orden_mover(pg_temp.plan('y'), 1)::text || '|' || pg_temp.orden(pg_temp.plan('vacio'))$q$,
  '1|E(servicio):Inicio:0,I:Montaje:2700,E(post):Antes:0,I:Bienvenida:240,I:Mensaje · Parte 3:2160,I:Cierre:60');
SELECT pg_temp.assert_eq('d12: past the end goes last, below 0 goes first, the same place is a no-op',
  $q$SELECT public.dps_orden_mover(pg_temp.plan('y'), 50) || ',' || public.dps_orden_mover(pg_temp.plan('x'), -2) || ','
            || public.dps_orden_mover(pg_temp.plan('x'), 0) || '|' || pg_temp.orden(pg_temp.plan('vacio')) || '|' || pg_temp.contiguo(pg_temp.plan('vacio'))$q$,
  '5,0,0|I:Mensaje · Parte 3:2160,E(servicio):Inicio:0,E(post):Antes:0,I:Bienvenida:240,I:Cierre:60,I:Montaje:2700|true');
SELECT pg_temp.assert_raises('d13: move an unknown item', $q$SELECT public.dps_orden_mover(gen_random_uuid(), 0)$q$, '22023', 'item_invalido');
SELECT pg_temp.assert_raises('d13: move to a NULL posicion', $q$SELECT public.dps_orden_mover(pg_temp.plan('y'), NULL)$q$, '22023', 'posicion_invalida');

SELECT pg_temp.assert_eq('d14: delete closes the gap',
  $q$SELECT public.dps_orden_eliminar(pg_temp.plan('h'))::text || '|' || pg_temp.orden(pg_temp.plan('vacio')) || '|' || pg_temp.contiguo(pg_temp.plan('vacio'))$q$,
  'true|I:Mensaje · Parte 3:2160,E(servicio):Inicio:0,I:Bienvenida:240,I:Cierre:60,I:Montaje:2700|true');
SELECT pg_temp.assert_raises('d15: delete an unknown item', $q$SELECT public.dps_orden_eliminar(gen_random_uuid())$q$, '22023', 'item_invalido');

-- A full order: 150 rows.
SELECT pg_temp.put('lleno', $q$SELECT public.dps_plan_crear(pg_temp.h(306), 'especial', 'ZZ Or Lleno')::text$q$);
SELECT pg_temp.put('lleno_n', $q$SELECT count(public.dps_orden_agregar(pg_temp.plan('lleno'), 'item', 'Fila ' || g, 60, NULL, NULL))::text
                                  FROM generate_series(1, 150) g$q$);
SELECT pg_temp.assert_raises('d16: at most 150 rows per order',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('lleno'), 'item', 'Una más', 60, NULL, NULL)$q$, '22023', 'orden_lleno');
SELECT pg_temp.assert_eq('d16b: still 150, contiguous',
  $q$SELECT pg_temp.ctx('lleno_n') || '|' || (SELECT count(*) FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('lleno'))
            || '|' || pg_temp.contiguo(pg_temp.plan('lleno'))$q$, '150|150|true');

-- ── e. copy, move and delete the plan ────────────────────────────────

SELECT pg_temp.put('destino', $q$SELECT public.dps_plan_crear(pg_temp.h(307), 'cena_del_senor', 'ZZ Or Cena 2')::text$q$);
SELECT pg_temp.put('e1', $q$SELECT public.dps_orden_copiar(pg_temp.plan('vacio'), pg_temp.plan('destino'), false)::text$q$);
SELECT pg_temp.assert_eq('e1: copy into an empty plan: every row in order, with its fields',
  $q$SELECT pg_temp.ctx('e1') || '|'
            || (pg_temp.orden(pg_temp.plan('destino')) = pg_temp.orden(pg_temp.plan('vacio'))) || '|'
            || (SELECT o.notas || ':' || o.responsable FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('destino') AND o.posicion = 0)$q$,
  '5|true|Comunicador: P. O.:Comunicador');
SELECT pg_temp.assert_raises('e2: a plan with an order needs reemplazar',
  $q$SELECT public.dps_orden_copiar(pg_temp.plan('cena'), pg_temp.plan('destino'), false)$q$, '22023', 'destino_con_orden');
SELECT pg_temp.assert_eq('e2b: still the first copy',
  $q$SELECT (pg_temp.orden(pg_temp.plan('destino')) = pg_temp.orden(pg_temp.plan('vacio')))::text$q$, 'true');
SELECT pg_temp.put('e3', $q$SELECT public.dps_orden_copiar(pg_temp.plan('cena'), pg_temp.plan('destino'), true)::text$q$);
SELECT pg_temp.assert_eq('e3: reemplazar replaces it',
  $q$SELECT pg_temp.ctx('e3') || '|'
            || (pg_temp.orden(pg_temp.plan('destino')) = pg_temp.orden(pg_temp.plan('cena'))) || '|' || pg_temp.contiguo(pg_temp.plan('destino'))$q$,
  '25|true|true');
SELECT pg_temp.assert_eq('e4: an empty origin copies nothing into an empty plan',
  $q$SELECT public.dps_orden_copiar(pg_temp.plan('evento'), pg_temp.plan('vacio'), true)::text || '|' || pg_temp.orden(pg_temp.plan('vacio'))$q$,
  '0|-');
SELECT pg_temp.assert_raises('e5: the same plan',
  $q$SELECT public.dps_orden_copiar(pg_temp.plan('cena'), pg_temp.plan('cena'), true)$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_raises('e5: an unknown origin',
  $q$SELECT public.dps_orden_copiar(gen_random_uuid(), pg_temp.plan('cena'), true)$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_eq('e6: the order goes with its plan to a new date',
  $q$SELECT (public.dps_plan_mover(pg_temp.plan('destino'), pg_temp.h(310)) ->> 'fecha')::date - pg_temp.h(0) || '|'
            || (SELECT count(*) FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('destino'))$q$, '310|25');
SELECT pg_temp.put('e7', $q$SELECT public.dps_plan_eliminar(pg_temp.plan('destino'), false)::text$q$);
SELECT pg_temp.assert_eq('e7: and disappears with it',
  $q$SELECT pg_temp.ctx('e7') || '|' || (SELECT count(*) FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('destino'))$q$, '1|0');

-- ── f. authority ─────────────────────────────────────────────────────

SELECT pg_temp.put('montaje', $q$SELECT pg_temp.item(pg_temp.plan('cena'), 1)::text$q$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f1: a servidor reads the order without editing it',
  $q$SELECT (r ->> 'puede_editar') || '|' || jsonb_array_length(r -> 'items')
       FROM (SELECT public.dps_orden_leer(pg_temp.plan('cena')) AS r) x$q$, 'false|25');
SELECT pg_temp.assert_raises('f2: a servidor cannot save horarios',
  $q$SELECT public.dps_plan_horarios_guardar(pg_temp.plan('cena'), '["20:00"]', '19:00')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor add',
  $q$SELECT public.dps_orden_agregar(pg_temp.plan('cena'), 'item', 'X', 60, NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor edit',
  $q$SELECT public.dps_orden_item_guardar(pg_temp.plan('montaje'), 'X', 60, NULL, NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor move',
  $q$SELECT public.dps_orden_mover(pg_temp.plan('montaje'), 3)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor delete',
  $q$SELECT public.dps_orden_eliminar(pg_temp.plan('montaje'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor copy',
  $q$SELECT public.dps_orden_copiar(pg_temp.plan('cena'), pg_temp.plan('vacio'), true)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f2: nor apply the template',
  $q$SELECT public.dps_orden_plantilla(pg_temp.plan('vacio'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('f3: a random user cannot read it',
  $q$SELECT public.dps_orden_leer(pg_temp.plan('cena'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('f4: nor a caller without a session',
  $q$SELECT public.dps_orden_leer(pg_temp.plan('cena'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f4: who cannot write either',
  $q$SELECT public.dps_orden_eliminar(pg_temp.plan('montaje'))$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('f5: the refused calls changed nothing',
  $q$SELECT pg_temp.horarios(pg_temp.plan('cena')) || '|' || (SELECT count(*) FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('cena'))
            || '|' || (SELECT o.titulo FROM public.dps_orden_items o WHERE o.plan_id = pg_temp.plan('cena') AND o.posicion = 1)
            || '|' || pg_temp.orden(pg_temp.plan('vacio'))$q$,
  '["19:00"]|18:00|25|Montaje|-');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_do_failures);
END;
$$;
