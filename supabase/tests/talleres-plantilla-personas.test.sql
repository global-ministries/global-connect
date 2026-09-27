-- (odd/tasks/talleres-configuracion-del-taller.md, post-T7 fix) — RED→
-- GREEN for talleres_plantilla_facilitadores_personas and
-- talleres_cohorte_equipo_personas (migration
-- 20260927140000_talleres_plantilla_personas.sql), the RPCs that replace
-- the `usuarios ( nombre, apellido )` embed in lib/platform/talleres/
-- plantilla.ts and lib/platform/talleres/grupo-detalle.ts's
-- loadGruposInstanciados. Run against STAGING inside BEGIN…ROLLBACK —
-- nothing here is kept; every fixture id lives under this file's own
-- b3000000-... namespace. 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos
-- de Corto Plazo) is referenced read-only as a parent equipo, the same
-- real anchor other talleres fixture tests already use.
--
-- Identities:
--   director        (b3…21) — director.write scoped to the fixture
--                              taller's own node (b3…001).
--   líder activo    (b3…23) — dream_team_servicios estado='activo' on
--                              the taller's OWN node — facilitador #1.
--   voluntario activo(b3…25) — dream_team_servicios estado='activo' on a
--                              CHILD node of the taller — facilitador #2,
--                              proves the descendant walk.
--   coordinador     (b3…31) — coordinator.write scoped to the same node
--                              (capability-only path, no servicio).
--   sin capacidad   (b3…29) — no capability grant, no servicio, at all.
--   director otro   (b3…41) — director.write scoped to an UNRELATED
--                              sibling node (b3…003) — proves tree
--                              scoping rejects a capability from
--                              elsewhere, not just "no capability at all".
--
-- Both RPCs share the SAME 6-case shape:
--   (1) the director sees exactly 2 rows, with both facilitadores' names.
--   (2) the coordinador (capability-only) sees exactly 2 rows.
--   (3) the no-capability member is refused 42501 sin_permisos_para_este_taller.
--   (4) the cross-node director is refused 42501 sin_permisos_para_este_taller.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-plantillas-del-taller.test.sql). auth_id
-- lookups for fixtures are resolved BEFORE the first role switch.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_tpp_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_tpp_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_tpp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_tpp_failures;
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

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b3000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ TPP Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('b3000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ TPP Equipo Hijo',   'b3000000-0000-4000-8000-000000000001', true),
  ('b3000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ TPP Equipo Otro',   'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b3000000-0000-4000-8000-000000000010', 'zz-tpp-fixture', 'ZZ TPP Fixture Taller', 'b3000000-0000-4000-8000-000000000001');

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('b3000000-0000-4000-8000-000000000011', 'b3000000-0000-4000-8000-000000000001', 'Líder',      true),
  ('b3000000-0000-4000-8000-000000000012', 'b3000000-0000-4000-8000-000000000001', 'Voluntario', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b3000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'tpp-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'tpp-fixture-lider@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'tpp-fixture-voluntario@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'tpp-fixture-sincapacidad@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'tpp-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4000-8000-000000000040', 'authenticated', 'authenticated', 'tpp-fixture-director-otro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b3000000-0000-4000-8000-000000000021', 'b3000000-0000-4000-8000-000000000020', 'B3', 'Director',      'tpp-fixture-director@example.test', 'Soltero', 'Otro'),
  ('b3000000-0000-4000-8000-000000000023', 'b3000000-0000-4000-8000-000000000022', 'B3', 'LiderActivo',   'tpp-fixture-lider@example.test', 'Soltero', 'Otro'),
  ('b3000000-0000-4000-8000-000000000025', 'b3000000-0000-4000-8000-000000000024', 'B3', 'VoluntarioHijo','tpp-fixture-voluntario@example.test', 'Soltero', 'Otro'),
  ('b3000000-0000-4000-8000-000000000029', 'b3000000-0000-4000-8000-000000000028', 'B3', 'SinCapacidad',  'tpp-fixture-sincapacidad@example.test', 'Soltero', 'Otro'),
  ('b3000000-0000-4000-8000-000000000031', 'b3000000-0000-4000-8000-000000000030', 'B3', 'Coordinador',   'tpp-fixture-coordinador@example.test', 'Soltero', 'Otro'),
  ('b3000000-0000-4000-8000-000000000041', 'b3000000-0000-4000-8000-000000000040', 'B3', 'DirectorOtro',  'tpp-fixture-director-otro@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Active servicios for the two facilitadores. Roles used ('Líder'/
-- 'Voluntario') are NOT in talleres_role_capability_map (only
-- 'director'/'coordinador' are), so these inserts mint zero capability
-- grants via sync_talleres_grants_on_servicio_change.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('b3000000-0000-4000-8000-000000000050', 'b3000000-0000-4000-8000-000000000023', 'b3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000011', 'activo'),
  ('b3000000-0000-4000-8000-000000000051', 'b3000000-0000-4000-8000-000000000025', 'b3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000012', 'activo');

