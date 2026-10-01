-- planner_guardar_planificacion — guardado atómico de la planificación de GDV.
--
-- Cubre:
--   1. Autorización: sin sesión (28000), líder rechazado (42501), admin / pastor /
--      director-general / director-etapa permitidos; anon sin EXECUTE.
--   2. Temporada: activa rechazada, destino = origen rechazado, finalizada rechazada.
--   3. Un grupo de otra temporada (importado del origen) NUNCA se actualiza: se inserta
--      uno nuevo en el destino y el original queda intacto.
--   4. Persona duplicada entre grupos: se rechaza y NO se escribe nada (atomicidad).
--   5. Conciliación de miembros (alta, cambio de rol, baja) y rol fuera del enum.
--   6. Baja lógica de grupos del destino; id de otra temporada en eliminados se rechaza.
--
-- Se ejecuta contra STAGING dentro de BEGIN…ROLLBACK: nada se conserva; los datos viven
-- en el espacio e5000000-... y toda persona de prueba tiene nombre 'ZZ Pg'. El último
-- statement es un SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pg_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pg_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', obtenido ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- Ejecuta un statement y devuelve su resultado, o 'ERR:<sqlstate>' si lanza.
CREATE OR REPLACE FUNCTION pg_temp.outcome(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  RETURN coalesce(v_actual, 'NULL');
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_auth uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', p_auth::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.a(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Pg' AND apellido = p_tag;
$$;

-- Llama al RPC como la identidad simulada actual; devuelve el jsonb como texto o ERR:<sqlstate>.
-- p_destino / p_origen son ids de temporada; p_grupos es jsonb en texto; p_elim un literal uuid[].
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_destino uuid, p_origen uuid, p_grupos text, p_elim text DEFAULT '{}')
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.outcome(format(
    'SELECT (public.planner_guardar_planificacion(%L, %L, %L::jsonb, %L::uuid[]))::text',
    p_destino, p_origen, p_grupos, p_elim));
$$;

