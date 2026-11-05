-- planner_crear_temporada, planner_bloqueos, planner_marcar_segmento, planner_estado_publicacion y
-- planner_publicar — temporada del planificador de GDV
-- (T3 de odd/tasks/planner-gdv.md: S6, S8, S12, S14, S16, S17, S18, S19, S20; contexto S10, S13, S15, S22).
--
-- Cubre:
--   1. Privilegios: anon sin EXECUTE, authenticated con EXECUTE, SECURITY DEFINER con search_path
--      fijo; el ayudante planner_bloqueos_temporada no lo ejecuta authenticated.
--   2. Autorización: sin sesión 28000; un rol que no planifica 42501; crear temporada y publicar
--      solo admin, pastor y director general (S12, S20): el director de etapa recibe 42501.
--   3. Crear temporada (S18, S19, S20): nombre normalizado y único sin distinguir mayúsculas ni
--      espacios, cohorte I o II obligatoria, fin posterior al inicio; nace en planificación e
--      inactiva; devuelve su cohorte y su temporada de origen. Un rechazo no escribe nada.
--   4. Bloqueos (S6): sin líder (las filas que salieron o inactivas no cuentan), sin director de
--      etapa del segmento (un vínculo con un director de otro segmento no cuenta), sin localidad,
--      persona en dos grupos (una fila por persona y grupo; una fila con fecha_salida no cuenta);
--      los grupos eliminados no cuentan; el director de etapa solo ve los de sus segmentos (S10).
--   5. "Terminé mi segmento" (S14): rechazado con bloqueos (22023 con la cuenta) o en un segmento
--      sin grupos; permitido a 0; desmarcar siempre; solo quien edita el segmento; no registra paso;
--      S17: un paso posterior de T2 lo vuelve a "Sin terminar".
--   6. Estado de publicación (S16): bloqueos por tipo, segmentos con grupos y su marca (quién,
--      cuándo), faltan_segmentos, puede_publicar por rol, origen por cohorte con los grupos que se
--      archivarían y otras temporadas activas que no se tocan.
--   7. Publicar (S8, S12, S19): rechazos (rol, bloqueos, segmentos sin terminar, no en planificación,
--      sin grupos) sin escribir nada; éxito: el destino (ya activa=true, como 2026-II) queda activa
--      con sus grupos activos y aprobados; el origen de la MISMA cohorte (ya finalizada, con grupos
--      activos, como 2025-II) queda finalizado con sus grupos archivados; la otra cohorte y su grupo
--      siguen igual; las membresías no cambian; no registra paso; no se publica dos veces.
--
-- Se ejecuta dentro de BEGIN…ROLLBACK (staging o el arnés local): nada se conserva; los datos viven
-- en el espacio e6300000-... con nombre 'ZZ Pt' y fechas en 2093–2097. El último statement es un
-- SELECT de los casos fallidos (vacío = todo bien).

BEGIN;

