-- Planificador de GDV: lecturas por rol (T1 de odd/tasks/planner-gdv.md; S5, S10, S11, S19).
--
-- Por qué: el planificador viejo (planner.yosoyglobal.org) leía temporadas, grupos, miembros,
-- usuarios, direcciones y cónyuges con service role y filtraba en el servidor de Next. El
-- planificador nuevo vive en la app y lee con la sesión del usuario: estas funciones son la
-- única puerta de lectura y aplican el alcance por rol en la base.
--
-- Roles que planifican: admin, pastor, director-general y director-etapa (los mismos de
-- planner_guardar_planificacion). Cualquier otro rol: 42501 'No tienes permiso para usar el
-- planificador'; sin sesión: 28000. Los roles salen de obtener_roles_sistema_usuario(auth.uid())
-- y los segmentos del director de etapa de obtener_segmentos_para_director(auth.uid()).
--
-- Alcance (S10, S11):
--   * admin, pastor y director general ven y editan los grupos de todos los segmentos.
--   * Un director de etapa ve y edita solo los grupos de los segmentos donde tiene una fila
--     segmento_lideres con tipo_lider = 'director_etapa'.
--   * El banco de personas no tiene límite de segmento para ningún rol que planifica.
--
-- Cohorte (S19): sale del sufijo del nombre de la temporada, "I" o "II" ("2026 - I",
-- "2026-II"); sin sufijo no hay cohorte. La temporada de origen de una temporada es la
-- anterior de su misma cohorte (la de fecha_inicio más reciente antes de la suya): una "-I"
-- nueva toma la "-I" anterior, nunca la "-II".
--
-- Membresía vigente: grupo_miembros con fecha_salida NULL y estado distinto de 'inactivo' o
-- 'eliminado', en un grupo no eliminado (el mismo criterio que el planificador viejo más
-- fecha_salida). Roles en grupo_miembros: 'Líder' = líder, 'Colíder' = aprendiz, 'Miembro'.
-- Líderes de origen de una persona: los 'Líder' de los grupos de la temporada de origen donde
-- fue aprendiz o miembro; quien fue 'Líder' en el origen no tiene (planificador viejo,
-- lib/planner/lideres-anteriores.ts). Con ellos el cliente marca "Repite líder" (S7).
--
-- Qué crea:
--   1. planner_cohorte(text): 'I', 'II' o NULL. Pura, sin privilegios especiales.
--   2. planner_temporada_origen(uuid), planner_lideres_origen(uuid), planner_alcance_actor():
--      ayudantes internos (no los ejecuta authenticated).
--   3. planner_temporadas() → jsonb: temporadas con cohorte y origen, capacidades del actor
--      (puede_publicar S12 y puede_crear_temporada S20: admin, pastor, director general),
--      segmentos que ve y edita, cada uno con sus directores de etapa elegibles (las filas
--      segmento_lideres con tipo_lider = 'director_etapa' del segmento, una por persona con el id
--      menor, como planner_paso_validar_grupo), aunque todavía no dirijan ningún grupo.
--   4. planner_tablero(p_temporada_id) → una fila por grupo visible de la temporada, con
--      segmento, localidad y su municipio, directores de etapa y personas por rol, cada una con
--      sus líderes de origen.
--   5. planner_banco(p_temporada_id) → una fila por persona (todas): edad, género, estado
--      civil, fecha de registro, cónyuge (determinista como lib/planner/conyuges.ts: primero
--      es_principal, luego el id de relación menor), segmento sugerido, dirección y municipio
--      (S5), grupo en la temporada, grupo y líderes de origen, grupos en otras temporadas
--      activas. Nunca correo, teléfono ni cédula.
--
-- Costo: el banco es una sola consulta por conjuntos (sin subconsultas por fila en bucles)
-- sobre usuarios, grupo_miembros vigentes, grupos, temporadas, relaciones conyugales y
-- direcciones (~1.4k personas). grupo_miembros ya tiene índices parciales por usuario_id y por
-- (grupo_id, rol) con fecha_salida IS NULL (20250923201500); no hace falta ninguno nuevo.
--
-- Blast radius: funciones nuevas de solo lectura. No cambia tablas, políticas ni funciones
-- existentes.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.planner_banco(uuid);
--   DROP FUNCTION IF EXISTS public.planner_tablero(uuid);
--   DROP FUNCTION IF EXISTS public.planner_temporadas();
--   DROP FUNCTION IF EXISTS public.planner_alcance_actor();
--   DROP FUNCTION IF EXISTS public.planner_lideres_origen(uuid);
--   DROP FUNCTION IF EXISTS public.planner_temporada_origen(uuid);
--   DROP FUNCTION IF EXISTS public.planner_cohorte(text);

