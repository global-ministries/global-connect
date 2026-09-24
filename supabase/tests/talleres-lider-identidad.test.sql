-- T1 (odd/tasks/talleres-lider-identidad.md) — RED→GREEN for the
-- relation-based read helper, the 5 SELECT policies it extends, the
-- inscripciones mirror, the new equipo-names RPC, and the removal of
-- the broken auto-grant trigger. Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under
-- this file's own a8000000-... namespace, matching the task document's
-- reserved dream_team-equipos namespace. 'e524ea89-d3a7-45fc-be00-
-- 5a6e7452434e' (Grupos de Corto Plazo) is referenced read-only as a
-- parent, the same real anchor other talleres fixture tests already use.
--
-- Identities:
--   líder      (a8...23) — activo=true on grupo A1, ZERO capabilities.
--   voluntario (a8...25) — activo=true on grupo A1, ZERO capabilities.
--   líder A2   (a8...27) — activo=true on grupo A2 of the SAME taller.
--   miembro    (a8...29) — no assignment, no capability, at all.
--   líder(!)   (a8...31) — assigned to A1 but activo=false.
--
-- Covers acceptance criteria 1-8 of the task document:
--   1. Líder A1 sees grupo A1, its sesión, its inscripciones (by
--      grupo_id), its asistencia and its reporte.
--   2. Voluntario A1 sees the same (read only).
--   3. Líder A2 sees NONE of grupo A1's rows.
--   4. Miembro sees NONE of grupo A1's rows.
--   5. The activo=false assignment on A1 gives no access.
--   6. talleres_grupo_equipo_personas / talleres_coord_inscripciones_
--      personas resolve names for A1 and zero rows for A2, for líder A1.
--   7. No write policy changed — líder A1 cannot UPDATE taller_sesiones
--      (0 rows affected, RLS silently filters, no exception).
--   8. The trigger and its function no longer exist; a plain INSERT into
--      taller_grupo_asignaciones as postgres (which crashes today with
--      42883) succeeds after the migration.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-inscripcion-a-grupo.test.sql). auth_id lookups
-- for fixtures are resolved BEFORE the first role switch.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_li_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON t_li_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_li_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Runs p_update_sql (a full UPDATE statement) and expects it to affect
-- exactly p_expected rows (RLS silently filters — this is not an error).
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_li_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ TLI Equipo', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('a8000000-0000-4000-8000-000000000010', 'zz-tli-fixture', 'ZZ TLI Fixture Taller', 'a8000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a8000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'tli-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'tli-fixture-lider-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'tli-fixture-voluntario-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'tli-fixture-lider-a2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'tli-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'tli-fixture-lider-inactivo@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'tli-fixture-inscrito-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'tli-fixture-inscrito-a2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- a8...33/35 (inscrito-A1/A2) are deliberately NOT any viewer identity
-- used below — their own-row visibility must never be the reason a
-- criterion passes; only grupo membership may explain what a viewer
-- sees of them. Two distinct personas because taller_inscripciones has
-- a unique (taller_id, cohorte_id, persona_principal_id) constraint and
-- both inscripciones share the same taller_id/cohorte_id here.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a8000000-0000-4000-8000-000000000021', 'a8000000-0000-4000-8000-000000000020', 'TLI', 'Director', 'tli-fixture-director@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000023', 'a8000000-0000-4000-8000-000000000022', 'TLI', 'LiderA1', 'tli-fixture-lider-a1@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000025', 'a8000000-0000-4000-8000-000000000024', 'TLI', 'VoluntarioA1', 'tli-fixture-voluntario-a1@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000027', 'a8000000-0000-4000-8000-000000000026', 'TLI', 'LiderA2', 'tli-fixture-lider-a2@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000029', 'a8000000-0000-4000-8000-000000000028', 'TLI', 'Miembro', 'tli-fixture-miembro@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000031', 'a8000000-0000-4000-8000-000000000030', 'TLI', 'LiderInactivo', 'tli-fixture-lider-inactivo@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000033', 'a8000000-0000-4000-8000-000000000032', 'TLI', 'InscritoA1', 'tli-fixture-inscrito-a1@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000035', 'a8000000-0000-4000-8000-000000000034', 'TLI', 'InscritoA2', 'tli-fixture-inscrito-a2@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Director gets a scoped grant ONLY so this fixture can call
-- open_edicion. Every other identity gets ZERO capability grants — the
-- whole point of this file is that the relation alone decides access.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a8000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t_li_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT ON t_li_fixture TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000020', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a8000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ TLI Fixture Edición', p_link_type => NULL,
    p_sesiones_estimadas => 2, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_li_fixture (key, id) VALUES
    ('edicion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

-- back to postgres for the rest of the fixture setup
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('a8000000-0000-4000-8000-000000000040', (SELECT id FROM t_li_fixture WHERE key = 'cohorte'), 'ZZ TLI Grupo A1', 'activo', 10),
  ('a8000000-0000-4000-8000-000000000041', (SELECT id FROM t_li_fixture WHERE key = 'cohorte'), 'ZZ TLI Grupo A2', 'activo', 10);

-- RED-run note: the trigger below is disabled for fixture setup only,
-- the same way T5's fixture did — but per criterion 8 the point of the
-- migration is that this ALTER is no longer necessary at all once the
-- trigger is dropped. Left conditional so the file runs unmodified both
-- before (trigger present, crashing) and after (trigger absent) the
-- migration.
DO $trg$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_talleres_grants_on_grupo_asignacion_change'
      AND tgrelid = 'public.taller_grupo_asignaciones'::regclass
  ) THEN
    ALTER TABLE public.taller_grupo_asignaciones DISABLE TRIGGER trg_sync_talleres_grants_on_grupo_asignacion_change;
  END IF;