SET LOCAL search_path TO pg_temp, public;
-- Los ayudantes SQL nombran funciones nuevas: sin esto el RED abortaría antes de contar casos.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_pt_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pt_asserts (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pt_res (n serial, r jsonb) ON COMMIT DROP;
CREATE TEMP TABLE t_pt_foto (tag text PRIMARY KEY, foto text NOT NULL) ON COMMIT DROP;
GRANT ALL ON t_pt_failures, t_pt_asserts, t_pt_res, t_pt_foto TO authenticated;
GRANT USAGE ON SEQUENCE t_pt_res_n_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.pt_fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pt_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  INSERT INTO t_pt_asserts(case_name) VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v_actual;
    IF v_actual IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.pt_fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', obtenido ' || coalesce(v_actual, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.pt_fail(p_case, 'esperado ' || coalesce(p_expected, 'NULL') || ', error ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- 'ERR:<sqlstate> <mensaje>' de un statement ('ok' si no falla; sus efectos se revierten si falla).
CREATE OR REPLACE FUNCTION pg_temp.pt_err(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLSTATE || ' ' || SQLERRM; END;
$$;

-- 'ERR:<sqlstate>' de un statement ('ok' si no falla).
CREATE OR REPLACE FUNCTION pg_temp.pt_code(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE p_sql INTO v; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR:' || SQLSTATE; END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_as(p_tag text)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', (SELECT auth_id::text FROM public.usuarios WHERE nombre = 'ZZ Pt' AND apellido = p_tag), true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_nobody()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_u(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.usuarios WHERE nombre = 'ZZ Pt' AND apellido = p_tag;
$$;

-- Ids fijos por etiqueta: temporadas (t), segmentos (s), grupos (g).
CREATE OR REPLACE FUNCTION pg_temp.pt_t(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_tag
    WHEN 'x0' THEN 'e6300000-0000-4000-8000-0000000000c0' WHEN 'o1' THEN 'e6300000-0000-4000-8000-0000000000c1'
    WHEN 'x1' THEN 'e6300000-0000-4000-8000-0000000000c2' WHEN 'd1' THEN 'e6300000-0000-4000-8000-0000000000c3'
  END::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_s(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_tag
    WHEN 'S1' THEN 'e6300000-0000-4000-8000-0000000000a1' WHEN 'S2' THEN 'e6300000-0000-4000-8000-0000000000a2'
    WHEN 'S3' THEN 'e6300000-0000-4000-8000-0000000000a3'
  END::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_g(p_tag text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.grupos WHERE nombre = 'ZZ Pt ' || p_tag AND temporada_id IN (
    'e6300000-0000-4000-8000-0000000000c0', 'e6300000-0000-4000-8000-0000000000c1',
    'e6300000-0000-4000-8000-0000000000c2', 'e6300000-0000-4000-8000-0000000000c3');
$$;

-- Llamadas a las RPC; guardan el resultado.
CREATE OR REPLACE FUNCTION pg_temp.pt_crear(p_nombre text, p_inicio date, p_fin date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_crear_temporada(p_nombre, p_inicio, p_fin);
  INSERT INTO t_pt_res(r) VALUES (r);
  RETURN concat_ws('|', r->>'nombre', r->>'cohorte', r->>'estado', r->>'activa', coalesce(r->'origen'->>'nombre', '-'));
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_marcar(p_temporada text, p_segmento text, p_terminado boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_marcar_segmento(pg_temp.pt_t(p_temporada), pg_temp.pt_s(p_segmento), p_terminado);
  INSERT INTO t_pt_res(r) VALUES (r);
  RETURN concat_ws('|', r->>'segmento_nombre', r->>'terminado', coalesce(r->>'marcado_por_nombre', '-'));
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_publicar(p_temporada text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.planner_publicar(pg_temp.pt_t(p_temporada));
  INSERT INTO t_pt_res(r) VALUES (r);
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_res()
RETURNS jsonb LANGUAGE sql AS $$
  SELECT r FROM t_pt_res ORDER BY n DESC LIMIT 1;
$$;

-- Bloqueos de d1 para el actor actual: 'tipo:grupo[:persona]' en el orden devuelto.
CREATE OR REPLACE FUNCTION pg_temp.pt_bloqueos()
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(b.tipo || ':' || replace(b.grupo_nombre, 'ZZ Pt ', '')
                             || coalesce(':' || (SELECT u.apellido FROM public.usuarios u WHERE u.id = b.usuario_id), ''), ',' ORDER BY b.ord), '-')
    FROM public.planner_bloqueos('e6300000-0000-4000-8000-0000000000c3') WITH ORDINALITY b(tipo, segmento_id, grupo_id, grupo_nombre, usuario_id, detalle, ord);
$$;

-- Marcas de terminado de d1: 'S1:DE,S2:DE2' ('-' = ninguna).
CREATE OR REPLACE FUNCTION pg_temp.pt_terminados()
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(replace(s.nombre, 'ZZ Pt ', '') || ':' || coalesce(u.apellido, '-'), ',' ORDER BY s.nombre), '-')
    FROM public.planner_segmentos_terminados t
    JOIN public.segmentos s ON s.id = t.segmento_id
    LEFT JOIN public.usuarios u ON u.id = t.marcado_por
   WHERE t.temporada_id = 'e6300000-0000-4000-8000-0000000000c3';
$$;

-- Estado de publicación de d1 para el actor actual.
CREATE OR REPLACE FUNCTION pg_temp.pt_estado()
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.planner_estado_publicacion('e6300000-0000-4000-8000-0000000000c3');
$$;

-- Temporada como 'activa|estado'.
CREATE OR REPLACE FUNCTION pg_temp.pt_temp(p_tag text)
RETURNS text LANGUAGE sql AS $$
  SELECT activa::text || '|' || estado FROM public.temporadas WHERE id = pg_temp.pt_t(p_tag);
$$;

-- Grupo como 'activo|estado_ciclo|estado_aprobacion|aprobado_por|eliminado'.
CREATE OR REPLACE FUNCTION pg_temp.pt_grupo(p_tag text)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', g.activo::text, g.estado_ciclo, g.estado_aprobacion, coalesce(u.nombre || ' ' || u.apellido, '-'), g.eliminado::text)
    FROM public.grupos g LEFT JOIN public.usuarios u ON u.id = g.aprobado_por
   WHERE g.id = pg_temp.pt_g(p_tag);
$$;

-- Foto de todo lo que publicar podría tocar en las temporadas ZZ Pt (temporadas, grupos, filas).
CREATE OR REPLACE FUNCTION pg_temp.pt_todo()
RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce((SELECT string_agg(concat_ws('|', t.id, t.nombre, t.activa, t.estado), ',' ORDER BY t.id)
                         FROM public.temporadas t WHERE t.nombre LIKE 'ZZ Pt%'), '')
          || coalesce((SELECT string_agg(concat_ws('|', g.id, g.nombre, g.activo, g.estado_ciclo, g.estado_aprobacion, g.aprobado_por,
                                                   g.aprobado_en, g.eliminado), ',' ORDER BY g.id)
                         FROM public.grupos g JOIN public.temporadas t ON t.id = g.temporada_id WHERE t.nombre LIKE 'ZZ Pt%'), '')
          || coalesce((SELECT string_agg(to_jsonb(gm)::text, ',' ORDER BY gm.id)
                         FROM public.grupo_miembros gm JOIN public.grupos g ON g.id = gm.grupo_id
                         JOIN public.temporadas t ON t.id = g.temporada_id WHERE t.nombre LIKE 'ZZ Pt%'), ''));
$$;

CREATE OR REPLACE FUNCTION pg_temp.pt_pasos()
RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.planner_pasos WHERE temporada_id = 'e6300000-0000-4000-8000-0000000000c3';
$$;

-- Fixtures (como postgres). -------------------------------------------------
-- x0 2093-I finalizada; o1 2093-II finalizada con grupos aún activos (como 2025-II); x1 2094-I
-- activa (otra cohorte); d1 2094-II en planificación y ya activa=true (como 2026-II).
INSERT INTO public.temporadas (id, nombre, fecha_inicio, fecha_fin, activa, estado) VALUES
  ('e6300000-0000-4000-8000-0000000000c0', 'ZZ Pt 2093 - I',  DATE '2093-02-01', DATE '2094-01-31', false, 'finalizada'),
  ('e6300000-0000-4000-8000-0000000000c1', 'ZZ Pt 2093 - II', DATE '2093-10-01', DATE '2094-09-30', false, 'finalizada'),
  ('e6300000-0000-4000-8000-0000000000c2', 'ZZ Pt 2094 - I',  DATE '2094-02-01', DATE '2095-01-31', true,  'activa'),
  ('e6300000-0000-4000-8000-0000000000c3', 'ZZ Pt 2094 - II', DATE '2094-10-01', DATE '2095-09-30', true,  'planificacion');

INSERT INTO public.segmentos (id, nombre) VALUES
  ('e6300000-0000-4000-8000-0000000000a1', 'ZZ Pt S1'),
  ('e6300000-0000-4000-8000-0000000000a2', 'ZZ Pt S2'),
  ('e6300000-0000-4000-8000-0000000000a3', 'ZZ Pt S3');

INSERT INTO public.campus_localidades (id, campus_id, nombre, activo)
SELECT 'e6300000-0000-4000-8000-0000000000e1', c.id, 'ZZ Pt Localidad', true
  FROM (SELECT id FROM public.campus ORDER BY id LIMIT 1) c;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT v.id::uuid, 'authenticated', 'authenticated', v.email, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM (VALUES ('e6300000-0000-4000-8000-000000000101', 'zzpt-adm@example.test'),
               ('e6300000-0000-4000-8000-000000000102', 'zzpt-pas@example.test'),
               ('e6300000-0000-4000-8000-000000000103', 'zzpt-dg@example.test'),
               ('e6300000-0000-4000-8000-000000000104', 'zzpt-de@example.test'),
               ('e6300000-0000-4000-8000-000000000105', 'zzpt-de2@example.test'),
               ('e6300000-0000-4000-8000-000000000106', 'zzpt-lid@example.test')) v(id, email);

-- ADM admin, PAS pastor, DG director general, DE director de etapa de S1, DE2 de S2, LID líder.
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, auth_id) VALUES
  ('e6300000-0000-4000-8000-000000000001', 'ZZ Pt', 'ADM', 'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000101'),
  ('e6300000-0000-4000-8000-000000000002', 'ZZ Pt', 'PAS', 'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000102'),
  ('e6300000-0000-4000-8000-000000000003', 'ZZ Pt', 'DG',  'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000103'),
  ('e6300000-0000-4000-8000-000000000004', 'ZZ Pt', 'DE',  'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000104'),
  ('e6300000-0000-4000-8000-000000000005', 'ZZ Pt', 'DE2', 'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000105'),
  ('e6300000-0000-4000-8000-000000000006', 'ZZ Pt', 'LID', 'Otro', 'Soltero', 'e6300000-0000-4000-8000-000000000106'),
  ('e6300000-0000-4000-8000-000000000011', 'ZZ Pt', 'L1',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000012', 'ZZ Pt', 'L2',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000013', 'ZZ Pt', 'L3',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000014', 'ZZ Pt', 'L4',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000015', 'ZZ Pt', 'L5',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000021', 'ZZ Pt', 'M1',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000022', 'ZZ Pt', 'M2',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000023', 'ZZ Pt', 'M3',  'Otro', 'Soltero', NULL),
  ('e6300000-0000-4000-8000-000000000024', 'ZZ Pt', 'P1',  'Otro', 'Soltero', NULL);

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT v.usuario_id::uuid, rs.id
  FROM (VALUES
    ('e6300000-0000-4000-8000-000000000001', 'admin'),
    ('e6300000-0000-4000-8000-000000000002', 'pastor'),
    ('e6300000-0000-4000-8000-000000000003', 'director-general'),
    ('e6300000-0000-4000-8000-000000000004', 'director-etapa'),
    ('e6300000-0000-4000-8000-000000000005', 'director-etapa'),
    ('e6300000-0000-4000-8000-000000000006', 'lider')
  ) v(usuario_id, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('e6300000-0000-4000-8000-0000000000b1', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-000000000004', 'director_etapa'),
  ('e6300000-0000-4000-8000-0000000000b2', 'e6300000-0000-4000-8000-0000000000a2', 'e6300000-0000-4000-8000-000000000005', 'director_etapa');

-- d1: DG1 vivo (activo, ciclo activo, ya aprobado por ADM); DG2 sin líder vigente (L4 salió, L5
-- inactivo) y sin localidad; DG3 sin director; DG4 con un director de otro segmento; Borrado
-- eliminado. M1 está en DG1 y DG3; M3 en DG1 y con una fila de salida en DG3 (no cuenta).
-- Cancelado (S1) y Archivado (S3): no vigentes (como el RPC viejo, estado_ciclo fuera de proximo y
-- activo), sin líder, localidad ni director; M2 también está en Cancelado (no cuenta como doble).
-- o1: OG1 y OG2 todavía activos; OG3 eliminado; OG4 cancelado. x1: XG1 activo. x0: XG0 archivado.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, localidad_id, activo, eliminado, estado_ciclo, estado_aprobacion,
                           aprobado_por, capacidad_maxima, dia_reunion, hora_reunion) VALUES
  ('e6300000-0000-4000-8000-0000000000d1', 'ZZ Pt DG1', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-0000000000e1', true,  false, 'activo',  'aprobado',  'e6300000-0000-4000-8000-000000000001', 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d2', 'ZZ Pt DG2', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a1', NULL,                                   false, false, 'proximo', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d3', 'ZZ Pt DG3', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a2', 'e6300000-0000-4000-8000-0000000000e1', false, false, 'proximo', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d4', 'ZZ Pt DG4', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a2', 'e6300000-0000-4000-8000-0000000000e1', false, false, 'proximo', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d5', 'ZZ Pt Borrado', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a2', NULL,                               false, true,  'proximo', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d6', 'ZZ Pt Cancelado', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a1', NULL,                             false, false, 'cancelado', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000d7', 'ZZ Pt Archivado', 'e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a3', NULL,                             false, false, 'archivado', 'pendiente', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e2', 'ZZ Pt OG1', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-0000000000e1', true,  false, 'activo',  'aprobado',  NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e3', 'ZZ Pt OG2', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a2', 'e6300000-0000-4000-8000-0000000000e1', true,  false, 'activo',  'aprobado',  NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e4', 'ZZ Pt OG3', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a2', NULL,                                   true,  true,  'activo',  'aprobado',  NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e5', 'ZZ Pt OG4', 'e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000a2', NULL,                                   false, false, 'cancelado', 'aprobado', NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e6', 'ZZ Pt XG1', 'e6300000-0000-4000-8000-0000000000c2', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-0000000000e1', true,  false, 'activo',  'aprobado',  NULL, 12, 'Jueves', '19:30'),
  ('e6300000-0000-4000-8000-0000000000e7', 'ZZ Pt XG0', 'e6300000-0000-4000-8000-0000000000c0', 'e6300000-0000-4000-8000-0000000000a1', 'e6300000-0000-4000-8000-0000000000e1', false, false, 'archivado', 'aprobado', NULL, 12, 'Jueves', '19:30');

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol, estado, fecha_asignacion, fecha_salida) VALUES
  ('e6300000-0000-4000-8000-0000000000d1', 'e6300000-0000-4000-8000-000000000011', 'Líder',   'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d1', 'e6300000-0000-4000-8000-000000000021', 'Miembro', 'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d1', 'e6300000-0000-4000-8000-000000000023', 'Miembro', 'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d2', 'e6300000-0000-4000-8000-000000000022', 'Miembro', 'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d2', 'e6300000-0000-4000-8000-000000000014', 'Líder',   'activo',   DATE '2094-09-01', now() - interval '3 days'),
  ('e6300000-0000-4000-8000-0000000000d2', 'e6300000-0000-4000-8000-000000000015', 'Líder',   'inactivo', DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d3', 'e6300000-0000-4000-8000-000000000012', 'Líder',   'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d3', 'e6300000-0000-4000-8000-000000000021', 'Miembro', 'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d3', 'e6300000-0000-4000-8000-000000000023', 'Miembro', 'activo',   DATE '2094-09-01', now() - interval '3 days'),
  ('e6300000-0000-4000-8000-0000000000d4', 'e6300000-0000-4000-8000-000000000013', 'Líder',   'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000d6', 'e6300000-0000-4000-8000-000000000022', 'Miembro', 'activo',   DATE '2094-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000e2', 'e6300000-0000-4000-8000-000000000011', 'Líder',   'activo',   DATE '2093-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000e3', 'e6300000-0000-4000-8000-000000000012', 'Líder',   'activo',   DATE '2093-09-01', NULL),
  ('e6300000-0000-4000-8000-0000000000e6', 'e6300000-0000-4000-8000-000000000013', 'Líder',   'activo',   DATE '2094-01-15', NULL);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('e6300000-0000-4000-8000-0000000000b1', 'e6300000-0000-4000-8000-0000000000d1'),
  ('e6300000-0000-4000-8000-0000000000b1', 'e6300000-0000-4000-8000-0000000000d2'),
  ('e6300000-0000-4000-8000-0000000000b1', 'e6300000-0000-4000-8000-0000000000d4');

-- Cases ----------------------------------------------------------------------

-- 1. Privilegios y metadatos.
SELECT pg_temp.pt_eq('privilegios: anon no ejecuta ' || f,
  format($q$SELECT has_function_privilege('anon', %L, 'EXECUTE')::text$q$, f), 'false')
  FROM unnest(ARRAY['public.planner_crear_temporada(text,date,date)', 'public.planner_bloqueos(uuid)',
                    'public.planner_marcar_segmento(uuid,uuid,boolean)', 'public.planner_estado_publicacion(uuid)',
                    'public.planner_publicar(uuid)', 'public.planner_bloqueos_temporada(uuid)']) f;
SELECT pg_temp.pt_eq('privilegios: authenticated ejecuta ' || f,
  format($q$SELECT has_function_privilege('authenticated', %L, 'EXECUTE')::text$q$, f), 'true')
  FROM unnest(ARRAY['public.planner_crear_temporada(text,date,date)', 'public.planner_bloqueos(uuid)',
                    'public.planner_marcar_segmento(uuid,uuid,boolean)', 'public.planner_estado_publicacion(uuid)',
                    'public.planner_publicar(uuid)']) f;
SELECT pg_temp.pt_eq('privilegios: authenticated no ejecuta el ayudante planner_bloqueos_temporada',
  $q$SELECT has_function_privilege('authenticated', 'public.planner_bloqueos_temporada(uuid)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.pt_eq('metadatos: security definer con search_path fijo ' || f,
  format($q$SELECT p.prosecdef::text || coalesce(p.proconfig::text, '') FROM pg_proc p WHERE p.oid = %L::regprocedure$q$, f),
  'true{search_path=public}')
  FROM unnest(ARRAY['public.planner_crear_temporada(text,date,date)', 'public.planner_bloqueos(uuid)',
                    'public.planner_marcar_segmento(uuid,uuid,boolean)', 'public.planner_estado_publicacion(uuid)',
                    'public.planner_publicar(uuid)', 'public.planner_bloqueos_temporada(uuid)']) f;
SELECT pg_temp.pt_eq('compatibilidad: el planificador viejo conserva sus RPC',
  $q$SELECT (to_regprocedure('public.planner_publicar_temporada(uuid,uuid,boolean)') IS NOT NULL
             AND to_regprocedure('public.planner_guardar_planificacion(uuid,uuid,jsonb,uuid[])') IS NOT NULL)::text$q$, 'true');

-- 2. Autorización.
SELECT pg_temp.pt_nobody();
SELECT pg_temp.pt_eq('auth: sin sesión 28000 en ' || v.n, format('SELECT pg_temp.pt_code(%L)', v.q), 'ERR:28000')
  FROM (VALUES
    ('crear', $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - I', DATE '2097-02-01', DATE '2098-01-31')$s$),
    ('bloqueos', $s$SELECT pg_temp.pt_bloqueos()$s$),
    ('marcar', $s$SELECT pg_temp.pt_marcar('d1', 'S1', true)$s$),
    ('estado', $s$SELECT pg_temp.pt_estado()::text$s$),
    ('publicar', $s$SELECT pg_temp.pt_publicar('d1')$s$)
  ) v(n, q);

SELECT pg_temp.pt_as('LID');
SELECT pg_temp.pt_eq('auth: un líder no planifica (42501) en ' || v.n,
  format('SELECT pg_temp.pt_err(%L)', v.q), 'ERR:42501 No tienes permiso para usar el planificador')
  FROM (VALUES
    ('crear', $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - I', DATE '2097-02-01', DATE '2098-01-31')$s$),
    ('bloqueos', $s$SELECT pg_temp.pt_bloqueos()$s$),
    ('marcar', $s$SELECT pg_temp.pt_marcar('d1', 'S1', true)$s$),
    ('estado', $s$SELECT pg_temp.pt_estado()::text$s$),
    ('publicar', $s$SELECT pg_temp.pt_publicar('d1')$s$)
  ) v(n, q);

SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('auth: el director de etapa no crea temporadas (S20)',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - I', DATE '2097-02-01', DATE '2098-01-31')$s$)$q$,
  'ERR:42501 Solo el director general, un pastor o un administrador pueden crear temporadas');
SELECT pg_temp.pt_eq('auth: el director de etapa no publica (S12)',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_publicar('d1')$s$)$q$,
  'ERR:42501 Solo el director general, un pastor o un administrador pueden publicar la temporada');

-- 3. Crear temporada (S18, S19, S20).
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('crear: el director general crea una "-II" que cierra la "-II" anterior',
  $q$SELECT pg_temp.pt_crear('ZZ Pt 2095 - II', DATE '2095-10-01', DATE '2096-09-30')$q$,
  'ZZ Pt 2095 - II|II|planificacion|false|ZZ Pt 2094 - II');
SELECT pg_temp.pt_eq('crear: devuelve id, fechas y origen con id',
  $q$SELECT ((pg_temp.pt_res()->>'id') IS NOT NULL)::text || '|' || (pg_temp.pt_res()->>'fecha_inicio') || '|' || (pg_temp.pt_res()->>'fecha_fin')
            || '|' || (pg_temp.pt_res()->'origen'->>'id')$q$,
  'true|2095-10-01|2096-09-30|e6300000-0000-4000-8000-0000000000c3');
SELECT pg_temp.pt_eq('crear: queda guardada en planificación e inactiva',
  $q$SELECT activa::text || '|' || estado FROM public.temporadas WHERE id = (pg_temp.pt_res()->>'id')::uuid$q$, 'false|planificacion');
SELECT pg_temp.pt_as('PAS');
SELECT pg_temp.pt_eq('crear: el pastor crea una "-I"; el nombre se normaliza y el origen es la "-I" anterior',
  $q$SELECT pg_temp.pt_crear('  ZZ Pt   2095 -  I ', DATE '2095-02-01', DATE '2096-01-31')$q$,
  'ZZ Pt 2095 - I|I|planificacion|false|ZZ Pt 2094 - I');
SELECT pg_temp.pt_as('ADM');
SELECT pg_temp.pt_eq('crear: el admin también crea',
  $q$SELECT pg_temp.pt_crear('ZZ Pt 2096-I', DATE '2096-02-01', DATE '2097-01-31')$q$,
  'ZZ Pt 2096-I|I|planificacion|false|ZZ Pt 2095 - I');

INSERT INTO t_pt_foto(tag, foto) SELECT 'temporadas', count(*)::text FROM public.temporadas WHERE nombre ILIKE 'ZZ Pt%';
SELECT pg_temp.pt_eq('crear: rechazo ' || v.n, format('SELECT pg_temp.pt_err(%L)', v.q), v.e)
  FROM (VALUES
    ('nombre repetido sin distinguir mayúsculas ni espacios',
     $s$SELECT pg_temp.pt_crear('zz pt 2095-ii', DATE '2097-10-01', DATE '2098-09-30')$s$,
     'ERR:22023 Ya existe una temporada llamada «ZZ Pt 2095 - II»'),
    ('sin cohorte',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2097', DATE '2097-10-01', DATE '2098-09-30')$s$,
     'ERR:22023 El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I»'),
    ('cohorte III no existe',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - III', DATE '2097-10-01', DATE '2098-09-30')$s$,
     'ERR:22023 El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I»'),
    ('nombre vacío',
     $s$SELECT pg_temp.pt_crear('   ', DATE '2097-10-01', DATE '2098-09-30')$s$,
     'ERR:22023 La temporada debe tener nombre'),
    ('sin fechas',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - II', NULL, DATE '2098-09-30')$s$,
     'ERR:22023 Indica la fecha de inicio y la de fin'),
    ('fin igual al inicio',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - II', DATE '2097-10-01', DATE '2097-10-01')$s$,
     'ERR:22023 La fecha de fin debe ser posterior a la de inicio'),
    ('fin antes del inicio',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2097 - II', DATE '2097-10-01', DATE '2097-01-01')$s$,
     'ERR:22023 La fecha de fin debe ser posterior a la de inicio')
  ) v(n, q, e);
SELECT pg_temp.pt_eq('crear: los rechazos no guardaron temporadas',
  $q$SELECT (count(*)::text = (SELECT foto FROM t_pt_foto WHERE tag = 'temporadas'))::text FROM public.temporadas WHERE nombre ILIKE 'ZZ Pt%'$q$,
  'true');

-- 4. Bloqueos (S6).
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('bloqueos: el director general ve los de todos los segmentos, por tipo',
  $q$SELECT pg_temp.pt_bloqueos()$q$,
  'sin_lider:DG2,sin_director:DG3,sin_director:DG4,sin_localidad:DG2,persona_en_dos_grupos:DG1:M1,persona_en_dos_grupos:DG3:M1');
SELECT pg_temp.pt_eq('bloqueos: detalle de cada tipo',
  $q$SELECT string_agg(b.detalle, ' / ' ORDER BY b.tipo, b.grupo_nombre)
       FROM public.planner_bloqueos('e6300000-0000-4000-8000-0000000000c3') b$q$,
  'ZZ Pt M1 también está en ZZ Pt DG3 / ZZ Pt M1 también está en ZZ Pt DG1 / No tiene director de etapa de ZZ Pt S2'
  || ' / No tiene director de etapa de ZZ Pt S2 / No tiene líder / No tiene localidad');
SELECT pg_temp.pt_eq('bloqueos: segmento y grupo de cada fila',
  $q$SELECT string_agg(DISTINCT (b.segmento_id = g.segmento_id AND b.grupo_id = g.id)::text, ',')
       FROM public.planner_bloqueos('e6300000-0000-4000-8000-0000000000c3') b JOIN public.grupos g ON g.id = b.grupo_id$q$, 'true');
SELECT pg_temp.pt_eq('bloqueos: un grupo cancelado o archivado del destino no bloquea',
  $q$SELECT count(*)::text FROM public.planner_bloqueos('e6300000-0000-4000-8000-0000000000c3') b
      WHERE b.grupo_id IN (pg_temp.pt_g('Cancelado'), pg_temp.pt_g('Archivado'))$q$, '0');
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('bloqueos: el director de etapa solo ve los de sus segmentos (S10)',
  $q$SELECT pg_temp.pt_bloqueos()$q$, 'sin_lider:DG2,sin_localidad:DG2,persona_en_dos_grupos:DG1:M1');
SELECT pg_temp.pt_eq('bloqueos: temporada inexistente',
  $q$SELECT pg_temp.pt_err('SELECT count(*)::text FROM public.planner_bloqueos(''e6300000-0000-4000-8000-0000000000ee'')')$q$,
  'ERR:22023 La temporada no existe');

-- 5. "Terminé mi segmento" (S14).
SELECT pg_temp.pt_eq('marcar: con bloqueos se rechaza nombrando la cuenta',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_marcar('d1', 'S1', true)$s$)$q$,
  'ERR:22023 No puedes marcar ZZ Pt S1 como terminado: tiene 3 bloqueos por resolver');
SELECT pg_temp.pt_eq('marcar: el director de etapa no marca otro segmento',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_marcar('d1', 'S2', true)$s$)$q$,
  'ERR:42501 No puedes marcar ZZ Pt S2: no es uno de tus segmentos');
SELECT pg_temp.pt_eq('marcar: tampoco lo desmarca',
  $q$SELECT pg_temp.pt_code($s$SELECT pg_temp.pt_marcar('d1', 'S2', false)$s$)$q$, 'ERR:42501');
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('marcar: rechazo ' || v.n, format('SELECT pg_temp.pt_err(%L)', v.q), v.e)
  FROM (VALUES
    ('segmento sin grupos', $s$SELECT pg_temp.pt_marcar('d1', 'S3', true)$s$, 'ERR:22023 ZZ Pt S3 no tiene grupos en esta temporada'),
    ('temporada que no está en planificación', $s$SELECT pg_temp.pt_marcar('x1', 'S1', true)$s$, 'ERR:22023 La temporada no está en planificación'),
    ('temporada inexistente', $s$SELECT public.planner_marcar_segmento('e6300000-0000-4000-8000-0000000000ee', 'e6300000-0000-4000-8000-0000000000a1', true)::text$s$,
     'ERR:22023 La temporada no existe'),
    ('segmento inexistente', $s$SELECT public.planner_marcar_segmento('e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000ee', true)::text$s$,
     'ERR:22023 El segmento no existe'),
    ('sin indicar terminado', $s$SELECT pg_temp.pt_marcar('d1', 'S1', NULL)$s$, 'ERR:22023 Indica si el segmento está terminado')
  ) v(n, q, e);
SELECT pg_temp.pt_eq('marcar: los rechazos no escribieron marcas ni pasos',
  $q$SELECT pg_temp.pt_terminados() || '|' || pg_temp.pt_pasos()$q$, '-|0');

-- El director de etapa resuelve S1 con pasos de T2; M1 sale de DG3 (otro segmento) por el director general.
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('resolver: P1 como líder de DG2 (paso de T2)',
  $q$SELECT public.planner_mover_personas('e6300000-0000-4000-8000-0000000000c3', ARRAY[pg_temp.pt_u('P1')], pg_temp.pt_g('DG2'), 'lider')->>'descripcion'$q$,
  'movió a ZZ Pt P1 a ZZ Pt DG2 como líder');
SELECT pg_temp.pt_eq('resolver: localidad de DG2 (paso de T2)',
  $q$SELECT public.planner_editar_grupo(pg_temp.pt_g('DG2'), '{"localidad_id": "e6300000-0000-4000-8000-0000000000e1"}')->>'descripcion'$q$,
  'editó el grupo ZZ Pt DG2 (localidad)');
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('resolver: M1 queda solo en DG1',
  $q$SELECT public.planner_mover_personas('e6300000-0000-4000-8000-0000000000c3', ARRAY[pg_temp.pt_u('M1')], pg_temp.pt_g('DG1'), 'miembro')->>'descripcion'$q$,
  'movió a ZZ Pt M1 de ZZ Pt DG3 a ZZ Pt DG1');
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('bloqueos: S1 quedó sin bloqueos', $q$SELECT pg_temp.pt_bloqueos()$q$, '-');

INSERT INTO t_pt_foto(tag, foto) SELECT 'pasos antes de marcar', pg_temp.pt_pasos();
SELECT pg_temp.pt_eq('marcar: a 0 bloqueos el director de etapa marca su segmento',
  $q$SELECT pg_temp.pt_marcar('d1', 'S1', true)$q$, 'ZZ Pt S1|true|ZZ Pt DE');
SELECT pg_temp.pt_eq('marcar: guarda quién y cuándo',
  $q$SELECT pg_temp.pt_terminados() || '|' || ((pg_temp.pt_res()->>'marcado_en')::timestamptz IS NOT NULL)::text
            || '|' || (pg_temp.pt_res()->>'marcado_por')$q$,
  'S1:DE|true|e6300000-0000-4000-8000-000000000004');
SELECT pg_temp.pt_eq('marcar: no registra paso (no se deshace)',
  $q$SELECT (pg_temp.pt_pasos() = (SELECT foto FROM t_pt_foto WHERE tag = 'pasos antes de marcar'))::text$q$, 'true');
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('marcar: marcar de nuevo no cambia quién lo marcó',
  $q$SELECT pg_temp.pt_marcar('d1', 'S1', true) || '|' || pg_temp.pt_terminados()$q$, 'ZZ Pt S1|true|ZZ Pt DE|S1:DE');
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('desmarcar: el director de etapa desmarca su segmento',
  $q$SELECT pg_temp.pt_marcar('d1', 'S1', false) || '|' || pg_temp.pt_terminados()$q$, 'ZZ Pt S1|false|-|-');
SELECT pg_temp.pt_eq('desmarcar: desmarcar lo no marcado no falla',
  $q$SELECT pg_temp.pt_marcar('d1', 'S1', false)$q$, 'ZZ Pt S1|false|-');
SELECT pg_temp.pt_eq('marcar: vuelve a marcar',
  $q$SELECT pg_temp.pt_marcar('d1', 'S1', true)$q$, 'ZZ Pt S1|true|ZZ Pt DE');

-- S17: un paso posterior de T2 en un grupo del segmento lo vuelve a "Sin terminar".
SELECT pg_temp.pt_eq('S17: editar un grupo del segmento terminado',
  $q$SELECT (public.planner_editar_grupo(pg_temp.pt_g('DG1'), '{"capacidad_maxima": 15}')->'segmentos_reabiertos')::text$q$,
  '["e6300000-0000-4000-8000-0000000000a1"]');
SELECT pg_temp.pt_eq('S17: el segmento quedó sin terminar', $q$SELECT pg_temp.pt_terminados()$q$, '-');
SELECT pg_temp.pt_eq('S17: se vuelve a marcar', $q$SELECT pg_temp.pt_marcar('d1', 'S1', true)$q$, 'ZZ Pt S1|true|ZZ Pt DE');

-- Desmarcar está permitido aunque haya bloqueos: una marca vieja de S2 (hecha antes de que aparecieran).
INSERT INTO public.planner_segmentos_terminados (temporada_id, segmento_id, marcado_por)
VALUES ('e6300000-0000-4000-8000-0000000000c3', 'e6300000-0000-4000-8000-0000000000a2', 'e6300000-0000-4000-8000-000000000005');
SELECT pg_temp.pt_as('DE2');
SELECT pg_temp.pt_eq('desmarcar: con bloqueos también se desmarca',
  $q$SELECT pg_temp.pt_marcar('d1', 'S2', false) || '|' || pg_temp.pt_terminados()$q$, 'ZZ Pt S2|false|-|S1:DE');
SELECT pg_temp.pt_eq('marcar: S2 con bloqueos se rechaza',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_marcar('d1', 'S2', true)$s$)$q$,
  'ERR:22023 No puedes marcar ZZ Pt S2 como terminado: tiene 2 bloqueos por resolver');

-- 6. Estado de publicación (S16).
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('estado: bloqueos por tipo',
  $q$SELECT (pg_temp.pt_estado()->'bloqueos')::text$q$,
  '{"total": 2, "sin_lider": 0, "sin_director": 2, "sin_localidad": 0, "persona_en_dos_grupos": 0}');
SELECT pg_temp.pt_eq('estado: segmentos con grupos y su marca',
  $q$SELECT string_agg(concat_ws(':', s->>'nombre', s->>'grupos', s->>'bloqueos', s->>'terminado', coalesce(s->'marcado_por'->>'nombre', '-'),
                                 ((s->>'marcado_en') IS NOT NULL)::text), ',' ORDER BY o)
       FROM jsonb_array_elements(pg_temp.pt_estado()->'segmentos') WITH ORDINALITY x(s, o)$q$,
  'ZZ Pt S1:2:0:true:ZZ Pt DE:true,ZZ Pt S2:2:2:false:-:false');
SELECT pg_temp.pt_eq('estado: cuentas y puede_publicar',
  $q$SELECT concat_ws('|', e->>'grupos', e->>'segmentos_con_grupos', e->>'segmentos_terminados', e->>'faltan_segmentos',
                      e->>'rol_puede_publicar', e->>'puede_publicar')
       FROM pg_temp.pt_estado() e$q$,
  '4|2|1|1|true|false');
SELECT pg_temp.pt_eq('estado: origen por cohorte con los grupos que se archivarían',
  $q$SELECT concat_ws('|', e->'origen'->>'id', e->'origen'->>'nombre', e->'origen'->>'estado', e->'origen'->>'grupos_a_archivar')
       FROM pg_temp.pt_estado() e$q$,
  'e6300000-0000-4000-8000-0000000000c1|ZZ Pt 2093 - II|finalizada|2');
SELECT pg_temp.pt_eq('estado: la otra cohorte activa aparece como no tocada; ni destino ni origen',
  $q$SELECT string_agg(o->>'nombre', ',' ORDER BY o->>'nombre') FROM jsonb_array_elements(pg_temp.pt_estado()->'otras_activas') o
      WHERE o->>'nombre' LIKE 'ZZ Pt%'$q$,
  'ZZ Pt 2094 - I');
SELECT pg_temp.pt_eq('estado: temporada y estado',
  $q$SELECT concat_ws('|', e->'temporada'->>'nombre', e->'temporada'->>'estado', e->'temporada'->>'activa', e->'temporada'->>'cohorte')
       FROM pg_temp.pt_estado() e$q$,
  'ZZ Pt 2094 - II|planificacion|true|II');
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('estado: el director de etapa lo lee pero no puede publicar',
  $q$SELECT concat_ws('|', e->'bloqueos'->>'total', e->>'faltan_segmentos', e->>'rol_puede_publicar', e->>'puede_publicar') FROM pg_temp.pt_estado() e$q$,
  '2|1|false|false');
SELECT pg_temp.pt_eq('estado: temporada inexistente',
  $q$SELECT pg_temp.pt_err($s$SELECT public.planner_estado_publicacion('e6300000-0000-4000-8000-0000000000ee')::text$s$)$q$,
  'ERR:22023 La temporada no existe');

-- B1 (S19, S8): crear no puede robar el origen de una temporada existente. El nombre se compara
-- sin signos ni espacios y sin distinguir mayúsculas; una temporada nueva empieza después de la
-- última de su cohorte.
SELECT pg_temp.pt_as('DG');
INSERT INTO t_pt_foto(tag, foto) SELECT 'temporadas B1', count(*)::text FROM public.temporadas WHERE nombre ILIKE 'ZZ Pt%';
SELECT pg_temp.pt_eq('crear B1: rechazo ' || v.n, format('SELECT pg_temp.pt_err(%L)', v.q), v.e)
  FROM (VALUES
    ('variante sin guion de un nombre existente',
     $s$SELECT pg_temp.pt_crear('ZZ Pt 2094 II', DATE '2094-09-01', DATE '2095-08-30')$s$,
     'ERR:22023 Ya existe una temporada llamada «ZZ Pt 2094 - II»'),
    ('variante con guion pegado y minúsculas',
     $s$SELECT pg_temp.pt_crear('zz pt 2094-ii', DATE '2097-10-01', DATE '2098-09-30')$s$,
     'ERR:22023 Ya existe una temporada llamada «ZZ Pt 2094 - II»'),
    ('otro nombre que empieza antes de la última de su cohorte',
     $s$SELECT pg_temp.pt_crear('ZZ Pt Jovenes 2094 - II', DATE '2094-09-01', DATE '2095-08-30')$s$,
     'ERR:22023 La temporada debe empezar después del 2095-10-01, inicio de «ZZ Pt 2095 - II», la última de la cohorte II'),
    ('otro nombre que empieza el mismo día que la última de su cohorte',
     $s$SELECT pg_temp.pt_crear('ZZ Pt Otra 2095 - II', DATE '2095-10-01', DATE '2096-09-30')$s$,
     'ERR:22023 La temporada debe empezar después del 2095-10-01, inicio de «ZZ Pt 2095 - II», la última de la cohorte II')
  ) v(n, q, e);
SELECT pg_temp.pt_eq('crear B1: los rechazos no guardaron temporadas',
  $q$SELECT (count(*)::text = (SELECT foto FROM t_pt_foto WHERE tag = 'temporadas B1'))::text FROM public.temporadas WHERE nombre ILIKE 'ZZ Pt%'$q$,
  'true');
SELECT pg_temp.pt_eq('crear B1: el origen del destino sigue siendo la "-II" anterior',
  $q$SELECT pg_temp.pt_estado()->'origen'->>'nombre'$q$, 'ZZ Pt 2093 - II');
SELECT pg_temp.pt_as('DE');
SELECT pg_temp.pt_eq('estado: el director de etapa no recibe nombres de grupos',
  $q$SELECT (pg_temp.pt_estado()::text NOT LIKE '%ZZ Pt DG%')::text$q$, 'true');

-- 7. Publicar: rechazos sin escribir nada.
SELECT pg_temp.pt_as('DG');
INSERT INTO t_pt_foto(tag, foto) SELECT 'antes de publicar', pg_temp.pt_todo();
SELECT pg_temp.pt_eq('publicar: con bloqueos se rechaza con las cuentas',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_publicar('d1')$s$)$q$,
  'ERR:22023 No se puede publicar: hay 2 bloqueos por resolver (sin director de etapa: 2)');
SELECT pg_temp.pt_eq('publicar: rechazo ' || v.n, format('SELECT pg_temp.pt_err(%L)', v.q), v.e)
  FROM (VALUES
    ('temporada activa', $s$SELECT pg_temp.pt_publicar('x1')$s$, 'ERR:22023 Solo se puede publicar una temporada en planificación'),
    ('temporada finalizada', $s$SELECT pg_temp.pt_publicar('o1')$s$, 'ERR:22023 Solo se puede publicar una temporada en planificación'),
    ('temporada inexistente', $s$SELECT public.planner_publicar('e6300000-0000-4000-8000-0000000000ee')::text$s$, 'ERR:22023 La temporada no existe'),
    ('temporada sin grupos',
     $s$SELECT public.planner_publicar((SELECT id FROM public.temporadas WHERE nombre = 'ZZ Pt 2095 - II'))::text$s$,
     'ERR:22023 La temporada no tiene grupos para publicar')
  ) v(n, q, e);
SELECT pg_temp.pt_as('ADM');
SELECT pg_temp.pt_eq('publicar: el admin tampoco publica con bloqueos',
  $q$SELECT pg_temp.pt_code($s$SELECT pg_temp.pt_publicar('d1')$s$)$q$, 'ERR:22023');
SELECT pg_temp.pt_eq('publicar: los rechazos por rol, bloqueos y estado no tocaron temporadas, grupos ni membresías',
  $q$SELECT (pg_temp.pt_todo() = (SELECT foto FROM t_pt_foto WHERE tag = 'antes de publicar'))::text$q$, 'true');

-- Resolver S2: directores de S2 en DG3 y DG4 (pasos de T2); S2 sigue sin terminar.
SELECT pg_temp.pt_as('DE2');
SELECT pg_temp.pt_eq('resolver: director de S2 en ' || v.g,
  format($q$SELECT public.planner_editar_grupo(pg_temp.pt_g(%L), jsonb_build_object('director_etapa_ids', jsonb_build_array(pg_temp.pt_u('DE2'))))->>'descripcion'$q$, v.g),
  'editó el grupo ZZ Pt ' || v.g || ' (directores de etapa)')
  FROM (VALUES ('DG3'), ('DG4')) v(g);
SELECT pg_temp.pt_as('PAS');
INSERT INTO t_pt_foto(tag, foto) SELECT 'antes de publicar sin terminar', pg_temp.pt_todo();
SELECT pg_temp.pt_eq('publicar: con un segmento sin terminar se rechaza nombrándolo',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_publicar('d1')$s$)$q$,
  'ERR:22023 No se puede publicar: falta 1 segmento por terminar (ZZ Pt S2)');
SELECT pg_temp.pt_eq('estado: sin bloqueos pero falta S2',
  $q$SELECT concat_ws('|', e->'bloqueos'->>'total', e->>'faltan_segmentos', e->>'puede_publicar') FROM pg_temp.pt_estado() e$q$, '0|1|false');
SELECT pg_temp.pt_eq('publicar: el rechazo por segmentos no tocó temporadas, grupos ni membresías',
  $q$SELECT (pg_temp.pt_todo() = (SELECT foto FROM t_pt_foto WHERE tag = 'antes de publicar sin terminar'))::text$q$, 'true');

SELECT pg_temp.pt_as('DE2');
SELECT pg_temp.pt_eq('marcar: S2 a 0 bloqueos', $q$SELECT pg_temp.pt_marcar('d1', 'S2', true)$q$, 'ZZ Pt S2|true|ZZ Pt DE2');
SELECT pg_temp.pt_eq('estado: el director de etapa sigue sin poder publicar',
  $q$SELECT concat_ws('|', e->'bloqueos'->>'total', e->>'faltan_segmentos', e->>'puede_publicar') FROM pg_temp.pt_estado() e$q$, '0|0|false');
SELECT pg_temp.pt_as('DG');
SELECT pg_temp.pt_eq('estado: todo listo para el director general',
  $q$SELECT concat_ws('|', e->'bloqueos'->>'total', e->>'faltan_segmentos', e->>'segmentos_terminados', e->>'puede_publicar') FROM pg_temp.pt_estado() e$q$,
  '0|0|2|true');

-- Publicar con éxito.
INSERT INTO t_pt_foto(tag, foto)
SELECT 'miembros', md5(string_agg(to_jsonb(gm)::text, ',' ORDER BY gm.id)) FROM public.grupo_miembros gm JOIN public.grupos g ON g.id = gm.grupo_id
 WHERE g.temporada_id IN ('e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000c3');
INSERT INTO t_pt_foto(tag, foto) SELECT 'pasos antes de publicar', pg_temp.pt_pasos();
INSERT INTO t_pt_foto(tag, foto)
SELECT 'otras', string_agg(concat_ws('|', t.id, t.activa, t.estado), ',' ORDER BY t.id) FROM public.temporadas t
 WHERE t.id NOT IN ('e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000c3');
SELECT pg_temp.pt_eq('publicar: el director general publica', $q$SELECT pg_temp.pt_publicar('d1')$q$, 'ok');
SELECT pg_temp.pt_eq('publicar: devuelve las cuentas',
  $q$SELECT concat_ws('|', r->>'grupos', r->>'publicados', r->>'ya_aprobados', r->>'grupos_activados', r->>'origen_id', r->>'origen_nombre',
                      r->>'grupos_archivados')
       FROM pg_temp.pt_res() r$q$,
  '4|3|1|3|e6300000-0000-4000-8000-0000000000c1|ZZ Pt 2093 - II|2');
SELECT pg_temp.pt_eq('publicar: el destino queda activa', $q$SELECT pg_temp.pt_temp('d1')$q$, 'true|activa');
SELECT pg_temp.pt_eq('publicar: grupo del destino ' || v.g, format('SELECT pg_temp.pt_grupo(%L)', v.g), v.e)
  FROM (VALUES
    ('DG1', 'true|activo|aprobado|ZZ Pt ADM|false'),
    ('DG2', 'true|activo|aprobado|ZZ Pt DG|false'),
    ('DG3', 'true|activo|aprobado|ZZ Pt DG|false'),
    ('DG4', 'true|activo|aprobado|ZZ Pt DG|false'),
    ('Borrado', 'false|proximo|pendiente|-|true'),
    ('Cancelado', 'false|cancelado|pendiente|-|false'),
    ('Archivado', 'false|archivado|pendiente|-|false')
  ) v(g, e);
SELECT pg_temp.pt_eq('publicar: aprobado_en de los grupos que aprobó',
  $q$SELECT count(*)::text FROM public.grupos WHERE temporada_id = 'e6300000-0000-4000-8000-0000000000c3' AND aprobado_por = pg_temp.pt_u('DG')
        AND aprobado_en IS NOT NULL$q$, '3');
SELECT pg_temp.pt_eq('publicar: el origen de la misma cohorte queda finalizado', $q$SELECT pg_temp.pt_temp('o1')$q$, 'false|finalizada');
SELECT pg_temp.pt_eq('publicar: grupo del origen ' || v.g, format('SELECT pg_temp.pt_grupo(%L)', v.g), v.e)
  FROM (VALUES
    ('OG1', 'false|archivado|aprobado|-|false'),
    ('OG2', 'false|archivado|aprobado|-|false'),
    ('OG3', 'true|activo|aprobado|-|true'),
    ('OG4', 'false|cancelado|aprobado|-|false')
  ) v(g, e);
SELECT pg_temp.pt_eq('publicar: la otra cohorte sigue activa con su grupo (S19)',
  $q$SELECT pg_temp.pt_temp('x1') || '|' || pg_temp.pt_grupo('XG1')$q$, 'true|activa|true|activo|aprobado|-|false');
SELECT pg_temp.pt_eq('publicar: la "-I" anterior no se toca', $q$SELECT pg_temp.pt_temp('x0') || '|' || pg_temp.pt_grupo('XG0')$q$,
  'false|finalizada|false|archivado|aprobado|-|false');
SELECT pg_temp.pt_eq('publicar: ninguna otra temporada cambió',
  $q$SELECT (string_agg(concat_ws('|', t.id, t.activa, t.estado), ',' ORDER BY t.id) = (SELECT foto FROM t_pt_foto WHERE tag = 'otras'))::text
       FROM public.temporadas t WHERE t.id NOT IN ('e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000c3')$q$, 'true');
SELECT pg_temp.pt_eq('publicar: las membresías no cambian',
  $q$SELECT (md5(string_agg(to_jsonb(gm)::text, ',' ORDER BY gm.id)) = (SELECT foto FROM t_pt_foto WHERE tag = 'miembros'))::text
       FROM public.grupo_miembros gm JOIN public.grupos g ON g.id = gm.grupo_id
      WHERE g.temporada_id IN ('e6300000-0000-4000-8000-0000000000c1', 'e6300000-0000-4000-8000-0000000000c3')$q$,
  'true');
SELECT pg_temp.pt_eq('publicar: no registra paso',
  $q$SELECT (pg_temp.pt_pasos() = (SELECT foto FROM t_pt_foto WHERE tag = 'pasos antes de publicar'))::text$q$, 'true');

-- Después de publicar: no se publica dos veces ni se planifica.
SELECT pg_temp.pt_eq('publicar: no se publica dos veces',
  $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_publicar('d1')$s$)$q$, 'ERR:22023 Solo se puede publicar una temporada en planificación');
SELECT pg_temp.pt_eq('publicar: ya no se marca', $q$SELECT pg_temp.pt_err($s$SELECT pg_temp.pt_marcar('d1', 'S1', false)$s$)$q$,
  'ERR:22023 La temporada no está en planificación');
SELECT pg_temp.pt_eq('publicar: ya no se mueve gente con el planificador',
  $q$SELECT pg_temp.pt_code($s$SELECT public.planner_mover_personas('e6300000-0000-4000-8000-0000000000c3', ARRAY[pg_temp.pt_u('M2')], NULL, NULL)::text$s$)$q$,
  'ERR:22023');
SELECT pg_temp.pt_eq('estado: después de publicar no se puede publicar',
  $q$SELECT concat_ws('|', e->'temporada'->>'estado', e->>'puede_publicar') FROM pg_temp.pt_estado() e$q$, 'activa|false');

-- Por PostgREST: authenticated llama las RPC.
SELECT pg_temp.pt_as('DG');
SET LOCAL ROLE authenticated;
SELECT pg_temp.pt_eq('authenticated: lee el estado y los bloqueos por la RPC',
  $q$SELECT (pg_temp.pt_estado()->'bloqueos'->>'total') || '|' || pg_temp.pt_bloqueos()$q$, '0|-');
SELECT pg_temp.pt_eq('authenticated: no ejecuta el ayudante',
  $q$SELECT pg_temp.pt_code('SELECT count(*)::text FROM public.planner_bloqueos_temporada(''e6300000-0000-4000-8000-0000000000c3'')')$q$,
  'ERR:42501');
RESET ROLE;

SELECT count(*) AS aserciones FROM t_pt_asserts;
SELECT case_name AS fallidos FROM t_pt_failures ORDER BY case_name;

ROLLBACK;