CREATE OR REPLACE FUNCTION public.planner_cohorte(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT substring(upper(btrim(p_nombre)) FROM '(?:^|[^A-Z])(II|I)$');
$function$;

COMMENT ON FUNCTION public.planner_cohorte(text) IS
  'Cohorte de una temporada según el sufijo de su nombre: ''I'' (empieza en febrero), ''II'' (en octubre) o NULL. S19 de odd/tasks/planner-gdv.md.';

REVOKE ALL ON FUNCTION public.planner_cohorte(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_cohorte(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_temporada_origen(p_temporada_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.id
    FROM public.temporadas t
    JOIN public.temporadas o
      ON o.id <> t.id
     AND o.fecha_inicio < t.fecha_inicio
     AND public.planner_cohorte(o.nombre) = public.planner_cohorte(t.nombre)
   WHERE t.id = p_temporada_id
   ORDER BY o.fecha_inicio DESC, o.id
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.planner_temporada_origen(uuid) IS
  'Interna del planificador: temporada anterior de la misma cohorte (NULL sin cohorte o sin anterior). No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_temporada_origen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_temporada_origen(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.planner_lideres_origen(p_temporada_origen_id uuid)
RETURNS TABLE (usuario_id uuid, lider_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH m AS MATERIALIZED (
    SELECT gm.grupo_id, gm.usuario_id, gm.rol::text AS rol
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id
     WHERE g.temporada_id = p_temporada_origen_id
       AND NOT g.eliminado
       AND gm.fecha_salida IS NULL
       AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado')
  )
  SELECT DISTINCT r.usuario_id, l.usuario_id
    FROM m r
    JOIN m l ON l.grupo_id = r.grupo_id AND l.rol = 'Líder' AND l.usuario_id <> r.usuario_id
   WHERE r.rol <> 'Líder'
     AND NOT EXISTS (SELECT 1 FROM m x WHERE x.usuario_id = r.usuario_id AND x.rol = 'Líder');
$function$;

COMMENT ON FUNCTION public.planner_lideres_origen(uuid) IS
  'Interna del planificador: pares (persona, líder) de la temporada de origen; solo personas que fueron aprendiz o miembro, nunca líder. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_lideres_origen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_lideres_origen(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.planner_alcance_actor()
RETURNS TABLE (usuario_id uuid, roles text[], ve_todo boolean, segmentos uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_id uuid := auth.uid();
  v_usuario_id uuid;
  v_roles text[];
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;
  v_roles := coalesce(public.obtener_roles_sistema_usuario(v_auth_id), ARRAY[]::text[]);
  IF v_usuario_id IS NULL
     OR NOT (v_roles && ARRAY['admin', 'pastor', 'director-general', 'director-etapa']) THEN
    RAISE EXCEPTION 'No tienes permiso para usar el planificador' USING ERRCODE = '42501';
  END IF;

  usuario_id := v_usuario_id;
  roles := v_roles;
  ve_todo := v_roles && ARRAY['admin', 'pastor', 'director-general'];
  IF ve_todo THEN
    SELECT coalesce(array_agg(s.id ORDER BY s.nombre, s.id), ARRAY[]::uuid[]) INTO segmentos
      FROM public.segmentos s;
  ELSE
    SELECT coalesce(array_agg(DISTINCT d.id), ARRAY[]::uuid[]) INTO segmentos
      FROM public.obtener_segmentos_para_director(v_auth_id) d;
  END IF;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.planner_alcance_actor() IS
  'Interna del planificador: actor (usuarios.id de auth.uid()), sus roles, si ve todos los segmentos y los segmentos que ve y edita. '
  '28000 sin sesión; 42501 si no es admin, pastor, director-general ni director-etapa. No la ejecuta authenticated.';

REVOKE ALL ON FUNCTION public.planner_alcance_actor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planner_alcance_actor() TO service_role;

CREATE OR REPLACE FUNCTION public.planner_temporadas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor record;
  v_dirige_temporada boolean;
BEGIN
  SELECT a.usuario_id, a.roles, a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  -- Publicar (S12) y crear temporadas (S20) es de toda la temporada.
  v_dirige_temporada := v_actor.roles && ARRAY['admin', 'pastor', 'director-general'];

  RETURN jsonb_build_object(
    'usuario_id', v_actor.usuario_id,
    've_todos_los_segmentos', v_actor.ve_todo,
    'puede_publicar', v_dirige_temporada,
    'puede_crear_temporada', v_dirige_temporada,
    'segmentos_editables', to_jsonb(v_actor.segmentos),
    'segmentos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre,
                                                   'directores', coalesce(d.lista, '[]'::jsonb))
                                ORDER BY s.nombre, s.id), '[]'::jsonb)
        FROM public.segmentos s
        -- Directores de etapa elegibles del segmento: los mismos que acepta planner_paso_validar_grupo.
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('segmento_lider_id', e.id, 'usuario_id', e.usuario_id,
                                              'nombre', e.nombre, 'apellido', e.apellido)
                           ORDER BY e.apellido, e.nombre, e.usuario_id) AS lista
            FROM (SELECT DISTINCT ON (sl.usuario_id) sl.id, sl.usuario_id, u.nombre, u.apellido
                    FROM public.segmento_lideres sl
                    JOIN public.usuarios u ON u.id = sl.usuario_id
                   WHERE sl.segmento_id = s.id AND sl.tipo_lider = 'director_etapa'
                   ORDER BY sl.usuario_id, sl.id) e
        ) d ON true
       WHERE s.id = ANY (v_actor.segmentos)
    ),
    'temporadas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', t.nombre,
               'fecha_inicio', t.fecha_inicio::date,
               'fecha_fin', t.fecha_fin::date,
               'estado', t.estado::text,
               'activa', t.activa,
               'cohorte', public.planner_cohorte(t.nombre),
               'origen_id', o.id,
               'origen_nombre', o.nombre
             ) ORDER BY t.fecha_inicio DESC, t.id), '[]'::jsonb)
        FROM public.temporadas t
        LEFT JOIN LATERAL (SELECT public.planner_temporada_origen(t.id) AS id) oi ON true
        LEFT JOIN public.temporadas o ON o.id = oi.id
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.planner_temporadas() IS
  'Planificador de GDV: temporadas (cohorte y temporada de origen, S19), capacidades del actor (puede_publicar S12, puede_crear_temporada S20) '
  'y segmentos que ve y edita (S10), cada uno con sus directores de etapa elegibles (segmento_lider_id, usuario_id, nombre, apellido). '
  'Roles admin, pastor, director-general, director-etapa; 42501 otro rol, 28000 sin sesión.';

