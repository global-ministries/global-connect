-- T3 (odd/tasks/talleres-autoridad-arbol.md) — SECURITY DEFINER functions
-- gate on the object's own node.
--
-- Run against STAGING after applying
-- 20260918220000_talleres_scoped_functions.sql.
--
-- Covers acceptance criterion 5: open_edicion, create_taller_abstract
-- (both modes), generate_taller_sesiones, emit_taller_certificado and
-- talleres_resolver_solicitud_retiro all gate in-tree on the object they
-- touch — a director scoped to one branch cannot act on another branch's
-- object, can act on their own, and a global admin can act on either.
-- Also verifies the three dead puede_*_taller_grupo functions and the
-- legacy 9/10-arg open_edicion overloads no longer exist.
--
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id is under this
-- file's own a7000000-... namespace, no ambient staging row is touched.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t3_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.check_true(p_case text, p_actual boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT TRUE THEN
    INSERT INTO t3_failures(case_name) VALUES (p_case || ': expected true, got ' || coalesce(p_actual::text, 'NULL'));
  END IF;
END;
$$;

-- Calls a SQL expression (as text) that is expected to raise 42501
-- (FORBIDDEN); records a failure if it does not raise, or raises
-- something else.
CREATE OR REPLACE FUNCTION pg_temp.check_forbidden(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  INSERT INTO t3_failures(case_name) VALUES (p_case || ': expected FORBIDDEN (42501), call succeeded');
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL; -- expected
  WHEN OTHERS THEN
    INSERT INTO t3_failures(case_name) VALUES (p_case || ': expected FORBIDDEN (42501), got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Calls a SQL expression (as text) that is expected to succeed (no
-- exception at all).
CREATE OR REPLACE FUNCTION pg_temp.check_allowed(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO t3_failures(case_name) VALUES (p_case || ': expected success, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t3_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────
-- nodo_gcp = Grupos de Corto Plazo (real, Conexión branch)
-- nodo_dps = Próximo Paso (real, DPS branch)

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T3 Equipo Conexión', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a7000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ T3 Equipo Conexión Unlinked', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a7000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ T3 Equipo DPS', 'daffcd22-05b6-45e8-91e3-f3743f4d551f', true),
  ('a7000000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ T3 Equipo DPS Unlinked', 'daffcd22-05b6-45e8-91e3-f3743f4d551f', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('a7000000-0000-4000-8000-000000000010', 'zz-t3-fixture-conexion', 'ZZ T3 Fixture Conexión', 'a7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000011', 'zz-t3-fixture-dps', 'ZZ T3 Fixture DPS', 'a7000000-0000-4000-8000-000000000003');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a7000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 't3-fixture-dirconexion@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a7000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 't3-fixture-dirdps@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a7000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 't3-fixture-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a7000000-0000-4000-8000-000000000021', 'a7000000-0000-4000-8000-000000000020', 'T3 Fixture', 'DirConexion', 't3-fixture-dirconexion@example.test', 'Soltero', 'Otro'),
  ('a7000000-0000-4000-8000-000000000023', 'a7000000-0000-4000-8000-000000000022', 'T3 Fixture', 'DirDps', 't3-fixture-dirdps@example.test', 'Soltero', 'Otro'),
  ('a7000000-0000-4000-8000-000000000025', 'a7000000-0000-4000-8000-000000000024', 'T3 Fixture', 'Admin', 't3-fixture-admin@example.test', 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a7000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e'),
  ('a7000000-0000-4000-8000-000000000023', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'daffcd22-05b6-45e8-91e3-f3743f4d551f'),
  ('a7000000-0000-4000-8000-000000000025', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL);

CREATE TEMP TABLE t3_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000024', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ediciones$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a7000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T3 Fixture Edición Conexión', p_link_type => NULL,
    p_sesiones_estimadas => 2, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t3_fixture (key, id) VALUES
    ('edicion_conexion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte_conexion', (v_resultado ->> 'cohorte_id')::uuid);

  v_resultado := public.open_edicion(
    p_taller_id => 'a7000000-0000-4000-8000-000000000011',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T3 Fixture Edición DPS', p_link_type => NULL,
    p_sesiones_estimadas => 2, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t3_fixture (key, id) VALUES
    ('edicion_dps', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte_dps', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ediciones$;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('a7000000-0000-4000-8000-000000000030', (SELECT id FROM t3_fixture WHERE key='cohorte_conexion'), 'ZZ T3 Grupo Conexión', 'activo', 10),
  ('a7000000-0000-4000-8000-000000000031', (SELECT id FROM t3_fixture WHERE key='cohorte_dps'), 'ZZ T3 Grupo DPS', 'activo', 10);

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado) VALUES
  ('a7000000-0000-4000-8000-000000000040', (SELECT id FROM t3_fixture WHERE key='edicion_conexion'), (SELECT id FROM t3_fixture WHERE key='cohorte_conexion'), 'a7000000-0000-4000-8000-000000000021', 'aprobado', 'completado'),
  ('a7000000-0000-4000-8000-000000000041', (SELECT id FROM t3_fixture WHERE key='edicion_dps'), (SELECT id FROM t3_fixture WHERE key='cohorte_dps'), 'a7000000-0000-4000-8000-000000000023', 'aprobado', 'completado');

INSERT INTO public.taller_solicitudes_retiro (id, inscripcion_id, solicitante_persona_id, tipo, motivo, estado) VALUES
  ('a7000000-0000-4000-8000-000000000050', 'a7000000-0000-4000-8000-000000000040', 'a7000000-0000-4000-8000-000000000021', 'participante_retiro', 'ZZ T3 fixture', 'pendiente'),
  ('a7000000-0000-4000-8000-000000000051', 'a7000000-0000-4000-8000-000000000041', 'a7000000-0000-4000-8000-000000000023', 'participante_retiro', 'ZZ T3 fixture', 'pendiente');

CREATE OR REPLACE FUNCTION pg_temp.as_dir_conexion() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000020', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_dir_dps() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000022', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000024', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
GRANT SELECT ON t3_fixture TO authenticated;

-- ══ open_edicion ═════════════════════════════════════════════════════

SELECT pg_temp.as_dir_dps();
SELECT pg_temp.check_forbidden(
  'open_edicion: DPS director cannot open an edición for a Conexión taller',
  $$SELECT public.open_edicion('a7000000-0000-4000-8000-000000000010','individual','ZZ probe',NULL,1,60,'permanente_custom',now(),NULL,'[]'::jsonb,NULL)$$
);
SELECT pg_temp.check_allowed(
  'open_edicion: DPS director can open an edición for a DPS taller',
  $$SELECT public.open_edicion('a7000000-0000-4000-8000-000000000011','individual','ZZ probe',NULL,1,60,'permanente_custom',now(),NULL,'[]'::jsonb,NULL)$$
);

SELECT pg_temp.as_dir_conexion();
SELECT pg_temp.check_allowed(
  'open_edicion: Conexión director can open an edición for a Conexión taller',
  $$SELECT public.open_edicion('a7000000-0000-4000-8000-000000000010','individual','ZZ probe',NULL,1,60,'permanente_custom',now(),NULL,'[]'::jsonb,NULL)$$
);

SELECT pg_temp.as_admin();
SELECT pg_temp.check_allowed(
  'open_edicion: admin can open an edición for either branch',
  $$SELECT public.open_edicion('a7000000-0000-4000-8000-000000000011','individual','ZZ probe admin',NULL,1,60,'permanente_custom',now(),NULL,'[]'::jsonb,NULL)$$
);

-- ══ create_taller_abstract ═══════════════════════════════════════════

SELECT pg_temp.as_dir_dps();
SELECT pg_temp.check_forbidden(
  'create_taller_abstract (link mode): DPS director cannot link a Conexión-branch equipo',
  $$SELECT public.create_taller_abstract('ZZ T3 probe link conexion', NULL, 'periodo_general', 'zz-t3-probe-link-conexion', 'a7000000-0000-4000-8000-000000000002', NULL)$$
);
SELECT pg_temp.check_allowed(
  'create_taller_abstract (link mode): DPS director can link a DPS-branch equipo',
  $$SELECT public.create_taller_abstract('ZZ T3 probe link dps', NULL, 'periodo_general', 'zz-t3-probe-link-dps', 'a7000000-0000-4000-8000-000000000004', NULL)$$
);
SELECT pg_temp.check_forbidden(
  'create_taller_abstract (new mode): DPS director cannot create under Conexión''s parent node',
  $$SELECT public.create_taller_abstract('ZZ T3 probe new under conexion', NULL, 'periodo_general', 'zz-t3-probe-new-under-conexion', NULL, 'e524ea89-d3a7-45fc-be00-5a6e7452434e')$$
);
SELECT pg_temp.check_allowed(
  'create_taller_abstract (new mode): DPS director can create under DPS''s parent node',
  $$SELECT public.create_taller_abstract('ZZ T3 probe new under dps', NULL, 'periodo_general', 'zz-t3-probe-new-under-dps', NULL, 'daffcd22-05b6-45e8-91e3-f3743f4d551f')$$
);

SELECT pg_temp.as_admin();
SELECT pg_temp.check_allowed(
  'create_taller_abstract (new mode): admin can create under either branch (Conexión)',
  $$SELECT public.create_taller_abstract('ZZ T3 probe admin new conexion', NULL, 'periodo_general', 'zz-t3-probe-admin-new-conexion', NULL, 'e524ea89-d3a7-45fc-be00-5a6e7452434e')$$
);
SELECT pg_temp.check_allowed(
  'create_taller_abstract (new mode): admin can create under either branch (DPS)',
  $$SELECT public.create_taller_abstract('ZZ T3 probe admin new dps', NULL, 'periodo_general', 'zz-t3-probe-admin-new-dps', NULL, 'daffcd22-05b6-45e8-91e3-f3743f4d551f')$$
);

-- ══ generate_taller_sesiones ═════════════════════════════════════════

SELECT pg_temp.as_dir_dps();
SELECT pg_temp.check_forbidden(
  'generate_taller_sesiones: DPS director cannot generate for a Conexión grupo',
  format($$SELECT public.generate_taller_sesiones(%L)$$, 'a7000000-0000-4000-8000-000000000030')
);
SELECT pg_temp.check_allowed(
  'generate_taller_sesiones: DPS director can generate for a DPS grupo',
  format($$SELECT public.generate_taller_sesiones(%L)$$, 'a7000000-0000-4000-8000-000000000031')
);

SELECT pg_temp.as_dir_conexion();
SELECT pg_temp.check_allowed(
  'generate_taller_sesiones: Conexión director can generate for a Conexión grupo',
  format($$SELECT public.generate_taller_sesiones(%L)$$, 'a7000000-0000-4000-8000-000000000030')
);

SELECT pg_temp.as_admin();
SELECT pg_temp.check_allowed(
  'generate_taller_sesiones: admin can generate for either branch',
  format($$SELECT public.generate_taller_sesiones(%L)$$, 'a7000000-0000-4000-8000-000000000031')
);

-- ══ emit_taller_certificado ══════════════════════════════════════════

SELECT pg_temp.as_dir_dps();
SELECT pg_temp.check_forbidden(
  'emit_taller_certificado: DPS director cannot emit for a Conexión inscripción',
  $$SELECT public.emit_taller_certificado('a7000000-0000-4000-8000-000000000040', 'zzt3probeconx001')$$
);
SELECT pg_temp.check_allowed(
  'emit_taller_certificado: DPS director can emit for a DPS inscripción',
  $$SELECT public.emit_taller_certificado('a7000000-0000-4000-8000-000000000041', 'zzt3probedps0001')$$
);

SELECT pg_temp.as_dir_conexion();
SELECT pg_temp.check_allowed(
  'emit_taller_certificado: Conexión director can emit for a Conexión inscripción',
  $$SELECT public.emit_taller_certificado('a7000000-0000-4000-8000-000000000040', 'zzt3probeconx002')$$
);

SELECT pg_temp.as_admin();
SELECT pg_temp.check_allowed(
  'emit_taller_certificado: admin can emit (idempotent re-call) for either branch',
  $$SELECT public.emit_taller_certificado('a7000000-0000-4000-8000-000000000041', 'zzt3probeadmin01')$$
);

-- ══ talleres_resolver_solicitud_retiro ═══════════════════════════════

SELECT pg_temp.as_dir_dps();
SELECT pg_temp.check_forbidden(
  'talleres_resolver_solicitud_retiro: DPS director cannot resolve a Conexión solicitud',
  $$SELECT public.talleres_resolver_solicitud_retiro('a7000000-0000-4000-8000-000000000050', 'aprobar', NULL)$$
);

SELECT pg_temp.as_dir_conexion();
SELECT pg_temp.check_allowed(
  'talleres_resolver_solicitud_retiro: Conexión director can resolve a Conexión solicitud',
  $$SELECT public.talleres_resolver_solicitud_retiro('a7000000-0000-4000-8000-000000000050', 'aprobar', NULL)$$
);

-- ══ dead functions / legacy overloads must no longer exist ══════════

SELECT pg_temp.check_true(
  'puede_editar_taller_grupo is dropped',
  to_regprocedure('public.puede_editar_taller_grupo(uuid)') IS NULL
);
SELECT pg_temp.check_true(
  'puede_gestionar_participantes_taller_grupo is dropped',
  to_regprocedure('public.puede_gestionar_participantes_taller_grupo(uuid)') IS NULL
);
SELECT pg_temp.check_true(
  'puede_ver_taller_grupo is dropped',
  to_regprocedure('public.puede_ver_taller_grupo(uuid)') IS NULL
);
SELECT pg_temp.check_true(
  'open_edicion 9-arg legacy overload is dropped',
  to_regprocedure('public.open_edicion(uuid,text,text,integer,integer,text,timestamptz,timestamptz,jsonb)') IS NULL
);
SELECT pg_temp.check_true(
  'open_edicion 10-arg legacy overload is dropped',
  to_regprocedure('public.open_edicion(uuid,text,text,text,integer,integer,text,timestamptz,timestamptz,jsonb)') IS NULL
);
SELECT pg_temp.check_true(
  'open_edicion 11-arg (current) overload still exists',
  to_regprocedure('public.open_edicion(uuid,text,text,text,integer,integer,text,timestamptz,timestamptz,jsonb,uuid)') IS NOT NULL
);

SELECT pg_temp.report();

ROLLBACK;
