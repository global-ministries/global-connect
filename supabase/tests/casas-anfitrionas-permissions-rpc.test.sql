-- Casas Anfitrionas permission RPC contract checks.
--
-- Run against local or staging after applying
-- 20260617161620_casas_anfitrionas_granular_permissions.sql and
-- 20260617161954_revoke_anon_from_casas_permission_rpcs.sql and
-- 20260617183000_harden_casas_approval_rpc.sql and
-- 20260617214453_harden_obtener_casas_visibles_ids_rpc.sql.
-- The harness creates deterministic fixtures and rolls them back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_permission(
  p_case text,
  p_actual boolean,
  p_expected boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Permission check failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_function_privilege(
  p_role name,
  p_function_signature text,
  p_privilege text,
  p_expected boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actual boolean;
BEGIN
  SELECT has_function_privilege(p_role, p_function_signature, p_privilege) INTO v_actual;

  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Function privilege check failed: role %, function %, privilege %, expected %, got %',
      p_role,
      p_function_signature,
      p_privilege,
      p_expected,
      v_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_json_text(
  p_case text,
  p_actual jsonb,
  p_key text,
  p_expected text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actual text;
BEGIN
  v_actual := p_actual ->> p_key;

  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'JSON check failed: %, key %, expected %, got %', p_case, p_key, p_expected, v_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_house_approval_state(
  p_case text,
  p_house_id uuid,
  p_expected_approved boolean,
  p_expected_active boolean,
  p_expected_approver_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_approved boolean;
  v_active boolean;
  v_approver_id uuid;
BEGIN
  SELECT ca.aprobada, ca.activa, ca.aprobada_por
  INTO v_approved, v_active, v_approver_id
  FROM public.casas_anfitrionas ca
  WHERE ca.id = p_house_id;

  IF v_approved IS DISTINCT FROM p_expected_approved
    OR v_active IS DISTINCT FROM p_expected_active
    OR v_approver_id IS DISTINCT FROM p_expected_approver_id THEN
    RAISE EXCEPTION 'House approval state check failed: %, expected approved %, active %, approver %, got approved %, active %, approver %',
      p_case,
      p_expected_approved,
      p_expected_active,
      p_expected_approver_id,
      v_approved,
      v_active,
      v_approver_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rpc_exception(
  p_case text,
  p_expected_message text,
  p_auth_claim uuid,
  p_call_auth_id uuid,
  p_house_id uuid,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth_claim::text, true);
  PERFORM public.procesar_aprobacion_casa_anfitriona(
    p_call_auth_id,
    p_house_id,
    p_action,
    'contract check'
  );

  RAISE EXCEPTION 'RPC exception check failed: %, expected exception % but call succeeded',
    p_case,
    p_expected_message;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM p_expected_message THEN
      RAISE EXCEPTION 'RPC exception check failed: %, expected exception %, got %',
        p_case,
        p_expected_message,
        SQLERRM;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_array_contains(
  p_case text,
  p_actual uuid[],
  p_expected_id uuid,
  p_expected_present boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actual_present boolean;
BEGIN
  v_actual_present := p_expected_id = ANY(COALESCE(p_actual, '{}'));

  IF v_actual_present IS DISTINCT FROM p_expected_present THEN
    RAISE EXCEPTION 'UUID array check failed: %, expected id % present %, got % in %',
      p_case,
      p_expected_id,
      p_expected_present,
      v_actual_present,
      p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_uuid_array_rpc_exception(
  p_case text,
  p_expected_message text,
  p_auth_claim uuid,
  p_call_auth_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth_claim::text, true);
  PERFORM public.obtener_casas_visibles_ids(p_call_auth_id);

  RAISE EXCEPTION 'UUID array RPC exception check failed: %, expected exception % but call succeeded',
    p_case,
    p_expected_message;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM p_expected_message THEN
      RAISE EXCEPTION 'UUID array RPC exception check failed: %, expected exception %, got %',
        p_case,
        p_expected_message,
        SQLERRM;
    END IF;
END;
$$;

SELECT pg_temp.assert_function_privilege('anon', 'public.obtener_permisos_casa_anfitriona(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.obtener_permisos_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.obtener_permisos_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('anon', 'public.puede_ver_casa_anfitriona(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.puede_ver_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.puede_ver_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('anon', 'public.puede_crear_casa_anfitriona_para(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.puede_crear_casa_anfitriona_para(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.puede_crear_casa_anfitriona_para(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('anon', 'public.puede_aprobar_casa_anfitriona(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.puede_aprobar_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.puede_aprobar_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('anon', 'public.puede_editar_casa_anfitriona(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.puede_editar_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.puede_editar_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('anon', 'public.puede_cambiar_estado_casa_anfitriona(uuid, uuid)', 'EXECUTE', false);
SELECT pg_temp.assert_function_privilege('authenticated', 'public.puede_cambiar_estado_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);
SELECT pg_temp.assert_function_privilege('service_role', 'public.puede_cambiar_estado_casa_anfitriona(uuid, uuid)', 'EXECUTE', true);

CREATE TEMP TABLE gc_casas_permissions_fixture (
  key text PRIMARY KEY,
  id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO gc_casas_permissions_fixture (key, id) VALUES
  ('admin_auth_id', '11111111-1111-4111-8111-111111111101'),
  ('director_etapa_auth_id', '11111111-1111-4111-8111-111111111102'),
  ('leader_auth_id', '11111111-1111-4111-8111-111111111103'),
  ('outsider_auth_id', '11111111-1111-4111-8111-111111111104'),
  ('admin_user_id', '22222222-2222-4222-8222-222222222101'),
  ('director_etapa_user_id', '22222222-2222-4222-8222-222222222102'),
  ('leader_user_id', '22222222-2222-4222-8222-222222222103'),
  ('outsider_user_id', '22222222-2222-4222-8222-222222222104'),
  ('same_group_user_id', '22222222-2222-4222-8222-222222222201'),
  ('out_of_group_user_id', '22222222-2222-4222-8222-222222222202'),
  ('admin_role_id', '33333333-3333-4333-8333-333333333101'),
  ('director_etapa_role_id', '33333333-3333-4333-8333-333333333102'),
  ('leader_role_id', '33333333-3333-4333-8333-333333333103'),
  ('segment_id', '44444444-4444-4444-8444-444444444101'),
  ('other_segment_id', '44444444-4444-4444-8444-444444444102'),
  ('season_id', '55555555-5555-4555-8555-555555555101'),
  ('in_scope_group_id', '66666666-6666-4666-8666-666666666101'),
  ('out_of_scope_group_id', '66666666-6666-4666-8666-666666666102'),
  ('director_etapa_assignment_id', '77777777-7777-4777-8777-777777777101'),
  ('director_etapa_group_id', '77777777-7777-4777-8777-777777777102'),
  ('in_scope_house_id', '88888888-8888-4888-8888-888888888101'),
  ('out_of_scope_house_id', '88888888-8888-4888-8888-888888888102'),
  ('approval_success_house_id', '88888888-8888-4888-8888-888888888103'),
  ('invalid_action_house_id', '88888888-8888-4888-8888-888888888104');

CREATE TEMP TABLE gc_casas_rpc_results (
  key text PRIMARY KEY,
  result jsonb NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fixture_id(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT f.id FROM gc_casas_permissions_fixture f WHERE f.key = p_key;
$$;

INSERT INTO public.roles_sistema (id, nombre_interno, nombre_visible)
SELECT fixture_id('admin_role_id'), 'admin', 'Admin'
WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'admin');

INSERT INTO public.roles_sistema (id, nombre_interno, nombre_visible)
SELECT fixture_id('director_etapa_role_id'), 'director-etapa', 'Director de Etapa'
WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'director-etapa');

INSERT INTO public.roles_sistema (id, nombre_interno, nombre_visible)
SELECT fixture_id('leader_role_id'), 'lider', 'Lider'
WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'lider');

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
VALUES
  (fixture_id('admin_user_id'), fixture_id('admin_auth_id'), 'Contract', 'Admin', 'gc-casas-admin@example.test', 'Soltero', 'Otro'),
  (fixture_id('director_etapa_user_id'), fixture_id('director_etapa_auth_id'), 'Contract', 'Director', 'gc-casas-director@example.test', 'Soltero', 'Otro'),
  (fixture_id('leader_user_id'), fixture_id('leader_auth_id'), 'Contract', 'Leader', 'gc-casas-leader@example.test', 'Soltero', 'Otro'),
  (fixture_id('outsider_user_id'), fixture_id('outsider_auth_id'), 'Contract', 'Outsider', 'gc-casas-outsider@example.test', 'Soltero', 'Otro'),
  (fixture_id('same_group_user_id'), NULL, 'Contract', 'Same Group', 'gc-casas-same-group@example.test', 'Soltero', 'Otro'),
  (fixture_id('out_of_group_user_id'), NULL, 'Contract', 'Out Group', 'gc-casas-out-group@example.test', 'Soltero', 'Otro');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT fixture_id('admin_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'admin'
UNION ALL
SELECT fixture_id('director_etapa_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'director-etapa'
UNION ALL
SELECT fixture_id('leader_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'lider';

INSERT INTO public.segmentos (id, nombre)
VALUES
  (fixture_id('segment_id'), 'GC Casas Permissions Segment'),
  (fixture_id('other_segment_id'), 'GC Casas Permissions Other Segment');

INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado)
VALUES (fixture_id('season_id'), 'GC Casas Permissions Season', current_date, current_date + 30, true, 'activa');

INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, eliminado, estado_ciclo)
VALUES
  (fixture_id('in_scope_group_id'), 'GC Casas Permissions In Scope Group', fixture_id('season_id'), fixture_id('segment_id'), true, false, 'activo'),
  (fixture_id('out_of_scope_group_id'), 'GC Casas Permissions Out Scope Group', fixture_id('season_id'), fixture_id('other_segment_id'), true, false, 'activo');

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida)
VALUES
  (fixture_id('in_scope_group_id'), fixture_id('same_group_user_id'), 'Miembro', NULL),
  (fixture_id('in_scope_group_id'), fixture_id('leader_user_id'), 'Líder', NULL),
  (fixture_id('out_of_scope_group_id'), fixture_id('out_of_group_user_id'), 'Miembro', NULL);

INSERT INTO public.segmento_lideres (id, usuario_id, segmento_id, tipo_lider)
VALUES (fixture_id('director_etapa_assignment_id'), fixture_id('director_etapa_user_id'), fixture_id('segment_id'), 'director_etapa');

INSERT INTO public.director_etapa_grupos (id, director_etapa_id, grupo_id)
VALUES (fixture_id('director_etapa_group_id'), fixture_id('director_etapa_assignment_id'), fixture_id('in_scope_group_id'));

INSERT INTO public.casas_anfitrionas (id, usuario_id, nombre_lugar, capacidad_maxima, disponibilidad, activa, aprobada)
VALUES
  (fixture_id('in_scope_house_id'), fixture_id('same_group_user_id'), 'GC Casas Permissions In Scope House', 12, '[]'::jsonb, true, true),
  (fixture_id('out_of_scope_house_id'), fixture_id('out_of_group_user_id'), 'GC Casas Permissions Out Scope House', 12, '[]'::jsonb, true, true),
  (fixture_id('approval_success_house_id'), fixture_id('same_group_user_id'), 'GC Casas Permissions Approval Success House', 12, '[]'::jsonb, false, false),
  (fixture_id('invalid_action_house_id'), fixture_id('same_group_user_id'), 'GC Casas Permissions Invalid Action House', 12, '[]'::jsonb, false, false);

SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);
SELECT pg_temp.assert_permission(
  'admin can approve an in-scope house',
  public.puede_aprobar_casa_anfitriona(
    fixture_id('admin_auth_id'),
    fixture_id('in_scope_house_id')
  ),
  true
);

SELECT set_config('request.jwt.claim.sub', fixture_id('director_etapa_auth_id')::text, true);
SELECT pg_temp.assert_permission(
  'director etapa cannot approve',
  public.puede_aprobar_casa_anfitriona(
    fixture_id('director_etapa_auth_id'),
    fixture_id('in_scope_house_id')
  ),
  false
);

SELECT pg_temp.assert_permission(
  'director etapa can edit in-scope house',
  public.puede_editar_casa_anfitriona(
    fixture_id('director_etapa_auth_id'),
    fixture_id('in_scope_house_id')
  ),
  true
);

SELECT pg_temp.assert_uuid_array_contains(
  'obtener_casas_visibles_ids allows matching director etapa auth',
  public.obtener_casas_visibles_ids(fixture_id('director_etapa_auth_id')),
  fixture_id('in_scope_house_id'),
  true
);

SELECT pg_temp.assert_uuid_array_contains(
  'obtener_casas_visibles_ids excludes out-of-scope house',
  public.obtener_casas_visibles_ids(fixture_id('director_etapa_auth_id')),
  fixture_id('out_of_scope_house_id'),
  false
);

SELECT pg_temp.assert_permission(
  'director etapa cannot edit out-of-scope house',
  public.puede_editar_casa_anfitriona(
    fixture_id('director_etapa_auth_id'),
    fixture_id('out_of_scope_house_id')
  ),
  false
);

SELECT set_config('request.jwt.claim.sub', fixture_id('leader_auth_id')::text, true);
SELECT pg_temp.assert_permission(
  'leader can create only for same active group',
  public.puede_crear_casa_anfitriona_para(
    fixture_id('leader_auth_id'),
    fixture_id('same_group_user_id')
  ),
  true
);

SELECT pg_temp.assert_permission(
  'leader cannot create for out-of-group user',
  public.puede_crear_casa_anfitriona_para(
    fixture_id('leader_auth_id'),
    fixture_id('out_of_group_user_id')
  ),
  false
);

SELECT set_config('request.jwt.claim.sub', fixture_id('outsider_auth_id')::text, true);
SELECT pg_temp.assert_permission(
  'spoofed p_auth_id is denied',
  public.puede_aprobar_casa_anfitriona(
    fixture_id('admin_auth_id'),
    fixture_id('in_scope_house_id')
  ),
  false
);

SELECT pg_temp.assert_uuid_array_rpc_exception(
  'direct obtener_casas_visibles_ids requires non-null p_auth_id',
  'auth_id_required',
  fixture_id('director_etapa_auth_id'),
  NULL
);

SELECT pg_temp.assert_uuid_array_rpc_exception(
  'direct obtener_casas_visibles_ids denies spoofed p_auth_id',
  'auth_id_spoofed',
  fixture_id('outsider_auth_id'),
  fixture_id('admin_auth_id')
);

SELECT pg_temp.assert_rpc_exception(
  'direct approval RPC denies spoofed p_auth_id',
  'sin_permisos',
  fixture_id('outsider_auth_id'),
  fixture_id('admin_auth_id'),
  fixture_id('approval_success_house_id'),
  'aprobar'
);

SELECT pg_temp.assert_house_approval_state(
  'direct approval RPC spoof attempt leaves house pending',
  fixture_id('approval_success_house_id'),
  false,
  false,
  NULL
);

SELECT pg_temp.assert_rpc_exception(
  'direct approval RPC denies unauthorized director etapa',
  'sin_permisos',
  fixture_id('director_etapa_auth_id'),
  fixture_id('director_etapa_auth_id'),
  fixture_id('approval_success_house_id'),
  'aprobar'
);

SELECT pg_temp.assert_house_approval_state(
  'direct approval RPC unauthorized role leaves house pending',
  fixture_id('approval_success_house_id'),
  false,
  false,
  NULL
);

SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);
INSERT INTO gc_casas_rpc_results (key, result)
SELECT 'admin_approval', public.procesar_aprobacion_casa_anfitriona(
  fixture_id('admin_auth_id'),
  fixture_id('approval_success_house_id'),
  'aprobar',
  'contract check'
);

SELECT pg_temp.assert_json_text(
  'direct approval RPC allows authorized admin approval',
  (SELECT result FROM gc_casas_rpc_results WHERE key = 'admin_approval'),
  'accion',
  'aprobar'
);

SELECT pg_temp.assert_json_text(
  'direct approval RPC returns approved state',
  (SELECT result FROM gc_casas_rpc_results WHERE key = 'admin_approval'),
  'estado',
  'aprobada'
);

SELECT pg_temp.assert_house_approval_state(
  'direct approval RPC authorized admin marks house approved',
  fixture_id('approval_success_house_id'),
  true,
  true,
  fixture_id('admin_user_id')
);

SELECT pg_temp.assert_rpc_exception(
  'direct approval RPC rejects invalid action',
  'accion_invalida',
  fixture_id('admin_auth_id'),
  fixture_id('admin_auth_id'),
  fixture_id('invalid_action_house_id'),
  'archivar'
);

SELECT pg_temp.assert_house_approval_state(
  'direct approval RPC invalid action leaves house pending',
  fixture_id('invalid_action_house_id'),
  false,
  false,
  NULL
);

ROLLBACK;
