-- planner_mover_personas, planner_crear_grupo, planner_editar_grupo, planner_eliminar_grupo,
-- planner_deshacer_paso y planner_historial — pasos del planificador de GDV
-- (T2 de odd/tasks/planner-gdv.md: S3, S4, S10, S13, S15, S17, S22; contexto S2, S6, S8, S11, S12).
--
-- Cubre:
--   1. Privilegios: anon sin EXECUTE, authenticated con EXECUTE, SECURITY DEFINER con search_path
--      fijo; los ayudantes y las tablas nuevas no los alcanza authenticated (RLS sin políticas).
--   2. Autorización: sin sesión 28000; un rol que no planifica 42501.
--   3. Temporada: solo en planificación (aunque esté activa, como 2026-II); inexistente 22023.
--   4. Mover (S2, S13): persona y pareja; sale sola del otro grupo de la temporada (su fila se borra,
--      como en la app, y el paso guarda la fila completa); vuelta al banco; una fila con fecha_salida
--      no cuenta como membresía; reingreso reutiliza esa fila; cambio de rol; sin cambios 22023;
--      validaciones.
--   5. Alcance del director de etapa (S10, S11): solo grupos de sus segmentos; agrega desde el banco
--      a cualquiera; no saca a nadie de un grupo de otro segmento (42501 que lo nombra).
--   6. Grupos (S3, S4, S6, S8): crear con localidad y campus, 0 directores permitido; nombre único por
--      segmento y temporada sin distinguir mayúsculas ni espacios, eliminados incluidos; editar solo
--      las claves enviadas sin tocar activo ni estado_ciclo de un grupo vivo; eliminar devuelve a las
--      personas al banco y libera el nombre.
--   7. S17: cada paso borra la marca "Terminé mi segmento" de los segmentos que toca y la guarda.
--   8. Deshacer (S15): el autor dentro de 24 horas; director general sobre pasos ajenos y viejos; ya
--      deshecho 55000; conflicto con un paso posterior 40001 que nombra a quien lo hizo; cambio fuera
--      del planificador 40001; deshacer una baja o una salida reinserta la fila idéntica (mismo id y
--      columnas); deshacer nunca deja a una persona en dos grupos de la temporada ni personas en un
--      grupo dado de baja (40001 si la app las agregó después); deshacer es un paso.
--   9. Historial por rol con puede_deshacer y motivo; paginación.
--  10. S22: un grupo que ya arrancó (activo, estado_ciclo 'activo' o con eventos_grupo) no se elimina
--      (22023 que lo nombra, sin escribir nada; 42501 primero si es de otro segmento).
--
-- Se ejecuta dentro de BEGIN…ROLLBACK (staging o el arnés local): nada se conserva; los datos viven
-- en el espacio e6200000-... con nombre 'ZZ Pp' y fechas en 2090–2092. El último statement es un
-- SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;
-- Los ayudantes SQL nombran las tablas nuevas: sin esto el RED abortaría antes de contar casos.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_pp_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pp_asserts (case_name text) ON COMMIT DROP;
-- Grupos por etiqueta, resultados de las llamadas y pasos guardados por etiqueta.
CREATE TEMP TABLE t_g (tag text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE t_res (n serial, r jsonb) ON COMMIT DROP;
CREATE TEMP TABLE t_p (tag text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE t_fila (tag text PRIMARY KEY, fila jsonb NOT NULL) ON COMMIT DROP;
GRANT ALL ON t_pp_failures, t_pp_asserts, t_g, t_res, t_p, t_fila TO authenticated;
GRANT USAGE ON SEQUENCE t_res_n_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pp_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  INSERT INTO t_pp_asserts(case_name) VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v_actual;
    IF v_actual IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', obtenido ' || coalesce(v_actual, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', error ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Resultado de un statement, o 'ERR:<sqlstate>' si lanza (sus efectos se revierten).
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

-- 'ERR:<sqlstate> <mensaje>' de un statement ('ok' si no falla).
CREATE OR REPLACE FUNCTION pg_temp.error(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLSTATE || ' ' || SQLERRM; END;
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
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Pp' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ Pp' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.us(p_tags text)
RETURNS uuid[] LANGUAGE sql AS $$
  SELECT array_agg(pg_temp.u(btrim(t)) ORDER BY o) FROM unnest(string_to_array(p_tags, ',')) WITH ORDINALITY x(t, o);
$$;

CREATE OR REPLACE FUNCTION pg_temp.g(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_g WHERE tag = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.p(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM t_p WHERE tag = p_tag;
$$;

-- Último paso de la temporada c1 (por orden de registro).
CREATE OR REPLACE FUNCTION pg_temp.ultimo()
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.planner_pasos WHERE temporada_id = 'e6200000-0000-4000-8000-0000000000c1' ORDER BY numero DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.marcar(p_tag text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.planner_pasos') IS NULL THEN RETURN; END IF;
  INSERT INTO t_p(tag, id) SELECT p_tag, pg_temp.ultimo() WHERE pg_temp.ultimo() IS NOT NULL;
END;
$$;

-- Llamadas a las RPC con etiquetas; devuelven la descripción del paso.
CREATE OR REPLACE FUNCTION pg_temp.mover(p_personas text, p_destino text, p_rol text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_mover_personas('e6200000-0000-4000-8000-0000000000c1', pg_temp.us(p_personas),
                                     CASE WHEN p_destino IS NOT NULL THEN pg_temp.g(p_destino) END, p_rol);
  INSERT INTO t_res(r) VALUES (r);
  RETURN r->>'descripcion';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.crear(p_tag text, p_datos jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_crear_grupo('e6200000-0000-4000-8000-0000000000c1', p_datos);
  INSERT INTO t_res(r) VALUES (r);
  INSERT INTO t_g(tag, id) VALUES (p_tag, (r->>'grupo_id')::uuid);
  RETURN r->>'descripcion';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.editar(p_tag text, p_cambios jsonb)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_editar_grupo(pg_temp.g(p_tag), p_cambios);
  INSERT INTO t_res(r) VALUES (r);
  RETURN r->>'descripcion';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.eliminar(p_tag text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_eliminar_grupo(pg_temp.g(p_tag));
  INSERT INTO t_res(r) VALUES (r);
  RETURN r->>'descripcion';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.deshacer(p_paso uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_deshacer_paso(p_paso);
  INSERT INTO t_res(r) VALUES (r);
  RETURN r->>'descripcion';
END;
$$;

-- Último resultado devuelto por una RPC.
CREATE OR REPLACE FUNCTION pg_temp.res()
RETURNS jsonb LANGUAGE sql AS $$
  SELECT r FROM t_res ORDER BY n DESC LIMIT 1;
$$;

-- Membresías vigentes de una persona en c1 como 'Grupo:Rol' ('-' = en el banco).
CREATE OR REPLACE FUNCTION pg_temp.vig(p_persona text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(tg.tag || ':' || gm.rol::text, ',' ORDER BY tg.tag), '-')
    FROM public.grupo_miembros gm
    JOIN public.grupos g ON g.id = gm.grupo_id AND NOT g.eliminado AND g.temporada_id = 'e6200000-0000-4000-8000-0000000000c1'
    JOIN t_g tg ON tg.id = g.id
   WHERE gm.usuario_id = pg_temp.u(p_persona)
     AND gm.fecha_salida IS NULL
     AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado');
$$;

-- Fila de grupo_miembros de una persona en un grupo: 'rol|vigente' o 'rol|salió' ('-' = no hay fila).
CREATE OR REPLACE FUNCTION pg_temp.fila(p_persona text, p_grupo text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT gm.rol::text || '|' || CASE WHEN gm.fecha_salida IS NULL THEN 'vigente' ELSE 'salió' END
                     FROM public.grupo_miembros gm
                    WHERE gm.grupo_id = pg_temp.g(p_grupo) AND gm.usuario_id = pg_temp.u(p_persona)), '-');
$$;

-- Guarda la fila completa de grupo_miembros de una persona en un grupo, y la compara después.
CREATE OR REPLACE FUNCTION pg_temp.guardar_fila(p_tag text, p_persona text, p_grupo text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fila(tag, fila)
  SELECT p_tag, to_jsonb(gm) FROM public.grupo_miembros gm
   WHERE gm.grupo_id = pg_temp.g(p_grupo) AND gm.usuario_id = pg_temp.u(p_persona);
$$;

CREATE OR REPLACE FUNCTION pg_temp.fila_igual(p_tag text, p_persona text, p_grupo text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT (to_jsonb(gm) = f.fila)::text FROM public.grupo_miembros gm, t_fila f
                    WHERE f.tag = p_tag AND gm.grupo_id = pg_temp.g(p_grupo) AND gm.usuario_id = pg_temp.u(p_persona)), 'sin fila');
$$;

-- Fila que un paso guardó en antes para una persona y un grupo: 'id|rol|fecha_asignacion'.
CREATE OR REPLACE FUNCTION pg_temp.fila_antes(p_paso uuid, p_persona text, p_grupo text)
RETURNS text LANGUAGE sql AS $$
  SELECT (m->'fila'->>'id') || '|' || (m->'fila'->>'rol') || '|' || ((m->'fila'->>'fecha_asignacion')::date)::text
    FROM public.planner_pasos p, jsonb_array_elements(p.antes->'miembros') m
   WHERE p.id = p_paso AND (m->>'usuario_id')::uuid = pg_temp.u(p_persona) AND (m->>'grupo_id')::uuid = pg_temp.g(p_grupo);
$$;

-- Un paso como 'accion|actor|grupos|personas|segmentos'.
CREATE OR REPLACE FUNCTION pg_temp.paso(p_id uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', p.accion, u.apellido,
           coalesce((SELECT string_agg(tg.tag, ',' ORDER BY tg.tag) FROM t_g tg WHERE tg.id = ANY (p.grupo_ids)), '-'),
           coalesce((SELECT string_agg(x.apellido, ',' ORDER BY x.apellido) FROM public.usuarios x WHERE x.id = ANY (p.usuario_ids)), '-'),
           coalesce((SELECT string_agg(s.nombre, ',' ORDER BY s.nombre) FROM public.segmentos s WHERE s.id = ANY (p.segmento_ids)), '-'))
    FROM public.planner_pasos p
    LEFT JOIN public.usuarios u ON u.id = p.actor
   WHERE p.id = p_id;
$$;

-- Segmentos marcados como terminados en c1.
CREATE OR REPLACE FUNCTION pg_temp.terminados()
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(s.nombre, ',' ORDER BY s.nombre), '-')
    FROM public.planner_segmentos_terminados t JOIN public.segmentos s ON s.id = t.segmento_id
   WHERE t.temporada_id = 'e6200000-0000-4000-8000-0000000000c1';
$$;

-- Ayudantes que escriben en las tablas nuevas: sin la migración no hacen nada (el RED sigue contando).
CREATE OR REPLACE FUNCTION pg_temp.marcar_terminado(p_segmento uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.planner_segmentos_terminados') IS NULL THEN RETURN; END IF;
  INSERT INTO public.planner_segmentos_terminados (temporada_id, segmento_id, marcado_por)
  VALUES ('e6200000-0000-4000-8000-0000000000c1', p_segmento, 'e6200000-0000-4000-8000-000000000003')
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.envejecer(p_paso uuid, p_horas integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.planner_pasos') IS NULL THEN RETURN; END IF;
  UPDATE public.planner_pasos SET creado_en = creado_en - make_interval(hours => p_horas) WHERE id = p_paso;
END;
$$;

-- Fila de historial de un paso para el actor actual.
CREATE OR REPLACE FUNCTION pg_temp.hist(p_paso uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT h.puede_deshacer::text || '|' || coalesce(h.motivo_no_deshacer, '-')
    FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500, NULL) h
   WHERE h.paso_id = p_paso;
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- c1: en planificación y activa (como 2026-II en producción). c2: activa (no se planifica).
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6200000-0000-4000-8000-0000000000c1', 'ZZ Pp 2091 - II', DATE '2091-10-01', DATE '2092-09-30', true, 'planificacion'),
  ('e6200000-0000-4000-8000-0000000000c2', 'ZZ Pp 2090 - II', DATE '2090-10-01', DATE '2091-09-30', true, 'activa');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6200000-0000-4000-8000-0000000000a1', 'ZZ Pp S1'),
  ('e6200000-0000-4000-8000-0000000000a2', 'ZZ Pp S2');

-- e1 activa, e2 inactiva, en el primer campus.
INSERT INTO public.campus_localidades (id, campus_id, nombre, activo)
SELECT v.id::uuid, c.id, v.nombre, v.activo
  FROM (SELECT id FROM public.campus ORDER BY id LIMIT 1) c,
       (VALUES ('e6200000-0000-4000-8000-0000000000e1', 'ZZ Pp Localidad', true),
               ('e6200000-0000-4000-8000-0000000000e2', 'ZZ Pp Cerrada', false)) v(id, nombre, activo);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT v.id::uuid, 'authenticated', 'authenticated', v.email, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM (VALUES ('e6200000-0000-4000-8000-000000000101', 'zzpp-adm@example.test'),
               ('e6200000-0000-4000-8000-000000000102', 'zzpp-pas@example.test'),
               ('e6200000-0000-4000-8000-000000000103', 'zzpp-dg@example.test'),
               ('e6200000-0000-4000-8000-000000000104', 'zzpp-de@example.test'),
               ('e6200000-0000-4000-8000-000000000105', 'zzpp-de2@example.test'),
               ('e6200000-0000-4000-8000-000000000106', 'zzpp-lid@example.test')) v(id, email);

-- ADM admin, PAS pastor, DG director general, DE director de etapa de S1, DE2 director de etapa de
-- S2, LID líder (no planifica); el resto son personas del banco.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e6200000-0000-4000-8000-000000000001', 'ZZ Pp', 'ADM', 'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000101'),
  ('e6200000-0000-4000-8000-000000000002', 'ZZ Pp', 'PAS', 'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000102'),
  ('e6200000-0000-4000-8000-000000000003', 'ZZ Pp', 'DG',  'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000103'),
  ('e6200000-0000-4000-8000-000000000004', 'ZZ Pp', 'DE',  'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000104'),
  ('e6200000-0000-4000-8000-000000000005', 'ZZ Pp', 'DE2', 'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000105'),
  ('e6200000-0000-4000-8000-000000000006', 'ZZ Pp', 'LID', 'Otro', 'Soltero', 'e6200000-0000-4000-8000-000000000106'),
  ('e6200000-0000-4000-8000-000000000011', 'ZZ Pp', 'L1',  'Masculino', 'Casado', NULL),
  ('e6200000-0000-4000-8000-000000000021', 'ZZ Pp', 'P1',  'Femenino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000022', 'ZZ Pp', 'P2',  'Masculino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000023', 'ZZ Pp', 'P3',  'Femenino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000024', 'ZZ Pp', 'P4',  'Masculino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000025', 'ZZ Pp', 'P5',  'Femenino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000026', 'ZZ Pp', 'P6',  'Femenino', 'Casado', NULL),
  ('e6200000-0000-4000-8000-000000000027', 'ZZ Pp', 'P7',  'Masculino', 'Casado', NULL),
  ('e6200000-0000-4000-8000-000000000028', 'ZZ Pp', 'P8',  'Masculino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000029', 'ZZ Pp', 'P9',  'Femenino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000030', 'ZZ Pp', 'P10', 'Masculino', 'Soltero', NULL),
  ('e6200000-0000-4000-8000-000000000032', 'ZZ Pp', 'P12', 'Femenino', 'Soltero', NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e6200000-0000-4000-8000-000000000001', 'admin'),
    ('e6200000-0000-4000-8000-000000000002', 'pastor'),
    ('e6200000-0000-4000-8000-000000000003', 'director-general'),
    ('e6200000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e6200000-0000-4000-8000-000000000005', 'director-etapa'),
    ('e6200000-0000-4000-8000-000000000006', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6200000-0000-4000-8000-0000000000b1', 'e6200000-0000-4000-8000-0000000000a1', 'e6200000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e6200000-0000-4000-8000-0000000000b2', 'e6200000-0000-4000-8000-0000000000a2', 'e6200000-0000-4000-8000-000000000005', 'director_etapa');

-- G1: vivo (ya se reúne, activo y estado_ciclo activo, S8). G2, G3: planificados. Viejo: eliminado.
-- Activa: grupo de c2.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, localidad_id, activo, eliminado, estado_ciclo, estado_aprobacion,
                           capacidad_maxima, dia_reunion, hora_reunion) VALUES
  ('e6200000-0000-4000-8000-0000000000d1', 'ZZ Pp G1',     'e6200000-0000-4000-8000-0000000000c1', 'e6200000-0000-4000-8000-0000000000a1', NULL, true,  false, 'activo',  'aprobado',  12, 'Jueves', '19:30'),
  ('e6200000-0000-4000-8000-0000000000d2', 'ZZ Pp G2',     'e6200000-0000-4000-8000-0000000000c1', 'e6200000-0000-4000-8000-0000000000a1', NULL, false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6200000-0000-4000-8000-0000000000d3', 'ZZ Pp G3',     'e6200000-0000-4000-8000-0000000000c1', 'e6200000-0000-4000-8000-0000000000a2', NULL, false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6200000-0000-4000-8000-0000000000d4', 'ZZ Pp Viejo',  'e6200000-0000-4000-8000-0000000000c1', 'e6200000-0000-4000-8000-0000000000a1', NULL, false, true,  'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6200000-0000-4000-8000-0000000000d5', 'ZZ Pp Activa', 'e6200000-0000-4000-8000-0000000000c2', 'e6200000-0000-4000-8000-0000000000a1', NULL, true,  false, 'activo',  'aprobado',  12, 'Jueves', '19:30');
INSERT INTO t_g(tag, id) VALUES
  ('G1', 'e6200000-0000-4000-8000-0000000000d1'), ('G2', 'e6200000-0000-4000-8000-0000000000d2'),
  ('G3', 'e6200000-0000-4000-8000-0000000000d3'), ('Viejo', 'e6200000-0000-4000-8000-0000000000d4'),
  ('Activa', 'e6200000-0000-4000-8000-0000000000d5');

-- G1: L1 líder, P1 miembro. G3: P3 y P12 miembros. G2: P5 con una fila de salida blanda hecha
-- fuera del planificador (fecha_salida; no cuenta como membresía).
INSERT INTO public.grupo_miembros (id, grupo_id, usuario_id, rol, estado, fecha_asignacion, fecha_salida) VALUES
  ('e6200000-0000-4000-8000-0000000000f1', 'e6200000-0000-4000-8000-0000000000d1', 'e6200000-0000-4000-8000-000000000011', 'Líder',   'activo', DATE '2091-01-15', NULL),
  ('e6200000-0000-4000-8000-0000000000f2', 'e6200000-0000-4000-8000-0000000000d1', 'e6200000-0000-4000-8000-000000000021', 'Miembro', 'activo', DATE '2091-01-15', NULL),
  ('e6200000-0000-4000-8000-0000000000f3', 'e6200000-0000-4000-8000-0000000000d3', 'e6200000-0000-4000-8000-000000000023', 'Miembro', 'activo', DATE '2091-01-15', NULL),
  ('e6200000-0000-4000-8000-0000000000f5', 'e6200000-0000-4000-8000-0000000000d2', 'e6200000-0000-4000-8000-000000000025', 'Miembro', 'activo', DATE '2091-01-15', now() - interval '30 days'),
  ('e6200000-0000-4000-8000-0000000000f6', 'e6200000-0000-4000-8000-0000000000d3', 'e6200000-0000-4000-8000-000000000032', 'Colíder', 'activo', DATE '2091-01-20', NULL);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e6200000-0000-4000-8000-0000000000b1', 'e6200000-0000-4000-8000-0000000000d1'),
  ('e6200000-0000-4000-8000-0000000000b2', 'e6200000-0000-4000-8000-0000000000d3');

SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a1');
SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a2');

-- Cases ----------------------------------------------------------------------

-- 1. Privilegios y metadatos.
SELECT pg_temp.assert_eq('privilegios: anon no ejecuta ' || f,
  format($q$SELECT has_function_privilege('anon', %L, 'EXECUTE')::text$q$, f), 'false')
  FROM unnest(ARRAY['public.planner_mover_personas(uuid,uuid[],uuid,text)', 'public.planner_crear_grupo(uuid,jsonb)',
                    'public.planner_editar_grupo(uuid,jsonb)', 'public.planner_eliminar_grupo(uuid)',
                    'public.planner_deshacer_paso(uuid)', 'public.planner_historial(uuid,integer,timestamptz)']) f;
SELECT pg_temp.assert_eq('privilegios: authenticated ejecuta ' || f,
  format($q$SELECT has_function_privilege('authenticated', %L, 'EXECUTE')::text$q$, f), 'true')
  FROM unnest(ARRAY['public.planner_mover_personas(uuid,uuid[],uuid,text)', 'public.planner_crear_grupo(uuid,jsonb)',
                    'public.planner_editar_grupo(uuid,jsonb)', 'public.planner_eliminar_grupo(uuid)',
                    'public.planner_deshacer_paso(uuid)', 'public.planner_historial(uuid,integer,timestamptz)']) f;
SELECT pg_temp.assert_eq('metadatos: security definer con search_path fijo ' || f,
  format($q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '') FROM pg_proc p WHERE p.oid = %L::regprocedure$q$, f),
  'true{search_path=public}')
  FROM unnest(ARRAY['public.planner_mover_personas(uuid,uuid[],uuid,text)', 'public.planner_crear_grupo(uuid,jsonb)',
                    'public.planner_editar_grupo(uuid,jsonb)', 'public.planner_eliminar_grupo(uuid)',
                    'public.planner_deshacer_paso(uuid)', 'public.planner_historial(uuid,integer,timestamptz)']) f;
SELECT pg_temp.assert_eq('privilegios: los ayudantes de pasos existen, son definer y no los ejecuta authenticated ni anon',
  $q$SELECT count(*)::text || '|' || bool_and(p.prosecdef)::text || '|'
            || bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))::text
       FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('planner_paso_registrar', 'planner_paso_foto', 'planner_paso_aplicar', 'planner_paso_motivo_no_deshacer',
                          'planner_paso_lista', 'planner_paso_validar_grupo')$q$,
  '6|true|false');
SELECT pg_temp.assert_eq('privilegios: authenticated y anon no tocan ' || t || ' directamente',
  format($q$SELECT (has_table_privilege('authenticated', %1$L, 'SELECT') OR has_table_privilege('authenticated', %1$L, 'INSERT')
                    OR has_table_privilege('authenticated', %1$L, 'UPDATE') OR has_table_privilege('authenticated', %1$L, 'DELETE')
                    OR has_table_privilege('anon', %1$L, 'SELECT') OR has_table_privilege('anon', %1$L, 'INSERT'))::text$q$, t),
  'false')
  FROM unnest(ARRAY['public.planner_pasos', 'public.planner_segmentos_terminados']) t;
SELECT pg_temp.assert_eq('rls: ' || t || ' con RLS y sin políticas',
  format($q$SELECT c.relrowsecurity::text || '|' || (SELECT count(*) FROM pg_policy pp WHERE pp.polrelid = c.oid)::text
              FROM pg_class c WHERE c.oid = %L::regclass$q$, t),
  'true|0')
  FROM unnest(ARRAY['public.planner_pasos', 'public.planner_segmentos_terminados']) t;
SELECT pg_temp.assert_eq('privilegios: authenticated y anon no usan la secuencia de planner_pasos.numero',
  $q$SELECT (has_sequence_privilege('authenticated', pg_get_serial_sequence('public.planner_pasos', 'numero'), 'USAGE,SELECT,UPDATE')
             OR has_sequence_privilege('anon', pg_get_serial_sequence('public.planner_pasos', 'numero'), 'USAGE,SELECT,UPDATE'))::text$q$,
  'false');
SELECT pg_temp.assert_eq('tablas: índice de historial por temporada y fecha',
  $q$SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'planner_pasos'
        AND indexdef ILIKE '%(temporada_id, creado_en DESC%'$q$, '1');

-- 2. Autorización.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('auth: sin sesión 28000 en ' || v.n, format('SELECT pg_temp.outcome(%L)', v.q), 'ERR:28000')
  FROM (VALUES
    ('mover', $s$SELECT pg_temp.mover('P2', 'G2', 'miembro')$s$),
    ('crear', $s$SELECT pg_temp.crear('X', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}')$s$),
    ('editar', $s$SELECT pg_temp.editar('G2', '{"capacidad_maxima": 9}')$s$),
    ('eliminar', $s$SELECT pg_temp.eliminar('G2')$s$),
    ('deshacer', $s$SELECT pg_temp.deshacer('e6200000-0000-4000-8000-0000000000ee')$s$),
    ('historial', $s$SELECT count(*)::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1')$s$)
  ) v(n, q);

SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('auth: un líder no planifica (42501 con mensaje)',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P2', 'G2', 'miembro')$s$)$q$,
  'ERR:42501 No tienes permiso para usar el planificador');
SELECT pg_temp.assert_eq('auth: un líder no lee el historial',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_historial(''e6200000-0000-4000-8000-0000000000c1'')')$q$,
  'ERR:42501');

-- 3. Temporada.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('temporada: mover en una temporada que no está en planificación',
  $q$SELECT pg_temp.error($s$SELECT public.planner_mover_personas('e6200000-0000-4000-8000-0000000000c2',
        ARRAY['e6200000-0000-4000-8000-000000000022']::uuid[], 'e6200000-0000-4000-8000-0000000000d5', 'miembro')::text$s$)$q$,
  'ERR:22023 La temporada no está en planificación');
SELECT pg_temp.assert_eq('temporada: crear en una temporada que no está en planificación',
  $q$SELECT pg_temp.outcome($s$SELECT public.planner_crear_grupo('e6200000-0000-4000-8000-0000000000c2',
        '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}')::text$s$)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: editar un grupo de una temporada que no está en planificación',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.editar('Activa', '{"capacidad_maxima": 9}')$s$)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: eliminar un grupo de una temporada que no está en planificación',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.eliminar('Activa')$s$)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: inexistente',
  $q$SELECT pg_temp.error($s$SELECT public.planner_mover_personas('e6200000-0000-4000-8000-0000000000ee',
        ARRAY['e6200000-0000-4000-8000-000000000022']::uuid[], NULL, NULL)::text$s$)$q$,
  'ERR:22023 La temporada no existe');
SELECT pg_temp.assert_eq('temporada: historial de una temporada inexistente',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_historial(''e6200000-0000-4000-8000-0000000000ee'')')$q$,
  'ERR:22023');
SELECT pg_temp.assert_eq('temporada: ningún intento fallido dejó pasos',
  $q$SELECT count(*)::text FROM public.planner_pasos WHERE temporada_id IN ('e6200000-0000-4000-8000-0000000000c1', 'e6200000-0000-4000-8000-0000000000c2')$q$,
  '0');

-- 4. Mover. El director de etapa agrega desde el banco a una persona sin segmento (S11).
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('mover: persona del banco a un grupo (descripción)',
  $q$SELECT pg_temp.mover('P2', 'G2', 'miembro')$q$, 'movió a ZZ Pp P2 a ZZ Pp G2');
SELECT pg_temp.marcar('mover P2');
SELECT pg_temp.assert_eq('mover: la persona queda en el grupo', $q$SELECT pg_temp.vig('P2')$q$, 'G2:Miembro');
SELECT pg_temp.assert_eq('mover: el paso guarda acción, actor, grupos, personas y segmentos',
  $q$SELECT pg_temp.paso(pg_temp.p('mover P2'))$q$, 'mover_personas|DE|G2|P2|ZZ Pp S1');
SELECT pg_temp.assert_eq('mover: devuelve el id del paso y las filas afectadas',
  $q$SELECT ((pg_temp.res()->>'paso_id')::uuid = pg_temp.p('mover P2'))::text || '|'
            || (SELECT string_agg((m->>'rol') || ':' || (m->>'vigente'), ',') FROM jsonb_array_elements(pg_temp.res()->'despues'->'miembros') m)$q$,
  'true|Miembro:true');
SELECT pg_temp.assert_eq('S17: el paso borra la marca del segmento que toca y deja la otra',
  $q$SELECT pg_temp.terminados()$q$, 'ZZ Pp S2');
SELECT pg_temp.assert_eq('S17: el paso guarda la marca que borró',
  $q$SELECT string_agg((t->>'segmento_id') || ':' || (t->>'marcado_por'), ',')
       FROM public.planner_pasos p, jsonb_array_elements(p.antes->'terminados') t WHERE p.id = pg_temp.p('mover P2')$q$,
  'e6200000-0000-4000-8000-0000000000a1:e6200000-0000-4000-8000-000000000003');
SELECT pg_temp.assert_eq('S17: el resultado informa los segmentos que volvieron a "Sin terminar"',
  $q$SELECT (pg_temp.res()->'segmentos_reabiertos')::text$q$, '["e6200000-0000-4000-8000-0000000000a1"]');

-- Pareja (S2: el cliente manda a los dos), por el director general, como aprendices en un grupo vivo.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('mover: pareja a un grupo como aprendices',
  $q$SELECT pg_temp.mover('P6,P7', 'G1', 'aprendiz')$q$, 'movió a ZZ Pp P6 y ZZ Pp P7 a ZZ Pp G1 como aprendiz');
SELECT pg_temp.assert_eq('mover: los dos quedan como Colíder',
  $q$SELECT pg_temp.vig('P6') || ',' || pg_temp.vig('P7')$q$, 'G1:Colíder,G1:Colíder');
SELECT pg_temp.assert_eq('S8: mover a un grupo vivo no cambia activo ni estado_ciclo',
  $q$SELECT activo::text || '|' || estado_ciclo || '|' || estado_aprobacion FROM public.grupos WHERE id = pg_temp.g('G1')$q$,
  'true|activo|aprobado');

-- Sale sola del otro grupo de la temporada: su fila se borra y el paso la guarda completa.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('mover: de un grupo a otro como líder',
  $q$SELECT pg_temp.mover('P1', 'G2', 'lider')$q$, 'movió a ZZ Pp P1 de ZZ Pp G1 a ZZ Pp G2 como líder');
SELECT pg_temp.assert_eq('mover: nunca en dos grupos de la temporada', $q$SELECT pg_temp.vig('P1')$q$, 'G2:Líder');
SELECT pg_temp.assert_eq('mover: salir borra la fila del grupo anterior',
  $q$SELECT pg_temp.fila('P1', 'G1') || '|' || (SELECT count(*) FROM public.grupo_miembros WHERE id = 'e6200000-0000-4000-8000-0000000000f2')::text$q$,
  '-|0');
SELECT pg_temp.assert_eq('mover: el paso guarda la fila borrada completa (historial)',
  $q$SELECT pg_temp.fila_antes(pg_temp.ultimo(), 'P1', 'G1')$q$, 'e6200000-0000-4000-8000-0000000000f2|Miembro|2091-01-15');
SELECT pg_temp.assert_eq('mover: el paso toca los dos grupos', $q$SELECT pg_temp.paso(pg_temp.ultimo())$q$,
  'mover_personas|DE|G1,G2|P1|ZZ Pp S1');

-- De vuelta al banco.
SELECT pg_temp.assert_eq('mover: devolver al banco',
  $q$SELECT pg_temp.mover('P2', NULL, NULL)$q$, 'devolvió a ZZ Pp P2 al banco desde ZZ Pp G2');
SELECT pg_temp.assert_eq('mover: en el banco no tiene grupo ni fila',
  $q$SELECT pg_temp.vig('P2') || '|' || pg_temp.fila('P2', 'G2')$q$, '-|-');
SELECT pg_temp.assert_eq('mover: quien ya está en el banco no se devuelve',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P2', NULL, NULL)$s$)$q$, 'ERR:22023 ZZ Pp P2 ya está en el banco');

-- Una fila con fecha_salida no cuenta como membresía (como en T1).
SELECT pg_temp.assert_eq('mover: una fila con fecha_salida no cuenta como membresía',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P5', NULL, NULL)$s$)$q$, 'ERR:22023 ZZ Pp P5 ya está en el banco');
-- Reingreso: reutiliza esa fila (única por grupo y persona) y la deja vigente.
SELECT pg_temp.assert_eq('mover: reingreso a un grupo del que salió',
  $q$SELECT pg_temp.mover('P5', 'G2', 'miembro')$q$, 'movió a ZZ Pp P5 a ZZ Pp G2');
SELECT pg_temp.assert_eq('mover: el reingreso reutiliza la misma fila',
  $q$SELECT string_agg(gm.id::text || '|' || coalesce(gm.estado, '-') || '|' || (gm.fecha_salida IS NULL)::text, ',')
       FROM public.grupo_miembros gm WHERE gm.grupo_id = pg_temp.g('G2') AND gm.usuario_id = pg_temp.u('P5')$q$,
  'e6200000-0000-4000-8000-0000000000f5|activo|true');

-- Cambio de rol dentro del mismo grupo.
SELECT pg_temp.assert_eq('mover: cambio de rol en el mismo grupo',
  $q$SELECT pg_temp.mover('P5', 'G2', 'aprendiz')$q$, 'cambió el rol de ZZ Pp P5 a aprendiz en ZZ Pp G2');
SELECT pg_temp.marcar('rol P5');
SELECT pg_temp.assert_eq('mover: el rol cambió', $q$SELECT pg_temp.vig('P5')$q$, 'G2:Colíder');
SELECT pg_temp.assert_eq('mover: sin cambios no registra paso',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P5', 'G2', 'aprendiz')$s$)$q$,
  'ERR:22023 ZZ Pp P5 ya está en ZZ Pp G2 como aprendiz');

-- 5. Deshacer por el autor (S15).
SELECT pg_temp.assert_eq('deshacer: el autor deshace su paso',
  $q$SELECT pg_temp.deshacer(pg_temp.p('rol P5'))$q$, 'deshizo el paso de ZZ Pp DE: cambió el rol de ZZ Pp P5 a aprendiz en ZZ Pp G2');
SELECT pg_temp.marcar('deshacer rol P5');
SELECT pg_temp.assert_eq('deshacer: vuelve el estado de antes', $q$SELECT pg_temp.vig('P5')$q$, 'G2:Miembro');
SELECT pg_temp.assert_eq('deshacer: es un paso propio que apunta al deshecho y el deshecho lo apunta',
  $q$SELECT pg_temp.paso(d.id) || '|' || (d.deshace_paso_id = o.id)::text || '|' || (o.deshecho_por = d.id)::text
       FROM public.planner_pasos d, public.planner_pasos o
      WHERE d.id = pg_temp.p('deshacer rol P5') AND o.id = pg_temp.p('rol P5')$q$,
  'deshacer|DE|G2|P5|ZZ Pp S1|true|true');
SELECT pg_temp.assert_eq('deshacer: un paso ya deshecho no se deshace otra vez',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('rol P5'))$s$)$q$, 'ERR:55000 Este paso ya se deshizo');
SELECT pg_temp.assert_eq('deshacer: un deshacer no se deshace',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('deshacer rol P5'))$s$)$q$,
  'ERR:55000 Un deshacer no se puede deshacer; vuelve a hacer el cambio');
SELECT pg_temp.assert_eq('deshacer: paso inexistente',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.deshacer('e6200000-0000-4000-8000-0000000000ee')$s$)$q$, 'ERR:22023');

-- 6. Alcance del director de etapa (S10).
SELECT pg_temp.assert_eq('alcance: no saca a una persona de un grupo de otro segmento',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P3', 'G2', 'miembro')$s$)$q$,
  'ERR:42501 No puedes mover a ZZ Pp P3: está en ZZ Pp G3, que es de otro segmento (ZZ Pp S2)');
SELECT pg_temp.assert_eq('alcance: no mueve personas a un grupo de otro segmento',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.mover('P4', 'G3', 'miembro')$s$)$q$,
  'ERR:42501 No puedes mover personas a ZZ Pp G3: es de otro segmento (ZZ Pp S2)');
SELECT pg_temp.assert_eq('alcance: no crea grupos en otro segmento',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.crear('X', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a2"}')$s$)$q$,
  'ERR:42501 No puedes crear grupos en ZZ Pp S2: no es uno de tus segmentos');
SELECT pg_temp.assert_eq('alcance: no edita grupos de otro segmento',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.editar('G3', '{"capacidad_maxima": 9}')$s$)$q$,
  'ERR:42501 No puedes cambiar ZZ Pp G3: es de otro segmento (ZZ Pp S2)');
SELECT pg_temp.assert_eq('alcance: no elimina grupos de otro segmento',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.eliminar('G3')$s$)$q$, 'ERR:42501');
SELECT pg_temp.as_user(pg_temp.a('DE2'));
SELECT pg_temp.assert_eq('alcance: el otro director tampoco saca gente de grupos ajenos al banco',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.mover('P1', NULL, NULL)$s$)$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('alcance: nada cambió tras los rechazos',
  $q$SELECT pg_temp.vig('P3') || '|' || pg_temp.vig('P1') || '|' || pg_temp.vig('P4')$q$, 'G3:Miembro|G2:Líder|-');

-- 7. Validaciones de mover.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('mover: ' || v.n, format('SELECT pg_temp.error(%L)', v.q), v.e)
  FROM (VALUES
    ('rol inválido', $s$SELECT pg_temp.mover('P4', 'G2', 'jefe')$s$, 'ERR:22023 El rol debe ser lider, aprendiz o miembro'),
    ('rol obligatorio con destino', $s$SELECT pg_temp.mover('P4', 'G2', NULL)$s$, 'ERR:22023 El rol debe ser lider, aprendiz o miembro'),
    ('sin personas', $s$SELECT public.planner_mover_personas('e6200000-0000-4000-8000-0000000000c1', ARRAY[]::uuid[], 'e6200000-0000-4000-8000-0000000000d2', 'miembro')::text$s$,
       'ERR:22023 Indica al menos una persona'),
    ('persona inexistente', $s$SELECT public.planner_mover_personas('e6200000-0000-4000-8000-0000000000c1', ARRAY['e6200000-0000-4000-8000-0000000000ee']::uuid[], 'e6200000-0000-4000-8000-0000000000d2', 'miembro')::text$s$,
       'ERR:22023 Alguna de las personas no existe'),
    ('destino eliminado', $s$SELECT pg_temp.mover('P4', 'Viejo', 'miembro')$s$, 'ERR:22023 El grupo no existe o fue eliminado'),
    ('destino de otra temporada', $s$SELECT pg_temp.mover('P4', 'Activa', 'miembro')$s$, 'ERR:22023 El grupo no es de esta temporada')
  ) v(n, q, e);

-- 8. Crear grupos (S3, S4, S6).
SELECT pg_temp.assert_eq('crear: grupo con localidad, horario y director',
  $q$SELECT pg_temp.crear('Nuevo', jsonb_build_object('nombre', '  ZZ Pp   Nuevo ', 'segmento_id', 'e6200000-0000-4000-8000-0000000000a1',
        'localidad_id', 'e6200000-0000-4000-8000-0000000000e1', 'dia_reunion', 'Martes', 'hora_reunion', '7:30 PM',
        'capacidad_maxima', 10, 'director_etapa_ids', jsonb_build_array('e6200000-0000-4000-8000-000000000004')))$q$,
  'creó el grupo ZZ Pp Nuevo');
SELECT pg_temp.marcar('crear Nuevo');
SELECT pg_temp.assert_eq('crear: campos guardados; campus de la localidad; próximo, inactivo y pendiente',
  $q$SELECT concat_ws('|', g.nombre, g.segmento_id, g.localidad_id, (g.campus_id = cl.campus_id)::text, g.dia_reunion, g.hora_reunion,
                      g.capacidad_maxima, g.estado_ciclo, g.activo::text, g.estado_aprobacion, g.eliminado::text,
                      (g.creado_por_usuario_id = pg_temp.u('DE'))::text)
       FROM public.grupos g JOIN public.campus_localidades cl ON cl.id = g.localidad_id WHERE g.id = pg_temp.g('Nuevo')$q$,
  'ZZ Pp Nuevo|e6200000-0000-4000-8000-0000000000a1|e6200000-0000-4000-8000-0000000000e1|true|Martes|19:30:00|10|proximo|false|pendiente|false|true');
SELECT pg_temp.assert_eq('crear: vínculo con el director de etapa del segmento',
  $q$SELECT string_agg(director_etapa_id::text, ',') FROM public.director_etapa_grupos WHERE grupo_id = pg_temp.g('Nuevo')$q$,
  'e6200000-0000-4000-8000-0000000000b1');
SELECT pg_temp.assert_eq('crear: el paso', $q$SELECT pg_temp.paso(pg_temp.p('crear Nuevo'))$q$, 'crear_grupo|DE|Nuevo|-|ZZ Pp S1');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('crear: sin localidad ni directores (bloquea solo al publicar, S6)',
  $q$SELECT pg_temp.crear('SinDir', '{"nombre": "ZZ Pp Sin director", "segmento_id": "e6200000-0000-4000-8000-0000000000a2"}')$q$,
  'creó el grupo ZZ Pp Sin director');
SELECT pg_temp.assert_eq('crear: valores por defecto, sin localidad, campus ni directores',
  $q$SELECT concat_ws('|', coalesce(g.localidad_id::text, '-'), coalesce(g.campus_id::text, '-'), g.dia_reunion, g.hora_reunion,
                      g.capacidad_maxima, (SELECT count(*) FROM public.director_etapa_grupos d WHERE d.grupo_id = g.id))
       FROM public.grupos g WHERE g.id = pg_temp.g('SinDir')$q$,
  '-|-|Jueves|19:30:00|12|0');
SELECT pg_temp.marcar('crear SinDir');
SELECT pg_temp.assert_eq('crear: el mismo nombre en otro segmento se permite',
  $q$SELECT pg_temp.crear('Nuevo S2', '{"nombre": "ZZ Pp Nuevo", "segmento_id": "e6200000-0000-4000-8000-0000000000a2"}')$q$,
  'creó el grupo ZZ Pp Nuevo');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('crear: ' || v.n,
  format('SELECT pg_temp.error(%L)', format('SELECT pg_temp.crear(''X'', %L)', v.d)), v.e)
  FROM (VALUES
    ('nombre repetido sin distinguir mayúsculas', '{"nombre": "zz pp nuevo", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}',
       'ERR:22023 Ya existe un grupo llamado «ZZ Pp Nuevo» en ZZ Pp S1 en esta temporada'),
    ('nombre repetido sin distinguir espacios', '{"nombre": "ZZ  Pp g1", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}',
       'ERR:22023 Ya existe un grupo llamado «ZZ Pp G1» en ZZ Pp S1 en esta temporada'),
    ('nombre de un grupo eliminado', '{"nombre": "ZZ Pp Viejo", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}',
       'ERR:22023 Existe un grupo eliminado llamado «ZZ Pp Viejo» en ZZ Pp S1 en esta temporada; usa otro nombre'),
    ('localidad inactiva', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "localidad_id": "e6200000-0000-4000-8000-0000000000e2"}',
       'ERR:22023 La localidad no existe o está inactiva'),
    ('localidad inexistente', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "localidad_id": "e6200000-0000-4000-8000-0000000000ee"}',
       'ERR:22023 La localidad no existe o está inactiva'),
    ('director de otro segmento', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "director_etapa_ids": ["e6200000-0000-4000-8000-000000000005"]}',
       'ERR:22023 ZZ Pp DE2 no es director de etapa de ZZ Pp S1'),
    ('más de 4 directores', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "director_etapa_ids": ["e6200000-0000-4000-8000-0000000000e1", "e6200000-0000-4000-8000-0000000000e2", "e6200000-0000-4000-8000-0000000000e3", "e6200000-0000-4000-8000-0000000000e4", "e6200000-0000-4000-8000-0000000000e5"]}',
       'ERR:22023 Un grupo puede tener hasta 4 directores de etapa'),
    ('director con formato inválido', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "director_etapa_ids": ["x"]}',
       'ERR:22023 Los directores de etapa deben ser una lista de ids'),
    ('hora inválida', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "hora_reunion": "now"}',
       'ERR:22023 La hora de reunión no es válida'),
    ('hora fuera de rango', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "hora_reunion": "25:99"}',
       'ERR:22023 La hora de reunión no es válida'),
    ('día inválido', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "dia_reunion": "Funday"}',
       'ERR:22023 El día de reunión no es válido'),
    ('capacidad inválida', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "capacidad_maxima": 0}',
       'ERR:22023 La capacidad debe ser un número entero mayor que 0'),
    ('nombre reservado', '{"nombre": "~ZZ", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}',
       'ERR:22023 El nombre del grupo no puede empezar con "~"'),
    ('sin nombre', '{"segmento_id": "e6200000-0000-4000-8000-0000000000a1"}', 'ERR:22023 El grupo debe tener nombre'),
    ('sin segmento', '{"nombre": "ZZ Pp X"}', 'ERR:22023 El grupo debe tener un segmento válido'),
    ('clave desconocida (activo no se toca)', '{"nombre": "ZZ Pp X", "segmento_id": "e6200000-0000-4000-8000-0000000000a1", "activo": true}',
       'ERR:22023 Campo no permitido: activo'),
    ('datos que no son objeto', '[1]', 'ERR:22023 Los datos del grupo deben ser un objeto')
  ) v(n, d, e);

