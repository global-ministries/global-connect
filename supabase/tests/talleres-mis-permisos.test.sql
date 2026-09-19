-- T1 (odd/tasks/talleres-consolidar-pantallas.md) —
-- talleres_mis_permisos(p_equipo_id) returns the right booleans per node.
--
-- Run against STAGING after applying
-- 20260919120000_talleres_mis_permisos.sql.
--
-- Covers: a global admin (scope_id IS NULL), a director scoped to a
-- PARENT node (authority must reach every descendant), a coordinator
-- scoped to ONE specific taller equipo (authority must NOT reach a
-- sibling equipo under the same parent, and must NOT reach upward to
-- that parent), and a member with zero grants (everything false). Each
-- identity is checked against its own branch AND a completely unrelated
-- sibling branch. Also covers p_equipo_id = NULL (only a truly global
-- grant — scope_id IS NULL — can satisfy any boolean).
--
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id is under this
-- file's own a8000000-... namespace, no ambient staging row is touched.
-- Two real, pre-existing org-chart nodes are referenced read-only as
-- parents (same anchors other talleres fixture tests already use):
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) and
-- 'daffcd22-05b6-45e8-91e3-f3743f4d551f' (Próximo Paso, the sibling
-- branch).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t1_failures (case_name text) ON COMMIT DROP;