-- director gets director.write AND director.read on the fixture taller's
-- own node (the production role-sync always grants both together for a
-- 'director'/'coordinador' role — verified in T5's commit e65ae6b finding
-- "the map of roles always grants read+write together" — this direct
-- capability_grants insert reproduces that pairing rather than the
-- sync trigger itself); coordinador gets both coordinator grants the same
-- way (capability-only path, proves neither RPC requires a servicio for a
-- capability holder); director-otro gets director.write only on an
-- UNRELATED sibling node (write-only is enough to prove the OTHER RPC,
-- talleres_plantilla_facilitadores_personas, also denies a wrong-node
-- caller regardless of which variant it holds). sin-capacidad gets
-- nothing.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b3000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write',     'talleres_crecimiento', 'taller', 'b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',      'talleres_crecimiento', 'taller', 'b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.write',  'talleres_crecimiento', 'taller', 'b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.read',   'talleres_crecimiento', 'taller', 'b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000041', 'talleres_crecimiento.director.write',     'talleres_crecimiento', 'taller', 'b3000000-0000-4000-8000-000000000003');

-- ── plantilla-level fixtures: taller_plantilla_grupos + facilitadores ──

INSERT INTO public.taller_plantilla_grupos (id, taller_id, nombre, capacidad) VALUES
  ('b3000000-0000-4000-8000-000000000060', 'b3000000-0000-4000-8000-000000000010', 'Grupo 1', 12);

INSERT INTO public.taller_plantilla_facilitadores (id, plantilla_grupo_id, persona_id, rol) VALUES
  ('b3000000-0000-4000-8000-000000000061', 'b3000000-0000-4000-8000-000000000060', 'b3000000-0000-4000-8000-000000000023', 'lider'),
  ('b3000000-0000-4000-8000-000000000062', 'b3000000-0000-4000-8000-000000000060', 'b3000000-0000-4000-8000-000000000025', 'voluntario');

-- ── cohorte-level fixtures: the minimal operating_core_events ->
-- taller_ediciones -> talleres_crecimiento_cohortes -> taller_grupos ->
-- taller_grupo_asignaciones chain, built directly as postgres (this
-- fixture's own authoring path is not what's under test; open_edicion
-- already has its own dedicated test file). Only the cohorte's own
-- dream_team_equipo_id (what talleres_equipo_de_cohorte reads) matters.

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b3000000-0000-4000-8000-000000000070', 'workshop', 'active', 'ZZ TPP Evento', '2026-01-01', 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot) VALUES
  ('b3000000-0000-4000-8000-000000000071', 'b3000000-0000-4000-8000-000000000070', 'b3000000-0000-4000-8000-000000000010', 'individual', 'permanente_custom', 'borrador', 'ZZ TPP Edicion', 1, 60, 'permanente_custom');

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion) VALUES
  ('b3000000-0000-4000-8000-000000000072', 'b3000000-0000-4000-8000-000000000071', 'b3000000-0000-4000-8000-000000000001', 'ZZ TPP Cohorte');

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('b3000000-0000-4000-8000-000000000073', 'b3000000-0000-4000-8000-000000000072', 'ZZ TPP Grupo', 'activo', 10);