END;
$trg$;

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('a8000000-0000-4000-8000-000000000050', 'a8000000-0000-4000-8000-000000000040', 'a8000000-0000-4000-8000-000000000023', 'lider', true),
  ('a8000000-0000-4000-8000-000000000051', 'a8000000-0000-4000-8000-000000000040', 'a8000000-0000-4000-8000-000000000025', 'voluntario', true),
  ('a8000000-0000-4000-8000-000000000052', 'a8000000-0000-4000-8000-000000000041', 'a8000000-0000-4000-8000-000000000027', 'lider', true),
  ('a8000000-0000-4000-8000-000000000053', 'a8000000-0000-4000-8000-000000000040', 'a8000000-0000-4000-8000-000000000031', 'lider', false);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('a8000000-0000-4000-8000-000000000060', 'a8000000-0000-4000-8000-000000000040', 1, current_date, 'programada'),
  ('a8000000-0000-4000-8000-000000000061', 'a8000000-0000-4000-8000-000000000041', 1, current_date, 'programada');

-- Inscripciones placed with grupo_id (paso-5 RPC, as CoordA the
-- director — director has no coordinator capability, so insert as
-- postgres directly; the migration under test does not touch write
-- authorization on taller_inscripciones).
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado, grupo_id) VALUES
  ('a8000000-0000-4000-8000-000000000070', (SELECT id FROM t_li_fixture WHERE key = 'edicion'), (SELECT id FROM t_li_fixture WHERE key = 'cohorte'), 'a8000000-0000-4000-8000-000000000033', 'aprobado', NULL, 'a8000000-0000-4000-8000-000000000040'),
  ('a8000000-0000-4000-8000-000000000071', (SELECT id FROM t_li_fixture WHERE key = 'edicion'), (SELECT id FROM t_li_fixture WHERE key = 'cohorte'), 'a8000000-0000-4000-8000-000000000035', 'aprobado', NULL, 'a8000000-0000-4000-8000-000000000041');

