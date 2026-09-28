-- T1 (odd/tasks/talleres-configuracion-del-taller.md) — RED→GREEN for
-- the template base: taller_plantilla_clases, taller_plantilla_grupos,
-- taller_plantilla_facilitadores, talleres.cadencia_dias/
-- duracion_minutos, the helper talleres_es_servidor_activo_del_taller,
-- the RPC talleres_servidores_del_taller, and the two BEFORE triggers
-- (taller_plantilla_facilitadores, taller_grupo_asignaciones) that
-- reject a persona who is not an active servidor of the taller's tree.
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept;
-- every fixture id lives under this file's own ae000000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, the same real anchor other
-- talleres fixture tests already use.
--
-- Identities:
--   director        (ae…21) — director.write scoped to the fixture
--                              taller's own node. Used to insert the
--                              plantilla and to open the edición.
--   coordinador      (ae…31) — coordinator.write scoped to the same
--                              node (capability-only path).
--   líder activo     (ae…23) — dream_team_servicios estado='activo' on
--                              the taller's OWN node, rol Líder.
--   voluntario activo(ae…25) — dream_team_servicios estado='activo' on
--                              a CHILD node of the taller — proves the
--                              descendant walk, not just the exact node.
--   en pausa         (ae…27) — dream_team_servicios estado='en_pausa'
--                              on the taller's own node.
--   sin servicio     (ae…29) — no dream_team_servicios row, no
--                              capability grant, at all.
--
-- Covers this task's acceptance criteria 1, 3, 6, 8 (2, 4, 5, 7, 9 are
-- T2/T3/T7's — instantiation, the edited-in-place UI, and the Grupos de
-- Vida fingerprint are out of a SQL script's reach here) plus this
-- file's own (a)-(f):
--   (a) director inserts 4 plantilla clases with temas; a 5th with a
--       duplicate numero fails 23505 (unique_violation).
--   (b) director creates a plantilla grupo, adds the active líder and
--       the child-node voluntario as facilitadores (OK); adding the
--       paused persona or the no-servicio persona both fail P0001
--       NO_ES_SERVIDOR_ACTIVO_DEL_TALLER.
--   (c) talleres_servidores_del_taller as the coordinator (capability-
--       only) returns exactly the 2 active servidores, names present,
--       and never the paused one; as the no-servicio member it fails
--       42501 sin_permisos_para_este_taller.
--   (d) a direct INSERT into taller_grupo_asignaciones for an edición's
--       grupo with the paused persona fails P0001
--       NO_ES_SERVIDOR_ACTIVO_DEL_TALLER even as postgres (triggers are
--       not BYPASSRLS-exempt); with the active líder it succeeds.
--   (e) the no-capability member cannot write the plantilla: INSERT is
--       rejected 42501 (WITH CHECK), and a same-shape UPDATE affects 0
--       rows (USING silently filters).
--   (f) talleres.cadencia_dias defaults to 7 for a freshly inserted
--       taller and rejects an UPDATE to 0 (23514 check_violation).
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-asistencia-lider.test.sql). auth_id lookups
-- for fixtures are resolved BEFORE the first role switch. Scenario (d)'s
-- postgres-identity inserts are deliberate: they prove the trigger, not
-- RLS, is what blocks the paused persona.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ptt_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ptt_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ptt_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Runs p_update_sql (a full UPDATE/INSERT statement) and expects it to
-- affect exactly p_expected rows (RLS silently filters — not an error).
CREATE OR REPLACE FUNCTION pg_temp.assert_update_rows(p_case text, p_update_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE p_update_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s) affected, got ' || v_n);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ptt_failures;
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
  ('ae000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ PTT Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('ae000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ PTT Equipo Hijo',   'ae000000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('ae000000-0000-4000-8000-000000000010', 'zz-ptt-fixture', 'ZZ PTT Fixture Taller', 'ae000000-0000-4000-8000-000000000001');

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('ae000000-0000-4000-8000-000000000011', 'ae000000-0000-4000-8000-000000000001', 'Líder',      true),
  ('ae000000-0000-4000-8000-000000000012', 'ae000000-0000-4000-8000-000000000001', 'Voluntario', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ae000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'ptt-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ae000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'ptt-fixture-lider@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ae000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'ptt-fixture-voluntario@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ae000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'ptt-fixture-pausa@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ae000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'ptt-fixture-sinservicio@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ae000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'ptt-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('ae000000-0000-4000-8000-000000000021', 'ae000000-0000-4000-8000-000000000020', 'PTT', 'Director',     'ptt-fixture-director@example.test', 'Soltero', 'Otro'),
  ('ae000000-0000-4000-8000-000000000023', 'ae000000-0000-4000-8000-000000000022', 'PTT', 'LiderActivo',  'ptt-fixture-lider@example.test', 'Soltero', 'Otro'),
  ('ae000000-0000-4000-8000-000000000025', 'ae000000-0000-4000-8000-000000000024', 'PTT', 'VoluntarioHijo', 'ptt-fixture-voluntario@example.test', 'Soltero', 'Otro'),
  ('ae000000-0000-4000-8000-000000000027', 'ae000000-0000-4000-8000-000000000026', 'PTT', 'EnPausa',      'ptt-fixture-pausa@example.test', 'Soltero', 'Otro'),
  ('ae000000-0000-4000-8000-000000000029', 'ae000000-0000-4000-8000-000000000028', 'PTT', 'SinServicio',  'ptt-fixture-sinservicio@example.test', 'Soltero', 'Otro'),
  ('ae000000-0000-4000-8000-000000000031', 'ae000000-0000-4000-8000-000000000030', 'PTT', 'Coordinador',  'ptt-fixture-coordinador@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Active/paused servicios. Roles used ('Líder'/'Voluntario') are NOT in
-- talleres_role_capability_map (only 'director'/'coordinador' are), so
-- these inserts mint zero capability grants via
-- sync_talleres_grants_on_servicio_change — verified read-only against
-- 20260810120000_talleres_role_auto_grant.sql before relying on it.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('ae000000-0000-4000-8000-000000000050', 'ae000000-0000-4000-8000-000000000023', 'ae000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000011', 'activo'),
  ('ae000000-0000-4000-8000-000000000051', 'ae000000-0000-4000-8000-000000000025', 'ae000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000012', 'activo'),
  ('ae000000-0000-4000-8000-000000000052', 'ae000000-0000-4000-8000-000000000027', 'ae000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000011', 'en_pausa');

-- director gets director.write ONLY so the fixture can insert plantilla
-- rows and call open_edicion; coordinador gets coordinator.write ONLY
-- (capability-only path for talleres_servidores_del_taller). Every
-- other identity gets ZERO capability grants.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('ae000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write',    'talleres_crecimiento', 'taller', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'ae000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t_ptt_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ptt_fixture TO authenticated;

-- ══ criterion (f), part 1 — cadencia_dias defaults to 7 ══

SELECT pg_temp.assert_rows('(f) talleres.cadencia_dias defaults to 7',
  $$SELECT 1 FROM public.talleres
     WHERE id = 'ae000000-0000-4000-8000-000000000010' AND cadencia_dias = 7$$, 1);

-- ══ (a) director inserts 4 named clases; duplicate numero fails ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ae000000-0000-4000-8000-000000000020');

SELECT pg_temp.assert_no_error('(a) director inserts clase 1',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 1, 'Sigueme')$$);
SELECT pg_temp.assert_no_error('(a) director inserts clase 2',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 2, 'Intimidad con Dios')$$);
SELECT pg_temp.assert_no_error('(a) director inserts clase 3',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 3, 'Companerismo')$$);
SELECT pg_temp.assert_no_error('(a) director inserts clase 4',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 4, 'Influencia')$$);
SELECT pg_temp.assert_rows('(a) exactly 4 plantilla clases exist',
  $$SELECT id FROM public.taller_plantilla_clases
     WHERE taller_id = 'ae000000-0000-4000-8000-000000000010'$$, 4);
