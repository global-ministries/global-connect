-- planner_temporadas, planner_tablero y planner_banco — lecturas del planificador de GDV
-- (T1 de odd/tasks/planner-gdv.md: S5, S10, S11; contexto S2–S7, S14, S17, S19).
--
-- Cubre:
--   1. Privilegios: anon sin EXECUTE, authenticated con EXECUTE, SECURITY DEFINER con
--      search_path fijo; el ayudante interno no lo ejecuta authenticated.
--   2. Autorización: sin sesión 28000; un rol que no planifica (líder) 42501 con mensaje en
--      español; admin, pastor, director general y director de etapa leen.
--   3. Capacidades por rol (S10, S12, S20): publicar y crear temporada solo admin, pastor y
--      director general; segmentos editables = todos o solo los del director de etapa.
--   4. Cohorte y temporada de origen (S19): una "-I" nueva toma la "-I" anterior, nunca la "-II";
--      nombre sin sufijo = sin cohorte ni origen.
--   5. Tablero por rol (S10): el director general ve los grupos de todos los segmentos, el
--      director de etapa solo los de su segmento; grupos eliminados fuera; miembros por rol sin
--      los que salieron; directores; localidad y municipio; líderes de origen por persona para
--      "repite líder" (S7).
--   6. Banco (S11, S5, S2): sin límite de segmento para el director de etapa; persona nueva sin
--      grupo ni segmento; cónyuge determinista; edad, municipio y "sin dirección"; grupo actual,
--      grupo y líderes de origen, grupos en otras temporadas activas; nunca correo ni teléfono.
--   7. Directores elegibles por segmento (T5c, S3, S6, S10): cada segmento de planner_temporadas
--      trae sus directores de etapa (filas director_etapa de segmento_lideres, como
--      planner_paso_validar_grupo), aunque no dirijan ningún grupo; nunca los de otro segmento ni
--      otro tipo de líder; el director de etapa solo ve los de sus segmentos.
--
-- Se ejecuta dentro de BEGIN…ROLLBACK (staging o el arnés local): nada se conserva; los datos
-- viven en el espacio e6100000-... con nombre 'ZZ Pl' y fechas en 2089–2092. El último statement
-- es un SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pl_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pl_asserts (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pl_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  -- Fuera del bloque con EXCEPTION: un error no revierte el conteo.
  INSERT INTO t_pl_asserts(case_name) VALUES (p_case);
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

-- Mensaje de error de un statement ('' si no falla).
CREATE OR REPLACE FUNCTION pg_temp.mensaje(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN ''; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END;
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
  SELECT auth_id FROM public.usuarios WHERE nombre = 'ZZ Pl' AND apellido = p_tag;
$$;

CREATE OR REPLACE FUNCTION pg_temp.u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ Pl' AND apellido = p_tag;
$$;

-- Una fila del banco de la temporada destino (c3) como texto 'campo|campo|…' ('-' = NULL).
CREATE OR REPLACE FUNCTION pg_temp.banco(p_tag text, p_campos text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE format(
    'SELECT concat_ws(''|'', %s) FROM public.planner_banco(''e6100000-0000-4000-8000-0000000000c3'') b WHERE b.usuario_id = %L',
    (SELECT string_agg(format('coalesce((b.%I)::text, ''-'')', btrim(c)), ', ')
       FROM unnest(string_to_array(p_campos, ',')) c),
    pg_temp.u(p_tag))
  INTO v;
  RETURN v;
END;
$$;

-- Apellidos de las personas de un arreglo jsonb del tablero, en el orden devuelto.
CREATE OR REPLACE FUNCTION pg_temp.apellidos(p_personas jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(u.apellido, ',' ORDER BY e.ord)
    FROM jsonb_array_elements(p_personas) WITH ORDINALITY e(v, ord)
    JOIN public.usuarios u ON u.id = (e.v->>'usuario_id')::uuid;
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- Temporadas: c0 2089-I, c1 2090-I (origen de c3), c2 2090-II (activa, otra cohorte),
-- c3 2091-I (destino, en planificación), c4 sin sufijo de cohorte.
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6100000-0000-4000-8000-0000000000c0', 'ZZ Pl 2089 - I',  DATE '2089-02-01', DATE '2090-01-31', false, 'finalizada'),
  ('e6100000-0000-4000-8000-0000000000c1', 'ZZ Pl 2090 - I',  DATE '2090-02-01', DATE '2091-01-31', false, 'finalizada'),
  ('e6100000-0000-4000-8000-0000000000c2', 'ZZ Pl 2090-II',   DATE '2090-10-01', DATE '2091-09-30', true,  'activa'),
  ('e6100000-0000-4000-8000-0000000000c3', 'ZZ Pl 2091 - I',  DATE '2091-02-01', DATE '2092-01-31', false, 'planificacion'),
  ('e6100000-0000-4000-8000-0000000000c4', 'ZZ Pl especial',  DATE '2091-03-01', DATE '2091-06-30', false, 'planificacion');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6100000-0000-4000-8000-0000000000a1', 'ZZ Pl S1'),
  ('e6100000-0000-4000-8000-0000000000a2', 'ZZ Pl S2');

-- Geografía: municipio e2 con parroquia e3; localidad e1 en ese municipio.
INSERT INTO public.paises (id, nombre) VALUES ('e6100000-0000-4000-8000-0000000000e5', 'ZZ Pl País');
INSERT INTO public.estados (id, nombre, pais_id) VALUES
  ('e6100000-0000-4000-8000-0000000000e4', 'ZZ Pl Estado', 'e6100000-0000-4000-8000-0000000000e5');
INSERT INTO public.municipios (id, nombre, estado_id) VALUES
  ('e6100000-0000-4000-8000-0000000000e2', 'ZZ Pl Municipio', 'e6100000-0000-4000-8000-0000000000e4');
INSERT INTO public.parroquias (id, nombre, municipio_id) VALUES
  ('e6100000-0000-4000-8000-0000000000e3', 'ZZ Pl Parroquia', 'e6100000-0000-4000-8000-0000000000e2');
INSERT INTO public.direcciones (id, calle, parroquia_id) VALUES
  ('e6100000-0000-4000-8000-0000000000e6', 'ZZ Pl calle con parroquia', 'e6100000-0000-4000-8000-0000000000e3'),
  ('e6100000-0000-4000-8000-0000000000e7', 'ZZ Pl calle sin parroquia', NULL);
INSERT INTO public.campus_localidades (id, campus_id, nombre, municipio_id)
SELECT 'e6100000-0000-4000-8000-0000000000e1', c.id, 'ZZ Pl Localidad', 'e6100000-0000-4000-8000-0000000000e2'
  FROM public.campus c ORDER BY c.id LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('e6100000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'zzpl-adm@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6100000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'zzpl-pas@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6100000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'zzpl-dg@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6100000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'zzpl-de@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('e6100000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'zzpl-lid@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- ADM admin, PAS pastor, DG director general, DE director de etapa de S1, LID líder (no
-- planifica), DIR2 director de etapa de S2 sin cuenta; el resto son personas del banco.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id, fecha_nacimiento, direccion_id, email, telefono) VALUES
  ('e6100000-0000-4000-8000-000000000001', 'ZZ Pl', 'ADM',   'Otro',      'Soltero', 'e6100000-0000-4000-8000-000000000101', NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000002', 'ZZ Pl', 'PAS',   'Otro',      'Soltero', 'e6100000-0000-4000-8000-000000000102', NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000003', 'ZZ Pl', 'DG',    'Otro',      'Soltero', 'e6100000-0000-4000-8000-000000000103', NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000004', 'ZZ Pl', 'DE',    'Otro',      'Soltero', 'e6100000-0000-4000-8000-000000000104', NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000005', 'ZZ Pl', 'LID',   'Otro',      'Soltero', 'e6100000-0000-4000-8000-000000000105', NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000006', 'ZZ Pl', 'DIR2',  'Otro',      'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000011', 'ZZ Pl', 'L1',    'Masculino', 'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000012', 'ZZ Pl', 'L2',    'Femenino',  'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000013', 'ZZ Pl', 'L3',    'Masculino', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000014', 'ZZ Pl', 'M1',    'Femenino',  'Soltero', NULL, (current_date - interval '30 years 1 day')::date,
     'e6100000-0000-4000-8000-0000000000e6', 'zzpl-m1@example.test', '+580000000000'),
  ('e6100000-0000-4000-8000-000000000015', 'ZZ Pl', 'M2',    'Masculino', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000016', 'ZZ Pl', 'A1',    'Femenino',  'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000017', 'ZZ Pl', 'SAL',   'Femenino',  'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000018', 'ZZ Pl', 'NUEVO', 'Masculino', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000019', 'ZZ Pl', 'DUP',   'Masculino', 'Soltero', NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000021', 'ZZ Pl', 'X',     'Femenino',  'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000022', 'ZZ Pl', 'Y',     'Masculino', 'Casado',  NULL, NULL, 'e6100000-0000-4000-8000-0000000000e7', NULL, NULL),
  ('e6100000-0000-4000-8000-000000000023', 'ZZ Pl', 'Z',     'Masculino', 'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000024', 'ZZ Pl', 'W',     'Femenino',  'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000025', 'ZZ Pl', 'V',     'Masculino', 'Casado',  NULL, NULL, NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-000000000026', 'ZZ Pl', 'U',     'Masculino', 'Casado',  NULL, NULL, NULL, NULL, NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e6100000-0000-4000-8000-000000000001', 'admin'),
    ('e6100000-0000-4000-8000-000000000002', 'pastor'),
    ('e6100000-0000-4000-8000-000000000003', 'director-general'),
    ('e6100000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e6100000-0000-4000-8000-000000000005', 'lider'),
    ('e6100000-0000-4000-8000-000000000006', 'director-etapa')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6100000-0000-4000-8000-0000000000b1', 'e6100000-0000-4000-8000-0000000000a1', 'e6100000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e6100000-0000-4000-8000-0000000000b3', 'e6100000-0000-4000-8000-0000000000a2', 'e6100000-0000-4000-8000-000000000006', 'director_etapa');

-- Grupos: d0 (2089-I), d1 (2090-I, origen), d2 (2090-II activa), d3/d4 (destino), d5 (destino, eliminado).
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, localidad_id, activo, eliminado, estado_ciclo, estado_aprobacion,
                           capacidad_maxima, dia_reunion, hora_reunion) VALUES
  ('e6100000-0000-4000-8000-0000000000d0', 'ZZ Pl OLD', 'e6100000-0000-4000-8000-0000000000c0', 'e6100000-0000-4000-8000-0000000000a1', NULL, false, false, 'archivado', 'aprobado', NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-0000000000d1', 'ZZ Pl PI',  'e6100000-0000-4000-8000-0000000000c1', 'e6100000-0000-4000-8000-0000000000a1', NULL, false, false, 'archivado', 'aprobado', NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-0000000000d2', 'ZZ Pl PII', 'e6100000-0000-4000-8000-0000000000c2', 'e6100000-0000-4000-8000-0000000000a2', NULL, true,  false, 'activo',    'aprobado', NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'ZZ Pl N1',  'e6100000-0000-4000-8000-0000000000c3', 'e6100000-0000-4000-8000-0000000000a1',
     'e6100000-0000-4000-8000-0000000000e1', false, false, 'proximo', 'pendiente', 12, 'Jueves', '19:30'),
  ('e6100000-0000-4000-8000-0000000000d4', 'ZZ Pl N2',  'e6100000-0000-4000-8000-0000000000c3', 'e6100000-0000-4000-8000-0000000000a2', NULL, true,  false, 'proximo', 'pendiente', NULL, NULL, NULL),
  ('e6100000-0000-4000-8000-0000000000d5', 'ZZ Pl N3',  'e6100000-0000-4000-8000-0000000000c3', 'e6100000-0000-4000-8000-0000000000a1', NULL, false, true,  'proximo', 'pendiente', NULL, NULL, NULL);

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, fecha_salida) VALUES
  -- 2089-I: L3 lidera a M1 (no es el origen de 2091-I).
  ('e6100000-0000-4000-8000-0000000000d0', 'e6100000-0000-4000-8000-000000000013', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d0', 'e6100000-0000-4000-8000-000000000014', 'Miembro', NULL),
  -- 2090-I (origen): L1 lidera a M1 y X.
  ('e6100000-0000-4000-8000-0000000000d1', 'e6100000-0000-4000-8000-000000000011', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d1', 'e6100000-0000-4000-8000-000000000014', 'Miembro', NULL),
  ('e6100000-0000-4000-8000-0000000000d1', 'e6100000-0000-4000-8000-000000000021', 'Miembro', NULL),
  -- 2090-II (activa, otra cohorte): L2 lidera a M2.
  ('e6100000-0000-4000-8000-0000000000d2', 'e6100000-0000-4000-8000-000000000012', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d2', 'e6100000-0000-4000-8000-000000000015', 'Miembro', NULL),
  -- 2091-I N1: L1 y L2 líderes, A1 aprendiz, M1, M2 y DUP miembros, SAL ya salió.
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000011', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000012', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000016', 'Colíder', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000014', 'Miembro', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000015', 'Miembro', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000019', 'Miembro', NULL),
  ('e6100000-0000-4000-8000-0000000000d3', 'e6100000-0000-4000-8000-000000000017', 'Miembro', current_date - 1),
  -- 2091-I N2: L3 líder, X y DUP miembros.
  ('e6100000-0000-4000-8000-0000000000d4', 'e6100000-0000-4000-8000-000000000013', 'Líder', NULL),
  ('e6100000-0000-4000-8000-0000000000d4', 'e6100000-0000-4000-8000-000000000021', 'Miembro', NULL),
  ('e6100000-0000-4000-8000-0000000000d4', 'e6100000-0000-4000-8000-000000000019', 'Miembro', NULL),
  -- N3 eliminado: NUEVO no cuenta como ubicado.
  ('e6100000-0000-4000-8000-0000000000d5', 'e6100000-0000-4000-8000-000000000018', 'Miembro', NULL);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e6100000-0000-4000-8000-0000000000b1', 'e6100000-0000-4000-8000-0000000000d3'),
  ('e6100000-0000-4000-8000-0000000000b3', 'e6100000-0000-4000-8000-0000000000d4');

-- Cónyuges: X tiene dos (Y no principal con id menor, Z principal) → Z. W tiene dos no
-- principales (V con id menor, U) → V. M1–M2 son hermanos (no cuenta).
INSERT INTO public.relaciones_usuarios (id, usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  ('e6100000-0000-4000-8000-0000000000f1', 'e6100000-0000-4000-8000-000000000021', 'e6100000-0000-4000-8000-000000000022', 'conyuge', false),
  ('e6100000-0000-4000-8000-0000000000f2', 'e6100000-0000-4000-8000-000000000023', 'e6100000-0000-4000-8000-000000000021', 'conyuge', true),
  ('e6100000-0000-4000-8000-0000000000f3', 'e6100000-0000-4000-8000-000000000024', 'e6100000-0000-4000-8000-000000000025', 'conyuge', NULL),
  ('e6100000-0000-4000-8000-0000000000f4', 'e6100000-0000-4000-8000-000000000026', 'e6100000-0000-4000-8000-000000000024', 'conyuge', false),
  ('e6100000-0000-4000-8000-0000000000f5', 'e6100000-0000-4000-8000-000000000014', 'e6100000-0000-4000-8000-000000000015', 'hermano', NULL);

-- Cases ----------------------------------------------------------------------

-- 1. Privilegios y metadatos.
SELECT pg_temp.assert_eq('privilegios: anon no ejecuta ' || f,
  format($q$SELECT has_function_privilege('anon', %L, 'EXECUTE')::text$q$, f), 'false')
  FROM unnest(ARRAY['public.planner_temporadas()', 'public.planner_tablero(uuid)', 'public.planner_banco(uuid)']) f;
SELECT pg_temp.assert_eq('privilegios: authenticated ejecuta ' || f,
  format($q$SELECT has_function_privilege('authenticated', %L, 'EXECUTE')::text$q$, f), 'true')
  FROM unnest(ARRAY['public.planner_temporadas()', 'public.planner_tablero(uuid)', 'public.planner_banco(uuid)']) f;
SELECT pg_temp.assert_eq('metadatos: security definer con search_path fijo ' || f,
  format($q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '') FROM pg_proc p WHERE p.oid = %L::regprocedure$q$, f),
  'true{search_path=public}')
  FROM unnest(ARRAY['public.planner_temporadas()', 'public.planner_tablero(uuid)', 'public.planner_banco(uuid)',
                    'public.planner_alcance_actor()', 'public.planner_temporada_origen(uuid)',
                    'public.planner_lideres_origen(uuid)']) f;
SELECT pg_temp.assert_eq('privilegios: authenticated no ejecuta el ayudante ' || f,
  format($q$SELECT has_function_privilege('authenticated', %L, 'EXECUTE')::text
             || has_function_privilege('anon', %L, 'EXECUTE')::text$q$, f, f), 'falsefalse')
  FROM unnest(ARRAY['public.planner_alcance_actor()', 'public.planner_temporada_origen(uuid)',
                    'public.planner_lideres_origen(uuid)']) f;
SELECT pg_temp.assert_eq('banco: nunca devuelve correo, teléfono ni cédula',
  $q$SELECT bool_or(n IN ('email', 'telefono', 'cedula', 'correo'))::text
       FROM pg_proc p, unnest(p.proargnames) n WHERE p.oid = 'public.planner_banco(uuid)'::regprocedure$q$, 'false');

-- 2. Autorización.
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('auth: sin sesión 28000 en planner_temporadas',
  $q$SELECT pg_temp.outcome('SELECT public.planner_temporadas()::text')$q$, 'ERR:28000');
SELECT pg_temp.assert_eq('auth: sin sesión 28000 en planner_tablero',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_tablero(''e6100000-0000-4000-8000-0000000000c3'')')$q$, 'ERR:28000');
SELECT pg_temp.assert_eq('auth: sin sesión 28000 en planner_banco',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_banco(''e6100000-0000-4000-8000-0000000000c3'')')$q$, 'ERR:28000');

SELECT pg_temp.as_user(pg_temp.a('LID'));
SELECT pg_temp.assert_eq('auth: líder 42501 en planner_temporadas',
  $q$SELECT pg_temp.outcome('SELECT public.planner_temporadas()::text')$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('auth: líder 42501 en planner_tablero',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_tablero(''e6100000-0000-4000-8000-0000000000c3'')')$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('auth: líder 42501 en planner_banco',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_banco(''e6100000-0000-4000-8000-0000000000c3'')')$q$, 'ERR:42501');
SELECT pg_temp.assert_eq('auth: mensaje en español para un rol que no planifica',
  $q$SELECT pg_temp.mensaje('SELECT count(*)::text FROM public.planner_banco(''e6100000-0000-4000-8000-0000000000c3'')')$q$,
  'No tienes permiso para usar el planificador');

-- 3. Capacidades por rol.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('capacidades: director general publica, crea temporadas y ve todo',
  $q$SELECT (j->>'puede_publicar') || (j->>'puede_crear_temporada') || (j->>'ve_todos_los_segmentos')
            || ((j->>'usuario_id') = 'e6100000-0000-4000-8000-000000000003')::text
       FROM (SELECT public.planner_temporadas() j) x$q$, 'truetruetruetrue');
SELECT pg_temp.assert_eq('capacidades: director general edita todos los segmentos',
  $q$SELECT ((j->'segmentos_editables') @> '["e6100000-0000-4000-8000-0000000000a1", "e6100000-0000-4000-8000-0000000000a2"]')::text
            || (j->'segmentos' @> '[{"id": "e6100000-0000-4000-8000-0000000000a2", "nombre": "ZZ Pl S2"}]')::text
       FROM (SELECT public.planner_temporadas() j) x$q$, 'truetrue');
SELECT pg_temp.as_user(pg_temp.a('ADM'));
SELECT pg_temp.assert_eq('capacidades: admin publica, crea temporadas y ve todo',
  $q$SELECT (j->>'puede_publicar') || (j->>'puede_crear_temporada') || (j->>'ve_todos_los_segmentos')
       FROM (SELECT public.planner_temporadas() j) x$q$, 'truetruetrue');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('capacidades: pastor publica, crea temporadas y ve todo',
  $q$SELECT (j->>'puede_publicar') || (j->>'puede_crear_temporada') || (j->>'ve_todos_los_segmentos')
       FROM (SELECT public.planner_temporadas() j) x$q$, 'truetruetrue');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('capacidades: director de etapa no publica ni crea temporadas',
  $q$SELECT (j->>'puede_publicar') || (j->>'puede_crear_temporada') || (j->>'ve_todos_los_segmentos')
       FROM (SELECT public.planner_temporadas() j) x$q$, 'falsefalsefalse');
SELECT pg_temp.assert_eq('capacidades: director de etapa edita y ve solo su segmento',
  $q$SELECT (j->'segmentos_editables')::text || '|'
            || (SELECT jsonb_agg(s - 'directores' ORDER BY o) FROM jsonb_array_elements(j->'segmentos') WITH ORDINALITY e(s, o))::text
       FROM (SELECT public.planner_temporadas() j) x$q$,
  '["e6100000-0000-4000-8000-0000000000a1"]|[{"id": "e6100000-0000-4000-8000-0000000000a1", "nombre": "ZZ Pl S1"}]');

-- 4. Cohorte y temporada de origen.
SELECT pg_temp.assert_eq('temporadas: ' || v.id || ' cohorte y origen',
  format($q$SELECT coalesce(t->>'cohorte', '-') || '|' || coalesce(t->>'origen_id', '-') || '|' || coalesce(t->>'origen_nombre', '-')
                   || '|' || (t->>'estado') || '|' || (t->>'activa') || '|' || (t->>'fecha_inicio')
              FROM jsonb_array_elements((public.planner_temporadas())->'temporadas') t WHERE t->>'id' = %L$q$, v.id),
  v.esperado)
  FROM (VALUES
    ('e6100000-0000-4000-8000-0000000000c3', 'I|e6100000-0000-4000-8000-0000000000c1|ZZ Pl 2090 - I|planificacion|false|2091-02-01'),
    ('e6100000-0000-4000-8000-0000000000c1', 'I|e6100000-0000-4000-8000-0000000000c0|ZZ Pl 2089 - I|finalizada|false|2090-02-01'),
    ('e6100000-0000-4000-8000-0000000000c4', '-|-|-|planificacion|false|2091-03-01')
  ) v(id, esperado);
SELECT pg_temp.assert_eq('temporadas: "2090-II" sin espacios es cohorte II',
  $q$SELECT t->>'cohorte' FROM jsonb_array_elements((public.planner_temporadas())->'temporadas') t
      WHERE t->>'id' = 'e6100000-0000-4000-8000-0000000000c2'$q$, 'II');
SELECT pg_temp.assert_eq('temporadas: ordenadas por fecha de inicio descendente',
  $q$SELECT string_agg(t->>'nombre', ',' ORDER BY o)
       FROM jsonb_array_elements((public.planner_temporadas())->'temporadas') WITH ORDINALITY e(t, o)
      WHERE t->>'nombre' LIKE 'ZZ Pl %'$q$,
  'ZZ Pl especial,ZZ Pl 2091 - I,ZZ Pl 2090-II,ZZ Pl 2090 - I,ZZ Pl 2089 - I');

-- 5. Tablero por rol.
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('tablero: director general ve los grupos de todos los segmentos, sin eliminados',
  $q$SELECT string_agg(nombre, ',' ORDER BY nombre) FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3')$q$,
  'ZZ Pl N1,ZZ Pl N2');
SELECT pg_temp.as_user(pg_temp.a('PAS'));
SELECT pg_temp.assert_eq('tablero: pastor ve los grupos de todos los segmentos',
  $q$SELECT string_agg(nombre, ',' ORDER BY nombre) FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3')$q$,
  'ZZ Pl N1,ZZ Pl N2');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('tablero: director de etapa ve solo los grupos de su segmento',
  $q$SELECT string_agg(nombre, ',' ORDER BY nombre) FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3')$q$,
  'ZZ Pl N1');
SELECT pg_temp.assert_eq('tablero: temporada inexistente 22023',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_tablero(''e6100000-0000-4000-8000-0000000000ee'')')$q$,
  'ERR:22023');
SELECT pg_temp.assert_eq('tablero: campos del grupo, segmento y localidad con municipio',
  $q$SELECT concat_ws('|', segmento_id, segmento_nombre, localidad_id, localidad_nombre, localidad_municipio_id,
                      localidad_municipio_nombre, dia_reunion, hora_reunion, capacidad_maxima, estado_ciclo,
                      estado_aprobacion, activo::text)
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') WHERE grupo_id = 'e6100000-0000-4000-8000-0000000000d3'$q$,
  'e6100000-0000-4000-8000-0000000000a1|ZZ Pl S1|e6100000-0000-4000-8000-0000000000e1|ZZ Pl Localidad|'
  || 'e6100000-0000-4000-8000-0000000000e2|ZZ Pl Municipio|Jueves|19:30:00|12|proximo|pendiente|false');
SELECT pg_temp.assert_eq('tablero: miembros por rol, sin quien salió',
  $q$SELECT pg_temp.apellidos(lideres) || '|' || pg_temp.apellidos(aprendices) || '|' || pg_temp.apellidos(miembros)
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') WHERE grupo_id = 'e6100000-0000-4000-8000-0000000000d3'$q$,
  'L1,L2|A1|DUP,M1,M2');
SELECT pg_temp.assert_eq('tablero: cada persona trae nombre y apellido',
  $q$SELECT (e->>'nombre') || ' ' || (e->>'apellido')
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') t, jsonb_array_elements(t.aprendices) e
      WHERE t.grupo_id = 'e6100000-0000-4000-8000-0000000000d3'$q$, 'ZZ Pl A1');
SELECT pg_temp.assert_eq('tablero: directores de etapa del grupo',
  $q$SELECT (d->>'segmento_lider_id') || '|' || (d->>'usuario_id') || '|' || (d->>'nombre') || ' ' || (d->>'apellido')
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') t, jsonb_array_elements(t.directores) d
      WHERE t.grupo_id = 'e6100000-0000-4000-8000-0000000000d3'$q$,
  'e6100000-0000-4000-8000-0000000000b1|e6100000-0000-4000-8000-000000000004|ZZ Pl DE');
SELECT pg_temp.assert_eq('repite: M1 trae a L1 como líder de origen (2090-I, no 2089-I)',
  $q$SELECT (e->'lideres_origen')::text
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') t, jsonb_array_elements(t.miembros) e
      WHERE t.grupo_id = 'e6100000-0000-4000-8000-0000000000d3' AND e->>'usuario_id' = 'e6100000-0000-4000-8000-000000000014'$q$,
  '["e6100000-0000-4000-8000-000000000011"]');
SELECT pg_temp.assert_eq('repite: M2 no trae a L2 (lo lideró en 2090-II, otra cohorte)',
  $q$SELECT (e->'lideres_origen')::text
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') t, jsonb_array_elements(t.miembros) e
      WHERE t.grupo_id = 'e6100000-0000-4000-8000-0000000000d3' AND e->>'usuario_id' = 'e6100000-0000-4000-8000-000000000015'$q$,
  '[]');
SELECT pg_temp.assert_eq('repite: quien lideró en el origen no trae líderes de origen',
  $q$SELECT (e->'lideres_origen')::text
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') t, jsonb_array_elements(t.lideres) e
      WHERE t.grupo_id = 'e6100000-0000-4000-8000-0000000000d3' AND e->>'usuario_id' = 'e6100000-0000-4000-8000-000000000011'$q$,
  '[]');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('tablero: grupo de S2 con su director y sin localidad',
  $q$SELECT pg_temp.apellidos(lideres) || '|' || pg_temp.apellidos(miembros) || '|' || coalesce(localidad_id::text, '-')
            || '|' || (SELECT string_agg(d->>'apellido', ',') FROM jsonb_array_elements(directores) d)
       FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3') WHERE grupo_id = 'e6100000-0000-4000-8000-0000000000d4'$q$,
  'L3|DUP,X|-|DIR2');

-- 6. Banco: el director de etapa ve a todos.
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('banco: director de etapa ve a todas las personas, de cualquier segmento',
  $q$SELECT count(*)::text FROM public.planner_banco('e6100000-0000-4000-8000-0000000000c3') b
       JOIN public.usuarios u ON u.id = b.usuario_id WHERE u.nombre = 'ZZ Pl'$q$, '21');
SELECT pg_temp.assert_eq('banco: el banco no tiene tope de filas (todas las personas)',
  $q$SELECT ((SELECT count(*) FROM public.planner_banco('e6100000-0000-4000-8000-0000000000c3'))
             = (SELECT count(*) FROM public.usuarios))::text$q$, 'true');
SELECT pg_temp.assert_eq('banco: persona nueva sin grupo ni segmento',
  $q$SELECT pg_temp.banco('NUEVO', 'grupo_actual_id,segmento_sugerido_id,origen_grupo_id,otras_temporadas,grupos_en_temporada,conyuge_id,tiene_direccion,edad')$q$,
  '-|-|-|[]|0|-|false|-');
SELECT pg_temp.assert_eq('banco: grupo actual en otro segmento visible para el director de etapa',
  $q$SELECT pg_temp.banco('X', 'grupo_actual_nombre,grupo_actual_rol,grupo_actual_segmento_id')$q$,
  'ZZ Pl N2|Miembro|e6100000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_eq('banco: aprendiz como Colíder',
  $q$SELECT pg_temp.banco('A1', 'grupo_actual_id,grupo_actual_rol')$q$,
  'e6100000-0000-4000-8000-0000000000d3|Colíder');
SELECT pg_temp.assert_eq('banco: quien salió del grupo no queda ubicado',
  $q$SELECT pg_temp.banco('SAL', 'grupo_actual_id,grupos_en_temporada')$q$, '-|0');
SELECT pg_temp.assert_eq('banco: persona en dos grupos de la temporada',
  $q$SELECT pg_temp.banco('DUP', 'grupo_actual_nombre,grupos_en_temporada')$q$, 'ZZ Pl N1|2');
SELECT pg_temp.assert_eq('banco: cónyuge principal antes que id menor',
  $q$SELECT pg_temp.banco('X', 'conyuge_id') || '|' || pg_temp.banco('Y', 'conyuge_id') || '|' || pg_temp.banco('Z', 'conyuge_id')$q$,
  'e6100000-0000-4000-8000-000000000023|e6100000-0000-4000-8000-000000000021|e6100000-0000-4000-8000-000000000021');
SELECT pg_temp.assert_eq('banco: sin principal gana el id de relación menor; hermanos no cuentan',
  $q$SELECT pg_temp.banco('W', 'conyuge_id') || '|' || pg_temp.banco('U', 'conyuge_id') || '|' || pg_temp.banco('M1', 'conyuge_id')$q$,
  'e6100000-0000-4000-8000-000000000025|e6100000-0000-4000-8000-000000000024|-');
SELECT pg_temp.assert_eq('banco: datos de M1 (edad, municipio, segmento sugerido del origen, origen)',
  $q$SELECT pg_temp.banco('M1', 'nombre,apellido,edad,genero,estado_civil,tiene_direccion,municipio_id,municipio_nombre,'
                               || 'segmento_sugerido_id,segmento_sugerido_nombre,origen_grupo_id,origen_grupo_nombre,origen_rol,otras_temporadas')$q$,
  'ZZ Pl|M1|30|Femenino|Soltero|true|e6100000-0000-4000-8000-0000000000e2|ZZ Pl Municipio|'
  || 'e6100000-0000-4000-8000-0000000000a1|ZZ Pl S1|e6100000-0000-4000-8000-0000000000d1|ZZ Pl PI|Miembro|[]');
SELECT pg_temp.assert_eq('banco: líderes de origen de M1 con nombre',
  $q$SELECT string_agg((e->>'usuario_id') || ' ' || (e->>'nombre') || ' ' || (e->>'apellido'), ',')
       FROM public.planner_banco('e6100000-0000-4000-8000-0000000000c3') b, jsonb_array_elements(b.origen_lideres) e
      WHERE b.usuario_id = 'e6100000-0000-4000-8000-000000000014'$q$,
  'e6100000-0000-4000-8000-000000000011 ZZ Pl L1');
SELECT pg_temp.assert_eq('banco: sin dirección y dirección sin municipio',
  $q$SELECT pg_temp.banco('M2', 'tiene_direccion,municipio_id') || '|' || pg_temp.banco('Y', 'tiene_direccion,municipio_id')$q$,
  'false|-|true|-');
SELECT pg_temp.assert_eq('banco: M2 activo en otra temporada activa; sin origen en su cohorte',
  $q$SELECT pg_temp.banco('M2', 'otras_temporadas,origen_grupo_id,origen_lideres,segmento_sugerido_id')$q$,
  '[{"grupo_id": "e6100000-0000-4000-8000-0000000000d2", "grupo_nombre": "ZZ Pl PII", '
  || '"temporada_id": "e6100000-0000-4000-8000-0000000000c2", "temporada_nombre": "ZZ Pl 2090-II"}]|-|[]|'
  || 'e6100000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_eq('banco: fecha de registro presente',
  $q$SELECT (fecha_registro IS NOT NULL)::text FROM public.planner_banco('e6100000-0000-4000-8000-0000000000c3')
      WHERE usuario_id = 'e6100000-0000-4000-8000-000000000018'$q$, 'true');
SELECT pg_temp.assert_eq('banco: temporada inexistente 22023',
  $q$SELECT pg_temp.outcome('SELECT count(*)::text FROM public.planner_banco(''e6100000-0000-4000-8000-0000000000ee'')')$q$,
  'ERR:22023');
SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('banco: director general ve el mismo banco',
  $q$SELECT count(*)::text FROM public.planner_banco('e6100000-0000-4000-8000-0000000000c3') b
       JOIN public.usuarios u ON u.id = b.usuario_id WHERE u.nombre = 'ZZ Pl'$q$, '21');

-- §9 Casos adicionales de la verificación independiente.
SELECT pg_temp.assert_eq('cohorte: "2025 - II" es II', $q$SELECT public.planner_cohorte('2025 - II')$q$, 'II');
SELECT pg_temp.assert_eq('cohorte: "2026-III" sin cohorte', $q$SELECT coalesce(public.planner_cohorte('2026-III'),'-')$q$, '-');
INSERT INTO public.segmento_lideres (segmento_id, usuario_id, tipo_lider) VALUES
  ('e6100000-0000-4000-8000-0000000000a2', 'e6100000-0000-4000-8000-000000000004', 'director_general');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('tablero: director de etapa no ve S2 en otra temporada',
  $q$SELECT count(*)::text FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c2')$q$, '0');
SELECT pg_temp.assert_eq('tablero: una fila director_general en segmento_lideres no amplía el alcance',
  $q$SELECT string_agg(nombre, ',' ORDER BY nombre) FROM public.planner_tablero('e6100000-0000-4000-8000-0000000000c3')$q$, 'ZZ Pl N1');

-- 7. Directores elegibles por segmento. L2 es también director de etapa de S1 (sin grupo); S3 no
-- tiene directores; DE sigue con su fila director_general en S2 (§9), que no cuenta.
INSERT INTO public.segmentos (id, nombre) VALUES ('e6100000-0000-4000-8000-0000000000a3', 'ZZ Pl S3');
INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6100000-0000-4000-8000-0000000000b4', 'e6100000-0000-4000-8000-0000000000a1', 'e6100000-0000-4000-8000-000000000012', 'director_etapa');

CREATE OR REPLACE FUNCTION pg_temp.directores_de(p_segmento uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws(' ', d->>'segmento_lider_id', d->>'usuario_id', d->>'nombre', d->>'apellido'), ',' ORDER BY o), '')
    FROM jsonb_array_elements((public.planner_temporadas())->'segmentos') s,
         jsonb_array_elements(s->'directores') WITH ORDINALITY e(d, o)
   WHERE (s->>'id')::uuid = p_segmento;
$$;

SELECT pg_temp.as_user(pg_temp.a('DG'));
SELECT pg_temp.assert_eq('directores: S1 trae a todos sus directores de etapa, con o sin grupo, por apellido',
  $q$SELECT pg_temp.directores_de('e6100000-0000-4000-8000-0000000000a1')$q$,
  'e6100000-0000-4000-8000-0000000000b1 e6100000-0000-4000-8000-000000000004 ZZ Pl DE,'
  || 'e6100000-0000-4000-8000-0000000000b4 e6100000-0000-4000-8000-000000000012 ZZ Pl L2');
SELECT pg_temp.assert_eq('directores: S2 no trae al director de otro segmento ni una fila director_general',
  $q$SELECT pg_temp.directores_de('e6100000-0000-4000-8000-0000000000a2')$q$,
  'e6100000-0000-4000-8000-0000000000b3 e6100000-0000-4000-8000-000000000006 ZZ Pl DIR2');
SELECT pg_temp.assert_eq('directores: un segmento sin directores trae una lista vacía',
  $q$SELECT s->'directores' FROM jsonb_array_elements((public.planner_temporadas())->'segmentos') s
      WHERE s->>'id' = 'e6100000-0000-4000-8000-0000000000a3'$q$, '[]');
SELECT pg_temp.assert_eq('directores: cada director trae solo segmento_lider_id, usuario_id, nombre y apellido',
  $q$SELECT string_agg(DISTINCT k, ',' ORDER BY k)
       FROM jsonb_array_elements((public.planner_temporadas())->'segmentos') s,
            jsonb_array_elements(s->'directores') d, jsonb_object_keys(d) k$q$,
  'apellido,nombre,segmento_lider_id,usuario_id');
SELECT pg_temp.as_user(pg_temp.a('DE'));
SELECT pg_temp.assert_eq('directores: el director de etapa solo ve los directores de sus segmentos',
  $q$SELECT string_agg((s->>'nombre') || ':' || (SELECT string_agg(d->>'apellido', ',' ORDER BY o)
                                                FROM jsonb_array_elements(s->'directores') WITH ORDINALITY e(d, o)), ';')
       FROM jsonb_array_elements((public.planner_temporadas())->'segmentos') s$q$,
  'ZZ Pl S1:DE,L2');

SELECT count(*) AS aserciones FROM t_pl_asserts;
SELECT case_name AS fallidos FROM t_pl_failures ORDER BY case_name;

ROLLBACK;
