-- Casas map RPC contract checks. The harness creates fixtures and rolls them back.

BEGIN;
SET LOCAL search_path TO pg_temp, public;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

CREATE OR REPLACE FUNCTION pg_temp.assert_count(p_case text, p_actual bigint, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Count check failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_float(p_case text, p_actual double precision, p_expected double precision)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NULL OR abs(p_actual - p_expected) > 0.00001 THEN
    RAISE EXCEPTION 'Float check failed: %, expected %, got %', p_case, p_expected, p_actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'Expected exception was not raised: %', p_case;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'Expected exception was not raised:%' THEN
    RAISE;
  END IF;
  IF p_expected_message IS NOT NULL AND position(p_expected_message IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'Wrong exception for %, expected %, got %', p_case, p_expected_message, SQLERRM;
  END IF;
END;
$$;

CREATE TEMP TABLE gc_casas_map_fixture(key text PRIMARY KEY, id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO gc_casas_map_fixture(key, id) VALUES
  ('admin_auth_id', '11111111-1111-4111-8111-111111112101'), ('director_auth_id', '11111111-1111-4111-8111-111111112102'), ('outsider_auth_id', '11111111-1111-4111-8111-111111112103'), ('member_auth_id', '11111111-1111-4111-8111-111111112104'), ('leader_auth_id', '11111111-1111-4111-8111-111111112105'), ('dg_auth_id', '11111111-1111-4111-8111-111111112106'), ('same_segment_owner_auth_id', '11111111-1111-4111-8111-111111112107'), ('other_segment_owner_auth_id', '11111111-1111-4111-8111-111111112108'),
  ('admin_user_id', '22222222-2222-4222-8222-222222223101'), ('director_user_id', '22222222-2222-4222-8222-222222223102'), ('outsider_user_id', '22222222-2222-4222-8222-222222223103'), ('member_user_id', '22222222-2222-4222-8222-222222223104'), ('leader_user_id', '22222222-2222-4222-8222-222222223105'), ('dg_user_id', '22222222-2222-4222-8222-222222223106'), ('same_segment_owner_user_id', '22222222-2222-4222-8222-222222223107'), ('other_segment_owner_user_id', '22222222-2222-4222-8222-222222223108'),
  ('admin_role_id', '33333333-3333-4333-8333-333333334101'), ('director_role_id', '33333333-3333-4333-8333-333333334102'), ('leader_role_id', '33333333-3333-4333-8333-333333334103'), ('dg_role_id', '33333333-3333-4333-8333-333333334104'), ('segment_id', '44444444-4444-4444-8444-444444445101'), ('other_segment_id', '44444444-4444-4444-8444-444444445102'), ('season_id', '55555555-5555-4555-8555-555555556101'),
  ('approved_direction_id', '66666666-6666-4666-8666-666666667101'), ('pending_direction_id', '66666666-6666-4666-8666-666666667102'), ('manual_direction_id', '66666666-6666-4666-8666-666666667103'), ('member_direction_id', '66666666-6666-4666-8666-666666667104'), ('reject_direction_id', '66666666-6666-4666-8666-666666667105'), ('same_segment_direction_id', '66666666-6666-4666-8666-666666667106'), ('other_segment_direction_id', '66666666-6666-4666-8666-666666667107'),
  ('approved_casa_id', '77777777-7777-4777-8777-777777778101'), ('pending_casa_id', '77777777-7777-4777-8777-777777778102'), ('assignment_casa_id', '77777777-7777-4777-8777-777777778103'), ('same_segment_casa_id', '77777777-7777-4777-8777-777777778105'), ('other_segment_casa_id', '77777777-7777-4777-8777-777777778106'),
  ('leader_owned_casa_id', '77777777-7777-4777-8777-777777778104'),
  ('approved_group_id', '88888888-8888-4888-8888-888888889101'), ('pending_group_id', '88888888-8888-4888-8888-888888889102'), ('manual_group_id', '88888888-8888-4888-8888-888888889103'), ('out_scope_group_id', '88888888-8888-4888-8888-888888889104'), ('same_segment_out_de_group_id', '88888888-8888-4888-8888-888888889105'), ('segment_leader_id', '99999999-9999-4999-8999-999999990101'), ('director_group_id', '99999999-9999-4999-8999-999999990102'), ('dg_de_assignment_id', '99999999-9999-4999-8999-999999990103'), ('dg_segment_assignment_id', '99999999-9999-4999-8999-999999990104'),
  ('pending_create_review_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'), ('location_review_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'), ('reject_review_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03'), ('same_segment_review_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04'), ('other_segment_review_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05');

CREATE OR REPLACE FUNCTION pg_temp.fixture_id(p_key text)
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM gc_casas_map_fixture WHERE key = p_key; $$;

INSERT INTO public.roles_sistema(id, nombre_interno, nombre_visible)
SELECT fixture_id('admin_role_id'), 'admin', 'Admin' WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'admin');
INSERT INTO public.roles_sistema(id, nombre_interno, nombre_visible)
SELECT fixture_id('director_role_id'), 'director-etapa', 'Director de Etapa' WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'director-etapa');
INSERT INTO public.roles_sistema(id, nombre_interno, nombre_visible)
SELECT fixture_id('leader_role_id'), 'lider', 'Líder' WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'lider');
INSERT INTO public.roles_sistema(id, nombre_interno, nombre_visible)
SELECT fixture_id('dg_role_id'), 'director-general', 'Director General' WHERE NOT EXISTS (SELECT 1 FROM public.roles_sistema WHERE nombre_interno = 'director-general');