SELECT pg_temp.assert_sqlstate('(a) duplicate numero fails unique_violation',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 1, 'Duplicada')$$,
  '23505');

-- ══ (b) director creates a plantilla grupo; facilitadores gated by
-- servidor-activo ══

DO $grp$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, capacidad)
  VALUES ('ae000000-0000-4000-8000-000000000010', 'Grupo A', 12)
  RETURNING id INTO v_id;
  INSERT INTO t_ptt_fixture (key, id) VALUES ('plantilla_grupo', v_id);
END;
$grp$;

SELECT pg_temp.assert_no_error('(b) add the active lider as facilitador',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo'),
      'ae000000-0000-4000-8000-000000000023', 'lider')$$);
SELECT pg_temp.assert_no_error('(b) add the child-node active voluntario as facilitador',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo'),
      'ae000000-0000-4000-8000-000000000025', 'voluntario')$$);
SELECT pg_temp.assert_rows('(b) exactly 2 facilitadores so far',
  $$SELECT id FROM public.taller_plantilla_facilitadores
     WHERE plantilla_grupo_id = (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo')$$, 2);

SELECT pg_temp.assert_sqlstate_msg('(b) adding the paused persona fails',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo'),
      'ae000000-0000-4000-8000-000000000027', 'voluntario')$$,
  'P0001', 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER');
SELECT pg_temp.assert_sqlstate_msg('(b) adding the no-servicio persona fails',
  $$INSERT INTO public.taller_plantilla_facilitadores (plantilla_grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo'),
      'ae000000-0000-4000-8000-000000000029', 'voluntario')$$,
  'P0001', 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER');
SELECT pg_temp.assert_rows('(b) rejected inserts left facilitadores at 2',
  $$SELECT id FROM public.taller_plantilla_facilitadores
     WHERE plantilla_grupo_id = (SELECT id FROM t_ptt_fixture WHERE key = 'plantilla_grupo')$$, 2);

-- ══ (c) talleres_servidores_del_taller: capability path (coordinador)
-- returns exactly the 2 active ones; no-servicio member is 42501 ══

SELECT pg_temp.as_persona('ae000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_rows('(c) coordinador sees exactly 2 active servidores',
  $$SELECT persona_id FROM public.talleres_servidores_del_taller('ae000000-0000-4000-8000-000000000010')$$, 2);
SELECT pg_temp.assert_rows('(c) the active lider is in the list with his name',
  $$SELECT 1 FROM public.talleres_servidores_del_taller('ae000000-0000-4000-8000-000000000010')
     WHERE persona_id = 'ae000000-0000-4000-8000-000000000023'
       AND nombre = 'PTT' AND apellido = 'LiderActivo' AND rol_servicio = 'Líder'$$, 1);
SELECT pg_temp.assert_rows('(c) the child-node voluntario is in the list with his name',
  $$SELECT 1 FROM public.talleres_servidores_del_taller('ae000000-0000-4000-8000-000000000010')
     WHERE persona_id = 'ae000000-0000-4000-8000-000000000025'
       AND nombre = 'PTT' AND apellido = 'VoluntarioHijo' AND rol_servicio = 'Voluntario'$$, 1);
SELECT pg_temp.assert_rows('(c) the paused persona is NOT in the list',
  $$SELECT 1 FROM public.talleres_servidores_del_taller('ae000000-0000-4000-8000-000000000010')
     WHERE persona_id = 'ae000000-0000-4000-8000-000000000027'$$, 0);

SELECT pg_temp.as_persona('ae000000-0000-4000-8000-000000000028');
SELECT pg_temp.assert_sqlstate_msg('(c) no-servicio member is refused',
  $$SELECT * FROM public.talleres_servidores_del_taller('ae000000-0000-4000-8000-000000000010')$$,
  '42501', 'sin_permisos_para_este_taller');

-- ══ (e) the no-capability member cannot write the plantilla ══

SELECT pg_temp.assert_sqlstate('(e) no-capability INSERT into taller_plantilla_clases is rejected',
  $$INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
      ('ae000000-0000-4000-8000-000000000010', 99, 'Intrusa')$$,
  '42501');
SELECT pg_temp.assert_update_rows('(e) no-capability UPDATE on an existing clase affects 0 rows',
  $$UPDATE public.taller_plantilla_clases SET tema = 'Hackeada'
     WHERE taller_id = 'ae000000-0000-4000-8000-000000000010' AND numero = 1$$, 0);

RESET ROLE;
SELECT pg_temp.assert_rows('(e) clase 1 tema is untouched',
  $$SELECT 1 FROM public.taller_plantilla_clases
     WHERE taller_id = 'ae000000-0000-4000-8000-000000000010' AND numero = 1 AND tema = 'Sigueme'$$, 1);

-- ══ (d) taller_grupo_asignaciones: the trigger blocks the paused
-- persona even for postgres (not an RLS-bypass question) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ae000000-0000-4000-8000-000000000020');

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'ae000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ PTT Fixture Edicion', p_link_type => NULL,
    p_sesiones_estimadas => 3, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_ptt_fixture (key, id) VALUES
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

RESET ROLE;

DO $grupo$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad)
  VALUES (gen_random_uuid(), (SELECT id FROM t_ptt_fixture WHERE key = 'cohorte'), 'ZZ PTT Grupo Edicion', 'activo', 10)
  RETURNING id INTO v_id;
  INSERT INTO t_ptt_fixture (key, id) VALUES ('grupo_edicion', v_id);
END;
$grupo$;

-- as postgres: the trigger, not RLS, is what must block this.
SELECT pg_temp.assert_sqlstate_msg('(d) postgres INSERT with the paused persona is blocked by the trigger',
  $$INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'grupo_edicion'),
      'ae000000-0000-4000-8000-000000000027', 'voluntario')$$,
  'P0001', 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER');
SELECT pg_temp.assert_rows('(d) the blocked insert left no row',
  $$SELECT 1 FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_ptt_fixture WHERE key = 'grupo_edicion')
       AND persona_id = 'ae000000-0000-4000-8000-000000000027'$$, 0);