CREATE OR REPLACE FUNCTION pg_temp.n(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN v; END;
$$;

-- Payload de un solo grupo válido, con campos extra/sobrescritos.
CREATE OR REPLACE FUNCTION pg_temp.un_grupo(p_extra jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'id', NULL, 'clave', 'm1', 'nombre', 'ZZ Pg malformado',
    'director_etapa_id', 'e5000000-0000-4000-8000-000000000004',
    'segmento_id', 'e5000000-0000-4000-8000-0000000000a1', 'miembros', '[]'::jsonb) || p_extra)::text;
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- Temporadas: ORI (origen, finalizada), DST (destino futura), ACT (activa), FIN (finalizada).
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e5000000-0000-4000-8000-0000000000c1', 'ZZ Pg ORI', current_date - 400, current_date - 200, false, 'finalizada'),
  ('e5000000-0000-4000-8000-0000000000c2', 'ZZ Pg DST', current_date + 200, current_date + 400, false, 'planificacion'),
  ('e5000000-0000-4000-8000-0000000000c3', 'ZZ Pg ACT', current_date - 10, current_date + 100, false, 'activa'),
  ('e5000000-0000-4000-8000-0000000000c4', 'ZZ Pg FIN', current_date - 900, current_date - 500, false, 'finalizada');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e5000000-0000-4000-8000-0000000000a1', 'ZZ Pg S1'),
  ('e5000000-0000-4000-8000-0000000000a2', 'ZZ Pg S2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e5000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzpg-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzpg-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzpg-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzpg-de@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e5000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzpg-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- ADM admin, PAS pastor, DG director general, DE director de etapa, LID líder; P1..P4 personas.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'ZZ Pg', 'ADM', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000101'),
  ('e5000000-0000-4000-8000-000000000002', 'ZZ Pg', 'PAS', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000102'),
  ('e5000000-0000-4000-8000-000000000003', 'ZZ Pg', 'DG',  'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000103'),
  ('e5000000-0000-4000-8000-000000000004', 'ZZ Pg', 'DE',  'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000104'),
  ('e5000000-0000-4000-8000-000000000005', 'ZZ Pg', 'LID', 'Otro', 'Soltero', 'e5000000-0000-4000-8000-000000000105'),
  ('e5000000-0000-4000-8000-000000000006', 'ZZ Pg', 'DE2', 'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000007', 'ZZ Pg', 'DE3', 'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000011', 'ZZ Pg', 'P1',  'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000012', 'ZZ Pg', 'P2',  'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000013', 'ZZ Pg', 'P3',  'Otro', 'Soltero', NULL),
  ('e5000000-0000-4000-8000-000000000014', 'ZZ Pg', 'P4',  'Otro', 'Soltero', NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e5000000-0000-4000-8000-000000000001', 'admin'),
    ('e5000000-0000-4000-8000-000000000002', 'pastor'),
    ('e5000000-0000-4000-8000-000000000003', 'director-general'),
    ('e5000000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e5000000-0000-4000-8000-000000000005', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

-- Directores de etapa: DE y DE3 dirigen S1 (b1, b2); DE2 dirige solo S2 (b3); P1 no es director.
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e5000000-0000-4000-8000-0000000000b1', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b2', 'e5000000-0000-4000-8000-0000000000a1', 'e5000000-0000-4000-8000-000000000007', 'director_etapa'),
  ('e5000000-0000-4000-8000-0000000000b3', 'e5000000-0000-4000-8000-0000000000a2', 'e5000000-0000-4000-8000-000000000006', 'director_etapa');

-- Grupo del origen (e5...d1) y grupo ya existente del destino (e5...d2, aprobado).
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_ciclo, estado_aprobacion) VALUES
  ('e5000000-0000-4000-8000-0000000000d1', 'ZZ Pg origen', 'e5000000-0000-4000-8000-0000000000c1', 'e5000000-0000-4000-8000-0000000000a1', false, 'archivado', 'aprobado'),
  ('e5000000-0000-4000-8000-0000000000d2', 'ZZ Pg destino viejo', 'e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000a1', true, 'activo', 'aprobado'),
  ('e5000000-0000-4000-8000-0000000000d3', 'ZZ Pg destino baja', 'e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente');

-- Cases ----------------------------------------------------------------------

-- 1. Autorización.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('auth: sin sesión se rechaza con 28000',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]')$q$, 'ERR:28000');

SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('auth: líder se rechaza con 42501',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]')$q$, 'ERR:42501');

SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('auth: pastor puede guardar (payload vacío)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]') ~ '"insertados": 0'$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('auth: director general puede guardar (payload vacío)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]') ~ '"insertados": 0'$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('auth: director de etapa puede guardar (payload vacío)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]') ~ '"insertados": 0'$q$, 'true');

SELECT pg_temp.assert_eq('privilegios: anon no ejecuta',
  $q$SELECT has_function_privilege('anon', 'public.planner_guardar_planificacion(uuid,uuid,jsonb,uuid[])', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('privilegios: authenticated ejecuta',
  $q$SELECT has_function_privilege('authenticated', 'public.planner_guardar_planificacion(uuid,uuid,jsonb,uuid[])', 'EXECUTE')::text$q$, 'true');
SELECT pg_temp.assert_eq('metadatos: security definer con search_path fijo',
  $q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '')
       FROM pg_proc p WHERE p.oid = 'public.planner_guardar_planificacion(uuid,uuid,jsonb,uuid[])'::regprocedure$q$, 'true{search_path=public}');

-- 2. Temporada.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('temporada: activa se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c3', 'e5000000-0000-4000-8000-0000000000c1', '[]')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: destino = origen se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c2', '[]')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: finalizada se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c4', 'e5000000-0000-4000-8000-0000000000c1', '[]')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: inexistente se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000ee', 'e5000000-0000-4000-8000-0000000000c1', '[]')$q$, 'ERR:22023');

-- 3. Un grupo de otra temporada nunca se actualiza: se inserta uno nuevo.
SELECT pg_temp.assert_eq('otra temporada: se inserta un grupo nuevo en el destino',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":"e5000000-0000-4000-8000-0000000000d1","clave":"k1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg importado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       ~ '"insertados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('otra temporada: el grupo del origen queda intacto',
  $q$SELECT nombre || estado_ciclo || estado_aprobacion || activo::text || temporada_id::text
       FROM public.grupos WHERE id = 'e5000000-0000-4000-8000-0000000000d1'$q$,
  'ZZ Pg origenarchivadoaprobadofalsee5000000-0000-4000-8000-0000000000c1');