-- 9. Editar grupos: solo las claves enviadas; un grupo vivo conserva activo y estado_ciclo (S8).
-- Las dos marcas otra vez (los pasos anteriores las borraron): editar en S1 deja la de S2.
SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a1');
SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_eq('editar: nombre y localidad de un grupo vivo',
  $q$SELECT pg_temp.editar('G1', '{"nombre": "ZZ Pp G1 Cabudare", "localidad_id": "e6200000-0000-4000-8000-0000000000e1"}')$q$,
  'editó el grupo ZZ Pp G1 Cabudare (nombre y localidad)');
SELECT pg_temp.marcar('editar G1');
SELECT pg_temp.assert_eq('editar: cambia lo enviado, conserva el resto, activo y estado_ciclo',
  $q$SELECT concat_ws('|', g.nombre, g.localidad_id, (g.campus_id = cl.campus_id)::text, g.activo::text, g.estado_ciclo, g.estado_aprobacion,
                      g.dia_reunion, g.hora_reunion, g.capacidad_maxima,
                      (SELECT string_agg(d.director_etapa_id::text, ',') FROM public.director_etapa_grupos d WHERE d.grupo_id = g.id))
       FROM public.grupos g JOIN public.campus_localidades cl ON cl.id = g.localidad_id WHERE g.id = pg_temp.g('G1')$q$,
  'ZZ Pp G1 Cabudare|e6200000-0000-4000-8000-0000000000e1|true|true|activo|aprobado|Jueves|19:30:00|12|e6200000-0000-4000-8000-0000000000b1');