-- Both persons are active servidores of the taller's own tree, so the
-- BEFORE INSERT trigger (T1, taller_grupo_asignaciones_exige_servidor_
-- activo) admits both even for postgres.
INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol) VALUES
  ('b3000000-0000-4000-8000-000000000080', 'b3000000-0000-4000-8000-000000000073', 'b3000000-0000-4000-8000-000000000023', 'lider'),
  ('b3000000-0000-4000-8000-000000000081', 'b3000000-0000-4000-8000-000000000073', 'b3000000-0000-4000-8000-000000000025', 'voluntario');

SET LOCAL ROLE authenticated;

-- ══ talleres_plantilla_facilitadores_personas ══

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_rows('(plantilla) director sees exactly 2 facilitadores',
  $$SELECT persona_id FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')$$, 2);
SELECT pg_temp.assert_rows('(plantilla) the own-node lider is there with his name',
  $$SELECT 1 FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')
     WHERE persona_id = 'b3000000-0000-4000-8000-000000000023'
       AND rol = 'lider' AND nombre = 'B3' AND apellido = 'LiderActivo'$$, 1);
SELECT pg_temp.assert_rows('(plantilla) the child-node voluntario is there with his name',
  $$SELECT 1 FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')
     WHERE persona_id = 'b3000000-0000-4000-8000-000000000025'
       AND rol = 'voluntario' AND nombre = 'B3' AND apellido = 'VoluntarioHijo'$$, 1);

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(plantilla) coordinador (capability-only) sees exactly 2 facilitadores',
  $$SELECT persona_id FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')$$, 2);

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000028');
SELECT pg_temp.assert_sqlstate_msg('(plantilla) no-capability member is refused',
  $$SELECT * FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')$$,
  '42501', 'sin_permisos_para_este_taller');

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000040');
SELECT pg_temp.assert_sqlstate_msg('(plantilla) cross-node director is refused',
  $$SELECT * FROM public.talleres_plantilla_facilitadores_personas('b3000000-0000-4000-8000-000000000010')$$,
  '42501', 'sin_permisos_para_este_taller');

-- ══ talleres_cohorte_equipo_personas (same shape) ══

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_rows('(cohorte) director sees exactly 2 facilitadores',
  $$SELECT persona_id FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')$$, 2);
SELECT pg_temp.assert_rows('(cohorte) the own-node lider is there, activo, with his name',
  $$SELECT 1 FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')
     WHERE persona_id = 'b3000000-0000-4000-8000-000000000023'
       AND rol = 'lider' AND activo = true AND nombre = 'B3' AND apellido = 'LiderActivo'$$, 1);
SELECT pg_temp.assert_rows('(cohorte) the child-node voluntario is there, activo, with his name',
  $$SELECT 1 FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')
     WHERE persona_id = 'b3000000-0000-4000-8000-000000000025'
       AND rol = 'voluntario' AND activo = true AND nombre = 'B3' AND apellido = 'VoluntarioHijo'$$, 1);

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(cohorte) coordinador (capability-only) sees exactly 2 facilitadores',
  $$SELECT persona_id FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')$$, 2);

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000028');
SELECT pg_temp.assert_sqlstate_msg('(cohorte) no-capability member is refused',
  $$SELECT * FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')$$,
  '42501', 'sin_permisos_para_este_taller');

SELECT pg_temp.as_persona('b3000000-0000-4000-8000-000000000040');
SELECT pg_temp.assert_sqlstate_msg('(cohorte) cross-node director is refused',
  $$SELECT * FROM public.talleres_cohorte_equipo_personas('b3000000-0000-4000-8000-000000000072')$$,
  '42501', 'sin_permisos_para_este_taller');

RESET ROLE;

-- ══ structural asserts — no anon in proacl, comment mirrors the source ══

SELECT pg_temp.assert_rows('structural: talleres_plantilla_facilitadores_personas has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_plantilla_facilitadores_personas'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_cohorte_equipo_personas has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_cohorte_equipo_personas'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: both new functions have a comment naming what they mirror',
  $$SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_description d ON d.objoid = p.oid
     WHERE n.nspname = 'public'
       AND p.proname IN ('talleres_plantilla_facilitadores_personas', 'talleres_cohorte_equipo_personas')
       AND d.description LIKE '%Mirrors%'$$, 2);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
