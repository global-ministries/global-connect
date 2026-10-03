-- T1 (odd/tasks/talleres-cierre-de-edicion.md) — RED→GREEN for the
-- edición close base: talleres.clases_minimas_para_completar,
-- taller_ediciones.cerrada_en/cerrada_por, talleres_estado_efectivo
-- honoring cerrada_en, talleres_previsualizar_cierre and
-- talleres_cerrar_edicion (migration
-- 20261003140000_talleres_cierre_de_edicion.sql). Run against STAGING
-- inside BEGIN…ROLLBACK — nothing here is kept; every fixture id lives
-- under this file's own ba000000-... namespace.
--
-- Every reference to an object the migration adds goes through dynamic
-- SQL inside a pg_temp assertion, so the RED run (migration NOT applied)
-- reaches pg_temp.report() and lists every failing case instead of
-- aborting on the first missing column.
--
-- Nodes: dirección D (ba…01) > taller node (ba…02); other dirección
-- (ba…03), unrelated.
--
-- Identities:
--   director      (auth ba…20, usuario ba…21) — director.write/read scoped
--                 on D (an ancestor of the taller's node).
--   coordinador   (auth ba…22, usuario ba…23) — coordinator.write/read on
--                 D, nothing else.
--   miembro       (auth ba…24, usuario ba…25) — zero capabilities.
--   director otro (auth ba…26, usuario ba…27) — director.write/read on the
--                 other dirección only.
--   admin         (auth ba…28, usuario ba…29) — admin.manage on the
--                 taller's node.
--   Inscritos (usuarios only): ba…31 (+ pareja ba…32), 33, 34, 35, 36, 37,
--   38, 39, 3a; ba…3b (+ pareja ba…3c) on E2. ba…31, 32 and 33 also log
--   in (auth ba…b1, b2, b3) for the companero read branch (criterion 10).
--
-- Fixture edición E1 (ba…90, en_curso, dates make it derive en_curso):
--   Grupo A (ba…40): clases 1-3 cerrada, 4 en_curso, 5 programada.
--   Grupo B (ba…41): clase 1 cerrada, 2 en_curso, 3 programada.
--   Grupo C (ba…42): activo, no clases. Grupo D (ba…43): cancelado.
--   Inscripciones (aprobado unless noted):
--     I1 ba…60 A 4/4 (with pareja)    I5 ba…64 B 2/2
--     I2 ba…61 A 3/4 (+ a presente on the programada clase 5)
--     I3 ba…62 A 0/4                  I6 ba…65 B 1/2
--     I4 ba…63 A 1/4                  I7 ba…66 no grupo
--     I8 ba…67 A pendiente            I9 ba…68 A retirado (unit_estado set)
--   Reportes: A enviado, B borrador, C reabierto.
-- Fixture edición E2 (ba…91, borrador) with grupo ba…44 and a programada
-- clase, and a completado couple inscription I10 (ba…69) for
-- emit_taller_certificado.
--
-- Acceptance criteria covered:
--   1. Structure: new columns, CHECK >= 1, both RPCs SECURITY DEFINER with
--      a pinned search_path, anon cannot execute any new function, the
--      internal helper is not executable by authenticated.
--   2. Authority: coordinador, miembro and director otro get 42501 on both
--      RPCs; anon gets 42501 on both; admin.manage on the node may preview.
--   3. Rule with clases_minimas NULL (= every held class): 4/4 completado,
--      3/4 no_completado, 0 present abandono, no grupo abandono; a presente
--      on a programada class does not count; non-aprobado rows absent.
--   4. Rule with clases_minimas = 3: 3 of 4 completado; B's minimo capped
--      to its 2 held classes.
--   5. Close returns the exact contract JSON; unit_estado written for
--      aprobado only (pendiente/retirado untouched); preview and close
--      agree on every row, and the preview recomputed after the close is
--      identical.
--   6. Certificates only for completado, one per PERSON: a couple gets two
--      (distinct codes, each names the other in nombre_pareja_snapshot),
--      an individual one (nombre_pareja_snapshot NULL); 16 chars of the
--      app alphabet; snapshots like emit_taller_certificado.
--   7. Cascade: programada -> cancelada, en_curso -> cerrada; grupos activo
--      -> completado (cancelado stays); cohorte ended_at; reportes enviado/
--      reabierto -> cerrado, borrador stays and is counted.
--   8. Edición cerrado with cerrada_en/cerrada_por; second close ->
--      EDICION_YA_CERRADA; talleres_refrescar_estados does not revert it;
--      talleres_estado_efectivo (both overloads) says cerrado although its
--      dates derive en_curso.
--   9. Borrador and cancelado ediciones -> EDICION_NO_CERRABLE, untouched;
--      unknown edición -> 42501.
--  10. taller_inscripciones_select: the companero reads the couple's
--      inscription, the principal still does, a third participant does not.
--  11. cerrada_en / cerrada_por: a director's direct UPDATE (set before the
--      close, clear or change after it) and an INSERT carrying them are
--      refused with P0001 EDICION_CIERRE_SOLO_POR_RPC; unrelated edits and
--      a same-value UPDATE pass; the close RPC still sets them (8).
--  12. emit_taller_certificado on a couple: returns the principal's
--      {ok, created, certificado_id, codigo_verificacion, inscripcion_id}
--      plus certificados[2], creates both certificates; a second call is
--      idempotent (same code, created=false, no new rows).
--  13. anon reads nombre_pareja_snapshot of a non-revoked certificate
--      (filtering only on columns production grants to anon), and the
--      column-level SELECT grant exists for anon and authenticated.
--
-- The MCP connection is `postgres` (BYPASSRLS) — every authority
-- assertion runs under SET LOCAL ROLE authenticated/anon + jwt claims;
-- data assertions run as postgres.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ci_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ci_failures TO authenticated, anon;