SELECT pg_temp.assert_eq('S17: editar borra la marca del segmento y la guarda en el paso',
  $q$SELECT pg_temp.terminados() || '|' || (SELECT count(*) FROM public.planner_pasos p, jsonb_array_elements(p.antes->'terminados') t
                                              WHERE p.id = pg_temp.p('editar G1'))::text$q$,
  'ZZ Pp S2|1');
SELECT pg_temp.assert_eq('editar: el paso', $q$SELECT pg_temp.paso(pg_temp.p('editar G1'))$q$, 'editar_grupo|DE|G1|-|ZZ Pp S1');
SELECT pg_temp.assert_eq('editar: ' || v.n, format('SELECT pg_temp.error(%L)', v.q), v.e)
  FROM (VALUES
    ('sin cambios', $s$SELECT pg_temp.editar('G1', '{"nombre": "ZZ Pp G1 Cabudare"}')$s$, 'ERR:22023 No hay cambios para guardar'),
    ('objeto vacío', $s$SELECT pg_temp.editar('G1', '{}')$s$, 'ERR:22023 No hay cambios para guardar'),
    ('nombre de otro grupo', $s$SELECT pg_temp.editar('G1', '{"nombre": "zz pp g2"}')$s$,
       'ERR:22023 Ya existe un grupo llamado «ZZ Pp G2» en ZZ Pp S1 en esta temporada'),
    ('grupo eliminado', $s$SELECT pg_temp.editar('Viejo', '{"capacidad_maxima": 9}')$s$, 'ERR:22023 El grupo no existe o fue eliminado'),
    ('estado_ciclo no se toca', $s$SELECT pg_temp.editar('G1', '{"estado_ciclo": "proximo"}')$s$, 'ERR:22023 Campo no permitido: estado_ciclo'),
    ('nombre vacío', $s$SELECT pg_temp.editar('G1', '{"nombre": "  "}')$s$, 'ERR:22023 El grupo debe tener nombre'),
    ('segmento a uno ajeno', $s$SELECT pg_temp.editar('Nuevo', '{"segmento_id": "e6200000-0000-4000-8000-0000000000a2"}')$s$,
       'ERR:42501 No puedes mover grupos a ZZ Pp S2: no es uno de tus segmentos')
  ) v(n, q, e);