SELECT pg_temp.assert_eq('otra temporada: el nuevo grupo es del destino, proximo, inactivo, pendiente',
  $q$SELECT estado_ciclo || estado_aprobacion || activo::text || eliminado::text
       FROM public.grupos WHERE nombre = 'ZZ Pg importado' AND temporada_id = 'e5000000-0000-4000-8000-0000000000c2'$q$,
  'proximopendientefalsefalse');

-- Un grupo del destino sí se actualiza: pasa a proximo/inactivo y conserva la aprobación.
SELECT pg_temp.assert_eq('destino: actualiza el grupo existente sin tocar la aprobación',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":"e5000000-0000-4000-8000-0000000000d2","clave":"k2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg destino renombrado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","capacidad_maxima":9,"miembros":[]}]')
       ~ '"actualizados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('destino: campos tras actualizar',
  $q$SELECT nombre || estado_ciclo || estado_aprobacion || activo::text || capacidad_maxima::text
       FROM public.grupos WHERE id = 'e5000000-0000-4000-8000-0000000000d2'$q$,
  'ZZ Pg destino renombradoproximoaprobadofalse9');

-- 4. Persona duplicada entre grupos: se rechaza y no se escribe nada.
SELECT pg_temp.assert_eq('duplicado: persona en dos grupos se rechaza con 22023 y no escribe',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"a","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg dup A","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-000000000011","rol":"Líder"}]},
         {"id":null,"clave":"b","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg dup B","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-000000000011","rol":"Miembro"}]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre LIKE 'ZZ Pg dup%')
       || (SELECT count(*)::text FROM public.grupo_miembros WHERE usuario_id = 'e5000000-0000-4000-8000-000000000011')$q$,
  'ERR:2202300');

-- Validación previa: un usuario inexistente en el segundo grupo aborta antes de escribir (el
-- rollback real a mitad de escritura se prueba en la sección 11).
SELECT pg_temp.assert_eq('validación previa: un usuario inexistente aborta todo, sin escribir el grupo válido',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"a","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg atom A","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-000000000011","rol":"Líder"}]},
         {"id":null,"clave":"b","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg atom B","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-0000000000ff","rol":"Miembro"}]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre LIKE 'ZZ Pg atom%')$q$,
  'ERR:220230');

-- 5. Conciliación de miembros y rol.
SELECT pg_temp.assert_eq('miembros: alta inicial de P1 (Líder) y P2 (Miembro)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":"e5000000-0000-4000-8000-0000000000d2","clave":"k2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg destino renombrado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[
         {"usuario_id":"e5000000-0000-4000-8000-000000000011","rol":"Líder"},
         {"usuario_id":"e5000000-0000-4000-8000-000000000012","rol":"Miembro"}]}]') ~ '"actualizados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('miembros: P1 Líder y P2 Miembro quedan guardados',
  $q$SELECT string_agg(right(usuario_id::text, 2) || rol::text || estado, ',' ORDER BY usuario_id)
       FROM public.grupo_miembros WHERE grupo_id = 'e5000000-0000-4000-8000-0000000000d2'$q$,
  '11Líderactivo,12Miembroactivo');
SELECT pg_temp.assert_eq('miembros: reconcilia (P1 pasa a Colíder, P2 sale, P3 entra)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":"e5000000-0000-4000-8000-0000000000d2","clave":"k2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg destino renombrado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[
         {"usuario_id":"e5000000-0000-4000-8000-000000000011","rol":"Colíder"},
         {"usuario_id":"e5000000-0000-4000-8000-000000000013","rol":"Miembro"}]}]') ~ '"actualizados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('miembros: estado final tras reconciliar',
  $q$SELECT string_agg(right(usuario_id::text, 2) || rol::text, ',' ORDER BY usuario_id)
       FROM public.grupo_miembros WHERE grupo_id = 'e5000000-0000-4000-8000-0000000000d2'$q$,
  '11Colíder,13Miembro');
