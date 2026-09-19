-- T3 — create_taller_abstract equipo-choice contract checks.
--
-- Run against STAGING after applying
-- 20260918160000_create_taller_abstract_equipo_choice.sql.
--
-- Covers acceptance criteria 1-4 and 8 from
-- odd/tasks/talleres-equipo-en-organigrama.md:
--   1. Creating a taller requires choosing its node.
--   2. Linking "Punto de Partida" sets dream_team_equipo_id to it,
--      mints no new node, and the node has its 4 roles.
--   3. Creating a new node under an active parent (here: DPS, to also
--      prove the parent isn't filtered by experiencia) hangs it there
--      with its 4 roles.
--   4. A root, a node with children, a node of another experiencia, an
--      inactive one, or one already linked to another taller can't be
--      linked.
--   8. Assigning a coordinador to a new taller works (the role exists).
--
-- BEGIN…ROLLBACK — nothing here is kept, and every fixture and RPC
-- call is scoped to its own ids; no ambient staging row is written.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_eq(p_case text, p_actual uuid, p_expected uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'assert failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_case text, p_actual boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT TRUE THEN
    RAISE EXCEPTION 'assert failed: %, expected true, got %', p_case, p_actual;
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

-- Calls create_taller_abstract as the fixture actor and asserts it
-- raises exactly the expected SQLSTATE with a message starting with
-- the expected prefix. Mirrors the WHEN OTHERS / SQLERRM pattern in
-- supabase/tests/casas-anfitrionas-permissions-rpc.test.sql.
CREATE OR REPLACE FUNCTION pg_temp.assert_create_taller_raises(
  p_case text,
  p_expected_sqlstate text,
  p_expected_message_prefix text,
  p_nombre text,
  p_slug text,
  p_equipo_id uuid,
  p_parent_equipo_id uuid
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.create_taller_abstract(p_nombre, NULL, 'periodo_general', p_slug, p_equipo_id, p_parent_equipo_id);

  RAISE EXCEPTION 'assert failed: %, expected SQLSTATE % but the call succeeded', p_case, p_expected_sqlstate;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_expected_sqlstate THEN
      RAISE EXCEPTION 'assert failed: %, expected SQLSTATE % got % (message %)', p_case, p_expected_sqlstate, SQLSTATE, SQLERRM;
    END IF;
    IF SQLERRM NOT LIKE (p_expected_message_prefix || '%') THEN
      RAISE EXCEPTION 'assert failed: %, expected message to start with %, got %', p_case, p_expected_message_prefix, SQLERRM;
    END IF;
END;
$$;

-- ── fixtures ─────────────────────────────────────────────────────────

CREATE TEMP TABLE t3_fixture (key text PRIMARY KEY, id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO t3_fixture (key, id) VALUES
  -- Real, ambient org-chart nodes (ids verified against staging).
  ('root_direccion_conexion',      '5c388e7c-512d-42d7-925e-79d5147f136a'), -- root, talleres_crecimiento
  ('nodo_con_hijos_gcp',           'e524ea89-d3a7-45fc-be00-5a6e7452434e'), -- Grupos de Corto Plazo, has children
  ('nodo_otra_experiencia',        '17119763-36b3-47b4-b5d5-26d75aa06ea4'), -- Waumba Land, experiencia ninos, leaf
  ('nodo_ya_vinculado',            'e9010000-0000-4000-8000-00000000000a'), -- Equipo TEST Scope A, linked to "De Hombre a Hombre"
  ('nodo_para_vincular',           'a2570eef-1327-4e6a-848a-ebf1de85297b'), -- Punto de Partida — eligible
  ('parent_activo_dps',            '4c955366-fee9-4f6b-9b23-21156fd14048'), -- DPS — active parent, experiencia dps
  ('parent_inactivo',              'fb674ab4-45c2-4876-8b8b-d5717e89d581'), -- Dirección de Atracción — inactive root
  -- New fixtures created inside this transaction.
  ('nodo_inactivo',                'a3000000-0000-4000-8000-000000000001'),
  ('actor_auth',                   'a3000000-0000-4000-8000-000000000002'),
  ('actor_usuario',                'a3000000-0000-4000-8000-000000000003'),
  ('actor_grant',                  'a3000000-0000-4000-8000-000000000004');

CREATE OR REPLACE FUNCTION pg_temp.fid(p_key text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM t3_fixture WHERE key = p_key;
$$;

-- An inactive, otherwise-eligible leaf (talleres_crecimiento, has a
-- parent, no children) — isolates the "inactive" rejection reason.
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo)
VALUES (pg_temp.fid('nodo_inactivo'), 'talleres_crecimiento', 'Equipo T3 Fixture Inactivo', pg_temp.fid('nodo_con_hijos_gcp'), false);

-- The actor: an admin.manage-capable persona (also used for the AC8
-- dream_team_servicios insert, where admin.manage is one of the roles
-- the INSERT RLS policy accepts). usuarios.auth_id FKs to auth.users,
-- so the auth.users row comes first (mirrors supabase/tests/casas_map_
-- rpc_contracts.sql).
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (pg_temp.fid('actor_auth'), 'authenticated', 'authenticated', 't3-fixture-actor@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.fid('actor_usuario'), pg_temp.fid('actor_auth'), 'T3 Fixture', 'Actor', 't3-fixture-actor@example.test', 'Soltero', 'Otro');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
VALUES (pg_temp.fid('actor_usuario'), 'talleres_crecimiento.admin.manage', 'talleres_crecimiento', 'experience', NULL);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', pg_temp.fid('actor_auth')::text, true);

-- ── §1 (AC1): exactly one of p_equipo_id / p_parent_equipo_id ──────
SELECT pg_temp.assert_create_taller_raises(
  'AC1: neither p_equipo_id nor p_parent_equipo_id',
  'P0003', 'MUST_CHOOSE_EXACTLY_ONE_MODE',
  'ZZ T3 Fixture AC1 Neither', 'zz-t3-fixture-ac1-neither',
  NULL, NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC1: both p_equipo_id and p_parent_equipo_id',
  'P0003', 'MUST_CHOOSE_EXACTLY_ONE_MODE',
  'ZZ T3 Fixture AC1 Both', 'zz-t3-fixture-ac1-both',
  pg_temp.fid('nodo_para_vincular'), pg_temp.fid('parent_activo_dps')
);

-- ── §4 (AC4): each ineligible link target, in isolation ────────────
SELECT pg_temp.assert_create_taller_raises(
  'AC4: root node cannot be linked',
  'P0002', 'EQUIPO_IS_ROOT',
  'ZZ T3 Fixture AC4 Root', 'zz-t3-fixture-ac4-root',
  pg_temp.fid('root_direccion_conexion'), NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC4: node with children cannot be linked',
  'P0002', 'EQUIPO_HAS_CHILDREN',
  'ZZ T3 Fixture AC4 Hijos', 'zz-t3-fixture-ac4-hijos',
  pg_temp.fid('nodo_con_hijos_gcp'), NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC4: node of another experiencia cannot be linked',
  'P0002', 'EQUIPO_WRONG_EXPERIENCE',
  'ZZ T3 Fixture AC4 Experiencia', 'zz-t3-fixture-ac4-experiencia',
  pg_temp.fid('nodo_otra_experiencia'), NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC4: inactive node cannot be linked',
  'P0002', 'EQUIPO_INACTIVE',
  'ZZ T3 Fixture AC4 Inactivo', 'zz-t3-fixture-ac4-inactivo',
  pg_temp.fid('nodo_inactivo'), NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC4: node already linked to another taller cannot be linked',
  'P0002', 'EQUIPO_ALREADY_LINKED',
  'ZZ T3 Fixture AC4 YaVinculado', 'zz-t3-fixture-ac4-ya-vinculado',
  pg_temp.fid('nodo_ya_vinculado'), NULL
);

SELECT pg_temp.assert_create_taller_raises(
  'AC4: inactive parent cannot be used in new mode',
  'P0002', 'PARENT_EQUIPO_INACTIVE',
  'ZZ T3 Fixture AC4 ParentInactivo', 'zz-t3-fixture-ac4-parent-inactivo',
  NULL, pg_temp.fid('parent_inactivo')
);

-- ── §2 (AC2): link mode — "Punto de Partida" ────────────────────────
DO $ac2$
DECLARE
  v_equipos_antes bigint;
  v_equipos_despues bigint;
  v_resultado jsonb;
  v_taller_id uuid;
BEGIN
  SELECT count(*) INTO v_equipos_antes FROM public.dream_team_equipos;

  v_resultado := public.create_taller_abstract(
    'ZZ T3 Fixture Link Punto De Partida', NULL, 'periodo_general',
    'zz-t3-fixture-link-punto-de-partida',
    pg_temp.fid('nodo_para_vincular'), NULL
  );
  v_taller_id := (v_resultado ->> 'taller_id')::uuid;

  SELECT count(*) INTO v_equipos_despues FROM public.dream_team_equipos;

  PERFORM pg_temp.assert_int_eq('AC2: no new dream_team_equipos row is minted', v_equipos_despues, v_equipos_antes);
  PERFORM pg_temp.assert_uuid_eq(
    'AC2: talleres.dream_team_equipo_id points at Punto de Partida',
    (SELECT dream_team_equipo_id FROM public.talleres WHERE id = v_taller_id),
    pg_temp.fid('nodo_para_vincular')
  );
  PERFORM pg_temp.assert_int_eq(
    'AC2: Punto de Partida has all 4 standard roles',
    (SELECT count(*) FROM public.dream_team_roles
     WHERE equipo_id = pg_temp.fid('nodo_para_vincular')
       AND label IN ('director', 'coordinador', 'lider', 'voluntario')),
    4
  );
END;
$ac2$;

-- ── §3 (AC3) + §8 (AC8): new mode under DPS, then assign a coordinador ─
DO $ac3$
DECLARE
  v_resultado jsonb;
  v_taller_id uuid;
  v_equipo_id uuid;
  v_coordinador_rol_id uuid;
BEGIN
  v_resultado := public.create_taller_abstract(
    'ZZ T3 Fixture Nuevo Bajo DPS', NULL, 'periodo_general',
    'zz-t3-fixture-nuevo-bajo-dps',
    NULL, pg_temp.fid('parent_activo_dps')
  );
  v_taller_id := (v_resultado ->> 'taller_id')::uuid;

  SELECT dream_team_equipo_id INTO v_equipo_id FROM public.talleres WHERE id = v_taller_id;

  PERFORM pg_temp.assert_true('AC3: a new equipo was linked', v_equipo_id IS NOT NULL);
  PERFORM pg_temp.assert_uuid_eq(
    'AC3: the new equipo hangs under DPS',
    (SELECT parent_equipo_id FROM public.dream_team_equipos WHERE id = v_equipo_id),
    pg_temp.fid('parent_activo_dps')
  );
  PERFORM pg_temp.assert_true(
    'AC3: the new equipo has experiencia talleres_crecimiento (parent not filtered by experiencia)',
    (SELECT experiencia FROM public.dream_team_equipos WHERE id = v_equipo_id) = 'talleres_crecimiento'
  );
  PERFORM pg_temp.assert_int_eq(
    'AC3: the new equipo has all 4 standard roles',
    (SELECT count(*) FROM public.dream_team_roles
     WHERE equipo_id = v_equipo_id AND label IN ('director', 'coordinador', 'lider', 'voluntario')),
    4
  );

  -- AC8: assigning a coordinador to this brand-new taller now works,
  -- because the role exists (it didn't, before this migration, until
  -- the first edición was opened — see the task doc's "Problema y
  -- porqué"). Insert directly under RLS, as `authenticated`, using the
  -- same actor's admin.manage capability the INSERT policy accepts
  -- (`dream_team_servicios_insert`, 20260910170000).
  SELECT id INTO v_coordinador_rol_id
  FROM public.dream_team_roles
  WHERE equipo_id = v_equipo_id AND label = 'coordinador';

  PERFORM pg_temp.assert_true('AC8: the coordinador role exists on the new equipo', v_coordinador_rol_id IS NOT NULL);

  INSERT INTO t3_fixture (key, id) VALUES ('ac3_equipo_id', v_equipo_id), ('ac3_coordinador_rol_id', v_coordinador_rol_id);
END;
$ac3$;

-- `authenticated` needs SELECT on the fixture table to resolve fid()
-- once we switch role below (it otherwise runs as this session's own
-- role, which owns the temp table and needs no grant).
GRANT SELECT ON t3_fixture TO authenticated;

SET LOCAL ROLE authenticated;

INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id)
VALUES (pg_temp.fid('actor_usuario'), pg_temp.fid('ac3_equipo_id'), pg_temp.fid('ac3_coordinador_rol_id'));

RESET ROLE;

SELECT pg_temp.assert_int_eq(
  'AC8: the coordinador servicio was inserted',
  (SELECT count(*) FROM public.dream_team_servicios
   WHERE persona_id = pg_temp.fid('actor_usuario')
     AND equipo_id = pg_temp.fid('ac3_equipo_id')
     AND rol_id = pg_temp.fid('ac3_coordinador_rol_id')),
  1
);

ROLLBACK;