SELECT pg_temp.assert_eq('editar: quitar todos los directores (0 permitido)',
  $q$SELECT pg_temp.editar('Nuevo', '{"director_etapa_ids": []}')$q$, 'editó el grupo ZZ Pp Nuevo (directores de etapa)');
SELECT pg_temp.assert_eq('editar: el grupo queda sin directores',
  $q$SELECT count(*)::text FROM public.director_etapa_grupos d WHERE d.grupo_id = pg_temp.g('Nuevo')$q$, '0');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('editar: cambiar de segmento exige directores del segmento nuevo',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.editar('G1', '{"segmento_id": "e6200000-0000-4000-8000-0000000000a2"}')$s$)$q$,
  'ERR:22023 ZZ Pp DE no es director de etapa de ZZ Pp S2');
SELECT pg_temp.assert_eq('editar: día, hora y capacidad (el director general edita cualquier segmento)',
  $q$SELECT pg_temp.editar('SinDir', '{"dia_reunion": "Sábado", "hora_reunion": "18:00", "capacidad_maxima": "15"}')$q$,
  'editó el grupo ZZ Pp Sin director (día, hora y capacidad)');
SELECT pg_temp.assert_eq('editar: día, hora y capacidad guardados',
  $q$SELECT concat_ws('|', g.dia_reunion, g.hora_reunion, g.capacidad_maxima) FROM public.grupos g WHERE g.id = pg_temp.g('SinDir')$q$,
  'Sábado|18:00:00|15');

