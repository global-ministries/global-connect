-- L2 (odd/tasks/talleres-limpieza.md, backlog TB-27) — RED→GREEN for
-- migration 20261003170000_talleres_disparadores_y_sobre_cupo.sql:
--   a. taller_grupos_capture_recursos_snapshot runs when a grupo's estado
--      changes to completado (its pg_trigger_depth() < 1 guard was never
--      true inside a trigger, so it never ran), keeps the first snapshot
--      and the first completed_at, and agrees with talleres_cerrar_edicion,
--      which sets completed_at itself.
--   b. taller_reportes_capture_correccion loses the same dead guard and
--      keeps its behavior: one correction row per estado change, none for
--      other edits, author and motivo as before (the close relies on it).
--   c. talleres_inscripciones_sobre_cupo_personas gains the companero read
--      branch that 20261003140000 added to taller_inscripciones_select.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own bd000000-... namespace. For the
-- GREEN run, paste the migration right after this file's BEGIN.
--
-- Every assertion runs through a pg_temp helper that records failures
-- instead of aborting, so the RED run (migration NOT applied) reaches
-- pg_temp.report() and lists every failing case.
--
-- Nodes: dirección D (bd…01) > taller node (bd…02).
--
-- Identities:
--   director   (auth bd…20, usuario bd…21) — director.write/read on D.
--   principal  (auth bd…b1, usuario bd…31) and companero (auth bd…b2,
--              usuario bd…32): the couple I1, placed over the cupo by the
--              director.
--   tercero    (auth bd…b3, usuario bd…33): own inscription I2.
--   Servidores of the taller node (usuarios only): lider bd…34,
--   voluntario bd…35, voluntario bd…36 (assignment inactive).
--
-- Fixture edición E1 (bd…90, en_curso), cohorte bd…a0:
--   G1 bd…40 activo: lider + voluntario active, a voluntario inactive;
--      clases 1 and 2 cerrada; I2 presente on 1, ausente on 2; reporte R3
--      borrador.
--   G2 bd…41 activo: I1 (sobre cupo); reporte R1 enviado.
--   G3 bd…42 activo: moved to cancelado by hand.
--   G4 bd…43 activo with completed_at preset to 2020-01-01; reporte R2
--      reabierto.
--
-- Acceptance criteria covered:
--   1. Structure: neither trigger function contains pg_trigger_depth;
--      both stay SECURITY INVOKER trigger functions; both triggers stay
--      attached; sobre_cupo_personas stays SECURITY DEFINER with
--      search_path=public, no PUBLIC or anon entry, executable by
--      authenticated.
--   2. G1 activo -> completado by hand: recursos_snapshot is the exact
--      snapshot (cohorte-wide inscripciones_count, presentes only) and
--      completed_at = now().
--   3. G3 activo -> cancelado: no snapshot, no completed_at.
--   4. Idempotent: G1 reopened, an assignment deactivated, completed_at
--      set by hand, completed again: snapshot and completed_at unchanged.
--   5. talleres_cerrar_edicion: contract count grupos_completados = 2 (G2,
--      G4); G2 gets its snapshot and completed_at; G4 keeps its preset
--      completed_at and gets its snapshot.
--   6. Report corrections: an edit that keeps estado writes none; borrador
--      -> enviado writes one (motivo transition, author firma_lider); the
--      close writes one per closed report (enviado: transition + firma;
--      reabierto: reabierto_motivo + reabierto_por).
--   7. sobre_cupo_personas: the companero reads I1's sobre-cupo name, the
--      principal still does, the tercero does not, anon gets 42501.
--
-- The MCP connection is `postgres` (BYPASSRLS) — every authority
-- assertion runs under SET LOCAL ROLE authenticated/anon + jwt claims;
-- data assertions run as postgres.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dsc_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_dsc_failures TO authenticated, anon;

