-- planner_guardar_cambios — guardar manual del planificador de GDV
-- (S24 de odd/tasks/planner-gdv.md; contexto S10, S13, S15, S17, S22).
--
-- Cubre:
--   1. Privilegios: anon sin EXECUTE, authenticated con EXECUTE, SECURITY DEFINER con search_path fijo.
--   2. Autorización: sin sesión 28000; un rol que no planifica 42501.
--   3. Temporada: inexistente 22023; fuera de planificación 22023.
--   4. Forma (22023, sin escribir nada): no es lista, vacía, 201 cambios, tipo desconocido, claves de
--      más, ids mal formados, rol no válido, clave tmp mal formada, repetida, desconocida o usada
--      antes de su "crear". Los errores de un cambio llevan "Cambio N de M: " y DETAIL {"indice": i}.
--   5. Camino feliz: crear + mover a "tmp:" + editar "tmp:" + mover + eliminar en orden; un paso por
--      cambio, en el mismo orden que devuelve; historial; S17; cada paso se deshace con las reglas de
--      T2 (del último al primero; antes, uno anterior está bloqueado por el posterior).
--   6. Todo o nada: si falla el cambio 3 de 4 (director de etapa moviendo a otro segmento) o el 2 de 2
--      (eliminar un grupo que ya arrancó, S22) no queda nada guardado (grupos, personas, directores,
--      pasos, marcas) y el error lleva el mismo SQLSTATE, el prefijo y el índice.
--   7. Grupos de otra temporada: editar, eliminar o mover a uno da 22023.
--
-- Se ejecuta dentro de BEGIN…ROLLBACK (staging o el arnés local): nada se conserva; los datos viven
-- en el espacio e6300000-... con nombre 'ZZ Gc' y fechas en 2093–2095. El último statement es un
-- SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_gc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_gc_asserts (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_gc_res (n serial, r jsonb) ON COMMIT DROP;
CREATE TEMP TABLE t_gc_foto (tag text PRIMARY KEY, foto jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON t_gc_failures, t_gc_asserts, t_gc_res, t_gc_foto TO authenticated;
GRANT USAGE ON SEQUENCE t_gc_res_n_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.gc_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  INSERT INTO t_gc_asserts(case_name) VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v_actual;
    IF v_actual IS DISTINCT FROM p_expected THEN
      INSERT INTO t_gc_failures(case_name)
      VALUES (p_case || ': esperado ' || coalesce(p_expected, 'NULL') || ', obtenido ' || coalesce(v_actual, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO t_gc_failures(case_name)
      VALUES (p_case || ': esperado ' || coalesce(p_expected, 'NULL') || ', error ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- 'ERR:<sqlstate> <mensaje>' de un statement ('ok' si no falla; sus efectos se revierten).
CREATE OR REPLACE FUNCTION pg_temp.gc_err(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLSTATE || ' ' || SQLERRM; END;
$$;

-- DETAIL del error de un statement ('ok' si no falla).
CREATE OR REPLACE FUNCTION pg_temp.gc_detalle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN 'ok';
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v = PG_EXCEPTION_DETAIL;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.gc_as(p_tag text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', coalesce((SELECT auth_id::text FROM public.usuarios WHERE nombre = 'ZZ Gc' AND apellido = p_tag), ''), true),
         set_config('request.jwt.claim.role', CASE WHEN p_tag IS NULL THEN '' ELSE 'authenticated' END, true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.gc_u(p_tag text)
RETURNS text LANGUAGE sql AS $$
  SELECT id::text FROM public.usuarios WHERE nombre = 'ZZ Gc' AND apellido = p_tag;
$$;

-- Guarda en la temporada c1 y devuelve el resultado (también queda en t_gc_res).
CREATE OR REPLACE FUNCTION pg_temp.gc_guardar(p_cambios jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_guardar_cambios('e6300000-0000-4000-8000-0000000000c1', p_cambios);
  INSERT INTO t_gc_res(r) VALUES (r);
  RETURN r::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.gc_res()
RETURNS jsonb LANGUAGE sql AS $$
  SELECT r FROM t_gc_res ORDER BY n DESC LIMIT 1;
$$;

-- Id de un grupo por nombre en c1 ('ZZ Gc ' + etiqueta).
CREATE OR REPLACE FUNCTION pg_temp.gc_g(p_tag text)
RETURNS text LANGUAGE sql AS $$
  SELECT id::text FROM public.grupos WHERE nombre = 'ZZ Gc ' || p_tag;
$$;

-- Grupos vigentes de una persona en c1 como 'Grupo:Rol' ('-' = en el banco).
CREATE OR REPLACE FUNCTION pg_temp.gc_vig(p_persona text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(g.nombre, 'ZZ Gc ', '') || ':' || gm.rol::text, ',' ORDER BY g.nombre), '-')
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id AND NOT g.eliminado AND g.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'
   WHERE gm.usuario_id = pg_temp.gc_u(p_persona)::uuid
     AND gm.fecha_salida IS NULL
     AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado');
$$;

-- Foto de todo lo que el guardado puede tocar en c1: grupos, personas, directores, pasos y marcas.
CREATE OR REPLACE FUNCTION pg_temp.gc_foto()
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'grupos', (SELECT jsonb_agg(to_jsonb(g) - 'updated_at' ORDER BY g.id) FROM public.grupos g
                WHERE g.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'),
    'miembros', (SELECT jsonb_agg(to_jsonb(gm) ORDER BY gm.id) FROM public.grupo_miembros gm
                   JOIN public.grupos g ON g.id = gm.grupo_id WHERE g.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'),
    'directores', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.director_etapa_grupos d
                     JOIN public.grupos g ON g.id = d.grupo_id WHERE g.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'),
    'pasos', (SELECT count(*) FROM public.planner_pasos p WHERE p.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'),
    'terminados', (SELECT jsonb_agg(t.segmento_id ORDER BY t.segmento_id) FROM public.planner_segmentos_terminados t
                     WHERE t.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'));
$$;

CREATE OR REPLACE FUNCTION pg_temp.gc_marcar(p_segmento text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.planner_segmentos_terminados (temporada_id, segmento_id, marcado_por)
  VALUES ('e6300000-0000-4000-8000-0000000000c1', p_segmento::uuid, 'e6300000-0000-4000-8000-000000000003')
  ON CONFLICT DO NOTHING;
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- c1: en planificación y activa. c2: activa (no se planifica). c3: otra en planificación.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6300000-0000-4000-8000-0000000000c1', 'ZZ Gc 2094 - II', DATE '2094-10-01', DATE '2095-09-30', true, 'planificacion'),
  ('e6300000-0000-4000-8000-0000000000c2', 'ZZ Gc 2093 - II', DATE '2093-10-01', DATE '2094-09-30', true, 'activa'),
  ('e6300000-0000-4000-8000-0000000000c3', 'ZZ Gc 2095 - I',  DATE '2095-02-01', DATE '2096-01-31', false, 'planificacion');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6300000-0000-4000-8000-0000000000a1', 'ZZ Gc S1'),
  ('e6300000-0000-4000-8000-0000000000a2', 'ZZ Gc S2');

INSERT INTO public.campus_localidades (id, campus_id, nombre, activo)
SELECT 'e6300000-0000-4000-8000-0000000000e1', c.id, 'ZZ Gc Localidad', true
  FROM (SELECT id FROM public.campus ORDER BY id LIMIT 1) c;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT v.id::uuid, 'authenticated', 'authenticated', v.email, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM (VALUES ('e6300000-0000-4000-8000-000000000103', 'zzgc-dg@example.test'),
               ('e6300000-0000-4000-8000-000000000104', 'zzgc-de@example.test'),
               ('e6300000-0000-4000-8000-000000000106', 'zzgc-lid@example.test')) v(id, email);

-- DG director general, DE director de etapa de S1, LID líder (no planifica); P* personas.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e6300000-0000-4000-8000-000000000003', 'ZZ Gc', 'DG',  'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000103'),
  ('e6300000-0000-4000-8000-000000000004', 'ZZ Gc', 'DE',  'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000104'),
  ('e6300000-0000-4000-8000-000000000006', 'ZZ Gc', 'LID', 'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000106'),
  ('e6300000-0000-4000-8000-000000000021', 'ZZ Gc', 'P1',  'Femenino', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000022', 'ZZ Gc', 'P2',  'Masculino', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000023', 'ZZ Gc', 'P3',  'Femenino', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000024', 'ZZ Gc', 'P4',  'Masculino', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000025', 'ZZ Gc', 'P5',  'Femenino', 'Soltero', NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES ('e6300000-0000-4000-8000-000000000003', 'director-general'),
               ('e6300000-0000-4000-8000-000000000004', 'director-etapa'),
               ('e6300000-0000-4000-8000-000000000006', 'lider')) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6300000-0000-4000-8000-0000000000b1', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-000000000004', 'director_etapa');

-- G1 (S1) y G2 (S2): planificados. GV (S1): ya se reúne (activo, con una reunión, S22). GX: de c3.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, eliminado, estado_ciclo, estado_aprobacion,
                           capacidad_maxima, dia_reunion, hora_reunion) VALUES
  ('e6300000-0000-4000-8000-0000000000d1', 'ZZ Gc G1', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a1', false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d2', 'ZZ Gc G2', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a2', false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d3', 'ZZ Gc GV', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a1', true,  false, 'activo',  'aprobado',  12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d4', 'ZZ Gc GX', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a1', false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30');
INSERT INTO public.eventos_grupo (id, grupo_id, fecha)
VALUES ('e6300000-0000-4000-8000-0000000000e9', 'e6300000-0000-4000-8000-0000000000d3', DATE '2094-10-08');

-- G1: P1 miembro. G2: P5 miembro.
INSERT INTO public.grupo_miembros (id, grupo_id, usuario_id, rol, estado, fecha_asignacion) VALUES
  ('e6300000-0000-4000-8000-0000000000f1', 'e6300000-0000-4000-8000-0000000000d1', 'e6300000-0000-4000-8000-000000000021', 'Miembro', 'activo', DATE '2094-01-15'),
  ('e6300000-0000-4000-8000-0000000000f5', 'e6300000-0000-4000-8000-0000000000d2', 'e6300000-0000-4000-8000-000000000025', 'Miembro', 'activo', DATE '2094-01-15');

-- Cases ----------------------------------------------------------------------

-- 1. Privilegios y metadatos.
SELECT pg_temp.gc_eq('privilegios: anon no ejecuta',
  $q$SELECT has_function_privilege('anon', 'public.planner_guardar_cambios(uuid,jsonb)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.gc_eq('privilegios: authenticated ejecuta',
  $q$SELECT has_function_privilege('authenticated', 'public.planner_guardar_cambios(uuid,jsonb)', 'EXECUTE')::text$q$, 'true');
SELECT pg_temp.gc_eq('privilegios: service_role ejecuta',
  $q$SELECT has_function_privilege('service_role', 'public.planner_guardar_cambios(uuid,jsonb)', 'EXECUTE')::text$q$, 'true');
SELECT pg_temp.gc_eq('metadatos: security definer con search_path fijo y devuelve jsonb',
  $q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '') || '|' || p.prorettype::regtype::text
       FROM pg_proc p WHERE p.oid = 'public.planner_guardar_cambios(uuid,jsonb)'::regprocedure$q$,
  'true{search_path=public}|jsonb');

-- 2. Autorización.
SELECT pg_temp.gc_as(NULL);
SELECT pg_temp.gc_eq('auth: sin sesión 28000',
  $q$SELECT left(pg_temp.gc_err($s$SELECT pg_temp.gc_guardar('[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d1"}]')$s$), 9)$q$,
  'ERR:28000');
SELECT pg_temp.gc_as('LID');
SELECT pg_temp.gc_eq('auth: un líder no planifica (42501)',
  $q$SELECT pg_temp.gc_err($s$SELECT pg_temp.gc_guardar('[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d1"}]')$s$)$q$,
  'ERR:42501 No tienes permiso para usar el planificador');

-- 3. Temporada.
SELECT pg_temp.gc_as('DG');
SELECT pg_temp.gc_eq('temporada: inexistente',
  $q$SELECT pg_temp.gc_err($s$SELECT public.planner_guardar_cambios('e6300000-0000-4000-8000-0000000000ee',
        '[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d1"}]')::text$s$)$q$,
  'ERR:22023 La temporada no existe');
SELECT pg_temp.gc_eq('temporada: no está en planificación',
  $q$SELECT pg_temp.gc_err($s$SELECT public.planner_guardar_cambios('e6300000-0000-4000-8000-0000000000c2',
        '[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d1"}]')::text$s$)$q$,
  'ERR:22023 La temporada no está en planificación');

-- 4. Forma.
INSERT INTO t_gc_foto(tag, foto) SELECT 'inicio', pg_temp.gc_foto();
SELECT pg_temp.gc_eq('forma: ' || v.n, format('SELECT pg_temp.gc_err(%L)', format('SELECT pg_temp.gc_guardar(%L)', v.c)), v.e)
  FROM (VALUES
    ('no es una lista', '{"tipo": "mover"}', 'ERR:22023 Los cambios deben ser una lista de 1 a 200 cambios'),
    ('lista vacía', '[]', 'ERR:22023 Los cambios deben ser una lista de 1 a 200 cambios'),
    ('cambio que no es objeto', '[1]', 'ERR:22023 Cambio 1 de 1: cada cambio debe ser un objeto'),
    ('tipo desconocido', '[{"tipo": "borrar"}]', 'ERR:22023 Cambio 1 de 1: el tipo debe ser mover, crear, editar o eliminar'),
    ('clave de más', '[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d1", "x": 1}]',
       'ERR:22023 Cambio 1 de 1: campo no permitido: x'),
    ('mover sin usuarios', '[{"tipo": "mover", "usuarios": [], "grupo": null, "rol": null}]',
       'ERR:22023 Cambio 1 de 1: usuarios debe ser una lista de ids'),
    ('mover usuarios mal formados', '[{"tipo": "mover", "usuarios": ["x"], "grupo": null, "rol": null}]',
       'ERR:22023 Cambio 1 de 1: usuarios debe ser una lista de ids'),
    ('mover sin la clave grupo', '[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000022"], "rol": "miembro"}]',
       'ERR:22023 Cambio 1 de 1: grupo debe ser un id, "tmp:<clave>" o null'),
    ('mover grupo mal formado', '[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000022"], "grupo": "x", "rol": "miembro"}]',
       'ERR:22023 Cambio 1 de 1: grupo debe ser un id, "tmp:<clave>" o null'),
    ('mover rol no válido', '[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000022"], "grupo": "e6300000-0000-4000-8000-0000000000d1", "rol": "jefe"}]',
       'ERR:22023 Cambio 1 de 1: rol debe ser lider, aprendiz, miembro o null'),
    ('crear con clave mal formada', '[{"tipo": "crear", "clave": "nuevo", "datos": {}}]',
       'ERR:22023 Cambio 1 de 1: la clave de un grupo nuevo debe ser "tmp:<clave>"'),
    ('crear sin datos objeto', '[{"tipo": "crear", "clave": "tmp:a", "datos": []}]',
       'ERR:22023 Cambio 1 de 1: datos debe ser un objeto'),
    ('editar grupo mal formado', '[{"tipo": "editar", "grupo": 7, "cambios": {}}]',
       'ERR:22023 Cambio 1 de 1: grupo debe ser un id o "tmp:<clave>"'),
    ('editar sin cambios objeto', '[{"tipo": "editar", "grupo": "e6300000-0000-4000-8000-0000000000d1", "cambios": "x"}]',
       'ERR:22023 Cambio 1 de 1: cambios debe ser un objeto'),
    ('eliminar un grupo tmp', '[{"tipo": "crear", "clave": "tmp:a", "datos": {}}, {"tipo": "eliminar", "grupo": "tmp:a"}]',
       'ERR:22023 Cambio 2 de 2: grupo debe ser un id'),
    ('clave tmp repetida', '[{"tipo": "crear", "clave": "tmp:a", "datos": {}}, {"tipo": "crear", "clave": "tmp:a", "datos": {}}]',
       'ERR:22023 Cambio 2 de 2: la clave tmp:a ya se usó en otro grupo nuevo'),
    ('clave tmp desconocida', '[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000022"], "grupo": "tmp:nada", "rol": "miembro"}]',
       'ERR:22023 Cambio 1 de 1: tmp:nada no es un grupo nuevo creado antes en estos cambios'),
    ('clave tmp usada antes de crearla', '[{"tipo": "editar", "grupo": "tmp:a", "cambios": {"capacidad_maxima": 9}}, {"tipo": "crear", "clave": "tmp:a", "datos": {}}]',
       'ERR:22023 Cambio 1 de 2: tmp:a no es un grupo nuevo creado antes en estos cambios')
  ) v(n, c, e);
SELECT pg_temp.gc_eq('forma: el error de un cambio lleva su índice en DETAIL',
  $q$SELECT pg_temp.gc_detalle($s$SELECT pg_temp.gc_guardar('[{"tipo": "crear", "clave": "tmp:a", "datos": {}}, {"tipo": "borrar"}]')$s$)$q$,
  '{"indice": 1}');
SELECT pg_temp.gc_eq('forma: 201 cambios se rechazan',
  $q$SELECT pg_temp.gc_err(format('SELECT pg_temp.gc_guardar(%L)',
       (SELECT jsonb_agg(jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array('e6300000-0000-4000-8000-000000000022'),
                                            'grupo', NULL, 'rol', NULL)) FROM generate_series(1, 201))))$q$,
  'ERR:22023 Los cambios deben ser una lista de 1 a 200 cambios');
-- La forma se valida antes de aplicar: el error del último cambio no deja guardado el primero (que sí es válido).
SELECT pg_temp.gc_eq('forma: se valida todo antes de aplicar (error en el cambio 2, el 1 era válido)',
  $q$SELECT pg_temp.gc_err($s$SELECT pg_temp.gc_guardar('[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000022"],
        "grupo": "e6300000-0000-4000-8000-0000000000d1", "rol": "miembro"}, {"tipo": "eliminar", "grupo": "x"}]')$s$)$q$,
  'ERR:22023 Cambio 2 de 2: grupo debe ser un id');
SELECT pg_temp.gc_eq('forma: nada se guardó',
  $q$SELECT (pg_temp.gc_foto() = f.foto)::text FROM t_gc_foto f WHERE f.tag = 'inicio'$q$, 'true');

-- 5. Camino feliz (director general): crear, mover a "tmp:", editar "tmp:", mover, eliminar.
SELECT pg_temp.gc_marcar('e6300000-0000-4000-8000-0000000000a1');
SELECT pg_temp.gc_marcar('e6300000-0000-4000-8000-0000000000a2');
SELECT pg_temp.gc_eq('feliz: guarda 5 cambios',
  format($q$SELECT (pg_temp.gc_guardar(%L)::jsonb)->>'guardados'$q$, jsonb_build_array(
    jsonb_build_object('tipo', 'crear', 'clave', 'tmp:nuevo', 'datos',
      jsonb_build_object('nombre', 'ZZ Gc Nuevo', 'segmento_id', 'e6300000-0000-4000-8000-0000000000a1',
                         'localidad_id', 'e6300000-0000-4000-8000-0000000000e1')),
    jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array(pg_temp.gc_u('P2')), 'grupo', 'tmp:nuevo', 'rol', 'lider'),
    jsonb_build_object('tipo', 'editar', 'grupo', 'tmp:nuevo', 'cambios', jsonb_build_object('capacidad_maxima', 8)),
    jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array(pg_temp.gc_u('P1'), pg_temp.gc_u('P3')), 'grupo', 'tmp:nuevo', 'rol', 'miembro'),
    jsonb_build_object('tipo', 'eliminar', 'grupo', 'e6300000-0000-4000-8000-0000000000d2'))),
  '5');
SELECT pg_temp.gc_eq('feliz: grupos_creados resuelve la clave al id real',
  $q$SELECT (pg_temp.gc_res()->'grupos_creados') = jsonb_build_object('tmp:nuevo', pg_temp.gc_g('Nuevo'))
            AND jsonb_typeof(pg_temp.gc_res()->'grupos_creados') = 'object'$q$, 'true');
SELECT pg_temp.gc_eq('feliz: un paso por cambio, en el orden devuelto',
  $q$SELECT (pg_temp.gc_res()->'pasos') = (SELECT jsonb_agg(p.id ORDER BY p.numero) FROM public.planner_pasos p
                                             WHERE p.temporada_id = 'e6300000-0000-4000-8000-0000000000c1')$q$, 'true');
SELECT pg_temp.gc_eq('feliz: acciones en orden',
  $q$SELECT string_agg(p.accion, ',' ORDER BY p.numero) FROM public.planner_pasos p
      WHERE p.temporada_id = 'e6300000-0000-4000-8000-0000000000c1'$q$,
  'crear_grupo,mover_personas,editar_grupo,mover_personas,eliminar_grupo');
SELECT pg_temp.gc_eq('feliz: historial del más nuevo al más viejo con sus descripciones',
  $q$SELECT string_agg(h.descripcion, ' / ' ORDER BY h.numero DESC)
       FROM public.planner_historial('e6300000-0000-4000-8000-0000000000c1', 50, NULL) h$q$,
  'eliminó el grupo ZZ Gc G2 y devolvió a ZZ Gc P5 al banco / movió a ZZ Gc P1 y ZZ Gc P3 de ZZ Gc G1 a ZZ Gc Nuevo / editó el grupo ZZ Gc Nuevo (capacidad) / '
  || 'movió a ZZ Gc P2 a ZZ Gc Nuevo como líder / creó el grupo ZZ Gc Nuevo');
SELECT pg_temp.gc_eq('feliz: personas en su lugar',
  $q$SELECT pg_temp.gc_vig('P1') || ' ' || pg_temp.gc_vig('P2') || ' ' || pg_temp.gc_vig('P3') || ' ' || pg_temp.gc_vig('P5')$q$,
  'Nuevo:Miembro Nuevo:Líder Nuevo:Miembro -');
SELECT pg_temp.gc_eq('feliz: grupo nuevo editado y G2 eliminado',
  $q$SELECT (SELECT capacidad_maxima::text || '|' || (localidad_id = 'e6300000-0000-4000-8000-0000000000e1')::text
               FROM public.grupos WHERE id = pg_temp.gc_g('Nuevo')::uuid)
            || '|' || (SELECT eliminado::text FROM public.grupos WHERE id = 'e6300000-0000-4000-8000-0000000000d2')$q$,
  '8|true|true');
SELECT pg_temp.gc_eq('feliz: S17 borra las marcas de los segmentos tocados',
  $q$SELECT count(*)::text FROM public.planner_segmentos_terminados WHERE temporada_id = 'e6300000-0000-4000-8000-0000000000c1'$q$, '0');
SELECT pg_temp.gc_eq('feliz: solo el último se puede deshacer; los anteriores esperan al posterior',
  $q$SELECT string_agg(h.puede_deshacer::text, ',' ORDER BY h.numero)
       FROM public.planner_historial('e6300000-0000-4000-8000-0000000000c1', 50, NULL) h$q$,
  'false,false,false,true,true');
SELECT pg_temp.gc_eq('feliz: el motivo nombra el paso posterior',
  $q$SELECT h.motivo_no_deshacer FROM public.planner_historial('e6300000-0000-4000-8000-0000000000c1', 50, NULL) h
      WHERE h.accion = 'crear_grupo'$q$,
  'No se puede deshacer: después ZZ Gc DG movió a ZZ Gc P2 a ZZ Gc Nuevo como líder');
-- Deshacer del último al primero (reglas de T2): cada uno es un paso propio.
SELECT pg_temp.gc_eq('feliz: se deshacen los 5 pasos del último al primero',
  $q$SELECT string_agg((public.planner_deshacer_paso((pg_temp.gc_res()->'pasos'->>i)::uuid)->>'deshace_paso_id'
                        = pg_temp.gc_res()->'pasos'->>i)::text, ',' ORDER BY i DESC)
       FROM generate_series(4, 0, -1) i$q$,
  'true,true,true,true,true');
SELECT pg_temp.gc_eq('feliz: tras deshacer todo vuelve como estaba',
  $q$SELECT pg_temp.gc_vig('P1') || ' ' || pg_temp.gc_vig('P2') || ' ' || pg_temp.gc_vig('P3') || ' ' || pg_temp.gc_vig('P5')
            || ' ' || (SELECT eliminado::text FROM public.grupos WHERE id = pg_temp.gc_g('G2')::uuid)
            || ' ' || (SELECT eliminado::text FROM public.grupos WHERE id = (pg_temp.gc_res()->'grupos_creados'->>'tmp:nuevo')::uuid)$q$,
  'G1:Miembro - - G2:Miembro false true');

-- 6. Todo o nada.
SELECT pg_temp.gc_marcar('e6300000-0000-4000-8000-0000000000a1');
DELETE FROM t_gc_foto WHERE tag = 'antes de fallar';
INSERT INTO t_gc_foto(tag, foto) SELECT 'antes de fallar', pg_temp.gc_foto();
SELECT pg_temp.gc_as('DE');
CREATE TEMP TABLE t_gc_fallo ON COMMIT DROP AS
SELECT jsonb_build_array(
    jsonb_build_object('tipo', 'crear', 'clave', 'tmp:b', 'datos',
      jsonb_build_object('nombre', 'ZZ Gc B', 'segmento_id', 'e6300000-0000-4000-8000-0000000000a1')),
    jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array(pg_temp.gc_u('P4')), 'grupo', 'tmp:b', 'rol', 'miembro'),
    jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array(pg_temp.gc_u('P2')), 'grupo', 'e6300000-0000-4000-8000-0000000000d2', 'rol', 'miembro'),
    jsonb_build_object('tipo', 'editar', 'grupo', 'tmp:b', 'cambios', jsonb_build_object('capacidad_maxima', 9))) AS c;
GRANT ALL ON t_gc_fallo TO authenticated;
SELECT pg_temp.gc_eq('todo o nada: falla el cambio 3 de 4 con el SQLSTATE y el mensaje originales',
  $q$SELECT pg_temp.gc_err(format('SELECT pg_temp.gc_guardar(%L)', (SELECT c FROM t_gc_fallo)))$q$,
  'ERR:42501 Cambio 3 de 4: No puedes mover personas a ZZ Gc G2: es de otro segmento (ZZ Gc S2)');
SELECT pg_temp.gc_eq('todo o nada: DETAIL con el índice del cambio (desde 0)',
  $q$SELECT pg_temp.gc_detalle(format('SELECT pg_temp.gc_guardar(%L)', (SELECT c FROM t_gc_fallo)))$q$, '{"indice": 2}');
SELECT pg_temp.gc_eq('todo o nada: sin grupos, personas, directores, pasos ni marcas nuevos',
  $q$SELECT (pg_temp.gc_foto() = f.foto)::text FROM t_gc_foto f WHERE f.tag = 'antes de fallar'$q$, 'true');
SELECT pg_temp.gc_eq('todo o nada: el grupo B no existe',
  $q$SELECT count(*)::text FROM public.grupos WHERE nombre = 'ZZ Gc B'$q$, '0');

-- S22 en el cambio 2 de 2 (director general): el grupo que ya se reúne no se elimina.
SELECT pg_temp.gc_as('DG');
SELECT pg_temp.gc_eq('todo o nada: eliminar un grupo que ya arrancó en el cambio 2 de 2',
  format($q$SELECT pg_temp.gc_err(%L)$q$, format('SELECT pg_temp.gc_guardar(%L)', jsonb_build_array(
    jsonb_build_object('tipo', 'mover', 'usuarios', jsonb_build_array(pg_temp.gc_u('P4')), 'grupo', 'e6300000-0000-4000-8000-0000000000d1', 'rol', 'miembro'),
    jsonb_build_object('tipo', 'eliminar', 'grupo', 'e6300000-0000-4000-8000-0000000000d3')))),
  'ERR:22023 Cambio 2 de 2: No puedes eliminar ZZ Gc GV: ya se reúne. Solo se pueden eliminar grupos nuevos que todavía no '
  || 'arrancaron; mueve a sus personas si hace falta.');
SELECT pg_temp.gc_eq('todo o nada: el S22 tampoco deja nada',
  $q$SELECT (pg_temp.gc_foto() = f.foto)::text || '|' || pg_temp.gc_vig('P4') FROM t_gc_foto f WHERE f.tag = 'antes de fallar'$q$, 'true|-');

-- 7. Grupos de otra temporada (GX es de c3).
SELECT pg_temp.gc_eq('otra temporada: ' || v.n, format('SELECT pg_temp.gc_err(%L)', format('SELECT pg_temp.gc_guardar(%L)', v.c)), v.e)
  FROM (VALUES
    ('editar', '[{"tipo": "editar", "grupo": "e6300000-0000-4000-8000-0000000000d4", "cambios": {"capacidad_maxima": 9}}]',
       'ERR:22023 Cambio 1 de 1: El grupo no es de esta temporada'),
    ('eliminar', '[{"tipo": "eliminar", "grupo": "e6300000-0000-4000-8000-0000000000d4"}]',
       'ERR:22023 Cambio 1 de 1: El grupo no es de esta temporada'),
    ('mover', '[{"tipo": "mover", "usuarios": ["e6300000-0000-4000-8000-000000000024"], "grupo": "e6300000-0000-4000-8000-0000000000d4", "rol": "miembro"}]',
       'ERR:22023 Cambio 1 de 1: El grupo no es de esta temporada')
  ) v(n, c, e);
SELECT pg_temp.gc_eq('otra temporada: GX queda igual',
  $q$SELECT capacidad_maxima::text || '|' || eliminado::text FROM public.grupos WHERE id = 'e6300000-0000-4000-8000-0000000000d4'$q$, '12|false');

SELECT pg_temp.gc_as(NULL);

SELECT count(*) AS aserciones_guardar FROM t_gc_asserts;
SELECT case_name AS fallidos_guardar FROM t_gc_failures ORDER BY case_name;

ROLLBACK;
