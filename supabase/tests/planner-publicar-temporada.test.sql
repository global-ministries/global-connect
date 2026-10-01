-- planner_publicar_temporada — publicación y activación atómica de una temporada de GDV.
--
-- Cubre:
--   1. Autorización: sin sesión (28000), líder rechazado (42501), director-etapa publica pero
--      NO activa (42501), admin / pastor / director-general activan; anon sin EXECUTE.
--   2. Temporada: inexistente, finalizada, activa y sin grupos se rechazan.
--   3. Validación previa sin escribir nada: grupo sin Líder, grupo sin director de etapa,
--      director de otro segmento y persona duplicada en dos grupos (22023, nada aprobado).
--   4. Publicar sin activar: aprobado + aprobado_en/aprobado_por, grupos siguen 'proximo' e
--      inactivos, la temporada no se activa; republicar es idempotente.
--   5. Activar: la temporada activa anterior pasa a finalizada/activa=false, queda exactamente
--      una temporada activa, los grupos nuevos quedan 'activo'/activo=true y los de la
--      temporada anterior no se tocan.
--
-- Se ejecuta contra STAGING dentro de BEGIN…ROLLBACK: nada se conserva; los datos viven
-- en el espacio e6000000-... y toda persona de prueba tiene nombre 'ZZ Pt'. El último
-- statement es un SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pt_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pt_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Pt' AND apellido = p_tag;
$$;

-- Llama al RPC como la identidad simulada actual; devuelve el jsonb como texto o ERR:<sqlstate>.
CREATE OR REPLACE FUNCTION pg_temp.pub(p_temporada uuid, p_activar boolean DEFAULT false)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.outcome(format(
    'SELECT (public.planner_publicar_temporada(%L, %L))::text', p_temporada, p_activar));
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- Determinismo: cualquier temporada activa preexistente (staging) se cierra dentro de esta
-- transacción (se revierte con el ROLLBACK); sus grupos no se tocan. Así la única temporada
-- activa antes de activar es la ZZ Pt ACT de abajo.
UPDATE public.temporadas SET activa = false, estado = 'finalizada'
 WHERE activa IS TRUE OR lower(btrim(coalesce(estado, ''))) = 'activa';