-- Compares every key in p_expected against the same key in p_actual
-- (both jsonb booleans), recording one failure row per mismatched key.
CREATE OR REPLACE FUNCTION pg_temp.check_permisos(p_case text, p_actual jsonb, p_expected jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_key text;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_expected) LOOP
    IF (p_actual ->> v_key)::boolean IS DISTINCT FROM (p_expected ->> v_key)::boolean THEN
      INSERT INTO t1_failures(case_name) VALUES (
        p_case || ' [' || v_key || ']: expected ' || (p_expected ->> v_key) || ', got ' || coalesce(p_actual ->> v_key, 'NULL')
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t1_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────
-- Rama A (under the real "Grupos de Corto Plazo" node):
--   a8...01  Rama A Parent          — director's grant lives HERE
--   a8...02  Rama A Child           — descendant of the parent (no grant
--                                     of its own — must inherit from 01)
--   a8...03  Rama A Equipo Coord    — descendant of the parent, sibling
--                                     of 02 — coordinador's grant lives
--                                     HERE, exactly, not on 01
-- Rama B (under the real "Próximo Paso" node, unrelated sibling branch):
--   a8...04  Rama B Sibling

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T1 Rama A Parent', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a8000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ T1 Rama A Child', 'a8000000-0000-4000-8000-000000000001', true),
  ('a8000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ T1 Rama A Equipo Coord', 'a8000000-0000-4000-8000-000000000001', true),
  ('a8000000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ T1 Rama B Sibling', 'daffcd22-05b6-45e8-91e3-f3743f4d551f', true);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a8000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 't1-fixture-admin@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 't1-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 't1-fixture-coordinador@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a8000000-0000-4000-8000-000000000016', 'authenticated', 'authenticated', 't1-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a8000000-0000-4000-8000-000000000011', 'a8000000-0000-4000-8000-000000000010', 'T1 Fixture', 'Admin', 't1-fixture-admin@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000013', 'a8000000-0000-4000-8000-000000000012', 'T1 Fixture', 'Director', 't1-fixture-director@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000015', 'a8000000-0000-4000-8000-000000000014', 'T1 Fixture', 'Coordinador', 't1-fixture-coordinador@example.test', 'Soltero', 'Otro'),
  ('a8000000-0000-4000-8000-000000000017', 'a8000000-0000-4000-8000-000000000016', 'T1 Fixture', 'Miembro', 't1-fixture-miembro@example.test', 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  -- Global admin — truly global grant (scope_id IS NULL).
  ('a8000000-0000-4000-8000-000000000011', 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL),
  -- Director — scoped to the PARENT node (a8...01). Must reach a8...02
  -- and a8...03 (both descendants) but not a8...04 (unrelated branch).
  ('a8000000-0000-4000-8000-000000000013', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000013', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000001'),
  -- Coordinador — scoped to ONE specific taller equipo (a8...03), a
  -- CHILD, not the parent. Must not reach a8...01 (its own parent),
  -- a8...02 (its sibling) or a8...04 (unrelated branch).
  ('a8000000-0000-4000-8000-000000000015', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000003'),
  ('a8000000-0000-4000-8000-000000000015', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'a8000000-0000-4000-8000-000000000003');
  -- Miembro (a8...17) — zero grants, on purpose.

CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000010', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_director() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000012', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_coordinador() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000014', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_miembro() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000016', true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Reusable expected-shape helpers (all 10 keys, so check_permisos walks
-- every one of them on every case).
CREATE OR REPLACE FUNCTION pg_temp.exp(
  ver boolean, editar_taller boolean, abrir_edicion boolean, editar_edicion boolean,
  gestionar_grupos boolean, aprobar_inscripciones boolean, resolver_retiros boolean,
  asignar_equipo boolean, ver_reportes boolean, ver_metricas boolean
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'ver', ver, 'editar_taller', editar_taller, 'abrir_edicion', abrir_edicion,
    'editar_edicion', editar_edicion, 'gestionar_grupos', gestionar_grupos,
    'aprobar_inscripciones', aprobar_inscripciones, 'resolver_retiros', resolver_retiros,
    'asignar_equipo', asignar_equipo, 'ver_reportes', ver_reportes, 'ver_metricas', ver_metricas
  );
$$;
CREATE OR REPLACE FUNCTION pg_temp.all_false() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.exp(false,false,false,false,false,false,false,false,false,false);
$$;

-- ══ Global admin — scope_id IS NULL reaches every node, including NULL ══

SELECT pg_temp.as_admin();
-- admin.manage drives everything EXCEPT editar_taller (director.write
-- only, per the live talleres_update_director RLS) and ver_metricas
-- (metrics.read only) — see the migration header for why.
SELECT pg_temp.check_permisos(
  'admin @ Rama A Parent',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000001'),
  pg_temp.exp(true, false, true, true, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'admin @ Rama B Sibling (unrelated branch — global grant still reaches it)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000004'),
  pg_temp.exp(true, false, true, true, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'admin @ NULL node (only the global grant itself can satisfy this)',
  public.talleres_mis_permisos(NULL),
  pg_temp.exp(true, false, true, true, true, true, true, true, true, false)
);

-- ══ Director scoped to the PARENT node — reaches every descendant ═══════

SELECT pg_temp.as_director();
SELECT pg_temp.check_permisos(
  'director @ own node (Rama A Parent)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000001'),
  pg_temp.exp(true, true, true, true, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'director @ Rama A Child (descendant — authority flows down the tree)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000002'),
  pg_temp.exp(true, true, true, true, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'director @ Rama A Equipo Coord (also a descendant)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000003'),
  pg_temp.exp(true, true, true, true, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'director @ Rama B Sibling (unrelated branch — must be all false)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000004'),
  pg_temp.all_false()
);

-- ══ Coordinador scoped to ONE specific taller equipo (not the parent) ═══

SELECT pg_temp.as_coordinador();
SELECT pg_temp.check_permisos(
  'coordinador @ own equipo (Rama A Equipo Coord)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000003'),
  pg_temp.exp(true, false, false, false, true, true, true, true, true, false)
);
SELECT pg_temp.check_permisos(
  'coordinador @ Rama A Parent (own equipo''s PARENT — must NOT inherit upward)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000001'),
  pg_temp.all_false()
);
SELECT pg_temp.check_permisos(
  'coordinador @ Rama A Child (sibling equipo under the same parent — must NOT leak sideways)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000002'),
  pg_temp.all_false()
);
SELECT pg_temp.check_permisos(
  'coordinador @ Rama B Sibling (unrelated branch)',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000004'),
  pg_temp.all_false()
);

-- ══ Miembro sin permisos — all false everywhere, including NULL ═════════

SELECT pg_temp.as_miembro();
SELECT pg_temp.check_permisos(
  'miembro @ Rama A Parent',
  public.talleres_mis_permisos('a8000000-0000-4000-8000-000000000001'),
  pg_temp.all_false()
);
SELECT pg_temp.check_permisos(
  'miembro @ NULL node',
  public.talleres_mis_permisos(NULL),
  pg_temp.all_false()
);

SELECT pg_temp.report();

ROLLBACK;