-- 10. Eliminar y deshacer la baja.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('eliminar: preparación, P4 al grupo nuevo', $q$SELECT pg_temp.mover('P4', 'Nuevo', 'miembro')$q$,
  'movió a ZZ Pp P4 a ZZ Pp Nuevo');
SELECT pg_temp.guardar_fila('P4 en Nuevo', 'P4', 'Nuevo');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('eliminar: baja lógica que devuelve a las personas al banco',
  $q$SELECT pg_temp.eliminar('Nuevo')$q$, 'eliminó el grupo ZZ Pp Nuevo y devolvió a ZZ Pp P4 al banco');
SELECT pg_temp.marcar('eliminar Nuevo');
SELECT pg_temp.assert_eq('eliminar: eliminado, inactivo y renombrado para liberar el nombre',
  $q$SELECT g.eliminado::text || '|' || g.activo::text || '|' || (g.nombre LIKE 'ZZ Pp Nuevo [eliminado %]')::text
       FROM public.grupos g WHERE g.id = pg_temp.g('Nuevo')$q$, 'true|false|true');
SELECT pg_temp.assert_eq('eliminar: la persona queda en el banco y su fila se borra',
  $q$SELECT pg_temp.vig('P4') || '|' || pg_temp.fila('P4', 'Nuevo')$q$, '-|-');