SELECT pg_temp.assert_eq('rol: valor fuera del enum se rechaza y no escribe',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"r","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg rol malo","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-000000000014","rol":"Jefe"}]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg rol malo')$q$,
  'ERR:220230');

-- 6. Bajas lógicas.
SELECT pg_temp.assert_eq('eliminar: baja lógica de un grupo del destino',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]',
       '{e5000000-0000-4000-8000-0000000000d3}') ~ '"eliminados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('eliminar: el grupo queda eliminado e inactivo (no se borra la fila)',
  $q$SELECT eliminado::text || activo::text FROM public.grupos WHERE id = 'e5000000-0000-4000-8000-0000000000d3'$q$, 'truefalse');
SELECT pg_temp.assert_eq('eliminar: un id de otra temporada se rechaza y el grupo queda intacto',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', '[]',
       '{e5000000-0000-4000-8000-0000000000d1}')
       || (SELECT eliminado::text FROM public.grupos WHERE id = 'e5000000-0000-4000-8000-0000000000d1')$q$,
  'ERR:22023false');

-- 7. Director de etapa.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('director: faltante se rechaza con 22023 y no escribe',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"sd","nombre":"ZZ Pg sin director","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg sin director')$q$, 'ERR:220230');
SELECT pg_temp.assert_eq('director: de otro segmento (no elegible) se rechaza y no escribe',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"in","director_etapa_id":"e5000000-0000-4000-8000-000000000006","nombre":"ZZ Pg dir ajeno","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg dir ajeno')$q$, 'ERR:220230');
SELECT pg_temp.assert_eq('director: una persona que no es director se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"in2","director_etapa_id":"e5000000-0000-4000-8000-000000000011","nombre":"ZZ Pg dir nadie","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg dir nadie')$q$, 'ERR:220230');
SELECT pg_temp.assert_eq('director: un director elegible se asigna a sí mismo y el vínculo se crea',
  $q$SELECT (pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"yo","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg yo dirijo","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       ~ '"insertados": 1')::text
       || (SELECT string_agg(right(deg.director_etapa_id::text, 2), ',') FROM public.director_etapa_grupos deg
             JOIN public.grupos g ON g.id = deg.grupo_id WHERE g.nombre = 'ZZ Pg yo dirijo')$q$, 'trueb1');
SELECT pg_temp.assert_eq('director: el vínculo se reemplaza al actualizar con otro director (DE3)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":"e5000000-0000-4000-8000-0000000000d2","clave":"k2","director_etapa_id":"e5000000-0000-4000-8000-000000000007","nombre":"ZZ Pg destino renombrado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       ~ '"actualizados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('director: queda un solo vínculo y es el nuevo',
  $q$SELECT count(*)::text || string_agg(right(director_etapa_id::text, 2), ',')
       FROM public.director_etapa_grupos WHERE grupo_id = 'e5000000-0000-4000-8000-0000000000d2'$q$, '1b2');

-- 8. Nombres duplicados.
SELECT pg_temp.assert_eq('nombre: duplicado dentro del envío (sin distinguir mayúsculas/espacios) se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"n1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg Igual","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]},
         {"id":null,"clave":"n2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"  zz pg igual ","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE lower(nombre) LIKE 'zz pg igual%')$q$, 'ERR:220230');
SELECT pg_temp.assert_eq('nombre: choque con un grupo existente del destino se rechaza y no escribe',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"n3","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"zz pg DESTINO renombrado","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE temporada_id = 'e5000000-0000-4000-8000-0000000000c2' AND eliminado = false AND lower(nombre) = 'zz pg destino renombrado')$q$, 'ERR:220231');
SELECT pg_temp.assert_eq('nombre: reusar el nombre de un grupo que se elimina en la misma llamada es válido',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"n4","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg yo dirijo","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]',
       (SELECT '{' || g.id::text || '}' FROM public.grupos g WHERE g.nombre = 'ZZ Pg yo dirijo'))
       ~ '"eliminados": 1'$q$, 'true');

