-- T5 (odd/tasks/talleres-consolidar-pantallas.md) — what can a
-- zero-capability líder actually read for their own grupo?
--
-- Run against STAGING. Characterizes CURRENT RLS behavior for
-- /talleres/[taller]/[edicion]/[grupo] (no new migration in this task —
-- "Base: sólo la función nueva de permisos por nodo", already delivered
-- in T1). This file is the recorded evidence behind the page's gate and
-- honest-limited-state design: a real líder is identified by an active
-- taller_grupo_asignaciones row with rol='lider', and today lead.*
-- capabilities are NEVER effectively auto-granted to them (see the
-- separate finding below), so a real líder can hold ZERO talleres
-- capability. Every assertion runs under `SET LOCAL ROLE authenticated`
-- — the staging MCP connection is `postgres`, which has BYPASSRLS.
--
-- Findings this file proves:
--   1. A líder CAN read their own taller_grupo_asignaciones row (the
--      table's SELECT policy has an explicit own-row OR branch), but a
--      query scoped to `grupo_id` returns ONLY that own row — a
--      co-assigned voluntario's row is invisible.
--   2. A líder CANNOT read taller_grupos, taller_sesiones,
--      taller_asistencias or taller_reportes for their own grupo — all
--      four SELECT policies are capability-only (lead.read/coordinator.
--      read/director.read/...), with no "assigned to this grupo" branch,
--      unlike taller_grupo_asignaciones itself.
--   3. taller_ediciones and talleres_crecimiento_cohortes both carve out
--      "any authenticated user, when the edición is abierto/en_curso" —
--      but that carve-out does NOT extend to taller_grupos: a líder still
--      cannot see their own grupo's nombre/capacidad/estado even once the
--      edición is open.
--   4. `talleres_equipo_de_grupo(grupo_id)` (a SECURITY DEFINER resolver
--      already used inside taller_grupos'/taller_sesiones' own RLS, EXECUTE
--      already granted to `authenticated`) IS callable by a zero-capability
--      líder and resolves the taller's org node without requiring SELECT on
--      taller_grupos — used by the page to confirm "this grupo belongs to
--      this taller" even in the degraded/limited render path, without any
--      new grant.
--   5. `usuarios` visibility for a fellow team member (not self) is FALSE
--      for a bare líder — `puede_ver_usuario` is entirely a Grupos de Vida
--      concept (grupo_miembros / es_lider_de_grupo), unrelated to talleres
--      — so "Su gente" cannot resolve co-members' names via a plain
--      usuarios join/embed for ANY viewer (not just a zero-capability one)
--      without a new SECURITY DEFINER name-resolution RPC, the same class
--      of gap T2 already found and fixed for inscripciones
--      (talleres_coord_inscripciones_personas) — left unfixed here per
--      this task's scope (no new DB function beyond T1's).
--   6. The taller_grupo_asignaciones auto-grant trigger
--      (trg_sync_talleres_grants_on_grupo_asignacion_change, PR3
--      20260810120000_talleres_role_auto_grant.sql) is ATTACHED and
--      ENABLED on staging, but its INSERT crashes with 42883 (`operator
--      does not exist: text = uuid`) — it compares
--      dream_team_capability_grants.scope_id (text) to the grupo uuid with
--      no cast. Even if that cast bug were fixed, the grant it would write
--      is scoped to scope_id = <grupo id>, which auth_has_talleres_
--      capability_scoped's ancestor walk (built from dream_team_equipos)
--      can never match — a grupo id is never a dream_team_equipos.id. Both
--      bugs are pre-existing (not introduced by this task) and are out of
--      T5's scope (paso 7 owns "the lead grant, for real"); fixtures below
--      disable the trigger only for setup, inside this transaction.
--
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id is under this
-- file's own a5000000-... namespace, no ambient staging row is touched.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent, the same real anchor other talleres
-- fixture tests already use.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t5_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON t5_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    INSERT INTO t5_failures(case_name) VALUES (
      p_case || ': expected ' || p_expected || ' row(s), got ' || v_n
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO t5_failures(case_name) VALUES (p_case || ': expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t5_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a5000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T5 Equipo', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('a5000000-0000-4000-8000-000000000010', 'zz-t5-fixture', 'ZZ T5 Fixture Taller', 'a5000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a5000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 't5-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a5000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 't5-fixture-lider@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a5000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 't5-fixture-voluntario@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a5000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 't5-fixture-participante@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a5000000-0000-4000-8000-000000000021', 'a5000000-0000-4000-8000-000000000020', 'T5', 'Director', 't5-fixture-director@example.test', 'Soltero', 'Otro'),
  ('a5000000-0000-4000-8000-000000000023', 'a5000000-0000-4000-8000-000000000022', 'T5', 'Lider', 't5-fixture-lider@example.test', 'Soltero', 'Otro'),
  ('a5000000-0000-4000-8000-000000000025', 'a5000000-0000-4000-8000-000000000024', 'T5', 'Voluntario', 't5-fixture-voluntario@example.test', 'Soltero', 'Otro'),
  ('a5000000-0000-4000-8000-000000000027', 'a5000000-0000-4000-8000-000000000026', 'T5', 'Participante', 't5-fixture-participante@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- Director gets a scoped grant ONLY so this fixture can call open_edicion.
-- The líder (a5...23) and voluntario (a5...25) get ZERO capability
-- grants, on purpose — the whole point of this file.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a5000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a5000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'a5000000-0000-4000-8000-000000000001');

CREATE TEMP TABLE t5_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT ON t5_fixture TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000020', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a5000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T5 Fixture Edición', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t5_fixture (key, id) VALUES
    ('edicion', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorte', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('a5000000-0000-4000-8000-000000000030', (SELECT id FROM t5_fixture WHERE key='cohorte'), 'ZZ T5 Grupo', 'activo', 10);

-- Finding 6 — disable the broken auto-grant trigger only for this
-- fixture INSERT; never touched outside this transaction.
ALTER TABLE public.taller_grupo_asignaciones DISABLE TRIGGER trg_sync_talleres_grants_on_grupo_asignacion_change;

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('a5000000-0000-4000-8000-000000000040', 'a5000000-0000-4000-8000-000000000030', 'a5000000-0000-4000-8000-000000000023', 'lider', true),
  ('a5000000-0000-4000-8000-000000000041', 'a5000000-0000-4000-8000-000000000030', 'a5000000-0000-4000-8000-000000000025', 'voluntario', true);

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('a5000000-0000-4000-8000-000000000050', 'a5000000-0000-4000-8000-000000000030', 1, current_date, 'programada');

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado) VALUES
  ('a5000000-0000-4000-8000-000000000060', (SELECT id FROM t5_fixture WHERE key='edicion'), (SELECT id FROM t5_fixture WHERE key='cohorte'), 'a5000000-0000-4000-8000-000000000027', 'aprobado', NULL);

INSERT INTO public.taller_asistencias (id, sesion_id, inscripcion_id, persona_id, estado) VALUES
  ('a5000000-0000-4000-8000-000000000070', 'a5000000-0000-4000-8000-000000000050', 'a5000000-0000-4000-8000-000000000060', 'a5000000-0000-4000-8000-000000000027', 'presente');

INSERT INTO public.taller_reportes (id, grupo_id, estado, observaciones_generales) VALUES
  ('a5000000-0000-4000-8000-000000000080', 'a5000000-0000-4000-8000-000000000030', 'borrador', 'ZZ T5 fixture reporte');

CREATE OR REPLACE FUNCTION pg_temp.as_lider() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000022', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ Finding 3 (part 1): edición still 'borrador' — nothing but the
-- líder's own assignment row and the public taller catalog is visible ═

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_lider();

SELECT pg_temp.assert_rows('lider: own taller_grupo_asignaciones row',
  $$SELECT 1 FROM taller_grupo_asignaciones WHERE id = 'a5000000-0000-4000-8000-000000000040'$$, 1);
SELECT pg_temp.assert_rows('lider: asignaciones scoped to grupo_id returns ONLY own row (finding 1)',
  $$SELECT 1 FROM taller_grupo_asignaciones WHERE grupo_id = 'a5000000-0000-4000-8000-000000000030'$$, 1);
SELECT pg_temp.assert_rows('lider: taller_grupos row for own grupo (finding 2)',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a5000000-0000-4000-8000-000000000030'$$, 0);
SELECT pg_temp.assert_rows('lider: taller_sesiones for own grupo (finding 2)',
  $$SELECT 1 FROM taller_sesiones WHERE grupo_id = 'a5000000-0000-4000-8000-000000000030'$$, 0);
SELECT pg_temp.assert_rows('lider: taller_asistencias for own grupo''s sesion (finding 2)',
  $$SELECT 1 FROM taller_asistencias WHERE sesion_id = 'a5000000-0000-4000-8000-000000000050'$$, 0);
SELECT pg_temp.assert_rows('lider: taller_reportes for own grupo (finding 2)',
  $$SELECT 1 FROM taller_reportes WHERE grupo_id = 'a5000000-0000-4000-8000-000000000030'$$, 0);
SELECT pg_temp.assert_rows('lider: taller_ediciones row while borrador',
  $$SELECT 1 FROM taller_ediciones WHERE id = (SELECT id FROM t5_fixture WHERE key='edicion')$$, 0);
SELECT pg_temp.assert_rows('lider: talleres_crecimiento_cohortes row while borrador',
  $$SELECT 1 FROM talleres_crecimiento_cohortes WHERE id = (SELECT id FROM t5_fixture WHERE key='cohorte')$$, 0);
SELECT pg_temp.assert_rows('lider: talleres row (public catalog, always visible)',
  $$SELECT 1 FROM talleres WHERE id = 'a5000000-0000-4000-8000-000000000010'$$, 1);
SELECT pg_temp.assert_rows('lider: own usuarios row',
  $$SELECT 1 FROM usuarios WHERE id = 'a5000000-0000-4000-8000-000000000023'$$, 1);
SELECT pg_temp.assert_rows('lider: co-voluntario''s usuarios row (finding 5 — NOT visible)',
  $$SELECT 1 FROM usuarios WHERE id = 'a5000000-0000-4000-8000-000000000025'$$, 0);
SELECT pg_temp.assert_rows('lider: talleres_equipo_de_grupo(own grupo) resolves (finding 4)',
  $$SELECT 1 WHERE public.talleres_equipo_de_grupo('a5000000-0000-4000-8000-000000000030') = 'a5000000-0000-4000-8000-000000000001'::uuid$$, 1);

RESET ROLE;

-- ══ Finding 3 (part 2): flip the edición to 'abierto' — taller_ediciones
-- and talleres_crecimiento_cohortes carve out, taller_grupos still doesn't ══

UPDATE public.taller_ediciones SET estado = 'abierto' WHERE id = (SELECT id FROM t5_fixture WHERE key='edicion');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_lider();

SELECT pg_temp.assert_rows('lider: taller_ediciones row AFTER estado=abierto (public carve-out)',
  $$SELECT 1 FROM taller_ediciones WHERE id = (SELECT id FROM t5_fixture WHERE key='edicion')$$, 1);
SELECT pg_temp.assert_rows('lider: talleres_crecimiento_cohortes row AFTER edicion abierto',
  $$SELECT 1 FROM talleres_crecimiento_cohortes WHERE id = (SELECT id FROM t5_fixture WHERE key='cohorte')$$, 1);
SELECT pg_temp.assert_rows('lider: taller_grupos row STILL hidden after edicion abierto (finding 3)',
  $$SELECT 1 FROM taller_grupos WHERE id = 'a5000000-0000-4000-8000-000000000030'$$, 0);

RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