-- Temporadas: c1 ACT (activa), c2 FIN (finalizada), c3 EMP (sin grupos), c4 sin Líder,
-- c5 sin director, c6 persona duplicada, c7 director de otro segmento, c8 OK1, c9 OK2.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6000000-0000-4000-8000-0000000000c1', 'ZZ Pt ACT', current_date - 10, current_date + 100, true, 'activa'),
  ('e6000000-0000-4000-8000-0000000000c2', 'ZZ Pt FIN', current_date - 900, current_date - 500, false, 'finalizada'),
  ('e6000000-0000-4000-8000-0000000000c3', 'ZZ Pt EMP', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c4', 'ZZ Pt SINLIDER', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c5', 'ZZ Pt SINDIR', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c6', 'ZZ Pt DUP', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c7', 'ZZ Pt SEG', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c8', 'ZZ Pt OK1', current_date + 200, current_date + 300, false, 'planificacion'),
  ('e6000000-0000-4000-8000-0000000000c9', 'ZZ Pt OK2', current_date + 310, current_date + 400, false, 'planificacion');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6000000-0000-4000-8000-0000000000a1', 'ZZ Pt S1'),
  ('e6000000-0000-4000-8000-0000000000a2', 'ZZ Pt S2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e6000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzpt-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzpt-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzpt-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzpt-de@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzpt-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- ADM admin, PAS pastor, DG director general, DE director de etapa (S1), LID líder, DE2 director (S2);
-- P1..P9 personas sin cuenta.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e6000000-0000-4000-8000-000000000001', 'ZZ Pt', 'ADM', 'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000101'),
  ('e6000000-0000-4000-8000-000000000002', 'ZZ Pt', 'PAS', 'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000102'),
  ('e6000000-0000-4000-8000-000000000003', 'ZZ Pt', 'DG',  'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000103'),
  ('e6000000-0000-4000-8000-000000000004', 'ZZ Pt', 'DE',  'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000104'),
  ('e6000000-0000-4000-8000-000000000005', 'ZZ Pt', 'LID', 'Otro', 'Soltero', 'e6000000-0000-4000-8000-000000000105'),
  ('e6000000-0000-4000-8000-000000000006', 'ZZ Pt', 'DE2', 'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000011', 'ZZ Pt', 'P1',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000012', 'ZZ Pt', 'P2',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000013', 'ZZ Pt', 'P3',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000014', 'ZZ Pt', 'P4',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000015', 'ZZ Pt', 'P5',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000016', 'ZZ Pt', 'P6',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000017', 'ZZ Pt', 'P7',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000018', 'ZZ Pt', 'P8',  'Otro', 'Soltero', NULL),
  ('e6000000-0000-4000-8000-000000000019', 'ZZ Pt', 'P9',  'Otro', 'Soltero', NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e6000000-0000-4000-8000-000000000001', 'admin'),
    ('e6000000-0000-4000-8000-000000000002', 'pastor'),
    ('e6000000-0000-4000-8000-000000000003', 'director-general'),
    ('e6000000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e6000000-0000-4000-8000-000000000005', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

-- Directores de etapa: DE dirige S1 (b1); DE2 dirige solo S2 (b3).
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6000000-0000-4000-8000-0000000000b1', 'e6000000-0000-4000-8000-0000000000a1', 'e6000000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e6000000-0000-4000-8000-0000000000b3', 'e6000000-0000-4000-8000-0000000000a2', 'e6000000-0000-4000-8000-000000000006', 'director_etapa');

-- Grupos (todos en S1; los planificados 'proximo', inactivos, 'pendiente').
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, estado_ciclo, estado_aprobacion) VALUES
  ('e6000000-0000-4000-8000-000000000d11', 'ZZ Pt grupo ACT', 'e6000000-0000-4000-8000-0000000000c1', 'e6000000-0000-4000-8000-0000000000a1', true,  'activo',  'aprobado'),
  ('e6000000-0000-4000-8000-000000000d12', 'ZZ Pt ACT proximo', 'e6000000-0000-4000-8000-0000000000c1', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'aprobado'),
  ('e6000000-0000-4000-8000-000000000d13', 'ZZ Pt ACT cancelado', 'e6000000-0000-4000-8000-0000000000c1', 'e6000000-0000-4000-8000-0000000000a1', false, 'cancelado', 'aprobado'),
  ('e6000000-0000-4000-8000-000000000d14', 'ZZ Pt ACT eliminado', 'e6000000-0000-4000-8000-0000000000c1', 'e6000000-0000-4000-8000-0000000000a1', true, 'activo', 'aprobado'),
  ('e6000000-0000-4000-8000-000000000d41', 'ZZ Pt sin lider', 'e6000000-0000-4000-8000-0000000000c4', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d51', 'ZZ Pt sin director', 'e6000000-0000-4000-8000-0000000000c5', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d61', 'ZZ Pt dup A', 'e6000000-0000-4000-8000-0000000000c6', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d62', 'ZZ Pt dup B', 'e6000000-0000-4000-8000-0000000000c6', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d71', 'ZZ Pt otro segmento', 'e6000000-0000-4000-8000-0000000000c7', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d81', 'ZZ Pt ok1 A', 'e6000000-0000-4000-8000-0000000000c8', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d82', 'ZZ Pt ok1 B', 'e6000000-0000-4000-8000-0000000000c8', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente'),
  ('e6000000-0000-4000-8000-000000000d91', 'ZZ Pt ok2 A', 'e6000000-0000-4000-8000-0000000000c9', 'e6000000-0000-4000-8000-0000000000a1', false, 'proximo', 'pendiente');

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion) VALUES
  ('e6000000-0000-4000-8000-000000000d11', 'e6000000-0000-4000-8000-000000000011', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d41', 'e6000000-0000-4000-8000-000000000012', 'Miembro', 'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d51', 'e6000000-0000-4000-8000-000000000013', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d61', 'e6000000-0000-4000-8000-000000000014', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d62', 'e6000000-0000-4000-8000-000000000015', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d62', 'e6000000-0000-4000-8000-000000000014', 'Miembro', 'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d71', 'e6000000-0000-4000-8000-000000000016', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d81', 'e6000000-0000-4000-8000-000000000017', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d82', 'e6000000-0000-4000-8000-000000000018', 'Líder',   'activo', current_date),
  ('e6000000-0000-4000-8000-000000000d91', 'e6000000-0000-4000-8000-000000000019', 'Líder',   'activo', current_date);

UPDATE public.grupos SET eliminado = true WHERE id = 'e6000000-0000-4000-8000-000000000d14';

-- Vínculos de director: todos hacia b1 (S1), salvo d51 (sin vínculo) y d71 (b3 = director de S2).
INSERT INTO public.director_etapa_grupos (grupo_id, director_etapa_id) VALUES
  ('e6000000-0000-4000-8000-000000000d11', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d41', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d61', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d62', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d71', 'e6000000-0000-4000-8000-0000000000b3'),
  ('e6000000-0000-4000-8000-000000000d81', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d82', 'e6000000-0000-4000-8000-0000000000b1'),
  ('e6000000-0000-4000-8000-000000000d91', 'e6000000-0000-4000-8000-0000000000b1');

-- Cases ----------------------------------------------------------------------

-- 1. Autorización.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('auth: sin sesión se rechaza con 28000',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8')$q$, 'ERR:28000');

SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('auth: líder se rechaza con 42501',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8')$q$, 'ERR:42501');

SELECT pg_temp.assert_eq('privilegios: anon no ejecuta',
  $q$SELECT has_function_privilege('anon', 'public.planner_publicar_temporada(uuid,boolean)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('privilegios: authenticated ejecuta',
  $q$SELECT has_function_privilege('authenticated', 'public.planner_publicar_temporada(uuid,boolean)', 'EXECUTE')::text$q$, 'true');
SELECT pg_temp.assert_eq('metadatos: security definer con search_path fijo',
  $q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '')
       FROM pg_proc p WHERE p.oid = 'public.planner_publicar_temporada(uuid,boolean)'::regprocedure$q$, 'true{search_path=public}');

-- 2. Temporada.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('temporada: inexistente se rechaza',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000ee')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: finalizada se rechaza',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c2')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: finalizada no se activa',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c2', true)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: la activa no se vuelve a publicar',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c1')$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: la activa no se vuelve a activar',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c1', true)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: sin grupos se rechaza',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c3')$q$, 'ERR:22023');

-- 3. Validación previa: se rechaza y no se escribe nada.
SELECT pg_temp.assert_eq('validación: grupo sin Líder se rechaza y no escribe',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c4', true) || ':' ||
       (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c4' AND estado_aprobacion = 'aprobado')::text || ':' ||
       (SELECT estado FROM public.temporadas WHERE id = 'e6000000-0000-4000-8000-0000000000c4')$q$,
  'ERR:22023:0:planificacion');
SELECT pg_temp.assert_eq('validación: grupo sin director se rechaza y no escribe',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c5') || ':' ||
       (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c5' AND estado_aprobacion = 'aprobado')::text$q$,
  'ERR:22023:0');
SELECT pg_temp.assert_eq('validación: persona en dos grupos se rechaza y no escribe',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c6', true) || ':' ||
       (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c6' AND estado_aprobacion = 'aprobado')::text || ':' ||
       (SELECT count(*) FROM public.temporadas WHERE activa AND nombre LIKE 'ZZ Pt%')::text$q$,
  'ERR:22023:0:1');
SELECT pg_temp.assert_eq('validación: director de otro segmento se rechaza y no escribe',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c7') || ':' ||
       (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c7' AND estado_aprobacion = 'aprobado')::text$q$,
  'ERR:22023:0');
DO $$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.planner_publicar_temporada('e6000000-0000-4000-8000-0000000000c4', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS NULL OR v_msg NOT LIKE '%ZZ Pt sin lider%' OR v_msg LIKE '%P2%' THEN
    PERFORM pg_temp.fail('validación: mensaje con nombre de grupo', coalesce(v_msg, 'sin error'));
  END IF;
END $$;

-- 4. Director-etapa publica, pero no activa.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('auth: director-etapa NO puede activar (42501) y no escribe',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8', true) || ':' ||
       (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c8' AND estado_aprobacion = 'aprobado')::text$q$,
  'ERR:42501:0');
SELECT pg_temp.assert_eq('publicar sin activar: director-etapa publica OK1',
  $q$SELECT (r::jsonb)->>'publicados' || '/' || ((r::jsonb)->>'ya_aprobados') || '/' || ((r::jsonb)->>'activada') || '/' || ((r::jsonb)->>'grupos_activados')
       FROM (SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8') AS r) x$q$, '2/0/false/0');
SELECT pg_temp.assert_eq('publicar sin activar: grupos aprobados, proximo, inactivos, con aprobado_en y aprobado_por',
  $q$SELECT count(*)::text FROM public.grupos
      WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c8'
        AND estado_aprobacion = 'aprobado' AND estado_ciclo = 'proximo' AND activo = false
        AND aprobado_en IS NOT NULL AND aprobado_por = 'e6000000-0000-4000-8000-000000000004'$q$, '2');
SELECT pg_temp.assert_eq('publicar sin activar: la temporada sigue en planificación y la activa no cambia',
  $q$SELECT (SELECT estado || activa::text FROM public.temporadas WHERE id = 'e6000000-0000-4000-8000-0000000000c8')
       || ':' || (SELECT estado || activa::text FROM public.temporadas WHERE id = 'e6000000-0000-4000-8000-0000000000c1')$q$,
  'planificacionfalse:activatrue');
SELECT pg_temp.assert_eq('publicar sin activar: no toca los grupos de la temporada activa',
  $q$SELECT estado_ciclo || activo::text FROM public.grupos WHERE id = 'e6000000-0000-4000-8000-000000000d11'$q$, 'activotrue');
SELECT pg_temp.assert_eq('idempotencia: republicar no vuelve a aprobar',
  $q$SELECT (r::jsonb)->>'publicados' || '/' || ((r::jsonb)->>'ya_aprobados')
       FROM (SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8') AS r) x$q$, '0/2');

-- 5. Activación (admin): cambio de temporada.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('activar: OK1 reemplaza a la temporada activa anterior',
  $q$SELECT (r::jsonb)->>'activada' || '/' || ((r::jsonb)->>'grupos_activados') || '/' || ((r::jsonb)->>'grupos_archivados')
         || '/' || (((r::jsonb)->>'temporada_anterior_id') = 'e6000000-0000-4000-8000-0000000000c1')::text
       FROM (SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8', true) AS r) x$q$, 'true/2/2/true');
SELECT pg_temp.assert_eq('activar: exactamente una temporada activa (OK1)',
  $q$SELECT count(*)::text || ':' || coalesce(string_agg(id::text, ','), '')
       FROM public.temporadas WHERE (activa OR estado = 'activa') AND nombre LIKE 'ZZ Pt%'$q$,
  '1:e6000000-0000-4000-8000-0000000000c8');
SELECT pg_temp.assert_eq('activar: temporada anterior finalizada e inactiva',
  $q$SELECT estado || activa::text FROM public.temporadas WHERE id = 'e6000000-0000-4000-8000-0000000000c1'$q$, 'finalizadafalse');
SELECT pg_temp.assert_eq('activar: grupos nuevos activo / activo=true / aprobado',
  $q$SELECT count(*)::text FROM public.grupos
      WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c8'
        AND estado_ciclo = 'activo' AND activo = true AND estado_aprobacion = 'aprobado'$q$, '2');
SELECT pg_temp.assert_eq('activar: los grupos vigentes de la temporada anterior quedan archivado/inactivos',
  $q$SELECT string_agg(estado_ciclo || activo::text, ',' ORDER BY id) FROM public.grupos
      WHERE id IN ('e6000000-0000-4000-8000-000000000d11', 'e6000000-0000-4000-8000-000000000d12')$q$, 'archivadofalse,archivadofalse');
SELECT pg_temp.assert_eq('activar: grupos cancelado y eliminado de la anterior quedan intactos',
  $q$SELECT string_agg(estado_ciclo || activo::text || eliminado::text, ',' ORDER BY id) FROM public.grupos
      WHERE id IN ('e6000000-0000-4000-8000-000000000d13', 'e6000000-0000-4000-8000-000000000d14')$q$, 'canceladofalsefalse,activotruetrue');
SELECT pg_temp.assert_eq('activar: miembros y vínculos de director de la anterior intactos',
  $q$SELECT (SELECT count(*) FROM public.grupo_miembros WHERE grupo_id = 'e6000000-0000-4000-8000-000000000d11' AND estado = 'activo')::text
       || ':' || (SELECT count(*) FROM public.director_etapa_grupos WHERE grupo_id = 'e6000000-0000-4000-8000-000000000d11')::text$q$, '1:1');
SELECT pg_temp.assert_eq('activar: reactivar la ya activa se rechaza',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c8', true)$q$, 'ERR:22023');

-- Activación directa sin publicar antes (pastor): OK2 reemplaza a OK1.
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('activar: pastor publica y activa OK2 en una sola llamada',
  $q$SELECT (r::jsonb)->>'publicados' || '/' || ((r::jsonb)->>'grupos_activados')
         || '/' || (((r::jsonb)->>'temporada_anterior_id') = 'e6000000-0000-4000-8000-0000000000c8')::text
       FROM (SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c9', true) AS r) x$q$, '1/1/true');
SELECT pg_temp.assert_eq('activar: sigue habiendo exactamente una temporada activa (OK2)',
  $q$SELECT count(*)::text || ':' || coalesce(string_agg(id::text, ','), '')
       FROM public.temporadas WHERE (activa OR estado = 'activa') AND nombre LIKE 'ZZ Pt%'$q$,
  '1:e6000000-0000-4000-8000-0000000000c9');
SELECT pg_temp.assert_eq('activar: OK1 quedó finalizada y sus 2 grupos archivados',
  $q$SELECT (SELECT estado || activa::text FROM public.temporadas WHERE id = 'e6000000-0000-4000-8000-0000000000c8')
       || ':' || (SELECT count(*) FROM public.grupos WHERE temporada_id = 'e6000000-0000-4000-8000-0000000000c8' AND NOT activo AND estado_ciclo = 'archivado')::text$q$,
  'finalizadafalse:2');

SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('auth: director-general puede activar (temporada ya activa -> 22023, no 42501)',
  $q$SELECT pg_temp.pub('e6000000-0000-4000-8000-0000000000c9', true)$q$, 'ERR:22023');

-- Resultado: los casos fallidos (vacío = todo bien).
SELECT case_name AS failing_cases FROM t_pt_failures ORDER BY case_name;

ROLLBACK;