REVOKE ALL ON FUNCTION public.planner_temporadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_temporadas() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_tablero(p_temporada_id uuid)
RETURNS TABLE (
  grupo_id                   uuid,
  nombre                     text,
  segmento_id                uuid,
  segmento_nombre            text,
  localidad_id               uuid,
  localidad_nombre           text,
  localidad_municipio_id     uuid,
  localidad_municipio_nombre text,
  dia_reunion                text,
  hora_reunion               text,
  capacidad_maxima           integer,
  estado_ciclo               text,
  estado_aprobacion          text,
  activo                     boolean,
  directores                 jsonb,
  lideres                    jsonb,
  aprendices                 jsonb,
  miembros                   jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_actor record;
  v_origen_id uuid;
BEGIN
  SELECT a.ve_todo, a.segmentos INTO v_actor FROM public.planner_alcance_actor() a;
  IF p_temporada_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.temporadas t WHERE t.id = p_temporada_id) THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  v_origen_id := public.planner_temporada_origen(p_temporada_id);

  RETURN QUERY
  WITH visibles AS MATERIALIZED (
    SELECT g.*
      FROM public.grupos g
     WHERE g.temporada_id = p_temporada_id
       AND NOT g.eliminado
       AND (v_actor.ve_todo OR g.segmento_id = ANY (v_actor.segmentos))
  ),
  lideres_origen AS (
    SELECT lo.usuario_id, jsonb_agg(lo.lider_id ORDER BY lo.lider_id) AS ids
      FROM public.planner_lideres_origen(v_origen_id) lo
     GROUP BY lo.usuario_id
  ),
  personas AS (
    SELECT gm.grupo_id, gm.rol::text AS rol,
           jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
                                        'lideres_origen', coalesce(lo.ids, '[]'::jsonb))
                     ORDER BY u.apellido, u.nombre, u.id) AS lista
      FROM public.grupo_miembros gm
      JOIN visibles v ON v.id = gm.grupo_id
      JOIN public.usuarios u ON u.id = gm.usuario_id
      LEFT JOIN lideres_origen lo ON lo.usuario_id = gm.usuario_id
     WHERE gm.fecha_salida IS NULL
       AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado')
     GROUP BY gm.grupo_id, gm.rol
  ),
  dirs AS (
    SELECT deg.grupo_id,
           jsonb_agg(jsonb_build_object('segmento_lider_id', sl.id, 'usuario_id', u.id,
                                        'nombre', u.nombre, 'apellido', u.apellido)
                     ORDER BY u.apellido, u.nombre, sl.id) AS lista
      FROM public.director_etapa_grupos deg
      JOIN visibles v ON v.id = deg.grupo_id
      JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
      JOIN public.usuarios u ON u.id = sl.usuario_id
     GROUP BY deg.grupo_id
  )
  SELECT v.id, v.nombre, v.segmento_id, s.nombre,
         v.localidad_id, cl.nombre, cl.municipio_id, mu.nombre,
         v.dia_reunion::text, v.hora_reunion::text, v.capacidad_maxima::integer,
         v.estado_ciclo::text, v.estado_aprobacion::text, v.activo,
         coalesce(d.lista, '[]'::jsonb),
         coalesce(pl.lista, '[]'::jsonb),
         coalesce(pa.lista, '[]'::jsonb),
         coalesce(pm.lista, '[]'::jsonb)
    FROM visibles v
    JOIN public.segmentos s ON s.id = v.segmento_id
    LEFT JOIN public.campus_localidades cl ON cl.id = v.localidad_id
    LEFT JOIN public.municipios mu ON mu.id = cl.municipio_id
    LEFT JOIN dirs d ON d.grupo_id = v.id
    LEFT JOIN personas pl ON pl.grupo_id = v.id AND pl.rol = 'Líder'
    LEFT JOIN personas pa ON pa.grupo_id = v.id AND pa.rol = 'Colíder'
    LEFT JOIN personas pm ON pm.grupo_id = v.id AND pm.rol = 'Miembro'
   ORDER BY s.nombre, v.nombre, v.id;
