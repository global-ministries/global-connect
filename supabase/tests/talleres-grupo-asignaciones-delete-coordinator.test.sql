-- T5 (odd/tasks/talleres-configuracion-del-taller.md) — RED→GREEN for
-- taller_grupo_asignaciones_delete: a coordinator (coordinator.write,
-- tree-scoped) must be able to remove a facilitador the same way they can
-- add or edit one (INSERT/UPDATE already allow it — verified live against
-- staging pg_policies before 20260927120000_talleres_grupo_asignaciones_
-- delete_coordinator.sql). Run against STAGING inside BEGIN…ROLLBACK —
-- nothing here is kept; every fixture id lives under this file's own
-- b1000000-... namespace. 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos
-- de Corto Plazo) is referenced read-only as a parent equipo, the same
-- anchor T1/T3's fixture tests already use.
--
-- Identities:
--   director        (b1…21) — director.write scoped to the fixture
--                              taller's own node. Only used to open the
--                              edición (open_edicion's own gate).
--   coordinador     (b1…31) — coordinator.write AND coordinator.read
--                              scoped to the same node. Both, not write
--                              alone — verified live: PostgreSQL RLS
--                              requires a row to pass an applicable
--                              SELECT policy in ADDITION to the DELETE
--                              policy for a DELETE to affect it (a
--                              coordinator.write-only grant reproducibly
--                              deletes 0 rows even once the DELETE policy
--                              allows coordinator.write, because
--                              taller_grupo_asignaciones_select still has
--                              no coordinator.write branch). This is not a
--                              gap this migration needs to close: every
--                              real coordinador gets BOTH capabilities
--                              together from talleres_role_capability_map
--                              (verified live) via the servicio role
--                              auto-grant — unlike T1's fixture, which
--                              deliberately isolates coordinator.write
--                              ALONE to test a capability-only path for a
--                              different RPC (talleres_servidores_del_
--                              taller). Granting both here matches how a
--                              real coordinador is actually provisioned.
--   sin capacidad   (b1…29) — no dream_team_servicios row, no capability
--                              grant, at all.
--   facilitador     (b1…23) — dream_team_servicios estado='activo' on the
--                              taller's own node, so the BEFORE INSERT
--                              trigger accepts assigning him (his
--                              asignación row is what gets deleted below —
--                              this file tests the DELETE policy, not the
--                              servidor-activo trigger, which T1 already
--                              covers).
--
-- Cases:
--   (a) the no-capability member's DELETE on the asignación affects 0 rows
--       (RLS USING silently filters — not an error). Runs first: never
--       consumes the row.
--   (b) the coordinador's DELETE on the SAME asignación affects 1 row —
--       RED before 20260927120000 is applied (only director.write/
--       admin.manage were allowed, so this assertion fails: 0 rows), GREEN
--       after. Runs last per this task's "mutación al final" convention.
--   (c) structural: taller_grupo_asignaciones_delete's qual contains
--       'coordinator.write' — RED before the migration, GREEN after.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_gadc_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_gadc_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_gadc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Runs p_delete_sql (a full DELETE statement) and expects it to affect
-- exactly p_expected rows (RLS silently filters — not an error).
CREATE OR REPLACE FUNCTION pg_temp.assert_delete_rows(p_case text, p_delete_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE p_delete_sql;
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_gadc_failures;
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
  ('b1000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ GADC Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b1000000-0000-4000-8000-000000000010', 'zz-gadc-fixture', 'ZZ GADC Fixture Taller', 'b1000000-0000-4000-8000-000000000001');

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('b1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000001', 'Líder', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b1000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'gadc-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b1000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'gadc-fixture-facilitador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b1000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'gadc-fixture-sincap@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b1000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'gadc-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b1000000-0000-4000-8000-000000000021', 'b1000000-0000-4000-8000-000000000020', 'GADC', 'Director',     'gadc-fixture-director@example.test', 'Soltero', 'Otro'),
  ('b1000000-0000-4000-8000-000000000023', 'b1000000-0000-4000-8000-000000000022', 'GADC', 'Facilitador',  'gadc-fixture-facilitador@example.test', 'Soltero', 'Otro'),
  ('b1000000-0000-4000-8000-000000000029', 'b1000000-0000-4000-8000-000000000028', 'GADC', 'SinCapacidad', 'gadc-fixture-sincap@example.test', 'Soltero', 'Otro'),
  ('b1000000-0000-4000-8000-000000000031', 'b1000000-0000-4000-8000-000000000030', 'GADC', 'Coordinador',  'gadc-fixture-coordinador@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Active servicio so the BEFORE INSERT trigger accepts the facilitador
-- assignment below (T1, 20260926150000_talleres_plantillas_del_taller.sql)
-- — 'Líder' is not in talleres_role_capability_map, so this mints zero
-- capability grants (same note as T1's fixture).
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('b1000000-0000-4000-8000-000000000050', 'b1000000-0000-4000-8000-000000000023', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000011', 'activo');

-- director gets director.write ONLY (to open the edición); coordinador
-- gets BOTH coordinator.write (the capability this migration adds to the
-- DELETE policy) and coordinator.read (so the row also passes the SELECT
-- policy — see the identities note above). sin capacidad gets ZERO
-- grants.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b1000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write',    'talleres_crecimiento', 'taller', 'b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000031', 'talleres_crecimiento.coordinator.read',  'talleres_crecimiento', 'taller', 'b1000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t_gadc_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_gadc_fixture TO authenticated;

-- open_edicion as director → real cohorte with this taller's
-- dream_team_equipo_id (talleres_equipo_de_grupo reads it off the
-- cohorte, not the taller row — 20260918200000's helper). The fixture
-- taller has no plantilla, so open_edicion instantiates no grupos
-- (T2's documented fallback) — the grupo below is inserted directly,
-- mirroring T1's own scenario (d) fixture.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b1000000-0000-4000-8000-000000000020');
-- T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md,
-- 20260928140000_talleres_paso6_hardening.sql, item 4): open_edicion no
-- longer grants EXECUTE to authenticated. This fixture call only needs a
-- real cohorte, not to exercise open_edicion's own authorization, so it
-- runs as postgres — auth.uid() still resolves the director via the JWT
-- claim set above (set_config's third arg is transaction-local, so it
-- survives the role switch).
RESET ROLE;

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'b1000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ GADC Fixture Edicion', p_link_type => NULL,
    p_sesiones_estimadas => 3, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t_gadc_fixture (key, id) VALUES
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

DO $grupo$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad)
  VALUES (gen_random_uuid(), (SELECT id FROM t_gadc_fixture WHERE key = 'cohorte'), 'ZZ GADC Grupo Edicion', 'activo', 10)
  RETURNING id INTO v_id;
  INSERT INTO t_gadc_fixture (key, id) VALUES ('grupo', v_id);
END;
$grupo$;

DO $asig$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol)
  VALUES ((SELECT id FROM t_gadc_fixture WHERE key = 'grupo'), 'b1000000-0000-4000-8000-000000000023', 'lider')
  RETURNING id INTO v_id;
  INSERT INTO t_gadc_fixture (key, id) VALUES ('asignacion', v_id);
END;
$asig$;

-- ══ (a) the no-capability member cannot delete the asignación ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b1000000-0000-4000-8000-000000000028');

SELECT pg_temp.assert_delete_rows('(a) no-capability member DELETE affects 0 rows',
  $$DELETE FROM public.taller_grupo_asignaciones
     WHERE id = (SELECT id FROM t_gadc_fixture WHERE key = 'asignacion')$$, 0);

-- Checked as postgres (RESET ROLE) — taller_grupo_asignaciones_select
-- itself is RLS-scoped (director.read/admin.manage/coordinator.read/
-- lead.read/volunteer.read or own row), and the sin-capacidad member
-- holds none of those, so checking "still there" under their own role
-- would read back 0 rows for the WRONG reason (SELECT filtered, not
-- deleted) — sin_permisos, not a leftover.
RESET ROLE;
SELECT pg_temp.assert_rows('(a) the asignación is still there',
  $$SELECT 1 FROM public.taller_grupo_asignaciones
     WHERE id = (SELECT id FROM t_gadc_fixture WHERE key = 'asignacion')$$, 1);

-- ══ (b) the coordinador deletes the SAME asignación — mutación al final ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b1000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_delete_rows('(b) coordinador DELETE affects 1 row',
  $$DELETE FROM public.taller_grupo_asignaciones
     WHERE id = (SELECT id FROM t_gadc_fixture WHERE key = 'asignacion')$$, 1);

-- ══ (c) structural — the DELETE policy's qual names coordinator.write ══

RESET ROLE;

SELECT pg_temp.assert_rows('(c) structural: DELETE policy qual contains coordinator.write',
  $$SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'taller_grupo_asignaciones'
       AND policyname = 'taller_grupo_asignaciones_delete'
       AND qual LIKE '%coordinator.write%'$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