-- 9. Helper de lectura.
SELECT pg_temp.assert_eq('helper: lista directores elegibles para un director de etapa',
  $q$SELECT (count(*) >= 3)::text FROM public.planner_directores_etapa_elegibles()$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('helper: líder se rechaza con 42501',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_directores_etapa_elegibles()')$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('helper: anon no ejecuta',
  $q$SELECT has_function_privilege('anon', 'public.planner_directores_etapa_elegibles()', 'EXECUTE')::text$q$, 'false');

-- 10. Orden de escritura / nombres (índice único): todos estos payloads son válidos.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
  '[{"id":null,"clave":"s1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg sw1","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]},
    {"id":null,"clave":"s2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg sw2","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]},
    {"id":null,"clave":"s3","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg rl1","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]');
SELECT pg_temp.assert_eq('nombres: intercambio de nombres entre dos grupos existentes',
  $q$SELECT (pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       (SELECT jsonb_build_array(
          jsonb_build_object('id', (SELECT id FROM public.grupos WHERE nombre = 'ZZ Pg sw1'), 'clave', 'x1', 'nombre', 'ZZ Pg sw2',
            'director_etapa_id', 'e5000000-0000-4000-8000-000000000004', 'segmento_id', 'e5000000-0000-4000-8000-0000000000a1'),
          jsonb_build_object('id', (SELECT id FROM public.grupos WHERE nombre = 'ZZ Pg sw2'), 'clave', 'x2', 'nombre', 'ZZ Pg sw1',
            'director_etapa_id', 'e5000000-0000-4000-8000-000000000004', 'segmento_id', 'e5000000-0000-4000-8000-0000000000a1'))::text))
       ~ '"actualizados": 2')::text$q$, 'true');
SELECT pg_temp.assert_eq('nombres: tras el intercambio no quedan nombres temporales',
  $q$SELECT count(*)::text FROM public.grupos
     WHERE temporada_id = 'e5000000-0000-4000-8000-0000000000c2' AND nombre LIKE '~%'$q$, '0');
SELECT pg_temp.assert_eq('nombres: re-guardar un grupo con su nombre sin cambios conserva el real',
  $q$SELECT (pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       (SELECT jsonb_build_array(jsonb_build_object('id', id, 'clave', 'u1', 'nombre', 'ZZ Pg rl1',
          'director_etapa_id', 'e5000000-0000-4000-8000-000000000004', 'segmento_id', 'e5000000-0000-4000-8000-0000000000a1'))::text
          FROM public.grupos WHERE nombre = 'ZZ Pg rl1'))
       ~ '"actualizados": 1')::text
       || (SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg rl1')$q$, 'true1');
SELECT pg_temp.assert_eq('nombres: un grupo nuevo toma el nombre de otro que se renombra más adelante',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       (SELECT jsonb_build_array(
          jsonb_build_object('id', NULL, 'clave', 'y1', 'nombre', 'ZZ Pg rl1',
            'director_etapa_id', 'e5000000-0000-4000-8000-000000000004', 'segmento_id', 'e5000000-0000-4000-8000-0000000000a1'),
          jsonb_build_object('id', (SELECT id FROM public.grupos WHERE nombre = 'ZZ Pg rl1'), 'clave', 'y2', 'nombre', 'ZZ Pg rl1 nuevo',
            'director_etapa_id', 'e5000000-0000-4000-8000-000000000004', 'segmento_id', 'e5000000-0000-4000-8000-0000000000a1'))::text))
       ~ '"insertados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('nombres: reusar el nombre de un grupo dado de baja en la misma llamada',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"z1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg sw1","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]',
       (SELECT '{' || id::text || '}' FROM public.grupos WHERE nombre = 'ZZ Pg sw1'))
       ~ '"eliminados": 1'$q$, 'true');

-- 11. Formato de entradas: 22023 claro (no 22P02) y nada escrito.
SELECT pg_temp.assert_eq('formato: id malformado',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"id":"xyz"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: segmento_id malformado',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"segmento_id":"no-es-uuid"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: director_etapa_id malformado',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"director_etapa_id":"123"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: usuario_id de miembro malformado',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"miembros":[{"usuario_id":"abc","rol":"Miembro"}]}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: capacidad no entera (texto)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"capacidad_maxima":"abc"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: capacidad no entera (decimal)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"capacidad_maxima":12.5}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: día de reunión inválido',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"dia_reunion":"Domingo2"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: hora de reunión inválida (25:99)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"hora_reunion":"25:99"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: hora de reunión inválida (texto)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"hora_reunion":"tarde"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: entradas válidas con día y hora se aceptan',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"dia_reunion":"Jueves","hora_reunion":"19:30","capacidad_maxima":10}')) ~ '"insertados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('formato: los rechazos anteriores no escribieron nada (solo el grupo válido)',
  $q$SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Pg malformado'$q$, '1');

