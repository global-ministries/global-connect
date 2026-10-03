-- A6 (T7 correction round, odd/tasks/talleres-configuracion-del-taller.md)
-- — RED→GREEN coverage the independent reviewer asked for explicitly: a
-- director scoped to taller A must be refused, 42501
-- sin_permisos_para_este_taller, when calling any of the four instantiated-
-- edition/plantilla RPCs with an object that belongs to a DIFFERENT taller
-- B. None of these functions are touched by this migration — each already
-- resolves its OWN target object's node and checks the caller's capability
-- SCOPED to that node (not "any capability of this key, anywhere"), so a
-- director whose only grant is scoped to A's node already fails the scoped
-- check for B's node. This file proves that with real fixtures, not just
-- reasoning about auth_has_talleres_capability_scoped's existing contract.
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own b2000000-... namespace.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, the same real anchor every other
-- talleres fixture test in this feature already uses.
--
-- Two SIBLING talleres (neither is an ancestor/descendant of the other):
--   A (b2…10, equipo b2…01) — the director's ONLY capability grant.
--   B (b2…11, equipo b2…02) — has its own grupo, sesión, and plantilla
--     clase, built directly as postgres (bypassing RLS — this fixture's
--     own authoring path is not what's under test; each function's OWN
--     dedicated test file already covers that). The minimal operating_
--     core_events -> taller_ediciones -> talleres_crecimiento_cohortes ->
--     taller_grupos -> taller_sesiones chain is the same shape T7's own
--     talleres-plantillas-del-taller.test.sql (A1 hardening) already
--     builds for the identical reason.
--
-- Identities:
--   director  (b2…21) — director.write scoped to taller A's node ONLY.
--
-- Cases:
--   (a) talleres_editar_grupo(grupo de B, ...) → 42501 sin_permisos_para_este_taller.
--   (b) talleres_editar_clase(sesión de B, ...) → 42501 sin_permisos_para_este_taller.
--   (c) talleres_mover_plantilla_clase(clase de B, 'arriba') → 42501 sin_permisos_para_este_taller.
--   (d) talleres_servidores_del_taller(B) → 42501 sin_permisos_para_este_taller.
-- Every case also asserts the targeted row is untouched by the refused call.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ct_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ct_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ct_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ct_failures;
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

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CT Equipo A', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('b2000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CT Equipo B', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b2000000-0000-4000-8000-000000000010', 'zz-ct-fixture-a', 'ZZ CT Fixture Taller A', 'b2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000011', 'zz-ct-fixture-b', 'ZZ CT Fixture Taller B', 'b2000000-0000-4000-8000-000000000002');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b2000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'ct-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b2000000-0000-4000-8000-000000000021', 'b2000000-0000-4000-8000-000000000020', 'ZZ CT', 'Director', 'ct-fixture-director@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- director gets director.write ONLY on taller A's node — no grant of any
-- kind on taller B's node, at all.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b2000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b2000000-0000-4000-8000-000000000001');

-- taller B's own plantilla clase (for (c)) and the minimal instanciado
-- chain (for (a)/(b)): operating_core_events -> taller_ediciones ->
-- talleres_crecimiento_cohortes -> taller_grupos -> taller_sesiones. Same
-- shape/reasoning as T7's own talleres-plantillas-del-taller.test.sql (A1
-- hardening fixtures) — talleres_equipo_de_grupo only ever reads the
-- cohorte's OWN dream_team_equipo_id (verified via pg_get_functiondef
-- before writing this), so this minimal chain is exact, not a guess.

INSERT INTO public.taller_plantilla_clases (id, taller_id, numero, tema) VALUES
  ('b2000000-0000-4000-8000-000000000030', 'b2000000-0000-4000-8000-000000000011', 1, 'ZZ CT Clase B1');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b2000000-0000-4000-8000-000000000050', 'workshop', 'active', 'ZZ CT Evento B', '2026-01-01', 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot) VALUES
  ('b2000000-0000-4000-8000-000000000051', 'b2000000-0000-4000-8000-000000000050', 'b2000000-0000-4000-8000-000000000011', 'individual', 'permanente_custom', 'borrador', 'ZZ CT Edicion B', 1, 60, 'permanente_custom');

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion) VALUES
  ('b2000000-0000-4000-8000-000000000052', 'b2000000-0000-4000-8000-000000000051', 'b2000000-0000-4000-8000-000000000002', 'ZZ CT Cohorte B');

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('b2000000-0000-4000-8000-000000000053', 'b2000000-0000-4000-8000-000000000052', 'ZZ CT Grupo B', 'activo', 10);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('b2000000-0000-4000-8000-000000000054', 'b2000000-0000-4000-8000-000000000053', 1, DATE '2026-01-05', 'programada');

-- ── director (scoped to A ONLY) attempts each RPC against B's objects ──

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b2000000-0000-4000-8000-000000000020');

-- (a) talleres_editar_grupo
SELECT pg_temp.assert_sqlstate_msg('(a) talleres_editar_grupo on taller B''s grupo is refused',
  $$SELECT public.talleres_editar_grupo('b2000000-0000-4000-8000-000000000053', 'Hackeado', 1)$$,
  '42501', 'sin_permisos_para_este_taller');

-- (b) talleres_editar_clase
SELECT pg_temp.assert_sqlstate_msg('(b) talleres_editar_clase on taller B''s sesion is refused',
  $$SELECT public.talleres_editar_clase('b2000000-0000-4000-8000-000000000054', 'Hackeado', NULL)$$,
  '42501', 'sin_permisos_para_este_taller');

-- (c) talleres_mover_plantilla_clase
SELECT pg_temp.assert_sqlstate_msg('(c) talleres_mover_plantilla_clase on taller B''s plantilla clase is refused',
  $$SELECT public.talleres_mover_plantilla_clase('b2000000-0000-4000-8000-000000000030', 'arriba')$$,
  '42501', 'sin_permisos_para_este_taller');

-- (d) talleres_servidores_del_taller
SELECT pg_temp.assert_sqlstate_msg('(d) talleres_servidores_del_taller(B) is refused',
  $$SELECT * FROM public.talleres_servidores_del_taller('b2000000-0000-4000-8000-000000000011')$$,
  '42501', 'sin_permisos_para_este_taller');

-- Checked as postgres, same convention as talleres-instanciar-edicion.
-- test.sql's (i): the director has zero read visibility into taller B's
-- node (by fixture design, to prove the refusal), so re-checking as the
-- director would test their OWN SELECT visibility, not whether the
-- refused RPC actually mutated anything. These are DB-state checks.
RESET ROLE;

SELECT pg_temp.assert_rows('(a) taller B''s grupo is untouched',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'b2000000-0000-4000-8000-000000000053' AND nombre = 'ZZ CT Grupo B' AND capacidad = 10$$, 1);
SELECT pg_temp.assert_rows('(b) taller B''s sesion is untouched',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE id = 'b2000000-0000-4000-8000-000000000054' AND fecha_programada = DATE '2026-01-05'
       AND (tema IS NULL OR tema <> 'Hackeado')$$, 1);
SELECT pg_temp.assert_rows('(c) taller B''s plantilla clase numero is untouched',
  $$SELECT 1 FROM public.taller_plantilla_clases
     WHERE id = 'b2000000-0000-4000-8000-000000000030' AND numero = 1$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