CREATE TEMP TABLE t_ci_result (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ci_result TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ci_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs p_update_sql (one UPDATE) and expects exactly p_expected rows.
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

-- Runs p_sql (one jsonb value) and keeps it under p_key for later asserts.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_ci_result (key, j) VALUES (p_key, v);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ci_failures;
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('ba000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CIE Direccion', NULL, true),
  ('ba000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CIE Nodo Taller', 'ba000000-0000-4000-8000-000000000001', true),
  ('ba000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ CIE Otra Direccion', NULL, true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('ba000000-0000-4000-8000-000000000010', 'zz-cie-taller', 'ZZ CIE Taller', 'ba000000-0000-4000-8000-000000000002', 'pareja', NULL, 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ba000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'cie-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'cie-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'cie-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'cie-director-otro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'cie-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'cie-uno@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'cie-uno-pareja@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('ba000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'cie-dos@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('ba000000-0000-4000-8000-000000000021', 'ba000000-0000-4000-8000-000000000020', 'ZZCIE', 'Director', 'cie-director@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000023', 'ba000000-0000-4000-8000-000000000022', 'ZZCIE', 'Coordinador', 'cie-coordinador@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000025', 'ba000000-0000-4000-8000-000000000024', 'ZZCIE', 'Miembro', 'cie-miembro@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000027', 'ba000000-0000-4000-8000-000000000026', 'ZZCIE', 'DirectorOtro', 'cie-director-otro@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000029', 'ba000000-0000-4000-8000-000000000028', 'ZZCIE', 'Admin', 'cie-admin@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000031', 'ba000000-0000-4000-8000-0000000000b1', 'ZZCIE', 'Uno', 'cie-uno@example.test', 'Casado', 'Otro'),
  ('ba000000-0000-4000-8000-000000000032', 'ba000000-0000-4000-8000-0000000000b2', 'ZZCIE', 'UnoPareja', 'cie-uno-pareja@example.test', 'Casado', 'Otro'),
  ('ba000000-0000-4000-8000-000000000033', 'ba000000-0000-4000-8000-0000000000b3', 'ZZCIE', 'Dos', 'cie-dos@example.test', 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000034', NULL, 'ZZCIE', 'Tres', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000035', NULL, 'ZZCIE', 'Cuatro', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000036', NULL, 'ZZCIE', 'Cinco', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000037', NULL, 'ZZCIE', 'Seis', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000038', NULL, 'ZZCIE', 'Siete', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-000000000039', NULL, 'ZZCIE', 'Ocho', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-00000000003a', NULL, 'ZZCIE', 'Nueve', NULL, 'Soltero', 'Otro'),
  ('ba000000-0000-4000-8000-00000000003b', NULL, 'ZZCIE', 'Diez', NULL, 'Casado', 'Otro'),
  ('ba000000-0000-4000-8000-00000000003c', NULL, 'ZZCIE', 'DiezPareja', NULL, 'Casado', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('ba000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.read',  'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000001'),
  ('ba000000-0000-4000-8000-000000000027', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000003'),
  ('ba000000-0000-4000-8000-000000000027', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000003'),
  ('ba000000-0000-4000-8000-000000000029', 'talleres_crecimiento.admin.manage',   'talleres_crecimiento', 'taller', 'ba000000-0000-4000-8000-000000000002');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('ba000000-0000-4000-8000-000000000080', 'workshop', 'active', 'ZZ CIE Evento E1', CURRENT_DATE - 30, 'talleres_crecimiento', '{}'::jsonb),
  ('ba000000-0000-4000-8000-000000000081', 'workshop', 'active', 'ZZ CIE Evento E2', CURRENT_DATE - 30, 'talleres_crecimiento', '{}'::jsonb),
  ('ba000000-0000-4000-8000-000000000082', 'workshop', 'active', 'ZZ CIE Evento E3', CURRENT_DATE - 30, 'talleres_crecimiento', '{}'::jsonb);

-- E1's dates derive en_curso (inicio and cierre 30 days ago, fin in 30
-- days — a margin no time zone can cross), so only cerrada_en can make it
-- read cerrado after the close.
INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin, firmantes
) VALUES
  ('ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-000000000080', 'ba000000-0000-4000-8000-000000000010',
   'pareja', NULL, 'permanente_custom', 'en_curso', 'ZZ CIE Edicion Uno', 5, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE + 30,
   '[{"persona_id":"ba000000-0000-4000-8000-000000000021","rol_etiqueta":"Director","orden":1}]'::jsonb),
  ('ba000000-0000-4000-8000-000000000091', 'ba000000-0000-4000-8000-000000000081', 'ba000000-0000-4000-8000-000000000010',
   'pareja', NULL, 'permanente_custom', 'borrador', 'ZZ CIE Edicion Dos', 1, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE + 30, '[]'::jsonb);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-000000000002', 'ZZ CIE Cohorte E1', (CURRENT_DATE - 30)::timestamptz),
  ('ba000000-0000-4000-8000-0000000000a1', 'ba000000-0000-4000-8000-000000000091', 'ba000000-0000-4000-8000-000000000002', 'ZZ CIE Cohorte E2', (CURRENT_DATE - 30)::timestamptz);

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('ba000000-0000-4000-8000-000000000040', 'ba000000-0000-4000-8000-0000000000a0', 'ZZ CIE Grupo A', 10, 'activo'),
  ('ba000000-0000-4000-8000-000000000041', 'ba000000-0000-4000-8000-0000000000a0', 'ZZ CIE Grupo B', 10, 'activo'),
  ('ba000000-0000-4000-8000-000000000042', 'ba000000-0000-4000-8000-0000000000a0', 'ZZ CIE Grupo C', 10, 'activo'),
  ('ba000000-0000-4000-8000-000000000043', 'ba000000-0000-4000-8000-0000000000a0', 'ZZ CIE Grupo D', 10, 'cancelado'),
  ('ba000000-0000-4000-8000-000000000044', 'ba000000-0000-4000-8000-0000000000a1', 'ZZ CIE Grupo E2', 10, 'activo');

-- New clases must start programada and in sequence (taller_sesiones_
-- validate_insert); the held ones are moved right after.
INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000040', 1, CURRENT_DATE - 28, 'programada'),
  ('ba000000-0000-4000-8000-000000000051', 'ba000000-0000-4000-8000-000000000040', 2, CURRENT_DATE - 21, 'programada'),
  ('ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000040', 3, CURRENT_DATE - 14, 'programada'),
  ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000040', 4, CURRENT_DATE - 7,  'programada'),
  ('ba000000-0000-4000-8000-000000000054', 'ba000000-0000-4000-8000-000000000040', 5, CURRENT_DATE + 7,  'programada'),
  ('ba000000-0000-4000-8000-000000000055', 'ba000000-0000-4000-8000-000000000041', 1, CURRENT_DATE - 14, 'programada'),
  ('ba000000-0000-4000-8000-000000000056', 'ba000000-0000-4000-8000-000000000041', 2, CURRENT_DATE - 7,  'programada'),
  ('ba000000-0000-4000-8000-000000000057', 'ba000000-0000-4000-8000-000000000041', 3, CURRENT_DATE + 7,  'programada'),
  ('ba000000-0000-4000-8000-000000000058', 'ba000000-0000-4000-8000-000000000044', 1, CURRENT_DATE + 7,  'programada');

UPDATE public.taller_sesiones SET estado = 'cerrada'
 WHERE id IN ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000051',
              'ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000055');
UPDATE public.taller_sesiones SET estado = 'en_curso'
 WHERE id IN ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000056');

-- taller_inscripciones.taller_id references taller_ediciones(id).
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado, unit_estado, grupo_id) VALUES
  ('ba000000-0000-4000-8000-000000000060', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000031', 'ba000000-0000-4000-8000-000000000032', 'matrimonio', 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000040'),
  ('ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000033', NULL, NULL, 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000040'),
  ('ba000000-0000-4000-8000-000000000062', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000034', NULL, NULL, 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000040'),
  ('ba000000-0000-4000-8000-000000000063', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000035', NULL, NULL, 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000040'),
  ('ba000000-0000-4000-8000-000000000064', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000036', NULL, NULL, 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000041'),
  ('ba000000-0000-4000-8000-000000000065', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000037', NULL, NULL, 'aprobado', NULL, 'ba000000-0000-4000-8000-000000000041'),
  ('ba000000-0000-4000-8000-000000000066', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000038', NULL, NULL, 'aprobado', NULL, NULL),
  ('ba000000-0000-4000-8000-000000000067', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-000000000039', NULL, NULL, 'pendiente', NULL, 'ba000000-0000-4000-8000-000000000040'),
  ('ba000000-0000-4000-8000-000000000068', 'ba000000-0000-4000-8000-000000000090', 'ba000000-0000-4000-8000-0000000000a0', 'ba000000-0000-4000-8000-00000000003a', NULL, NULL, 'retirado', 'no_completado', 'ba000000-0000-4000-8000-000000000040'),
  -- I10 on E2: a completado couple for emit_taller_certificado (criterion 12).
  ('ba000000-0000-4000-8000-000000000069', 'ba000000-0000-4000-8000-000000000091', 'ba000000-0000-4000-8000-0000000000a1', 'ba000000-0000-4000-8000-00000000003b', 'ba000000-0000-4000-8000-00000000003c', 'matrimonio', 'aprobado', 'completado', 'ba000000-0000-4000-8000-000000000044');

INSERT INTO public.taller_asistencias (sesion_id, inscripcion_id, persona_id, estado) VALUES
  -- I1: 4/4
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000060', 'ba000000-0000-4000-8000-000000000031', 'presente'),
  ('ba000000-0000-4000-8000-000000000051', 'ba000000-0000-4000-8000-000000000060', 'ba000000-0000-4000-8000-000000000031', 'presente'),
  ('ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000060', 'ba000000-0000-4000-8000-000000000031', 'presente'),
  ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000060', 'ba000000-0000-4000-8000-000000000031', 'presente'),
  -- I2: 3/4, plus a presente on the programada clase 5 that must not count
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000033', 'presente'),
  ('ba000000-0000-4000-8000-000000000051', 'ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000033', 'presente'),
  ('ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000033', 'presente'),
  ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000033', 'ausente'),
  ('ba000000-0000-4000-8000-000000000054', 'ba000000-0000-4000-8000-000000000061', 'ba000000-0000-4000-8000-000000000033', 'presente'),
  -- I3: 0/4
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000062', 'ba000000-0000-4000-8000-000000000034', 'ausente'),
  ('ba000000-0000-4000-8000-000000000051', 'ba000000-0000-4000-8000-000000000062', 'ba000000-0000-4000-8000-000000000034', 'ausente'),
  ('ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000062', 'ba000000-0000-4000-8000-000000000034', 'no_aplica'),
  ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000062', 'ba000000-0000-4000-8000-000000000034', 'ausente'),
  -- I4: 1/4
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000063', 'ba000000-0000-4000-8000-000000000035', 'presente'),
  ('ba000000-0000-4000-8000-000000000051', 'ba000000-0000-4000-8000-000000000063', 'ba000000-0000-4000-8000-000000000035', 'ausente'),
  ('ba000000-0000-4000-8000-000000000052', 'ba000000-0000-4000-8000-000000000063', 'ba000000-0000-4000-8000-000000000035', 'no_aplica'),
  ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000063', 'ba000000-0000-4000-8000-000000000035', 'ausente'),
  -- I5: 2/2
  ('ba000000-0000-4000-8000-000000000055', 'ba000000-0000-4000-8000-000000000064', 'ba000000-0000-4000-8000-000000000036', 'presente'),
  ('ba000000-0000-4000-8000-000000000056', 'ba000000-0000-4000-8000-000000000064', 'ba000000-0000-4000-8000-000000000036', 'presente'),
  -- I6: 1/2
  ('ba000000-0000-4000-8000-000000000055', 'ba000000-0000-4000-8000-000000000065', 'ba000000-0000-4000-8000-000000000037', 'presente'),
  ('ba000000-0000-4000-8000-000000000056', 'ba000000-0000-4000-8000-000000000065', 'ba000000-0000-4000-8000-000000000037', 'ausente'),
  -- I8 (pendiente) has a presente: still not evaluated
  ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000067', 'ba000000-0000-4000-8000-000000000039', 'presente');

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales, firma_lider_persona_id, firma_lider_fecha, reabierto_por_persona_id, reabierto_motivo) VALUES
  ('ba000000-0000-4000-8000-000000000070', 'ba000000-0000-4000-8000-000000000040', 'enviado',   'ZZ CIE reporte A', 'ba000000-0000-4000-8000-000000000021', now(), NULL, NULL),
  ('ba000000-0000-4000-8000-000000000071', 'ba000000-0000-4000-8000-000000000041', 'borrador',  'ZZ CIE reporte B', NULL, NULL, NULL, NULL),
  ('ba000000-0000-4000-8000-000000000072', 'ba000000-0000-4000-8000-000000000042', 'reabierto', 'ZZ CIE reporte C', 'ba000000-0000-4000-8000-000000000021', now(), 'ba000000-0000-4000-8000-000000000021', 'ZZ CIE corregir');

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: taller_ediciones.cerrada_en timestamptz and cerrada_por uuid exist',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taller_ediciones'
       AND ((column_name = 'cerrada_en' AND data_type = 'timestamp with time zone')
         OR (column_name = 'cerrada_por' AND data_type = 'uuid'))
       AND is_nullable = 'YES'$$, 2);
SELECT pg_temp.assert_rows('1: cerrada_por references usuarios(id)',
  $$SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.taller_ediciones'::regclass AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (cerrada_por) REFERENCES usuarios(id)%'$$, 1);
SELECT pg_temp.assert_no_error('1: clases_minimas_para_completar accepts NULL and 1',
  $$UPDATE public.talleres SET clases_minimas_para_completar = 1 WHERE id = 'ba000000-0000-4000-8000-000000000010';
    UPDATE public.talleres SET clases_minimas_para_completar = NULL WHERE id = 'ba000000-0000-4000-8000-000000000010'$$);
SELECT pg_temp.assert_sqlstate('1: clases_minimas_para_completar = 0 violates the CHECK',
  $$UPDATE public.talleres SET clases_minimas_para_completar = 0 WHERE id = 'ba000000-0000-4000-8000-000000000010'$$, '23514');
SELECT pg_temp.assert_rows('1: both RPCs are SECURITY DEFINER with search_path=public',
  $$SELECT 1 FROM pg_proc
     WHERE oid IN ('public.talleres_previsualizar_cierre(uuid)'::regprocedure, 'public.talleres_cerrar_edicion(uuid)'::regprocedure)
       AND prosecdef AND proconfig @> ARRAY['search_path=public']$$, 2);
SELECT pg_temp.assert_rows('1: anon cannot execute any of the new or redefined functions',
  $$SELECT 1 FROM unnest(ARRAY['public.talleres_previsualizar_cierre(uuid)', 'public.talleres_cerrar_edicion(uuid)',
                              'public.emit_taller_certificado(uuid,text)', 'public.talleres_cierre_resultados(uuid)',
                              'public.talleres_codigo_certificado()', 'public.talleres_certificado_firmantes(jsonb)',
                              'public.talleres_emitir_certificado_persona(uuid,uuid,uuid,text,text,text,jsonb,text)']) f
     WHERE NOT has_function_privilege('anon', f::regprocedure, 'execute')$$, 7);
SELECT pg_temp.assert_rows('1: authenticated executes the three RPCs but none of the four internal helpers',
  $$SELECT 1
     WHERE has_function_privilege('authenticated', 'public.talleres_previsualizar_cierre(uuid)'::regprocedure, 'execute')
       AND has_function_privilege('authenticated', 'public.talleres_cerrar_edicion(uuid)'::regprocedure, 'execute')
       AND has_function_privilege('authenticated', 'public.emit_taller_certificado(uuid,text)'::regprocedure, 'execute')
       AND NOT has_function_privilege('authenticated', 'public.talleres_cierre_resultados(uuid)'::regprocedure, 'execute')
       AND NOT has_function_privilege('authenticated', 'public.talleres_codigo_certificado()'::regprocedure, 'execute')
       AND NOT has_function_privilege('authenticated', 'public.talleres_certificado_firmantes(jsonb)'::regprocedure, 'execute')
       AND NOT has_function_privilege('authenticated', 'public.talleres_emitir_certificado_persona(uuid,uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute')$$, 1);
SELECT pg_temp.assert_rows('1: taller_certificados is unique per (inscripcion_id, persona_id), no longer per inscripcion_id',
  $$SELECT 1
     WHERE EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.taller_certificados'::regclass AND contype = 'u'
                      AND pg_get_constraintdef(oid) = 'UNIQUE (inscripcion_id, persona_id)')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'public.taller_certificados'::regclass AND contype = 'u'
                          AND pg_get_constraintdef(oid) = 'UNIQUE (inscripcion_id)')$$, 1);
SELECT pg_temp.assert_rows('1: taller_certificados.nombre_pareja_snapshot text NULL exists',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taller_certificados'
       AND column_name = 'nombre_pareja_snapshot' AND data_type = 'text' AND is_nullable = 'YES'$$, 1);
SELECT pg_temp.assert_rows('1: column-level SELECT on nombre_pareja_snapshot is granted to anon and authenticated',
  $$SELECT 1 FROM pg_attribute a, aclexplode(a.attacl) x
     WHERE a.attrelid = 'public.taller_certificados'::regclass
       AND a.attname = 'nombre_pareja_snapshot'
       AND x.privilege_type = 'SELECT'
       AND x.grantee IN ('anon'::regrole, 'authenticated'::regrole)$$, 2);

-- ══ 2. Authority ══

SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_sqlstate('2: coordinador-only cannot preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: coordinador-only cannot close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$, '42501');

SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000024');
SELECT pg_temp.assert_sqlstate('2: miembro cannot preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: miembro cannot close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$, '42501');

SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000026');
SELECT pg_temp.assert_sqlstate('2: director of another dirección cannot preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: director of another dirección cannot close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$, '42501');

SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000028');
SELECT pg_temp.assert_no_error('2: admin.manage on the taller node may preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$);

SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate('2: unknown edición reads as 42501 on preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-0000000000ff')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: unknown edición reads as 42501 on close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-0000000000ff')$$, '42501');

RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_sqlstate('2: anon cannot preview',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$, '42501');
SELECT pg_temp.assert_sqlstate('2: anon cannot close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$, '42501');
RESET ROLE;

-- ══ 3. Preview with clases_minimas NULL (= every held class) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.capture('3: director previews with clases_minimas NULL', 'preview_null',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('3: preview has exactly the contract keys',
  $$SELECT 1 FROM t_ci_result
     WHERE key = 'preview_null'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(j) k)
           = ARRAY['clases_minimas', 'clases_sin_dictar', 'filas', 'reportes_sin_enviar']$$, 1);
SELECT pg_temp.assert_rows('3: every fila has exactly the contract keys',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     WHERE r.key = 'preview_null'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(f) k)
           = ARRAY['clases_presente', 'clases_total', 'companero_nombre', 'grupo_nombre', 'inscripcion_id', 'minimo', 'persona_nombre', 'resultado']$$, 7);
SELECT pg_temp.assert_rows('3: clases_minimas null, 2 clases sin dictar, 1 reporte sin enviar',
  $$SELECT 1 FROM t_ci_result
     WHERE key = 'preview_null'
       AND j -> 'clases_minimas' = 'null'::jsonb
       AND (j ->> 'clases_sin_dictar')::int = 2
       AND (j ->> 'reportes_sin_enviar')::int = 1
       AND jsonb_array_length(j -> 'filas') = 7$$, 1);
SELECT pg_temp.assert_rows('3: rule with minimo = all held classes (presente/total/minimo/resultado)',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     WHERE r.key = 'preview_null'
       AND (f ->> 'inscripcion_id', (f ->> 'clases_presente')::int, (f ->> 'clases_total')::int, (f ->> 'minimo')::int, f ->> 'resultado') IN (
         VALUES ('ba000000-0000-4000-8000-000000000060', 4, 4, 4, 'completado'),
                ('ba000000-0000-4000-8000-000000000061', 3, 4, 4, 'no_completado'),
                ('ba000000-0000-4000-8000-000000000062', 0, 4, 4, 'abandono'),
                ('ba000000-0000-4000-8000-000000000063', 1, 4, 4, 'no_completado'),
                ('ba000000-0000-4000-8000-000000000064', 2, 2, 2, 'completado'),
                ('ba000000-0000-4000-8000-000000000065', 1, 2, 2, 'no_completado'),
                ('ba000000-0000-4000-8000-000000000066', 0, 0, 1, 'abandono'))$$, 7);
SELECT pg_temp.assert_rows('3: names: persona, pareja and grupo for I1; no grupo/pareja for I7',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     WHERE r.key = 'preview_null'
       AND ((f ->> 'inscripcion_id' = 'ba000000-0000-4000-8000-000000000060'
             AND f ->> 'persona_nombre' = 'ZZCIE Uno'
             AND f ->> 'companero_nombre' = 'ZZCIE UnoPareja'
             AND f ->> 'grupo_nombre' = 'ZZ CIE Grupo A')
         OR (f ->> 'inscripcion_id' = 'ba000000-0000-4000-8000-000000000066'
             AND f ->> 'persona_nombre' = 'ZZCIE Siete'
             AND f -> 'companero_nombre' = 'null'::jsonb
             AND f -> 'grupo_nombre' = 'null'::jsonb))$$, 2);
SELECT pg_temp.assert_rows('3: pendiente and retirado inscriptions are not in the preview',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     WHERE r.key = 'preview_null'
       AND f ->> 'inscripcion_id' IN ('ba000000-0000-4000-8000-000000000067', 'ba000000-0000-4000-8000-000000000068')$$, 0);

-- ══ 4. Preview with clases_minimas = 3 ══

SELECT pg_temp.assert_no_error('4: fixture — taller requires 3 clases',
  $$UPDATE public.talleres SET clases_minimas_para_completar = 3 WHERE id = 'ba000000-0000-4000-8000-000000000010'$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.capture('4: director previews with clases_minimas 3', 'preview_min3',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('4: clases_minimas = 3 is echoed',
  $$SELECT 1 FROM t_ci_result WHERE key = 'preview_min3' AND (j ->> 'clases_minimas')::int = 3$$, 1);
SELECT pg_temp.assert_rows('4: 3 of 4 completes; B''s minimo is capped to its 2 held classes',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     WHERE r.key = 'preview_min3'
       AND (f ->> 'inscripcion_id', (f ->> 'clases_presente')::int, (f ->> 'clases_total')::int, (f ->> 'minimo')::int, f ->> 'resultado') IN (
         VALUES ('ba000000-0000-4000-8000-000000000060', 4, 4, 3, 'completado'),
                ('ba000000-0000-4000-8000-000000000061', 3, 4, 3, 'completado'),
                ('ba000000-0000-4000-8000-000000000062', 0, 4, 3, 'abandono'),
                ('ba000000-0000-4000-8000-000000000063', 1, 4, 3, 'no_completado'),
                ('ba000000-0000-4000-8000-000000000064', 2, 2, 2, 'completado'),
                ('ba000000-0000-4000-8000-000000000065', 1, 2, 2, 'no_completado'),
                ('ba000000-0000-4000-8000-000000000066', 0, 0, 1, 'abandono'))$$, 7);
SELECT pg_temp.assert_rows('4: the preview wrote nothing',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'ba000000-0000-4000-8000-000000000090' AND unit_estado IS NOT NULL
       AND id <> 'ba000000-0000-4000-8000-000000000068'$$, 0);

-- ══ 11 (before the close). A director cannot close by hand ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate_msg('11: director cannot set cerrada_en directly (a close with no cascade)',
  $$UPDATE public.taller_ediciones SET cerrada_en = now(), cerrada_por = 'ba000000-0000-4000-8000-000000000021'
     WHERE id = 'ba000000-0000-4000-8000-000000000090'$$, 'P0001', 'EDICION_CIERRE_SOLO_POR_RPC');
SELECT pg_temp.assert_update_rows('11: an unrelated edit of the edición still passes',
  $$UPDATE public.taller_ediciones SET nombre_snapshot = 'ZZ CIE Edicion Uno'
     WHERE id = 'ba000000-0000-4000-8000-000000000090'$$, 1);
RESET ROLE;

SELECT pg_temp.assert_sqlstate_msg('11: an INSERT carrying cerrada_en is refused',
  $$INSERT INTO public.taller_ediciones (
      operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
      nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
      cerrada_en)
    VALUES ('ba000000-0000-4000-8000-000000000082', 'ba000000-0000-4000-8000-000000000010', 'pareja', NULL,
            'permanente_custom', 'cerrado', 'ZZ CIE Edicion Tres', 1, 60, 'permanente_custom', now())$$,
  'P0001', 'EDICION_CIERRE_SOLO_POR_RPC');

-- ══ 5. Close ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.capture('5: director closes E1', 'close',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$);
SELECT pg_temp.capture('5: director previews E1 again after the close', 'preview_after',
  $$SELECT public.talleres_previsualizar_cierre('ba000000-0000-4000-8000-000000000090')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('5: close returns exactly the contract JSON',
  $$SELECT 1 FROM t_ci_result
     WHERE key = 'close'
       AND j = '{"ok": true, "completados": 3, "no_completados": 2, "abandonos": 2,
                 "certificados_emitidos": 4, "clases_cerradas": 2, "clases_canceladas": 2,
                 "grupos_completados": 3, "reportes_cerrados": 2, "reportes_sin_enviar": 1}'::jsonb$$, 1);
SELECT pg_temp.assert_rows('5: unit_estado written for every aprobado inscription',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (id, unit_estado) IN (
       VALUES ('ba000000-0000-4000-8000-000000000060'::uuid, 'completado'),
              ('ba000000-0000-4000-8000-000000000061'::uuid, 'completado'),
              ('ba000000-0000-4000-8000-000000000062'::uuid, 'abandono'),
              ('ba000000-0000-4000-8000-000000000063'::uuid, 'no_completado'),
              ('ba000000-0000-4000-8000-000000000064'::uuid, 'completado'),
              ('ba000000-0000-4000-8000-000000000065'::uuid, 'no_completado'),
              ('ba000000-0000-4000-8000-000000000066'::uuid, 'abandono'))$$, 7);
SELECT pg_temp.assert_rows('5: pendiente and retirado inscriptions are untouched',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (id = 'ba000000-0000-4000-8000-000000000067' AND estado = 'pendiente' AND unit_estado IS NULL)
        OR (id = 'ba000000-0000-4000-8000-000000000068' AND estado = 'retirado' AND unit_estado = 'no_completado')$$, 2);
SELECT pg_temp.assert_rows('5: preview and close agree on every row',
  $$SELECT 1 FROM t_ci_result r, jsonb_array_elements(r.j -> 'filas') f
     JOIN public.taller_inscripciones i ON i.id = (f ->> 'inscripcion_id')::uuid
     WHERE r.key = 'preview_min3'
       AND i.unit_estado IS DISTINCT FROM f ->> 'resultado'$$, 0);
SELECT pg_temp.assert_rows('5: close counts equal the preview counts',
  $$SELECT 1 FROM t_ci_result p, t_ci_result c
     WHERE p.key = 'preview_min3' AND c.key = 'close'
       AND (c.j ->> 'completados')::int    = (SELECT count(*) FROM jsonb_array_elements(p.j -> 'filas') f WHERE f ->> 'resultado' = 'completado')
       AND (c.j ->> 'no_completados')::int = (SELECT count(*) FROM jsonb_array_elements(p.j -> 'filas') f WHERE f ->> 'resultado' = 'no_completado')
       AND (c.j ->> 'abandonos')::int      = (SELECT count(*) FROM jsonb_array_elements(p.j -> 'filas') f WHERE f ->> 'resultado' = 'abandono')
       AND (c.j ->> 'clases_canceladas')::int = (p.j ->> 'clases_sin_dictar')::int
       AND (c.j ->> 'reportes_sin_enviar')::int = (p.j ->> 'reportes_sin_enviar')::int$$, 1);
SELECT pg_temp.assert_rows('5: the preview recomputed after the close has identical filas',
  $$SELECT 1 FROM t_ci_result b, t_ci_result a
     WHERE b.key = 'preview_min3' AND a.key = 'preview_after'
       AND b.j -> 'filas' = a.j -> 'filas'$$, 1);

-- ══ 6. Certificates ══

SELECT pg_temp.assert_rows('6: one certificate per person of each completado inscription, none for the rest',
  $$SELECT 1 FROM public.taller_certificados
     WHERE taller_id = 'ba000000-0000-4000-8000-000000000090'$$, 4);
SELECT pg_temp.assert_rows('6: certificates go to I1 (principal and companero), I2 and I5',
  $$SELECT 1 FROM public.taller_certificados
     WHERE taller_id = 'ba000000-0000-4000-8000-000000000090'
       AND (inscripcion_id, persona_id) IN (
         VALUES ('ba000000-0000-4000-8000-000000000060'::uuid, 'ba000000-0000-4000-8000-000000000031'::uuid),
                ('ba000000-0000-4000-8000-000000000060'::uuid, 'ba000000-0000-4000-8000-000000000032'::uuid),
                ('ba000000-0000-4000-8000-000000000061'::uuid, 'ba000000-0000-4000-8000-000000000033'::uuid),
                ('ba000000-0000-4000-8000-000000000064'::uuid, 'ba000000-0000-4000-8000-000000000036'::uuid))$$, 4);
SELECT pg_temp.assert_rows('6: codes are 16 distinct chars of the app alphabet',
  $$SELECT DISTINCT codigo_verificacion FROM public.taller_certificados
     WHERE taller_id = 'ba000000-0000-4000-8000-000000000090'
       AND codigo_verificacion ~ '^[abcdefghijkmnpqrstuvwxyz23456789]{16}$'$$, 4);
SELECT pg_temp.assert_rows('6: the couple gets two certificates with distinct codes, each naming the other',
  $$SELECT 1 FROM public.taller_certificados
     WHERE inscripcion_id = 'ba000000-0000-4000-8000-000000000060'
       AND ((persona_id = 'ba000000-0000-4000-8000-000000000031'
             AND nombre_participante_snapshot = 'ZZCIE Uno' AND nombre_pareja_snapshot = 'ZZCIE UnoPareja')
         OR (persona_id = 'ba000000-0000-4000-8000-000000000032'
             AND nombre_participante_snapshot = 'ZZCIE UnoPareja' AND nombre_pareja_snapshot = 'ZZCIE Uno'))
       AND (SELECT count(DISTINCT c2.codigo_verificacion) FROM public.taller_certificados c2
             WHERE c2.inscripcion_id = 'ba000000-0000-4000-8000-000000000060') = 2$$, 2);
SELECT pg_temp.assert_rows('6: an individual inscription gets one certificate with nombre_pareja_snapshot NULL',
  $$SELECT 1 FROM public.taller_certificados
     WHERE inscripcion_id = 'ba000000-0000-4000-8000-000000000061'
       AND persona_id = 'ba000000-0000-4000-8000-000000000033'
       AND nombre_participante_snapshot = 'ZZCIE Dos'
       AND nombre_pareja_snapshot IS NULL$$, 1);
SELECT pg_temp.assert_rows('6: snapshots mirror emit_taller_certificado',
  $$SELECT 1 FROM public.taller_certificados
     WHERE inscripcion_id = 'ba000000-0000-4000-8000-000000000060'
       AND nombre_taller_snapshot = 'ZZ CIE Taller'
       AND firmantes_snapshot = '["ZZCIE Director (Director)"]'::jsonb
       AND revocado_at IS NULL$$, 2);

-- ══ 7. Cascade ══

SELECT pg_temp.assert_rows('7: programada clases cancelled, en_curso closed, cerrada kept',
  $$SELECT 1 FROM public.taller_sesiones
     WHERE (id IN ('ba000000-0000-4000-8000-000000000054', 'ba000000-0000-4000-8000-000000000057') AND estado = 'cancelada')
        OR (id IN ('ba000000-0000-4000-8000-000000000053', 'ba000000-0000-4000-8000-000000000056') AND estado = 'cerrada')
        OR (id IN ('ba000000-0000-4000-8000-000000000050', 'ba000000-0000-4000-8000-000000000055') AND estado = 'cerrada')$$, 6);
SELECT pg_temp.assert_rows('7: grupos activo -> completado with completed_at; cancelado stays',
  $$SELECT 1 FROM public.taller_grupos
     WHERE (id IN ('ba000000-0000-4000-8000-000000000040', 'ba000000-0000-4000-8000-000000000041', 'ba000000-0000-4000-8000-000000000042')
            AND estado = 'completado' AND completed_at IS NOT NULL)
        OR (id = 'ba000000-0000-4000-8000-000000000043' AND estado = 'cancelado')$$, 4);
SELECT pg_temp.assert_rows('7: cohorte ended_at is set',
  $$SELECT 1 FROM public.talleres_crecimiento_cohortes
     WHERE id = 'ba000000-0000-4000-8000-0000000000a0' AND ended_at IS NOT NULL$$, 1);
SELECT pg_temp.assert_rows('7: reportes enviado/reabierto -> cerrado, borrador stays',
  $$SELECT 1 FROM public.taller_reportes
     WHERE (id = 'ba000000-0000-4000-8000-000000000070' AND estado = 'cerrado')
        OR (id = 'ba000000-0000-4000-8000-000000000072' AND estado = 'cerrado'
            AND reabierto_por_persona_id = 'ba000000-0000-4000-8000-000000000021')
        OR (id = 'ba000000-0000-4000-8000-000000000071' AND estado = 'borrador')$$, 3);

-- ══ 8. The closed edición stays closed ══

SELECT pg_temp.assert_rows('8: E1 is cerrado with cerrada_en and cerrada_por = the director',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'ba000000-0000-4000-8000-000000000090'
       AND estado = 'cerrado'
       AND cerrada_en IS NOT NULL
       AND cerrada_por = 'ba000000-0000-4000-8000-000000000021'$$, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate_msg('8: second close -> EDICION_YA_CERRADA',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000090')$$, 'P0001', 'EDICION_YA_CERRADA');
SELECT pg_temp.assert_no_error('8: talleres_refrescar_estados runs over the taller',
  $$SELECT public.talleres_refrescar_estados('ba000000-0000-4000-8000-000000000010')$$);
SELECT pg_temp.assert_rows('8: talleres_estado_efectivo(uuid) says cerrado although the dates derive en_curso',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('ba000000-0000-4000-8000-000000000090'::uuid) = 'cerrado'$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('8: stored estado is still cerrado after talleres_refrescar_estados',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'ba000000-0000-4000-8000-000000000090' AND estado = 'cerrado'$$, 1);
SELECT pg_temp.assert_rows('8: talleres_estado_efectivo(row) says cerrado',
  $$SELECT 1 FROM public.taller_ediciones te
     WHERE te.id = 'ba000000-0000-4000-8000-000000000090' AND public.talleres_estado_efectivo(te) = 'cerrado'$$, 1);
SELECT pg_temp.assert_rows('8: talleres_estado_efectivo(row) still derives en_curso for an open edición with the same dates',
  $$SELECT 1 FROM public.taller_ediciones te
     WHERE te.id = 'ba000000-0000-4000-8000-000000000090'
       AND public.talleres_estado_efectivo(jsonb_populate_record(te, '{"cerrada_en": null}'::jsonb)) = 'en_curso'$$, 1);

-- ══ 9. Not closable ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate_msg('9: borrador edición -> EDICION_NO_CERRABLE',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000091')$$, 'P0001', 'EDICION_NO_CERRABLE');
RESET ROLE;

UPDATE public.taller_ediciones SET estado = 'cancelado' WHERE id = 'ba000000-0000-4000-8000-000000000091';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate_msg('9: cancelado edición -> EDICION_NO_CERRABLE',
  $$SELECT public.talleres_cerrar_edicion('ba000000-0000-4000-8000-000000000091')$$, 'P0001', 'EDICION_NO_CERRABLE');
RESET ROLE;

SELECT pg_temp.assert_rows('9: the refused edición, its grupo and its clase are untouched',
  $$SELECT 1
     WHERE EXISTS (SELECT 1 FROM public.taller_ediciones WHERE id = 'ba000000-0000-4000-8000-000000000091' AND estado = 'cancelado' AND cerrada_en IS NULL)
       AND EXISTS (SELECT 1 FROM public.taller_grupos WHERE id = 'ba000000-0000-4000-8000-000000000044' AND estado = 'activo')
       AND EXISTS (SELECT 1 FROM public.taller_sesiones WHERE id = 'ba000000-0000-4000-8000-000000000058' AND estado = 'programada')
       AND EXISTS (SELECT 1 FROM public.talleres_crecimiento_cohortes WHERE id = 'ba000000-0000-4000-8000-0000000000a1' AND ended_at IS NULL)$$, 1);

-- ══ 10. The companero reads the couple's inscription ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-0000000000b2');
SELECT pg_temp.assert_rows('10: the companero can SELECT the couple inscription',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'ba000000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-0000000000b1');
SELECT pg_temp.assert_rows('10: the principal still can',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'ba000000-0000-4000-8000-000000000060'$$, 1);
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-0000000000b3');
SELECT pg_temp.assert_rows('10: a third participant (same grupo, own inscription) still cannot',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'ba000000-0000-4000-8000-000000000060'$$, 0);
SELECT pg_temp.assert_rows('10: the third participant still reads their own inscription',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'ba000000-0000-4000-8000-000000000061'$$, 1);
RESET ROLE;

-- ══ 11 (after the close). Nobody reopens or rewrites the close by hand ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.assert_sqlstate_msg('11: director cannot clear cerrada_en/cerrada_por (reopen), even right after the close',
  $$UPDATE public.taller_ediciones SET cerrada_en = NULL, cerrada_por = NULL
     WHERE id = 'ba000000-0000-4000-8000-000000000090'$$, 'P0001', 'EDICION_CIERRE_SOLO_POR_RPC');
SELECT pg_temp.assert_sqlstate_msg('11: director cannot rewrite cerrada_por',
  $$UPDATE public.taller_ediciones SET cerrada_por = 'ba000000-0000-4000-8000-000000000023'
     WHERE id = 'ba000000-0000-4000-8000-000000000090'$$, 'P0001', 'EDICION_CIERRE_SOLO_POR_RPC');
SELECT pg_temp.assert_update_rows('11: a same-value UPDATE naming the columns passes',
  $$UPDATE public.taller_ediciones SET cerrada_en = cerrada_en, cerrada_por = cerrada_por
     WHERE id = 'ba000000-0000-4000-8000-000000000090'$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('11: E1 keeps the close the RPC wrote',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'ba000000-0000-4000-8000-000000000090'
       AND cerrada_en IS NOT NULL
       AND cerrada_por = 'ba000000-0000-4000-8000-000000000021'$$, 1);

-- ══ 12. emit_taller_certificado on a couple ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('ba000000-0000-4000-8000-000000000020');
SELECT pg_temp.capture('12: director emits I10 (couple)', 'emit1',
  $$SELECT public.emit_taller_certificado('ba000000-0000-4000-8000-000000000069', 'zzcieemit2345678')$$);
SELECT pg_temp.capture('12: director emits I10 again', 'emit2',
  $$SELECT public.emit_taller_certificado('ba000000-0000-4000-8000-000000000069', 'zzcieemit8765432')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('12: the return keeps the five principal keys and adds certificados',
  $$SELECT 1 FROM t_ci_result
     WHERE key = 'emit1'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(j) k)
           = ARRAY['certificado_id', 'certificados', 'codigo_verificacion', 'created', 'inscripcion_id', 'ok']$$, 1);
SELECT pg_temp.assert_rows('12: first emit returns the principal''s new certificate with the app code',
  $$SELECT 1 FROM t_ci_result r
     JOIN public.taller_certificados c
       ON c.inscripcion_id = 'ba000000-0000-4000-8000-000000000069'
      AND c.persona_id = 'ba000000-0000-4000-8000-00000000003b'
     WHERE r.key = 'emit1'
       AND (r.j ->> 'ok')::boolean
       AND (r.j ->> 'created')::boolean
       AND r.j ->> 'codigo_verificacion' = 'zzcieemit2345678'
       AND c.codigo_verificacion = 'zzcieemit2345678'
       AND (r.j ->> 'certificado_id')::uuid = c.id
       AND (r.j ->> 'inscripcion_id')::uuid = 'ba000000-0000-4000-8000-000000000069'
       AND jsonb_array_length(r.j -> 'certificados') = 2
       AND r.j -> 'certificados' -> 0 ->> 'persona_id' = 'ba000000-0000-4000-8000-00000000003b'
       AND r.j -> 'certificados' -> 1 ->> 'persona_id' = 'ba000000-0000-4000-8000-00000000003c'
       AND (r.j -> 'certificados' -> 0 ->> 'created')::boolean
       AND (r.j -> 'certificados' -> 1 ->> 'created')::boolean$$, 1);
SELECT pg_temp.assert_rows('12: both certificates exist, each naming the other, the companero''s code generated in SQL',
  $$SELECT 1 FROM public.taller_certificados
     WHERE inscripcion_id = 'ba000000-0000-4000-8000-000000000069'
       AND ((persona_id = 'ba000000-0000-4000-8000-00000000003b'
             AND nombre_participante_snapshot = 'ZZCIE Diez' AND nombre_pareja_snapshot = 'ZZCIE DiezPareja')
         OR (persona_id = 'ba000000-0000-4000-8000-00000000003c'
             AND nombre_participante_snapshot = 'ZZCIE DiezPareja' AND nombre_pareja_snapshot = 'ZZCIE Diez'
             AND codigo_verificacion ~ '^[abcdefghijkmnpqrstuvwxyz23456789]{16}$'
             AND codigo_verificacion <> 'zzcieemit2345678'))$$, 2);
SELECT pg_temp.assert_rows('12: a second emit is idempotent (same certificate and code, created=false)',
  $$SELECT 1 FROM t_ci_result a, t_ci_result b
     WHERE a.key = 'emit1' AND b.key = 'emit2'
       AND NOT (b.j ->> 'created')::boolean
       AND b.j ->> 'codigo_verificacion' = 'zzcieemit2345678'
       AND b.j ->> 'certificado_id' = a.j ->> 'certificado_id'
       AND NOT (b.j -> 'certificados' -> 0 ->> 'created')::boolean
       AND NOT (b.j -> 'certificados' -> 1 ->> 'created')::boolean
       AND b.j -> 'certificados' -> 1 ->> 'codigo_verificacion' = a.j -> 'certificados' -> 1 ->> 'codigo_verificacion'$$, 1);
SELECT pg_temp.assert_rows('12: still exactly two certificates for I10 after the second emit',
  $$SELECT 1 FROM public.taller_certificados WHERE inscripcion_id = 'ba000000-0000-4000-8000-000000000069'$$, 2);

-- ══ 13. A logged-out visitor reads the partner's name ══

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_rows('13: anon reads nombre_pareja_snapshot of a non-revoked certificate',
  $$SELECT nombre_pareja_snapshot FROM public.taller_certificados
     WHERE taller_id = 'ba000000-0000-4000-8000-000000000090'
       AND persona_id = 'ba000000-0000-4000-8000-000000000031'
       AND nombre_pareja_snapshot = 'ZZCIE UnoPareja'$$, 1);
RESET ROLE;

-- report() runs as postgres: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