SELECT pg_temp.assert_eq('eliminar: el paso guarda la fila borrada',
  $q$SELECT (pg_temp.fila_antes(pg_temp.p('eliminar Nuevo'), 'P4', 'Nuevo') LIKE ((SELECT f.fila->>'id' FROM t_fila f WHERE f.tag = 'P4 en Nuevo') || '|Miembro|%'))::text$q$,
  'true');
SELECT pg_temp.assert_eq('eliminar: el paso nombra a las personas devueltas', $q$SELECT pg_temp.paso(pg_temp.p('eliminar Nuevo'))$q$,
  'eliminar_grupo|DG|Nuevo|P4|ZZ Pp S1');
SELECT pg_temp.assert_eq('eliminar: el tablero ya no lo muestra',
  $q$SELECT count(*)::text FROM public.planner_tablero('e6200000-0000-4000-8000-0000000000c1') WHERE grupo_id = pg_temp.g('Nuevo')$q$, '0');
SELECT pg_temp.assert_eq('eliminar: un grupo ya eliminado',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.eliminar('Nuevo')$s$)$q$, 'ERR:22023 El grupo no existe o fue eliminado');
SELECT pg_temp.assert_eq('deshacer: la baja restaura el grupo',
  $q$SELECT pg_temp.deshacer(pg_temp.p('eliminar Nuevo'))$q$,
  'deshizo el paso de ZZ Pp DG: eliminó el grupo ZZ Pp Nuevo y devolvió a ZZ Pp P4 al banco');
SELECT pg_temp.assert_eq('deshacer: la baja restaura nombre, estado y personas',
  $q$SELECT g.nombre || '|' || g.eliminado::text || '|' || g.activo::text || '|' || pg_temp.vig('P4')
       FROM public.grupos g WHERE g.id = pg_temp.g('Nuevo')$q$, 'ZZ Pp Nuevo|false|false|Nuevo:Miembro');
SELECT pg_temp.assert_eq('deshacer: la baja reinserta la fila idéntica (mismo id y columnas)',
  $q$SELECT pg_temp.fila_igual('P4 en Nuevo', 'P4', 'Nuevo')$q$, 'true');
SELECT pg_temp.assert_eq('deshacer: la baja ya deshecha no se deshace otra vez',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.deshacer(pg_temp.p('eliminar Nuevo'))$s$)$q$, 'ERR:55000');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('eliminar: el director de etapa elimina un grupo de su segmento',
  $q$SELECT pg_temp.eliminar('Nuevo')$q$, 'eliminó el grupo ZZ Pp Nuevo y devolvió a ZZ Pp P4 al banco');
SELECT pg_temp.assert_eq('eliminar: el nombre queda libre',
  $q$SELECT pg_temp.crear('Nuevo3', '{"nombre": "ZZ Pp Nuevo", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}')$q$,
  'creó el grupo ZZ Pp Nuevo');
SELECT pg_temp.marcar('crear Nuevo3');

-- 11. Más de 24 horas: el director de etapa ya no deshace; el director general sí.
SELECT pg_temp.assert_eq('deshacer: preparación, P8 a G2', $q$SELECT pg_temp.mover('P8', 'G2', 'miembro')$q$, 'movió a ZZ Pp P8 a ZZ Pp G2');
SELECT pg_temp.marcar('mover P8');
SELECT pg_temp.envejecer(pg_temp.p('mover P8'), 25);
SELECT pg_temp.assert_eq('deshacer: el director de etapa no deshace pasos de más de 24 horas',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('mover P8'))$s$)$q$,
  'ERR:42501 Solo puedes deshacer tus pasos de las últimas 24 horas');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('deshacer: el director general deshace un paso ajeno y viejo',
  $q$SELECT pg_temp.deshacer(pg_temp.p('mover P8'))$q$, 'deshizo el paso de ZZ Pp DE: movió a ZZ Pp P8 a ZZ Pp G2');
SELECT pg_temp.assert_eq('deshacer: la fila creada por el paso desaparece (P8 vuelve al banco)',
  $q$SELECT pg_temp.vig('P8') || '|' || pg_temp.fila('P8', 'G2')$q$, '-|-');

-- 12. Conflicto con un paso posterior.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('conflicto: paso A', $q$SELECT pg_temp.mover('P9', 'G2', 'miembro')$q$, 'movió a ZZ Pp P9 a ZZ Pp G2');
SELECT pg_temp.marcar('A');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('conflicto: paso B en el mismo grupo', $q$SELECT pg_temp.mover('P10', 'G2', 'miembro')$q$, 'movió a ZZ Pp P10 a ZZ Pp G2');
SELECT pg_temp.marcar('B');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('conflicto: A no se deshace y el motivo nombra a quien cambió después y qué',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('A'))$s$)$q$,
  'ERR:40001 No se puede deshacer: después ZZ Pp DG movió a ZZ Pp P10 a ZZ Pp G2');
SELECT pg_temp.assert_eq('historial: el autor ve el motivo del conflicto',
  $q$SELECT pg_temp.hist(pg_temp.p('A'))$q$, 'false|No se puede deshacer: después ZZ Pp DG movió a ZZ Pp P10 a ZZ Pp G2');
SELECT pg_temp.assert_eq('historial: el director de etapa no deshace pasos del director general',
  $q$SELECT pg_temp.hist(pg_temp.p('B'))$q$,
  'false|Solo quien hizo el cambio, el director general, un pastor o un administrador pueden deshacerlo');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a1');
SELECT pg_temp.marcar_terminado('e6200000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_eq('conflicto: B se deshace', $q$SELECT pg_temp.deshacer(pg_temp.p('B'))$q$,
  'deshizo el paso de ZZ Pp DG: movió a ZZ Pp P10 a ZZ Pp G2');
SELECT pg_temp.marcar('deshacer B');
SELECT pg_temp.assert_eq('S17: deshacer también borra la marca y la guarda',
  $q$SELECT pg_temp.terminados() || '|' || (SELECT count(*) FROM public.planner_pasos p, jsonb_array_elements(p.antes->'terminados') t
                                              WHERE p.id = pg_temp.p('deshacer B'))::text$q$,
  'ZZ Pp S2|1');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('conflicto: con B deshecho, A ya se deshace', $q$SELECT pg_temp.deshacer(pg_temp.p('A'))$q$,
  'deshizo el paso de ZZ Pp DE: movió a ZZ Pp P9 a ZZ Pp G2');
