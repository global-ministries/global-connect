-- T2 (odd/tasks/talleres-autoridad-arbol.md) — RLS authority matrix.
--
-- Run against STAGING after applying:
--   20260918190000_talleres_scoped_policies_core.sql
--   20260918200000_talleres_scoped_policies_grupos.sql
--   20260918210000_talleres_scoped_policies_inscripciones.sql
--
-- Five identities, two org-chart branches (Conexión / DPS-Próximo Paso),
-- one full object chain per branch (taller, edición, cohorte, grupo,
-- sesión, inscripción, asistencia, reporte, corrección, solicitud de
-- retiro, asignación, certificado, evento). Per table: a SELECT
-- visibility check per identity, plus one representative cross-branch
-- write-denied / same-branch write-allowed pair. Failures are collected
-- (not raised immediately) so one run reports everything wrong at once.
--
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id is under this
-- file's own a6000000-... namespace, no ambient staging row is touched.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t2_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON t2_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.check_count(p_case text, p_actual bigint, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected ' || p_expected || ', got ' || coalesce(p_actual::text, 'NULL'));
  END IF;
END;
$$;

-- Runs an INSERT/UPDATE as dynamic SQL and checks it affected exactly one
-- row (p_expect_success) or zero rows (denied via USING filtering) —
-- treating a raised insufficient_privilege (WITH CHECK failure) as an
-- equally valid "denied" outcome.
CREATE OR REPLACE FUNCTION pg_temp.check_write(p_case text, p_sql text, p_expect_success boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_expect_success THEN
    IF v_count <> 1 THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected 1 row affected, got ' || v_count);
    END IF;
  ELSE
    IF v_count <> 0 THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected denial (0 rows), got ' || v_count || ' rows affected');
    END IF;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    IF p_expect_success THEN
      INSERT INTO t2_failures(case_name) VALUES (p_case || ': expected success, got denied (42501)');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t2_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
END;
$$;

-- ── org chart + actors ───────────────────────────────────────────────
-- root_conexion = '5c388e7c-512d-42d7-925e-79d5147f136a' (real, ambient)
-- nodo_gcp      = 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (real, child of root_conexion)
-- nodo_proximo_paso = 'daffcd22-05b6-45e8-91e3-f3743f4d551f' (real, DPS branch)

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T2 Fixture Equipo Conexión', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a6000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ T2 Fixture Equipo DPS', 'daffcd22-05b6-45e8-91e3-f3743f4d551f', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('a6000000-0000-4000-8000-000000000003', 'zz-t2-fixture-conexion', 'ZZ T2 Fixture Taller Conexión', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000004', 'zz-t2-fixture-dps', 'ZZ T2 Fixture Taller DPS', 'a6000000-0000-4000-8000-000000000002');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a6000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 't2-fixture-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 't2-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 't2-fixture-coordconexion@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-00000000000b'::uuid, 'authenticated', 'authenticated', 't2-fixture-coorddps@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 't2-fixture-member@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 't2-fixture-dpsparticipant@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a6000000-0000-4000-8000-000000000006', 'a6000000-0000-4000-8000-000000000005', 'T2 Fixture', 'Admin', 't2-fixture-admin@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000008', 'a6000000-0000-4000-8000-000000000007', 'T2 Fixture', 'Director', 't2-fixture-director@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-00000000000a'::uuid, 'a6000000-0000-4000-8000-000000000009', 'T2 Fixture', 'CoordConexion', 't2-fixture-coordconexion@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-00000000000c'::uuid, 'a6000000-0000-4000-8000-00000000000b'::uuid, 'T2 Fixture', 'CoordDps', 't2-fixture-coorddps@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-00000000000e', 'a6000000-0000-4000-8000-00000000000d', 'T2 Fixture', 'Member', 't2-fixture-member@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000010', 'a6000000-0000-4000-8000-00000000000f', 'T2 Fixture', 'DpsParticipant', 't2-fixture-dpsparticipant@example.test', 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a6000000-0000-4000-8000-000000000006', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL),
  -- Mirrors the real staging/production admin persona, which holds
  -- director.read/write ALONGSIDE admin.manage (its 8 real grants are a
  -- mix, not admin.manage alone) — taller_asistencias_select in
  -- particular has no admin.manage branch at all, pre-existing and out
  -- of this task's scope to add; the real admin's access there has
  -- always come through director.read.
  ('a6000000-0000-4000-8000-000000000006', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'experience', NULL),
  ('a6000000-0000-4000-8000-000000000006', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'experience', NULL),
  ('a6000000-0000-4000-8000-000000000008', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', '5c388e7c-512d-42d7-925e-79d5147f136a'),
  ('a6000000-0000-4000-8000-000000000008', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', '5c388e7c-512d-42d7-925e-79d5147f136a'),
  ('a6000000-0000-4000-8000-00000000000a'::uuid, 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-00000000000a'::uuid, 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-00000000000c'::uuid, 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-00000000000c'::uuid, 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000002');
  -- plain_member (...00e) and dps_participant (...0010) get no grants at all.

-- ── ediciones + cohortes (via the real open_edicion RPC, as admin) ────

CREATE TEMP TABLE t2_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000005', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ediciones$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a6000000-0000-4000-8000-000000000003',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T2 Fixture Edición Conexión', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t2_fixture (key, id) VALUES
    ('edicion_conexion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte_conexion', (v_resultado ->> 'cohorte_id')::uuid);

  v_resultado := public.open_edicion(
    p_taller_id => 'a6000000-0000-4000-8000-000000000004',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T2 Fixture Edición DPS', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t2_fixture (key, id) VALUES
    ('edicion_dps', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte_dps', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ediciones$;

-- ── the rest of the object graph (direct inserts, bypassing RLS) ──────

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('a6000000-0000-4000-8000-000000000020', (SELECT id FROM t2_fixture WHERE key = 'cohorte_conexion'), 'ZZ T2 Grupo Conexión', 'activo', 10),
  ('a6000000-0000-4000-8000-000000000021', (SELECT id FROM t2_fixture WHERE key = 'cohorte_dps'), 'ZZ T2 Grupo DPS', 'activo', 10);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('a6000000-0000-4000-8000-000000000022', 'a6000000-0000-4000-8000-000000000020', 1, current_date, 'programada'),
  ('a6000000-0000-4000-8000-000000000023', 'a6000000-0000-4000-8000-000000000021', 1, current_date, 'programada'),
  ('a6000000-0000-4000-8000-000000000041', 'a6000000-0000-4000-8000-000000000020', 2, current_date, 'programada');

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
  ('a6000000-0000-4000-8000-000000000024', (SELECT id FROM t2_fixture WHERE key = 'edicion_conexion'), (SELECT id FROM t2_fixture WHERE key = 'cohorte_conexion'), 'a6000000-0000-4000-8000-00000000000e', 'pendiente'),
  ('a6000000-0000-4000-8000-000000000025', (SELECT id FROM t2_fixture WHERE key = 'edicion_dps'), (SELECT id FROM t2_fixture WHERE key = 'cohorte_dps'), 'a6000000-0000-4000-8000-000000000010', 'pendiente');

INSERT INTO public.taller_asistencias (id, sesion_id, inscripcion_id, persona_id, estado) VALUES
  ('a6000000-0000-4000-8000-000000000026', 'a6000000-0000-4000-8000-000000000022', 'a6000000-0000-4000-8000-000000000024', 'a6000000-0000-4000-8000-00000000000e', 'presente'),
  ('a6000000-0000-4000-8000-000000000027', 'a6000000-0000-4000-8000-000000000023', 'a6000000-0000-4000-8000-000000000025', 'a6000000-0000-4000-8000-000000000010', 'presente');

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales) VALUES
  ('a6000000-0000-4000-8000-000000000028', 'a6000000-0000-4000-8000-000000000020', 'borrador', 'ZZ T2 fixture'),
  ('a6000000-0000-4000-8000-000000000029', 'a6000000-0000-4000-8000-000000000021', 'borrador', 'ZZ T2 fixture');

INSERT INTO public.taller_reporte_correcciones (id, reporte_id, autor_persona_id, contenido_anterior, contenido_nuevo, motivo) VALUES
  ('a6000000-0000-4000-8000-00000000002a'::uuid, 'a6000000-0000-4000-8000-000000000028', 'a6000000-0000-4000-8000-00000000000a'::uuid, '{}'::jsonb, '{}'::jsonb, 'ZZ T2 fixture'),
  ('a6000000-0000-4000-8000-00000000002b'::uuid, 'a6000000-0000-4000-8000-000000000029', 'a6000000-0000-4000-8000-00000000000c'::uuid, '{}'::jsonb, '{}'::jsonb, 'ZZ T2 fixture');

INSERT INTO public.taller_solicitudes_retiro (id, inscripcion_id, solicitante_persona_id, tipo, motivo, estado) VALUES
  ('a6000000-0000-4000-8000-00000000002c'::uuid, 'a6000000-0000-4000-8000-000000000024', 'a6000000-0000-4000-8000-00000000000e', 'participante_retiro', 'ZZ T2 fixture', 'pendiente'),
  ('a6000000-0000-4000-8000-00000000002d'::uuid, 'a6000000-0000-4000-8000-000000000025', 'a6000000-0000-4000-8000-000000000010', 'participante_retiro', 'ZZ T2 fixture', 'pendiente');

-- Pre-existing, out-of-scope bug found while building this fixture:
-- sync_talleres_grants_on_grupo_asignacion_change() compares
-- dream_team_capability_grants.scope_id (text) to a uuid without a cast
-- ("operator does not exist: text = uuid"), so ANY insert into this
-- table raises today, independently of RLS. Disabled here only for this
-- rolled-back fixture; not in this task's authorized scope to fix.
ALTER TABLE public.taller_grupo_asignaciones DISABLE TRIGGER trg_sync_talleres_grants_on_grupo_asignacion_change;

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('a6000000-0000-4000-8000-00000000002e'::uuid, 'a6000000-0000-4000-8000-000000000020', 'a6000000-0000-4000-8000-00000000000e', 'voluntario', true),
  ('a6000000-0000-4000-8000-00000000002f'::uuid, 'a6000000-0000-4000-8000-000000000021', 'a6000000-0000-4000-8000-000000000010', 'voluntario', true);

INSERT INTO public.taller_certificados (id, inscripcion_id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot, fecha_completitud, firmantes_snapshot) VALUES
  ('a6000000-0000-4000-8000-000000000030', 'a6000000-0000-4000-8000-000000000024', 'zzt2fixtureconx1', (SELECT id FROM t2_fixture WHERE key = 'edicion_conexion'), 'a6000000-0000-4000-8000-00000000000e', 'ZZ T2 Fixture', 'ZZ Member', now(), '[]'::jsonb),
  ('a6000000-0000-4000-8000-000000000031', 'a6000000-0000-4000-8000-000000000025', 'zzt2fixturedps01', (SELECT id FROM t2_fixture WHERE key = 'edicion_dps'), 'a6000000-0000-4000-8000-000000000010', 'ZZ T2 Fixture', 'ZZ DpsParticipant', now(), '[]'::jsonb);

INSERT INTO public.taller_eventos (id, taller_id, persona_id, actor_persona_id, schema_version, payload, occurred_at, emitted_to_outbox) VALUES
  ('a6000000-0000-4000-8000-000000000032', (SELECT id FROM t2_fixture WHERE key = 'edicion_conexion'), 'a6000000-0000-4000-8000-00000000000e', 'a6000000-0000-4000-8000-000000000006', 'v1', '{}'::jsonb, now(), false),
  ('a6000000-0000-4000-8000-000000000033', (SELECT id FROM t2_fixture WHERE key = 'edicion_dps'), 'a6000000-0000-4000-8000-000000000010', 'a6000000-0000-4000-8000-000000000006', 'v1', '{}'::jsonb, now(), false);

GRANT SELECT ON t2_fixture TO authenticated;

-- ── identity switches ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.as_director() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000007', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_coord_conexion() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000009', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_coord_dps() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-00000000000b', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_member() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-00000000000d', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ talleres (catalog) ════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_director();
-- talleres_select_all is intentionally unscoped PUBLIC true for any
-- authenticated user (the catalog is meant to be browsable) — only
-- insert/update/delete are scoped by director.write, tested below.
SELECT pg_temp.check_count('talleres/director sees the whole public catalog (select unscoped by design)',
  (SELECT count(*) FROM public.talleres WHERE id IN ('a6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000004')), 2);

SELECT pg_temp.check_write('talleres/director denied writing DPS row',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller DPS (edited)' WHERE id = 'a6000000-0000-4000-8000-000000000004'$$, false);
SELECT pg_temp.check_write('talleres/director allowed writing Conexión row',
  $$UPDATE public.talleres SET nombre = 'ZZ T2 Fixture Taller Conexión (edited)' WHERE id = 'a6000000-0000-4000-8000-000000000003'$$, true);
RESET ROLE;

-- ══ taller_ediciones ═════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_director();
SELECT pg_temp.check_count('taller_ediciones/director sees only Conexión',
  (SELECT count(*) FROM public.taller_ediciones WHERE id IN ((SELECT id FROM t2_fixture WHERE key='edicion_conexion'), (SELECT id FROM t2_fixture WHERE key='edicion_dps'))), 1);
SELECT pg_temp.check_write('taller_ediciones/director denied writing DPS edición',
  format($$UPDATE public.taller_ediciones SET nombre_snapshot = 'edited' WHERE id = %L$$, (SELECT id FROM t2_fixture WHERE key='edicion_dps')), false);
SELECT pg_temp.check_write('taller_ediciones/director allowed writing Conexión edición',
  format($$UPDATE public.taller_ediciones SET nombre_snapshot = 'edited' WHERE id = %L$$, (SELECT id FROM t2_fixture WHERE key='edicion_conexion')), true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('taller_ediciones/plain member sees neither (no grant, edición not open)',
  (SELECT count(*) FROM public.taller_ediciones WHERE id IN ((SELECT id FROM t2_fixture WHERE key='edicion_conexion'), (SELECT id FROM t2_fixture WHERE key='edicion_dps'))), 0);
RESET ROLE;

-- ══ talleres_crecimiento_cohortes ════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('cohortes/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.talleres_crecimiento_cohortes WHERE id IN ((SELECT id FROM t2_fixture WHERE key='cohorte_conexion'), (SELECT id FROM t2_fixture WHERE key='cohorte_dps'))), 1);
SELECT pg_temp.check_write('cohortes/coord_conexion denied writing DPS cohorte',
  format($$UPDATE public.talleres_crecimiento_cohortes SET edicion = 'edited' WHERE id = %L$$, (SELECT id FROM t2_fixture WHERE key='cohorte_dps')), false);
SELECT pg_temp.check_write('cohortes/coord_conexion allowed writing own cohorte',
  format($$UPDATE public.talleres_crecimiento_cohortes SET edicion = 'edited' WHERE id = %L$$, (SELECT id FROM t2_fixture WHERE key='cohorte_conexion')), true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_dps();
SELECT pg_temp.check_count('cohortes/coord_dps sees only DPS',
  (SELECT count(*) FROM public.talleres_crecimiento_cohortes WHERE id IN ((SELECT id FROM t2_fixture WHERE key='cohorte_conexion'), (SELECT id FROM t2_fixture WHERE key='cohorte_dps'))), 1);
RESET ROLE;

-- ══ taller_grupos ════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('grupos/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_grupos WHERE id IN ('a6000000-0000-4000-8000-000000000020','a6000000-0000-4000-8000-000000000021')), 1);
SELECT pg_temp.check_write('grupos/coord_conexion denied writing DPS grupo',
  $$UPDATE public.taller_grupos SET nombre = 'edited' WHERE id = 'a6000000-0000-4000-8000-000000000021'$$, false);
SELECT pg_temp.check_write('grupos/coord_conexion allowed writing own grupo',
  $$UPDATE public.taller_grupos SET nombre = 'edited' WHERE id = 'a6000000-0000-4000-8000-000000000020'$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('grupos/plain member sees neither',
  (SELECT count(*) FROM public.taller_grupos WHERE id IN ('a6000000-0000-4000-8000-000000000020','a6000000-0000-4000-8000-000000000021')), 0);
RESET ROLE;

-- ══ taller_grupo_asignaciones ════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('asignaciones/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_grupo_asignaciones WHERE id IN ('a6000000-0000-4000-8000-00000000002e','a6000000-0000-4000-8000-00000000002f')), 1);
SELECT pg_temp.check_write('asignaciones/coord_conexion denied writing DPS asignación',
  $$UPDATE public.taller_grupo_asignaciones SET activo = false WHERE id = 'a6000000-0000-4000-8000-00000000002f'$$, false);
SELECT pg_temp.check_write('asignaciones/coord_conexion allowed writing own asignación',
  $$UPDATE public.taller_grupo_asignaciones SET activo = false WHERE id = 'a6000000-0000-4000-8000-00000000002e'$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('asignaciones/plain member sees only their own assignment (pre-existing SELF branch, unchanged)',
  (SELECT count(*) FROM public.taller_grupo_asignaciones WHERE id IN ('a6000000-0000-4000-8000-00000000002e','a6000000-0000-4000-8000-00000000002f')), 1);
RESET ROLE;

-- ══ taller_sesiones ══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('sesiones/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_sesiones WHERE id IN ('a6000000-0000-4000-8000-000000000022','a6000000-0000-4000-8000-000000000023')), 1);
SELECT pg_temp.check_write('sesiones/coord_conexion denied writing DPS sesión',
  $$UPDATE public.taller_sesiones SET estado = 'en_curso' WHERE id = 'a6000000-0000-4000-8000-000000000023'$$, false);
SELECT pg_temp.check_write('sesiones/coord_conexion allowed writing own sesión',
  $$UPDATE public.taller_sesiones SET estado = 'en_curso' WHERE id = 'a6000000-0000-4000-8000-000000000022'$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('sesiones/plain member sees neither',
  (SELECT count(*) FROM public.taller_sesiones WHERE id IN ('a6000000-0000-4000-8000-000000000022','a6000000-0000-4000-8000-000000000023')), 0);
RESET ROLE;

-- ══ taller_inscripciones ═════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('inscripciones/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_inscripciones WHERE id IN ('a6000000-0000-4000-8000-000000000024','a6000000-0000-4000-8000-000000000025')), 1);
SELECT pg_temp.check_write('inscripciones/coord_conexion denied writing DPS inscripción',
  $$UPDATE public.taller_inscripciones SET estado = 'aprobado' WHERE id = 'a6000000-0000-4000-8000-000000000025'$$, false);
SELECT pg_temp.check_write('inscripciones/coord_conexion allowed writing own inscripción',
  $$UPDATE public.taller_inscripciones SET estado = 'aprobado' WHERE id = 'a6000000-0000-4000-8000-000000000024'$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('inscripciones/plain member sees only their own',
  (SELECT count(*) FROM public.taller_inscripciones WHERE id IN ('a6000000-0000-4000-8000-000000000024','a6000000-0000-4000-8000-000000000025')), 1);
RESET ROLE;

-- ══ taller_asistencias ═══════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('asistencias/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_asistencias WHERE id IN ('a6000000-0000-4000-8000-000000000026','a6000000-0000-4000-8000-000000000027')), 1);
SELECT pg_temp.check_write('asistencias/coord_conexion denied inserting for DPS inscripción',
  $$INSERT INTO public.taller_asistencias (sesion_id, inscripcion_id, persona_id, estado) VALUES ('a6000000-0000-4000-8000-000000000023', 'a6000000-0000-4000-8000-000000000025', 'a6000000-0000-4000-8000-000000000010', 'presente')$$, false);
SELECT pg_temp.check_write('asistencias/coord_conexion allowed inserting for own inscripción',
  $$INSERT INTO public.taller_asistencias (id, sesion_id, inscripcion_id, persona_id, estado) VALUES ('a6000000-0000-4000-8000-000000000040', 'a6000000-0000-4000-8000-000000000041', 'a6000000-0000-4000-8000-000000000024', 'a6000000-0000-4000-8000-00000000000e', 'ausente')$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('asistencias/plain member sees neither (no SELF branch on this table)',
  (SELECT count(*) FROM public.taller_asistencias WHERE id IN ('a6000000-0000-4000-8000-000000000026','a6000000-0000-4000-8000-000000000027')), 0);
RESET ROLE;

-- ══ taller_reportes ══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('reportes/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_reportes WHERE id IN ('a6000000-0000-4000-8000-000000000028','a6000000-0000-4000-8000-000000000029')), 1);
SELECT pg_temp.check_write('reportes/coord_conexion denied writing DPS reporte',
  $$UPDATE public.taller_reportes SET observaciones_generales = 'edited' WHERE id = 'a6000000-0000-4000-8000-000000000029'$$, false);
SELECT pg_temp.check_write('reportes/coord_conexion allowed writing own reporte',
  $$UPDATE public.taller_reportes SET observaciones_generales = 'edited' WHERE id = 'a6000000-0000-4000-8000-000000000028'$$, true);
RESET ROLE;

-- ══ taller_reporte_correcciones ══════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('correcciones/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_reporte_correcciones WHERE id IN ('a6000000-0000-4000-8000-00000000002a','a6000000-0000-4000-8000-00000000002b')), 1);
SELECT pg_temp.check_write('correcciones/coord_conexion denied inserting for DPS reporte',
  $$INSERT INTO public.taller_reporte_correcciones (reporte_id, autor_persona_id, contenido_anterior, contenido_nuevo, motivo) VALUES ('a6000000-0000-4000-8000-000000000029', 'a6000000-0000-4000-8000-00000000000a', '{}'::jsonb, '{}'::jsonb, 'probe')$$, false);
SELECT pg_temp.check_write('correcciones/coord_conexion allowed inserting for own reporte',
  $$INSERT INTO public.taller_reporte_correcciones (reporte_id, autor_persona_id, contenido_anterior, contenido_nuevo, motivo) VALUES ('a6000000-0000-4000-8000-000000000028', 'a6000000-0000-4000-8000-00000000000a', '{}'::jsonb, '{}'::jsonb, 'probe')$$, true);
RESET ROLE;

-- ══ taller_solicitudes_retiro ════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_director();
SELECT pg_temp.check_count('solicitudes/director sees only Conexión',
  (SELECT count(*) FROM public.taller_solicitudes_retiro WHERE id IN ('a6000000-0000-4000-8000-00000000002c','a6000000-0000-4000-8000-00000000002d')), 1);
SELECT pg_temp.check_write('solicitudes/director denied writing DPS solicitud',
  $$UPDATE public.taller_solicitudes_retiro SET estado = 'aprobada' WHERE id = 'a6000000-0000-4000-8000-00000000002d'$$, false);
SELECT pg_temp.check_write('solicitudes/director allowed writing Conexión solicitud',
  $$UPDATE public.taller_solicitudes_retiro SET estado = 'aprobada' WHERE id = 'a6000000-0000-4000-8000-00000000002c'$$, true);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_member();
SELECT pg_temp.check_count('solicitudes/plain member sees only their own',
  (SELECT count(*) FROM public.taller_solicitudes_retiro WHERE id IN ('a6000000-0000-4000-8000-00000000002c','a6000000-0000-4000-8000-00000000002d')), 1);
RESET ROLE;

-- ══ taller_certificados ══════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_director();
-- taller_certificados_select_anon (roles={anon,authenticated}, qual
-- revocado_at IS NULL) is a second PERMISSIVE policy on this table and
-- also applies to `authenticated` — any authenticated user sees any
-- non-revoked certificate regardless of branch, by design (public
-- verification). The real scoped boundary is on revocation (write),
-- tested right below and already isolated per-branch.
SELECT pg_temp.check_count('certificados/director sees both non-revoked certs via the PUBLIC verification branch (by design)',
  (SELECT count(*) FROM public.taller_certificados WHERE id IN ('a6000000-0000-4000-8000-000000000030','a6000000-0000-4000-8000-000000000031')), 2);
SELECT pg_temp.check_write('certificados/director denied revoking DPS certificado',
  $$UPDATE public.taller_certificados SET revocado_at = now(), motivo_revocacion = 'probe' WHERE id = 'a6000000-0000-4000-8000-000000000031'$$, false);
SELECT pg_temp.check_write('certificados/director allowed revoking Conexión certificado',
  $$UPDATE public.taller_certificados SET revocado_at = now(), motivo_revocacion = 'probe' WHERE id = 'a6000000-0000-4000-8000-000000000030'$$, true);
RESET ROLE;

-- ══ taller_eventos ═══════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_coord_conexion();
SELECT pg_temp.check_count('eventos/coord_conexion sees only Conexión',
  (SELECT count(*) FROM public.taller_eventos WHERE id IN ('a6000000-0000-4000-8000-000000000032','a6000000-0000-4000-8000-000000000033')), 1);
SELECT pg_temp.check_write('eventos/coord_conexion denied inserting for DPS edición',
  format($$INSERT INTO public.taller_eventos (taller_id, persona_id, actor_persona_id, schema_version, payload, occurred_at, emitted_to_outbox) VALUES (%L, 'a6000000-0000-4000-8000-000000000010', 'a6000000-0000-4000-8000-00000000000a', 'v1', '{}'::jsonb, now(), false)$$, (SELECT id FROM t2_fixture WHERE key='edicion_dps')), false);
SELECT pg_temp.check_write('eventos/coord_conexion allowed inserting for own edición',
  format($$INSERT INTO public.taller_eventos (taller_id, persona_id, actor_persona_id, schema_version, payload, occurred_at, emitted_to_outbox) VALUES (%L, 'a6000000-0000-4000-8000-00000000000e', 'a6000000-0000-4000-8000-00000000000a', 'v1', '{}'::jsonb, now(), false)$$, (SELECT id FROM t2_fixture WHERE key='edicion_conexion')), true);
RESET ROLE;

-- ══ admin: retains everything throughout ═════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000005', true),
       set_config('request.jwt.claim.role', 'authenticated', true);
SELECT pg_temp.check_count('admin sees both branches: talleres', (SELECT count(*) FROM public.talleres WHERE id IN ('a6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000004')), 2);
SELECT pg_temp.check_count('admin sees both branches: taller_grupos', (SELECT count(*) FROM public.taller_grupos WHERE id IN ('a6000000-0000-4000-8000-000000000020','a6000000-0000-4000-8000-000000000021')), 2);
SELECT pg_temp.check_count('admin sees both branches: taller_inscripciones', (SELECT count(*) FROM public.taller_inscripciones WHERE id IN ('a6000000-0000-4000-8000-000000000024','a6000000-0000-4000-8000-000000000025')), 2);
SELECT pg_temp.check_count('admin sees both branches: taller_asistencias', (SELECT count(*) FROM public.taller_asistencias WHERE id IN ('a6000000-0000-4000-8000-000000000026','a6000000-0000-4000-8000-000000000027')), 2);
SELECT pg_temp.check_count('admin sees both branches: taller_certificados', (SELECT count(*) FROM public.taller_certificados WHERE id IN ('a6000000-0000-4000-8000-000000000030','a6000000-0000-4000-8000-000000000031')), 2);
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