INSERT INTO public.taller_asistencias (id, sesion_id, inscripcion_id, persona_id, estado) VALUES
  ('a8000000-0000-4000-8000-000000000080', 'a8000000-0000-4000-8000-000000000060', 'a8000000-0000-4000-8000-000000000070', 'a8000000-0000-4000-8000-000000000033', 'presente'),
  ('a8000000-0000-4000-8000-000000000081', 'a8000000-0000-4000-8000-000000000061', 'a8000000-0000-4000-8000-000000000071', 'a8000000-0000-4000-8000-000000000035', 'presente');

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales) VALUES
  ('a8000000-0000-4000-8000-000000000090', 'a8000000-0000-4000-8000-000000000040', 'borrador', 'ZZ TLI fixture reporte A1'),
  ('a8000000-0000-4000-8000-000000000091', 'a8000000-0000-4000-8000-000000000041', 'borrador', 'ZZ TLI fixture reporte A2');

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ Criterion 1 — líder A1 (zero capabilities) sees grupo A1, its
-- sesión, its inscripciones by grupo_id, its asistencia, its reporte ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_rows('criterion 1: lider A1 sees taller_grupos A1',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: lider A1 sees taller_sesiones A1',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: lider A1 sees taller_inscripciones by grupo_id A1',
  $$SELECT 1 FROM taller_inscripciones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: lider A1 sees taller_asistencias for A1''s sesion',
  $$SELECT 1 FROM taller_asistencias WHERE sesion_id = 'a8000000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: lider A1 sees taller_reportes A1',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);

RESET ROLE;

-- ══ Criterion 2 — voluntario A1 (zero capabilities) sees the same ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000024');