SELECT pg_temp.assert_no_error('(d) postgres INSERT with the active lider succeeds',
  $$INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol) VALUES (
      (SELECT id FROM t_ptt_fixture WHERE key = 'grupo_edicion'),
      'ae000000-0000-4000-8000-000000000023', 'lider')$$);
SELECT pg_temp.assert_rows('(d) the accepted insert is there',
  $$SELECT 1 FROM public.taller_grupo_asignaciones
     WHERE grupo_id = (SELECT id FROM t_ptt_fixture WHERE key = 'grupo_edicion')
       AND persona_id = 'ae000000-0000-4000-8000-000000000023' AND rol = 'lider'$$, 1);

-- ══ (f), part 2 — cadencia_dias rejects 0 ══

SELECT pg_temp.assert_sqlstate('(f) cadencia_dias rejects 0 (check_violation)',
  $$UPDATE public.talleres SET cadencia_dias = 0
     WHERE id = 'ae000000-0000-4000-8000-000000000010'$$,
  '23514');

-- ══ structural asserts — RLS enabled, no anon in proacl, triggers exist

SELECT pg_temp.assert_rows('structural: RLS enabled on the 3 new tables',
  $$SELECT relname FROM pg_class
     WHERE relname IN ('taller_plantilla_clases', 'taller_plantilla_grupos', 'taller_plantilla_facilitadores')
       AND relrowsecurity = true$$, 3);
SELECT pg_temp.assert_rows('structural: talleres_es_servidor_activo_del_taller has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_es_servidor_activo_del_taller'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_servidores_del_taller has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_servidores_del_taller'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: both enforcement triggers exist',
  $$SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_taller_plantilla_facilitadores_servidor_activo', 'trg_taller_grupo_asignaciones_servidor_activo')
       AND NOT tgisinternal$$, 2);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