INSERT INTO public.direcciones(id, calle, barrio, latitud, longitud) VALUES
  (fixture_id('approved_direction_id'), 'Approved hidden street', 'Approved Barrio', 10.1, -66.1),
  (fixture_id('pending_direction_id'), 'Pending hidden street', 'Pending Barrio', 10.2, -66.2),
  (fixture_id('manual_direction_id'), 'Manual hidden street', 'Manual Barrio', 10.3, -66.3),
  (fixture_id('member_direction_id'), 'Member hidden street', 'Member Barrio', 10.4, -66.4),
  (fixture_id('reject_direction_id'), 'Rejected hidden street', 'Rejected Barrio', 10.5, -66.5),
  (fixture_id('same_segment_direction_id'), 'Same segment hidden street', 'Same Segment Barrio', 10.6, -66.6),
  (fixture_id('other_segment_direction_id'), 'Other segment hidden street', 'Other Segment Barrio', 10.7, -66.7);

INSERT INTO public.usuarios(id, auth_id, nombre, apellido, email, estado_civil, genero, direccion_id) VALUES
  (fixture_id('admin_user_id'), fixture_id('admin_auth_id'), 'Map', 'Admin', 'gc-map-admin@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('director_user_id'), fixture_id('director_auth_id'), 'Map', 'Director', 'gc-map-director@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('outsider_user_id'), fixture_id('outsider_auth_id'), 'Map', 'Outsider', 'gc-map-outsider@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('member_user_id'), fixture_id('member_auth_id'), 'Map', 'Member', 'gc-map-member@example.test', 'Soltero', 'Otro', fixture_id('member_direction_id')),
  (fixture_id('leader_user_id'), fixture_id('leader_auth_id'), 'Map', 'Leader', 'gc-map-leader@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('dg_user_id'), fixture_id('dg_auth_id'), 'Map', 'DG', 'gc-map-dg@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('same_segment_owner_user_id'), fixture_id('same_segment_owner_auth_id'), 'Same', 'Segment Owner', 'gc-map-same-segment-owner@example.test', 'Soltero', 'Otro', NULL),
  (fixture_id('other_segment_owner_user_id'), fixture_id('other_segment_owner_auth_id'), 'Other', 'Segment Owner', 'gc-map-other-segment-owner@example.test', 'Soltero', 'Otro', NULL);

INSERT INTO public.usuario_roles(usuario_id, rol_id)
SELECT fixture_id('admin_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'admin'
UNION ALL SELECT fixture_id('director_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'director-etapa'
UNION ALL SELECT fixture_id('leader_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'lider'
UNION ALL SELECT fixture_id('dg_user_id'), id FROM public.roles_sistema WHERE nombre_interno = 'director-general';

INSERT INTO public.segmentos(id, nombre) VALUES (fixture_id('segment_id'), 'GC Map Segment'), (fixture_id('other_segment_id'), 'GC Other Segment');
INSERT INTO public.temporadas(id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES (fixture_id('season_id'), 'GC Map Season', current_date, current_date + 30, true, 'activa');
INSERT INTO public.grupos(id, nombre, temporada_id, segmento_id, activo, eliminado, estado_ciclo, direccion_anfitrion_id) VALUES
  (fixture_id('approved_group_id'), 'Approved Casa Anfitriona Group', fixture_id('season_id'), fixture_id('segment_id'), true, false, 'activo', NULL),
  (fixture_id('pending_group_id'), 'Pending Casa Anfitriona Group', fixture_id('season_id'), fixture_id('segment_id'), true, false, 'activo', NULL),
  (fixture_id('manual_group_id'), 'Manual Address Group', fixture_id('season_id'), fixture_id('segment_id'), true, false, 'activo', fixture_id('manual_direction_id')),
  (fixture_id('out_scope_group_id'), 'Out Scope Group', fixture_id('season_id'), fixture_id('other_segment_id'), true, false, 'activo', NULL),
  (fixture_id('same_segment_out_de_group_id'), 'Same Segment Outside Assigned DE Group', fixture_id('season_id'), fixture_id('segment_id'), true, false, 'activo', NULL);

INSERT INTO public.segmento_lideres(id, usuario_id, segmento_id, tipo_lider) VALUES (fixture_id('segment_leader_id'), fixture_id('director_user_id'), fixture_id('segment_id'), 'director_etapa');
INSERT INTO public.director_general_segmentos(id, usuario_id, segmento_id) VALUES (fixture_id('dg_segment_assignment_id'), fixture_id('dg_user_id'), fixture_id('segment_id'));
INSERT INTO public.dg_directores_etapa(id, dg_usuario_id, segmento_lider_id) VALUES (fixture_id('dg_de_assignment_id'), fixture_id('dg_user_id'), fixture_id('segment_leader_id'));
INSERT INTO public.director_etapa_grupos(id, director_etapa_id, grupo_id) VALUES
  (fixture_id('director_group_id'), fixture_id('segment_leader_id'), fixture_id('approved_group_id')),
  (gen_random_uuid(), fixture_id('segment_leader_id'), fixture_id('pending_group_id')),
  (gen_random_uuid(), fixture_id('segment_leader_id'), fixture_id('manual_group_id'));
INSERT INTO public.grupo_miembros(grupo_id, usuario_id, rol) VALUES
  (fixture_id('manual_group_id'), fixture_id('leader_user_id'), 'Líder'),
  (fixture_id('manual_group_id'), fixture_id('member_user_id'), 'Miembro'),
  (fixture_id('approved_group_id'), fixture_id('member_user_id'), 'Miembro'),
  (fixture_id('same_segment_out_de_group_id'), fixture_id('member_user_id'), 'Miembro'),
  (fixture_id('same_segment_out_de_group_id'), fixture_id('same_segment_owner_user_id'), 'Miembro'),
  (fixture_id('out_scope_group_id'), fixture_id('other_segment_owner_user_id'), 'Miembro');

INSERT INTO public.casas_anfitrionas(id, usuario_id, nombre_lugar, direccion_id, capacidad_maxima, disponibilidad, activa, aprobada) VALUES
  (fixture_id('approved_casa_id'), fixture_id('member_user_id'), 'Approved Casa Anfitriona', fixture_id('approved_direction_id'), 12, '[]'::jsonb, true, true),
  (fixture_id('pending_casa_id'), fixture_id('member_user_id'), 'Pending Casa Anfitriona', NULL, 12, '[]'::jsonb, false, false),
  (fixture_id('assignment_casa_id'), fixture_id('member_user_id'), 'Assignment Casa Anfitriona', fixture_id('manual_direction_id'), 12, '[]'::jsonb, true, true),
  (fixture_id('leader_owned_casa_id'), fixture_id('leader_user_id'), 'Leader Owned Casa Anfitriona', fixture_id('manual_direction_id'), 12, '[]'::jsonb, true, true),
  (fixture_id('same_segment_casa_id'), fixture_id('same_segment_owner_user_id'), 'Same Segment Casa Anfitriona', NULL, 12, '[]'::jsonb, false, false),
  (fixture_id('other_segment_casa_id'), fixture_id('other_segment_owner_user_id'), 'Other Segment Casa Anfitriona', NULL, 12, '[]'::jsonb, false, false);
UPDATE public.grupos SET casa_anfitriona_id = fixture_id('approved_casa_id') WHERE id = fixture_id('approved_group_id');
UPDATE public.grupos SET casa_anfitriona_id = fixture_id('pending_casa_id') WHERE id = fixture_id('pending_group_id');
INSERT INTO public.casa_anfitriona_location_reviews(id, casa_anfitriona_id, proposed_direccion_id, requested_by_user_id, review_type, status)
VALUES
  (fixture_id('pending_create_review_id'), fixture_id('pending_casa_id'), fixture_id('pending_direction_id'), fixture_id('member_user_id'), 'create', 'pending'),
  (fixture_id('location_review_id'), fixture_id('approved_casa_id'), fixture_id('pending_direction_id'), fixture_id('member_user_id'), 'location_change', 'pending'),
  (fixture_id('same_segment_review_id'), fixture_id('same_segment_casa_id'), fixture_id('same_segment_direction_id'), fixture_id('same_segment_owner_user_id'), 'create', 'pending'),
  (fixture_id('other_segment_review_id'), fixture_id('other_segment_casa_id'), fixture_id('other_segment_direction_id'), fixture_id('other_segment_owner_user_id'), 'create', 'pending');

SELECT set_config('request.jwt.claim.sub', fixture_id('director_auth_id')::text, true);
SELECT pg_temp.assert_count('approved host home appears on host-home map', (SELECT COUNT(*) FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('approved_group_id')), 1);
SELECT pg_temp.assert_float('pending location change keeps old approved coordinates visible', (SELECT latitud FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('approved_group_id')), 10.1);
SELECT pg_temp.assert_count('pending-only host home stays hidden', (SELECT COUNT(*) FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('pending_group_id')), 0);
SELECT pg_temp.assert_count('manual group address is ignored', (SELECT COUNT(*) FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('manual_group_id')), 0);
SELECT pg_temp.assert_count('scoped missing-host-home queue includes in-scope manual-address group', (SELECT COUNT(*) FROM public.obtener_grupos_sin_casa_anfitriona(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('manual_group_id')), 1);
SELECT pg_temp.assert_count('scoped missing-host-home queue hides out-of-scope groups', (SELECT COUNT(*) FROM public.obtener_grupos_sin_casa_anfitriona(fixture_id('director_auth_id'), 'active') WHERE grupo_id = fixture_id('out_scope_group_id')), 0);
SELECT pg_temp.assert_count('member layer returns one scoped member pin for director', (SELECT COUNT(*) FROM public.obtener_mapa_miembros(fixture_id('director_auth_id'), 'active') WHERE usuario_id = fixture_id('member_user_id')), 1);

SELECT set_config('request.jwt.claim.sub', fixture_id('dg_auth_id')::text, true);
SELECT pg_temp.assert_count('director-general with assigned DE sees directly scoped same-segment group', (SELECT COUNT(*) FROM public.obtener_grupos_sin_casa_anfitriona(fixture_id('dg_auth_id'), 'active') WHERE grupo_id = fixture_id('same_segment_out_de_group_id')), 1);
SELECT pg_temp.assert_count('director-general with assigned DE sees same-segment out-of-DE review', (SELECT COUNT(*) FROM public.obtener_casas_revision_pendiente(fixture_id('dg_auth_id')) WHERE review_id = fixture_id('same_segment_review_id')), 1);
SELECT pg_temp.assert_count('director-general with assigned DE hides out-of-segment group', (SELECT COUNT(*) FROM public.obtener_grupos_sin_casa_anfitriona(fixture_id('dg_auth_id'), 'active') WHERE grupo_id = fixture_id('out_scope_group_id')), 0);
SELECT pg_temp.assert_count('director-general with assigned DE gets one member pin despite multiple visible memberships', (SELECT COUNT(*) FROM public.obtener_mapa_miembros(fixture_id('dg_auth_id'), 'active') WHERE usuario_id = fixture_id('member_user_id')), 1);

SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);
SELECT pg_temp.assert_count('pending review queue exposes scoped pending work to admin', (SELECT COUNT(*) FROM public.obtener_casas_revision_pendiente(fixture_id('admin_auth_id')) WHERE review_id = fixture_id('pending_create_review_id')), 1);

SELECT set_config('request.jwt.claim.sub', fixture_id('leader_auth_id')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises('authenticated role cannot execute assignment RPC', 'SELECT public.asignar_casa_anfitriona_a_grupo(''11111111-1111-4111-8111-111111112105''::uuid, ''88888888-8888-4888-8888-888888889103''::uuid, ''77777777-7777-4777-8777-777777778103''::uuid)', 'permission denied');
SELECT pg_temp.assert_raises('authenticated role cannot execute review RPC', 'SELECT public.procesar_revision_ubicacion_casa(''11111111-1111-4111-8111-111111112101''::uuid, ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02''::uuid, ''aprobar'', ''authenticated denial'')', 'permission denied');
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE service_role;
SELECT public.procesar_revision_ubicacion_casa('11111111-1111-4111-8111-111111112101'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'::uuid, 'aprobar', 'service role approves review using supplied admin actor');
SELECT pg_temp.assert_raises('service role rejects unauthorized review actor', 'SELECT public.procesar_revision_ubicacion_casa(''11111111-1111-4111-8111-111111112102''::uuid, ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01''::uuid, ''aprobar'', ''service role unauthorized'')', 'sin_permisos');
SELECT pg_temp.assert_raises('service role rejects out-of-scope leader assignment', 'SELECT public.asignar_casa_anfitriona_a_grupo(''11111111-1111-4111-8111-111111112105''::uuid, ''88888888-8888-4888-8888-888888889104''::uuid, ''77777777-7777-4777-8777-777777778104''::uuid)', 'sin_permisos');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);

SELECT pg_temp.assert_float('approval switches map to new approved coordinates', (SELECT latitud FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('admin_auth_id'), 'active') WHERE grupo_id = fixture_id('approved_group_id')), 10.2);
SELECT pg_temp.assert_count('approval writes review audit event', (SELECT COUNT(*) FROM public.casa_anfitriona_audit_events WHERE casa_anfitriona_id = fixture_id('approved_casa_id') AND event_type = 'location_review_aprobar'), 1);
INSERT INTO public.casa_anfitriona_location_reviews(id, casa_anfitriona_id, proposed_direccion_id, requested_by_user_id, review_type, status)
VALUES (fixture_id('reject_review_id'), fixture_id('approved_casa_id'), fixture_id('reject_direction_id'), fixture_id('member_user_id'), 'location_change', 'pending');
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE service_role;
SELECT public.procesar_revision_ubicacion_casa('11111111-1111-4111-8111-111111112101'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03'::uuid, 'rechazar', 'service role contract reject');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', fixture_id('admin_auth_id')::text, true);
SELECT pg_temp.assert_float('rejection preserves previous approved coordinates', (SELECT latitud FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('admin_auth_id'), 'active') WHERE grupo_id = fixture_id('approved_group_id')), 10.2);
SELECT pg_temp.assert_count('rejection writes review audit event', (SELECT COUNT(*) FROM public.casa_anfitriona_audit_events WHERE casa_anfitriona_id = fixture_id('approved_casa_id') AND event_type = 'location_review_rechazar'), 1);
SELECT pg_temp.assert_raises('Casa already assigned to another active group is denied', format('SELECT public.asignar_casa_anfitriona_a_grupo(%L::uuid, %L::uuid, %L::uuid)', fixture_id('admin_auth_id'), fixture_id('out_scope_group_id'), fixture_id('approved_casa_id')), 'casa_en_uso');

SELECT set_config('request.jwt.claim.sub', fixture_id('leader_auth_id')::text, true);
SELECT pg_temp.assert_raises('global leader role alone cannot assign owned Casa to unmanaged group', format('SELECT public.asignar_casa_anfitriona_a_grupo(%L::uuid, %L::uuid, %L::uuid)', fixture_id('leader_auth_id'), fixture_id('out_scope_group_id'), fixture_id('leader_owned_casa_id')), 'sin_permisos');
SELECT public.asignar_casa_anfitriona_a_grupo(fixture_id('leader_auth_id'), fixture_id('manual_group_id'), fixture_id('assignment_casa_id'));
SELECT pg_temp.assert_count('assignment succeeds for scoped leader', (SELECT COUNT(*) FROM public.grupos WHERE id = fixture_id('manual_group_id') AND casa_anfitriona_id = fixture_id('assignment_casa_id')), 1);
SELECT pg_temp.assert_count('assignment writes audit event', (SELECT COUNT(*) FROM public.casa_anfitriona_audit_events WHERE casa_anfitriona_id = fixture_id('assignment_casa_id') AND grupo_id = fixture_id('manual_group_id') AND event_type = 'group_assigned'), 1);

SELECT set_config('request.jwt.claim.sub', fixture_id('member_auth_id')::text, true);
SELECT pg_temp.assert_raises('ordinary member cannot assign Casa Anfitriona', format('SELECT public.asignar_casa_anfitriona_a_grupo(%L::uuid, %L::uuid, %L::uuid)', fixture_id('member_auth_id'), fixture_id('manual_group_id'), fixture_id('assignment_casa_id')), 'sin_permisos');
SELECT pg_temp.assert_count('member layer hides pins from ordinary member', (SELECT COUNT(*) FROM public.obtener_mapa_miembros(fixture_id('member_auth_id'), 'active')), 0);

SELECT set_config('request.jwt.claim.sub', fixture_id('director_auth_id')::text, true);
SELECT pg_temp.assert_count('pending review queue hides pending work from director etapa', (SELECT COUNT(*) FROM public.obtener_casas_revision_pendiente(fixture_id('director_auth_id')) WHERE review_id = fixture_id('pending_create_review_id')), 0);

SELECT set_config('request.jwt.claim.sub', fixture_id('outsider_auth_id')::text, true);
SELECT pg_temp.assert_count('spoofed p_auth_id is denied', (SELECT COUNT(*) FROM public.obtener_mapa_grupos_vida_host_homes(fixture_id('director_auth_id'), 'active')), 0);

ROLLBACK;