END;
$function$;

COMMENT ON FUNCTION public.planner_tablero(uuid) IS
  'Planificador de GDV: grupos no eliminados de la temporada que el actor ve (todos para admin, pastor y director-general; los de sus '
  'segmentos para director-etapa, S10), con segmento, localidad y municipio, directores de etapa y personas por rol (Líder, Colíder = '
  'aprendiz, Miembro) con sus líderes de origen (S7). 22023 si la temporada no existe.';

REVOKE ALL ON FUNCTION public.planner_tablero(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_tablero(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.planner_banco(p_temporada_id uuid)
RETURNS TABLE (
  usuario_id               uuid,
  nombre                   text,
  apellido                 text,
  edad                     integer,
  genero                   text,
  estado_civil             text,
  fecha_registro           timestamptz,
  conyuge_id               uuid,
  segmento_sugerido_id     uuid,
  segmento_sugerido_nombre text,
  tiene_direccion          boolean,
  municipio_id             uuid,
  municipio_nombre         text,
  grupo_actual_id          uuid,
  grupo_actual_nombre      text,
  grupo_actual_rol         text,
  grupo_actual_segmento_id uuid,
  grupos_en_temporada      integer,
  origen_grupo_id          uuid,
  origen_grupo_nombre      text,
  origen_rol               text,
  origen_lideres           jsonb,
  otras_temporadas         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_inicio date;
  v_origen_id uuid;
  v_hoy constant date := (now() AT TIME ZONE 'America/Caracas')::date;
BEGIN
  -- Solo valida el rol: el banco no se limita por segmento (S11).
  PERFORM 1 FROM public.planner_alcance_actor();
  SELECT t.fecha_inicio::date INTO v_inicio FROM public.temporadas t WHERE t.id = p_temporada_id;
  IF NOT FOUND OR p_temporada_id IS NULL THEN
    RAISE EXCEPTION 'La temporada no existe' USING ERRCODE = '22023';
  END IF;
  v_origen_id := public.planner_temporada_origen(p_temporada_id);

  RETURN QUERY
  WITH m AS MATERIALIZED (
    SELECT gm.usuario_id, gm.rol::text AS rol, g.id AS grupo_id, g.nombre AS grupo_nombre, g.segmento_id,
           g.activo, g.temporada_id, t.nombre AS temporada_nombre, t.fecha_inicio::date AS fecha_inicio,
           t.activa AS temporada_activa
      FROM public.grupo_miembros gm
      JOIN public.grupos g ON g.id = gm.grupo_id AND NOT g.eliminado
      JOIN public.temporadas t ON t.id = g.temporada_id
     WHERE gm.fecha_salida IS NULL
       AND coalesce(lower(btrim(gm.estado)), '') NOT IN ('inactivo', 'eliminado')
  ),
  actual AS (
    SELECT DISTINCT ON (m.usuario_id)
           m.usuario_id, m.grupo_id, m.grupo_nombre, m.rol, m.segmento_id,
           count(*) OVER (PARTITION BY m.usuario_id) AS n
      FROM m
     WHERE m.temporada_id = p_temporada_id
     ORDER BY m.usuario_id, m.grupo_nombre, m.grupo_id
  ),
  origen AS (
    SELECT DISTINCT ON (m.usuario_id) m.usuario_id, m.grupo_id, m.grupo_nombre, m.rol, m.segmento_id
      FROM m
     WHERE m.temporada_id = v_origen_id
     ORDER BY m.usuario_id, array_position(ARRAY['Líder', 'Colíder', 'Miembro'], m.rol), m.grupo_nombre, m.grupo_id
  ),
  -- Segmento sugerido sin grupo de origen: el del grupo más reciente de una temporada anterior.
  historial AS (
    SELECT DISTINCT ON (m.usuario_id) m.usuario_id, m.segmento_id
      FROM m
     WHERE m.fecha_inicio < v_inicio
     ORDER BY m.usuario_id, m.fecha_inicio DESC, m.grupo_nombre, m.grupo_id
  ),
  lideres_origen AS (
    SELECT lo.usuario_id,
           jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nombre', u.nombre, 'apellido', u.apellido)
                     ORDER BY u.apellido, u.nombre, u.id) AS lista
      FROM public.planner_lideres_origen(v_origen_id) lo
      JOIN public.usuarios u ON u.id = lo.lider_id
     GROUP BY lo.usuario_id
  ),
  otras AS (
    SELECT m.usuario_id,
           jsonb_agg(jsonb_build_object('temporada_id', m.temporada_id, 'temporada_nombre', m.temporada_nombre,
                                        'grupo_id', m.grupo_id, 'grupo_nombre', m.grupo_nombre)
                     ORDER BY m.temporada_nombre, m.grupo_nombre, m.grupo_id) AS lista
      FROM m
     WHERE m.temporada_activa
       AND m.activo
       AND m.temporada_id <> p_temporada_id
       AND m.temporada_id IS DISTINCT FROM v_origen_id
     GROUP BY m.usuario_id
  ),
  conyuges AS (
    SELECT DISTINCT ON (c.usuario_id) c.usuario_id, c.otro
      FROM (SELECT r.usuario1_id AS usuario_id, r.usuario2_id AS otro, r.es_principal, r.id
              FROM public.relaciones_usuarios r
             WHERE r.tipo_relacion = 'conyuge' AND r.usuario1_id <> r.usuario2_id
            UNION ALL
            SELECT r.usuario2_id, r.usuario1_id, r.es_principal, r.id
              FROM public.relaciones_usuarios r
             WHERE r.tipo_relacion = 'conyuge' AND r.usuario1_id <> r.usuario2_id) c
     ORDER BY c.usuario_id, (c.es_principal IS TRUE) DESC, c.id, c.otro
  )
  SELECT u.id, u.nombre, u.apellido,
         CASE WHEN u.fecha_nacimiento IS NOT NULL
                   AND extract(year FROM age(v_hoy, u.fecha_nacimiento::date)) BETWEEN 0 AND 120
              THEN extract(year FROM age(v_hoy, u.fecha_nacimiento::date))::integer
         END,
         u.genero::text, u.estado_civil::text, u.fecha_registro::timestamptz,
         cy.otro,
         sg.id, sg.nombre,
         d.id IS NOT NULL, mu.id, mu.nombre,
         ac.grupo_id, ac.grupo_nombre, ac.rol, ac.segmento_id, coalesce(ac.n, 0)::integer,
         og.grupo_id, og.grupo_nombre, og.rol,
         coalesce(lo.lista, '[]'::jsonb),
         coalesce(ot.lista, '[]'::jsonb)
    FROM public.usuarios u
    LEFT JOIN actual ac ON ac.usuario_id = u.id
    LEFT JOIN origen og ON og.usuario_id = u.id
    LEFT JOIN historial hi ON hi.usuario_id = u.id
    LEFT JOIN public.segmentos sg ON sg.id = coalesce(og.segmento_id, hi.segmento_id)
    LEFT JOIN lideres_origen lo ON lo.usuario_id = u.id
    LEFT JOIN otras ot ON ot.usuario_id = u.id
    LEFT JOIN conyuges cy ON cy.usuario_id = u.id
    LEFT JOIN public.direcciones d ON d.id = u.direccion_id
    LEFT JOIN public.parroquias pa ON pa.id = d.parroquia_id
    LEFT JOIN public.municipios mu ON mu.id = pa.municipio_id
   ORDER BY u.apellido, u.nombre, u.id;
END;
$function$;

COMMENT ON FUNCTION public.planner_banco(uuid) IS
  'Planificador de GDV: banco de personas, todas y sin límite de segmento para cualquier rol que planifica (S11): edad, género, estado '
  'civil, fecha de registro, cónyuge determinista, segmento sugerido (origen, si no el grupo anterior más reciente; NULL = nuevo), '
  'dirección y municipio (S5), grupo en la temporada, grupo y líderes de origen, grupos en otras temporadas activas. Sin correo, '
  'teléfono ni cédula. 22023 si la temporada no existe.';

REVOKE ALL ON FUNCTION public.planner_banco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planner_banco(uuid) TO authenticated, service_role;