CREATE TEMP TABLE t_dsc_result (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_dsc_result TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dsc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs p_sql (one jsonb value) and keeps it under p_key for later asserts.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_dsc_result (key, j) VALUES (p_key, v);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_dsc_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RETURN 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- postgres' default privileges no longer give PUBLIC EXECUTE on the
-- functions it creates, temp ones included: the helpers called under
-- SET LOCAL ROLE need an explicit grant.
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_sqlstate(text, text, text),
  pg_temp.assert_rows(text, text, int), pg_temp.assert_no_error(text, text),
  pg_temp.capture(text, text, text), pg_temp.as_persona(uuid)
  TO authenticated, anon;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('bd000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ DSC Direccion', NULL, true),
  ('bd000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ DSC Nodo Taller', 'bd000000-0000-4000-8000-000000000001', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('bd000000-0000-4000-8000-000000000011', 'bd000000-0000-4000-8000-000000000002', 'Líder',      true),
  ('bd000000-0000-4000-8000-000000000012', 'bd000000-0000-4000-8000-000000000002', 'Voluntario', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('bd000000-0000-4000-8000-000000000010', 'zz-dsc-taller', 'ZZ DSC Taller', 'bd000000-0000-4000-8000-000000000002', 'pareja', NULL, 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('bd000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'dsc-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bd000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'dsc-principal@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bd000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'dsc-companero@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('bd000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'dsc-tercero@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('bd000000-0000-4000-8000-000000000021', 'bd000000-0000-4000-8000-000000000020', 'ZZDSC', 'Director', 'dsc-director@example.test', 'Soltero', 'Otro'),
  ('bd000000-0000-4000-8000-000000000031', 'bd000000-0000-4000-8000-0000000000b1', 'ZZDSC', 'Principal', 'dsc-principal@example.test', 'Casado', 'Otro'),
  ('bd000000-0000-4000-8000-000000000032', 'bd000000-0000-4000-8000-0000000000b2', 'ZZDSC', 'Companero', 'dsc-companero@example.test', 'Casado', 'Otro'),
  ('bd000000-0000-4000-8000-000000000033', 'bd000000-0000-4000-8000-0000000000b3', 'ZZDSC', 'Tercero', 'dsc-tercero@example.test', 'Soltero', 'Otro'),
  ('bd000000-0000-4000-8000-000000000034', NULL, 'ZZDSC', 'Lider', NULL, 'Soltero', 'Otro'),
  ('bd000000-0000-4000-8000-000000000035', NULL, 'ZZDSC', 'Voluntario', NULL, 'Soltero', 'Otro'),
  ('bd000000-0000-4000-8000-000000000036', NULL, 'ZZDSC', 'VoluntarioInactivo', NULL, 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('bd000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'bd000000-0000-4000-8000-000000000001'),
  ('bd000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'bd000000-0000-4000-8000-000000000001');

-- Servidores of the taller node: taller_grupo_asignaciones only accepts
-- active servidores (trg_taller_grupo_asignaciones_servidor_activo).
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('bd000000-0000-4000-8000-0000000000c4', 'bd000000-0000-4000-8000-000000000034', 'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000011', 'activo'),
  ('bd000000-0000-4000-8000-0000000000c5', 'bd000000-0000-4000-8000-000000000035', 'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000012', 'activo'),
  ('bd000000-0000-4000-8000-0000000000c6', 'bd000000-0000-4000-8000-000000000036', 'bd000000-0000-4000-8000-000000000002', 'bd000000-0000-4000-8000-000000000012', 'activo');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('bd000000-0000-4000-8000-000000000080', 'workshop', 'active', 'ZZ DSC Evento E1', CURRENT_DATE - 30, 'talleres_crecimiento', '{}'::jsonb);

-- E1's dates derive en_curso, so talleres_cerrar_edicion accepts it.
INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin, firmantes
) VALUES
  ('bd000000-0000-4000-8000-000000000090', 'bd000000-0000-4000-8000-000000000080', 'bd000000-0000-4000-8000-000000000010',
   'pareja', NULL, 'permanente_custom', 'en_curso', 'ZZ DSC Edicion Uno', 2, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE + 30,
   '[{"persona_id":"bd000000-0000-4000-8000-000000000021","rol_etiqueta":"Director","orden":1}]'::jsonb);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('bd000000-0000-4000-8000-0000000000a0', 'bd000000-0000-4000-8000-000000000090', 'bd000000-0000-4000-8000-000000000002', 'ZZ DSC Cohorte E1', (CURRENT_DATE - 30)::timestamptz);

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado, completed_at) VALUES
  ('bd000000-0000-4000-8000-000000000040', 'bd000000-0000-4000-8000-0000000000a0', 'ZZ DSC Grupo 1', 10, 'activo', NULL),
  ('bd000000-0000-4000-8000-000000000041', 'bd000000-0000-4000-8000-0000000000a0', 'ZZ DSC Grupo 2', 10, 'activo', NULL),
  ('bd000000-0000-4000-8000-000000000042', 'bd000000-0000-4000-8000-0000000000a0', 'ZZ DSC Grupo 3', 10, 'activo', NULL),
  ('bd000000-0000-4000-8000-000000000043', 'bd000000-0000-4000-8000-0000000000a0', 'ZZ DSC Grupo 4', 10, 'activo', '2020-01-01 00:00:00+00');

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('bd000000-0000-4000-8000-0000000000d4', 'bd000000-0000-4000-8000-000000000040', 'bd000000-0000-4000-8000-000000000034', 'lider', true),
  ('bd000000-0000-4000-8000-0000000000d5', 'bd000000-0000-4000-8000-000000000040', 'bd000000-0000-4000-8000-000000000035', 'voluntario', true),
  ('bd000000-0000-4000-8000-0000000000d6', 'bd000000-0000-4000-8000-000000000040', 'bd000000-0000-4000-8000-000000000036', 'voluntario', false);

-- New clases must start programada and in sequence (taller_sesiones_
-- validate_insert); they are moved to cerrada right after.
INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('bd000000-0000-4000-8000-000000000050', 'bd000000-0000-4000-8000-000000000040', 1, CURRENT_DATE - 14, 'programada'),
  ('bd000000-0000-4000-8000-000000000051', 'bd000000-0000-4000-8000-000000000040', 2, CURRENT_DATE - 7,  'programada');
UPDATE public.taller_sesiones SET estado = 'cerrada'
 WHERE id IN ('bd000000-0000-4000-8000-000000000050', 'bd000000-0000-4000-8000-000000000051');

-- I1 carries sobre_cupo = true: trg_taller_inscripciones_cupo only takes
-- it with the flag talleres_inscribir_sobre_cupo sets, so the fixture sets
-- the same flag for this one insert and clears it right after.
SELECT set_config('talleres.sobre_cupo_autorizado', '1', true);
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado, unit_estado, grupo_id, sobre_cupo, sobre_cupo_por, sobre_cupo_en) VALUES
  ('bd000000-0000-4000-8000-000000000060', 'bd000000-0000-4000-8000-000000000090', 'bd000000-0000-4000-8000-0000000000a0', 'bd000000-0000-4000-8000-000000000031', 'bd000000-0000-4000-8000-000000000032', 'matrimonio', 'aprobado', NULL, 'bd000000-0000-4000-8000-000000000041', true, 'bd000000-0000-4000-8000-000000000021', now()),
  ('bd000000-0000-4000-8000-000000000061', 'bd000000-0000-4000-8000-000000000090', 'bd000000-0000-4000-8000-0000000000a0', 'bd000000-0000-4000-8000-000000000033', NULL, NULL, 'aprobado', NULL, 'bd000000-0000-4000-8000-000000000040', false, NULL, NULL);
SELECT set_config('talleres.sobre_cupo_autorizado', '', true);

INSERT INTO public.taller_asistencias (sesion_id, inscripcion_id, persona_id, estado) VALUES
  ('bd000000-0000-4000-8000-000000000050', 'bd000000-0000-4000-8000-000000000061', 'bd000000-0000-4000-8000-000000000033', 'presente'),
  ('bd000000-0000-4000-8000-000000000051', 'bd000000-0000-4000-8000-000000000061', 'bd000000-0000-4000-8000-000000000033', 'ausente');

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales, firma_lider_persona_id, firma_lider_fecha, reabierto_por_persona_id, reabierto_motivo) VALUES
  ('bd000000-0000-4000-8000-000000000070', 'bd000000-0000-4000-8000-000000000041', 'enviado',   'ZZ DSC reporte R1', 'bd000000-0000-4000-8000-000000000034', now(), NULL, NULL),
  ('bd000000-0000-4000-8000-000000000071', 'bd000000-0000-4000-8000-000000000043', 'reabierto', 'ZZ DSC reporte R2', 'bd000000-0000-4000-8000-000000000034', now(), 'bd000000-0000-4000-8000-000000000021', 'ZZ DSC corregir'),
  ('bd000000-0000-4000-8000-000000000072', 'bd000000-0000-4000-8000-000000000040', 'borrador',  'ZZ DSC reporte R3', NULL, NULL, NULL, NULL);

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: neither trigger function carries the pg_trigger_depth guard',
  $$SELECT 1 FROM pg_proc
     WHERE oid IN ('public.taller_grupos_capture_recursos_snapshot()'::regprocedure,
                   'public.taller_reportes_capture_correccion()'::regprocedure)
       AND position('pg_trigger_depth' in pg_get_functiondef(oid)) = 0$$, 2);
SELECT pg_temp.assert_rows('1: both stay SECURITY INVOKER trigger functions',
  $$SELECT 1 FROM pg_proc
     WHERE oid IN ('public.taller_grupos_capture_recursos_snapshot()'::regprocedure,
                   'public.taller_reportes_capture_correccion()'::regprocedure)
       AND NOT prosecdef AND prorettype = 'trigger'::regtype$$, 2);
SELECT pg_temp.assert_rows('1: both triggers stay attached',
  $$SELECT 1 FROM pg_trigger
     WHERE (tgname = 'trg_taller_grupos_capture_recursos_snapshot' AND tgrelid = 'public.taller_grupos'::regclass
            AND tgfoid = 'public.taller_grupos_capture_recursos_snapshot()'::regprocedure)
        OR (tgname = 'trg_taller_reportes_capture_correccion' AND tgrelid = 'public.taller_reportes'::regclass
            AND tgfoid = 'public.taller_reportes_capture_correccion()'::regprocedure)$$, 2);
SELECT pg_temp.assert_rows('1: sobre_cupo_personas stays SECURITY DEFINER with search_path=public',
  $$SELECT 1 FROM pg_proc
     WHERE oid = 'public.talleres_inscripciones_sobre_cupo_personas(uuid[])'::regprocedure
       AND prosecdef AND proconfig = ARRAY['search_path=public']$$, 1);
SELECT pg_temp.assert_rows('1: sobre_cupo_personas: no PUBLIC entry, anon cannot execute, authenticated can',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.talleres_inscripciones_sobre_cupo_personas(uuid[])'::regprocedure
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0)
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND has_function_privilege('authenticated', p.oid, 'execute')$$, 1);

-- ══ 2. G1 activo -> completado by hand ══

UPDATE public.taller_grupos SET estado = 'completado' WHERE id = 'bd000000-0000-4000-8000-000000000040';

SELECT pg_temp.assert_rows('2: G1 gets the snapshot (1 lider, 1 voluntario active, 2 cohorte inscripciones, 1 presente)',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000040'
       AND recursos_snapshot = '{"leaders_activos": 1, "voluntarios_activos": 1, "inscripciones_count": 2, "asistencia_total": 1}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('2: G1 completed_at = now()',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000040' AND completed_at = now()$$, 1);

-- ══ 3. G3 activo -> cancelado ══

UPDATE public.taller_grupos SET estado = 'cancelado' WHERE id = 'bd000000-0000-4000-8000-000000000042';

SELECT pg_temp.assert_rows('3: a cancelado grupo gets no snapshot and no completed_at',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000042'
       AND recursos_snapshot IS NULL AND completed_at IS NULL$$, 1);

-- ══ 4. Idempotent: the first snapshot and completed_at stay ══

UPDATE public.taller_grupos SET estado = 'activo' WHERE id = 'bd000000-0000-4000-8000-000000000040';
UPDATE public.taller_grupo_asignaciones SET activo = false WHERE id = 'bd000000-0000-4000-8000-0000000000d4';
UPDATE public.taller_grupos SET completed_at = '2021-06-01 00:00:00+00' WHERE id = 'bd000000-0000-4000-8000-000000000040';
UPDATE public.taller_grupos SET estado = 'completado' WHERE id = 'bd000000-0000-4000-8000-000000000040';

SELECT pg_temp.assert_rows('4: completing G1 again keeps the first snapshot (lider still counted)',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000040'
       AND recursos_snapshot = '{"leaders_activos": 1, "voluntarios_activos": 1, "inscripciones_count": 2, "asistencia_total": 1}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('4: completing G1 again keeps its completed_at',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000040' AND completed_at = '2021-06-01 00:00:00+00'$$, 1);

-- ══ 6 (before the close). Report corrections on direct edits ══

SELECT pg_temp.assert_no_error('6: an edit that keeps estado passes',
  $$UPDATE public.taller_reportes SET observaciones_generales = 'ZZ DSC reporte R3 editado'
     WHERE id = 'bd000000-0000-4000-8000-000000000072'$$);
SELECT pg_temp.assert_rows('6: an edit that keeps estado writes no correction',
  $$SELECT 1 FROM public.taller_reporte_correcciones WHERE reporte_id = 'bd000000-0000-4000-8000-000000000072'$$, 0);

SELECT pg_temp.assert_no_error('6: borrador -> enviado with firma passes',
  $$UPDATE public.taller_reportes
       SET estado = 'enviado', firma_lider_persona_id = 'bd000000-0000-4000-8000-000000000034', firma_lider_fecha = now()
     WHERE id = 'bd000000-0000-4000-8000-000000000072'$$);
SELECT pg_temp.assert_rows('6: borrador -> enviado writes one correction (transition, author firma_lider, both snapshots)',
  $$SELECT 1 FROM public.taller_reporte_correcciones
     WHERE reporte_id = 'bd000000-0000-4000-8000-000000000072'
       AND motivo = 'transition'
       AND autor_persona_id = 'bd000000-0000-4000-8000-000000000034'
       AND contenido_anterior ->> 'estado' = 'borrador'
       AND contenido_nuevo ->> 'estado' = 'enviado'$$, 1);
SELECT pg_temp.assert_rows('6: and only that one',
  $$SELECT 1 FROM public.taller_reporte_correcciones WHERE reporte_id = 'bd000000-0000-4000-8000-000000000072'$$, 1);

-- ══ 5. The close ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bd000000-0000-4000-8000-000000000020');
SELECT pg_temp.capture('5: director closes E1', 'close',
  $$SELECT public.talleres_cerrar_edicion('bd000000-0000-4000-8000-000000000090')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('5: the close still counts the grupos it completed (G2, G4)',
  $$SELECT 1 FROM t_dsc_result WHERE key = 'close' AND (j ->> 'grupos_completados')::int = 2$$, 1);
SELECT pg_temp.assert_rows('5: G2 gets its snapshot and completed_at',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000041'
       AND estado = 'completado'
       AND recursos_snapshot = '{"leaders_activos": 0, "voluntarios_activos": 0, "inscripciones_count": 2, "asistencia_total": 0}'::jsonb
       AND completed_at = now()$$, 1);
SELECT pg_temp.assert_rows('5: G4 keeps its preset completed_at and gets its snapshot',
  $$SELECT 1 FROM public.taller_grupos
     WHERE id = 'bd000000-0000-4000-8000-000000000043'
       AND estado = 'completado'
       AND recursos_snapshot IS NOT NULL
       AND completed_at = '2020-01-01 00:00:00+00'$$, 1);
SELECT pg_temp.assert_rows('5: G1 (already completado) and G3 (cancelado) are untouched by the close',
  $$SELECT 1 FROM public.taller_grupos
     WHERE (id = 'bd000000-0000-4000-8000-000000000040' AND completed_at = '2021-06-01 00:00:00+00')
        OR (id = 'bd000000-0000-4000-8000-000000000042' AND estado = 'cancelado' AND recursos_snapshot IS NULL)$$, 2);

SELECT pg_temp.assert_rows('6: the close writes R1''s correction (enviado -> cerrado, transition, author firma_lider)',
  $$SELECT 1 FROM public.taller_reporte_correcciones
     WHERE reporte_id = 'bd000000-0000-4000-8000-000000000070'
       AND motivo = 'transition'
       AND autor_persona_id = 'bd000000-0000-4000-8000-000000000034'
       AND contenido_anterior ->> 'estado' = 'enviado'
       AND contenido_nuevo ->> 'estado' = 'cerrado'$$, 1);
SELECT pg_temp.assert_rows('6: the close writes R2''s correction (reabierto -> cerrado, reabierto_motivo, author reabierto_por)',
  $$SELECT 1 FROM public.taller_reporte_correcciones
     WHERE reporte_id = 'bd000000-0000-4000-8000-000000000071'
       AND motivo = 'ZZ DSC corregir'
       AND autor_persona_id = 'bd000000-0000-4000-8000-000000000021'
       AND contenido_anterior ->> 'estado' = 'reabierto'
       AND contenido_nuevo ->> 'estado' = 'cerrado'$$, 1);
SELECT pg_temp.assert_rows('6: one correction per estado change across R1, R2 and R3',
  $$SELECT 1 FROM public.taller_reporte_correcciones
     WHERE reporte_id IN ('bd000000-0000-4000-8000-000000000070', 'bd000000-0000-4000-8000-000000000071',
                          'bd000000-0000-4000-8000-000000000072')$$, 4);

-- ══ 7. sobre_cupo_personas: the companero branch ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('bd000000-0000-4000-8000-0000000000b2');
SELECT pg_temp.assert_rows('7: the companero reads who placed the couple over the cupo',
  $$SELECT 1 FROM public.talleres_inscripciones_sobre_cupo_personas(ARRAY['bd000000-0000-4000-8000-000000000060']::uuid[])
     WHERE inscripcion_id = 'bd000000-0000-4000-8000-000000000060'
       AND sobre_cupo_por_nombre = 'ZZDSC' AND sobre_cupo_por_apellido = 'Director'
       AND sobre_cupo_en IS NOT NULL$$, 1);
SELECT pg_temp.as_persona('bd000000-0000-4000-8000-0000000000b1');
SELECT pg_temp.assert_rows('7: the principal still does',
  $$SELECT 1 FROM public.talleres_inscripciones_sobre_cupo_personas(ARRAY['bd000000-0000-4000-8000-000000000060']::uuid[])$$, 1);
SELECT pg_temp.as_persona('bd000000-0000-4000-8000-0000000000b3');
SELECT pg_temp.assert_rows('7: a third participant (other grupo) still does not',
  $$SELECT 1 FROM public.talleres_inscripciones_sobre_cupo_personas(ARRAY['bd000000-0000-4000-8000-000000000060']::uuid[])$$, 0);
RESET ROLE;

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_sqlstate('7: anon cannot execute sobre_cupo_personas',
  $$SELECT * FROM public.talleres_inscripciones_sobre_cupo_personas(ARRAY['bd000000-0000-4000-8000-000000000060']::uuid[])$$, '42501');
RESET ROLE;

-- report() runs as postgres: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