SELECT pg_temp.assert_eq('conflicto: P9 y P10 en el banco', $q$SELECT pg_temp.vig('P9') || '|' || pg_temp.vig('P10')$q$, '-|-');

-- 13. Un cambio hecho fuera del planificador impide deshacer.
SELECT pg_temp.assert_eq('fuera: paso E', $q$SELECT pg_temp.mover('P8', 'G2', 'miembro')$q$, 'movió a ZZ Pp P8 a ZZ Pp G2');
SELECT pg_temp.marcar('E');
UPDATE public.grupo_miembros SET rol = 'Líder' WHERE grupo_id = 'e6200000-0000-4000-8000-0000000000d2' AND usuario_id = 'e6200000-0000-4000-8000-000000000028';
SELECT pg_temp.assert_eq('fuera: no se deshace si el estado ya no es el que dejó el paso',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('E'))$s$)$q$,
  'ERR:40001 No se puede deshacer: el grupo o sus personas cambiaron fuera del planificador');
UPDATE public.grupo_miembros SET rol = 'Miembro' WHERE grupo_id = 'e6200000-0000-4000-8000-0000000000d2' AND usuario_id = 'e6200000-0000-4000-8000-000000000028';

-- 14. Historial por rol.
SELECT pg_temp.assert_eq('historial: el director de etapa no ve pasos que solo tocan otro segmento',
  $q$SELECT count(*)::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) h
      WHERE h.paso_id IN (pg_temp.p('crear SinDir'))$q$, '0');
SELECT pg_temp.assert_eq('historial: el director de etapa ve pasos ajenos de su segmento',
  $q$SELECT count(*)::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) h
      WHERE h.paso_id IN (pg_temp.p('eliminar Nuevo'), pg_temp.p('B'))$q$, '2');
SELECT pg_temp.assert_eq('historial: el autor puede deshacer su paso reciente',
  $q$SELECT pg_temp.hist(pg_temp.p('crear Nuevo3'))$q$, 'true|-');
SELECT pg_temp.assert_eq('historial: un paso deshecho',
  $q$SELECT pg_temp.hist(pg_temp.p('B'))$q$, 'false|Este paso ya se deshizo');
SELECT pg_temp.assert_eq('historial: un paso de deshacer',
  $q$SELECT pg_temp.hist(pg_temp.p('deshacer B'))$q$, 'false|Un deshacer no se puede deshacer; vuelve a hacer el cambio');
SELECT pg_temp.assert_eq('historial: campos de un paso',
  $q$SELECT concat_ws('|', h.accion, h.actor_nombre, h.descripcion, (h.segmentos)::text, (h.deshecho_por = pg_temp.p('deshacer B'))::text,
                      coalesce(h.deshace_paso_id::text, '-'), h.deshecho_por_nombre)
       FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) h WHERE h.paso_id = pg_temp.p('B')$q$,
  'mover_personas|ZZ Pp DG|movió a ZZ Pp P10 a ZZ Pp G2|[{"id": "e6200000-0000-4000-8000-0000000000a1", "nombre": "ZZ Pp S1"}]|true|-|ZZ Pp DG');
SELECT pg_temp.assert_eq('historial: el paso de deshacer apunta al deshecho',
  $q$SELECT (h.deshace_paso_id = pg_temp.p('B'))::text
       FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) h WHERE h.paso_id = pg_temp.p('deshacer B')$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('historial: el director general ve todos los pasos de la temporada',
  $q$SELECT ((SELECT count(*) FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500))
             = (SELECT count(*) FROM public.planner_pasos WHERE temporada_id = 'e6200000-0000-4000-8000-0000000000c1'))::text
            || '|' || (SELECT count(*) FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) h
                        WHERE h.paso_id = pg_temp.p('crear SinDir'))::text$q$, 'true|1');
SELECT pg_temp.assert_eq('historial: el director general puede deshacer el paso de un director de etapa',
  $q$SELECT pg_temp.hist(pg_temp.p('crear Nuevo3'))$q$, 'true|-');
SELECT pg_temp.assert_eq('historial: el más nuevo primero',
  $q$SELECT (h.paso_id = pg_temp.ultimo())::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1') h LIMIT 1$q$, 'true');
SELECT pg_temp.assert_eq('historial: orden descendente por fecha',
  $q$SELECT bool_and(x.creado_en >= x.siguiente)::text
       FROM (SELECT h.creado_en, lead(h.creado_en) OVER (ORDER BY o) AS siguiente
               FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500) WITH ORDINALITY h(paso_id, numero, accion, descripcion, creado_en, actor_id, actor_nombre, segmentos, grupo_ids, usuario_ids, deshace_paso_id, deshecho_por, deshecho_por_nombre, puede_deshacer, motivo_no_deshacer, o)) x
      WHERE x.siguiente IS NOT NULL$q$, 'true');
SELECT pg_temp.assert_eq('historial: límite',
  $q$SELECT count(*)::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 2)$q$, '2');
SELECT pg_temp.assert_eq('historial: página anterior a una fecha',
  $q$SELECT (count(*) > 0 AND bool_and(h.creado_en < (SELECT p.creado_en FROM public.planner_pasos p WHERE p.id = pg_temp.p('crear Nuevo3'))))::text
       FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1', 500,
              (SELECT p.creado_en FROM public.planner_pasos p WHERE p.id = pg_temp.p('crear Nuevo3'))) h$q$, 'true');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('historial: un pastor también puede deshacer pasos ajenos',
  $q$SELECT pg_temp.hist(pg_temp.p('crear Nuevo3'))$q$, 'true|-');

-- 15. Por PostgREST: authenticated llama la RPC pero no lee las tablas.
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_eq('authenticated: el admin lee el historial por la RPC',
  $q$SELECT (count(*) > 0)::text FROM public.planner_historial('e6200000-0000-4000-8000-0000000000c1')$q$, 'true');
SELECT pg_temp.assert_eq('authenticated: no lee planner_pasos directamente',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_pasos')$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('authenticated: no escribe planner_segmentos_terminados directamente',
  $q$SELECT pg_temp.outcome('INSERT INTO public.planner_segmentos_terminados (temporada_id, segmento_id) VALUES (''e6200000-0000-4000-8000-0000000000c1'', ''e6200000-0000-4000-8000-0000000000a1'') RETURNING 1')$q$,
  'ERR:42501');
RESET ROLE;

-- 16. La temporada deja de estar en planificación: nada se mueve ni se deshace.
UPDATE public.temporadas SET estado = 'activa' WHERE id = 'e6200000-0000-4000-8000-0000000000c1';
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('temporada: no se deshace fuera de planificación',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('crear Nuevo3'))$s$)$q$,
  'ERR:22023 La temporada ya no está en planificación');
SELECT pg_temp.assert_eq('temporada: no se mueve fuera de planificación',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.mover('P2', 'G2', 'miembro')$s$)$q$, 'ERR:22023');
SELECT pg_temp.assert_eq('temporada: el historial lo informa',
  $q$SELECT pg_temp.hist(pg_temp.p('crear Nuevo3'))$q$, 'false|La temporada ya no está en planificación');
UPDATE public.temporadas SET estado = 'planificacion' WHERE id = 'e6200000-0000-4000-8000-0000000000c1';

-- 17. Deshacer la creación da de baja el grupo y libera el nombre.
SELECT pg_temp.assert_eq('deshacer: la creación', $q$SELECT pg_temp.deshacer(pg_temp.p('crear Nuevo3'))$q$,
  'deshizo el paso de ZZ Pp DE: creó el grupo ZZ Pp Nuevo');
SELECT pg_temp.assert_eq('deshacer: el grupo creado queda eliminado y fuera del tablero',
  $q$SELECT g.eliminado::text || '|' || (SELECT count(*) FROM public.planner_tablero('e6200000-0000-4000-8000-0000000000c1') t
                                         WHERE t.grupo_id = g.id)::text
       FROM public.grupos g WHERE g.id = pg_temp.g('Nuevo3')$q$, 'true|0');

-- 18. Deshacer una salida al banco reinserta la fila idéntica.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.guardar_fila('P12 en G3', 'P12', 'G3');
SELECT pg_temp.assert_eq('salida: P12 de G3 al banco', $q$SELECT pg_temp.mover('P12', NULL, NULL)$q$,
  'devolvió a ZZ Pp P12 al banco desde ZZ Pp G3');
SELECT pg_temp.marcar('salida P12');
SELECT pg_temp.assert_eq('salida: la fila se borra', $q$SELECT pg_temp.fila('P12', 'G3')$q$, '-');
SELECT pg_temp.assert_eq('salida: el paso guarda la fila completa',
  $q$SELECT pg_temp.fila_antes(pg_temp.p('salida P12'), 'P12', 'G3')$q$, 'e6200000-0000-4000-8000-0000000000f6|Colíder|2091-01-20');
SELECT pg_temp.assert_eq('salida: deshacer', $q$SELECT pg_temp.deshacer(pg_temp.p('salida P12'))$q$,
  'deshizo el paso de ZZ Pp DG: devolvió a ZZ Pp P12 al banco desde ZZ Pp G3');
SELECT pg_temp.assert_eq('salida: deshacer reinserta la fila idéntica (mismo id y columnas)',
  $q$SELECT pg_temp.fila_igual('P12 en G3', 'P12', 'G3')$q$, 'true');

-- 19. Deshacer nunca deja a nadie en dos grupos de la temporada (alta hecha fuera del planificador).
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('dos grupos: P2 a G2', $q$SELECT pg_temp.mover('P2', 'G2', 'miembro')$q$, 'movió a ZZ Pp P2 a ZZ Pp G2');
SELECT pg_temp.assert_eq('dos grupos: P2 al banco', $q$SELECT pg_temp.mover('P2', NULL, NULL)$q$,
  'devolvió a ZZ Pp P2 al banco desde ZZ Pp G2');