-- 12. Rollback real a mitad de escritura: un trigger de prueba (revertido con la transacción)
-- hace fallar el INSERT del segundo grupo cuando ya se escribió el primero.
SELECT pg_temp.as_nobody();
RESET ROLE;
CREATE FUNCTION public.zz_pg_tg_falla() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nombre = 'ZZ Pg falla' THEN RAISE EXCEPTION 'fallo forzado' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pg_tg_falla BEFORE INSERT ON public.grupos FOR EACH ROW EXECUTE FUNCTION public.zz_pg_tg_falla();
SELECT pg_temp.as_user(pg_temp.a('ADM'));

SELECT pg_temp.assert_eq('rollback: el fallo del segundo grupo revierte el primero (grupo, miembros y vínculo)',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"rb1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg rb A","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-000000000014","rol":"Líder"}]},
         {"id":null,"clave":"rb2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg falla","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre IN ('ZZ Pg rb A', 'ZZ Pg falla'))
       || (SELECT count(*)::text FROM public.grupo_miembros WHERE usuario_id = 'e5000000-0000-4000-8000-000000000014')$q$,
  'ERR:P0001' || '0' || '0');

RESET ROLE;
DROP TRIGGER zz_pg_tg_falla ON public.grupos;
DROP FUNCTION public.zz_pg_tg_falla();
SELECT pg_temp.as_user(pg_temp.a('ADM'));

-- 13. Hora con formatos amplios, miembros mal formados y mayúsculas en uuid.
SELECT pg_temp.assert_eq('formato: hora 7:30 se acepta',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg h1","hora_reunion":"7:30"}')) ~ '"insertados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('formato: hora 19:30:00.000 se acepta',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg h2","hora_reunion":"19:30:00.000"}')) ~ '"insertados": 1'$q$, 'true');
SELECT pg_temp.assert_eq('formato: hora 25:00 se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg h3","hora_reunion":"25:00"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('hora: el literal especial now se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg h4","hora_reunion":"now"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('hora: el literal especial allballs se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg h5","hora_reunion":"allballs"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('nombres: un nombre que empieza con ~ se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"~abc123456789"}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: miembro escalar se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg m1","miembros":[5]}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('formato: miembro arreglo se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1', pg_temp.un_grupo('{"nombre":"ZZ Pg m2","miembros":[[1]]}'))$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('duplicado: mismo usuario con distinta capitalización en dos grupos se rechaza',
  $q$SELECT pg_temp.guardar('e5000000-0000-4000-8000-0000000000c2', 'e5000000-0000-4000-8000-0000000000c1',
       '[{"id":null,"clave":"c1","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg cap A","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"e5000000-0000-4000-8000-00000000001a","rol":"Miembro"}]},
         {"id":null,"clave":"c2","director_etapa_id":"e5000000-0000-4000-8000-000000000004","nombre":"ZZ Pg cap B","segmento_id":"e5000000-0000-4000-8000-0000000000a1","miembros":[{"usuario_id":"E5000000-0000-4000-8000-00000000001A","rol":"Miembro"}]}]')
       || (SELECT count(*)::text FROM public.grupos WHERE nombre LIKE 'ZZ Pg cap%')$q$, 'ERR:220230');
SELECT pg_temp.assert_eq('nombres: tras guardados exitosos ningún grupo del destino empieza con ~',
  $q$SELECT count(*)::text FROM public.grupos WHERE temporada_id = 'e5000000-0000-4000-8000-0000000000c2' AND nombre LIKE '~%'$q$, '0');

-- Resultado: los casos fallidos (vacío = todo bien).
SELECT case_name AS failing_cases FROM t_pg_failures ORDER BY case_name;

ROLLBACK;
