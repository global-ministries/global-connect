-- T1 — foundations for "la autoridad sigue al árbol"
-- (odd/tasks/talleres-autoridad-arbol.md).
--
-- Run against STAGING before/after
-- 20260918180000_talleres_scoped_capability_ancestors.sql.
--
-- Covers:
--   (a) auth_has_talleres_capability_scoped walks ancestors (a grant at a
--       parent or grandparent node reaches a descendant equipo; it never
--       reaches an unrelated branch; a NULL equipo argument only matches
--       a global (scope_id IS NULL) grant).
--   (b) a grant stored with scope_id = 'global' (the literal string
--       production actually has) is not recognized as global by
--       auth_has_talleres_capability_scoped — demonstrating why the data
--       normalization step is needed — and the exact UPDATE statement the
--       migration uses correctly turns it into a NULL-scope grant that
--       auth_has_talleres_capability_scoped already treats as global.
--   (c) talleres_equipo_de_edicion(edicion_id) resolves edición → taller →
--       talleres.dream_team_equipo_id.
--
-- EXECUTE-grant hardening (originally planned step (d): revoke anon/PUBLIC
-- EXECUTE on these helpers) was investigated and NOT done — see the
-- migration header for why: several roles={public} policies (e.g.
-- taller_ediciones_select, talleres_crecimiento_cohortes_select) call
-- these helpers as non-last OR branches, and anon has base table grants
-- on every talleres table. Revoking anon EXECUTE would turn today's
-- silent "0 rows" for anon into a hard "permission denied" error on
-- those tables — a behavior change acceptance criteria never asked for
-- and T4's "nothing that worked keeps working" forbids. Reported to the
-- orchestrator instead of guessed.
--
-- BEGIN…ROLLBACK — nothing here is kept, and every fixture is scoped to
-- its own ids; no ambient staging row is written or altered.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_case text, p_actual boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT TRUE THEN
    RAISE EXCEPTION 'assert failed: %, expected true, got %', p_case, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_false(p_case text, p_actual boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT FALSE THEN
    RAISE EXCEPTION 'assert failed: %, expected false, got %', p_case, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_eq(p_case text, p_actual uuid, p_expected uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_int_eq(p_case text, p_actual bigint, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────

CREATE TEMP TABLE t1_fixture (key text PRIMARY KEY, id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO t1_fixture (key, id) VALUES
  -- Real, ambient org-chart nodes (ids verified against staging).
  ('root_conexion',        '5c388e7c-512d-42d7-925e-79d5147f136a'), -- Dirección de Conexión, root
  ('nodo_gcp',              'e524ea89-d3a7-45fc-be00-5a6e7452434e'), -- Grupos de Corto Plazo, child of root_conexion
  ('nodo_scope_a',          'e9010000-0000-4000-8000-00000000000a'), -- Equipo TEST Scope A, child of nodo_gcp (grandchild of root_conexion)
  ('nodo_proximo_paso',     'daffcd22-05b6-45e8-91e3-f3743f4d551f'), -- Próximo Paso, unrelated DPS branch
  ('taller_scope_a',        '7a11e5a0-0000-4000-8000-00000000000a'), -- taller "De Hombre a Hombre", linked to nodo_scope_a
  -- New fixtures created inside this transaction.
  ('actor_parent_auth',     'a5000000-0000-4000-8000-000000000001'),
  ('actor_parent_usuario',  'a5000000-0000-4000-8000-000000000002'),
  ('actor_root_auth',       'a5000000-0000-4000-8000-000000000003'),
  ('actor_root_usuario',    'a5000000-0000-4000-8000-000000000004'),
  ('actor_global_str_auth',    'a5000000-0000-4000-8000-000000000005'),
  ('actor_global_str_usuario', 'a5000000-0000-4000-8000-000000000006'),
  ('actor_admin_auth',      'a5000000-0000-4000-8000-000000000007'),
  ('actor_admin_usuario',   'a5000000-0000-4000-8000-000000000008');

CREATE OR REPLACE FUNCTION pg_temp.fid(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM t1_fixture WHERE key = p_key;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  (pg_temp.fid('actor_parent_auth'), 'authenticated', 'authenticated', 't1-fixture-parent@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('actor_root_auth'), 'authenticated', 'authenticated', 't1-fixture-root@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('actor_global_str_auth'), 'authenticated', 'authenticated', 't1-fixture-globalstr@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('actor_admin_auth'), 'authenticated', 'authenticated', 't1-fixture-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  (pg_temp.fid('actor_parent_usuario'), pg_temp.fid('actor_parent_auth'), 'T1 Fixture', 'Parent', 't1-fixture-parent@example.test', 'Soltero', 'Otro'),
  (pg_temp.fid('actor_root_usuario'), pg_temp.fid('actor_root_auth'), 'T1 Fixture', 'Root', 't1-fixture-root@example.test', 'Soltero', 'Otro'),
  (pg_temp.fid('actor_global_str_usuario'), pg_temp.fid('actor_global_str_auth'), 'T1 Fixture', 'GlobalStr', 't1-fixture-globalstr@example.test', 'Soltero', 'Otro'),
  (pg_temp.fid('actor_admin_usuario'), pg_temp.fid('actor_admin_auth'), 'T1 Fixture', 'Admin', 't1-fixture-admin@example.test', 'Soltero', 'Otro');

-- Coordinator granted at the PARENT node (nodo_gcp), one level above the
-- target equipo (nodo_scope_a).
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_parent_usuario'), 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', pg_temp.fid('nodo_gcp')::text);

-- Coordinator granted at the ROOT node (root_conexion), two levels above
-- the target equipo (nodo_scope_a) — proves multi-level ancestor walk.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_root_usuario'), 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', pg_temp.fid('root_conexion')::text);

-- Mirrors production's actual shape: admin.manage stored with the
-- literal string 'global' instead of NULL.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_global_str_usuario'), 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'taller', 'global');

-- A genuinely global (NULL scope) grant, used for the NULL-argument case
-- and to open a real edición for the equipo_de_edicion resolver test.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_admin_usuario'), 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL);

-- ── (a) ancestor walk ────────────────────────────────────────────────

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_parent_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

SELECT pg_temp.assert_true(
  'a1: a grant at the parent node reaches a child equipo',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', pg_temp.fid('nodo_scope_a'))
);

SELECT pg_temp.assert_false(
  'a2: a grant at the parent node does NOT reach an unrelated branch (Próximo Paso)',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', pg_temp.fid('nodo_proximo_paso'))
);

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_root_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

SELECT pg_temp.assert_true(
  'a3: a grant two levels up (root) reaches a grandchild equipo',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', pg_temp.fid('nodo_scope_a'))
);

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_admin_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

SELECT pg_temp.assert_true(
  'a4: a NULL-scope (global) grant matches a NULL equipo argument',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', NULL)
);

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_root_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

SELECT pg_temp.assert_false(
  'a5: a scoped (non-global) grant does NOT match a NULL equipo argument',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', NULL)
);

-- ── (b) 'global' string normalization ───────────────────────────────

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_global_str_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

SELECT pg_temp.assert_false(
  'b1: scope_id=''global'' (the literal string) is NOT recognized as global today',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', pg_temp.fid('nodo_scope_a'))
);

-- Rehearse the exact statement the migration will run, scoped to this
-- transaction — staging has no other talleres_crecimiento.* grant with
-- scope_id='global' today (verified read-only before writing this test),
-- so this only touches our fixture row.
WITH updated AS (
  UPDATE public.dream_team_capability_grants
  SET scope_id = NULL, scope_type = 'experience'
  WHERE capability_key LIKE 'talleres_crecimiento.%'
    AND scope_id = 'global'
    AND revoked_at IS NULL
  RETURNING 1
)
SELECT pg_temp.assert_int_eq('b2: the normalization UPDATE touches exactly our fixture row', (SELECT count(*) FROM updated), 1);

SELECT pg_temp.assert_true(
  'b3: after normalization, the same grant is recognized as global for any equipo',
  public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', pg_temp.fid('nodo_scope_a'))
);

-- ── (c) talleres_equipo_de_edicion ───────────────────────────────────

SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_admin_auth')::text, true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $edicion$
DECLARE
  v_resultado jsonb;
  v_taller_ediciones_id uuid;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => pg_temp.fid('taller_scope_a'),
    p_tipo => 'individual',
    p_nombre_edicion => 'ZZ T1 Fixture Edición',
    p_link_type => NULL,
    p_sesiones_estimadas => 1,
    p_duracion_estimada_minutos => 60,
    p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(),
    p_fecha_fin_periodo => NULL,
    p_firmantes => '[]'::jsonb,
    p_temporada_id => NULL
  );
  v_taller_ediciones_id := (v_resultado ->> 'edicion_id')::uuid;

  PERFORM pg_temp.assert_uuid_eq(
    'c1: talleres_equipo_de_edicion resolves edición -> taller -> equipo',
    public.talleres_equipo_de_edicion(v_taller_ediciones_id),
    pg_temp.fid('nodo_scope_a')
  );
END;
$edicion$;

ROLLBACK;