SELECT pg_temp.marcar('banco P2');
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
VALUES ('e6200000-0000-4000-8000-0000000000d3', 'e6200000-0000-4000-8000-000000000022', 'Miembro');
SELECT pg_temp.assert_eq('dos grupos: el historial no ofrece deshacer y dice por qué',
  $q$SELECT pg_temp.hist(pg_temp.p('banco P2'))$q$,
  'false|No se puede deshacer: ZZ Pp P2 ahora está en ZZ Pp G3; primero quita a esa persona de ese grupo');
SELECT pg_temp.assert_eq('dos grupos: deshacer se rechaza con 40001',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.deshacer(pg_temp.p('banco P2'))$s$)$q$,
  'ERR:40001 No se puede deshacer: ZZ Pp P2 ahora está en ZZ Pp G3; primero quita a esa persona de ese grupo');
SELECT pg_temp.assert_eq('dos grupos: P2 sigue solo en G3', $q$SELECT pg_temp.vig('P2')$q$, 'G3:Miembro');

-- Variante: deshacer la baja de un grupo cuyas personas la app puso en otro grupo.
SELECT pg_temp.assert_eq('dos grupos: crear Borrable',
  $q$SELECT pg_temp.crear('Borrable', '{"nombre": "ZZ Pp Borrable", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}')$q$,
  'creó el grupo ZZ Pp Borrable');
SELECT pg_temp.assert_eq('dos grupos: P4 a Borrable', $q$SELECT pg_temp.mover('P4', 'Borrable', 'miembro')$q$,
  'movió a ZZ Pp P4 a ZZ Pp Borrable');
SELECT pg_temp.assert_eq('dos grupos: eliminar Borrable', $q$SELECT pg_temp.eliminar('Borrable')$q$,
  'eliminó el grupo ZZ Pp Borrable y devolvió a ZZ Pp P4 al banco');
SELECT pg_temp.marcar('eliminar Borrable');
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
VALUES ('e6200000-0000-4000-8000-0000000000d1', 'e6200000-0000-4000-8000-000000000024', 'Miembro');
SELECT pg_temp.assert_eq('dos grupos: el historial no ofrece deshacer la baja',
  $q$SELECT pg_temp.hist(pg_temp.p('eliminar Borrable'))$q$,
  'false|No se puede deshacer: ZZ Pp P4 ahora está en ZZ Pp G1 Cabudare; primero quita a esa persona de ese grupo');
SELECT pg_temp.assert_eq('dos grupos: deshacer la baja se rechaza con 40001',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.deshacer(pg_temp.p('eliminar Borrable'))$s$)$q$, 'ERR:40001');
SELECT pg_temp.assert_eq('dos grupos: P4 solo en G1 y Borrable sigue eliminado',
  $q$SELECT pg_temp.vig('P4') || '|' || (SELECT g.eliminado::text FROM public.grupos g WHERE g.id = pg_temp.g('Borrable'))$q$,
  'G1:Miembro|true');

-- 20. Deshacer un alta no deja personas en un grupo dado de baja (la app las agregó después).
SELECT pg_temp.assert_eq('alta: crear Vacio',
  $q$SELECT pg_temp.crear('Vacio', '{"nombre": "ZZ Pp Vacio", "segmento_id": "e6200000-0000-4000-8000-0000000000a1"}')$q$,
  'creó el grupo ZZ Pp Vacio');
SELECT pg_temp.marcar('crear Vacio');
INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
SELECT pg_temp.g('Vacio'), 'e6200000-0000-4000-8000-000000000030', 'Miembro';
SELECT pg_temp.assert_eq('alta: el historial no ofrece deshacer el alta',
  $q$SELECT pg_temp.hist(pg_temp.p('crear Vacio'))$q$,
  'false|No se puede deshacer: ZZ Pp Vacio ya tiene personas (ZZ Pp P10); quítalas primero');
SELECT pg_temp.assert_eq('alta: deshacer se rechaza con 40001',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.deshacer(pg_temp.p('crear Vacio'))$s$)$q$, 'ERR:40001');
SELECT pg_temp.assert_eq('alta: el grupo sigue vigente con su persona',
  $q$SELECT (SELECT g.eliminado::text FROM public.grupos g WHERE g.id = pg_temp.g('Vacio')) || '|' || pg_temp.vig('P10')$q$,
  'false|Vacio:Miembro');

-- 21. S22: un grupo que ya arrancó no se elimina (activo, estado_ciclo 'activo' o con reuniones
-- registradas); el rechazo no escribe nada. Los grupos nuevos sin arrancar sí (casos 10 y 19).
CREATE OR REPLACE FUNCTION pg_temp.estado_grupo(p_tag text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
           'grupo', (SELECT to_jsonb(g) FROM public.grupos g WHERE g.id = pg_temp.g(p_tag)),
           'miembros', (SELECT coalesce(jsonb_agg(to_jsonb(gm) ORDER BY gm.id), '[]'::jsonb)
                          FROM public.grupo_miembros gm WHERE gm.grupo_id = pg_temp.g(p_tag)),
           'directores', (SELECT count(*) FROM public.director_etapa_grupos d WHERE d.grupo_id = pg_temp.g(p_tag)),
           'pasos', (SELECT count(*) FROM public.planner_pasos p WHERE p.temporada_id = 'e6200000-0000-4000-8000-0000000000c1'),
           'terminados', pg_temp.terminados());
$$;

SELECT pg_temp.as_user(pg_temp.a('DG'));
INSERT INTO t_fila(tag, fila) SELECT 'S22 G1', pg_temp.estado_grupo('G1');
SELECT pg_temp.assert_eq('S22: preparación, G1 sigue vivo y con personas',
  $q$SELECT g.activo::text || '|' || g.estado_ciclo || '|' || (SELECT count(*) FROM public.grupo_miembros gm WHERE gm.grupo_id = g.id)::text
       FROM public.grupos g WHERE g.id = pg_temp.g('G1')$q$, 'true|activo|4');
SELECT pg_temp.assert_eq('S22: no se elimina un grupo que ya se reúne (22023 con mensaje)',
  $q$SELECT pg_temp.error($s$SELECT pg_temp.eliminar('G1')$s$)$q$,
  'ERR:22023 No puedes eliminar ZZ Pp G1 Cabudare: ya se reúne. Solo se pueden eliminar grupos nuevos que todavía no arrancaron; '
  || 'mueve a sus personas si hace falta.');
SELECT pg_temp.assert_eq('S22: el rechazo no cambia el grupo, sus personas, sus directores, los pasos ni las marcas',
  $q$SELECT (pg_temp.estado_grupo('G1') = f.fila)::text FROM t_fila f WHERE f.tag = 'S22 G1'$q$, 'true');
-- El alcance va primero: un director de etapa de otro segmento recibe 42501, no 22023.
SELECT pg_temp.as_user(pg_temp.a('DE2'));
SELECT pg_temp.assert_eq('S22: el alcance se comprueba antes (42501 en otro segmento)',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.eliminar('G1')$s$)$q$, 'ERR:42501');
-- El director de etapa del segmento tampoco lo elimina.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('S22: el director de etapa del segmento tampoco elimina un grupo vivo',
  $q$SELECT pg_temp.outcome($s$SELECT pg_temp.eliminar('G1')$s$)$q$, 'ERR:22023');

-- Cada señal por separado: con reuniones registradas, solo activo, solo estado_ciclo 'activo'.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('S22: crear ' || v.tag,
  format('SELECT pg_temp.crear(%L, %L)', v.tag, jsonb_build_object('nombre', 'ZZ Pp ' || v.tag, 'segmento_id', 'e6200000-0000-4000-8000-0000000000a1')),
  'creó el grupo ZZ Pp ' || v.tag)
  FROM (VALUES ('Reunido'), ('Encendido'), ('EnCiclo')) v(tag);
INSERT INTO public.eventos_grupo (id, grupo_id, fecha)
VALUES ('e6200000-0000-4000-8000-0000000000e9', pg_temp.g('Reunido'), DATE '2091-10-08');
UPDATE public.grupos SET activo = true WHERE id = pg_temp.g('Encendido');
UPDATE public.grupos SET estado_ciclo = 'activo' WHERE id = pg_temp.g('EnCiclo');
INSERT INTO t_fila(tag, fila) SELECT 'S22 ' || v.tag, pg_temp.estado_grupo(v.tag) FROM (VALUES ('Reunido'), ('Encendido'), ('EnCiclo')) v(tag);
SELECT pg_temp.assert_eq('S22: no se elimina ' || v.tag || ' (' || v.senal || ')',
  format('SELECT pg_temp.error(%L)', format('SELECT pg_temp.eliminar(%L)', v.tag)),
  'ERR:22023 No puedes eliminar ZZ Pp ' || v.tag || ': ya se reúne. Solo se pueden eliminar grupos nuevos que todavía no arrancaron; '
  || 'mueve a sus personas si hace falta.')
  FROM (VALUES ('Reunido', 'una reunión registrada'), ('Encendido', 'activo'), ('EnCiclo', 'estado_ciclo activo')) v(tag, senal);
SELECT pg_temp.assert_eq('S22: ' || v.tag || ' queda igual tras el rechazo',
  format($q$SELECT (pg_temp.estado_grupo(%L) = f.fila)::text FROM t_fila f WHERE f.tag = %L$q$, v.tag, 'S22 ' || v.tag), 'true')
  FROM (VALUES ('Reunido'), ('Encendido'), ('EnCiclo')) v(tag);

SELECT count(*) AS aserciones FROM t_pp_asserts;
SELECT case_name AS fallidos FROM t_pp_failures ORDER BY case_name;

ROLLBACK;
