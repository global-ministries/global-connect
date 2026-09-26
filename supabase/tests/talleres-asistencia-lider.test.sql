-- T1 (odd/tasks/talleres-asistencia-lider.md) — RED→GREEN for the
-- leader-attendance base: taller_sesiones.tema, taller_asistencias.motivo
-- (+ CHECK), helper talleres_rol_en_grupo, talleres_registrar_asistencia,
-- talleres_cerrar_clase, talleres_enviar_reporte, the relation write
-- branches on taller_sesiones_update / taller_reportes_{insert,update},
-- and the approved DROP of the append-only trigger that blocks the
-- upsert correction path. Run against STAGING inside BEGIN…ROLLBACK —
-- nothing here is kept; every fixture id lives under this file's own
-- ad000000-... namespace. 'e524ea89-d3a7-45fc-be00-5a6e7452434e'
-- (Grupos de Corto Plazo) is referenced read-only as a parent equipo,
-- the same real anchor other talleres fixture tests already use.
--
-- Identities:
--   director     (ad…21) — scoped director.write/read on the fixture
--                           equipo, ONLY so the fixture can call
--                           open_edicion. Never used for assertions.
--   líder A1     (ad…23) — activo=true on grupo A1, ZERO capabilities.
--   voluntario   (ad…25) — activo=true on grupo A1, ZERO capabilities.
--   líder A2     (ad…27) — activo=true on grupo A2 of the SAME taller.
--   miembro      (ad…29) — no assignment, no capability, at all.
--   coordinador  (ad…31) — NO assignment; scoped coordinator.read/write
--                           on the fixture equipo (capability-only path).
--   Inscritos: ad…33 + ad…35 (A1, aprobado), ad…37 (A2, aprobado),
--               ad…39 (A1, pendiente — for criterion 5).
--
-- Covers acceptance criteria 1-9 (criterion 10 — the Grupos de Vida md5
-- fingerprint — is not reachable from a SQL script and stays with the
-- parent review):
--   1. líder A1 sends ONE batch: rows get estado/motivo right, the
--      sesión goes en_curso with fecha_realizada = today, return is
--      {presentes, ausentes, total}.
--   2. resending corrects the marks (upsert): no duplicate rows,
--      estado/motivo change, motivo cleared when back to presente.
--   3. voluntario passes list; cannot close the class nor send the
--      report (42501 with his OWN message each).
--   4. líder A2 cannot write anything on A1: registrar → 42501
--      sin_permisos_para_este_grupo; direct UPDATE on taller_sesiones /
--      taller_reportes touches 0 rows.
--   5. mark on the pendiente inscripción → P0001 INSCRIPCION_NO_APROBADA;
--      mark on A2's inscripción → P0001 INSCRIPCION_NO_EN_GRUPO; after
--      the class is closed → P0001 CLASE_CERRADA.
--   6. líder closes the class; reading shows presentes/ausentes with
--      motivo.
--   7. with A1#2 still open → talleres_enviar_reporte fails P0001
--      CLASES_ABIERTAS; after closing everything the líder sends it and
--      the reporte is enviado, firma_lider_persona_id = him, fecha set,
--      observaciones updated.
--   8. the scoped coordinator does registrar + close + send on grupo A2
--      purely by capability (firma = the coordinator); líder A1 cannot
--      write on A2 (42501).
--   9. direct UPDATE on taller_asistencias is filtered to 0 rows for
--      every identity — the policy stays false/false — and the
--      structural asserts confirm the policy text plus the DROP of the
--      append-only trigger/function (the approved DROP; postgres itself
--      has BYPASSRLS and is not an app identity).
-- Final mutation: líder A1 directly UPDATEs taller_sesiones.tema on
-- their own sesión — 1 row affected proves the new relation branch.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-lider-identidad.test.sql). auth_id lookups
-- for fixtures are resolved BEFORE the first role switch.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_al_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_al_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_al_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_al_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ TAL Equipo', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('ad000000-0000-4000-8000-000000000010', 'zz-tal-fixture', 'ZZ TAL Fixture Taller', 'ad000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ad000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'tal-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'tal-fixture-lider-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'tal-fixture-voluntario-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'tal-fixture-lider-a2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'tal-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'tal-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'tal-fixture-inscrito-a1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'tal-fixture-inscrito-a1b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000036', 'authenticated', 'authenticated', 'tal-fixture-inscrito-a2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ad000000-0000-4000-8000-000000000038', 'authenticated', 'authenticated', 'tal-fixture-inscrito-pendiente@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- The 4 inscritos (ad…33/35/37/39) are deliberately NOT any viewer
-- identity used below — their own-row visibility must never be the
-- reason a criterion passes; only grupo membership (or capability) may
-- explain what a viewer sees of them. Distinct personas because
-- taller_inscripciones has a unique (taller_id, cohorte_id,
-- persona_principal_id) constraint.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('ad000000-0000-4000-8000-000000000021', 'ad000000-0000-4000-8000-000000000020', 'TAL', 'Director', 'tal-fixture-director@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000023', 'ad000000-0000-4000-8000-000000000022', 'TAL', 'LiderA1', 'tal-fixture-lider-a1@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000025', 'ad000000-0000-4000-8000-000000000024', 'TAL', 'VoluntarioA1', 'tal-fixture-voluntario-a1@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000027', 'ad000000-0000-4000-8000-000000000026', 'TAL', 'LiderA2', 'tal-fixture-lider-a2@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000029', 'ad000000-0000-4000-8000-000000000028', 'TAL', 'Miembro', 'tal-fixture-miembro@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000031', 'ad000000-0000-4000-8000-000000000030', 'TAL', 'Coordinador', 'tal-fixture-coordinador@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000033', 'ad000000-0000-4000-8000-000000000032', 'TAL', 'InscritoA1', 'tal-fixture-inscrito-a1@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000035', 'ad000000-0000-4000-8000-000000000034', 'TAL', 'InscritoA1b', 'tal-fixture-inscrito-a1b@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000037', 'ad000000-0000-4000-8000-000000000036', 'TAL', 'InscritoA2', 'tal-fixture-inscrito-a2@example.test', 'Soltero', 'Otro'),
  ('ad000000-0000-4000-8000-000000000039', 'ad000000-0000-4000-8000-000000000038', 'TAL', 'InscritoPendiente', 'tal-fixture-inscrito-pendiente@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Director gets a scoped grant ONLY so this fixture can call
-- open_edicion; the coordinador gets scoped coordinator.read/write so
-- criterion 8 can prove the capability-only path. Every other identity
-- gets ZERO capability grants.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('ad000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.read',  'talleres_crecimiento', 'taller', 'ad000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t_al_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT ON t_al_fixture TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000020', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'ad000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ TAL Fixture Edición', p_link_type => NULL,
    p_sesiones_estimadas => 3, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_al_fixture (key, id) VALUES
    ('edicion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

-- back to postgres for the rest of the fixture setup
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('ad000000-0000-4000-8000-000000000040', (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ZZ TAL Grupo A1', 'activo', 10),
  ('ad000000-0000-4000-8000-000000000041', (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ZZ TAL Grupo A2', 'activo', 10);

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('ad000000-0000-4000-8000-000000000050', 'ad000000-0000-4000-8000-000000000040', 'ad000000-0000-4000-8000-000000000023', 'lider', true),
  ('ad000000-0000-4000-8000-000000000051', 'ad000000-0000-4000-8000-000000000040', 'ad000000-0000-4000-8000-000000000025', 'voluntario', true),
  ('ad000000-0000-4000-8000-000000000052', 'ad000000-0000-4000-8000-000000000041', 'ad000000-0000-4000-8000-000000000027', 'lider', true);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('ad000000-0000-4000-8000-000000000060', 'ad000000-0000-4000-8000-000000000040', 1, current_date, 'programada'),
  ('ad000000-0000-4000-8000-000000000061', 'ad000000-0000-4000-8000-000000000040', 2, current_date, 'programada'),
  ('ad000000-0000-4000-8000-000000000062', 'ad000000-0000-4000-8000-000000000041', 1, current_date, 'programada');

-- taller_inscripciones.taller_id references taller_ediciones(id) — the
-- same convention supabase/tests/talleres-lider-identidad.test.sql uses.
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado, grupo_id) VALUES
  ('ad000000-0000-4000-8000-000000000070', (SELECT id FROM t_al_fixture WHERE key = 'edicion'), (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ad000000-0000-4000-8000-000000000033', 'aprobado', NULL, 'ad000000-0000-4000-8000-000000000040'),
  ('ad000000-0000-4000-8000-000000000071', (SELECT id FROM t_al_fixture WHERE key = 'edicion'), (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ad000000-0000-4000-8000-000000000035', 'aprobado', NULL, 'ad000000-0000-4000-8000-000000000040'),
  ('ad000000-0000-4000-8000-000000000072', (SELECT id FROM t_al_fixture WHERE key = 'edicion'), (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ad000000-0000-4000-8000-000000000037', 'aprobado', NULL, 'ad000000-0000-4000-8000-000000000041'),
  ('ad000000-0000-4000-8000-000000000073', (SELECT id FROM t_al_fixture WHERE key = 'edicion'), (SELECT id FROM t_al_fixture WHERE key = 'cohorte'), 'ad000000-0000-4000-8000-000000000039', 'pendiente', NULL, 'ad000000-0000-4000-8000-000000000040');

-- No asistencias in the fixture: criterion 1 creates them through the
-- function under test.

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales) VALUES
  ('ad000000-0000-4000-8000-000000000090', 'ad000000-0000-4000-8000-000000000040', 'borrador', 'ZZ TAL fixture reporte A1'),
  ('ad000000-0000-4000-8000-000000000091', 'ad000000-0000-4000-8000-000000000041', 'borrador', 'ZZ TAL fixture reporte A2');

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ Criterion 0 — the relation helper returns the right rol ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_rows('criterion 0: talleres_rol_en_grupo = lider for líder A1',
  $$SELECT 1 WHERE public.talleres_rol_en_grupo('ad000000-0000-4000-8000-000000000040') = 'lider'$$, 1);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000024');
SELECT pg_temp.assert_rows('criterion 0: talleres_rol_en_grupo = voluntario for voluntario A1',
  $$SELECT 1 WHERE public.talleres_rol_en_grupo('ad000000-0000-4000-8000-000000000040') = 'voluntario'$$, 1);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000026');
SELECT pg_temp.assert_rows('criterion 0: talleres_rol_en_grupo = NULL for líder A2 on A1',
  $$SELECT 1 WHERE public.talleres_rol_en_grupo('ad000000-0000-4000-8000-000000000040') IS NULL$$, 1);
SELECT pg_temp.assert_rows('criterion 0: talleres_rol_en_grupo = lider for líder A2 on their own A2',
  $$SELECT 1 WHERE public.talleres_rol_en_grupo('ad000000-0000-4000-8000-000000000041') = 'lider'$$, 1);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000028');
SELECT pg_temp.assert_rows('criterion 0: talleres_rol_en_grupo = NULL for the unassigned miembro',
  $$SELECT 1 WHERE public.talleres_rol_en_grupo('ad000000-0000-4000-8000-000000000040') IS NULL$$, 1);

-- ══ Criterion 1 — líder A1 (zero capabilities) passes list in ONE
-- send: rows get estado/motivo, sesión goes en_curso with today ══

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_rows('criterion 1: one send returns presentes/ausentes/total',
  $$WITH r AS (
      SELECT public.talleres_registrar_asistencia(
        'ad000000-0000-4000-8000-000000000060',
        '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000070","estado":"presente"},
          {"inscripcion_id":"ad000000-0000-4000-8000-000000000071","estado":"ausente","motivo":"viaje de trabajo"}]'::jsonb
      ) AS j)
    SELECT 1 FROM r
     WHERE (r.j->>'presentes')::int = 1
       AND (r.j->>'ausentes')::int = 1
       AND (r.j->>'total')::int = 2$$, 1);
SELECT pg_temp.assert_rows('criterion 1: 0070 is presente with motivo NULL',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'
       AND estado = 'presente' AND motivo IS NULL$$, 1);
SELECT pg_temp.assert_rows('criterion 1: 0071 is ausente with its motivo',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000071'
       AND estado = 'ausente' AND motivo = 'viaje de trabajo'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: sesión en_curso with fecha_realizada = today',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000060'
       AND estado = 'en_curso' AND fecha_realizada = current_date$$, 1);
SELECT pg_temp.assert_rows('criterion 1: exactly 2 asistencia rows (no extras)',
  $$SELECT id FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'$$, 2);

-- ══ Criterion 2 — resend corrects the marks (upsert), no duplicates ══

SELECT pg_temp.assert_rows('criterion 2: resend corrects in place and returns the new counts',
  $$WITH r AS (
      SELECT public.talleres_registrar_asistencia(
        'ad000000-0000-4000-8000-000000000060',
        '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000070","estado":"ausente","motivo":"llego tarde"},
          {"inscripcion_id":"ad000000-0000-4000-8000-000000000071","estado":"presente"}]'::jsonb
      ) AS j)
    SELECT 1 FROM r
     WHERE (r.j->>'presentes')::int = 1
       AND (r.j->>'ausentes')::int = 1
       AND (r.j->>'total')::int = 2$$, 1);
SELECT pg_temp.assert_rows('criterion 2: still exactly 2 rows (upsert, not duplicated)',
  $$SELECT id FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'$$, 2);
SELECT pg_temp.assert_rows('criterion 2: 0070 flipped to ausente with the new motivo',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'
       AND estado = 'ausente' AND motivo = 'llego tarde'$$, 1);
SELECT pg_temp.assert_rows('criterion 2: 0071 flipped back to presente, motivo cleared',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000071'
       AND estado = 'presente' AND motivo IS NULL$$, 1);

-- ══ Criterion 3 — voluntario passes list; cannot close nor send
-- (42501 with his OWN message each) ══

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000024');

SELECT pg_temp.assert_rows('criterion 3: voluntario passes list',
  $$WITH r AS (
      SELECT public.talleres_registrar_asistencia(
        'ad000000-0000-4000-8000-000000000060',
        '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000070","estado":"presente"},
          {"inscripcion_id":"ad000000-0000-4000-8000-000000000071","estado":"ausente","motivo":"enfermedad"}]'::jsonb
      ) AS j)
    SELECT 1 FROM r
     WHERE (r.j->>'presentes')::int = 1
       AND (r.j->>'ausentes')::int = 1
       AND (r.j->>'total')::int = 2$$, 1);
SELECT pg_temp.assert_rows('criterion 3: voluntario can read what he marked',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000071'
       AND estado = 'ausente' AND motivo = 'enfermedad'$$, 1);

SELECT pg_temp.assert_sqlstate_msg('criterion 3: voluntario cannot cerrar clase (own message)',
  $$SELECT public.talleres_cerrar_clase('ad000000-0000-4000-8000-000000000060')$$,
  '42501', 'solo_el_lider_puede_cerrar_la_clase');
SELECT pg_temp.assert_sqlstate_msg('criterion 3: voluntario cannot enviar reporte (own message)',
  $$SELECT public.talleres_enviar_reporte('ad000000-0000-4000-8000-000000000040')$$,
  '42501', 'solo_el_lider_puede_enviar_el_reporte');
SELECT pg_temp.assert_rows('criterion 3: the failed close did not change the sesión',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000060' AND estado = 'en_curso'$$, 1);

-- ══ Criterion 4 — líder A2 (same taller) cannot write anything on A1 ══

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000026');

SELECT pg_temp.assert_sqlstate_msg('criterion 4: líder A2 registrar on A1 → 42501 sin_permisos_para_este_grupo',
  $$SELECT public.talleres_registrar_asistencia(
      'ad000000-0000-4000-8000-000000000060',
      '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000070","estado":"presente"}]'::jsonb)$$,
  '42501', 'sin_permisos_para_este_grupo');
SELECT pg_temp.assert_sqlstate_msg('criterion 4: líder A2 cerrar clase on A1 → 42501 sin_permisos_para_este_grupo',
  $$SELECT public.talleres_cerrar_clase('ad000000-0000-4000-8000-000000000060')$$,
  '42501', 'sin_permisos_para_este_grupo');
SELECT pg_temp.assert_sqlstate_msg('criterion 4: líder A2 enviar reporte A1 → 42501 sin_permisos_para_este_grupo',
  $$SELECT public.talleres_enviar_reporte('ad000000-0000-4000-8000-000000000040')$$,
  '42501', 'sin_permisos_para_este_grupo');
SELECT pg_temp.assert_update_rows('criterion 4: líder A2 direct UPDATE taller_sesiones → 0 rows',
  $$UPDATE public.taller_sesiones SET tema = 'no deberia' WHERE id = 'ad000000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.assert_update_rows('criterion 4: líder A2 direct UPDATE taller_reportes → 0 rows',
  $$UPDATE public.taller_reportes SET observaciones_generales = 'x' WHERE id = 'ad000000-0000-4000-8000-000000000090'$$, 0);

RESET ROLE;
SELECT pg_temp.assert_rows('criterion 4: tema still NULL after the filtered UPDATE',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000060' AND tema IS NULL$$, 1);
SELECT pg_temp.assert_rows('criterion 4: reporte A1 observaciones untouched',
  $$SELECT 1 FROM taller_reportes
     WHERE id = 'ad000000-0000-4000-8000-000000000090'
       AND observaciones_generales = 'ZZ TAL fixture reporte A1'$$, 1);

-- ══ Criterion 5 — marks that must fail: not approved, not in the
-- grupo, closed class ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_sqlstate_msg('criterion 5: mark on a pendiente inscripción → P0001 INSCRIPCION_NO_APROBADA',
  $$SELECT public.talleres_registrar_asistencia(
      'ad000000-0000-4000-8000-000000000060',
      '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000073","estado":"presente"}]'::jsonb)$$,
  'P0001', 'INSCRIPCION_NO_APROBADA');
SELECT pg_temp.assert_sqlstate_msg('criterion 5: mark on another grupo''s inscripción → P0001 INSCRIPCION_NO_EN_GRUPO',
  $$SELECT public.talleres_registrar_asistencia(
      'ad000000-0000-4000-8000-000000000060',
      '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000072","estado":"presente"}]'::jsonb)$$,
  'P0001', 'INSCRIPCION_NO_EN_GRUPO');
SELECT pg_temp.assert_rows('criterion 5: rejected marks left the sesión at its 2 rows',
  $$SELECT id FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'$$, 2);

-- ══ Criterion 6 — líder closes the class; reading shows
-- presentes/ausentes with motivo; closed class rejects new marks ══

SELECT pg_temp.assert_no_error('criterion 6: líder closes the class',
  $$SELECT public.talleres_cerrar_clase('ad000000-0000-4000-8000-000000000060')$$);
SELECT pg_temp.assert_rows('criterion 6: sesión now cerrada',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000060' AND estado = 'cerrada'$$, 1);
SELECT pg_temp.assert_rows('criterion 6: reading shows the ausente row with its motivo',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000071'
       AND estado = 'ausente' AND motivo = 'enfermedad'$$, 1);
SELECT pg_temp.assert_rows('criterion 6: reading shows the presente row with motivo NULL',
  $$SELECT 1 FROM taller_asistencias
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'
       AND estado = 'presente' AND motivo IS NULL$$, 1);
SELECT pg_temp.assert_sqlstate_msg('criterion 6: closed class rejects a new mark → P0001 CLASE_CERRADA',
  $$SELECT public.talleres_registrar_asistencia(
      'ad000000-0000-4000-8000-000000000060',
      '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000071","estado":"ausente","motivo":"tarde"}]'::jsonb)$$,
  'P0001', 'CLASE_CERRADA');

-- ══ Criterion 7 — open class blocks the report (P0001
-- CLASES_ABIERTAS); all closed → líder sends, reporte is enviado and
-- signed by him ══

SELECT pg_temp.assert_sqlstate_msg('criterion 7: with A1#2 open, enviar reporte → P0001 CLASES_ABIERTAS',
  $$SELECT public.talleres_enviar_reporte('ad000000-0000-4000-8000-000000000040', 'Todo conforme')$$,
  'P0001', 'CLASES_ABIERTAS');
SELECT pg_temp.assert_no_error('criterion 7: líder closes the remaining class',
  $$SELECT public.talleres_cerrar_clase('ad000000-0000-4000-8000-000000000061')$$);
SELECT pg_temp.assert_no_error('criterion 7: líder sends the report',
  $$SELECT public.talleres_enviar_reporte('ad000000-0000-4000-8000-000000000040', 'Todo conforme')$$);
SELECT pg_temp.assert_rows('criterion 7: reporte enviado, firmado por líder A1, con fecha y observaciones',
  $$SELECT 1 FROM taller_reportes
     WHERE id = 'ad000000-0000-4000-8000-000000000090'
       AND estado = 'enviado'
       AND firma_lider_persona_id = 'ad000000-0000-4000-8000-000000000023'
       AND firma_lider_fecha IS NOT NULL
       AND observaciones_generales = 'Todo conforme'$$, 1);

-- ══ Criterion 8 — the scoped coordinator does everything on A2 by
-- CAPABILITY; líder A1 cannot write on A2 ══

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_sqlstate_msg('criterion 8: líder A1 registrar on A2 → 42501 sin_permisos_para_este_grupo',
  $$SELECT public.talleres_registrar_asistencia(
      'ad000000-0000-4000-8000-000000000062',
      '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000072","estado":"presente"}]'::jsonb)$$,
  '42501', 'sin_permisos_para_este_grupo');

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('criterion 8: coordinador registers on A2 purely by capability',
  $$WITH r AS (
      SELECT public.talleres_registrar_asistencia(
        'ad000000-0000-4000-8000-000000000062',
        '[{"inscripcion_id":"ad000000-0000-4000-8000-000000000072","estado":"presente"}]'::jsonb
      ) AS j)
    SELECT 1 FROM r
     WHERE (r.j->>'presentes')::int = 1
       AND (r.j->>'ausentes')::int = 0
       AND (r.j->>'total')::int = 1$$, 1);
SELECT pg_temp.assert_rows('criterion 8: A2 sesión went en_curso with today',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000062'
       AND estado = 'en_curso' AND fecha_realizada = current_date$$, 1);
SELECT pg_temp.assert_no_error('criterion 8: coordinador closes A2''s class by capability',
  $$SELECT public.talleres_cerrar_clase('ad000000-0000-4000-8000-000000000062')$$);
SELECT pg_temp.assert_no_error('criterion 8: coordinador sends A2''s report by capability',
  $$SELECT public.talleres_enviar_reporte('ad000000-0000-4000-8000-000000000041', 'Cierre de coordinacion')$$);
SELECT pg_temp.assert_rows('criterion 8: A2 reporte enviado, firma = el coordinador',
  $$SELECT 1 FROM taller_reportes
     WHERE id = 'ad000000-0000-4000-8000-000000000091'
       AND estado = 'enviado'
       AND firma_lider_persona_id = 'ad000000-0000-4000-8000-000000000031'
       AND firma_lider_fecha IS NOT NULL$$, 1);

-- ══ Criterion 9 — direct UPDATE on taller_asistencias stays rejected
-- for every identity (the false/false policy does not change) ══

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_update_rows('criterion 9: líder A1 direct UPDATE taller_asistencias → 0 rows',
  $$UPDATE public.taller_asistencias SET estado = 'presente'
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'$$, 0);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000024');
SELECT pg_temp.assert_update_rows('criterion 9: voluntario direct UPDATE taller_asistencias → 0 rows',
  $$UPDATE public.taller_asistencias SET estado = 'presente'
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'$$, 0);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_update_rows('criterion 9: coordinador direct UPDATE taller_asistencias → 0 rows (capability does not open this table)',
  $$UPDATE public.taller_asistencias SET estado = 'presente'
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'$$, 0);

SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000026');
SELECT pg_temp.assert_update_rows('criterion 9: líder A2 direct UPDATE taller_asistencias → 0 rows',
  $$UPDATE public.taller_asistencias SET estado = 'presente'
     WHERE sesion_id = 'ad000000-0000-4000-8000-000000000060'
       AND inscripcion_id = 'ad000000-0000-4000-8000-000000000070'$$, 0);

-- ══ Structural asserts — the approved DROP, the new objects, the new
-- columns/CHECK, and exactly which policies changed (postgres, no RLS) ══

RESET ROLE;

SELECT pg_temp.assert_rows('structural: trg_taller_asistencias_immutable_update is gone',
  $$SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_taller_asistencias_immutable_update' AND NOT tgisinternal$$, 0);
SELECT pg_temp.assert_rows('structural: taller_asistencias_immutable_update() is gone',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'taller_asistencias_immutable_update'$$, 0);
SELECT pg_temp.assert_rows('structural: the 4 new functions exist',
  $$SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('talleres_rol_en_grupo', 'talleres_registrar_asistencia',
                         'talleres_cerrar_clase', 'talleres_enviar_reporte')$$, 4);
SELECT pg_temp.assert_rows('structural: taller_sesiones.tema exists',
  $$SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.taller_sesiones'::regclass
       AND attname = 'tema' AND NOT attisdropped$$, 1);
SELECT pg_temp.assert_rows('structural: taller_asistencias.motivo exists',
  $$SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.taller_asistencias'::regclass
       AND attname = 'motivo' AND NOT attisdropped$$, 1);
SELECT pg_temp.assert_rows('structural: motivo CHECK constraint present under its migration name',
  $$SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.taller_asistencias'::regclass
       AND conname = 'taller_asistencias_motivo_solo_ausente'$$, 1);
SELECT pg_temp.assert_sqlstate('structural: motivo may NOT be set on a presente row (check_violation)',
  $$INSERT INTO public.taller_asistencias (id, sesion_id, inscripcion_id, persona_id, estado, motivo)
    VALUES ('ad000000-0000-4000-8000-000000000099',
            'ad000000-0000-4000-8000-000000000062',
            'ad000000-0000-4000-8000-000000000072',
            'ad000000-0000-4000-8000-000000000037', 'presente', 'motivo indebido')$$,
  '23514');

SELECT pg_temp.assert_rows('structural: taller_asistencias_update still false/false',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_asistencias_update'
       AND qual = 'false' AND with_check = 'false'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_asistencias_delete still false',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_asistencias_delete'
       AND qual = 'false'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_asistencias_insert did NOT gain a relación branch',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_asistencias_insert'
       AND with_check NOT LIKE '%talleres_rol_en_grupo%'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_sesiones_insert did NOT gain a relación branch',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_sesiones_insert'
       AND with_check NOT LIKE '%talleres_rol_en_grupo%'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_sesiones_update gained the relación branch, WITH CHECK stays true',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_sesiones_update'
       AND qual LIKE '%talleres_rol_en_grupo%'
       AND with_check = 'true'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_reportes_insert gained the relación branch',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_reportes_insert'
       AND with_check LIKE '%talleres_rol_en_grupo%'$$, 1);
SELECT pg_temp.assert_rows('structural: taller_reportes_update gained the relación branch on BOTH sides',
  $$SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'taller_reportes_update'
       AND qual LIKE '%talleres_rol_en_grupo%'
       AND with_check LIKE '%talleres_rol_en_grupo%'$$, 1);

-- ══ Final mutation — líder A1 writes taller_sesiones.tema directly:
-- 1 row affected proves the new relation write branch end to end ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ad000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_update_rows('final mutation: líder A1 UPDATE taller_sesiones.tema on his own sesión → 1 row',
  $$UPDATE public.taller_sesiones SET tema = 'Clase de fe'
     WHERE id = 'ad000000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.assert_rows('final mutation: líder A1 reads back the tema he wrote',
  $$SELECT 1 FROM taller_sesiones
     WHERE id = 'ad000000-0000-4000-8000-000000000060' AND tema = 'Clase de fe'$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
