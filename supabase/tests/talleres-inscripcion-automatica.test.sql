-- T2b (odd/tasks/proximo-paso.md, S3 / L6.2) — RED->GREEN for
-- talleres.inscripcion_automatica and talleres_inscribirme
-- (20261107120000_talleres_inscripcion_automatica.sql). Run against STAGING
-- inside BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under
-- this file's own c7c00000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, like every other talleres
-- fixture test. Próximo Paso itself is looked up by slug, read-only.
--
-- Fixtures:
--   director (c7c…31) — director.write + read on the fixture node.
--   taller A (c7c…10) — individual, cadencia, inscripcion_automatica ON,
--     one plantilla grupo with capacidad 1.
--   taller B (c7c…20) — individual, cadencia, inscripcion_automatica OFF
--     (the default), one plantilla grupo with capacidad 5.
--   one edición of each, created by talleres_crear_edicion on 2031-06-01
--   and opened.
--   p1, p2 (c7c…41, c7c…51) — fresh accounts with a ficha and no roles.
--
-- Cases:
--   (a) option ON + cupo: p1 enrolls in A -> ok, estado 'aprobado',
--       the row is aprobado, not sobre_cupo.
--   (b) option ON + cupo full: p2 enrolls in A -> CUPO_LLENO, no row
--       (today's behavior, unchanged).
--   (c) option OFF: p1 enrolls in B -> ok, estado 'pendiente', the row is
--       pendiente (pins today).
--   (d) same effects as a manual approval: the director approves p1's B
--       row with the UPDATE of approveInscripcionAction; the auto-approved
--       A row and the manually approved B row agree on estado, sobre_cupo,
--       sobre_cupo_por, grupo_id, motivo_no_aprobado, unit_estado and
--       version, and both have updated_at >= created_at.
--   (e) Próximo Paso has the option ON; no other taller outside this
--       file's fixtures has it.
--   (f) the column is boolean NOT NULL DEFAULT false.
--   structural: talleres_inscribirme stays SECURITY DEFINER with
--     search_path pinned, EXECUTE for authenticated and service_role, none
--     for anon nor PUBLIC.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ia_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ia_failures TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ia_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ia_failures;
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

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

CREATE TEMP TABLE t_ia_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ia_fixture TO authenticated, anon;

CREATE TEMP TABLE t_ia_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ia_resultado TO authenticated, anon;

-- ── (f) and (e) before any fixture ──────────────────────────────────

SELECT pg_temp.assert_rows('(f) talleres.inscripcion_automatica is boolean NOT NULL DEFAULT false',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talleres' AND column_name = 'inscripcion_automatica'
       AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false'$$, 1);

SELECT pg_temp.assert_rows('(e) Próximo Paso has inscripción automática',
  $$SELECT 1 FROM public.talleres WHERE slug = 'proximo-paso' AND inscripcion_automatica$$, 1);
SELECT pg_temp.assert_rows('(e) no other taller has it',
  $$SELECT 1 FROM public.talleres WHERE slug <> 'proximo-paso' AND inscripcion_automatica$$, 0);

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('c7c00000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ IA Equipo', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('c7c00000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ IA Equipo B', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (
  id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen,
  cierre_inscripcion_offset_dias, intervalo_ediciones_dias, inscripcion_automatica
) VALUES
  ('c7c00000-0000-4000-8000-000000000010', 'zz-ia-fixture-a', 'ZZ IA Fixture Taller A',
   'c7c00000-0000-4000-8000-000000000001', 'individual', NULL, 'cadencia', 0, 28, true),
  ('c7c00000-0000-4000-8000-000000000020', 'zz-ia-fixture-b', 'ZZ IA Fixture Taller B',
   'c7c00000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 0, 28, false);

INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad) VALUES
  ('c7c00000-0000-4000-8000-000000000010', 'ZZ IA Grupo A', 1, 1),
  ('c7c00000-0000-4000-8000-000000000020', 'ZZ IA Grupo B', 1, 5);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c7c00000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'ia-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c7c00000-0000-4000-8000-000000000040', 'authenticated', 'authenticated', 'ia-fixture-p1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('c7c00000-0000-4000-8000-000000000050', 'authenticated', 'authenticated', 'ia-fixture-p2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, fecha_nacimiento, estado_civil, genero) VALUES
  ('c7c00000-0000-4000-8000-000000000031', 'c7c00000-0000-4000-8000-000000000030', 'ZZ IA', 'Director', 'ia-fixture-director@example.test', '1980-01-01', 'Soltero', 'Otro'),
  ('c7c00000-0000-4000-8000-000000000041', 'c7c00000-0000-4000-8000-000000000040', 'ZZ IA', 'Uno', 'ia-fixture-p1@example.test', '1990-01-01', 'Soltero', 'Otro'),
  ('c7c00000-0000-4000-8000-000000000051', 'c7c00000-0000-4000-8000-000000000050', 'ZZ IA', 'Dos', 'ia-fixture-p2@example.test', '1990-01-01', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT 'c7c00000-0000-4000-8000-000000000031', k.capability_key, 'talleres_crecimiento', 'taller', e.equipo_id
FROM (VALUES ('c7c00000-0000-4000-8000-000000000001'::uuid), ('c7c00000-0000-4000-8000-000000000002'::uuid)) AS e(equipo_id)
CROSS JOIN (VALUES ('talleres_crecimiento.director.write'), ('talleres_crecimiento.director.read')) AS k(capability_key);

-- Ediciones, created the real way by the director.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7c00000-0000-4000-8000-000000000030');

DO $crear$
DECLARE
  v_a jsonb;
  v_b jsonb;
BEGIN
  v_a := public.talleres_crear_edicion('c7c00000-0000-4000-8000-000000000010', DATE '2031-06-01', NULL, 0);
  v_b := public.talleres_crear_edicion('c7c00000-0000-4000-8000-000000000020', DATE '2031-06-01', NULL, 0);
  INSERT INTO t_ia_fixture (key, id) VALUES
    ('ed_a', (v_a -> 'ediciones' -> 0 ->> 'edicion_id')::uuid),
    ('ed_b', (v_b -> 'ediciones' -> 0 ->> 'edicion_id')::uuid);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: talleres_crear_edicion', SQLSTATE || ' ' || SQLERRM);
END;
$crear$;

RESET ROLE;

-- Estado set as postgres: a fixture, not the behavior under test.
UPDATE public.taller_ediciones SET estado = 'abierto'
 WHERE id IN (SELECT id FROM t_ia_fixture WHERE key IN ('ed_a', 'ed_b'));

SELECT pg_temp.assert_rows('fixture: cupo 1 in A and 5 in B',
  $$SELECT 1 FROM t_ia_fixture f, LATERAL public.talleres_cupo_edicion_calculo(f.id) c
     WHERE (f.key = 'ed_a' AND c.cupo = 1 AND c.ocupados = 0)
        OR (f.key = 'ed_b' AND c.cupo = 5 AND c.ocupados = 0)$$, 2);

-- ══ (a), (c) as p1 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7c00000-0000-4000-8000-000000000040');

DO $p1$
BEGIN
  INSERT INTO t_ia_resultado (key, valor) VALUES
    ('a', public.talleres_inscribirme((SELECT id FROM t_ia_fixture WHERE key = 'ed_a'), NULL));
  INSERT INTO t_ia_resultado (key, valor) VALUES
    ('c', public.talleres_inscribirme((SELECT id FROM t_ia_fixture WHERE key = 'ed_b'), NULL));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(a)/(c) talleres_inscribirme as p1', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$p1$;

-- ══ (b) as p2: A is full now ══

SELECT pg_temp.as_persona('c7c00000-0000-4000-8000-000000000050');

DO $p2$
BEGIN
  INSERT INTO t_ia_resultado (key, valor) VALUES
    ('b', public.talleres_inscribirme((SELECT id FROM t_ia_fixture WHERE key = 'ed_a'), NULL));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(b) talleres_inscribirme as p2', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$p2$;

RESET ROLE;

SELECT pg_temp.assert_rows('(a) option ON + cupo answers ok with estado aprobado and the same keys',
  $$SELECT 1 FROM t_ia_resultado
     WHERE key = 'a' AND (valor ->> 'ok')::boolean AND valor ->> 'estado' = 'aprobado'
       AND valor ? 'inscripcion_id' AND valor ? 'pareja_origen'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(valor) k)
           = ARRAY['estado', 'inscripcion_id', 'ok', 'pareja_origen']$$, 1);
SELECT pg_temp.assert_rows('(a) the row is aprobado and not sobre_cupo',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.id = (SELECT (valor ->> 'inscripcion_id')::uuid FROM t_ia_resultado WHERE key = 'a')
       AND i.persona_principal_id = 'c7c00000-0000-4000-8000-000000000041'
       AND i.estado = 'aprobado' AND NOT i.sobre_cupo$$, 1);

SELECT pg_temp.assert_rows('(b) option ON + cupo full answers CUPO_LLENO',
  $$SELECT 1 FROM t_ia_resultado WHERE key = 'b' AND valor = '{"ok": false, "codigo": "CUPO_LLENO"}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('(b) nothing is written for p2',
  $$SELECT 1 FROM public.taller_inscripciones WHERE persona_principal_id = 'c7c00000-0000-4000-8000-000000000051'$$, 0);
SELECT pg_temp.assert_rows('(b) A keeps 1 ocupado of 1',
  $$SELECT 1 FROM public.talleres_cupo_edicion_calculo((SELECT id FROM t_ia_fixture WHERE key = 'ed_a')) c
     WHERE c.cupo = 1 AND c.ocupados = 1$$, 1);

SELECT pg_temp.assert_rows('(c) option OFF answers ok with estado pendiente',
  $$SELECT 1 FROM t_ia_resultado WHERE key = 'c' AND (valor ->> 'ok')::boolean AND valor ->> 'estado' = 'pendiente'$$, 1);
SELECT pg_temp.assert_rows('(c) the row stays pendiente',
  $$SELECT 1 FROM public.taller_inscripciones i
     WHERE i.id = (SELECT (valor ->> 'inscripcion_id')::uuid FROM t_ia_resultado WHERE key = 'c')
       AND i.estado = 'pendiente'$$, 1);

-- ══ (d) the director approves p1's B row like approveInscripcionAction ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7c00000-0000-4000-8000-000000000030');

DO $aprobar$
DECLARE
  v_n int;
BEGIN
  UPDATE public.taller_inscripciones
     SET estado = 'aprobado'
   WHERE id = (SELECT (valor ->> 'inscripcion_id')::uuid FROM t_ia_resultado WHERE key = 'c')
     AND estado = 'pendiente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    PERFORM pg_temp.fail('(d) manual approval', 'expected 1 row updated, got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(d) manual approval', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$aprobar$;

RESET ROLE;

SELECT pg_temp.assert_rows('(d) the auto-approved row matches a manually approved one',
  $$SELECT 1
      FROM public.taller_inscripciones a, public.taller_inscripciones m
     WHERE a.id = (SELECT (valor ->> 'inscripcion_id')::uuid FROM t_ia_resultado WHERE key = 'a')
       AND m.id = (SELECT (valor ->> 'inscripcion_id')::uuid FROM t_ia_resultado WHERE key = 'c')
       AND a.estado = 'aprobado' AND m.estado = 'aprobado'
       AND a.sobre_cupo IS NOT DISTINCT FROM m.sobre_cupo
       AND a.sobre_cupo_por IS NOT DISTINCT FROM m.sobre_cupo_por
       AND a.grupo_id IS NOT DISTINCT FROM m.grupo_id
       AND a.motivo_no_aprobado IS NOT DISTINCT FROM m.motivo_no_aprobado
       AND a.unit_estado IS NOT DISTINCT FROM m.unit_estado
       AND a.version IS NOT DISTINCT FROM m.version
       AND a.updated_at >= a.created_at
       AND m.updated_at >= m.created_at$$, 1);

-- ══ structural ══

SELECT pg_temp.assert_rows('structural: SECURITY DEFINER with search_path pinned',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscribirme'
       AND pg_get_function_identity_arguments(p.oid) = 'p_edicion_id uuid, p_pareja jsonb'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public']$$, 1);
SELECT pg_temp.assert_rows('structural: EXECUTE for authenticated and service_role, none for anon nor PUBLIC',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscribirme'
       AND pg_get_function_identity_arguments(p.oid) = 'p_edicion_id uuid, p_pareja jsonb'
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND has_function_privilege('service_role', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)$$, 1);

SELECT pg_temp.report();

ROLLBACK;