SELECT pg_temp.assert_rows('criterion 2: voluntario A1 sees taller_grupos A1',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 2: voluntario A1 sees taller_sesiones A1',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 2: voluntario A1 sees taller_inscripciones by grupo_id A1',
  $$SELECT 1 FROM taller_inscripciones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('criterion 2: voluntario A1 sees taller_asistencias for A1''s sesion',
  $$SELECT 1 FROM taller_asistencias WHERE sesion_id = 'a8000000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.assert_rows('criterion 2: voluntario A1 sees taller_reportes A1',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 1);

RESET ROLE;

-- ══ Criterion 3 — líder of A2 (same taller) sees NONE of A1 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000026');

SELECT pg_temp.assert_rows('criterion 3: lider A2 does NOT see taller_grupos A1',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 3: lider A2 does NOT see taller_sesiones A1',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 3: lider A2 does NOT see taller_inscripciones A1',
  $$SELECT 1 FROM taller_inscripciones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 3: lider A2 does NOT see taller_asistencias A1''s sesion',
  $$SELECT 1 FROM taller_asistencias WHERE sesion_id = 'a8000000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.assert_rows('criterion 3: lider A2 does NOT see taller_reportes A1',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
-- but DOES see their own grupo A2:
SELECT pg_temp.assert_rows('criterion 3: lider A2 still sees taller_grupos A2 (their own)',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000041'$$, 1);

RESET ROLE;

-- ══ Criterion 4 — miembro with nothing sees NONE of A1 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000028');

SELECT pg_temp.assert_rows('criterion 4: miembro does NOT see taller_grupos A1',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 4: miembro does NOT see taller_sesiones A1',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 4: miembro does NOT see taller_inscripciones A1',
  $$SELECT 1 FROM taller_inscripciones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 4: miembro does NOT see taller_asistencias A1''s sesion',
  $$SELECT 1 FROM taller_asistencias WHERE sesion_id = 'a8000000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.assert_rows('criterion 4: miembro does NOT see taller_reportes A1',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);

RESET ROLE;

-- ══ Criterion 5 — activo=false assignment on A1 gives no access ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_rows('criterion 5: lider inactivo does NOT see taller_grupos A1',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 5: lider inactivo does NOT see taller_sesiones A1',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
SELECT pg_temp.assert_rows('criterion 5: lider inactivo does NOT see taller_reportes A1',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a8000000-0000-4000-8000-000000000040'$$, 0);
-- own (inactive) assignment row is still visible via the table's own
-- own-row branch, that is unrelated to this helper:
SELECT pg_temp.assert_rows('criterion 5: lider inactivo still sees own (inactive) asignacion row',
  $$SELECT 1 FROM taller_grupo_asignaciones WHERE id = 'a8000000-0000-4000-8000-000000000053'$$, 1);

RESET ROLE;

-- ══ Criterion 6 — lider A1 resolves names via both RPCs for A1, zero
-- rows for A2 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000022');

-- 3, not 2: lider (023) + voluntario (025) + lider inactivo (031) — a
-- member's own-membership grant sees the WHOLE team row set for that
-- grupo, active or not; criterion 5 is what proves activo=false denies
-- the inactive member their OWN access, a different question.
SELECT pg_temp.assert_rows('criterion 6: talleres_grupo_equipo_personas resolves A1''s equipo (3 rows: lider + voluntario + lider inactivo)',
  $$SELECT 1 FROM public.talleres_grupo_equipo_personas('a8000000-0000-4000-8000-000000000040') WHERE nombre IS NOT NULL$$, 3);
SELECT pg_temp.assert_rows('criterion 6: talleres_grupo_equipo_personas gives ZERO rows for A2',
  $$SELECT 1 FROM public.talleres_grupo_equipo_personas('a8000000-0000-4000-8000-000000000041')$$, 0);
SELECT pg_temp.assert_rows('criterion 6: talleres_coord_inscripciones_personas resolves A1''s inscrito name',
  $$SELECT 1 FROM public.talleres_coord_inscripciones_personas(ARRAY['a8000000-0000-4000-8000-000000000070']::uuid[]) WHERE pp_nombre = 'TLI'$$, 1);
SELECT pg_temp.assert_rows('criterion 6: talleres_coord_inscripciones_personas gives ZERO rows for A2''s inscripcion',
  $$SELECT 1 FROM public.talleres_coord_inscripciones_personas(ARRAY['a8000000-0000-4000-8000-000000000071']::uuid[])$$, 0);

RESET ROLE;

-- ══ Criterion 7 — no write policy changed: lider A1 cannot UPDATE
-- taller_sesiones (0 rows affected by RLS, not an error) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a8000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_update_rows('criterion 7: lider A1 UPDATE on taller_sesiones affects 0 rows (RLS)',
  $$UPDATE public.taller_sesiones SET estado = 'realizada' WHERE id = 'a8000000-0000-4000-8000-000000000060'$$, 0);

RESET ROLE;

SELECT pg_temp.assert_rows('criterion 7: taller_sesiones A1 estado unchanged after the denied UPDATE',
  $$SELECT 1 FROM taller_sesiones WHERE id = 'a8000000-0000-4000-8000-000000000060' AND estado = 'programada'$$, 1);

-- ══ Criterion 8 — the trigger/function no longer exist; a plain
-- INSERT into taller_grupo_asignaciones as postgres succeeds ══

SELECT pg_temp.assert_rows('criterion 8: trigger no longer exists on taller_grupo_asignaciones',
  $$SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_talleres_grants_on_grupo_asignacion_change'$$, 0);
SELECT pg_temp.assert_rows('criterion 8: function no longer exists',
  $$SELECT 1 FROM pg_proc WHERE proname = 'sync_talleres_grants_on_grupo_asignacion_change'$$, 0);

SELECT pg_temp.assert_no_error('criterion 8: INSERT into taller_grupo_asignaciones as postgres succeeds (was 42883)',
  $$INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
      ('a8000000-0000-4000-8000-000000000099', 'a8000000-0000-4000-8000-000000000040', 'a8000000-0000-4000-8000-000000000029', 'voluntario', true)$$);

SELECT pg_temp.report();

ROLLBACK;
